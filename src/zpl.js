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

/* ---------- Z64：同步 zlib 压缩（固定霍夫曼 + LZ77），无需 CompressionStream ----------
   ZPL 的 :Z64: 数据 = base64(zlib(位图字节)) + ':' + CRC-16(base64 文本)。
   浏览器自带的 CompressionStream 是异步流，逐个小位图调用开销很大；这里用纯 JS 同步实现，任何标准 zlib 解压都能还原。 */
const LEN_BASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const LEN_CODE=new Uint16Array(259),DIST_CODE=new Uint8Array(32769);
(()=>{for(let c=0;c<29;c++){const top=c===28?258:LEN_BASE[c]+(1<<LEN_EXTRA[c])-1;for(let l=LEN_BASE[c];l<=top&&l<=258;l++)LEN_CODE[l]=c;}
  for(let c=0;c<30;c++)for(let d=DIST_BASE[c];d<DIST_BASE[c]+(1<<DIST_EXTRA[c])&&d<=32768;d++)DIST_CODE[d]=c;})();
function zlibDeflate(data){
  const n=data.length,out=new Uint8Array(n+(n>>3)+64);let op=0,bitBuf=0,bitCnt=0;
  const put=(v,len)=>{bitBuf|=v<<bitCnt;bitCnt+=len;while(bitCnt>=8){out[op++]=bitBuf&255;bitBuf>>>=8;bitCnt-=8;}};
  const rev=(code,len)=>{let r=0;for(let i=0;i<len;i++){r=(r<<1)|(code&1);code>>=1;}return r;};
  const lit=(v)=>{if(v<144)put(rev(0x30+v,8),8);else if(v<256)put(rev(0x190+v-144,9),9);else if(v<280)put(rev(v-256,7),7);else put(rev(0xC0+v-280,8),8);};
  out[op++]=0x78;out[op++]=0x01;
  put(1,1);put(1,2);                                   // 最后一块、固定霍夫曼
  const HB=15,head=new Int32Array(1<<HB).fill(-1),prev=new Int32Array(n);
  const hash=(i)=>((data[i]<<10)^(data[i+1]<<5)^data[i+2])&((1<<HB)-1);
  for(let i=0;i<n;){
    let best=0,dist=0;
    if(i+2<n){const h=hash(i);let j=head[h],chain=24;
      while(j>=0&&i-j<=32768&&chain--){
        if(data[j+best]===data[i+best]){let l=0;const max=Math.min(258,n-i);while(l<max&&data[j+l]===data[i+l])l++;if(l>best){best=l;dist=i-j;if(l===max)break;}}
        j=prev[j];}
      prev[i]=head[h];head[h]=i;}
    if(best>=3){const lc=LEN_CODE[best];lit(257+lc);if(LEN_EXTRA[lc])put(best-LEN_BASE[lc],LEN_EXTRA[lc]);
      const dc=DIST_CODE[dist];put(rev(dc,5),5);if(DIST_EXTRA[dc])put(dist-DIST_BASE[dc],DIST_EXTRA[dc]);
      for(let k=1;k<best&&i+k+2<n;k++){const h=hash(i+k);prev[i+k]=head[h];head[h]=i+k;}
      i+=best;}
    else{lit(data[i]);i++;}
  }
  lit(256);if(bitCnt)put(0,8-bitCnt);
  let a=1,b=0;for(let i=0;i<n;i++){a=(a+data[i])%65521;b=(b+a)%65521;}
  out[op++]=b>>>8;out[op++]=b&255;out[op++]=a>>>8;out[op++]=a&255;
  return out.subarray(0,op);
}
const CRC16T=(()=>{const t=new Uint16Array(256);for(let i=0;i<256;i++){let c=i<<8;for(let k=0;k<8;k++)c=(c&0x8000)?((c<<1)^0x1021)&0xffff:(c<<1)&0xffff;t[i]=c;}return t;})();
function crc16(str){let c=0;for(let i=0;i<str.length;i++)c=((c<<8)&0xffff)^CRC16T[((c>>8)^str.charCodeAt(i))&255];return c.toString(16).padStart(4,'0');}
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(u8){const parts=[];let s='';
  for(let i=0;i<u8.length;i+=3){const a=u8[i],b=u8[i+1],c=u8[i+2],t=(a<<16)|((b||0)<<8)|(c||0);
    s+=B64[t>>18]+B64[(t>>12)&63]+(i+1<u8.length?B64[(t>>6)&63]:'=')+(i+2<u8.length?B64[t&63]:'=');
    if(s.length>8192){parts.push(s);s='';}}
  parts.push(s);return parts.join('');}
// 位图字节 → ':Z64:<base64>:<crc>'
function z64(bytes){const b=base64(zlibDeflate(bytes));return ':Z64:'+b+':'+crc16(b);}

/* ---------- 字段数据转义 ---------- */
// 用 ^FH 十六进制转义 ^ ~ _，数据原样到达打印机（不再把 ^ ~ 换成空格）
function fd(text){return '^FH_^FD'+String(text).replace(/[\^~_]/g,c=>'_'+c.charCodeAt(0).toString(16).toUpperCase())+'^FS';}
const ORI={0:'N',1:'R',2:'I',3:'B'};
// 原生指令模式下有对应打印机指令的一维码；其余（GS1-128、UPC-E、Code93、Codabar）始终按精确位图输出
const NATIVE_1D=['barcode','ean13','ean8','upca','code39','itf'];

/* ---------- 打印机参数（为空则不输出，沿用打印机设置） ---------- */
function setupCmds(p){p=p||{};let s='';
  if(p.speed!==''&&p.speed!=null)s+='^PR'+Math.max(1,Math.min(14,Math.round(+p.speed)));
  if(p.media)s+='^MT'+(p.media==='transfer'?'T':'D');
  if(p.track)s+='^MN'+({gap:'Y',mark:'M',continuous:'N'}[p.track]||'Y');
  if(p.mode)s+='^MM'+({tear:'T',peel:'P',cut:'C'}[p.mode]||'T');
  if(p.top!==''&&p.top!=null&&+p.top)s+='^LT'+Math.round(+p.top);
  if(p.left!==''&&p.left!=null&&+p.left)s+='^LS'+Math.round(+p.left);
  return s?s+'\n':'';}

/* ---------- 元素布局（ZPL / TSPL 共用） ----------
   把一张标签的元素转成与指令语言无关的中间项（坐标单位：打印点，已含旋转偏移）：
     {k:'bm', x, y, bm}                        位图（文字、条码、图片……）
     {k:'box'|'ellipse', x, y, w, h, th, fill} 线框 / 椭圆（90° 倍数旋转已换算宽高）
     {k:'native', t, el, res|m, x, y, rot, ...} 原生条码（仅 ZPL 的原生指令模式）
   env：{dpi, opt, R, warn, lang} */
function labelItems(o,e,ctx,env){
  const {dpi,opt,R,warn,lang}=env,items=[];
  const bmAt=(x,y,r)=>{if(r)items.push({k:'bm',x:Math.max(0,x+r.dx),y:Math.max(0,y+r.dy),bm:r.bm});};
  // 位图放到元素位置（rot 为 90 倍数时本地旋转，否则交给 raster.rotate）
  const place=(x,y,bm,rot)=>{
    if(isRightAngle(rot)){const off=rotOffset(bm.w,bm.h,rot);bmAt(x,y,{bm:rotateBitmap(bm,rot),dx:off.dx,dy:off.dy});return;}
    if(R.rotate){bmAt(x,y,R.rotate(bm,rot));return;}
    warn('任意角度旋转需要在界面中导出');bmAt(x,y,{bm,dx:0,dy:0});};
  for(const el of o.elements){
    const x=Job.dots(el.x,dpi),y=Job.dots(el.y,dpi),rot=+el.rot||0;
    let text;try{text=Job.elementText(el,ctx,e);}catch(err){warn(err.message);continue;}
    const t=el.type;
    try{
      if(t==='text'||t==='counter'||t==='date'){
        if(text==='')continue;
        if(R.text)bmAt(x,y,R.text(text,el,dpi,rot));else warn('文字需要在界面中导出');
      }
      else if(t==='para'){
        if(text==='')continue;
        if(R.para)bmAt(x,y,R.para(text,el,dpi,rot));else warn('段落需要在界面中导出');
      }
      else if(B.BARCODE_1D.includes(t)){
        const res=B.encode1D(t,text),md=Job.moduleDots(el.module,dpi),hd=Job.dots(el.h,dpi);
        if(lang==='zpl'&&opt.barcodes==='native'&&isRightAngle(rot)&&NATIVE_1D.includes(t)){
          items.push({k:'native',t,el,res,x,y,rot,md,hd});continue;}
        let bm=barsBitmap(res.bits,md,hd);
        if(el.showText){
          if(R.text){const hri=R.text(res.text,{type:'hri',size:2.7,font:'monospace',bold:false},dpi,0).bm;
            const all=Bitmap(Math.max(bm.w,hri.w),hd+Job.dots(0.3,dpi)+hri.h);blit(all,bm,0,0);
            blit(all,hri,Math.max(0,Math.round((bm.w-hri.w)/2)),hd+Job.dots(0.3,dpi));bm=all;}
          else warn('条码下方文字需要在界面中导出');
        }
        place(x,y,bm,rot);
      }
      else if(B.BARCODE_2D.includes(t)){
        const m=B.encode2D(t,text,el.ecl),md=Job.matrixModuleDots(el.size,m.size,dpi);
        if(lang==='zpl'&&opt.barcodes==='native'&&((t==='datamatrix'&&isRightAngle(rot))||(t==='qrcode'&&!rot))){
          items.push({k:'native',t,el,m,x,y,rot,md,text});continue;}
        place(x,y,matrixBitmap(m.modules,m.size,md),rot);
      }
      else if(t==='image'){
        const src=Job.imageSrc(el,text);if(!src)continue;
        if(R.image){const r=R.image(el,dpi,rot,src);if(r)bmAt(x,y,r);else warn('图片无法读取：'+src.slice(0,80));}
        else warn('图片需要在界面中导出');
      }
      else if(t==='box'||t==='ellipse'){
        let w=Job.dots(el.w,dpi),h=Job.dots(el.h,dpi);const th=Math.max(1,Job.dots(el.border,dpi));
        if(isRightAngle(rot)){const k=((Math.round(rot/90)%4)+4)%4,off=rotOffset(w,h,rot);if(k%2)[w,h]=[h,w];
          items.push({k:t,x:Math.max(0,x+off.dx),y:Math.max(0,y+off.dy),w,h,th,fill:!!el.fill});}
        else if(R.shape)bmAt(x,y,R.shape(el,dpi,rot));else warn('任意角度的图形需要在界面中导出');
      }
    }catch(err){warn(err.message);}
  }
  return items;
}
// 按标签生成指令体并合并相同的连续标签：serialize(items) → 字符串；emit(body, 张数)
function eachLabel(o,lang,serialize,emit){
  const dpi=+o.label.dpi||203,opt=Object.assign({barcodes:'bitmap',compress:true},o.options||{}),R=o.raster||{},warnings=[];
  const env={dpi,opt,R,lang,warn:m=>{if(!warnings.includes(m))warnings.push(m);}};
  let prev=null,count=0,labels=0;
  const flush=()=>{if(prev!=null){emit(prev,count);labels+=count;}};
  for(const e of o.list){
    const body=serialize(labelItems(o,e,Job.labelCtx(o.elements,e,o),env),env);
    if(body===prev)count++;else{flush();prev=body;count=1;}
  }
  flush();
  return {labels,warnings,dpi,opt};
}

/* ---------- ZPL ----------
   o.label {w,h,dpi}；o.elements；o.list（Job.makePrintList 的结果）；o.prompts / o.now；
   o.options {barcodes:'bitmap'|'native', compress:true, printer:{darkness,speed,media,track,mode,top,left}}；
   o.raster（可选，浏览器提供）：
     text(text, el, dpi, rotDeg) → {bm,dx,dy}     文字（含多行），已按 rotDeg 旋转，dx/dy 为外框相对元素原点的偏移
     para(text, el, dpi, rotDeg) → {bm,dx,dy}     段落（按宽度折行）
     image(el, dpi, rotDeg, src) → {bm,dx,dy}|null  图片（阈值 / 抖动），src 为本张标签的图片地址
     rotate(bm, rotDeg) → {bm,dx,dy}              任意角度旋转位图
     shape(el, dpi, rotDeg) → {bm,dx,dy}          任意角度的线框 / 椭圆
   返回 {zpl, labels(张数), warnings:[]} */
function zplItems(items,env){
  const G=bm=>gfa(bm,env.opt.compress);let body='';
  for(const it of items){
    if(it.k==='bm')body+='^FO'+it.x+','+it.y+G(it.bm)+'^FS\n';
    else if(it.k==='box')body+='^FO'+it.x+','+it.y+'^GB'+it.w+','+it.h+','+(it.fill?Math.min(it.w,it.h):Math.min(it.th,it.w,it.h))+',B^FS\n';
    else if(it.k==='ellipse')body+='^FO'+it.x+','+it.y+'^GE'+it.w+','+it.h+','+(it.fill?Math.ceil(Math.min(it.w,it.h)/2):it.th)+',B^FS\n';
    else if(it.k==='native'){
      const {t,el,x,y,rot,md}=it,o4=ORI[((Math.round(rot/90)%4)+4)%4];
      if(it.res){const f=el.showText?'Y':'N',bw=it.res.bits.length*md,bh=it.hd+(el.showText?Job.dots(3,env.dpi):0);
        const off=rotOffset(bw,bh,rot),pos='^FO'+Math.max(0,x+off.dx)+','+Math.max(0,y+off.dy)+'^BY'+Math.min(10,md),d=it.res.text,hd=it.hd;
        if(t==='barcode')body+=pos+'^BC'+o4+','+hd+','+f+',N,N,A'+fd(d)+'\n';
        else if(t==='ean13')body+=pos+'^BE'+o4+','+hd+','+f+',N^FD'+d.slice(0,12)+'^FS\n';
        else if(t==='ean8')body+=pos+'^B8'+o4+','+hd+','+f+',N^FD'+d.slice(0,7)+'^FS\n';
        else if(t==='upca')body+=pos+'^BU'+o4+','+hd+','+f+',N^FD'+d.slice(0,11)+'^FS\n';
        else if(t==='code39')body+=pos+'^B3'+o4+',N,'+hd+','+f+',N'+fd(d)+'\n';
        else if(t==='itf')body+=pos+'^B2'+o4+','+hd+','+f+',N,N^FD'+d+'^FS\n';}
      else if(t==='datamatrix'){const s=it.m.size*md,off=rotOffset(s,s,rot);
        body+='^FO'+Math.max(0,x+off.dx)+','+Math.max(0,y+off.dy)+'^BX'+o4+','+md+',200'+fd(it.text||' ')+'\n';}
      else body+='^FO'+x+','+y+'^BQN,2,'+Math.min(10,md)+'^FH_^FD'+(el.ecl||'M')+'A,'+fd(it.text||' ').slice(7)+'\n';
    }
  }
  return body;
}
function build(o){
  const pr=(o.options&&o.options.printer)||{},dpi=+o.label.dpi||203;
  let out='';
  if(pr.darkness!==''&&pr.darkness!=null)out+='~SD'+String(Math.max(0,Math.min(30,Math.round(+pr.darkness)))).padStart(2,'0')+'\n';
  const head='^XA\n^CI28\n^PW'+Job.dots(o.label.w,dpi)+'\n^LL'+Job.dots(o.label.h,dpi)+'\n^LH0,0\n'+setupCmds(pr);
  // 连续相同的标签合并为一个 ^PQ n（无逐张变化时份数不再重复发送整张数据）
  const r=eachLabel(o,'zpl',zplItems,(body,n)=>{out+=head+body+'^PQ'+n+'\n^XZ\n';});
  return {zpl:out,labels:r.labels,warnings:r.warnings};
}

/* ---------- TSPL（TSC / 佳博 / 芯烨 等国产标签机） ----------
   全部内容按位图（BITMAP）输出，与预览逐点一致、无需打印机中文字库；线框用 BOX / BAR，椭圆画成位图。
   o.options.printer 额外支持：gap（间隙/黑标高度 mm，默认 2）、invert（位图反色，TSPL 默认 1=白点，默认 true）。
   返回 {data: Uint8Array, labels, warnings} */
// 椭圆位图（纯 JS，无需 canvas）
function ellipseBitmap(w,h,th,fill){const bm=Bitmap(w,h),a=w/2,b=h/2,ai=Math.max(0,a-th),bi=Math.max(0,b-th);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const dx=x+0.5-a,dy=y+0.5-b;
    if(dx*dx/(a*a)+dy*dy/(b*b)<=1&&(fill||ai<=0||bi<=0||dx*dx/(ai*ai)+dy*dy/(bi*bi)>1))setPx(bm,x,y);}
  return bm;}
// 把位图拆成实心矩形（相同的连续行合成一块，每块里每段黑点一个 BAR）；一维码、线条这类位图用 BAR 比 BITMAP 小得多。
// 返回矩形数组 [[x,y,w,h]…]，超过 limit 个就放弃（返回 null，改用 BITMAP）
function bitmapRects(bm,limit){const rects=[];let y=0;
  const rowKey=(r)=>{let k='';for(let b=0;b<bm.bpr;b++)k+=String.fromCharCode(bm.data[r*bm.bpr+b]);return k;};
  while(y<bm.h){const k=rowKey(y);let y2=y+1;while(y2<bm.h&&rowKey(y2)===k)y2++;
    for(let x=0;x<bm.w;){if(!getPx(bm,x,y)){x++;continue;}let x2=x;while(x2<bm.w&&getPx(bm,x2,y))x2++;
      rects.push([x,y,x2-x,y2-y]);if(rects.length>limit)return null;x=x2;}
    y=y2;}
  return rects;}
function tsplBitmapBytes(bm,invert){let s='';for(let i=0;i<bm.data.length;i++)s+=String.fromCharCode(invert?(~bm.data[i])&0xFF:bm.data[i]);return s;}
function buildTSPL(o){
  const pr=(o.options&&o.options.printer)||{},dpi=+o.label.dpi||203,invert=pr.invert!==false;
  const W=+o.label.w,H=+o.label.h,gap=pr.gap===''||pr.gap==null?2:Math.max(0,+pr.gap);
  let head='SIZE '+W+' mm,'+H+' mm\r\n';
  head+=pr.track==='mark'?'BLINE '+gap+' mm,0 mm\r\n':pr.track==='continuous'?'GAP 0 mm,0 mm\r\n':'GAP '+gap+' mm,0 mm\r\n';
  head+='DIRECTION 0\r\nREFERENCE '+(+pr.left?Math.round(+pr.left):0)+',0\r\n';
  if(+pr.top)head+='SHIFT '+Math.round(+pr.top)+'\r\n';
  if(pr.speed!==''&&pr.speed!=null)head+='SPEED '+Math.max(1,Math.min(14,Math.round(+pr.speed)))+'\r\n';
  if(pr.darkness!==''&&pr.darkness!=null)head+='DENSITY '+Math.max(0,Math.min(15,Math.round(+pr.darkness/2)))+'\r\n';
  if(pr.mode==='peel')head+='SET PEEL ON\r\n';else if(pr.mode==='cut')head+='SET CUTTER 1\r\n';else if(pr.mode==='tear')head+='SET TEAR ON\r\n';
  head+='CLS\r\n';
  const ser=(items)=>{let body='';
    for(const it of items){
      if(it.k==='bm'){
        // BITMAP 无压缩：能用更少字节的 BAR 矩形精确画出时（一维码、横竖线）改用 BAR
        const bytes=it.bm.bpr*it.bm.h,rects=bitmapRects(it.bm,Math.floor(bytes/14));
        if(rects)for(const [rx,ry,rw,rh] of rects)body+='BAR '+(it.x+rx)+','+(it.y+ry)+','+rw+','+rh+'\r\n';
        else body+='BITMAP '+it.x+','+it.y+','+it.bm.bpr+','+it.bm.h+',0,'+tsplBitmapBytes(it.bm,invert)+'\r\n';}
      else if(it.k==='box')body+=it.fill?'BAR '+it.x+','+it.y+','+it.w+','+it.h+'\r\n':'BOX '+it.x+','+it.y+','+(it.x+it.w)+','+(it.y+it.h)+','+Math.min(it.th,it.w,it.h)+'\r\n';
      else if(it.k==='ellipse'){const bm=ellipseBitmap(it.w,it.h,it.th,it.fill);
        body+='BITMAP '+it.x+','+it.y+','+bm.bpr+','+bm.h+',0,'+tsplBitmapBytes(bm,invert)+'\r\n';}
    }
    return body;};
  let out='';
  const r=eachLabel(Object.assign({},o,{options:Object.assign({},o.options,{barcodes:'bitmap'})}),'tspl',ser,(body,n)=>{out+=head+body+'PRINT 1,'+n+'\r\n';});
  const data=new Uint8Array(out.length);for(let i=0;i<out.length;i++)data[i]=out.charCodeAt(i)&0xFF;
  return {data,labels:r.labels,warnings:r.warnings};
}
// 解析 TSPL（测试用）：返回每张 {bitmaps:[{x,y,bpr,h,bytes}], boxes, bars, copies}
function parseTSPL(u8){
  const labels=[];let cur=null,i=0;const n=u8.length;
  const line=()=>{let s='';while(i<n&&u8[i]!==10)s+=String.fromCharCode(u8[i++]);i++;return s.replace(/\r$/,'');};
  while(i<n){
    // BITMAP 行的数据是二进制，需按头里的字节数读取
    let j=i,hdr='';while(j<n&&u8[j]!==10&&hdr.length<64&&!(hdr.startsWith('BITMAP ')&&hdr.split(',').length===6))hdr+=String.fromCharCode(u8[j++]);
    if(hdr.startsWith('BITMAP ')&&hdr.split(',').length===6){
      const [x,y,bpr,h]=hdr.slice(7).split(',').map(Number);const start=j,len=bpr*h;
      cur.bitmaps.push({x,y,bpr,h,bytes:u8.slice(start,start+len)});i=start+len;while(i<n&&u8[i]!==10)i++;i++;continue;}
    const s=line();
    if(s==='CLS'){cur={bitmaps:[],boxes:[],bars:[],copies:1,head:labels.length?null:[]};labels.push(cur);}
    else if(s.startsWith('PRINT '))cur.copies=+s.split(',')[1];
    else if(s.startsWith('BOX '))cur.boxes.push(s.slice(4).split(',').map(Number));
    else if(s.startsWith('BAR '))cur.bars.push(s.slice(4).split(',').map(Number));
  }
  return labels;
}

const api={build,buildTSPL,z64,zlibDeflate,crc16,parseTSPL,ellipseBitmap,bitmapRects,Bitmap,setPx,getPx,fillRect,blit,barsBitmap,matrixBitmap,rotateBitmap,rotOffset,gfa,gfaDecode,compressRow,fd};
if(isNode)module.exports=api;else root.ZPL=api;
})(typeof window!=='undefined'?window:globalThis);
