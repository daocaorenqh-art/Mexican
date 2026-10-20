import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const jsQR=require('jsqr');const Z=require('@zxing/library');
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
const ext=[];p.on('request',r=>{if(!r.url().startsWith('file:'))ext.push(r.url());});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const QR_TXT='合格证 FZ075885L-01110 零售价558.00', DM_TXT='FZ075885L-01110';
await p.evaluate(([a,c])=>loadDesign({v:1,label:{w:70,h:40,dpi:300,cols:0,gapX:3,gapY:3},elements:[
  {type:'qrcode',x:3,y:3,size:30,ecl:'H',content:a},{type:'datamatrix',x:38,y:3,size:25,content:c}]}),[QR_TXT,DM_TXT]);
await p.waitForTimeout(200);
// 取画布上实际渲染的 SVG 像素（白底 + 静区）
const grab=i=>p.evaluate(async i=>{const svg=document.querySelector('#preview .el[data-ei="'+i+'"] svg');
  const w=+svg.getAttribute('width'),q=w*0.15,S=4,W=Math.ceil((w+q*2)*S);
  const url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(svg))));
  const img=new Image();await new Promise(r=>{img.onload=r;img.src=url;});
  const c=document.createElement('canvas');c.width=c.height=W;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,W,W);x.imageSmoothingEnabled=false;x.drawImage(img,q*S,q*S,w*S,w*S);
  return {W,data:Array.from(x.getImageData(0,0,W,W).data)};},i);
const toLum=g=>{const L=new Uint8ClampedArray(g.W*g.W);for(let i=0;i<L.length;i++)L[i]=g.data[i*4]<128?0:255;return L;};
const zx=(reader,g)=>{try{return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(toLum(g),g.W,g.W))),
  new Map([[Z.DecodeHintType.TRY_HARDER,true]])).getText();}catch(e){return '✗'+e.constructor.name;}};

console.log('\n[集成] 软件画布上的 2D 码可被扫描');
const gq=await grab(0);
const j=jsQR(new Uint8ClampedArray(gq.data),gq.W,gq.W);
ok('QR（中文, H级）jsQR 扫出原文',j&&Buffer.from(j.binaryData).toString('utf8')===QR_TXT);
ok('QR（中文, H级）ZXing 扫出原文',zx(new Z.QRCodeReader(),gq)===QR_TXT);
const gd=await grab(1);
ok('DataMatrix ZXing 扫出原文',zx(new Z.DataMatrixReader(),gd)===DM_TXT,zx(new Z.DataMatrixReader(),gd));

console.log('\n[离线] 不再依赖外网');
ok('页面无任何外部网络请求',ext.length===0,ext.join(' '));
ok('无「需联网」降级提示',await p.evaluate(()=>!document.body.innerText.includes('需联网')));

console.log('\n[ZPL] 2D 码指令');
const z=await p.evaluate(()=>buildZPL());
ok('QR 以位图输出（与预览同一编码器，不依赖打印机 ^BQ）',!/\^BQN/.test(z)&&/\^GFA/.test(z));
ok('DataMatrix 以位图输出（不依赖打印机 ^BX）',!/\^BXN/.test(z));
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 2D 集成自检：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
