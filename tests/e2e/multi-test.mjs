import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const D={v:1,label:{w:100,h:60,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'box',x:5,y:5,w:10,h:8,border:0.4},{type:'box',x:30,y:12,w:14,h:8,border:0.4},
  {type:'box',x:70,y:20,w:12,h:8,border:0.4},{type:'box',x:50,y:40,w:10,h:10,border:0.4}]};
const reset=()=>p.evaluate(d=>{loadDesign(JSON.parse(JSON.stringify(d)));setSelection([]);renderEditor();render();},D);
const center=async i=>{const bb=await p.locator(`#preview .label .el[data-ei="${i}"]`).first().boundingBox();return [bb.x+bb.width/2,bb.y+bb.height/2];};
const clickEl=async(i,mod)=>{const [x,y]=await center(i);if(mod)await p.keyboard.down(mod);await p.mouse.click(x,y);if(mod)await p.keyboard.up(mod);};
const st=()=>p.evaluate(()=>({sel:[...selSet].sort(),xy:elements.map(e=>[e.x,e.y]),g:elements.map(e=>e.group||null),
  marked:[...document.querySelectorAll('#preview .label')][0].querySelectorAll('.el.selel').length,
  handle:document.querySelectorAll('#preview .label .rz').length,listSel:document.querySelectorAll('.elitem.sel').length}));

console.log('\n[Shift 多选]');
await reset();await clickEl(0);await clickEl(1,'Shift');await clickEl(2,'Shift');
let s=await st();
ok('Shift+点击选中 3 个',s.sel.join()==='0,1,2',s.sel.join());
ok('画布 3 个都有选中框、列表 3 项高亮',s.marked===3&&s.listSel===3,`marked=${s.marked} list=${s.listSel}`);
ok('多选时不显示缩放手柄（避免歧义）',s.handle===0);
await clickEl(1,'Shift');s=await st();
ok('再次 Shift+点击取消其中一个',s.sel.join()==='0,2',s.sel.join());

console.log('\n[整体拖动]');
await reset();await clickEl(0);await clickEl(1,'Shift');
const before=await st();const [cx,cy]=await center(1);
await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+38,cy+19,{steps:6});await p.mouse.up();
const after=await st();
const d0=[after.xy[0][0]-before.xy[0][0],after.xy[0][1]-before.xy[0][1]],d1=[after.xy[1][0]-before.xy[1][0],after.xy[1][1]-before.xy[1][1]];
ok('两个选中对象位移相同',Math.abs(d0[0]-d1[0])<0.02&&Math.abs(d0[1]-d1[1])<0.02,JSON.stringify([d0,d1]));
ok('位移约 10mm×5mm',Math.abs(d1[0]-38/3.78)<0.2&&Math.abs(d1[1]-19/3.78)<0.2,JSON.stringify(d1));
ok('未选中的对象不动',after.xy[2].join()===before.xy[2].join()&&after.xy[3].join()===before.xy[3].join());
ok('拖完仍保持多选',after.sel.join()==='0,1');

console.log('\n[对象间对齐 / 等距分布]');
await reset();await p.evaluate(()=>{setSelection([0,1,2]);alignSel('T');});
let bx=await p.evaluate(()=>[...elBoxes()].map(([i,b])=>[i,+b.y.toFixed(2)]));
ok('多选顶对齐：三者顶边相同(=最上者)',bx[0][1]===bx[1][1]&&bx[1][1]===bx[2][1]&&Math.abs(bx[0][1]-5)<0.05,JSON.stringify(bx.slice(0,3)));
ok('未选中的第4个不动',Math.abs(bx[3][1]-40)<0.05);
await reset();await p.evaluate(()=>{setSelection([0,1,2]);distributeSel('h');});
const gaps=await p.evaluate(()=>{const B=elBoxes(),u=[0,1,2].map(i=>B.get(i)).sort((a,b)=>a.x-b.x);
  return [u[1].x-(u[0].x+u[0].w),u[2].x-(u[1].x+u[1].w),u[0].x,u[2].x+u[2].w];});
ok('水平等距：两段间隙相等',Math.abs(gaps[0]-gaps[1])<0.05,gaps.map(v=>v.toFixed(2)).join(' / '));
ok('等距时首尾不动',Math.abs(gaps[2]-5)<0.05&&Math.abs(gaps[3]-82)<0.05);
await reset();const dmsg=await p.evaluate(()=>{let m='';window.alert=x=>m=x;setSelection([0,1]);distributeSel('h');return m;});
ok('只选 2 个时等距 → 提示需要 3 个',dmsg.includes('3 个'));

console.log('\n[成组]');
await reset();await clickEl(0);await clickEl(1,'Shift');
await p.keyboard.press('Control+g');s=await st();
ok('Ctrl+G 成组：两者同一组号',s.g[0]&&s.g[0]===s.g[1]&&!s.g[2],JSON.stringify(s.g));
ok('列表显示「组」标记',await p.evaluate(()=>document.querySelectorAll('.gtag').length===2));
await p.mouse.click(5,5);await clickEl(0);s=await st();
ok('点组内任一个 → 整组选中',s.sel.join()==='0,1',s.sel.join());
const off0=await p.evaluate(()=>elements[1].x-elements[0].x);
await p.evaluate(()=>{setSelection([0,1,3]);alignSel('R');});
const off1=await p.evaluate(()=>elements[1].x-elements[0].x);
ok('对齐时组作为整体：组内相对位置不变',Math.abs(off0-off1)<0.02,`${off0.toFixed(2)} → ${off1.toFixed(2)}`);
await p.evaluate(()=>{setSelection([0,1]);});await p.keyboard.press('Control+Shift+g');
await p.evaluate(()=>{setSelection([]);renderEditor();render();});await clickEl(0);s=await st();
ok('Ctrl+Shift+G 解组后只选中单个',s.sel.join()==='0'&&!s.g[0],JSON.stringify(s));

console.log('\n[框选 / 空白取消 / 全选 / Esc]');
await reset();
const lab=await p.locator('#preview .label').first().boundingBox();
await p.mouse.move(lab.x+2,lab.y+2);await p.mouse.down();await p.mouse.move(lab.x+65*3.78,lab.y+30*3.78,{steps:6});await p.mouse.up();
s=await st();ok('框选覆盖前两个对象 → 选中 0,1',s.sel.join()==='0,1',s.sel.join());
ok('框选框松手后移除',await p.evaluate(()=>!document.querySelector('.marquee')));
await p.mouse.click(lab.x+95*3.78,lab.y+58*3.78);s=await st();ok('点空白处 → 取消选择',s.sel.length===0);
await p.mouse.click(10,10);await p.keyboard.press('Control+a');s=await st();ok('Ctrl+A 全选 4 个',s.sel.length===4);
await p.keyboard.press('Escape');s=await st();ok('Esc 取消选择',s.sel.length===0);

console.log('\n[多选的方向键 / 复制粘贴 / 删除 / 置顶 / 撤消]');
await reset();await p.evaluate(()=>{setSelection([1,2]);renderEditor();render();});await p.mouse.click(10,10);
const bn=await st();await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowRight');const an=await st();
ok('方向键同时移动两个',Math.abs(an.xy[1][0]-bn.xy[1][0]-1)<0.01&&Math.abs(an.xy[2][0]-bn.xy[2][0]-1)<0.01&&an.xy[0][0]===bn.xy[0][0]);
await p.evaluate(()=>{setSelection([0,1]);groupSel();setSelection([0,1]);copySel();pasteClip();});
s=await st();ok('复制粘贴两个 → 共 6 个、新粘贴的被选中',s.xy.length===6&&s.sel.join()==='4,5',s.sel.join());
ok('粘贴的是新组（不与原组混在一起）',s.g[4]&&s.g[4]===s.g[5]&&s.g[4]!==s.g[0],JSON.stringify(s.g));
await p.evaluate(()=>{setSelection([4,5]);delSel();});s=await st();ok('删除多选 → 回到 4 个',s.xy.length===4);
const orderBefore=await p.evaluate(()=>JSON.stringify(elements.map(e=>[e.x,e.y])));
const t3=await p.evaluate(()=>{const a=elements[0],b=elements[2];setSelection([0,2]);zMove('front');
  return [elements[2]===a,elements[3]===b,[...selSet].sort().join()];});
ok('多选置于顶层：保持先后、仍选中',t3[0]&&t3[1]&&t3[2]==='2,3',JSON.stringify(t3));
await p.evaluate(()=>document.querySelector('[data-cmd="undo"]').click());
const orderAfter=await p.evaluate(()=>JSON.stringify(elements.map(e=>[e.x,e.y])));
ok('撤消后恢复置顶前的顺序',orderAfter===orderBefore,orderAfter);

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 多选/对齐/成组：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
