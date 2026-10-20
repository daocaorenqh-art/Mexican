/* ZPL（Zebra）指令生成。
   浏览器：<script src="src/zpl.js">（需先加载 barcodes.js、textdata.js、job.js）；Node（测试）：require('./src/zpl.js')。

   条码有两种输出方式：
   - 'bitmap'（默认）：用本项目已校验的编码器按打印点画成位图（^GFA），与预览逐点一致，支持任意旋转；
   - 'native'：打印机原生条码指令（^BC/^BE/^B8/^BU/^B3/^B2/^BQ/^BX），数据量小，人眼可读文字用打印机字体。
   文字 / 段落 / 图片 / 任意角度旋转由调用方提供栅格化回调（浏览器里用 canvas），见 build() 的 raster 参数。
   位图默认用 ZPL 的 ASCII 压缩（: 重复上一行，, 补零，G–Y/g–z 重复计数）。 */
(function(root){
const isNode=typeof module!=='undefined'&&module.exports;
const B=isNode?require('./barcodes.js'):root;
const Job=isNode?require('./job.js'):root.Job;

/* ---------- 1-bit 位图 ---------- */
function Bitmap(w,h){w=Math.max(1,w|0);h=Math.max(1,h|0);const bpr=Math.ceil(w/8);
  return {w,h,bpr,data:new Uint8Array(bpr*h)};}
function setPx(bm,x,y){if(x>=0&&y>=0&&x<bm.w&&y<bm.h)bm.data[y*bm.bpr+(x>>3)]|=0x80>>(x&7);}
function getPx(bm,x,y){return (bm.data[y*bm.bpr+(x>>3)]>>(7-(x&7)))&1;}
function fillRect(bm,x,y,w,h){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)setPx(bm,xx,yy);}
function blit(dst,src,ox,oy){for(let y=0;y<src.h;y++)for(let x=0;x<src.w;x++)if(getPx(src,x,y))setPx(dst,ox+x,oy+y);}
// 一维码：模块串 → 条（每模块 md 点宽，高 hd 点）
function barsBitmap(bits,md,hd){const bm=Bitmap(bits.length*md,hd);
  for(let i=0;i<bits.length;){if(bits[i]!=='1'){i++;continue;}let j=i;while(j<bits.length&&bits[j]==='1')j++;
    fillRect(bm,i*md,0,(j-i)*md,hd);i=j;}return bm;}
// 二维码矩阵 → 位图（每模块 md 点）
function matrixBitmap(mods,n,md){const bm=Bitmap(n*md,n*md);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(mods[y][x])fillRect(bm,x*md,y*md,md,md);return bm;}
// 顺时针旋转 90° 的整数倍
function rotateBitmap(bm,deg){const k=((Math.round(deg/90)%4)+4)%4;if(!k)return bm;
  const r=k===2?Bitmap(bm.w,bm.h):Bitmap(bm.h,bm.w);
  for(let y=0;y<bm.h;y++)for(let x=0;x<bm.w;x++)if(getPx(bm,x,y)){
    if(k===1)setPx(r,bm.h-1-y,x);else if(k===2)setPx(r,bm.w-1-x,bm.h-1-y);else setPx(r,y,bm.w-1-x);}
  return r;}
// 绕元素左上角顺时针旋转后，外框左上角相对元素原点的偏移（与预览 transform-origin:top left 一致）
function rotOffset(w,h,deg){const k=((Math.round(deg/90)%4)+4)%4;
  return k===1?{dx:-h,dy:0}:k===2?{dx:-w,dy:-h}:k===3?{dx:0,dy:-w}:{dx:0,dy:0};}
const isRightAngle=deg=>Math.abs(((+deg||0)%90+90)%90)<1e-9;

/* ---------- ^GFA 编码 ---------- */
const HEX='0123456789ABCDEF';
function repeatCode(n){let s='';while(n>=20){const k=Math.min(400,Math.floor(n/20)*20);s+=String.fromCharCode(102+k/20);n-=k;} // g=20 … z=400
  if(n>0)s+=String.fromCharCode(70+n);return s;} // G=1 … Y=19
function rowHex(bm,y){let s='';for(let b=0;b<bm.bpr;b++){const v=bm.data[y*bm.bpr+b];s+=HEX[v>>4]+HEX[v&15];}return s;}
function compressRow(hex){
  const t=hex.replace(/0+$/,'');if(!t)return ',';
  let out='';for(let i=0;i<t.length;){let j=i;while(j<t.length&&t[j]===t[i])j++;const n=j-i;out+=(n>1?repeatCode(n):'')+t[i];i=j;}
  return t.length<hex.length?out+',':out;}
function gfa(bm,compress){const total=bm.bpr*bm.h;let body='',prev=null;
  for(let y=0;y<bm.h;y++){const h=rowHex(bm,y);
    if(!compress)body+=h;else if(h===prev)body+=':';else body+=compressRow(h);prev=h;}
  return '^GFA,'+total+','+total+','+bm.bpr+','+body;}
// 解压（测试用，验证压缩可逆）
function gfaDecode(body,bpr,rows){const out=[];let prev='';let i=0;
  for(let r=0;r<rows;r++){let line='';
    if(body[i]===':'){line=prev;i++;}
    else{while(line.length<bpr*2&&i<body.length){const c=body[i];
        if(c===','){line=line.padEnd(bpr*2,'0');i++;break;}
        if(c===':')break;
        let n=0;while(/[G-Yg-z]/.test(body[i])){const d=body[i];n+=d>='g'?(d.charCodeAt(0)-102)*20:d.charCodeAt(0)-70;i++;}
        line+=body[i].repeat(Math.max(1,n));i++;}}
    out.push(line);prev=line;}
  return out;}

/* ---------- 字段数据转义 ---------- */
// 用 ^FH 十六进制转义 ^ ~ _，数据原样到达打印机（不再把 ^ ~ 换成空格）
function fd(text){return '^FH_^FD'+String(text).replace(/[\^~_]/g,c=>'_'+c.charCodeAt(0).toString(16).toUpperCase())+'^FS';}
const ORI={0:'N',1:'R',2:'I',3:'B'};

/* ---------- 打印机参数（为空则不输出，沿用打印机设置） ---------- */
function setupCmds(p){p=p||{};let s='';
  if(p.speed!==''&&p.speed!=null)s+='^PR'+Math.max(1,Math.min(14,Math.round(+p.speed)));
  if(p.media)s+='^MT'+(p.media==='transfer'?'T':'D');
  if(p.track)s+='^MN'+({gap:'Y',mark:'M',continuous:'N'}[p.track]||'Y');
  if(p.mode)s+='^MM'+({tear:'T',peel:'P',cut:'C'}[p.mode]||'T');
  if(p.top!==''&&p.top!=null&&+p.top)s+='^LT'+Math.round(+p.top);
  if(p.left!==''&&p.left!=null&&+p.left)s+='^LS'+Math.round(+p.left);
  return s?s+'\n':'';}

/* ---------- 生成 ----------
   o.label {w,h,dpi}；o.elements；o.list（Job.makePrintList 的结果）；o.prompts / o.now；
   o.options {barcodes:'bitmap'|'native', compress:true, printer:{darkness,speed,media,track,mode,top,left}}；
   o.raster（可选，浏览器提供）：
     text(text, el, dpi, rotDeg) → {bm,dx,dy}     文字（含多行），已按 rotDeg 旋转，dx/dy 为外框相对元素原点的偏移
     para(text, el, dpi, rotDeg) → {bm,dx,dy}     段落（按宽度折行）
     image(el, dpi, rotDeg, src) → {bm,dx,dy}|null  图片（阈值 / 抖动），src 为本张标签的图片地址
     rotate(bm, rotDeg) → {bm,dx,dy}              任意角度旋转位图
     shape(el, dpi, rotDeg) → {bm,dx,dy}          任意角度的线框 / 椭圆
   返回 {zpl, labels(张数), warnings:[]} */
function build(o){
  const dpi=+o.label.dpi||203,opt=Object.assign({barcodes:'bitmap',compress:true},o.options||{}),R=o.raster||{};
  const Wd=Job.dots(o.label.w,dpi),Hd=Job.dots(o.label.h,dpi),warnings=[];
  const warn=m=>{if(!warnings.includes(m))warnings.push(m);};
  const G=bm=>gfa(bm,opt.compress);
  const pr=opt.printer||{};
  let out='';
  if(pr.darkness!==''&&pr.darkness!=null)out+='~SD'+String(Math.max(0,Math.min(30,Math.round(+pr.darkness)))).padStart(2,'0')+'\n';
  const head='^XA\n^CI28\n^PW'+Wd+'\n^LL'+Hd+'\n^LH0,0\n'+setupCmds(pr);
  let prevBody=null,count=0,labels=0;
  const flush=()=>{if(prevBody!=null){out+=head+prevBody+'^PQ'+count+'\n^XZ\n';labels+=count;}};
  // 位图放到元素位置（rot 为 90 倍数时本地旋转，否则交给 raster.rotate）
  const place=(x,y,bm,rot)=>{
    if(isRightAngle(rot)){const off=rotOffset(bm.w,bm.h,rot);const r=rotateBitmap(bm,rot);
      return '^FO'+Math.max(0,x+off.dx)+','+Math.max(0,y+off.dy)+G(r)+'^FS\n';}
    if(R.rotate){const r=R.rotate(bm,rot);return '^FO'+Math.max(0,x+r.dx)+','+Math.max(0,y+r.dy)+G(r.bm)+'^FS\n';}
    warn('任意角度旋转需要在界面中导出');return '^FO'+x+','+y+G(bm)+'^FS\n';};
  const placeR=(x,y,r)=>r?'^FO'+Math.max(0,x+r.dx)+','+Math.max(0,y+r.dy)+G(r.bm)+'^FS\n':'';
  for(const e of o.list){
    const ctx=Job.labelCtx(o.elements,e,o);let body='';
    for(const el of o.elements){
      const x=Job.dots(el.x,dpi),y=Job.dots(el.y,dpi),rot=+el.rot||0;
      let text;try{text=Job.elementText(el,ctx,e);}catch(err){warn(err.message);continue;}
      const t=el.type;
      try{
        if(t==='text'||t==='counter'||t==='date'){
          if(text==='')continue;
          if(R.text)body+=placeR(x,y,R.text(text,el,dpi,rot));else warn('文字需要在界面中导出');
        }
        else if(t==='para'){
          if(text==='')continue;
          if(R.para)body+=placeR(x,y,R.para(text,el,dpi,rot));else warn('段落需要在界面中导出');
        }
        else if(B.BARCODE_1D.includes(t)){
          const res=B.encode1D(t,text),md=Job.moduleDots(el.module,dpi),hd=Job.dots(el.h,dpi);
          if(opt.barcodes==='native'&&isRightAngle(rot)){
            const o4=ORI[((Math.round(rot/90)%4)+4)%4],f=el.showText?'Y':'N',bw=res.bits.length*md,bh=hd+(el.showText?Job.dots(3,dpi):0);
            const off=rotOffset(bw,bh,rot),pos='^FO'+Math.max(0,x+off.dx)+','+Math.max(0,y+off.dy)+'^BY'+Math.min(10,md);
            const d=res.text;
            if(t==='barcode')body+=pos+'^BC'+o4+','+hd+','+f+',N,N,A'+fd(d)+'\n';
            else if(t==='ean13')body+=pos+'^BE'+o4+','+hd+','+f+',N^FD'+d.slice(0,12)+'^FS\n';
            else if(t==='ean8')body+=pos+'^B8'+o4+','+hd+','+f+',N^FD'+d.slice(0,7)+'^FS\n';
            else if(t==='upca')body+=pos+'^BU'+o4+','+hd+','+f+',N^FD'+d.slice(0,11)+'^FS\n';
            else if(t==='code39')body+=pos+'^B3'+o4+',N,'+hd+','+f+',N'+fd(d)+'\n';
            else if(t==='itf')body+=pos+'^B2'+o4+','+hd+','+f+',N,N^FD'+d+'^FS\n';
          } else {
            let bm=barsBitmap(res.bits,md,hd);
            if(el.showText){
              if(R.text){const hri=R.text(res.text,{type:'hri',size:2.7,font:'monospace',bold:false},dpi,0).bm;
                const all=Bitmap(Math.max(bm.w,hri.w),hd+Job.dots(0.3,dpi)+hri.h);blit(all,bm,0,0);
                blit(all,hri,Math.max(0,Math.round((bm.w-hri.w)/2)),hd+Job.dots(0.3,dpi));bm=all;}
              else warn('条码下方文字需要在界面中导出');
            }
            body+=place(x,y,bm,rot);
          }
        }
        else if(t==='qrcode'||t==='datamatrix'){
          const m=t==='qrcode'?B.Codes2D.encodeQR(text||' ',el.ecl||'M'):B.Codes2D.encodeDM(text||' ');
          const md=Job.matrixModuleDots(el.size,m.size,dpi);
          if(opt.barcodes==='native'&&t==='datamatrix'&&isRightAngle(rot)){const s=m.size*md,off=rotOffset(s,s,rot);
            body+='^FO'+Math.max(0,x+off.dx)+','+Math.max(0,y+off.dy)+'^BX'+ORI[((Math.round(rot/90)%4)+4)%4]+','+md+',200'+fd(text||' ')+'\n';}
          else if(opt.barcodes==='native'&&t==='qrcode'&&!rot)
            body+='^FO'+x+','+y+'^BQN,2,'+Math.min(10,md)+'^FH_^FD'+(el.ecl||'M')+'A,'+fd(text||' ').slice(7)+'\n';
          else body+=place(x,y,matrixBitmap(m.modules,m.size,md),rot);
        }
        else if(t==='image'){
          const src=Job.imageSrc(el,text);if(!src)continue;
          if(R.image){const r=R.image(el,dpi,rot,src);if(r)body+=placeR(x,y,r);else warn('图片无法读取：'+src.slice(0,80));}
          else warn('图片需要在界面中导出');
        }
        else if(t==='box'||t==='ellipse'){
          let w=Job.dots(el.w,dpi),h=Job.dots(el.h,dpi);const th=Math.max(1,Job.dots(el.border,dpi));
          if(isRightAngle(rot)){const k=((Math.round(rot/90)%4)+4)%4,off=rotOffset(w,h,rot);if(k%2)[w,h]=[h,w];
            const fx=Math.max(0,x+off.dx),fy=Math.max(0,y+off.dy);
            if(t==='box')body+='^FO'+fx+','+fy+'^GB'+w+','+h+','+(el.fill?Math.min(w,h):Math.min(th,Math.min(w,h)))+',B^FS\n';
            else body+='^FO'+fx+','+fy+'^GE'+w+','+h+','+(el.fill?Math.ceil(Math.min(w,h)/2):th)+',B^FS\n';}
          else if(R.shape)body+=placeR(x,y,R.shape(el,dpi,rot));else warn('任意角度的图形需要在界面中导出');
        }
      }catch(err){warn(err.message);}
    }
    // 连续相同的标签合并为一个 ^PQ n（无逐张变化时份数不再重复发送整张数据）
    if(body===prevBody)count++;else{flush();prevBody=body;count=1;}
  }
  flush();
  return {zpl:out,labels,warnings};
}

const api={build,Bitmap,setPx,getPx,fillRect,blit,barsBitmap,matrixBitmap,rotateBitmap,rotOffset,gfa,gfaDecode,compressRow,fd};
if(isNode)module.exports=api;else root.ZPL=api;
})(typeof window!=='undefined'?window:globalThis);
