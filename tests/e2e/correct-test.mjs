// 里程碑 1（打印输出正确性 A1–A12）在界面上的回归测试：每项对应 docs/print-test-research.md 的 A 组条目
import { S, OUT, ROOT, APP, ZR } from './_lib.mjs';
import { execFileSync } from 'node:child_process';
import pw from 'playwright';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { decodeBits, makeZip }=require('../helpers.cjs');
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1300,height:900}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForSelector('#preview .label');
const alerts=[];p.on('dialog',d=>{alerts.push(d.message());d.accept();});
const design=(els,csv)=>p.evaluate(([els,csv])=>{loadDesign({v:1,label:{w:60,h:40,dpi:203,cols:0,gapX:3,gapY:3},elements:els});
  document.querySelector('#rFrom').value=1;document.querySelector('#rTo').value=0;document.querySelector('#copies').value=1;
  document.querySelector('#csv').value=csv||'';if(csv)document.querySelector('#applyCsv').click();else{rows=null;render();}},[els,csv]);
const labelText=i=>p.evaluate(i=>document.querySelectorAll('#preview .label')[i].innerText,i);
// 打开预检弹窗的操作：返回弹窗内容，并按 choice（cancel/skip/go）关闭
async function withPreflight(fnName,choice){
  return p.evaluate(async([fnName,choice])=>{window.__dl=null;
    const keep=URL.createObjectURL;URL.createObjectURL=blob=>{window.__dl=blob;return keep.call(URL,blob);};
    const run=window[fnName]();await new Promise(r=>setTimeout(r,150));
    const shown=document.querySelector('#pfDlg').style.display!=='none',body=document.querySelector('#pfDlgBody').innerText;
    if(shown)document.querySelector(choice==='skip'?'#pfSkip':choice==='go'?'#pfGo':'#pfCancel').click();
    await run;URL.createObjectURL=keep;
    return {shown,body,zpl:window.__dl?await window.__dl.text():null};},[fnName,choice]);
}

console.log('\n[A1 中文 / 带空格 / 带表名的字段插值]');
await design([{type:'text',x:2,y:2,size:3,content:'品名：{品名} 价:{unit price} 码:{goods.SKU} 小写:{sku}'}],'品名,unit price,SKU\n女包,99,A1');
ok('{品名}{unit price}{表.字段}{大小写不同} 都取到值',(await labelText(0)).includes('品名：女包 价:99 码:A1 小写:A1'),await labelText(0));

console.log('\n[A2 EAN-13 校验位 / 非数字]');
await design([{type:'ean13',x:5,y:5,h:10,module:0.33,showText:true,content:'{EAN}'}],'EAN\n6925253841665\n6925253841660\n69252538416A5');
const eanState=await p.evaluate(()=>[...document.querySelectorAll('#preview .label')].map(l=>{const e=l.querySelector('.el');return {err:e.classList.contains('errel'),t:e.innerText};}));
ok('正确校验位正常生成',!eanState[0].err&&!/⚠/.test(eanState[0].t),JSON.stringify(eanState[0]));
ok('错校验位报错并给出应为几',eanState[1].err&&/校验位/.test(eanState[1].t),JSON.stringify(eanState[1]));
ok('含字母报错（不再悄悄删掉）',eanState[2].err,JSON.stringify(eanState[2]));

console.log('\n[A3/A4 打印前预检：出错标签被拦下，可跳过]');
let r=await withPreflight('exportZPL','cancel');
ok('导出 ZPL 前弹出预检',r.shown);
ok('逐条列出出错的第 2、3 张及原因',/校验位错误[^\n]*应为 5[^\n]*第 2 张/.test(r.body)&&/只能包含数字[^\n]*第 3 张/.test(r.body)&&!/第 1 张/.test(r.body),r.body);
ok('取消则不导出',r.zpl===null);
r=await withPreflight('exportZPL','skip');
ok('跳过出错的标签后只导出 1 张',r.zpl&&(r.zpl.match(/\^XA/g)||[]).length===1,r.zpl&&r.zpl.slice(0,200));
ok('导出后不再残留跳过状态',await p.evaluate(()=>printSkip===null&&document.querySelectorAll('#preview .label').length===3));
const pr=await p.evaluate(async()=>{let printed=0;const keep=window.print;window.print=()=>{printed=document.querySelectorAll('#preview .label').length;};
  const run=doPrint();await new Promise(r=>setTimeout(r,150));document.querySelector('#pfSkip').click();await run;
  window.dispatchEvent(new Event('beforeprint'));printed=document.querySelectorAll('#preview .label').length;
  const errShown=document.querySelectorAll('#preview .el.errel').length;window.dispatchEvent(new Event('afterprint'));window.print=keep;
  return {printed,errShown,after:document.querySelectorAll('#preview .label').length};});
ok('浏览器打印：跳过后只出 1 张，且没有「⚠」错误标签',pr.printed===1&&pr.errShown===0,JSON.stringify(pr));
ok('打印结束恢复全部预览',pr.after===3,JSON.stringify(pr));
ok('错误提示在打印样式中隐藏',await p.evaluate(()=>[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.media&&/print/.test(r.media.mediaText)&&/errel[^}]*visibility:\s*hidden/.test(r.cssText));}catch(e){return false;}})));

console.log('\n[A5 字段名写错有明确提示]');
await design([{type:'text',x:2,y:2,size:3,content:'{品明}'},{type:'text',x:2,y:10,size:3,content:'{品名}'}],'品名\n女包');
const miss=await p.evaluate(()=>{const els=document.querySelectorAll('#preview .label .el');return {cls:els[0].className,title:els[0].title,ok2:els[1].classList.contains('warnel')};});
ok('预览里标出找不到的字段',/warnel/.test(miss.cls)&&/品明/.test(miss.title)&&!miss.ok2,JSON.stringify(miss));
r=await withPreflight('exportZPL','cancel');
ok('预检报「找不到字段：品明」',r.shown&&/找不到字段[^\n]*品明/.test(r.body),r.body);
ok('设计变量 {变量名} 不算缺失',await p.evaluate(()=>{vars=[{name:'批次',kind:'text',def:'P9'}];
  elements[0].content='{批次}';render();const e=document.querySelector('#preview .label .el');return !e.classList.contains('warnel')&&e.innerText==='P9';}));
await p.evaluate(()=>{vars=[];});

console.log('\n[A7 GBK / UTF-8 BOM 的 CSV，A8 引号内换行，E14 .xlsx]');
fs.writeFileSync(S+'gbk.csv',Buffer.from('c6b7c3fb2cbcdbb8f10d0ac5aeb0fc2c3939','hex'));   // GBK「品名,价格\r\n女包,99」
fs.writeFileSync(S+'bom.csv',Buffer.from('﻿品名,价格\n"多行\n品名",5','utf8'));
fs.writeFileSync(S+'d.xlsx',makeZip({'xl/workbook.xml':'<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml':'<sst><si><t>品名</t></si><si><t>价格</t></si><si><t>围巾</t></si></sst>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>12.5</v></c></row></sheetData></worksheet>'}));
await design([{type:'para',x:2,y:2,size:3,w:50,content:'{品名}/{价格}'}]);
const load=async f=>{await p.setInputFiles('#fileIn',S+f);await p.waitForFunction(()=>rows&&rows.length);await p.waitForTimeout(100);
  return p.evaluate(()=>({n:rows.length,first:rows[0]}));};
let d=await load('gbk.csv');ok('GBK CSV 中文正确',d.n===1&&d.first['品名']==='女包'&&d.first['价格']==='99',JSON.stringify(d));
await p.evaluate(()=>{rows=null;});d=await load('bom.csv');ok('UTF-8 BOM + 引号内换行 = 1 条记录',d.n===1&&d.first['品名']==='多行\n品名'&&d.first['价格']==='5',JSON.stringify(d));
await p.evaluate(()=>{rows=null;});d=await load('d.xlsx');ok('.xlsx 直接导入',d.n===1&&d.first['品名']==='围巾'&&String(d.first['价格'])==='12.5',JSON.stringify(d));
ok('分号分隔',await p.evaluate(()=>{const r=parseData('a;b\n1;2');return r&&r[0].b==='2';}));

console.log('\n[A9 DataMatrix 中文：界面导出的 ZPL 点阵用 zxing-cpp 读回原文]');
await design([{type:'datamatrix',x:5,y:5,size:16,content:'合格证 批号B26'}]);
const zu=await p.evaluate(async()=>{document.querySelector('#zplComp').value='acs';const keep=window.acsEncode;window.acsEncode=h=>h;
  const z=await buildZPL();window.acsEncode=keep;return z;});
const m=zu.match(/\^GFA,(\d+),\d+,(\d+),([0-9A-F]+)/);
if(!m)ok('ZPL 里有 DataMatrix 位图',false,zu.slice(0,300));
else{const total=+m[1],bpr=+m[2],hex=m[3],rowsN=total/bpr;
  const got=await decodeBits(bpr*8,rowsN,(x,y)=>(parseInt(hex.substr((y*bpr+(x>>3))*2,2),16)>>(7-(x&7)))&1);
  ok('读回「合格证 批号B26」',got.some(g=>g.text==='合格证 批号B26'),JSON.stringify(got));}

console.log('\n[E2 变量：{#SN} {#N} {#DATE+30} 在预览与 ZPL 一致]');
await design([{type:'counter',x:40,y:30,size:3,start:7,step:1,pad:4,prefix:'',suffix:''},
  {type:'text',x:2,y:2,size:3,content:'{#SN}/{#N}/{#REC}/{#COPY} 到期{#DATE+30:YYYYMMDD}'},
  {type:'qrcode',x:5,y:10,size:16,ecl:'M',content:'SN{#SN}'}],'N\n1\n2');
await p.evaluate(()=>{document.querySelector('#copies').value=2;render();});
const exp=await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+30);return TextData.fmtDate(d,'YYYYMMDD');});
ok('第 3 张：流水号 0009、第 3 张、第 2 条第 1 份、到期 +30 天',(await labelText(2)).includes('0009/3/2/1 到期'+exp),await labelText(2));
const zs=await p.evaluate(async()=>{document.querySelector('#zplComp').value='acs';const keep=window.acsEncode;window.acsEncode=h=>h;
  const z=await buildZPL();window.acsEncode=keep;return z.split('^XZ').filter(x=>x.includes('^XA'));});
const qrOf=async lab=>{const big=[...lab.matchAll(/\^GFA,(\d+),\d+,(\d+),([0-9A-F]+)/g)].sort((a,b)=>b[1]-a[1])[0];
  const total=+big[1],bpr=+big[2],hex=big[3];
  return decodeBits(bpr*8,total/bpr,(x,y)=>(parseInt(hex.substr((y*bpr+(x>>3))*2,2),16)>>(7-(x&7)))&1);};
const q3=await qrOf(zs[2]);ok('ZPL 第 3 张的二维码读回 SN0009',zs.length===4&&q3.some(g=>g.text==='SN0009'),zs.length+' '+JSON.stringify(q3));
await p.evaluate(()=>{document.querySelector('#copies').value=1;render();});

console.log('\n[B4 实心椭圆在 ZPL 里是实心的（独立渲染器 Zebrash 出纸）]');
await design([{type:'ellipse',x:10,y:5,w:30,h:20,border:0.3,fill:true},{type:'ellipse',x:45,y:25,w:10,h:10,border:0.3,fill:false}]);
const ez=await p.evaluate(()=>buildZPL());
const ge=[...ez.matchAll(/\^GE(\d+),(\d+),(\d+)/g)].map(m=>m.slice(1).map(Number));
ok('实心椭圆输出为位图，空心椭圆仍用原生 ^GE 边框',ge.length===1&&ge[0][2]<4&&/\^FO\d+,\d+\^GFA/.test(ez),JSON.stringify(ge));
fs.writeFileSync(OUT+'ellipse.zpl',ez);
execFileSync('node',[ZR,OUT+'ellipse.zpl',OUT+'ellipse','60','40','8'],{stdio:'pipe'});
const px=await p.evaluate(async src=>{   // Zebrash 不支持 ^GE，只核对位图输出的实心椭圆
const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
  const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
  const at=(x,y)=>g.getImageData(x,y,1,1).data[0];return {center:at(25*8,15*8),inside:at(14*8,15*8),outside:at(11*8,6*8)};},'data:image/png;base64,'+fs.readFileSync(OUT+'ellipse-0.png').toString('base64'));
ok('出纸图：实心椭圆中心与内部是黑的、外接框角落是白的',px.center<128&&px.inside<128&&px.outside>128,JSON.stringify(px));

console.log('\n[A10 打印范围填反]');
await design([{type:'text',x:2,y:2,size:3,content:'{N}'}],'N\n1\n2\n3\n4\n5');
await p.evaluate(()=>{document.querySelector('#rFrom').value=5;document.querySelector('#rTo').value=3;render();});
ok('提示范围有误',/范围有误/.test(await p.evaluate(()=>document.querySelector('#pager').textContent)));
alerts.length=0;
const rv=await p.evaluate(async()=>{let printed=false;const keep=window.print;window.print=()=>{printed=true;};await doPrint();window.print=keep;
  window.dispatchEvent(new Event('beforeprint'));const n=document.querySelectorAll('#preview .label').length;window.dispatchEvent(new Event('afterprint'));
  return {printed,n};});
ok('不调用打印、打印样式下 0 张（不再悄悄打第 1 条）',!rv.printed&&rv.n===0&&alerts.some(a=>/范围有误/.test(a)),JSON.stringify(rv)+alerts.join('|'));
ok('ZPL 也拒绝',await p.evaluate(async()=>{try{await buildZPL();return false;}catch(e){return /范围有误/.test(e.message);}}));
await p.evaluate(()=>{document.querySelector('#rFrom').value=1;document.querySelector('#rTo').value=0;render();});

console.log('\n[A11 向导字段名转义]');
const xss=await p.evaluate(async()=>{window.__xss=0;document.querySelector('#csv').value='<img src=x onerror=window.__xss=1>,b\n1,2';
  wzOpen();WZ.type='text';document.querySelector('#wzNext').click();const s=document.querySelector('#wzsrc');s.value='field';s.onchange();
  await new Promise(r=>setTimeout(r,200));const o=document.querySelector('#wzf option');const res={xss:window.__xss,img:!!document.querySelector('#wzbody img'),val:o&&o.value};wzClose();return res;});
ok('恶意表头不执行、原样作为字段名',xss.xss===0&&!xss.img&&xss.val==='<img src=x onerror=window.__xss=1>',JSON.stringify(xss));

console.log('\n[A12 换图片进撤消历史并自动保存]');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
fs.writeFileSync(S+'a.png',png);
await design([{type:'image',x:2,y:2,w:10,h:10,src:''}]);
await p.evaluate(()=>{sel=0;renderEditor();});
await p.setInputFiles('#elist input[type=file][data-img]',S+'a.png');
await p.waitForFunction(()=>elements[0].src);
await p.waitForTimeout(200);
const im=await p.evaluate(()=>{const saved=(localStorage.getItem('label.autosave')||'').includes('data:image/png');undo();return {saved,after:elements[0].src};});
ok('自动保存里有新图片',im.saved);
ok('撤消恢复为换图前',im.after==='',JSON.stringify(im).slice(0,80));

console.log('\n==== 页面错误 ====',errors.length?errors:'无');if(errors.length)fail++;
console.log(`\n==== 正确性（A 组）：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
