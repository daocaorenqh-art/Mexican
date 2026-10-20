/* 打印作业：出哪些标签（范围 / 份数）、每张标签的变量（流水号 / 日期）、打印前预检。
   浏览器：<script src="src/job.js">（需先加载 barcodes.js、textdata.js）；Node（测试）：require('./src/job.js')。 */
(function(root){
const isNode=typeof module!=='undefined'&&module.exports;
const B=isNode?require('./barcodes.js'):root;
const T=isNode?require('./textdata.js'):root;

/* ---------- 出标签序列 ----------
   每项：{row, rec(第几条记录，无数据为 0), recPos(在本次范围内的第几条，0 起), copy(第几份，1 起), idx(本次第几张，0 起)}
   范围填反等错误时返回空数组，并在 .error 上给出原因（不再悄悄改打第 1 条）。
   opt.selected：只打这些记录（0 起的下标 Set）；opt.qtyField：每条记录的份数取该字段（× 每条份数，非数字 / 0 不打） */
function makePrintList(rows,from,to,copies,skip,opt){
  opt=opt||{};
  const has=!!(rows&&rows.length),base=has?rows:[null],n=base.length;
  const f=Math.max(1,Math.floor(+from||1)),tRaw=Math.floor(+to||0),t=tRaw>0?Math.min(n,tRaw):n;
  const cp=Math.max(1,Math.floor(+copies||1)),out=[];
  if(f>n){out.error='起始记录 '+f+' 超出数据条数 '+n;return out;}
  if(f>t){out.error='打印范围有误：从第 '+f+' 条到第 '+t+' 条';return out;}
  let idx=0,pos=0;
  for(let i=f-1;i<t;i++){
    if(has&&opt.selected&&!opt.selected.has(i))continue;
    let n=cp;
    if(has&&opt.qtyField){const q=Math.floor(Number(String(base[i][opt.qtyField]??'').trim()));n=q>0&&isFinite(q)?q*cp:0;}
    for(let c=0;c<n;c++){
      const e={row:base[i],rec:has?i+1:0,recPos:pos,copy:c+1,idx:idx++};
      if(!skip||!skip.has(e.idx))out.push(e);
    }
    if(n)pos++;
  }
  if(!out.length&&!out.error)out.error=has&&opt.selected&&!opt.selected.size?'没有选中任何记录':has&&opt.qtyField?'所选记录的数量字段「'+opt.qtyField+'」都不是正数':'没有要出的标签';
  return out;
}

/* ---------- 流水号 ----------
   per：'label' 每张递增（默认）/ 'record' 同一条记录的多份共用一个号；every：每 N 张（或 N 条）才递增一次；
   radix：10 / 16 / 36 进制 */
function counterStep(el,e){const per=el.per==='record'?e.recPos:e.idx;
  return Math.floor(per/Math.max(1,Math.floor(+el.every||1)));}
function counterText(el,e){
  const v=(+el.start||0)+counterStep(el,e)*(+el.step||1);
  const radix=[10,16,36].includes(+el.radix)?+el.radix:10;
  const body=(v<0?'-':'')+String(Math.abs(v).toString(radix).toUpperCase()).padStart(+el.pad||0,'0');
  return (el.prefix||'')+body+(el.suffix||'');
}
// 打印成功后起始值应前进多少（接着上次最后一张的下一个号）
function counterAdvance(el,list){if(!list.length)return 0;
  return (counterStep(el,list[list.length-1])+1)*(+el.step||1);}
const counterName=el=>String(el.name||'SN').trim()||'SN';

/* 每张标签的求值环境：数据行 + 变量（流水号按名称）+ 打印时输入 */
function labelCtx(elements,e,extra){
  e=e||{row:null,rec:0,recPos:0,copy:1,idx:0};extra=extra||{};
  const vars=Object.assign({},extra.vars||{});
  for(const el of elements)if(el.type==='counter'){const k=counterName(el);if(!(k in vars))vars[k]=counterText(el,e);}
  return T.makeCtx({row:e.row,vars,prompts:extra.prompts||{},defs:extra.defs||null,now:extra.now||new Date(),n:e.idx+1,rec:e.rec,copy:e.copy});
}
// 元素在这张标签上的文字内容
function elementText(el,ctx,e){
  if(el.type==='counter')return counterText(el,e||{idx:ctx.n-1,recPos:Math.max(0,ctx.rec-1)});
  if(el.type==='date')return T.fmtDate(T.addDate(ctx.now,el.offset||0,el.unit||'d'),el.format||'YYYY-MM-DD');
  return T.evalContent(el.content,ctx);
}
// 图片元素的实际来源：「动态图片」内容（字段 / 路径 / data: 地址）优先，空则用上传的图片
function imageSrc(el,text){const t=String(text==null?'':text).trim();
  if(!t)return el.src||'';
  if(/^data:image\//i.test(t)||/^(file|blob):/i.test(t))return t;
  if(/^[A-Za-z]:[\\/]/.test(t))return 'file:///'+t.replace(/\\/g,'/');          // C:\img\a.png
  if(/^\\\\/.test(t))return 'file:'+t.replace(/\\/g,'/');                      // \\server\share\a.png
  return t;}
// 设计里用到的所有「打印时输入」项
function promptsUsed(elements){const s=new Set();
  for(const el of elements)if(el.content!=null)T.promptNames(el.content).forEach(k=>s.add(k));return [...s];}

/* ---------- 尺寸（mm），与预览 / ZPL 的打印点对齐规则一致 ---------- */
const dots=(mm,dpi)=>Math.round((+mm||0)*dpi/25.4);
const moduleDots=(mm,dpi)=>Math.max(1,dots(mm,dpi));
const matrixModuleDots=(sizeMM,n,dpi)=>Math.max(1,Math.floor(dots(sizeMM,dpi)/n));
const HRI_MM=3; // 一维码下方人眼可读文字约占高度
function estTextW(text,sizeMM){let w=0;for(const ch of String(text))w+=/[⺀-￿]/.test(ch)?sizeMM:sizeMM*0.6;return w;}
// 文字「适应宽度」：设了最大宽度（fitW）且内容超宽时按比例缩小字号（不小于 minSize，默认 1mm）
function effectiveSize(el,text,measure){const size=+el.size||0,fw=+el.fitW||0;
  if(!fw||!size||!text)return size;
  const w=Math.max(...String(text).split('\n').map(l=>measure?measure(l,el):estTextW(l,size)));
  return w>fw?Math.max(+el.minSize||1,size*fw/w):size;}
// 元素未旋转时的宽高（mm）；enc 为缓存的编码结果
function elementSize(el,text,dpi,enc,measure){
  const t=el.type;
  if(B.BARCODE_1D.includes(t)){const r=enc();const mm=moduleDots(el.module,dpi)*25.4/dpi;
    return {w:r.bits.length*mm,h:(+el.h||0)+(el.showText?HRI_MM:0)};}
  if(B.BARCODE_2D.includes(t)){const m=enc();const s=m.size*matrixModuleDots(el.size,m.size,dpi)*25.4/dpi;return {w:s,h:s};}
  if(t==='text'||t==='counter'||t==='date'){const lines=String(text).split('\n'),sz=effectiveSize(el,text,measure),e2=Object.assign({},el,{size:sz});
    const w=Math.max(...lines.map(l=>measure?measure(l,e2):estTextW(l,sz)));return {w,h:lines.length*sz};}
  if(t==='para')return {w:+el.w||0,h:+el.size||0};
  return {w:+el.w||0,h:+el.h||0};
}
// 绕左上角旋转（与预览 transform-origin:top left 一致）后的外框
function rotatedBox(x,y,w,h,rot){const a=(+rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  const xs=[0,w*c,-h*s,w*c-h*s].map(v=>x+v),ys=[0,w*s,h*c,w*s+h*c].map(v=>y+v);
  return {x0:Math.min(...xs),y0:Math.min(...ys),x1:Math.max(...xs),y1:Math.max(...ys)};}

/* ---------- 打印前预检 ----------
   返回 {errors, warnings}，每项 {n(第几张), rec, ei, el, msg}。错误：内容无法编码、表达式出错、字段不存在；
   警告：超出标签、静区不足、模块小于 1 个打印点、EAN 尺寸偏离 GS1 推荐 */
function preflight(o){
  const {elements,list,label}=o,dpi=+label.dpi||203,W=+label.w||0,H=+label.h||0;
  const errors=[],warnings=[],cache=new Map(),hasRows=list.some(e=>e.row);
  const encode=(el,text)=>{const k=el.type+'\u0001'+(el.ecl||'')+'\u0001'+text;
    if(!cache.has(k)){let v;try{v={ok:B.BARCODE_2D.includes(el.type)?B.encode2D(el.type,text,el.ecl):B.encode1D(el.type,text)};}
      catch(err){v={err:err.message};}
      cache.set(k,v);}
    const v=cache.get(k);if(v.err)throw new Error(v.err);return v.ok;};
  const isCode=t=>B.BARCODE_1D.includes(t)||B.BARCODE_2D.includes(t);
  for(const e of list){
    const ctx=labelCtx(elements,e,o),boxes=[];
    elements.forEach((el,ei)=>{
      const add=(arr,msg)=>arr.push({n:e.idx+1,rec:e.rec,ei,el,msg});
      ctx.missing=new Set();ctx.errors=[];ctx.strict=true;
      let text;try{text=elementText(el,ctx,e);}catch(err){add(errors,err.message);return;}
      ctx.errors.forEach(m=>add(errors,'表达式错误：'+m));
      if(ctx.missing.size&&(hasRows||[...ctx.missing].some(k=>/^[#?]/.test(k))))
        add(errors,'找不到字段 / 变量：'+[...ctx.missing].join('、'));
      if(ctx.errors.length)return;
      let size;
      try{size=elementSize(el,text,dpi,()=>encode(el,text),o.measure);}
      catch(err){add(errors,err.message);return;}
      let ox=+el.x||0;
      if((el.type==='text'||el.type==='counter'||el.type==='date')&&(el.align==='center'||el.align==='right'))ox-=el.align==='center'?size.w/2:size.w;
      const bx=rotatedBox(ox,+el.y||0,size.w,size.h,el.rot);
      // 线框（未填充）常用作外框，不算遮挡
      if(text!==''&&!((el.type==='box'||el.type==='ellipse')&&!el.fill))boxes.push({ei,el,bx,code:isCode(el.type)});
      const tol=0.3;
      if(bx.x0<-tol||bx.y0<-tol||bx.x1>W+tol||bx.y1>H+tol)add(warnings,'超出标签范围（约 '+bx.x1.toFixed(1)+'×'+bx.y1.toFixed(1)+'mm，标签 '+W+'×'+H+'mm）');
      if(!(+el.rot)){
        if(B.BARCODE_1D.includes(el.type)){const q=10*moduleDots(el.module,dpi)*25.4/dpi;
          if((+el.x||0)<q-0.05||bx.x1>W-q+0.05)add(warnings,'一维码左右静区不足 10 个模块（约 '+q.toFixed(1)+'mm），可能扫不出');}
        if(B.BARCODE_2D.includes(el.type)){const m=encode(el,text),md=matrixModuleDots(el.size,m.size,dpi);
          if(dots(el.size,dpi)/m.size<1)add(warnings,'码图边长太小：每个模块不足 1 个打印点，实际会放大到 '+(m.size*md*25.4/dpi).toFixed(1)+'mm');
          const q=(el.type==='qrcode'?4:1)*md*25.4/dpi;
          if((+el.x||0)<q-0.05||(+el.y||0)<q-0.05||bx.x1>W-q+0.05||bx.y1>H-q+0.05)add(warnings,(el.type==='qrcode'?'二维码四周静区不足 4 个模块':'DataMatrix 四周静区不足 1 个模块'));}
      }
      if(['ean13','ean8','upca','upce'].includes(el.type)){const x=moduleDots(el.module,dpi)*25.4/dpi;
        if(x<0.264-0.001||x>0.66+0.001)add(warnings,'模块宽 '+x.toFixed(3)+'mm 偏离 GS1 零售码推荐范围 0.264–0.66mm');}
    });
    // 条码 / 二维码被其他内容压住会扫不出
    for(const a of boxes)if(a.code)for(const b of boxes){
      if(b===a)continue;const ov=0.2;
      if(a.bx.x0<b.bx.x1-ov&&b.bx.x0<a.bx.x1-ov&&a.bx.y0<b.bx.y1-ov&&b.bx.y0<a.bx.y1-ov&&(!b.code||b.ei>a.ei))
        warnings.push({n:e.idx+1,rec:e.rec,ei:a.ei,el:a.el,msg:'与 #'+(b.ei+1)+' 元素重叠，可能影响扫码'});
    }
  }
  return {errors,warnings};
}
// 合并同一元素的同类问题：{level, ei, el, msg, labels:[n...]}
function groupIssues(arr,level){const m=new Map();
  for(const it of arr){const k=it.ei+'\u0001'+it.msg;if(!m.has(k))m.set(k,{level,ei:it.ei,el:it.el,msg:it.msg,labels:[]});m.get(k).labels.push(it.n);}
  return [...m.values()];}

const api={makePrintList,effectiveSize,counterText,counterAdvance,counterName,labelCtx,elementText,promptsUsed,imageSrc,
  dots,moduleDots,matrixModuleDots,elementSize,rotatedBox,preflight,groupIssues};
if(isNode)module.exports=api;else root.Job=api;
})(typeof window!=='undefined'?window:globalThis);
