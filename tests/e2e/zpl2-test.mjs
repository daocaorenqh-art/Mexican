import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1100}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');

// 生成一张测试 Logo（渐变 + 圆 + 字），模拟用户上传的图片
const logo=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=120;const g=c.getContext('2d');
  const gr=g.createLinearGradient(0,0,200,0);gr.addColorStop(0,'#000');gr.addColorStop(1,'#fff');g.fillStyle=gr;g.fillRect(0,0,200,120);
  g.fillStyle='#fff';g.beginPath();g.arc(60,60,40,0,7);g.fill();g.fillStyle='#000';g.font='bold 40px sans-serif';g.fillText('LOGO',95,75);return c.toDataURL();});
const DESIGN={v:1,label:{w:80,h:70,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:3,y:2,size:5,bold:true,content:'合格证'},                                                  // 0 静态 → 应被 ~DG 缓存
  {type:'para',x:3,y:10,w:32,size:3.2,align:'left',content:'面料：{M}。本产品执行国家标准，请按洗涤说明保养，避免暴晒和高温熨烫。'}, // 1 段落中文
  {type:'image',x:40,y:2,w:36,h:20,src:''},                                                              // 2 图片
  {type:'text',x:70,y:30,size:4,rot:90,content:'竖排 {N}'},                                               // 3 旋转90 文字
  {type:'barcode',x:40,y:30,h:10,module:0.3,showText:true,rot:90,content:'{N}'},                          // 4 旋转90 条码
  {type:'box',x:10,y:48,w:24,h:12,border:0.6,rot:30},                                                     // 5 旋转30 方框
  {type:'qrcode',x:50,y:48,size:14,ecl:'M',rot:180,content:'QR-{N}'},                                    // 6 旋转180 二维码
  {type:'ean13',x:3,y:36,h:8,module:0.33,showText:true,content:'6925253841665'},                         // 7 未旋转 → 原生 ^BE
]};
DESIGN.elements[2].src=logo;
await p.evaluate(d=>{loadDesign(d);document.querySelector('#csv').value='N,M\nA001,棉100%\nB002,真丝';document.querySelector('#applyCsv').click();},DESIGN);
await p.waitForTimeout(300);

console.log('\n[段落预览与打印同一换行]');
const paraLines=await p.evaluate(()=>document.querySelector('#preview .label .el[data-ei="1"]').textContent.split('\n'));
ok('段落按 32mm 宽自动换成多行',paraLines.length>=3,paraLines.length+' 行：'+paraLines.join(' | '));
const paraFit=await p.evaluate(()=>{const n=document.querySelector('#preview .label .el[data-ei="1"]');
  const sp=document.createElement('span');sp.style.cssText=getComputedStyle(n).cssText;sp.style.position='absolute';sp.style.visibility='hidden';sp.style.whiteSpace='pre';
  const font=getComputedStyle(n).font;const c=document.createElement('canvas').getContext('2d');c.font=font;
  return Math.max(...n.textContent.split('\n').map(l=>c.measureText(l).width))/3.78;});
ok('每行实际宽度不超过 32mm',paraFit<=32.05,paraFit.toFixed(2)+'mm');

const zpl=await p.evaluate(()=>{document.querySelector('#zplComp').value='acs';return buildZPL();});
const fs=await import('node:fs');fs.writeFileSync(OUT+'rot.zpl',zpl);

console.log('\n[ZPL 结构]');
ok('2 条记录 → 2 个 ^XA/^XZ',(zpl.match(/\^XA/g)||[]).length===2&&(zpl.match(/\^XZ/g)||[]).length===2);
ok('段落不再用打印机英文字体 ^A0/^FB',!/\^A0N/.test(zpl)&&!/\^FB/.test(zpl));
ok('条码一律位图输出（无原生 ^BE）',!/\^BEN,/.test(zpl));
ok('旋转的条码/二维码改为位图（无原生 ^BC/^BQ）',!/\^BCN/.test(zpl)&&!/\^BQN/.test(zpl));
const dg=(zpl.match(/~DGR:G\d{3}\.GRF/g)||[]).length;
const xg=(zpl.match(/\^XGR:G\d{3}\.GRF/g)||[]).length;
ok('静态内容（标题/Logo/方框）存一次 ~DG，各张 ^XG 调用',dg>=3&&xg===dg*2,'~DG='+dg+' ^XG='+xg);
const ACS=`function acsDec(s,bpr){const L=bpr*2,rows=[];let row='',n=0;
  for(const ch of s){if(ch>='G'&&ch<='Y'){n+=ch.charCodeAt(0)-70;continue;}if(ch>='g'&&ch<='z'){n+=(ch.charCodeAt(0)-102)*20;continue;}
    if(ch===','){rows.push(row.padEnd(L,'0'));row='';continue;}if(ch==='!'){rows.push(row.padEnd(L,'F'));row='';continue;}
    if(ch===':'){rows.push(rows[rows.length-1]);continue;}row+=ch.repeat(n||1);n=0;while(row.length>=L){rows.push(row.slice(0,L));row=row.slice(L);}}
  return rows.join('');}`;
const acsDec=new Function(ACS+';return acsDec;')();
const allGF=[...zpl.matchAll(/(?:\^GFA,(\d+),\d+,(\d+),|~DGR:G\d{3}\.GRF,(\d+),(\d+),)([0-9A-Za-z,!:]+)/g)];
ok('所有位图解压后字节数自洽',allGF.every(m=>acsDec(m[5],+(m[2]||m[4])).length===2*(+(m[1]||m[3]))),allGF.length+' 块');

// 逐元素位置比对见 zebrash-pos.mjs（用独立 Zebrash 引擎，按元素单独出图，更可靠）
console.log('\n[图片抖动]');
const dith=await p.evaluate(async([zpl,ACS])=>{const acsDec=new Function(ACS+';return acsDec;')();
  const nm=(zpl.match(/\^FO320,16\^XG(R:G\d{3}\.GRF)/)||[])[1];
  const m=[...zpl.matchAll(/~DG(R:G\d{3}\.GRF),(\d+),(\d+),([0-9A-Za-z,!:]+)/g)].find(x=>x[1]===nm);if(!m)return null;
  const bpr=+m[3],hex=acsDec(m[4],bpr),rows=hex.length/2/bpr,W=bpr*8;
  // 源图按同样的等比居中画到同尺寸画布，求每个横向四分区的平均「黑度」
  const src=elements[2].src,im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
  const c=document.createElement('canvas');c.width=W;c.height=rows;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,rows);
  const D=36*203/25.4,H=20*203/25.4,r=Math.min(D/im.width,H/im.height);g.drawImage(im,(D-im.width*r)/2,(H-im.height*r)/2,im.width*r,im.height*r);
  const px=g.getImageData(0,0,W,rows).data,res=[];
  for(let q=0;q<4;q++){let dark=0,ink=0,n=0;const x0=Math.floor(q*D/4),x1=Math.floor((q+1)*D/4);
    for(let y=0;y<rows;y++)for(let x=x0;x<x1;x++){const i=y*W+x;dark+=1-px[i*4]/255;n++;
      const v=parseInt(hex.substr((y*bpr+(x>>3))*2,2),16);if(v&(1<<(7-(x&7))))ink++;}
    res.push([+(dark/n).toFixed(3),+(ink/n).toFixed(3)]);}
  return res;},[zpl,ACS]);
ok('抖动后各区黑点比例 ≈ 源图灰度（误差 < 0.05）',dith&&dith.every(([a,b])=>Math.abs(a-b)<0.05),JSON.stringify(dith));

console.log('\n[性能：大批量]');
const perf=await p.evaluate(async()=>{const r=['N,M'];for(let i=0;i<1000;i++)r.push('X'+i+',棉');
  document.querySelector('#csv').value=r.join('\n');document.querySelector('#applyCsv').click();
  const t=performance.now();const z=await buildZPL();return {ms:Math.round(performance.now()-t),kb:Math.round(z.length/1024),
    xa:(z.match(/\^XA/g)||[]).length,dg:(z.match(/~DG/g)||[]).length};});
ok('1000 张生成正常',perf.xa===1000,perf.ms+'ms, '+perf.kb+'KB');
ok('静态图只存一次：1000 张时 ~DG 仍是个位数（不随张数增长）',perf.dg<=dg+2,'2张时 '+dg+'，1000张时 '+perf.dg+'（段落在1000张里内容相同，也被缓存）');
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
await p.evaluate(()=>{document.querySelector('#csv').value='N,M\nA001,棉100%';document.querySelector('#applyCsv').click();});
await p.locator('#preview .label').first().screenshot({path:OUT+'zpl-preview.png'});
console.log(`\n==== ZPL 栅格化：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
