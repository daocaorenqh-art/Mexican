// PDF417 在界面中：预览形状、属性面板、预检、TSPL 出纸扫码（ZPL 出纸扫码见 scan-test）
import { APP } from './_lib.mjs';
import pw from 'playwright';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ZPLmod=require('../../src/zpl.js');
const { decodeBits }=require('../helpers.cjs');
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');

console.log('\n[预览与属性]');
await p.evaluate(()=>loadDesign({v:1,label:{w:60,h:30,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'pdf417',x:4,y:4,size:40,ecl:'',cols:0,content:'批号 {批号} / SN {#N}'}]}));
await p.evaluate(()=>{setRows(parseData('批号\nB200\nC300'));});
const pv=await p.evaluate(()=>{const s=document.querySelector('#preview .label .el svg');return s?{w:+s.getAttribute('width'),h:+s.getAttribute('height')}:null;});
ok('预览是长方形（宽 > 高）',pv&&pv.w>pv.h*1.5,JSON.stringify(pv));
const wmm=await p.evaluate(w=>w/PXMM,pv.w);
ok('预览宽度按整点模块取整、不超过设定宽度 40mm',wmm<=40&&wmm>36,wmm.toFixed(2)+'mm');
await p.evaluate(()=>{sel=0;renderEditor();});
const fields=await p.evaluate(()=>[...document.querySelectorAll('#elist [data-i="0"][data-k]')].map(e=>e.dataset.k));
ok('属性面板有纠错等级和列数',fields.includes('ecl')&&fields.includes('cols'),fields.join());
await p.evaluate(()=>{const e=document.querySelector('#elist [data-i="0"][data-k="cols"]');e.value=3;e.dispatchEvent(new Event('input',{bubbles:true}));});
const pv3=await p.evaluate(()=>{const s=document.querySelector('#preview .label .el svg');return {w:+s.getAttribute('width'),h:+s.getAttribute('height')};});
const c3=await p.evaluate(()=>Job.elementSize(elements[0],'批号 B200 / SN 1',203,()=>encode2D('pdf417','批号 B200 / SN 1',elements[0].ecl,elements[0].cols)));
// 宽度固定时列数越多、模块越细，码图越矮
ok('改成 3 列 → 码图变矮、宽不超 40mm，与预检尺寸一致',pv3.h<pv.h&&pv3.w/3.78<=40.01&&Math.abs(c3.h-pv3.h/3.78)<0.05,JSON.stringify({pv3,c3}));
const menuOk=await p.evaluate(()=>{const n=elements.length;document.querySelector('#menubar [data-ins="pdf417"]').click();return elements.length===n+1&&elements[n].type==='pdf417';});
ok('「插入」菜单可添加 PDF417',menuOk);
await p.evaluate(()=>{elements.pop();render();});

console.log('\n[预检]');
const pf=await p.evaluate(()=>{elements[0].x=0.2;render();return Job.preflight({elements,list:printList(),label:labelSpec(),sizeOf:sizeOfEl});});
ok('贴边放置 → 提示静区不足 2 个模块',pf.warnings.some(w=>w.msg.includes('PDF417 四周静区')),JSON.stringify(pf.warnings.map(w=>w.msg)));
const pe=await p.evaluate(()=>{elements[0].x=4;elements[0].content='中'.repeat(2000);render();return Job.preflight({elements,list:printList(),label:labelSpec(),sizeOf:sizeOfEl});});
ok('内容过长 → 预检报错，不会打出半截码',pe.errors.some(e=>e.msg.includes('太长')),JSON.stringify(pe.errors.slice(0,1).map(e=>e.msg)));

console.log('\n[TSPL 出纸扫码]');
const bytes=await p.evaluate(async()=>{elements[0].content='批号 {批号} / SN {#N}';elements[0].cols=0;render();
  const z=document.querySelector('#zLang');z.value='tspl';z.dispatchEvent(new Event('change'));
  const c=await buildCommands();z.value='zpl';z.dispatchEvent(new Event('change'));return Array.from(c.data);});
const labs=ZPLmod.parseTSPL(Uint8Array.from(bytes)),W=60*8,H=30*8;
ok('2 条记录 → 2 张',labs.length===2,String(labs.length));
const got=[];
for(const lab of labs){const px=new Uint8Array(W*H);
  for(const bm of lab.bitmaps)for(let y=0;y<bm.h;y++)for(let x=0;x<bm.bpr*8;x++){const v=bm.bytes[y*bm.bpr+(x>>3)];
    if(!((v>>(7-(x&7)))&1)){const X=bm.x+x,Y=bm.y+y;if(X<W&&Y<H)px[Y*W+X]=1;}}
  for(const [bx,by,bw,bh] of lab.bars)for(let Y=by;Y<by+bh&&Y<H;Y++)for(let X=bx;X<bx+bw&&X<W;X++)px[Y*W+X]=1;
  const r=await decodeBits(W,H,(x,y)=>px[y*W+x],{scale:2,formats:['PDF417']});got.push(r.length?r[0].text:null);}
ok('TSPL 两张都扫回原文（含中文、记录字段、张序）',got[0]==='批号 B200 / SN 1'&&got[1]==='批号 C300 / SN 2',JSON.stringify(got));

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== PDF417 界面：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
