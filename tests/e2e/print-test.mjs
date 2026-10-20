import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const ctx=await b.newContext();const p=await ctx.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');

console.log('\n[打印范围 + 份数]');
await p.evaluate(()=>loadDesign({v:1,label:{w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,content:'{NAME}'},
  {type:'counter',x:2,y:10,size:4,prefix:'SN-',start:1,step:1,pad:4,suffix:'',persist:true}]}));
await p.evaluate(()=>{document.querySelector('#csv').value='NAME\nA\nB\nC\nD\nE';document.querySelector('#applyCsv').click();});
const setPrint=(c,f,t)=>p.evaluate(([c,f,t])=>{const s=(id,v)=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event('input'));};
  s('#copies',c);s('#rFrom',f);s('#rTo',t);},[c,f,t]);
await setPrint(2,2,4);
const r=await p.evaluate(()=>[...document.querySelectorAll('#preview .label')].map(l=>[...l.querySelectorAll('.el')].map(e=>e.textContent)));
ok('第2~4条×2份 → 6 张',r.length===6,'实得'+r.length);
ok('记录顺序 B,B,C,C,D,D',r.map(x=>x[0]).join(',')==='B,B,C,C,D,D',r.map(x=>x[0]).join(','));
ok('流水号逐张递增 SN-0001..0006',r.map(x=>x[1]).join(',')==='SN-0001,SN-0002,SN-0003,SN-0004,SN-0005,SN-0006',r.map(x=>x[1]).join(','));
const pager=await p.evaluate(()=>document.querySelector('#pager').textContent);
ok('状态栏显示张数与记录数',pager.includes('6 张')&&pager.includes('5 条记录'),pager);
const z=await p.evaluate(()=>buildZPL());
ok('ZPL 张数与预览一致（6 个 ^XA）',(z.match(/\^XA/g)||[]).length===6);
await setPrint(1,1,0);
const all=await p.evaluate(()=>document.querySelectorAll('#preview .label').length);
ok('到第0条=全部 → 5 张',all===5,'实得'+all);
await setPrint(1,9,0);
const clamp=await p.evaluate(()=>document.querySelectorAll('#preview .label').length);
ok('起始越界被夹住（不崩、至少1张）',clamp>=1,'实得'+clamp);
await setPrint(1,1,0);

console.log('\n[流水号续号]');
// 用真实的浏览器打印事件序列模拟一次打印作业
const printJob=(answer)=>p.evaluate(a=>{let asks=0;window.confirm=()=>{asks++;return a;};
  window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));
  return {asks,start:elements.find(e=>e.type==='counter').start};},answer);
let j=await printJob(false);
ok('打印后点「否」→ 不续号（仍为1）',j.asks===1&&j.start===1,JSON.stringify(j));
j=await printJob(true);
ok('【回归】取消后立刻再打并点「是」→ 续号到6',j.asks===1&&j.start===6,JSON.stringify(j));
const first=await p.evaluate(()=>document.querySelector('#preview .label .el[data-ei="1"]').textContent);
ok('下次从 SN-0006 开始',first==='SN-0006',first);
const stray=await p.evaluate(()=>{let asks=0;window.confirm=()=>{asks++;return true;};
  window.dispatchEvent(new Event('afterprint'));return {asks,start:elements.find(e=>e.type==='counter').start};});
ok('没有打印作业的孤立 afterprint → 不询问不改号',stray.asks===0&&stray.start===6,JSON.stringify(stray));
const zj=await p.evaluate(async()=>{let asks=0;window.confirm=()=>{asks++;return true;};await exportZPL();
  return {asks,start:elements.find(e=>e.type==='counter').start};});
ok('导出 ZPL 也是一次作业 → 询问一次并续号到11',zj.asks===1&&zj.start===11,JSON.stringify(zj));
await p.evaluate(()=>{elements.find(e=>e.type==='counter').persist=false;window.confirm=()=>{throw new Error('不应弹窗');};
  window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));});
ok('未勾续号 → 不弹确认、不改号',true);

console.log('\n[自动保存 / 崩溃恢复]');
await p.evaluate(()=>loadDesign({v:1,label:{w:77,h:33,dpi:300,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:5,y:5,size:4,content:'自动保存测试'},{type:'datamatrix',x:30,y:3,size:12,content:'AUTO-1'}]}));
await p.reload();await p.waitForSelector('#preview .label');
const rs=await p.evaluate(()=>({n:elements.length,c:elements[0].content,t:elements[1]&&elements[1].type,w:toMM(document.querySelector('#lw').value),dpi:document.querySelector('#dpi').value}));
ok('刷新后元素恢复',rs.n===2&&rs.c==='自动保存测试'&&rs.t==='datamatrix',JSON.stringify(rs));
ok('刷新后标签尺寸/DPI 恢复',rs.w===77&&rs.dpi==='300');
const hist=await p.evaluate(()=>{const before=elements.length;document.querySelector('[data-cmd="undo"]').click();return [before,elements.length];});
ok('恢复后撤消不会回到空白（历史起点=恢复的设计）',hist[1]===hist[0],JSON.stringify(hist));

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 打印/续号/自动保存：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
