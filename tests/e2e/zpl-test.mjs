import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw; import fs from 'node:fs'; import path from 'node:path';
const design=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/clothing-tag.json'),'utf8'));
const csv=fs.readFileSync(path.join(ROOT,'examples/clothing-tag.csv'),'utf8');
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);
await p.waitForSelector('#preview .label');

console.log('\n[A] 条码整点对齐 (dot-snapping)');
const snap=await p.evaluate(()=>{
  document.querySelector('#dpi').value='300';
  const dpi=300, dpmm=12;   // 斑马 300dpi = 12 点/mm
  const moduleMM=0.33, dots=Math.max(1,Math.round(moduleMM*dpmm));
  const expectPx=dots/dpmm*3.78;
  return {dots, expectPx:+expectPx.toFixed(4), got:+snapModulePx(0.33).toFixed(4)};
});
ok('0.33mm@300dpi → 整数点',snap.dots===4,'dots='+snap.dots);
ok('snapModulePx 与整点一致',Math.abs(snap.expectPx-snap.got)<0.001,snap.got+'px');
// 预览条宽应是 snap 模块的整数倍
const barOK=await p.evaluate(()=>{
  loadDesign({v:1,label:{w:40,h:20,dpi:300,cols:0,gapX:3,gapY:3},elements:[{type:'barcode',x:2,y:2,h:10,module:0.33,showText:false,content:'12345'}]});
  const rects=[...document.querySelectorAll('#preview svg rect')];
  const unit=snapModulePx(0.33);
  return rects.every(r=>{const w=+r.getAttribute('width');const k=w/unit;return Math.abs(k-Math.round(k))<0.01;});
});
ok('条宽均为整点模块的整数倍',barOK);

console.log('\n[B] ZPL 导出');
await p.evaluate(d=>loadDesign(d),design);
await p.evaluate(c=>{document.querySelector('#csv').value=c;},csv);
await p.evaluate(()=>document.querySelector('#applyCsv').click());
const zpl=await p.evaluate(()=>{document.querySelector('#zplComp').value='acs';return buildZPL();});
fs.writeFileSync(S+'out/label.zpl',zpl);
const xa=(zpl.match(/\^XA/g)||[]).length, xz=(zpl.match(/\^XZ/g)||[]).length;
ok('两条记录 → 2 个 ^XA/^XZ',xa===2&&xz===2,'XA='+xa+' XZ='+xz);
ok('Code128 以位图输出（不依赖打印机 ^BC）',!/\^BCN/.test(zpl));
ok('EAN-13 以位图输出（不依赖打印机 ^BE）',!/\^BEN/.test(zpl));
ok('含文字栅格 (^GFA)',/\^GFA/.test(zpl));
ok('含打印宽/长 (^PW/^LL)',/\^PW\d+/.test(zpl)&&/\^LL\d+/.test(zpl));
// 校验一个 ^GFA 的字节数：hex 长度 == total*2
const dec=(t,bpr)=>{const L=bpr*2,rows=[];let row='',n=0;for(const ch of t){if(ch>='G'&&ch<='Y'){n+=ch.charCodeAt(0)-70;continue;}if(ch>='g'&&ch<='z'){n+=(ch.charCodeAt(0)-102)*20;continue;}if(ch===','){rows.push(row.padEnd(L,'0'));row='';continue;}if(ch==='!'){rows.push(row.padEnd(L,'F'));row='';continue;}if(ch===':'){rows.push(rows[rows.length-1]);continue;}row+=ch.repeat(n||1);n=0;while(row.length>=L){rows.push(row.slice(0,L));row=row.slice(L);}}return rows.join('');};
const mm=zpl.match(/\^GFA,(\d+),(\d+),(\d+),([0-9A-Za-z,!:]+)/);const m=mm&&[mm[0],mm[1],mm[2],mm[3],dec(mm[4],+mm[3])];
ok('^GFA 字节数自洽',m&&(m[4].length===(+m[1])*2),m?('total='+m[1]+' hexLen='+m[4].length):'无GFA');
// 中文确实栅格出黑点（hex 非全 0）
ok('中文已栅格成黑点（非空白）',m&&/[1-9A-F]/.test(m[4]));
// mm→dots：^FO 坐标应为 x_mm*dpi/25.4 的整数
const dpi=await p.evaluate(()=>+document.querySelector('#dpi').value);
const fo=zpl.match(/\^FO(\d+),(\d+)/);
ok('^FO 坐标为整数点',fo&&Number.isInteger(+fo[1])&&Number.isInteger(+fo[2]),'dpi='+dpi+' FO='+(fo?fo[1]+','+fo[2]:''));

ok('全程无 JS 错误',errors.length===0,errors.slice(0,2).join(';'));
console.log(`\n==== ZPL/dot 自检：通过 ${pass} / 失败 ${fail} ====`);
console.log('ZPL 片段预览:\n'+zpl.split('\n').slice(0,8).join('\n'));
await b.close();process.exit(fail?1:0);
