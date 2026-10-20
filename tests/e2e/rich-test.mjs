import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
import fs from 'node:fs';import { execFileSync } from 'node:child_process';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();const ctx=await b.newContext({permissions:['clipboard-read','clipboard-write']});const p=await ctx.newPage({viewport:{width:1400,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');

console.log('\n[标记解析]');
const pr=await p.evaluate(()=>({
  nest:parseRich('A[b]B[i]C[/i]D[/b]E'),
  sz:parseRich('[size=6][color=#ff0000]X[/color][/size]'),
  bad:parseRich('[size=abc]X[/size][color=red]Y[/color][foo]Z[/b]'),
  inj:parseRich(richResolve('名:{N}',{N:'[b]不应加粗[/b]'})),
  unclosed:parseRich('[b]粗到底'),
}));
const sig=r=>r.map(x=>x.t+(x.b?'b':'')+(x.i?'i':'')+(x.u?'u':'')+(x.size?'@'+x.size:'')+(x.color?x.color:'')).join('|');
ok('嵌套粗体/斜体',sig(pr.nest)==='A|Bb|Cbi|Db|E',sig(pr.nest));
ok('字号 + 颜色',sig(pr.sz)==='X@6#ff0000',sig(pr.sz));
ok('非法参数/未知标记按原文显示',sig(pr.bad).replace(/\|/g,'')==='[size=abc]X[/size][color=red]Y[/color][foo]Z[/b]',sig(pr.bad));
ok('字段值里的标记不生效（防注入）',sig(pr.inj)==='名:[b]不应加粗[/b]',sig(pr.inj));
ok('未闭合标记作用到结尾',sig(pr.unclosed)==='粗到底b',sig(pr.unclosed));

console.log('\n[排版]');
const lay=await p.evaluate(()=>{const el={type:'rich',w:30,size:3,align:'left',font:''};
  const a=richLayout(el,'普通 [size=6]大字[/size] 普通'),b=richLayout(el,'这是一段很长很长的中文需要自动换行到第二行甚至第三行 with English words');
  const c=richLayout({...el,align:'right'},'右对齐');
  return {h1:a.lines[0].h,n:b.lines.length,maxw:Math.max(...b.lines.map(l=>l.w)),right:c.lines[0].items[0].x+c.lines[0].w};});
ok('混排大字 → 行高取最大字号',Math.abs(lay.h1-7.5)<0.01,lay.h1);
ok('超宽自动换行且每行不超宽',lay.n>=3&&lay.maxw<=30.001,JSON.stringify(lay));
ok('右对齐贴右边',Math.abs(lay.right-30)<0.01,lay.right);

console.log('\n[预览 = 打印（Zebrash 300dpi）]');
const el={type:'rich',x:4,y:4,w:60,size:3.5,align:'left',font:'',rot:0,content:'[b]合格证[/b] 品名：[u]{品名}[/u] [i]Italic[/i]\n[size=6][color=#c00000]特价 ¥99[/color][/size] 普通文字 [b][u]粗下划线[/u][/b]'};
const zpl=await p.evaluate(async el=>{loadDesign({v:1,label:{w:70,h:30,dpi:300,cols:0,gapX:3,gapY:3},elements:[el]});
  document.querySelector('#csv').value='品名\n纯棉衬衫';document.querySelector('#applyCsv').click();document.querySelector('#zplComp').value='z64';return buildZPL();},el);
fs.writeFileSync(S+'out/rich.zpl',zpl);execFileSync('node',[ZR,S+'out/rich.zpl',S+'out/rich','70','30','12'],{stdio:'pipe'});
const cmp=await p.evaluate(async png=>{const e=elements[0],L=richLayout(e,richResolve(e.content,rows[0])),W=Math.round(L.w*12),H=Math.round(L.h*12),x0=Math.round(e.x*12),y0=Math.round(e.y*12);
  const pv=document.querySelector('#preview .el canvas');const a=document.createElement('canvas');a.width=W;a.height=H;const ga=a.getContext('2d');ga.fillStyle='#fff';ga.fillRect(0,0,W,H);ga.drawImage(pv,0,0,W,H);
  const im=await new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=png;});const z=document.createElement('canvas');z.width=W;z.height=H;z.getContext('2d').drawImage(im,-x0,-y0);
  const da=ga.getImageData(0,0,W,H).data,dz=z.getContext('2d').getImageData(0,0,W,H).data;let I=0,U=0,nz=0;
  for(let i=0;i<W*H;i++){const A=(0.299*da[i*4]+0.587*da[i*4+1]+0.114*da[i*4+2])<128,Z=dz[i*4]<128;if(Z)nz++;if(A&&Z)I++;if(A||Z)U++;}
  return {iou:I/Math.max(1,U),nz,lines:L.lines.length};},'data:image/png;base64,'+fs.readFileSync(S+'out/rich-0.png').toString('base64'));
ok('富文本预览与打印重合',cmp.iou>0.85&&cmp.nz>500,`IoU=${cmp.iou.toFixed(3)} 黑点 ${cmp.nz} 行数 ${cmp.lines}`);
ok('预览里套入了字段值',await p.evaluate(()=>{const e=elements[0];return richLayout(e,richResolve(e.content,rows[0])).lines[0].items.some(t=>t.t.includes('纯棉衬衫')||t.t==='纯');}));
ok('红色在热敏打印里为黑（ZPL 有该区域黑点）',cmp.nz>500);

console.log('\n[RTF 导入]');
// 合=BA CF 格=B8 F1 证=D6 A4（GBK）
const rtf='{\\rtf1\\ansi\\ansicpg936\\deff0{\\fonttbl{\\f0\\fnil\\fcharset134 SimSun;}}{\\colortbl ;\\red192\\green0\\blue0;}{\\*\\generator Msftedit;}\\viewkind4\\uc1\\pard\\f0\\fs20 \\b\\\'ba\\\'cf\\\'b8\\\'f1\\\'d6\\\'a4\\b0  \\i Italic\\i0  \\ul under\\ulnone\\par \\fs36\\cf1 Big Red\\cf0\\fs20  \\u8364?5\\par}';
const conv=await p.evaluate(r=>({len:r.length,base:mainSize(rtfToRuns(r)),m:runsToRich(rtfToRuns(r))}),rtf);
ok('RTF：GBK 中文 + 粗/斜/下划线/字号/颜色/Unicode，正文字号提为基础字号',conv.m==='[b]合格证[/b] [i]Italic[/i] [u]under[/u]\n[size=6.35][color=#c00000]Big Red[/color][/size] €5'&&conv.base===3.53,JSON.stringify(conv));
const conv2=await p.evaluate(()=>runsToRich(rtfToRuns('{\\rtf1\\ansi\\ansicpg1252 caf\\\'e9 \\b bold\\b0}')));
ok('RTF：西文代码页 1252（é）',conv2==='café [b]bold[/b]',JSON.stringify(conv2));

console.log('\n[编辑器：工具条 / 粘贴 HTML]');
await p.evaluate(()=>{loadDesign({v:1,label:{w:60,h:30,dpi:203,cols:0,gapX:3,gapY:3},elements:[]});document.querySelector('#clearCsv').click();});
await p.click('[data-add="rich"]');
ok('「+ 富文本」添加元素并显示工具条',await p.evaluate(()=>elements[0].type==='rich'&&!!document.querySelector('#elist .rtbar [data-rt="b"]')&&!!document.querySelector('#preview .el canvas')));
await p.evaluate(()=>{const ta=document.querySelector('#elist textarea[data-rich]');ta.value='ABC DEF';ta.dispatchEvent(new Event('input',{bubbles:true}));});
const sel=async(a,b2)=>p.evaluate(([a,b2])=>{const ta=document.querySelector('#elist textarea[data-rich]');ta.focus();ta.setSelectionRange(a,b2);},[a,b2]);
await sel(0,3);await p.click('#elist [data-rt="b"]');
ok('选中 ABC 点 B → [b]ABC[/b]',await p.evaluate(()=>elements[0].content)==='[b]ABC[/b] DEF',await p.evaluate(()=>elements[0].content));
await sel(11,14);p.once('dialog',d=>d.accept('6'));await p.click('#elist [data-rt="size"]');
ok('字号按钮 → [size=6]',await p.evaluate(()=>elements[0].content)==='[b]ABC[/b] [size=6]DEF[/size]',await p.evaluate(()=>elements[0].content));
await sel(0,await p.evaluate(()=>elements[0].content.length));await p.click('#elist [data-rt="clear"]');
ok('清除格式',await p.evaluate(()=>elements[0].content)==='ABC DEF');
const pasted=await p.evaluate(()=>{const ta=document.querySelector('#elist textarea[data-rich]');ta.value='';ta.focus();
  const dt=new DataTransfer();dt.setData('text/html','<p><b>粗</b><span style="color:rgb(255,0,0);font-size:16pt">红大</span><em>斜</em><u>下</u><img src="x" onerror="window.__xss=1"><script>window.__xss=1</script></p>');dt.setData('text/plain','粗红大斜下');
  ta.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));return {v:elements[0].content,xss:window.__xss};});
ok('粘贴 HTML → 保留格式',pasted.v==='[b]粗[/b][size=5.64][color=#ff0000]红大[/color][/size][i]斜[/i][u]下[/u]',JSON.stringify(pasted.v));
await p.waitForTimeout(100);
ok('粘贴内容里的脚本/图片不执行',!(await p.evaluate(()=>window.__xss)));

console.log('\n[艺术字属性修正]');
await p.click('[data-add="wordart"]');
const wa=await p.evaluate(()=>{const i=elements.length-1,q=k=>document.querySelector(`#elist [data-i="${i}"][data-k="${k}"]`);
  const set=(k,v)=>{const e=q(k);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));};
  set('hollow','1');const h1=elements[i].hollow;set('hollow','0');const h0=elements[i].hollow;
  setUnit('cm');renderEditor();set('stroke','0.03');const st=elements[i].stroke;setUnit('mm');renderEditor();
  return {h1,h0,st};});
ok('空心字 是/否 存为布尔值',wa.h1===true&&wa.h0===false,JSON.stringify(wa));
ok('cm 单位下描边宽换算为 mm',Math.abs(wa.st-0.3)<1e-9,wa.st);
await p.evaluate(()=>{loadDesign({v:1,label:{w:70,h:30,dpi:300,cols:0,gapX:3,gapY:3},elements:[{...DEFAULTS.rich,x:3,y:3,w:62,content:'[b]合格证[/b] 品名：[u]纯棉衬衫[/u] 规格：[i]170/92A[/i]\n[size=6][color=#c00000]特价 ¥99[/color][/size] 执行标准 FZ/T 81006'}]});
  document.querySelector('#zoom').value=200;document.querySelector('#zoom').oninput();});
await p.locator('#preview .label').first().screenshot({path:S+'out/rich-preview.png'});
ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 富文本：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
