// 打印效果可扫性：单个条码 → ZPL → Zebrash 渲染（模拟出纸）→ ZXing 扫描，内容必须一致
import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const Z=require('@zxing/library');
const BC=require('../../src/barcodes.js');
let zxM=null;async function zxcpp(){if(zxM)return zxM;const W=require('zxing-wasm/reader'),path=require('node:path');
  const wasm=path.join(path.dirname(require.resolve('zxing-wasm/reader')),'..','..','reader','zxing_reader.wasm');
  await W.prepareZXingModule({overrides:{wasmBinary:fs.readFileSync(wasm)},fireImmediately:true});return zxM=W;}
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage();
await p.goto(APP);await p.waitForSelector('#preview .label');

const CASES=[
  ['barcode','FZ075885L-01110','FZ075885L-01110',0.25],['barcode','合格证'.length?'SN-0001-ABC':'','SN-0001-ABC',0.2],
  ['ean13','6925253841665','6925253841665',0.33],['ean13','692525384166','6925253841665',0.26],
  ['ean8','1234567','12345670',0.33],['upca','03600029145','036000291452',0.33],
  ['code39','CODE39-A1','CODE39-A1',0.25],['itf','1234567890','1234567890',0.33],
  ['qrcode','合格证 FZ075885L-01110 558.00','合格证 FZ075885L-01110 558.00',14],['datamatrix','FZ075885L-01110','FZ075885L-01110',10],
  ['datamatrix','合格证 FZ-01 零售价','合格证 FZ-01 零售价',14],
  ['gs1128','(01)06925253841665(10)B26','01069252538416651' + '0B26',0.25],['upce','0123456','01234565',0.33],
  ['code93','CODE93-X','CODE93-X',0.25],['codabar','A123456B','A123456B',0.3],
  ['gs1dm','(01)06925253841665(17)271231(10)B26','01069252538416651727123110B26',12],
];
const readers={qrcode:()=>new Z.QRCodeReader(),datamatrix:()=>new Z.DataMatrixReader(),gs1dm:()=>new Z.DataMatrixReader()};
// 模拟扫码：裁出码区（含静区），转回正向后再扫；真实扫码枪各方向都能读
let expectOf=null;
function decode(png,type,rot){
  return p.evaluate(async([src,rot])=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const d=g.getImageData(0,0,im.width,im.height).data;let x0=1e9,y0=1e9,x1=-1,y1=-1;
    for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(d[(y*im.width+x)*4]<128){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
    const pad=Math.round(Math.max(x1-x0,y1-y0)*0.15)+8,sw=x1-x0+1+pad*2,sh=y1-y0+1+pad*2,R=((-rot%360)+360)%360,sw2=R%180?sh:sw,sh2=R%180?sw:sh;
    const o=document.createElement('canvas');o.width=sw2;o.height=sh2;const q=o.getContext('2d');q.fillStyle='#fff';q.fillRect(0,0,sw2,sh2);
    q.imageSmoothingEnabled=false;q.translate(sw2/2,sh2/2);q.rotate(R*Math.PI/180);q.drawImage(c,x0-pad,y0-pad,sw,sh,-sw/2,-sh/2,sw,sh);
    const od=q.getImageData(0,0,sw2,sh2).data;
    return {w:sw2,h:sh2,d:Array.from(od.filter((_,i)=>i%4===0))};},
    ['data:image/png;base64,'+fs.readFileSync(png).toString('base64'),rot]).then(async({w,h,d})=>{
    const lum=new Uint8ClampedArray(d);
    // zxing-cpp（zxing-wasm）：支持 ECI 字符集（中文 DataMatrix）等，作为第二个独立解码器
    const rgba=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=lum[i];rgba[i*4+3]=255;}
    const zr=await (await zxcpp()).readBarcodes({data:rgba,width:w,height:h,colorSpace:'srgb'},{tryHarder:true,tryRotate:true,textMode:'Plain'});
    const cppHit=zr.find(x=>x.isValid),cpp=cppHit?cppHit.text:null;
    if(cpp!=null&&expectOf===cpp)return cpp;
    // zxing-cpp 可能把 UPC-E 按展开后的 13 位（0 + UPC-A）给出；@zxing/library 没有 UPC-E 读码器
    if(type==='upce'&&cpp!=null&&cpp==='0'+BC.encode1D('upce',expectOf).upca)return expectOf;
    const F=Z.BarcodeFormat,fmt={barcode:F.CODE_128,gs1128:F.CODE_128,ean13:F.EAN_13,ean8:F.EAN_8,upca:F.UPC_A,upce:F.UPC_E,code39:F.CODE_39,code93:F.CODE_93,codabar:F.CODABAR,itf:F.ITF}[type];
    const hints=new Map([[Z.DecodeHintType.TRY_HARDER,true]]);if(readers[type])hints.set(Z.DecodeHintType.PURE_BARCODE,true);if(fmt!==undefined)hints.set(Z.DecodeHintType.POSSIBLE_FORMATS,[fmt]);
    const r=readers[type]?readers[type]():new Z.MultiFormatReader();
    const keep=[console.error,console.warn,console.log];console.error=console.warn=()=>{};
    const bmp=()=>new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum,w,h)));
    try{return r.decode(bmp(),hints).getText();}catch(e){
      if(cpp)return cpp;
      if(!readers[type])return '✗'+e.constructor.name;
      hints.delete(Z.DecodeHintType.PURE_BARCODE);   // 纯码模式在奇数点/模块时采样会落在边界上，改用定位器模式重试
      try{return r.decode(bmp(),hints).getText();}catch(e2){return '✗'+e.constructor.name+'/'+e2.constructor.name;}}
    finally{[console.error,console.warn]=keep;}
    });
}
for(const dpi of [203,300])for(const rot of [0,90,180]){
  console.log(`\n[${dpi}dpi 旋转${rot}°]`);
  for(const [type,content,expect,sz] of CASES){
    const el=type==='qrcode'||type==='datamatrix'||type==='gs1dm'?{type,x:10,y:10,size:sz,ecl:'M',rot,content}
      :{type,x:10,y:10,h:12,module:sz,showText:true,rot,content};
    if(rot===90)el.x=40;if(rot===180){el.x=75;el.y=40;}
    const zpl=await p.evaluate(async([el,dpi])=>{loadDesign({v:1,label:{w:90,h:60,dpi,cols:0,gapX:3,gapY:3},elements:[el]});
      document.querySelector('#csv').value='';rows=null;render();return buildZPL();},[el,dpi]);
    const tag=`scan-${dpi}-${rot}-${type}-${sz}`;fs.writeFileSync(S+`out/${tag}.zpl`,zpl);
    execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,'90','60',String(dpi===300?12:8)],{stdio:'pipe'});
    expectOf=expect;
    const got=await decode(S+`out/${tag}-0.png`,type,rot);
    const g=typeof got==='string'?got.replace(/\x1d/g,''):got;
    ok(`${type.padEnd(10)} 模块${String(sz).padEnd(4)} 打印后扫出`,g===expect,g===expect?g:`得到 ${JSON.stringify(got)}，应为 ${expect}`);
  }
}
console.log(`\n==== 打印效果可扫性：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
