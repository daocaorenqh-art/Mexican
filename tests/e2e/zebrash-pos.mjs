// 独立引擎逐元素位置判定：每个元素单独出 ZPL → Zebrash 渲染 → 墨迹外框必须落在预览外框内（±tol）且覆盖过半
import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1100}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const rot=JSON.parse(fs.readFileSync(FIX+'rot-design.json','utf8'));
const hgz=JSON.parse(fs.readFileSync(ROOT+'/examples/clothing-tag.json','utf8'));
const hgzCsv=fs.readFileSync(ROOT+'/examples/clothing-tag.csv','utf8');
const mode=process.argv[2]||'z64';

async function inkBox(png,dpmm){return p.evaluate(async([src,dpmm])=>{
  const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
  const d=g.getImageData(0,0,im.width,im.height).data;let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(d[(y*im.width+x)*4]<128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return x1<0?null:[x0/dpmm,y0/dpmm,(x1+1)/dpmm,(y1+1)/dpmm];},['data:image/png;base64,'+fs.readFileSync(png).toString('base64'),dpmm]);}

async function check(title,design,csv,dpi,labels,tol=1){
  console.log(`\n[${title} @${dpi}dpi，ZPL 压缩=${mode}]`);
  const dpmm=dpi===300?12:8;
  for(let i=0;i<design.elements.length;i++){
    const one={...design,elements:[design.elements[i]]};
    const r=await p.evaluate(async([d,csv,dpi,mode])=>{loadDesign(d);document.querySelector('#dpi').value=String(dpi);
      document.querySelector('#zplComp').value=mode;document.querySelector('#csv').value=csv;document.querySelector('#applyCsv').click();
      document.querySelector('#rFrom').value='1';document.querySelector('#rTo').value='1';render();
      const lab=document.querySelector('#preview .label'),lr=lab.getBoundingClientRect(),n=lab.querySelector('.el'),q=n.getBoundingClientRect();
      return {zpl:await buildZPL(),pv:[(q.left-lr.left)/3.78,(q.top-lr.top)/3.78,(q.right-lr.left)/3.78,(q.bottom-lr.top)/3.78],
        w:+document.querySelector('#lw').value,h:+document.querySelector('#lh').value};},[one,csv,dpi,mode]);
    const tag=`pos-${dpi}-${i}`;fs.writeFileSync(S+`out/${tag}.zpl`,r.zpl);
    fs.readdirSync(S+'out').filter(f=>f.startsWith(tag+'-')).forEach(f=>fs.unlinkSync(S+'out/'+f));
    execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,String(r.w),String(r.h),String(dpmm)],{stdio:'pipe'});
    const z=await inkBox(S+`out/${tag}-0.png`,dpmm),v=r.pv.map(n=>Math.max(0,n));
    const inside=z&&z[0]>=v[0]-tol&&z[1]>=v[1]-tol&&z[2]<=v[2]+tol&&z[3]<=v[3]+tol;
    const cover=z&&(z[2]-z[0])>=(v[2]-v[0])*0.5&&(z[3]-z[1])>=(v[3]-v[1])*0.5;
    ok(`${labels[i]}：打印墨迹在预览外框内（±${tol}mm）且覆盖过半`,inside&&cover,
      'Zebrash['+(z||[]).map(n=>n.toFixed(1))+'] 预览['+v.map(n=>n.toFixed(1))+']');
  }
}
await check('旋转/图片/段落',rot.design,rot.csv,203,['标题','段落','图片','旋转90°文字','旋转90°条码','旋转30°方框','旋转180°二维码','EAN-13(原生)']);
await check('合格证示例',hgz,hgzCsv,300,hgz.elements.map((e,i)=>`#${i} ${e.type} ${String(e.content||'').slice(0,12)}`));
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== Zebrash 逐元素位置：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
