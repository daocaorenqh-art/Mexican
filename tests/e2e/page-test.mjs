// B11 浏览器 / 驱动打印的页面尺寸：标签机模式每张一页、页面 = 标签尺寸、无边距；整页模式按纸张排版。
// 用 Chromium 按打印样式输出 PDF（与打印预览同一套 @page 规则），核对页数与页面尺寸；静默打印核对传给主进程的 pageSize。
import { APP } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const ctx=await b.newContext();
await ctx.addInitScript(()=>{window.__prints=[];window.labelPrinter={isDesktop:true,
  list:async()=>({ok:true,printers:[{name:'ZT410',displayName:'ZT410',isDefault:true}]}),
  print:async(dev,opts)=>{window.__prints.push({dev,opts,n:document.querySelectorAll('#preview .label:not(.slot)').length});return {ok:true};},
  sendRaw:async()=>({ok:true})};});
const p=await ctx.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForSelector('#preview .label');
const design=(label,csv)=>p.evaluate(([label,csv])=>{loadDesign({v:1,label,elements:[{type:'text',x:2,y:2,size:4,content:'{N}'},{type:'box',x:0.5,y:0.5,w:label.w-1,h:label.h-1,border:0.3}]});
  document.querySelector('#csv').value=csv;document.querySelector('#applyCsv').click();},[label,csv]);
// PDF 页数与每页尺寸（pt → mm）
async function pdfPages(){
  await p.evaluate(()=>{printingAll=true;render();});
  const buf=await p.pdf({preferCSSPageSize:true,printBackground:true});
  await p.evaluate(()=>{printingAll=false;render();});
  const t=buf.toString('latin1');
  const boxes=[...t.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m=>[(m[3]-m[1])*25.4/72,(m[4]-m[2])*25.4/72]);
  const pages=(t.match(/\/Type\s*\/Page(?!s)/g)||[]).length;
  return {pages,boxes};
}
const near=(a,b,t=0.6)=>Math.abs(a-b)<=t;

console.log('\n[标签机模式]');
await design({w:50,h:30,dpi:203,cols:0,gapX:3,gapY:3},'N\n1\n2\n3');
ok('新设计默认标签机模式',await p.evaluate(()=>document.querySelector('#pmode').value==='roll'));
const css=await p.evaluate(()=>document.getElementById('pageStyle').textContent);
ok('@page = 标签尺寸、无边距，每张分页',css.includes('@page{size:50mm 30mm;margin:0}')&&/break-after:page/.test(css),css);
let r=await pdfPages();
ok('PDF 页数 = 张数（3）',r.pages===3,JSON.stringify(r));
ok('每页尺寸 = 50×30mm',r.boxes.length>=3&&r.boxes.every(([w,h])=>near(w,50)&&near(h,30)),JSON.stringify(r.boxes));
await p.evaluate(()=>{document.querySelector('#lw').value=100;document.querySelector('#lh').value=60;document.querySelector('#lw').oninput();});
r=await pdfPages();
ok('改标签尺寸后页面跟着变（100×60mm）',r.pages===3&&r.boxes.every(([w,h])=>near(w,100)&&near(h,60)),JSON.stringify(r));
const sp=await p.evaluate(async()=>{window.confirm=()=>true;document.querySelector('#prnList').value='ZT410';
  const run=doSilentPrint();await new Promise(r=>setTimeout(r,100));const d=document.querySelector('#pfDlg');if(d.style.display!=='none')document.querySelector('#pfGo').click();
  await run;return window.__prints.pop();});
ok('静默打印传页面尺寸 = 标签尺寸（微米）',sp&&sp.opts&&sp.opts.pageSize&&sp.opts.pageSize.width===100000&&sp.opts.pageSize.height===60000&&sp.n===3,JSON.stringify(sp));

console.log('\n[整页模式]');
await design({w:50,h:30,dpi:203,cols:3,gapX:3,gapY:3,pmode:'sheet',paper:'A4',mTop:10,mLeft:10},'N\n1\n2\n3\n4');
ok('载入的设计保持整页模式',await p.evaluate(()=>document.querySelector('#pmode').value==='sheet'&&getComputedStyle(document.querySelector('#sheetOpts')).display!=='none'));
await p.evaluate(()=>{document.querySelector('#startPos').value=3;render();});
ok('从第 3 个位置开始：前面空 2 个标签位',await p.evaluate(()=>document.querySelectorAll('#preview .label.slot').length===2&&document.querySelectorAll('#preview .label:not(.slot)').length===4));
r=await pdfPages();
ok('4 张（+2 个空位）排在 1 页 A4 上',r.pages===1&&near(r.boxes[0][0],210,1)&&near(r.boxes[0][1],297,1),JSON.stringify(r));
const sp2=await p.evaluate(async()=>{const run=doSilentPrint();await new Promise(r=>setTimeout(r,100));const d=document.querySelector('#pfDlg');if(d.style.display!=='none')document.querySelector('#pfGo').click();
  await run;return window.__prints.pop();});
ok('静默打印传纸张名 A4',sp2&&sp2.opts&&sp2.opts.pageSize==='A4',JSON.stringify(sp2));
ok('点选仍作用于第一张标签（不是空位）',await p.evaluate(()=>{const m=elBoxes();return m.size>0;}));

console.log('\n[旧设计兼容 / 保存]');
await design({w:40,h:20,dpi:203,cols:2,gapX:3,gapY:3},'N\n1');
ok('旧设计设了每行数量 → 整页模式',await p.evaluate(()=>document.querySelector('#pmode').value==='sheet'));
await design({w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},'N\n1');
ok('旧设计未设每行数量 → 标签机模式',await p.evaluate(()=>document.querySelector('#pmode').value==='roll'));
const saved=await p.evaluate(()=>{document.querySelector('#pmode').value='sheet';document.querySelector('#pmode').onchange();
  return JSON.parse(localStorage.getItem('label.autosave')).l;});
ok('打印方式进自动保存',saved.pmode==='sheet'&&saved.paper==='A4',JSON.stringify(saved));
ok('撤消恢复打印方式',await p.evaluate(()=>{undo();return document.querySelector('#pmode').value==='roll';}));

console.log('\n==== 页面错误 ====',errors.length?errors:'无');if(errors.length)fail++;
console.log(`\n==== 打印页面尺寸：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
