/* 读取 Excel .xlsx 的第一个工作表（原创实现，无第三方依赖）。
   .xlsx 是 zip 包：解析 zip 目录 → 解压（浏览器用 DecompressionStream，Node 用 zlib）→ 读工作表 XML。
   日期格式的单元格（内置格式 14–22 或自定义格式含 y/d）转成 YYYY-MM-DD。
   浏览器：<script src="src/xlsx.js"> 后用 XLSX.readRows(arrayBuffer)；Node（测试）：require('./src/xlsx.js')。 */
(function(root){
const isNode=typeof module!=='undefined'&&module.exports;

async function inflateRaw(u8){
  if(isNode)return new Uint8Array(require('zlib').inflateRawSync(Buffer.from(u8)));
  const ds=new DecompressionStream('deflate-raw');
  const buf=await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
// zip 目录：文件名 → 读取函数
function zipEntries(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  let eocd=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--)if(dv.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error('不是有效的 .xlsx 文件');
  const n=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);const map={};
  const dec=new TextDecoder();
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50)throw new Error('xlsx 目录损坏');
    const method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),
      el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    const name=dec.decode(u8.subarray(p+46,p+46+nl));
    map[name]=async()=>{const ln=dv.getUint16(off+26,true),le=dv.getUint16(off+28,true),start=off+30+ln+le;
      const raw=u8.subarray(start,start+csize);
      if(method===0)return raw;if(method===8)return inflateRaw(raw);throw new Error('不支持的压缩方式 '+method);};
    p+=46+nl+el+cl;
  }
  return map;
}
const unxml=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
  .replace(/&#x([0-9a-f]+);/gi,(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(+d)).replace(/&amp;/g,'&');
const attr=(tag,name)=>{const m=tag.match(new RegExp('\\s'+name+'="([^"]*)"'));return m?unxml(m[1]):null;};
// <si> 里可能有多个 <t>（富文本），拼起来
const texts=xml=>{let s='';xml.replace(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g,(_,t)=>{s+=unxml(t);});return s;};
function colIndex(ref){let n=0;for(const c of ref.replace(/\d+/g,''))n=n*26+(c.charCodeAt(0)-64);return n-1;}
const pad=n=>String(n).padStart(2,'0');
function serialToDate(v){const ms=Math.round((v-25569)*864e5),d=new Date(ms); // Excel 1900 日期系统
  const s=d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
  const t=d.getUTCHours()||d.getUTCMinutes()||d.getUTCSeconds();
  return t?s+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+(d.getUTCSeconds()?':'+pad(d.getUTCSeconds()):''):s;}
const cleanNum=v=>{const n=+v;return isFinite(n)?String(+n.toPrecision(15)):v;};

async function readSheet(buf){
  const u8=buf instanceof Uint8Array?buf:new Uint8Array(buf);
  const z=zipEntries(u8),dec=new TextDecoder('utf-8');
  const read=async name=>z[name]?dec.decode(await z[name]()):null;
  // 第一个工作表的路径
  let sheetPath='xl/worksheets/sheet1.xml';
  const wb=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
  if(wb&&rels){const st=wb.match(/<sheet\s[^>]*>/);const rid=st&&attr(st[0],'r:id');
    if(rid){const rel=(rels.match(/<Relationship\s[^>]*>/g)||[]).find(r=>attr(r,'Id')===rid);
      if(rel){const t=attr(rel,'Target');sheetPath=t.startsWith('/')?t.slice(1):'xl/'+t.replace(/^\.\//,'');}}}
  const sheet=await read(sheetPath);if(!sheet)throw new Error('找不到工作表');
  const ss=await read('xl/sharedStrings.xml');
  const shared=ss?(ss.match(/<si>[\s\S]*?<\/si>/g)||[]).map(texts):[];
  // 日期样式
  const dateStyle=new Set();const styles=await read('xl/styles.xml');
  if(styles){const fmts={};(styles.match(/<numFmt\s[^>]*>/g)||[]).forEach(t=>{fmts[attr(t,'numFmtId')]=attr(t,'formatCode')||'';});
    const xfs=(styles.match(/<cellXfs[\s\S]*?<\/cellXfs>/)||[''])[0];
    (xfs.match(/<xf\s[^>]*>/g)||[]).forEach((t,i)=>{const id=+attr(t,'numFmtId');
      const code=(fmts[id]||'').replace(/"[^"]*"|\[[^\]]*\]/g,'');
      if((id>=14&&id<=22)||(id>=45&&id<=47)||/[yd]/i.test(code))dateStyle.add(i);});}
  const rows=[];
  (sheet.match(/<row[\s>][\s\S]*?<\/row>|<row\s[^>]*\/>/g)||[]).forEach(r=>{
    const rn=+(attr(r.match(/<row[^>]*>/)[0],'r')||rows.length+1)-1;const row=[];
    (r.match(/<c\s[^>]*\/>|<c\s[^>]*>[\s\S]*?<\/c>/g)||[]).forEach(c=>{
      const head=c.match(/<c\s[^>]*>/)[0],ref=attr(head,'r'),t=attr(head,'t'),s=+attr(head,'s');
      const ci=ref?colIndex(ref):row.length;const vm=c.match(/<v>([\s\S]*?)<\/v>/);let v='';
      if(t==='s')v=vm?shared[+vm[1]]??'':'';
      else if(t==='inlineStr')v=texts(c);
      else if(t==='b')v=vm&&vm[1]==='1'?'TRUE':'FALSE';
      else if(vm){v=unxml(vm[1]);if(t!=='str'&&t!=='e')v=dateStyle.has(s)&&isFinite(+v)?serialToDate(+v):cleanNum(v);}
      row[ci]=v;});
    rows[rn]=row;});
  return Array.from(rows,r=>Array.from(r||[],v=>v??''));
}
// 第一行为表头 → [{字段:值}]
async function readRows(buf){
  const g=(await readSheet(buf)).filter(r=>r.some(v=>String(v).trim()!==''));
  if(g.length<2)return null;
  const head=g[0].map((h,i)=>String(h).trim()||('列'+(i+1)));
  return g.slice(1).map(r=>{const o={};head.forEach((h,i)=>o[h]=r[i]??'');return o;});
}
// [{…}] → 制表符文本（可回填到数据框，含换行 / 制表符的单元格加引号）
function toTSV(rows){if(!rows||!rows.length)return '';const head=Object.keys(rows[0]);
  const q=v=>{v=String(v??'');return /[\t\n"]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  return [head.map(q).join('\t')].concat(rows.map(r=>head.map(h=>q(r[h])).join('\t'))).join('\n');}

const api={readSheet,readRows,toTSV,zipEntries};
if(isNode)module.exports=api;else root.XLSX=api;
})(typeof window!=='undefined'?window:globalThis);
