/* 内容求值、变量、日期、CSV 解析（原创实现，无第三方依赖）。
   浏览器：<script src="src/textdata.js"> 后以全局变量使用；Node（测试）：require('./src/textdata.js')。

   内容写法：
   1) 普通文字 + 插值：{字段}、{表.字段}、{#变量}、{?输入项}，字段名可含中文、空格
   2) 以 = 开头为表达式：[字段] / {字段}、"文字"（支持 \" 转义）、数字、+ 拼接、函数调用
   变量：
     {#SN}            流水号（流水号元素的「名称」，默认 SN）
     {#DATE}          当天日期 YYYY-MM-DD；{#DATE:YYYYMMDD} 自定格式
     {#DATE+30:YYYY-MM-DD}  偏移：+30 天；+6M 六个月；+1Y 一年；-1 前一天
     {#TIME}          HH:mm:ss
     {#N} 本次第几张  {#REC} 第几条记录  {#COPY} 该记录第几份
     {?批号}          打印时弹窗输入
   ctx：{row, vars, prompts, defs（设计定义的变量值）, now, n, rec, copy, missing:Set} */
(function(root){

/* ---------- 日期 ---------- */
const pad=(n,l=2)=>String(n).padStart(l,'0');
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);
  const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/864e5+1)/7);}
function dayOfYear(d){return Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(d.getFullYear(),0,1))/864e5)+1;}
// 格式符：YYYY YY MM DD HH mm ss JJJ(年内第几天/儒略日) WW(ISO 周)；其余字符原样输出
function fmtDate(d,f){
  return String(f==null||f===''?'YYYY-MM-DD':f).replace(/YYYY|YY|MM|DD|HH|mm|ss|JJJ|WW/g,t=>{
    switch(t){case 'YYYY':return String(d.getFullYear());case 'YY':return pad(d.getFullYear()%100);
      case 'MM':return pad(d.getMonth()+1);case 'DD':return pad(d.getDate());case 'HH':return pad(d.getHours());
      case 'mm':return pad(d.getMinutes());case 'ss':return pad(d.getSeconds());case 'JJJ':return pad(dayOfYear(d),3);
      case 'WW':return pad(isoWeek(d));}});
}
// 日期偏移；按月/年偏移时日子超出当月天数则取月末（1 月 31 日 + 1 个月 = 2 月末）
function addDate(d,n,unit){n=Math.trunc(+n||0);const r=new Date(d.getTime());
  const u=String(unit||'d').toLowerCase();
  if(u==='d'||u==='天'){r.setDate(r.getDate()+n);return r;}
  const months=(u==='y'||u==='年')?n*12:n, day=r.getDate();
  r.setDate(1);r.setMonth(r.getMonth()+months);
  const last=new Date(r.getFullYear(),r.getMonth()+1,0).getDate();r.setDate(Math.min(day,last));return r;}
// 解析数据里的日期：YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD / YYYYMMDD（可带 HH:mm[:ss]）
function parseDate(s){const t=String(s==null?'':s).trim();
  let m=t.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)||
        t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(!m)throw new Error('无法识别的日期："'+t+'"');
  const d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
  if(d.getMonth()!==+m[2]-1)throw new Error('日期不存在："'+t+'"');return d;}

/* ---------- 变量与字段 ---------- */
function getCtx(c){return (c&&c.__ctx)?c:{__ctx:true,row:c||null,vars:{},prompts:{},now:new Date(),n:1,rec:c?1:0,copy:1,missing:new Set()};}
function makeCtx(o){return Object.assign({__ctx:true,row:null,vars:{},prompts:{},now:new Date(),n:1,rec:0,copy:1,missing:new Set()},o||{});}
// #NAME[+N[D|M|Y]][:FORMAT]
function varVal(spec,ctx){
  const m=String(spec).match(/^#\s*([^:+\-\s]+)\s*(?:([+-]\s*\d+)\s*([dmyDMY天月年]?))?\s*(?::(.*))?$/);
  if(!m){ctx.missing.add(spec);return '';}
  const name=m[1].toUpperCase(),fmt=m[4];
  if(name==='DATE'||name==='TIME'){let d=ctx.now;if(m[2])d=addDate(d,m[2].replace(/\s/g,''),m[3]||'d');
    return fmtDate(d,fmt!=null?fmt:(name==='TIME'?'HH:mm:ss':'YYYY-MM-DD'));}
  if(name==='N')return String(ctx.n);
  if(name==='REC')return String(ctx.rec);
  if(name==='COPY')return String(ctx.copy);
  const vk=Object.keys(ctx.vars||{}).find(k=>k.toUpperCase()===name);
  if(vk!==undefined)return ctx.vars[vk];
  ctx.missing.add(spec);return '';
}
function fieldVal(name,c){
  const ctx=getCtx(c);const raw=String(name).trim();
  if(raw[0]==='#')return varVal(raw,ctx);
  if(raw[0]==='?'){const k=raw.slice(1).trim();
    if(ctx.prompts&&k in ctx.prompts)return String(ctx.prompts[k]);
    return (ctx.row||ctx.strict)?(ctx.missing.add(raw),''):'['+raw+']';}  // 预检（strict）时未填视为缺失
  const row=ctx.row,key=raw.split('.').pop().trim(); // 去掉表前缀
  // 设计里定义的变量（打印时输入 / 挑选列表等）：数据里没有同名字段时才用
  const defs=ctx.defs,dv=defs&&Object.prototype.hasOwnProperty.call(defs,key)?String(defs[key]):undefined;
  if(!row)return dv!==undefined?dv:'['+key+']';
  if(raw in row)return row[raw];
  if(key in row)return row[key];
  const lk=key.toLowerCase(),hit=Object.keys(row).find(k=>k.toLowerCase()===lk); // 不区分大小写回退
  if(hit!==undefined)return row[hit];
  if(dv!==undefined)return dv;
  ctx.missing.add(key);return '';
}
// 内容里用到的 {?输入项}（打印前弹窗收集）
function promptNames(str){const out=new Set();const s=String(str==null?'':str);
  s.replace(/\{\s*\?([^{}]+)\}/g,(_,k)=>out.add(k.trim()));
  if(s[0]==='=')s.replace(/\[\s*\?([^\]]+)\]/g,(_,k)=>out.add(k.trim()));
  return [...out];}

/* ---------- 求值 ---------- */
function evalContent(str,c){
  if(str==null)return '';
  const ctx=getCtx(c);str=String(str);
  if(str[0]==='='){ // 表达式模式
    try{return evalExpr(str.slice(1),ctx);}catch(e){ctx.errors=(ctx.errors||[]);ctx.errors.push(e.message);return '⚠'+e.message;}
  }
  return str.replace(/\{([^{}]+)\}/g,(_,k)=>fieldVal(k,ctx)); // 插值 {字段}，字段名可含中文 / 空格
}
const num=(v,fn)=>{const s=String(v??'').trim().replace(/,/g,'');const n=Number(s);
  if(s===''||!isFinite(n))throw new Error(fn+'() 需要数字，收到 "'+v+'"');return n;};
const clean=n=>String(+(+n).toFixed(10));
const truthy=v=>{const s=String(v??'').trim().toLowerCase();return s!==''&&s!=='0'&&s!=='false'&&s!=='否';};
function cmp(a,b){const x=Number(a),y=Number(b);
  if(String(a).trim()!==''&&String(b).trim()!==''&&isFinite(x)&&isFinite(y))return x<y?-1:x>y?1:0;
  a=String(a??'');b=String(b??'');return a<b?-1:a>b?1:0;}
function gs1Check(d){d=String(d).replace(/\s/g,'');if(!/^\d+$/.test(d))throw new Error('mod10() 需要数字串');
  let s=0;for(let i=0;i<d.length;i++)s+=(+d[d.length-1-i])*(i%2===0?3:1);return String((10-s%10)%10);}
const C43='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
function mod43(s){s=String(s).toUpperCase();let t=0;
  for(const ch of s){const i=C43.indexOf(ch);if(i<0)throw new Error('mod43() 不支持字符 '+ch);t+=i;}return C43[t%43];}
const FUNCS={
  left:(a)=>String(a[0]??'').slice(0,Number(a[1])||0),
  right:(a)=>{const s=String(a[0]??''),n=Number(a[1])||0;return n?s.slice(-n):'';},
  mid:(a)=>{const s=String(a[0]??''),st=(Number(a[1])||1)-1;return a[2]!=null?s.substr(st,Number(a[2])):s.substr(st);},
  upper:(a)=>String(a[0]??'').toUpperCase(),
  lower:(a)=>String(a[0]??'').toLowerCase(),
  trim:(a)=>String(a[0]??'').trim(),
  concat:(a)=>a.map(x=>String(x)).join(''),
  len:(a)=>String([...String(a[0]??'')].length),
  replace:(a)=>String(a[0]??'').split(String(a[1]??'')).join(String(a[2]??'')),
  padl:(a)=>String(a[0]??'').padStart(Number(a[1])||0,String(a[2]??'0')||'0'),
  padr:(a)=>String(a[0]??'').padEnd(Number(a[1])||0,String(a[2]??' ')||' '),
  add:(a)=>clean(a.reduce((s,x)=>s+num(x,'add'),0)),
  sub:(a)=>clean(num(a[0],'sub')-a.slice(1).reduce((s,x)=>s+num(x,'sub'),0)),
  mul:(a)=>clean(a.reduce((s,x)=>s*num(x,'mul'),1)),
  div:(a)=>{const d=num(a[1],'div');if(d===0)throw new Error('div() 除数为 0');return clean(num(a[0],'div')/d);},
  round:(a)=>{const p=Math.pow(10,Number(a[1])||0);return clean(Math.round(num(a[0],'round')*p)/p);},
  int:(a)=>String(Math.trunc(num(a[0],'int'))),
  fixed:(a)=>num(a[0],'fixed').toFixed(Math.max(0,Math.min(10,Number(a[1])||0))),
  if:(a)=>truthy(a[0])?String(a[1]??''):String(a[2]??''),
  eq:(a)=>cmp(a[0],a[1])===0?'1':'0', ne:(a)=>cmp(a[0],a[1])!==0?'1':'0',
  gt:(a)=>cmp(a[0],a[1])>0?'1':'0', lt:(a)=>cmp(a[0],a[1])<0?'1':'0',
  ge:(a)=>cmp(a[0],a[1])>=0?'1':'0', le:(a)=>cmp(a[0],a[1])<=0?'1':'0',
  and:(a)=>a.every(truthy)?'1':'0', or:(a)=>a.some(truthy)?'1':'0', not:(a)=>truthy(a[0])?'0':'1',
  empty:(a)=>String(a[0]??'').trim()===''?'1':'0',
  mod10:(a)=>gs1Check(a[0]), mod43:(a)=>mod43(a[0]),
};
function evalExpr(src,c){
  const ctx=getCtx(c);let i=0;
  const skip=()=>{while(i<src.length&&/\s/.test(src[i]))i++;};
  function expr(){let v=term();skip();while(src[i]==='+'){i++;v=v+term();skip();}return v;}
  function args(){const a=[];skip();if(src[i]===')')return a;a.push(expr());skip();
    while(src[i]===','){i++;a.push(expr());skip();}return a;}
  function term(){
    skip();const c=src[i];
    if(c==='"'){i++;let s='';while(i<src.length&&src[i]!=='"'){if(src[i]==='\\'&&i+1<src.length){i++;s+=src[i]==='n'?'\n':src[i];i++;continue;}s+=src[i++];}
      if(src[i]!=='"')throw new Error('字符串缺少结尾引号');i++;return s;}
    if(c==='['){i++;let n='';while(i<src.length&&src[i]!==']')n+=src[i++];i++;return fieldVal(n,ctx);}
    if(c==='{'){i++;let n='';while(i<src.length&&src[i]!=='}')n+=src[i++];i++;return fieldVal(n,ctx);}
    if(/[0-9.\-]/.test(c||'')){let n=src[i++];while(i<src.length&&/[0-9.]/.test(src[i]))n+=src[i++];return n;}
    if(c==='('){i++;const v=expr();skip();if(src[i]===')')i++;return v;}
    if(/[A-Za-z_]/.test(c||'')){let fn='';while(i<src.length&&/[A-Za-z0-9_]/.test(src[i]))fn+=src[i++];
      skip();if(src[i]==='('){i++;const a=args();skip();if(src[i]!==')')throw new Error(fn+'( 缺少右括号');i++;return callFn(fn.toLowerCase(),a);}
      throw new Error('未知标记 '+fn);}
    throw new Error('无法解析: '+src.slice(i));
  }
  function callFn(fn,a){
    if(fn==='today')return fmtDate(ctx.now,a[0]||'YYYY-MM-DD');
    if(fn==='date')return fmtDate(addDate(ctx.now,a[1]||0,a[2]||'d'),a[0]||'YYYY-MM-DD');      // date(格式,偏移,单位)
    if(fn==='adddate')return fmtDate(addDate(parseDate(a[0]),a[1]||0,a[2]||'d'),a[3]||'YYYY-MM-DD'); // adddate(日期,偏移,单位,格式)
    if(fn==='fmtdate')return fmtDate(parseDate(a[0]),a[1]||'YYYY-MM-DD');
    const f=FUNCS[fn];if(!f)throw new Error('不支持函数 '+fn);return f(a);
  }
  const r=expr();skip();
  if(i<src.length)throw new Error('无法解析: '+src.slice(i));
  return r;
}

/* ---------- 数据文本 ---------- */
// 字节 → 文本：先按 UTF-8（严格）解，失败按 GB18030（含 GBK，中文版 Excel「另存为 CSV」默认编码）
function decodeText(bytes){
  const u8=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(u8).replace(/^\uFEFF/,'');}
  catch(e){return new TextDecoder('gb18030').decode(u8).replace(/^\uFEFF/,'');}
}
// CSV / TSV：逐字符状态机，支持 "..." 引用、"" 转义、引号内换行；分隔符自动识别 Tab / 分号 / 逗号
function parseData(text){
  let t=String(text==null?'':text).replace(/^\uFEFF/,'');
  if(!t.trim())return null;
  const first=t.split(/\r?\n/,1)[0],count=c=>first.split(c).length-1;
  const sep=count('\t')>0?'\t':(count(';')>count(',')?';':',');
  const recs=[];let row=[],cur='',q=false,quoted=false;
  const endCell=()=>{row.push(quoted?cur:cur.trim());cur='';quoted=false;};
  const endRow=()=>{endCell();if(row.length>1||row[0]!=='')recs.push(row);row=[];};
  for(let i=0;i<t.length;i++){const ch=t[i];
    if(q){if(ch==='"'){if(t[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;continue;}
    if(ch==='"'&&cur.trim()===''){q=true;quoted=true;cur='';}
    else if(ch===sep)endCell();
    else if(ch==='\r'){if(t[i+1]!=='\n')endRow();}
    else if(ch==='\n')endRow();
    else cur+=ch;
  }
  if(cur!==''||row.length)endRow();
  if(recs.length<2)return null;
  const head=recs[0].map((h,i)=>h.trim()||('列'+(i+1)));
  return recs.slice(1).map(c=>{const o={};head.forEach((h,i)=>o[h]=c[i]??'');return o;});
}

const api={fmtDate,addDate,parseDate,makeCtx,fieldVal,evalContent,evalExpr,promptNames,decodeText,parseData};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
