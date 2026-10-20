// 独立引擎判定：压缩 ZPL 与未压缩 ZPL 经 Zebrash 渲染后必须像素逐点一致
import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const hgz=JSON.parse(fs.readFileSync(ROOT+'/examples/clothing-tag.json','utf8'));
const hgzCsv=fs.readFileSync(ROOT+'/examples/clothing-tag.csv','utf8');
const rot=JSON.parse(fs.readFileSync(FIX+'rot-design.json','utf8'));

async function both(design,csv,dpi){
  return p.evaluate(async([d,csv,dpi])=>{loadDesign(d);document.querySelector('#dpi').value=String(dpi);
    document.querySelector('#csv').value=csv;document.querySelector('#applyCsv').click();
    const mode=v=>{document.querySelector('#zplComp').value=v;};
    mode('z64');const zz=await buildZPL();mode('acs');const zc=await buildZPL();
    const keep=window.acsEncode;window.acsEncode=h=>h;const zu=await buildZPL();window.acsEncode=keep;   // ACS 模式下去掉压缩 = 原始点阵
    return {zc,zz,zu,w:+document.querySelector('#lw').value,h:+document.querySelector('#lh').value};},[design,csv,dpi]);
}
const render=(zpl,tag,w,h,dpmm)=>{fs.writeFileSync(S+`out/${tag}.zpl`,zpl);
  execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,String(w),String(h),String(dpmm)],{stdio:'pipe'});
  return fs.readdirSync(S+'out').filter(f=>f.startsWith(tag+'-')&&f.endsWith('.png')).sort();};
async function samePixels(fa,fb){return p.evaluate(async([a,bb])=>{
  const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
  const [A,B]=await Promise.all([load(a),load(bb)]);if(A.width!==B.width||A.height!==B.height)return 'size';
  const px=im=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);return g.getImageData(0,0,im.width,im.height).data;};
  const da=px(A),db=px(B);let diff=0,ink=0;for(let i=0;i<da.length;i+=4){if(da[i]!==db[i])diff++;if(da[i]<128)ink++;}return {diff,ink};},
  ['data:image/png;base64,'+fs.readFileSync(S+'out/'+fa).toString('base64'),'data:image/png;base64,'+fs.readFileSync(S+'out/'+fb).toString('base64')]);}

for(const [name,design,csv,dpis] of [['合格证示例',hgz,hgzCsv,[203,300]],['旋转/图片/段落',rot.design,rot.csv,[203]]]){
  for(const dpi of dpis){
    console.log(`\n[${name} @${dpi}dpi]`);
    const r=await both(design,csv,dpi);
    const dpmm=dpi===300?12:8;
    const fc=render(r.zc,`v-c-${dpi}-${name.length}`,r.w,r.h,dpmm), fu=render(r.zu,`v-u-${dpi}-${name.length}`,r.w,r.h,dpmm);
    ok('Zebrash 能解析压缩版并渲染出同样张数',fc.length===fu.length&&fc.length>0,fc.length+' 张');
    for(let i=0;i<fc.length;i++){const s=await samePixels(fc[i],fu[i]);
      ok(`第 ${i+1} 张：压缩版与未压缩版像素逐点一致`,s&&s.diff===0&&s.ink>500,JSON.stringify(s));}
    const fz=render(r.zz,`v-z-${dpi}-${name.length}`,r.w,r.h,dpmm);
    for(let i=0;i<fz.length;i++){const s=await samePixels(fz[i],fu[i]);
      ok(`第 ${i+1} 张：Z64 版与未压缩版像素逐点一致`,fz.length===fu.length&&s&&s.diff===0&&s.ink>500,JSON.stringify(s));}
    ok('Z64 比 ACS 更小',r.zz.length<r.zc.length,`${(r.zc.length/1024).toFixed(1)}KB → ${(r.zz.length/1024).toFixed(1)}KB`);
    const ratio=r.zu.length/r.zc.length;
    ok('体积缩小',ratio>1.5,`${(r.zu.length/1024).toFixed(1)}KB → ${(r.zc.length/1024).toFixed(1)}KB（${ratio.toFixed(1)} 倍）`);
    const per=r.zc.length/fc.length;
    console.log(`    串口 9600 波特约 ${(per/960).toFixed(1)} 秒/张，115200 波特约 ${(per/11520).toFixed(2)} 秒/张`);
  }
}
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== Zebrash 独立判定：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
