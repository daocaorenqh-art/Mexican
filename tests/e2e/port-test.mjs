// 移植自另一开发线的界面功能（docs/integration.md）逐项验收
import { S, APP } from './_lib.mjs';
import pw from 'playwright';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { makeZip }=require('../helpers.cjs');
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

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 移植功能验收：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
