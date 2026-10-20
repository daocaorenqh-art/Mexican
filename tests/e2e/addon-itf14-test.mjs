// EAN / UPC 附加码与 ITF-14 保护框：预览几何、ZPL（Zebrash 出纸）与 TSPL 出纸后扫码
import { S, APP, ZR } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ZPLmod=require('../../src/zpl.js');
const { decodeBits }=require('../helpers.cjs');
let zxM=null;async function zxcpp(){if(zxM)return zxM;const W=require('zxing-wasm/reader');
  const wasm=path.join(path.dirname(require.resolve('zxing-wasm/reader')),'..','..','reader','zxing_reader.wasm');
  await W.prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(wasm)},fireImmediately:true});return zxM=W;}
const scanPng=async f=>(await (await zxcpp()).readBarcodes(new Blob([fs.readFileSync(f)]),{tryHarder:true,eanAddOnSymbol:'Require',maxNumberOfSymbols:8}))
  .filter(x=>x.isValid).map(x=>x.text.replace(/\s/g,'')).sort();
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');

const design={v:1,label:{w:100,h:72,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'ean13',x:6,y:4,h:12,module:0.33,showText:true,content:'{ISSN}+{期号}'},
  {type:'upca',x:6,y:24,h:12,module:0.33,showText:true,content:'03600029145+52800'},
  {type:'itf14',x:6,y:46,h:12,module:0.5,showText:true,bearer:'frame',content:'{箱码}'}]};
const csv='ISSN,期号,箱码\n977123456700,02,1069252538416\n977123456700,15,0692525384166';
await p.evaluate(([d,csv])=>{loadDesign(d);setRows(parseData(csv));},[design,csv]);

console.log('\n[预览]');
const pv=await p.evaluate(()=>{const els=[...document.querySelectorAll('#preview .label')][0].querySelectorAll('.el');
  const info=el=>{const s=el.querySelector('svg');const r=[...s.querySelectorAll('path')].map(x=>x.getAttribute('d')).join('');
    const tx=[...s.querySelectorAll('text')].map(t=>({t:t.textContent,y:+t.getAttribute('y')}));
    const rs=[...r.matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)/g)].map(m=>m.slice(1).map(Number));
    return {w:+s.getAttribute('width'),h:+s.getAttribute('height'),rs,tx};};
  return [info(els[0]),info(els[2])];});
const ean=pv[0],tops=[...new Set(ean.rs.map(r=>r[1]))].sort((a,b)=>a-b);
ok('附加码条从下方开始（比主码短，上方留数字）',tops.length===2&&tops[0]===0&&tops[1]>0,JSON.stringify(tops));
const adTxt=ean.tx.find(t=>t.t==='02');
ok('附加码数字写在附加码上方',adTxt&&adTxt.y===0,JSON.stringify(ean.tx.map(t=>t.t)));
ok('主码数字仍在下方逐位排列',ean.tx.filter(t=>/^\d$/.test(t.t)).length===13);
const itf=pv[1],full=itf.rs.filter(r=>Math.abs(r[2]-itf.w)<0.01);
ok('ITF-14 有上下保护条（与码宽同长）',full.length===2,JSON.stringify(full.map(r=>r.slice(0,2))));
ok('ITF-14 全框含左右两条竖框',itf.rs.filter(r=>r[0]===0||Math.abs(r[0]+r[2]-itf.w)<0.01).length>=4);
ok('ITF-14 人眼文字为 14 位（自动补校验位）',itf.tx.some(t=>t.t==='10692525384160'),JSON.stringify(itf.tx.map(t=>t.t)));
const sz=await p.evaluate(()=>{const r=labelSpec();return Job.preflight({elements,list:printList(),label:r,sizeOf:sizeOfEl});});
ok('预检：带保护框不报静区不足、无错误',!sz.errors.length&&!sz.warnings.some(w=>w.msg.includes('静区')),JSON.stringify(sz.warnings.map(w=>w.msg)));
const bad=await p.evaluate(()=>{const keep=elements[0].content;elements[0].content='{ISSN}+123';
  const r=Job.preflight({elements,list:printList(),label:labelSpec(),sizeOf:sizeOfEl});elements[0].content=keep;return r.errors.map(e=>e.msg);});
ok('附加码位数不对 → 预检报错',bad.some(m=>m.includes('2 位或 5 位')),JSON.stringify(bad.slice(0,1)));

console.log('\n[ZPL 出纸扫码（Zebrash）]');
// 期望值由编码器算出（校验位）：EAN-13 主码 + 附加码、UPC-A + 5 位附加码、ITF-14 14 位
const BC=require('../../src/barcodes.js');
const want=[['977123456700','02','1069252538416'],['977123456700','15','0692525384166']].map(([m,a,c])=>
  [BC.encode1D('ean13',m).text+a,BC.encode1D('upca','03600029145').text+'52800',BC.encode1D('itf14',c).text]);
for(const dpi of [203,300]){
  const zpl=await p.evaluate(async dpi=>{document.querySelector('#dpi').value=String(dpi);document.querySelector('#dpi').dispatchEvent(new Event('change'));render();return buildZPL();},dpi);
  const tag=`addon-${dpi}`;fs.writeFileSync(S+`out/${tag}.zpl`,zpl);
  for(const f of fs.readdirSync(S+'out').filter(f=>f.startsWith(tag+'-')&&f.endsWith('.png')))fs.unlinkSync(S+'out/'+f);
  execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,'100','72',String(dpi===300?12:8)],{stdio:'pipe'});
  for(let i=0;i<2;i++){const got=await scanPng(S+`out/${tag}-${i}.png`);
    // zxing-cpp 把 UPC-A 读成 13 位 EAN-13（前面补 0）
    const norm=got.map(t=>t.startsWith('0036000291452')?t.slice(1):t).sort();
    ok(`${dpi}dpi 第 ${i+1} 张：EAN-13+2、UPC-A+5、ITF-14 都扫出`,JSON.stringify(norm)===JSON.stringify([...want[i]].sort()),JSON.stringify(got));}
}

console.log('\n[TSPL 出纸扫码]');
const bytes=await p.evaluate(async()=>{document.querySelector('#dpi').value='203';document.querySelector('#dpi').dispatchEvent(new Event('change'));
  const z=document.querySelector('#zLang');z.value='tspl';z.dispatchEvent(new Event('change'));
  const c=await buildCommands();z.value='zpl';z.dispatchEvent(new Event('change'));return Array.from(c.data);});
const labs=ZPLmod.parseTSPL(Uint8Array.from(bytes)),W=100*8,H=72*8;
for(let i=0;i<labs.length;i++){const lab=labs[i],px=new Uint8Array(W*H);
  for(const bm of lab.bitmaps)for(let y=0;y<bm.h;y++)for(let x=0;x<bm.bpr*8;x++){const v=bm.bytes[y*bm.bpr+(x>>3)];
    if(!((v>>(7-(x&7)))&1)){const X=bm.x+x,Y=bm.y+y;if(X<W&&Y<H)px[Y*W+X]=1;}}
  for(const [bx,by,bw,bh] of lab.bars)for(let Y=by;Y<by+bh&&Y<H;Y++)for(let X=bx;X<bx+bw&&X<W;X++)px[Y*W+X]=1;
  const got=(await decodeBits(W,H,(x,y)=>px[y*W+x],{scale:2,eanAddOnSymbol:'Require'})).map(r=>r.text.replace(/\s/g,''));
  const norm=got.map(t=>t.startsWith('0036000291452')?t.slice(1):t).sort();
  ok(`TSPL 第 ${i+1} 张三个码都扫出`,JSON.stringify(norm)===JSON.stringify([...want[i]].sort()),JSON.stringify(got));}

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 附加码 / ITF-14：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
