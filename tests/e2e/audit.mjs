import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw; import fs from 'node:fs'; import path from 'node:path';
let pass=0,fail=0; const F=[];
const ok=(name,cond,extra='')=>{if(cond){pass++;console.log('  ✓',name,extra);}else{fail++;F.push(name);console.log('  ✗',name,extra);}};

const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const click=s=>p.evaluate(sel=>document.querySelector(sel).click(),s);
await p.goto(APP);
await p.waitForSelector('#preview .label');

console.log('\n[1] 所有元素类型渲染（无异常）');
const allTypes={v:1,label:{w:90,h:120,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,bold:true,content:'文字ABC'},
  {type:'para',x:2,y:8,w:40,size:3,content:'段落第一行\n第二行很长很长需要自动换行测试一下'},
  {type:'barcode',x:2,y:22,h:10,module:0.3,showText:true,content:'ABC-123'},
  {type:'ean13',x:2,y:36,h:10,module:0.3,showText:true,content:'6925253841665'},
  {type:'ean8',x:48,y:36,h:10,module:0.3,showText:true,content:'1234567'},
  {type:'upca',x:2,y:50,h:10,module:0.3,showText:true,content:'03600029145'},
  {type:'code39',x:2,y:64,h:10,module:0.28,showText:true,content:'CODE39'},
  {type:'itf',x:2,y:78,h:10,module:0.3,showText:true,content:'1234567890'},
  {type:'counter',x:48,y:50,size:4,prefix:'SN',start:1,step:1,pad:4},
  {type:'date',x:48,y:58,size:3,format:'YYYY-MM-DD'},
  {type:'box',x:60,y:64,w:20,h:12,border:0.4,fill:false},
  {type:'ellipse',x:60,y:80,w:18,h:14,border:0.4,fill:false},
]};
await p.evaluate(d=>loadDesign(d),allTypes);
await p.waitForTimeout(200);
const warns=await p.evaluate(()=>[...document.querySelectorAll('#preview .el')].filter(e=>e.textContent.includes('⚠')).map(e=>e.textContent.slice(0,40)));
ok('12 种元素无渲染异常',warns.length===0,warns.length?JSON.stringify(warns):'');
const svgCount=await p.evaluate(()=>document.querySelectorAll('#preview svg').length);
ok('6 个一维条码均生成 SVG',svgCount===6,'实得'+svgCount);

console.log('\n[2] 菜单：插入/撤消/恢复/剪贴板/层次');
await p.evaluate(()=>{elements=[];sel=-1;commit();render();renderEditor();});
await click('[data-ins="text"]'); await click('[data-ins="qrcode"]');
let n=await p.evaluate(()=>elements.length); ok('插入2个→长度2',n===2);
await click('[data-cmd="undo"]'); n=await p.evaluate(()=>elements.length); ok('撤消→长度1',n===1);
await click('[data-cmd="redo"]'); n=await p.evaluate(()=>elements.length); ok('恢复→长度2',n===2);
await p.evaluate(()=>{sel=0;}); await click('[data-cmd="copy"]'); await click('[data-cmd="paste"]');
n=await p.evaluate(()=>elements.length); ok('粘贴→长度3',n===3);
await p.evaluate(()=>{sel=0;}); const t0=await p.evaluate(()=>elements[0].type);
await click('[data-cmd="front"]'); const tl=await p.evaluate(()=>elements[elements.length-1].type);
ok('置于顶层→首元素移到末尾',t0===tl);
await p.evaluate(()=>{sel=elements.length-1;}); await click('[data-cmd="del"]');
n=await p.evaluate(()=>elements.length); ok('删除→长度2',n===2);

console.log('\n[3] 对象向导');
await p.evaluate(()=>document.querySelector('[data-cmd="wizard"]').click());
let wzShown=await p.evaluate(()=>getComputedStyle(document.querySelector('#wizard')).display!=='none');
ok('向导弹出',wzShown);
await p.evaluate(()=>{document.querySelector('input[name=wzt][value="counter"]').checked=true;document.querySelector('input[name=wzt][value="counter"]').dispatchEvent(new Event('change'));});
const beforeWz=await p.evaluate(()=>elements.length);
await p.evaluate(()=>document.querySelector('#wzNext').click()); // counter 无数据步→完成
const afterWz=await p.evaluate(()=>elements.length);
const lastT=await p.evaluate(()=>elements[elements.length-1].type);
ok('向导添加流水号',afterWz===beforeWz+1&&lastT==='counter');
wzShown=await p.evaluate(()=>getComputedStyle(document.querySelector('#wizard')).display!=='none');
ok('向导完成后关闭',!wzShown);

console.log('\n[4] 单位 mm/cm 切换（几何不变量）');
await p.evaluate(()=>loadDesign({v:1,label:{w:50,h:30,dpi:203,cols:0,gapX:3,gapY:3},elements:[{type:'text',x:10,y:5,size:4,content:'X'}]}));
const pxMM=await p.evaluate(()=>document.querySelector('#preview .label').style.width);
await p.evaluate(()=>{document.querySelector('#unit').value='cm';document.querySelector('#unit').dispatchEvent(new Event('change'));});
const lwDisp=await p.evaluate(()=>document.querySelector('#lw').value);
const pxCM=await p.evaluate(()=>document.querySelector('#preview .label').style.width);
const elXmm=await p.evaluate(()=>elements[0].x);
ok('切 cm：标签宽输入 50→5',(+lwDisp)===5,'实得'+lwDisp);
ok('切 cm：渲染像素尺寸不变',pxMM===pxCM,pxMM+' vs '+pxCM);
ok('切 cm：元素内部仍存 mm(10)',elXmm===10,'实得'+elXmm);
await p.evaluate(()=>{document.querySelector('#unit').value='mm';document.querySelector('#unit').dispatchEvent(new Event('change'));});
const lwBack=await p.evaluate(()=>document.querySelector('#lw').value);
ok('切回 mm：标签宽 5→50',(+lwBack)===50,'实得'+lwBack);

console.log('\n[5] 数据套打 + 表达式');
const csv='A,B\n甲,100\n乙,200';
await p.evaluate(d=>loadDesign(d),{v:1,label:{w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,content:'{A}'},{type:'text',x:2,y:9,size:4,content:'=[B]+"元"'}]});
await p.evaluate(c=>{document.querySelector('#csv').value=c;},csv);
await click('#applyCsv');
const merge=await p.evaluate(()=>{const labs=[...document.querySelectorAll('#preview .label')];
  return {count:labs.length, first:[...labs[0].querySelectorAll('.el')].map(e=>e.textContent)};});
ok('CSV→2 张标签',merge.count===2);
ok('插值+表达式正确',merge.first.includes('甲')&&merge.first.includes('100元'),JSON.stringify(merge.first));

console.log('\n[6] 保存/载入往返');
const rt=await p.evaluate(()=>{
  const design={v:1,label:{w:66,h:44,dpi:300,cols:2,gapX:4,gapY:5},elements:[
    {type:'text',x:7,y:8,size:5,bold:true,content:'往返'},
    {type:'ean13',x:3,y:15,h:9,module:0.33,showText:true,content:'6925253841665'}]};
  loadDesign(design);
  return {w:toMM(document.querySelector('#lw').value),cols:document.querySelector('#cols').value,
    n:elements.length,c0:elements[0].content,t1:elements[1].type};});
ok('载入恢复标签尺寸(66)',rt.w===66,'实得'+rt.w);
ok('载入恢复列数(2)',(+rt.cols)===2);
ok('载入恢复元素内容',rt.n===2&&rt.c0==='往返'&&rt.t1==='ean13');

console.log('\n[7] 打印模式可见性');
await p.emulateMedia({media:'print'});
const pr=await p.evaluate(()=>{const cs=s=>getComputedStyle(document.querySelector(s)).display;
  return {menu:cs('#menubar'),left:cs('.wrap>div:first-child'),prev:cs('#preview')};});
ok('打印：菜单栏隐藏',pr.menu==='none');
ok('打印：左设置栏隐藏',pr.left==='none');
ok('打印：预览区可见',pr.prev!=='none');
await p.emulateMedia({media:'screen'});

ok('全程无 JS 运行时错误',errors.length===0,errors.length?JSON.stringify(errors.slice(0,3)):'');
await p.locator('#preview').screenshot({path:path.join(OUT,'audit.png')}).catch(()=>{});
console.log(`\n==== 自检结果：通过 ${pass} / 失败 ${fail} ====`);
if(F.length)console.log('失败项:',F.join(' | '));
await b.close();
process.exit(fail?1:0);
