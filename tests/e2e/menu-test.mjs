import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw; import fs from 'node:fs'; import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);
await p.waitForSelector('#preview .label');
const click=s=>p.evaluate(sel=>document.querySelector(sel).click(),s);

const n0=await p.evaluate(()=>elements.length);
await click('[data-ins="text"]');                    // 插入文字
const n1=await p.evaluate(()=>elements.length);
await click('[data-cmd="undo"]');                    // 撤消
const n2=await p.evaluate(()=>elements.length);
await click('[data-cmd="redo"]');                    // 恢复
const n3=await p.evaluate(()=>elements.length);
console.log('=== 菜单插入 + 撤消/恢复 ===');
console.log(`初始${n0} →插入${n1} →撤消${n2} →恢复${n3}`, (n1===n0+1&&n2===n0&&n3===n0+1)?'✓':'✗');

await p.evaluate(()=>{sel=elements.length-1;});
await click('[data-cmd="copy"]'); await click('[data-cmd="paste"]');
const n4=await p.evaluate(()=>elements.length);
const off=await p.evaluate(()=>{const a=elements[elements.length-2],b=elements[elements.length-1];return{dx:+(b.x-a.x).toFixed(1),dy:+(b.y-a.y).toFixed(1)};});
console.log('=== 复制/粘贴 ===');
console.log(`粘贴后${n4}(期望${n3+1}) 偏移`,off,(n4===n3+1&&off.dx===2&&off.dy===2)?'✓':'✗');

await p.evaluate(()=>{sel=0;});
const t0=await p.evaluate(()=>elements[0].type);
await click('[data-cmd="front"]');
const tLast=await p.evaluate(()=>elements[elements.length-1].type);
console.log('=== 层次：置于顶层 ===');
console.log(`原elements[0]=${t0} → 置顶后到末尾=${tLast}`, t0===tLast?'✓':'✗');

await click('[data-ins="para"]');
const para=await p.evaluate(()=>{const i=elements.length-1;const node=document.querySelector('#preview .el[data-ei="'+i+'"]');
  return{type:elements[i].type,ws:node?getComputedStyle(node).whiteSpace:null,w:node?node.style.width:null};});
console.log('=== 段落（多行文字） ===');
console.log('类型',para.type,'| white-space',para.ws,'| 宽',para.w,(para.type==='para'&&para.ws==='pre'&&para.w)?'✓':'✗');

await p.locator('#preview').screenshot({path:path.join(OUT,'menu-feats.png')});
console.log('=== 页面错误 ===',errors.length?errors:'无');if(errors.length)process.exitCode=1;
await b.close();
