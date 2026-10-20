// D6 真机测试标签的自检：examples/test-labels/*.json 能载入、没有预检错误，导出的 ZPL（203 / 300dpi）里
// 每个条码 / 二维码的点阵都能被 zxing-cpp 读回设计内容。真机上的结果记到 docs/print-test-matrix.md。
import { OUT, ROOT, APP } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { decodeBits }=require('../helpers.cjs');
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
const alerts=[];p.on('dialog',d=>{alerts.push(d.message());d.accept();});
await p.goto(APP);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForSelector('#preview .label');

const dir=path.join(ROOT,'examples','test-labels');
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
ok('有测试标签（9 个）',files.length===9,files.join(','));
const CODES=new Set(['barcode','ean13','ean8','upca','code39','itf','qrcode','datamatrix']);
const gfas=z=>[...z.matchAll(/\^GFA,(\d+),\d+,(\d+),([0-9A-F]+)/g)].map(m=>({total:+m[1],bpr:+m[2],hex:m[3]}));
for(const f of files){
  console.log('\n['+f+']');
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  alerts.length=0;
  const r=await p.evaluate(d=>{loadDesign(d);rows=null;render();const pf=runPreflight();
    return {n:elements.length,errs:pf.errors.map(e=>e.msg),warns:pf.warnings.length};},d);
  ok('载入无提示、元素齐全',!alerts.length&&r.n===d.elements.length,alerts.join('|')+' '+r.n);
  ok('预检没有错误'+(r.warns?'（提醒 '+r.warns+' 条，'+(f.includes('quiet')?'贴边测试预期如此':'可接受')+'）':''),!r.errs.length,r.errs.join('|'));
  await p.locator('#preview .label').first().screenshot({path:path.join(OUT,'testlabel-'+f.replace('.json','.png'))});
  const want=d.elements.filter(e=>CODES.has(e.type)).map(e=>e.content);
  for(const dpi of [203,300]){
    const z=await p.evaluate(async dpi=>{document.querySelector('#dpi').value=String(dpi);document.querySelector('#zplComp').value='acs';
      const keep=window.acsEncode;window.acsEncode=h=>h;const z=await buildZPL();window.acsEncode=keep;return z;},dpi);
    const got=new Set();
    for(const g of gfas(z)){const rows=g.total/g.bpr;
      if(rows<20)continue;   // 小位图是文字
      (await decodeBits(g.bpr*8,rows,(x,y)=>(parseInt(g.hex.substr((y*g.bpr+(x>>3))*2,2),16)>>(7-(x&7)))&1)).forEach(x=>got.add(x.text));}
    const miss=want.filter(w=>!got.has(w));
    ok(dpi+'dpi：'+want.length+' 个码全部读回',!miss.length,'读不出：'+miss.join('、')+' 读到：'+[...got].join('、'));
  }
}
console.log('\n==== 页面错误 ====',errors.length?errors:'无');if(errors.length)fail++;
console.log(`\n==== 真机测试标签自检：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
