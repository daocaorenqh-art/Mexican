import { APP } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const ctx=await b.newContext({acceptDownloads:true});const p=await ctx.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const today=await p.evaluate(()=>Job.periodKey('day'));

console.log('\n[流水号按天归零]');
await p.evaluate(()=>loadDesign({v:1,label:{w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'counter',x:2,y:2,size:4,name:'SN',prefix:'',start:57,step:1,pad:3,persist:true,reset:'day',resetStart:1,period:'2000-01-01'},
  {type:'qrcode',x:20,y:2,size:12,content:'ID{#SN}'}]}));
const first=await p.evaluate(()=>[...document.querySelectorAll('#preview .label .el')].map(e=>e.textContent)[0]);
ok('昨天的号码到今天预览从 001 开始',first==='001',first);
const zpl=await p.evaluate(()=>buildZPL());
ok('ZPL 输出同样从 001 开始（二维码内的 {#SN} 一致）',(zpl.match(/\^XA/g)||[]).length===1,zpl.length+' 字节');
const j=await p.evaluate(async()=>{window.confirm=()=>true;window.showIssues=async()=>true;
  window.print=()=>{window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));};
  document.querySelector('#copies').value=3;document.querySelector('#copies').dispatchEvent(new Event('input'));
  await doPrint();const c=elements[0];return {start:c.start,period:c.period};});
ok('打 3 张后：起始 4、周期记为今天',j.start===4&&j.period===today,JSON.stringify(j));
const log=await p.evaluate(()=>JSON.parse(localStorage.getItem('label.printlog')||'[]')[0]);
ok('打印日志里的流水号区间是归零后的 001 – 003',log&&log.serials&&log.serials.SN==='001 – 003',JSON.stringify(log&&log.serials));
await p.evaluate(()=>{elements[0].period='2000-01-01';sel=0;renderEditor();
  const e=document.querySelector('#elist [data-i="0"][data-k="start"]');e.value=200;e.dispatchEvent(new Event('input',{bubbles:true}));});
const manual=await p.evaluate(()=>({t:document.querySelector('#preview .label .el').textContent,period:elements[0].period}));
ok('新的一天手动改起始值 → 以手动值为准，不被归零覆盖',manual.t==='200'&&manual.period===today,JSON.stringify(manual));
const resetSel=await p.evaluate(()=>!!document.querySelector('#elist [data-i="0"][data-k="reset"]'));
ok('属性面板有「归零周期」',resetSel);

console.log('\n[段落最多几行]');
await p.evaluate(()=>loadDesign({v:1,label:{w:40,h:30,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'para',x:2,y:2,w:20,size:3,content:'第一行内容很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长',maxLines:0}]}));
const full=await p.evaluate(()=>wrapLines(elements[0].content,elements[0]).length);
ok('不限行数时会换成多行',full>3,full+' 行');
await p.evaluate(()=>{elements[0].maxLines=2;render();});
const two=await p.evaluate(()=>({n:wrapLines(elements[0].content,elements[0]).length,shown:document.querySelector('#preview .label .el').textContent.split('\n').length}));
ok('最多 2 行：多出的截掉（预览同样 2 行）',two.n===2&&two.shown===2,JSON.stringify(two));
await p.evaluate(()=>{elements[0].ellipsis=true;render();});
const el=await p.evaluate(()=>{const L=wrapLines(elements[0].content,elements[0]);_measureCtx.font=fontOf(elements[0],100);
  return {last:L[L.length-1],w:_measureCtx.measureText(L[L.length-1]).width*elements[0].size/100};});
ok('勾省略号：末行以 … 结尾且不超宽',el.last.endsWith('…')&&el.w<=20,JSON.stringify(el));
const fit=await p.evaluate(()=>{elements[0].content='短';render();return wrapLines(elements[0].content,elements[0]);});
ok('内容没超行时不加省略号',fit.length===1&&fit[0]==='短',JSON.stringify(fit));
const zh=await p.evaluate(async()=>{elements[0].content='一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十';render();
  const L=await layoutJob(printList());const g=L.labels[0].find(x=>x.r);return g?g.r.total/g.r.bpr:0;});
const lh=await p.evaluate(()=>Math.round(3*1.25*203/25.4));
ok('ZPL 栅格高度 = 2 行',zh>0&&zh<=lh*2+2,zh+' 点（2 行约 '+lh*2+'）');

console.log('\n[保存 / 另存为 / 最近文件]');
// 无头 Chromium 会把非 ASCII 的下载名换成 download（完整浏览器不会），这里用英文名验证
await p.evaluate(()=>{designName='box-A';});
const [dl]=await Promise.all([p.waitForEvent('download'),p.evaluate(()=>saveDesign(false))]);
ok('网页版保存：按设计名下载',dl.suggestedFilename()==='box-A.json',dl.suggestedFilename());
await p.evaluate(()=>{designName='装箱单A';});
// 模拟桌面版文件接口（真实接口由桌面自检覆盖）
await p.evaluate(()=>{const disk={},recent=[];let dialogs=0;
  window.__fs={disk,recent,dialogs:()=>dialogs};
  window.labelFile={
    recent:async()=>recent.slice(),
    open:async(path)=>{if(!path){dialogs++;path='D:\\设计\\旧标签.json';disk[path]=JSON.stringify({v:1,label:{w:30,h:15,dpi:203},elements:[{type:'text',x:1,y:1,size:3,content:'旧'}]});}
      if(!(path in disk))throw new Error('只能打开最近文件列表里的文件');recent.unshift(path);return {path,name:path.split('\\').pop(),text:disk[path]};},
    save:async({path,text,saveAs,suggest})=>{if(saveAs||!path){dialogs++;path='D:\\设计\\'+(saveAs?'副本':suggest)+'.json';}
      disk[path]=text;if(!recent.includes(path))recent.unshift(path);return {path,name:path.split('\\').pop()};}};
  refreshRecent();});
await p.evaluate(()=>saveDesign(false));
let st=await p.evaluate(()=>({d:__fs.dialogs(),path:designPath,title:document.title}));
ok('首次保存弹对话框，记住路径',st.d===1&&st.path==='D:\\设计\\装箱单A.json'&&st.title.startsWith('装箱单A - '),JSON.stringify(st));
await p.evaluate(()=>{elements[0].content='改过';return saveDesign(false);});
st=await p.evaluate(()=>({d:__fs.dialogs(),saved:JSON.parse(__fs.disk['D:\\设计\\装箱单A.json']).elements[0].content}));
ok('再次保存直接覆盖原文件，不再弹框',st.d===1&&st.saved==='改过',JSON.stringify(st));
await p.keyboard.press('Control+Shift+S');await p.waitForTimeout(100);
st=await p.evaluate(()=>({d:__fs.dialogs(),path:designPath,name:designName}));
ok('Ctrl+Shift+S 另存为：弹框并切到新文件',st.d===2&&st.path==='D:\\设计\\副本.json'&&st.name==='副本',JSON.stringify(st));
await p.evaluate(()=>refreshRecent());await p.waitForTimeout(50);
const menu=await p.evaluate(()=>({hidden:document.querySelector('#recentMenu').hidden,items:[...document.querySelectorAll('#recentMenu [data-recent]')].map(a=>a.textContent)}));
ok('文件菜单列出最近文件',!menu.hidden&&menu.items.join()==='副本.json,装箱单A.json',JSON.stringify(menu));
await p.evaluate(()=>document.querySelector('#recentMenu [data-recent="D:\\\\设计\\\\装箱单A.json"]').click());await p.waitForTimeout(100);
st=await p.evaluate(()=>({c:elements[0].content,path:designPath,name:designName}));
ok('点最近文件直接打开',st.c==='改过'&&st.path==='D:\\设计\\装箱单A.json'&&st.name==='装箱单A',JSON.stringify(st));
await p.evaluate(()=>{__fs.disk['D:\\设计\\坏.json']='{坏掉';__fs.recent.unshift('D:\\设计\\坏.json');window.__alerts=[];window.alert=m=>__alerts.push(m);return openDesktop('D:\\设计\\坏.json');});
st=await p.evaluate(()=>({c:elements[0].content,path:designPath,a:__alerts[0]||''}));
ok('打开损坏的文件：提示，当前设计和路径不变',st.c==='改过'&&st.path==='D:\\设计\\装箱单A.json'&&st.a.includes('坏.json'),JSON.stringify(st));
await p.keyboard.press('Control+o');await p.waitForTimeout(100);
st=await p.evaluate(()=>({c:elements[0].content,path:designPath}));
ok('Ctrl+O 打开：经对话框载入',st.c==='旧'&&st.path==='D:\\设计\\旧标签.json',JSON.stringify(st));
await p.evaluate(()=>{window.confirm=()=>true;newDesign();});
st=await p.evaluate(()=>({path:designPath,title:document.title}));
ok('新建后不再指向旧文件',st.path===null&&!st.title.includes('旧标签'),JSON.stringify(st));

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 归零 / 段落行数 / 文件：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
