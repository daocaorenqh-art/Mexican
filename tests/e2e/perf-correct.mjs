import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const ctx=await b.newContext();
await ctx.addInitScript(()=>{window.labelPrinter={isDesktop:true,
  list:async()=>({ok:true,printers:[{name:'ZT410',displayName:'ZT410',isDefault:true}]}),
  print:async()=>{window.__atPrint=document.querySelectorAll('#preview .label').length;return {ok:true};},
  sendRaw:async()=>({ok:true})};});
const p=await ctx.newPage({viewport:{width:1300,height:900}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,content:'{N}'},{type:'barcode',x:2,y:8,h:8,module:0.3,showText:false,content:'{N}'}]});
  const r=['N'];for(let i=1;i<=500;i++)r.push('R'+i);document.querySelector('#csv').value=r.join('\n');document.querySelector('#applyCsv').click();});
const cnt=()=>p.evaluate(()=>document.querySelectorAll('#preview .label').length);

console.log('\n[预览限量 + 打印全量]');
ok('预览只渲染 200 张',await cnt()===200);
await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
ok('浏览器打印前：全量 500 张',await cnt()===500,'实得'+await cnt());
const last=await p.evaluate(()=>{const l=[...document.querySelectorAll('#preview .label')].pop();return l.querySelector('.el').textContent;});
ok('最后一张是第 500 条记录',last==='R500',last);
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
ok('打印后恢复 200 张',await cnt()===200);

const sp=await p.evaluate(async()=>{window.confirm=()=>true;document.querySelector('#prnList').value='ZT410';await doSilentPrint();
  return {at:window.__atPrint,after:document.querySelectorAll('#preview .label').length};});
ok('桌面静默打印调用时刻页面有全部 500 张',sp.at===500,'调用时 '+sp.at);
ok('静默打印后恢复 200 张',sp.after===200,'之后 '+sp.after);

const z=await p.evaluate(async()=>((await buildZPL()).match(/\^XA/g)||[]).length);
ok('ZPL 不受预览限量影响：500 张',z===500,'实得'+z);

console.log('\n[拖动快速路径的正确性]');
const box=await p.locator('#preview .label .el[data-ei="0"]').first().boundingBox();
await p.mouse.move(box.x+3,box.y+3);await p.mouse.down();
await p.mouse.move(box.x+40,box.y+3,{steps:8});
const midDrag=await p.evaluate(()=>{const ls=document.querySelectorAll('#preview .label');
  return {first:ls[0].querySelector('.el').style.left,other:ls[50].querySelector('.el').style.left};});
await p.mouse.up();
const after=await p.evaluate(()=>{const ls=document.querySelectorAll('#preview .label');
  return {n:ls.length,first:ls[0].querySelector('.el').style.left,other:ls[50].querySelector('.el').style.left,x:elements[0].x};});
ok('拖动中第一张实时跟手',midDrag.first!==midDrag.other,JSON.stringify(midDrag));
ok('松手后其余标签同步到新位置',after.first===after.other&&after.n===200,JSON.stringify(after));
ok('坐标真的变了（>2mm）',after.x>2,'x='+after.x);

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 性能优化正确性：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
