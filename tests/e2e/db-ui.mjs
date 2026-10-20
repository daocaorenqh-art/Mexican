import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const PWD='p@ss;w}rd中文';
const mocks=(withSecret)=>()=>{};
const b=await chromium.launch();const errors=[];
async function page(withSecret,seed){
  const ctx=await b.newContext();
  await ctx.addInitScript(([withSecret,seed])=>{
    if(seed&&!localStorage.getItem('__seeded')){localStorage.setItem('labelDB.cfg',seed);localStorage.setItem('__seeded','1');}
    const enc=s=>'ENC:'+btoa(unescape(encodeURIComponent(s))),dec=s=>decodeURIComponent(escape(atob(s.slice(4))));
    window.__q=[];
    window.labelDB={isDesktop:true,test:async()=>({ok:true}),pickFile:async()=>null,
      tables:async(cfg)=>{window.__q.push(['tables',cfg]);return {ok:true,tables:['合格证','odd"name','v_sku']};},
      columns:async(cfg,t)=>{window.__q.push(['columns',t]);return {ok:true,columns:['品名','零售 价','SKU'],sql:'SELECT * FROM "'+t.replace(/"/g,'""')+'"'};},
      query:async(cfg,sql)=>{window.__q.push(['query',cfg,sql]);return {ok:true,rows:[{'品名':'女包','零售 价':'558','SKU':'FZ-1'},{'品名':'男鞋','零售 价':'398','SKU':'FZ-2'}]};}};
    if(withSecret)window.labelSecret={encrypt:async p=>enc(p),decrypt:async c=>c&&c.startsWith('ENC:')?dec(c):null};
  },[withSecret,seed||null]);
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(APP);await p.waitForSelector('#preview .label');await p.waitForTimeout(100);
  return {p,ctx};
}
const fill=(p,vals)=>p.evaluate(v=>{for(const [id,val] of Object.entries(v)){const e=document.querySelector(id);e.value=val;e.dispatchEvent(new Event('change'));e.dispatchEvent(new Event('input'));}},vals);

console.log('\n[密码加密保存]');
let {p,ctx}=await page(true);
await fill(p,{'#dbType':'mysql','#dbHost':'10.0.0.5','#dbUser':'label','#dbPass':PWD,'#dbName':'erp'});
await p.evaluate(()=>document.querySelector('#dbTest').click());await p.waitForTimeout(150);
let raw=await p.evaluate(()=>localStorage.getItem('labelDB.cfg'));
ok('本机存储里找不到明文密码',!raw.includes(PWD)&&!raw.includes('p@ss'),raw);
ok('存储的是加密后的 pwdEnc，且 c 里没有 password 字段',JSON.parse(raw).pwdEnc&&!('password' in JSON.parse(raw).c));
await p.reload();await p.waitForSelector('#preview .label');await p.waitForTimeout(200);
let r=await p.evaluate(()=>({pw:document.querySelector('#dbPass').value,host:document.querySelector('#dbHost').value,type:document.querySelector('#dbType').value,
  conn:getComputedStyle(document.querySelector('#dbConn')).display}));
ok('重启后解密恢复密码（含特殊字符/中文）',r.pw===PWD,JSON.stringify(r));
ok('重启后连接类型/主机恢复且显示主机输入区',r.type==='mysql'&&r.host==='10.0.0.5'&&r.conn!=='none');
await ctx.close();

console.log('\n[旧版本明文 → 自动迁移]');
const legacy=JSON.stringify({c:{type:'mssql',host:'db01',user:'sa',password:'OldPlain#1',database:'mes'},sql:'SELECT 1'});
({p,ctx}=await page(true,legacy));await p.waitForTimeout(200);
r=await p.evaluate(()=>({pw:document.querySelector('#dbPass').value,raw:localStorage.getItem('labelDB.cfg')}));
ok('旧明文密码照常填回',r.pw==='OldPlain#1');
ok('存储已改写：明文被清除、改为密文',!r.raw.includes('OldPlain#1')&&JSON.parse(r.raw).pwdEnc,r.raw);
await ctx.close();

console.log('\n[系统无法加密时]');
({p,ctx}=await page(false));
await fill(p,{'#dbType':'postgres','#dbHost':'pg','#dbPass':'secret123'});
await p.evaluate(()=>document.querySelector('#dbTest').click());await p.waitForTimeout(150);
raw=await p.evaluate(()=>localStorage.getItem('labelDB.cfg'));
ok('不保存密码（宁缺毋明文），其它配置照常保存',!raw.includes('secret123')&&JSON.parse(raw).c.host==='pg',raw);
await ctx.close();

console.log('\n[表 / 字段浏览 + 中文字段套打]');
({p,ctx}=await page(true));
await fill(p,{'#dbType':'sqlite','#dbPath':'C:\\\\data\\\\a.db'});
await p.evaluate(()=>document.querySelector('#dbBrowse').click());await p.waitForTimeout(100);
const opts=await p.evaluate(()=>[...document.querySelectorAll('#dbTable option')].map(o=>o.value));
ok('浏览表：下拉列出全部表（含特殊名）',JSON.stringify(opts)===JSON.stringify(['','合格证','odd"name','v_sku']),JSON.stringify(opts));
await fill(p,{'#dbTable':'合格证'});await p.waitForTimeout(100);
r=await p.evaluate(()=>({sql:document.querySelector('#dbSql').value,tags:[...document.querySelectorAll('#dbCols .tag')].map(t=>t.textContent)}));
ok('选表 → 自动生成查询',r.sql==='SELECT * FROM "合格证"',r.sql);
ok('字段以 {字段} 标签列出',JSON.stringify(r.tags)===JSON.stringify(['{品名}','{零售 价}','{SKU}']),JSON.stringify(r.tags));
await p.evaluate(()=>{loadDesign({v:1,label:{w:50,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,content:'品名：{品名}'},{type:'text',x:2,y:9,size:4,content:'价格 {零售 价} 元'},{type:'text',x:2,y:14,size:3,content:'=[品名]+"/"+[SKU]'}]});});
await p.evaluate(()=>document.querySelector('#dbRun').click());await p.waitForTimeout(150);
const texts=await p.evaluate(()=>[...document.querySelectorAll('#preview .label')].map(l=>[...l.querySelectorAll('.el')].map(e=>e.textContent)));
ok('中文字段名 {品名} 正确替换',texts[0][0]==='品名：女包',JSON.stringify(texts[0]));
ok('带空格字段名 {零售 价} 正确替换',texts[0][1]==='价格 558 元');
ok('表达式里的中文字段 [品名] 正确',texts[1][2]==='男鞋/FZ-2',texts[1][2]);
const lastQ=await p.evaluate(()=>window.__q.filter(x=>x[0]==='query').pop());
ok('查询请求里不带明文以外的多余字段（密码只在连接时传给主进程）',lastQ&&lastQ[2]==='SELECT * FROM "合格证"');
await ctx.close();

console.log('\n[网页版 CSV 中文表头]');
{const pg=await b.newPage();pg.on('pageerror',e=>errors.push(e.message));
 await pg.goto(APP);await pg.waitForSelector('#preview .label');
 const t=await pg.evaluate(()=>{loadDesign({v:1,label:{w:40,h:15,dpi:203,cols:0,gapX:3,gapY:3},elements:[{type:'text',x:2,y:2,size:4,content:'{货号}-{颜色}'}]});
   document.querySelector('#csv').value='货号,颜色\nA01,红';document.querySelector('#applyCsv').click();
   return document.querySelector('#preview .label .el').textContent;});
 ok('CSV 中文表头 {货号}-{颜色} 正确替换',t==='A01-红',t);
 ok('数据库面板在网页版隐藏',await pg.evaluate(()=>getComputedStyle(document.querySelector('#dbPanel')).display==='none'));
 await pg.close();}

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 数据库界面：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
