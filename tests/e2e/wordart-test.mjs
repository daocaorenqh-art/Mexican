// 艺术字：预览画布 vs 斑马渲染器(Zebrash) 逐像素比对 + 弧形方向 + 界面
import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';import { execFileSync } from 'node:child_process';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
const DPM=12;
// 取元素在预览里的黑点图（按 12 点/mm 重采样）与 ZPL 打印出来的黑点图，算重合度 IoU
async function compare(el,tag){
  const zpl=await p.evaluate(async el=>{loadDesign({v:1,label:{w:80,h:40,dpi:300,cols:0,gapX:3,gapY:3},elements:[el]});
    document.querySelector('#csv').value='';rows=null;render();document.querySelector('#zplComp').value='z64';return buildZPL();},el);
  fs.writeFileSync(S+`out/${tag}.zpl`,zpl);
  execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,'80','40','12'],{stdio:'pipe'});
  const png='data:image/png;base64,'+fs.readFileSync(S+`out/${tag}-0.png`).toString('base64');
  return p.evaluate(async([png,DPM])=>{
    const L=wordartLayout(elements[0],elements[0].content),W=Math.round(L.w*DPM),H=Math.round(L.h*DPM),x0=Math.round(elements[0].x*DPM),y0=Math.round(elements[0].y*DPM);
    const pv=document.querySelector('#preview .el canvas');
    const a=document.createElement('canvas');a.width=W;a.height=H;const ga=a.getContext('2d');ga.fillStyle='#fff';ga.fillRect(0,0,W,H);ga.drawImage(pv,0,0,W,H);
    const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=png;});
    const z=document.createElement('canvas');z.width=W;z.height=H;const gz=z.getContext('2d');gz.drawImage(im,-x0,-y0);
    const da=ga.getImageData(0,0,W,H).data,dz=gz.getImageData(0,0,W,H).data;let inter=0,uni=0,na=0,nz=0;
    const colsA=[],rowsOf=[];
    for(let i=0;i<W*H;i++){const A=da[i*4]<128,Z=dz[i*4]<128;if(A)na++;if(Z)nz++;if(A&&Z)inter++;if(A||Z)uni++;}
    // 列方向重心：左 20% / 中 20% / 右 20% 的黑点平均 y
    const band=(f0,f1)=>{let sy=0,n=0;for(let y=0;y<H;y++)for(let x=Math.floor(W*f0);x<Math.floor(W*f1);x++)if(dz[(y*W+x)*4]<128){sy+=y;n++;}return n?sy/n:0;};
    // 打印图中元素外是否有黑点（越界）
    const all=document.createElement('canvas');all.width=im.width;all.height=im.height;const gl=all.getContext('2d');gl.drawImage(im,0,0);
    const dd=gl.getImageData(0,0,im.width,im.height).data;let out=0;
    for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(dd[(y*im.width+x)*4]<128&&(x<x0-2||x>x0+W+2||y<y0-2||y>y0+H+2))out++;
    return {iou:inter/Math.max(1,uni),na,nz,left:band(0,0.2),mid:band(0.4,0.6),right:band(0.8,1),out,W,H};
  },[png,DPM]);
}
const base={type:'wordart',x:5,y:5,size:6,bold:true,font:'',spacing:0.3,stroke:0,shadow:0,hollow:false,rot:0,content:'合格证 QUALITY'};
console.log('\n[预览 = 打印（Zebrash 300dpi 逐像素）]');
const res={};
for(const [shape,bend] of [['平直',0],['上拱',60],['下弯',60],['波浪',70]])
  for(const sty of ['实心','空心','阴影','描边']){
    const el={...base,shape,bend,hollow:sty==='空心',shadow:sty==='阴影'?0.5:0,stroke:sty==='描边'?0.3:0};
    const r=await compare(el,`wa-${shape}-${sty}`);res[shape+sty]=r;
    ok(`${shape.padEnd(2)} ${sty} 预览与打印重合`,r.iou>0.8&&r.nz>200&&r.out===0,`IoU=${r.iou.toFixed(3)} 黑点 ${r.na}/${r.nz} 越界 ${r.out}`);
  }
console.log('\n[弧形方向]');
const dirOf=async(shape,bend)=>compare({...base,shape,bend,content:'HHHHHHHHHHHH'},'wa-dir-'+shape);
const up=await dirOf('上拱',60),dn=await dirOf('下弯',60),fl=await dirOf('平直',0);
ok('上拱：两端低、中间高',up.left>up.mid+3&&up.right>up.mid+3,JSON.stringify([up.left,up.mid,up.right].map(v=>+v.toFixed(1))));
ok('下弯：两端高、中间低',dn.left<dn.mid-3&&dn.right<dn.mid-3,JSON.stringify([dn.left,dn.mid,dn.right].map(v=>+v.toFixed(1))));
ok('平直：高度一致',Math.abs(fl.left-fl.right)<3,JSON.stringify([fl.left,fl.mid,fl.right].map(v=>+v.toFixed(1))));
const so=res['上拱实心'];
ok('空心字：字内留白（黑点明显少于实心）',res['上拱空心'].nz<so.nz*0.8,res['上拱空心'].nz+' vs '+so.nz);
ok('阴影增加黑点',res['上拱阴影'].nz>so.nz*1.1,res['上拱阴影'].nz+' vs '+so.nz);
ok('描边加粗',res['上拱描边'].nz>so.nz*1.05,res['上拱描边'].nz+' vs '+so.nz);

console.log('\n[旋转 90°]');
const r90=await p.evaluate(async el=>{loadDesign({v:1,label:{w:80,h:40,dpi:300,cols:0,gapX:3,gapY:3},elements:[el]});return buildZPL();},{...base,shape:'上拱',bend:50,x:30,y:2,rot:90,content:'ROT'});
fs.writeFileSync(S+'out/wa-rot.zpl',r90);execFileSync('node',[ZR,S+'out/wa-rot.zpl',S+'out/wa-rot','80','40','12'],{stdio:'pipe'});
const bb=await p.evaluate(async png=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=png;});
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
  const d=g.getImageData(0,0,c.width,c.height).data;let x0=1e9,y0=1e9,x1=-1,y1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4]<128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const lab=document.querySelector('#preview .label').getBoundingClientRect(),cv=document.querySelector('#preview .el canvas').getBoundingClientRect();
  const k=12/3.78;return {print:[x0,y0,x1,y1],prev:[(cv.left-lab.left)*k,(cv.top-lab.top)*k,(cv.right-lab.left)*k,(cv.bottom-lab.top)*k].map(Math.round)};},
  'data:image/png;base64,'+fs.readFileSync(S+'out/wa-rot-0.png').toString('base64'));
ok('旋转后打印位置落在预览框内',bb.print[0]>=bb.prev[0]-3&&bb.print[2]<=bb.prev[2]+3&&bb.print[1]>=bb.prev[1]-3&&bb.print[3]<=bb.prev[3]+3,JSON.stringify(bb));

console.log('\n[界面]');
await p.evaluate(()=>{loadDesign({v:1,label:{w:60,h:30,dpi:203,cols:0,gapX:3,gapY:3},elements:[]});});
await p.click('[data-add="wordart"]');
ok('「+ 艺术字」添加元素',await p.evaluate(()=>elements.length===1&&elements[0].type==='wordart'&&!!document.querySelector('#preview .el canvas')));
ok('属性面板有形状/弯曲度/描边/阴影/空心',await p.evaluate(()=>['shape','bend','stroke','shadow','hollow','spacing'].every(k=>document.querySelector(`#elist [data-k="${k}"]`))));
const h0=await p.evaluate(()=>document.querySelector('#preview .el canvas').getBoundingClientRect().height);
await p.evaluate(()=>{const s=document.querySelector('#elist [data-k="bend"]');s.value='100';s.dispatchEvent(new Event('input',{bubbles:true}));});
const h1=await p.evaluate(()=>document.querySelector('#preview .el canvas').getBoundingClientRect().height);
ok('弯曲度加大 → 预览高度变大',h1>h0+5,h0.toFixed(1)+'→'+h1.toFixed(1));
await p.evaluate(()=>{elements[0].content='{品名}';document.querySelector('#csv').value='品名\n衬衫\n长裤';document.querySelector('#applyCsv').click();});
ok('艺术字支持 {字段} 套打（2 张）',await p.evaluate(()=>document.querySelectorAll('#preview .label canvas').length===2));
ok('菜单「插入 → 艺术字」与向导都有',await p.evaluate(()=>!!document.querySelector('[data-ins="wordart"]')&&WZTYPES.some(t=>t[0]==='wordart')));
await p.evaluate(()=>{loadDesign({v:1,label:{w:70,h:45,dpi:300,cols:0,gapX:3,gapY:3},elements:[
  {...DEFAULTS.wordart,x:3,y:2,content:'优质产品 QUALITY',bend:55,shadow:0.4},
  {...DEFAULTS.wordart,x:3,y:20,shape:'波浪',bend:70,hollow:true,stroke:0.25,content:'WAVE 波浪字'},
  {...DEFAULTS.wordart,x:3,y:32,shape:'下弯',bend:40,size:4,content:'下弯 SMILE'}]});document.querySelector('#csv').value='';rows=null;render();});
await p.evaluate(()=>{document.querySelector('#zoom').value=200;document.querySelector('#zoom').oninput();});
await p.locator('#preview .label').first().screenshot({path:S+'out/wordart-preview.png'});
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 艺术字：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
