// 移植自另一开发线的界面功能（docs/integration.md）逐项验收
import { S, APP, ZR } from './_lib.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import pw from 'playwright';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { makeZip, decodeBits }=require('../helpers.cjs');
const ZPLmod=require('../../src/zpl.js');
const { chromium } = pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForSelector('#preview .label');

console.log('\n[1] 向导字段名转义 / 换图片可撤消');
const xss=await p.evaluate(async()=>{document.querySelector('#csv').value='<img src=x onerror=window.__x=1>,b\n1,2';
  wzOpen();WZ.step=1;wzRender();document.querySelector('#wzsrc').value='field';document.querySelector('#wzsrc').onchange();
  await new Promise(r=>setTimeout(r,100));const o=document.querySelector('#wzf option');const r={x:window.__x,text:o.textContent,imgs:document.querySelectorAll('#wzval img').length};wzClose();return r;});
ok('CSV 表头里的 HTML 不被执行、按原文显示',!xss.x&&xss.imgs===0&&xss.text==='<img src=x onerror=window.__x=1>',JSON.stringify(xss));
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'image',x:1,y:1,w:10,h:10,src:''}]});});
await p.setInputFiles('#elist input[type=file]',{name:'a.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')});
await p.waitForTimeout(200);
const und=await p.evaluate(()=>{const had=!!elements[0].src;undo();return {had,after:!!elements[0].src};});
ok('换图片后可撤消',und.had&&!und.after,JSON.stringify(und));

console.log('\n[14] 载入设计文件校验');
const v=await p.evaluate(()=>{let msg='';window.alert=m=>msg=m;
  loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[
    {type:'nosuch',x:1},{type:'image',x:'2',y:2,w:5,h:5,src:'http://evil.example/a.png'},
    {type:'barcode',x:'3.5',y:1,h:'8',module:0.3,content:123,color:'red" onmouseover="window.__y=1',showText:'1'},
    {type:'text',x:1,y:1,size:3,content:'ok',bold:0}],
    vars:[{name:'批号',kind:'evil',options:'x'},{nope:1},null]});
  const html=document.querySelector('#elist').innerHTML;
  return {msg,n:elements.length,types:elements.map(e=>e.type),img:elements[0].src,x:elements[1].x,h:elements[1].h,content:elements[1].content,
    color:elements[1].color,show:elements[1].showText,bold:elements[2].bold,vars:JSON.parse(JSON.stringify(vars)),inj:html.includes('onmouseover'),y:window.__y};});
ok('未知类型剔除并提示',v.n===3&&v.msg.includes('nosuch'),JSON.stringify(v.types)+' '+v.msg);
ok('外部图片地址拒绝',v.img===''&&v.msg.includes('外部图片'),v.msg);
ok('数值字段转数字、布尔字段转布尔',v.x===3.5&&v.h===8&&v.show===true&&v.bold===false,JSON.stringify([v.x,v.h,v.show,v.bold]));
ok('内容转文本',v.content==='123');
ok('非法颜色值改回默认，编辑器里不出现注入属性',v.color==='#000000'&&!v.inj&&!v.y,v.color);
ok('变量定义只保留合法项',v.vars.length===1&&v.vars[0].kind==='text'&&Array.isArray(v.vars[0].options)&&v.vars[0].options.length===0,JSON.stringify(v.vars));
const bad=await p.evaluate(()=>{try{localStorage.setItem('label.autosave',JSON.stringify({e:[{type:'zzz'},{type:'text',x:'1',y:1,size:3,content:'恢复'}],v:[{name:'a',kind:'pick',options:['1','2']}],l:{lw:40,lh:20,dpi:'203',cols:0,gapX:3,gapY:3}}));}catch(e){}return 1;});
await p.reload();await p.waitForSelector('#preview .label');
const rs=await p.evaluate(()=>({n:elements.length,x:elements[0]&&elements[0].x,v:vars.length&&vars[0].kind}));
ok('自动保存恢复时同样校验',rs.n===1&&rs.x===1&&rs.v==='pick',JSON.stringify(rs));

console.log('\n[2/3] 编码器模块：校验位检查、新条码类型');
const enc=await p.evaluate(()=>{loadDesign({v:1,label:{w:60,h:40,dpi:203},elements:[
    {type:'ean13',x:2,y:2,h:10,module:0.33,showText:true,content:'6925253841660'},
    {type:'ean13',x:2,y:20,h:10,module:0.33,showText:true,content:'6925253841665'}]});
  const n=[...document.querySelectorAll('#preview .label:first-child .el')];
  return {bad:n[0].textContent,good:!!n[1].querySelector('svg')};});
ok('EAN-13 校验位填错 → 报错而不是照样生成',enc.bad.includes('校验位'),enc.bad);
ok('校验位正确 → 正常生成',enc.good);
for(const t of ['gs1128','upce','code93','codabar','gs1dm']){
  const r=await p.evaluate(t=>{document.querySelector(`[data-add="${t}"]`).click();const i=elements.length-1;
    const node=document.querySelector(`#preview .el[data-ei="${i}"]`);return {svg:!!(node&&node.querySelector('svg')),err:node&&node.textContent.includes('⚠'),
      menu:!!document.querySelector(`[data-ins="${t}"]`),wz:WZTYPES.some(x=>x[0]===t),edit:!!document.querySelector(`#elist [data-i="${i}"][data-k="content"]`)};},t);
  ok(`${t}：按钮 / 菜单 / 向导 / 属性 / 预览都可用`,r.svg&&!r.err&&r.menu&&r.wz&&r.edit,JSON.stringify(r));
}
const z=await p.evaluate(async()=>{document.querySelector('#zplComp').value='acs';return buildZPL();});
ok('新条码导出 ZPL（位图）',/\^GFA/.test(z)&&(z.match(/\^XA/g)||[]).length===1);

console.log('\n[4] CSV 编码 / 引号内换行 / 分号 / .xlsx');
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'text',x:1,y:1,size:3,content:'{品名}'}]});});
await p.setInputFiles('#fileIn',{name:'gbk.csv',mimeType:'text/csv',buffer:Buffer.from('c6b7c3fb2c534b550ad3eac9a12c41310a','hex')}); // 品名,SKU\n雨伞,A1（GBK）
await p.waitForTimeout(200);
ok('GBK CSV 中文不乱码',(await p.inputValue('#csv')).startsWith('品名,SKU\n雨伞')&&(await p.evaluate(()=>document.querySelector('#preview .label').innerText.trim()))==='雨伞',await p.inputValue('#csv'));
await p.setInputFiles('#fileIn',{name:'utf8.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFF品名,备注\n"衬衫","第一行\n第二行"\n长裤,x\n')});
await p.waitForTimeout(200);
const q=await p.evaluate(()=>({n:rows.length,note:rows[0]['备注'],first:Object.keys(rows[0])[0]}));
ok('UTF-8 带 BOM、引号内换行不拆成两条',q.n===2&&q.note==='第一行\n第二行'&&q.first==='品名',JSON.stringify(q));
const semi=await p.evaluate(()=>{const r=parseData('品名;价格\n衬衫;99');return r&&r[0]['价格'];});
ok('分号分隔自动识别',semi==='99',semi);
await p.setInputFiles('#fileIn',{name:'a.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:makeZip({
  'xl/workbook.xml':'<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml':'<sst><si><t>品名</t></si><si><t>SKU</t></si><si><t>台灯</t></si></sst>',
  'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    +'<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1001</v></c></row></sheetData></worksheet>'})});
await p.waitForTimeout(300);
ok('.xlsx 直接导入',(await p.inputValue('#csv'))==='品名\tSKU\n台灯\t1001'&&(await p.evaluate(()=>document.querySelector('#preview .label').innerText.trim()))==='台灯',await p.inputValue('#csv'));
await p.evaluate(()=>{window.__alert='';window.alert=x=>{window.__alert=x;};});
await p.setInputFiles('#fileIn',{name:'b.xlsx',mimeType:'application/octet-stream',buffer:Buffer.from('not a zip')});
await p.waitForTimeout(300);
const am=await p.evaluate(()=>window.__alert);
ok('损坏的 .xlsx 给出提示不崩溃',am.includes('读取失败')&&errors.length===0,am);

console.log('\n[8] 变量 / 打印时输入 / 表达式函数 / 流水号选项 / 日期偏移');
const texts=()=>p.evaluate(()=>[...document.querySelectorAll('#preview .label')].map(l=>[...l.querySelectorAll('.el')].map(n=>n.textContent)));
await p.evaluate(()=>{loadDesign({v:1,label:{w:60,h:30,dpi:203},elements:[
  {type:'counter',x:1,y:1,size:3,name:'SN',prefix:'A',start:9,step:1,pad:3,per:'record',radix:'10'},
  {type:'text',x:1,y:6,size:3,content:'{#SN}/{#N}/{#REC}/{#COPY}'},
  {type:'text',x:1,y:11,size:3,content:'=padl([品名],4,"*")+"|"+add([价],1)'},
  {type:'date',x:1,y:16,size:3,format:'YYYY-MM-DD',offset:30,unit:'d'},
  {type:'text',x:1,y:21,size:3,content:'{#DATE+30:YYYY-MM-DD}'}]});
  document.querySelector('#copies').value='2';setRows(parseData('品名,价\n衬,9\n裤,19'));});
const t1=await texts();
ok('4 张（2 条 × 2 份）',t1.length===4,t1.length);
ok('流水号按记录递增（同一记录多份同号）、{#SN}/{#N}/{#REC}/{#COPY}',JSON.stringify(t1.map(t=>t[0]+' '+t[1]))===JSON.stringify(['A009 A009/1/1/1','A009 A009/2/1/2','A010 A010/3/2/1','A010 A010/4/2/2']),JSON.stringify(t1.map(t=>t[0]+' '+t[1])));
ok('表达式函数 padl / add',t1[0][2]==='***衬|10'&&t1[2][2]==='***裤|20',t1[0][2]+' '+t1[2][2]);
const d30=await p.evaluate(()=>fmtDate(addDate(new Date(),30,'d'),'YYYY-MM-DD'));
ok('日期偏移 +30 天（日期元素与 {#DATE+30} 一致）',t1[0][3]===d30&&t1[0][4]===d30,t1[0][3]+' '+t1[0][4]+' / '+d30);
await p.evaluate(()=>{const c=elements[0];c.per='label';c.every=2;c.radix='16';c.start=254;c.pad=0;c.prefix='';render();});
ok('每 2 张递增、十六进制',JSON.stringify((await texts()).map(t=>t[0]))===JSON.stringify(['FE','FE','FF','FF']),JSON.stringify((await texts()).map(t=>t[0])));
ok('流水号属性面板有名称 / 递增方式 / 进制',await p.evaluate(()=>{renderEditor();return ['name','per','every','radix'].every(k=>document.querySelector(`#elist [data-i="0"][data-k="${k}"]`))&&document.querySelector('#elist [data-i="0"][data-k="per"] option[value="record"]').textContent.includes('每条记录');}));
// 打印时输入 {?批号}（未在变量面板定义）与面板变量一起弹框
await p.evaluate(()=>{localStorage.removeItem('label.prompts');jobPrompts={};document.querySelector('#copies').value='1';
  loadDesign({v:1,label:{w:60,h:30,dpi:203},elements:[{type:'text',x:1,y:1,size:3,content:'批号:{?批号} 线:{线别}'}],
    vars:[{name:'线别',kind:'pick',options:['A线','B线'],ask:true}]});setRows(null);window.__p=0;window.print=()=>window.__p++;});
ok('未输入时预览显示占位',(await texts())[0][0]==='批号:[?批号] 线:',(await texts())[0][0]);
await p.evaluate(()=>{doPrint();});await p.waitForTimeout(100);
const dl=await p.evaluate(()=>[...document.querySelectorAll('#varDlgBody label span')].map(x=>x.textContent));
ok('弹框同时包含面板变量与 {?批号}',dl.length===2&&dl.includes('批号'),JSON.stringify(dl));
await p.evaluate(()=>{document.querySelector('#varDlgBody select').value='B线';document.querySelector('#varDlgBody input').value='L0926';document.querySelector('#varDlgOk').click();});
await p.waitForTimeout(100);
ok('确定后打印，内容用输入值',await p.evaluate(()=>window.__p)===1&&(await texts())[0][0]==='批号:L0926 线:B线',(await texts())[0][0]);
ok('输入值记住',await p.evaluate(()=>JSON.parse(localStorage.getItem('label.prompts'))['批号'])==='L0926');

console.log('\n[5] 数量字段 / 选择记录');
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'text',x:1,y:1,size:3,content:'{品名}'}]});
  document.querySelector('#csv').value='品名,数量\n衬衫,2\n长裤,0\n帽子,3';document.querySelector('#applyCsv').click();});
const qf=await p.evaluate(()=>({v:document.querySelector('#qtyField').value,n:document.querySelectorAll('#preview .label').length,info:document.querySelector('#selInfo').textContent}));
ok('自动识别「数量」列：2+0+3=5 张',qf.v==='数量'&&qf.n===5,JSON.stringify(qf));
ok('记录数提示',qf.info==='全部 3 条',qf.info);
await p.evaluate(()=>{pickRecords();});await p.waitForTimeout(100);
await p.fill('#recQ','帽');await p.waitForTimeout(50);
const vis=await p.evaluate(()=>document.querySelectorAll('#recTbl [data-ri]').length);
ok('搜索过滤记录',vis===1,vis);
await p.evaluate(()=>{document.querySelector('#recQ').value='';document.querySelector('#recQ').dispatchEvent(new Event('input'));
  document.querySelector('[data-sa="none"]').click();const c=document.querySelector('#recTbl [data-ri="2"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));
  [...document.querySelectorAll('#dlgFt button')].find(b=>b.textContent==='确定').click();});
await p.waitForTimeout(100);
const ps=await p.evaluate(()=>({n:document.querySelectorAll('#preview .label').length,t:[...document.querySelectorAll('#preview .label')].map(l=>l.innerText.trim()),info:document.querySelector('#selInfo').textContent}));
ok('只打选中的「帽子」（数量 3）',ps.n===3&&ps.t.every(x=>x==='帽子')&&ps.info==='已选 1 / 3 条',JSON.stringify(ps));
await p.evaluate(()=>{document.querySelector('#qtyField').value='';document.querySelector('#qtyField').onchange();});
ok('不用数量字段 → 按每条份数（选中 1 条 × 1）',await p.evaluate(()=>document.querySelectorAll('#preview .label').length)===1);
await p.evaluate(()=>{document.querySelector('#csv').value='品名\n甲\n乙';document.querySelector('#applyCsv').click();});
ok('换数据后清空选择',await p.evaluate(()=>selectedRecs===null&&document.querySelectorAll('#preview .label').length===2));

console.log('\n[9] 文字锚点对齐 / 适应宽度（预览 = 打印）');
// 打印图里的黑点外框（点）与预览里元素的外框（换算成点）比较
async function inkVsPreview(el,tag){
  const zpl=await p.evaluate(async el=>{loadDesign({v:1,label:{w:60,h:30,dpi:300},elements:[el]});setRows(null);
    document.querySelector('#zplComp').value='z64';return buildZPL();},el);
  fs.writeFileSync(S+`out/${tag}.zpl`,zpl);execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,'60','30','12'],{stdio:'pipe'});
  return p.evaluate(async png=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=png;});
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const d=g.getImageData(0,0,c.width,c.height).data;let x0=1e9,y0=1e9,x1=-1,y1=-1;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4]<128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const lab=document.querySelector('#preview .label').getBoundingClientRect(),n=document.querySelector('#preview .el').getBoundingClientRect(),k=12/3.78;
    return {ink:[x0,y0,x1,y1],box:[(n.left-lab.left)*k,(n.top-lab.top)*k,(n.right-lab.left)*k,(n.bottom-lab.top)*k].map(Math.round),
      size:parseFloat(document.querySelector('#preview .el').style.fontSize)/3.78};},'data:image/png;base64,'+fs.readFileSync(S+`out/${tag}-0.png`).toString('base64'));}
const inside=(r,tol=4)=>r.ink[0]>=r.box[0]-tol&&r.ink[2]<=r.box[2]+tol&&r.ink[1]>=r.box[1]-tol&&r.ink[3]<=r.box[3]+tol;
const cx=r=>(r.ink[0]+r.ink[2])/2;
let r=await inkVsPreview({type:'text',x:30,y:10,size:4,bold:true,align:'center',content:'居中 CENTER'},'anc-c');
ok('居中：x 为中点（打印墨迹中心 ≈ 30mm）',Math.abs(cx(r)-30*12)<=6&&inside(r),JSON.stringify(r));
r=await inkVsPreview({type:'text',x:55,y:10,size:4,bold:true,align:'right',content:'右对齐 RIGHT'},'anc-r');
ok('右对齐：x 为右边（墨迹右边 ≈ 55mm）',Math.abs(r.ink[2]-55*12)<=8&&inside(r),JSON.stringify(r));
r=await inkVsPreview({type:'text',x:30,y:15,size:4,bold:true,align:'center',rot:90,content:'旋转居中'},'anc-c90');
ok('居中 + 旋转 90°：墨迹落在预览框内、竖直中心 ≈ 15mm',Math.abs((r.ink[1]+r.ink[3])/2-15*12)<=6&&inside(r),JSON.stringify(r));
r=await inkVsPreview({type:'counter',x:30,y:20,size:4,bold:true,align:'center',name:'SN',prefix:'NO.',start:7,step:1,pad:4},'anc-sn');
ok('流水号也支持锚点居中',Math.abs(cx(r)-30*12)<=6&&inside(r),JSON.stringify(r));
r=await inkVsPreview({type:'text',x:5,y:10,size:6,fitW:20,minSize:1,bold:true,content:'很长很长的品名需要自动缩小字号'},'fit');
ok('适应宽度：字号自动缩小，打印宽度 ≤ 20mm 且与预览一致',r.size<6&&(r.ink[2]-r.ink[0])<=20*12+4&&inside(r),JSON.stringify(r));
r=await inkVsPreview({type:'text',x:5,y:10,size:6,fitW:20,minSize:1,bold:true,content:'短'},'fit2');
ok('适应宽度：不超宽时保持原字号',Math.abs(r.size-6)<0.01,r.size);

console.log('\n[9] 动态图片 / 阈值与抖动');
const mk=await p.evaluate(()=>{const u=c=>{const v=document.createElement('canvas');v.width=v.height=40;const g=v.getContext('2d');g.fillStyle=c;g.fillRect(0,0,40,40);return v.toDataURL();};
  return {black:u('#000'),white:u('#fff'),gray:u('#888')};});
// 每张标签的图片墨迹占比（打印图里图片区域的黑点比例）
async function inkRatios(design,csv,tag){
  const zpl=await p.evaluate(async([d,csv])=>{loadDesign(d);setRows(csv?parseData(csv):null);document.querySelector('#zplComp').value='acs';return buildZPL();},[design,csv]);
  fs.writeFileSync(S+`out/${tag}.zpl`,zpl);execFileSync('node',[ZR,S+`out/${tag}.zpl`,S+`out/${tag}`,'30','20','8'],{stdio:'pipe'});
  const pngs=fs.readdirSync(S+'out').filter(f=>f.startsWith(tag+'-')&&f.endsWith('.png')).sort();
  const out=[];for(const f of pngs)out.push(await p.evaluate(async png=>{const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=png;});
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const d=g.getImageData(8,8,80,80).data;let k=0;for(let i=0;i<d.length;i+=4)if(d[i]<128)k++;return +(k/(80*80)).toFixed(2);},'data:image/png;base64,'+fs.readFileSync(S+'out/'+f).toString('base64')));
  return out;}
// 右侧固定放一个字，保证每张标签都有内容（渲染器会跳过完全空白的标签）
const img=(o)=>({v:1,label:{w:30,h:20,dpi:203},elements:[{type:'image',x:1,y:1,w:10,h:10,src:'',rot:0,...o},{type:'text',x:20,y:12,size:3,content:'X'}]});
let ir=await inkRatios(img({content:'{图}'}),'品名,图\n甲,"'+mk.black+'"\n乙,"'+mk.white+'"','dyn');   // data: 地址里有逗号，CSV 里要加引号
ok('动态图片：每张标签用各自记录的图片',ir.length===2&&ir[0]>0.95&&ir[1]<0.05,JSON.stringify(ir));
ok('预览里也是各自的图片',await p.evaluate(b=>{const im=[...document.querySelectorAll('#preview .label img')];return im.length===2&&im[0].src===b;},mk.black));
ir=await inkRatios(img({src:mk.gray,dither:'',threshold:200}),'','thr200');
const ir2=await inkRatios(img({src:mk.gray,dither:'',threshold:100}),'','thr100');
const ir3=await inkRatios(img({src:mk.gray,dither:'fs'}),'','fs');
ok('阈值 200 → 灰色全黑；阈值 100 → 全白；抖动 → 约一半',ir[0]>0.95&&ir2[0]<0.05&&ir3[0]>0.3&&ir3[0]<0.7,JSON.stringify([ir[0],ir2[0],ir3[0]]));
ir=await inkRatios(img({content:'https://example.com/x.png'}),'','net');
ok('网址图片不加载（不联网）',ir[0]<0.05&&await p.evaluate(()=>!document.querySelector('#preview .label img')),JSON.stringify(ir));
ok('旧设计（无 dither 字段）载入后仍为抖动',await p.evaluate(()=>{loadDesign({v:1,label:{w:30,h:20,dpi:203},elements:[{type:'image',x:1,y:1,w:5,h:5,src:''}]});return elements[0].dither==='fs';}));

console.log('\n[7] 打印前预检');
// 打开打印流程但不等待（预检对话框会等用户点）；返回对话框内容
async function startPrint(){await p.evaluate(()=>{window.__printed=null;window.print=()=>{window.__printed=printList().length;};doPrint();});
  await p.waitForTimeout(150);return p.evaluate(()=>({open:getComputedStyle(document.querySelector('#dlg')).display!=='none',
    title:document.querySelector('#dlgHd').textContent,body:document.querySelector('#dlgBody').innerText.replace(/✗/g,'[错误]'),   // ✗ 会被汇总脚本当成失败标记
    btns:[...document.querySelectorAll('#dlgFt button')].map(b=>b.textContent)}));}
const clickBtn=t=>p.evaluate(t=>{[...document.querySelectorAll('#dlgFt button')].find(b=>b.textContent.includes(t)).click();},t);
await p.evaluate(()=>{loadDesign({v:1,label:{w:50,h:30,dpi:203},elements:[{type:'ean13',x:6,y:3,h:10,module:0.33,showText:true,content:'{条码}'},
  {type:'text',x:6,y:22,size:3,content:'{品名}'}]});document.querySelector('#copies').value='1';
  setRows(parseData('品名,条码\n甲,6925253841665\n乙,6925253841660\n丙,692525384166'));});
let dg=await startPrint();
ok('有错误时弹出预检，指出第 2 张校验位错误',dg.open&&dg.title==='打印前预检'&&dg.body.includes('第 2 张')&&dg.body.includes('校验位'),dg.body);
ok('提供「跳过出错的 1 张，打印其余 2 张」',dg.btns.some(b=>b.includes('跳过出错的 1 张'))&&!dg.btns.includes('继续打印'),JSON.stringify(dg.btns));
await clickBtn('跳过');await p.waitForTimeout(150);
ok('跳过后只打 2 张',await p.evaluate(()=>window.__printed)===2,await p.evaluate(()=>window.__printed));
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
ok('打印结束后预览恢复全部 3 张',await p.evaluate(()=>document.querySelectorAll('#preview .label').length===3&&jobSkip===null));
dg=await startPrint();await clickBtn('返回修改');await p.waitForTimeout(100);
ok('返回修改 → 不打印',await p.evaluate(()=>window.__printed)===null);
await p.evaluate(()=>{elements[1].content='{品名}{颜色}';render();});
dg=await startPrint();
ok('数据里没有的字段报错',dg.body.includes('找不到字段')&&dg.body.includes('颜色'),dg.body);
await clickBtn('返回修改');
await p.evaluate(()=>{loadDesign({v:1,label:{w:30,h:15,dpi:203},elements:[{type:'rich',x:2,y:2,w:40,size:3,content:'[b]宽于标签的富文本[/b]'}]});setRows(null);});
dg=await startPrint();
ok('只有警告（富文本超出标签）→ 可「继续打印」',dg.body.includes('超出标签')&&dg.btns.includes('继续打印'),JSON.stringify(dg));
await clickBtn('继续打印');await p.waitForTimeout(150);
ok('继续 → 打印',await p.evaluate(()=>window.__printed)===1);
await p.evaluate(()=>{window.dispatchEvent(new Event('afterprint'));loadDesign({v:1,label:{w:30,h:15,dpi:203},elements:[{type:'text',x:2,y:2,size:3,content:'正常'}]});});
dg=await startPrint();
ok('没有问题 → 不弹预检直接打印',!dg.open&&await p.evaluate(()=>window.__printed)===1,JSON.stringify(dg));
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));

console.log('\n[6] 打印方式：标签机 / 整页');
await p.evaluate(()=>{loadDesign({v:1,label:{w:50,h:30,dpi:203},elements:[{type:'text',x:2,y:2,size:3,content:'{品名}'}]});setRows(parseData('品名\n甲\n乙\n丙'));});
const pg=()=>p.evaluate(()=>({css:document.getElementById('pageStyle').textContent,mode:document.querySelector('#pmode').value,
  sheetVis:getComputedStyle(document.querySelector('#sheetOpts')).display!=='none',colsVis:getComputedStyle(document.querySelector('#cols').closest('label')).display!=='none',
  slots:document.querySelectorAll('#preview .label.slot').length,labels:document.querySelectorAll('#preview .label:not(.slot)').length,pager:document.querySelector('#pager').textContent}));
let g=await pg();
ok('默认标签机模式：@page = 标签尺寸、无边距，整页选项隐藏',g.mode==='roll'&&g.css.includes('@page{size:50mm 30mm;margin:0}')&&g.css.includes('break-after:page')&&!g.sheetVis&&!g.colsVis,JSON.stringify(g));
await p.evaluate(()=>{const s=(id,v)=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input'));};
  s('#pmode','sheet');s('#paper','A5');s('#mTop','10');s('#mLeft','6');s('#cols','2');s('#startPos','3');});
g=await pg();
ok('整页模式：纸张 A5、页边距 10/6mm',g.css.includes('@page{size:A5;margin:10mm 0 0 6mm}')&&g.sheetVis&&g.colsVis,g.css);
ok('从第 3 个位置开始：前面空 2 个位、打印时不显示',g.slots===2&&g.labels===3&&g.css.includes('.label.slot{visibility:hidden'),JSON.stringify(g));
ok('提示整页模式',g.pager.includes('整页模式'),g.pager);
const saved=await p.evaluate(async()=>{let blob;const o=URL.createObjectURL;URL.createObjectURL=x=>{blob=x;return o(x);};document.querySelector('#saveBtn').click();URL.createObjectURL=o;return JSON.parse(await blob.text());});
ok('保存的设计带打印方式与纸张',saved.label.pmode==='sheet'&&saved.label.paper==='A5'&&saved.label.mTop===10&&saved.label.mLeft===6,JSON.stringify(saved.label));
await p.evaluate(()=>{undo();});
ok('撤消可恢复上一步纸张设置',await p.evaluate(()=>document.querySelector('#mLeft').value)!=='6'||await p.evaluate(()=>document.querySelector('#cols').value)!=='2');
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203,cols:3,gapX:2,gapY:2},elements:[{type:'text',x:1,y:1,size:3,content:'旧'}]});});
ok('旧设计设了「每行数量」→ 自动按整页模式',(await pg()).mode==='sheet');
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'text',x:1,y:1,size:3,content:'旧'}]});});
ok('旧设计未设「每行数量」→ 标签机模式',(await pg()).mode==='roll');
const sps=await p.evaluate(async()=>{let got=null;window.labelPrinter={isDesktop:true,print:async(d,o)=>{got={d,o};return {ok:true};}};
  const sel=document.querySelector('#prnList');sel.innerHTML='<option value="ZT410">ZT410</option>';sel.value='ZT410';window.confirm=()=>true;
  await doSilentPrint();const a=got;
  document.querySelector('#pmode').value='sheet';document.querySelector('#pmode').onchange();document.querySelector('#paper').value='A4';
  await doSilentPrint();delete window.labelPrinter;return [a,got];});
ok('静默打印传页面尺寸：标签机 = 40×20mm（微米）、整页 = A4',sps[0].o.pageSize.width===40000&&sps[0].o.pageSize.height===20000&&sps[1].o.pageSize==="A4",JSON.stringify(sps));

console.log('\n[10] 打印机参数 / 相同标签合并');
const setZ=(o)=>p.evaluate(o=>{for(const [k,v] of Object.entries(o)){const e=document.querySelector('#'+k);if(e.type==='checkbox')e.checked=v;else e.value=v;e.dispatchEvent(new Event('change'));}},o);
await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'text',x:2,y:2,size:3,content:'固定'},{type:'box',x:1,y:1,w:38,h:18,border:0.3}]});
  setRows(null);document.querySelector('#copies').value='3';});
await setZ({zLang:'zpl',zDark:'',zSpeed:'',zMedia:'',zTrack:'',zMode:'',zTop:'',zLeft:''});
let zz=await p.evaluate(()=>buildZPL());
ok('参数留空：不输出任何打印机设置指令',!/~SD|\^PR|\^MT|\^MN|\^MM|\^LT|\^LS/.test(z),zz.slice(0,120));
ok('3 份内容相同 → 1 个 ^XA + ^PQ3',(zz.match(/\^XA/g)||[]).length===1&&zz.includes('^PQ3'),zz.match(/\^PQ\d+/g));
await setZ({zDark:'20',zSpeed:'4',zMedia:'transfer',zTrack:'mark',zMode:'cut',zTop:'5',zLeft:'-3'});
zz=await p.evaluate(()=>buildZPL());
ok('浓度 / 速度 / 热转印 / 黑标纸 / 切刀 / 偏移',zz.startsWith('~SD20')&&['^PR4','^MTT','^MNM','^MMC','^LT5','^LS-3'].every(c=>zz.includes(c)),zz.slice(0,160));
await p.evaluate(()=>{elements.push({type:'counter',x:2,y:10,size:3,name:'SN',prefix:'',start:1,step:1,pad:3,every:1,per:'label',radix:'10',suffix:'',persist:false});render();});
zz=await p.evaluate(()=>buildZPL());
ok('每张流水号不同 → 不合并（3 个 ^XA）',(zz.match(/\^XA/g)||[]).length===3&&!zz.includes('^PQ3'));
await p.reload();await p.waitForSelector('#preview .label');
ok('打印机参数重启后保留',await p.evaluate(()=>document.querySelector('#zDark').value==='20'&&document.querySelector('#zTrack').value==='mark'));

console.log('\n[11] TSPL（TSC / 佳博 / 芯烨）');
await setZ({zLang:'tspl',zDark:'',zSpeed:'',zMedia:'',zTrack:'',zMode:'',zTop:'',zLeft:'',zGap:'',zInvert:true});
await p.evaluate(()=>{loadDesign({v:1,label:{w:50,h:30,dpi:203},elements:[
  {type:'qrcode',x:36,y:3,size:12,ecl:'M',content:'合格证 {品名}'},{type:'barcode',x:3,y:3,h:10,module:0.33,showText:true,content:'{SKU}'},
  {type:'text',x:3,y:20,size:3,content:'品名：{品名}'},{type:'box',x:1,y:1,w:48,h:28,border:0.3},{type:'ellipse',x:40,y:20,w:6,h:6,border:0.3}]});
  document.querySelector('#copies').value='2';setRows(parseData('品名,SKU\n衬衫,A100\n长裤,B200'));});
const ts=await p.evaluate(async()=>{const c=await buildCommands();return {ext:c.ext,lang:c.lang,bytes:Array.from(c.data)};});
const tl=ZPLmod.parseTSPL(Uint8Array.from(ts.bytes)),txt=Buffer.from(ts.bytes).toString('latin1');
ok('导出 .prn（TSPL）',ts.ext==='prn'&&ts.lang==='tspl');
ok('SIZE / GAP / CLS 头',txt.startsWith('SIZE 50 mm,30 mm\r\nGAP 2 mm,0 mm\r\n')&&txt.includes('CLS\r\n'),txt.slice(0,60));
ok('2 条记录 × 2 份 → 2 张，各 PRINT 1,2',tl.length===2&&tl.every(l=>l.copies===2),JSON.stringify(tl.map(l=>l.copies)));
ok('线框用 BOX，椭圆按位图',tl[0].boxes.length===1&&tl[0].bitmaps.length>=4,JSON.stringify({boxes:tl[0].boxes.length,bm:tl[0].bitmaps.length}));
// 把 BITMAP 还原成整张标签点阵（反色：位 0 = 黑），再用 zxing-cpp 扫
const W=Math.round(50*8),H=Math.round(30*8);
async function scanTSPL(lab){const px=new Uint8Array(W*H);
  for(const b of lab.bitmaps)for(let y=0;y<b.h;y++)for(let x=0;x<b.bpr*8;x++){const v=b.bytes[y*b.bpr+(x>>3)],bit=(v>>(7-(x&7)))&1;
    if(!bit){const X=b.x+x,Y=b.y+y;if(X<W&&Y<H)px[Y*W+X]=1;}}
  return (await decodeBits(W,H,(x,y)=>px[y*W+x],{scale:2})).map(r=>r.text).sort();}
const sc=await scanTSPL(tl[1]);
ok('TSPL 点阵扫码：QR（中文）与 Code128 都扫得出',sc.includes('合格证 长裤')&&sc.includes('B200'),JSON.stringify(sc));
await setZ({zInvert:false});
const tl2=ZPLmod.parseTSPL(Uint8Array.from(await p.evaluate(async()=>Array.from((await buildCommands()).data))));
ok('取消反色 → 位图数据按位取反',tl2[0].bitmaps[0].bytes[0]===((~tl[0].bitmaps[0].bytes[0])&255));
await setZ({zLang:'zpl',zInvert:true});

console.log('\n[13] 打印日志 / 车间模式');
await p.evaluate(()=>{localStorage.removeItem('label.printlog');window.showIssues=async()=>'go';
  loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'text',x:2,y:2,size:3,content:'{品名} {?批次}'},
    {type:'counter',x:2,y:10,size:3,name:'SN',prefix:'S',start:5,step:1,pad:3,every:1,per:'label',radix:'10',suffix:'',persist:false}]});
  document.querySelector('#copies').value='1';setRows(parseData('品名\n甲\n乙\n丙\n丁'));jobPrompts={'批次':'B9'};
  document.querySelector('#rFrom').value='2';document.querySelector('#rTo').value='3';render();});
// {?批次} 会弹出打印时输入框：先发起打印，再点确定
const okVarDlg=async()=>{await p.waitForTimeout(150);await p.evaluate(()=>{if(getComputedStyle(document.querySelector('#varDlg')).display!=='none')document.querySelector('#varDlgOk').click();});await p.waitForTimeout(150);};
await p.evaluate(()=>{window.print=()=>{window.dispatchEvent(new Event('afterprint'));};doPrint();});
await okVarDlg();
const lg=await p.evaluate(()=>JSON.parse(localStorage.getItem('label.printlog')||'[]'));
ok('打印后记日志：方式 / 张数 / 记录区间 / 流水号区间 / 输入值',lg.length===1&&lg[0].method==='浏览器打印'&&lg[0].labels===2&&lg[0].recs==='2-3'&&lg[0].serials.SN==='S005 – S006'&&lg[0].prompts['批次']==='B9',JSON.stringify(lg[0]&&{...lg[0],rows:undefined}));
await p.evaluate(()=>{document.querySelector('#rFrom').value='1';document.querySelector('#rTo').value='0';setRows(null);showLog();});
await p.waitForTimeout(100);
ok('打印日志对话框列出记录',await p.evaluate(()=>document.querySelector('#dlgBody').innerText.includes('2-3')&&!!document.querySelector('#dlgBody [data-lg="0"]')));
await p.evaluate(()=>{window.alert=()=>{};document.querySelector('#dlgBody [data-lg="0"]').click();});
await p.waitForTimeout(100);
ok('「载入数据」补打：恢复当次记录与输入值',await p.evaluate(()=>rows&&rows.length===2&&rows[0]['品名']==='乙'&&jobPrompts['批次']==='B9'));
await p.evaluate(()=>{exportZPL();});await okVarDlg();
const z0=await p.evaluate(()=>JSON.parse(localStorage.getItem('label.printlog'))[0].method);
ok('导出指令也记日志',z0==='导出 ZPL',z0);
// 车间模式（设退出密码）
await p.evaluate(async()=>{window.prompt=()=>'1234';await toggleShop();});
const shop=await p.evaluate(()=>({on:document.body.classList.contains('shop'),
  elist:getComputedStyle(document.querySelector('#elist')).display,edit:getComputedStyle(document.querySelector('#menubar .menu.design')).display,
  page:getComputedStyle(document.querySelector('.pagepanel')).display,print:getComputedStyle(document.querySelector('#printBtn')).display}));
ok('车间模式：隐藏元素编辑 / 编辑与插入菜单 / 纸张设置，保留打印',shop.on&&shop.elist==='none'&&shop.edit==='none'&&shop.page==='none'&&shop.print!=='none',JSON.stringify(shop));
const box=await p.locator('#preview .el').first().boundingBox();const x0=await p.evaluate(()=>elements[0].x);
await p.mouse.move(box.x+3,box.y+3);await p.mouse.down();await p.mouse.move(box.x+60,box.y+30,{steps:4});await p.mouse.up();
await p.keyboard.press('Delete');await p.keyboard.press('Control+z');
ok('车间模式：拖不动、Delete / Ctrl+Z 不改设计',await p.evaluate(()=>elements.length)===2&&await p.evaluate(()=>elements[0].x)===x0);
await p.reload();await p.waitForSelector('#preview .label');
ok('重启后仍在车间模式',await p.evaluate(()=>document.body.classList.contains('shop')));
await p.evaluate(async()=>{window.alert=()=>{};window.prompt=()=>'0000';await toggleShop();});
ok('退出密码不对 → 不退出',await p.evaluate(()=>document.body.classList.contains('shop')));
await p.evaluate(async()=>{window.prompt=()=>'1234';await toggleShop();});
ok('密码正确 → 退出车间模式',await p.evaluate(()=>!document.body.classList.contains('shop')));

console.log('\n[12] 直发：按打印机名 / 波特率 / 检测打印机 / 分批 / 取消 / 续打');
{
  const c2=await b.newContext();
  await c2.addInitScript(()=>{window.__sends=[];window.__status={ready:false,problems:['缺纸'],dpi:300,model:'ZT410-300dpi'};
    window.labelPrinter={isDesktop:true,
      list:async()=>({ok:true,printers:[{name:'ZT410',displayName:'Zebra ZT410',isDefault:true}]}),
      print:async()=>({ok:true}),
      status:async(t,lang)=>({ok:true,status:window.__status}),
      sendRaw:async(t,data)=>{window.__sends.push({t,n:(String(data).match(/\^XA/g)||[]).length});
        if(window.__failAt&&window.__sends.length===window.__failAt)return {ok:false,error:'连接断开'};
        if(window.__cancelAfter&&window.__sends.length===window.__cancelAfter)sendCancel=true;   // 页面脚本里的 let 变量，按名字赋值
        return {ok:true};}};});
  const q=await c2.newPage();const errs2=[];q.on('pageerror',e=>errs2.push(e.message));
  await q.goto(APP);await q.waitForSelector('#preview .label');await q.waitForTimeout(100);
  const set=(id,v)=>q.evaluate(([id,v])=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input'));},[id,v]);
  await q.evaluate(()=>{window.showIssues=async()=>'go';window.confirm=()=>true;localStorage.removeItem('label.printlog');
    loadDesign({v:1,label:{w:40,h:20,dpi:203},elements:[{type:'counter',x:2,y:2,size:3,name:'SN',prefix:'',start:1,step:1,pad:3,every:1,per:'label',radix:'10',suffix:'',persist:false}]});
    document.querySelector('#copies').value='5';render();});
  await set('#rawKind','spool');
  const sp=await q.evaluate(async()=>{__sends.length=0;await doSendZPL();return {t:__sends[0]&&__sends[0].t,addrHidden:getComputedStyle(document.querySelector('#rawAddr').closest('label')).display==='none'};});
  ok('按打印机名直发：目标为所选系统打印机，地址框隐藏',JSON.stringify(sp.t)==='{"kind":"spool","name":"ZT410"}'&&sp.addrHidden,JSON.stringify(sp));
  await set('#rawKind','com');await set('#rawAddr','COM3');await set('#rawBaud','115200');
  const cm=await q.evaluate(async()=>{__sends.length=0;await doSendZPL();return {t:__sends[0].t,vis:getComputedStyle(document.querySelector('#rawBaudWrap')).display!=='none'};});
  ok('串口带波特率',JSON.stringify(cm.t)==='{"kind":"com","port":"COM3","baud":"115200"}'&&cm.vis,JSON.stringify(cm));
  await set('#rawKind','tcp');await set('#rawAddr','10.0.0.9');
  const st=await q.evaluate(async()=>{const asks=[];window.confirm=m=>{asks.push(m);return false;};__sends.length=0;await doSendZPL();window.confirm=()=>true;return {asks,sent:__sends.length};});
  ok('网络打印机发送前检测：缺纸时询问，取消则不发',st.sent===0&&st.asks.length===1&&st.asks[0].includes('缺纸'),JSON.stringify(st));
  const dp=await q.evaluate(async()=>{__status={ready:true,problems:[],dpi:300,model:'ZT410'};const asks=[];window.confirm=m=>{asks.push(m);return false;};__sends.length=0;await doSendZPL();window.confirm=()=>true;return {asks,sent:__sends.length};});
  ok('设计 203 dpi、打印机 300 dpi → 提示尺寸会变',dp.sent===0&&dp.asks[0].includes('300 dpi')&&dp.asks[0].includes('68%'),JSON.stringify(dp));
  await q.evaluate(()=>{__status={ready:true,problems:[],dpi:203,model:'ZT410'};});
  await set('#zBatch','2');
  const bt=await q.evaluate(async()=>{__sends.length=0;await doSendZPL();return {n:__sends.map(x=>x.n),msg:document.querySelector('#prnMsg').textContent};});
  ok('5 张按每批 2 张分 3 次发送',JSON.stringify(bt.n)==='[2,2,1]'&&bt.msg.includes('已发送 5 张'),JSON.stringify(bt));
  const cc=await q.evaluate(async()=>{__sends.length=0;window.__cancelAfter=1;await doSendZPL();window.__cancelAfter=0;
    return {n:__sends.length,msg:document.querySelector('#prnMsg').textContent,resume:getComputedStyle(document.querySelector('#rawResume')).display!=='none',left:resumeState&&resumeState.list.length};});
  ok('发送中取消：已发 2 张，可续打剩余 3 张',cc.n===1&&cc.msg.includes('已取消')&&cc.resume&&cc.left===3,JSON.stringify(cc));
  const rs=await q.evaluate(async()=>{__sends.length=0;await doResume();const lg=JSON.parse(localStorage.getItem('label.printlog')||'[]');
    return {n:__sends.map(x=>x.n),resume:getComputedStyle(document.querySelector('#rawResume')).display!=='none',log:lg[0]&&[lg[0].method,lg[0].labels,lg[0].serials.SN]};});
  ok('续打：发剩余 3 张（流水号接着 003–005），并记日志',JSON.stringify(rs.n)==='[2,1]'&&!rs.resume&&rs.log[0].includes('续打')&&rs.log[1]===3&&rs.log[2]==='003 – 005',JSON.stringify(rs));
  const fl=await q.evaluate(async()=>{__sends.length=0;window.__failAt=2;await doSendZPL();window.__failAt=0;
    return {msg:document.querySelector('#prnMsg').textContent,left:resumeState&&resumeState.list.length};});
  ok('第二批失败：提示可续打，剩余 3 张',fl.msg.includes('续打剩余')&&fl.left===3,JSON.stringify(fl));
  const ds=await q.evaluate(async()=>{__status={ready:false,problems:['开盖'],dpi:203,model:'ZT410'};await doPrinterStatus();return document.querySelector('#prnMsg').textContent;});
  ok('「检测打印机」显示状态与型号',ds.includes('开盖')&&ds.includes('ZT410'),ds);
  ok('直发测试无 JS 错误',errs2.length===0,errs2.join(';'));
  await c2.close();
}

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 移植功能验收：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
