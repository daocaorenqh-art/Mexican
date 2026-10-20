/* 条码 / 二维码编码器（原创实现，无第三方依赖）。
   浏览器：<script src="src/barcodes.js"> 后以全局变量使用；Node（测试）：require('./src/barcodes.js')。 */
(function(root){
/* ============================================================
   原创二维码编码器：QR Code（ISO/IEC 18004）+ DataMatrix ECC200（ISO/IEC 16022）
   纯 JS、离线可用、无第三方依赖。输出布尔矩阵 modules[y][x]（true=深色）。
   ============================================================ */
const Codes2D=(()=>{

/* ---------------- QR Code ---------------- */
// 每块纠错码字数 / 纠错块数，索引 [ecl L,M,Q,H][version 1..40]
const QR_ECC=[
 [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
 [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
 [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]];
const QR_BLOCKS=[
 [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
 [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
 [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
 [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]];
const ECL_IDX={L:0,M:1,Q:2,H:3}, ECL_FMT={L:1,M:0,Q:3,H:2};

function rawModules(ver){let r=(16*ver+128)*ver+64;
  if(ver>=2){const n=Math.floor(ver/7)+2;r-=(25*n-10)*n-55;if(ver>=7)r-=36;}return r;}
function dataCodewords(ver,e){return Math.floor(rawModules(ver)/8)-QR_ECC[e][ver]*QR_BLOCKS[e][ver];}
// GF(256) 乘法，本原多项式 0x11D
function gfMul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z&0xFF;}
function rsDivisor(deg){const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
  for(let i=0;i<deg;i++){for(let j=0;j<r.length;j++){r[j]=gfMul(r[j],root);if(j+1<r.length)r[j]^=r[j+1];}root=gfMul(root,2);}return r;}
function rsRemainder(data,div){const r=div.map(()=>0);
  for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>r[i]^=gfMul(c,f));}return r;}
const bit=(x,i)=>((x>>>i)&1)!==0;

function encodeQR(text,eclName){
  const ecl=eclName||'M', e=ECL_IDX[ecl];
  const bytes=Array.from(new TextEncoder().encode(String(text)));
  let ver=1;
  for(;ver<=40;ver++){const need=4+(ver<=9?8:16)+bytes.length*8;if(need<=dataCodewords(ver,e)*8)break;}
  if(ver>40)throw new Error('二维码数据过长');
  // 1) 数据位流：字节模式
  const bb=[];const put=(v,n)=>{for(let i=n-1;i>=0;i--)bb.push((v>>>i)&1);};
  put(4,4);put(bytes.length,ver<=9?8:16);bytes.forEach(b=>put(b,8));
  const cap=dataCodewords(ver,e)*8;
  put(0,Math.min(4,cap-bb.length));put(0,(8-bb.length%8)%8);
  for(let p=0xEC;bb.length<cap;p^=0xEC^0x11)put(p,8);
  const data=[];for(let i=0;i<bb.length;i+=8){let v=0;for(let j=0;j<8;j++)v=(v<<1)|bb[i+j];data.push(v);}
  // 2) 分块 + RS 纠错 + 交织
  const nb=QR_BLOCKS[e][ver], el=QR_ECC[e][ver], raw=Math.floor(rawModules(ver)/8);
  const nShort=nb-raw%nb, shortLen=Math.floor(raw/nb), div=rsDivisor(el), blocks=[];
  for(let i=0,k=0;i<nb;i++){const d=data.slice(k,k+shortLen-el+(i<nShort?0:1));k+=d.length;
    const ecc=rsRemainder(d,div);if(i<nShort)d.push(0);blocks.push(d.concat(ecc));}
  const cw=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-el||j>=nShort)cw.push(b[i]);});
  // 3) 矩阵 + 功能图形
  const size=ver*4+17;
  const M=Array.from({length:size},()=>new Array(size).fill(false));
  const F=Array.from({length:size},()=>new Array(size).fill(false));
  const setF=(x,y,d)=>{M[y][x]=d;F[y][x]=true;};
  for(let i=0;i<size;i++){setF(6,i,i%2===0);setF(i,6,i%2===0);}
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;
    if(x>=0&&x<size&&y>=0&&y<size)setF(x,y,d!==2&&d!==4);}};
  finder(3,3);finder(size-4,3);finder(3,size-4);
  let al=[];if(ver>1){const n=Math.floor(ver/7)+2,step=ver===32?26:Math.ceil((ver*4+4)/(n*2-2))*2;
    al=[6];for(let pos=ver*4+10;al.length<n;pos-=step)al.splice(1,0,pos);}
  for(let i=0;i<al.length;i++)for(let j=0;j<al.length;j++){
    if((i===0&&j===0)||(i===0&&j===al.length-1)||(i===al.length-1&&j===0))continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)setF(al[i]+dx,al[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
  const drawFormat=mask=>{const d=ECL_FMT[ecl]<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);
    const b=(d<<10|r)^0x5412;
    for(let i=0;i<=5;i++)setF(8,i,bit(b,i));setF(8,7,bit(b,6));setF(8,8,bit(b,7));setF(7,8,bit(b,8));
    for(let i=9;i<15;i++)setF(14-i,8,bit(b,i));
    for(let i=0;i<8;i++)setF(size-1-i,8,bit(b,i));
    for(let i=8;i<15;i++)setF(8,size-15+i,bit(b,i));setF(8,size-8,true);};
  drawFormat(0);
  if(ver>=7){let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=ver<<12|r;
    for(let i=0;i<18;i++){const c=bit(b,i),a=size-11+i%3,q=Math.floor(i/3);setF(a,q,c);setF(q,a,c);}}
  // 4) 之字形填码字
  let idx=0;
  for(let right=size-1;right>=1;right-=2){if(right===6)right=5;
    for(let v=0;v<size;v++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-v:v;
      if(!F[y][x]&&idx<cw.length*8){M[y][x]=bit(cw[idx>>>3],7-(idx&7));idx++;}}}
  // 5) 掩码择优（惩罚分最低）
  const maskFn=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,
    (x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,
    (x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const applyMask=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!F[y][x]&&maskFn[m](x,y))M[y][x]=!M[y][x];};
  const penalty=()=>{let s=0;
    const addH=(len,h)=>{if(h[0]===0)len+=size;h.pop();h.unshift(len);};
    const cnt=h=>{const n=h[1],core=n>0&&h[2]===n&&h[3]===n*3&&h[4]===n&&h[5]===n;
      return (core&&h[0]>=n*4&&h[6]>=n?1:0)+(core&&h[6]>=n*4&&h[0]>=n?1:0);};
    const term=(col,len,h)=>{if(col){addH(len,h);len=0;}len+=size;addH(len,h);return cnt(h);};
    for(let pass=0;pass<2;pass++)for(let a=0;a<size;a++){let col=false,run=0;const h=[0,0,0,0,0,0,0];
      for(let b2=0;b2<size;b2++){const c=pass?M[b2][a]:M[a][b2];
        if(c===col){run++;if(run===5)s+=3;else if(run>5)s++;}
        else{addH(run,h);if(!col)s+=cnt(h)*40;col=c;run=1;}}
      s+=term(col,run,h)*40;}
    for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])s+=3;}
    let dark=0;M.forEach(r=>r.forEach(c=>{if(c)dark++;}));const tot=size*size;
    s+=(Math.ceil(Math.abs(dark*20-tot*10)/tot)-1)*10;return s;};
  let best=0,bestScore=Infinity;
  for(let m=0;m<8;m++){applyMask(m);drawFormat(m);const p=penalty();if(p<bestScore){bestScore=p;best=m;}applyMask(m);}
  applyMask(best);drawFormat(best);
  return {size,modules:M,version:ver,mask:best,ecl};
}

/* ---------------- DataMatrix ECC200（方形） ---------------- */
// [符号边长, 数据区边长, 每边数据区数, 数据码字, 纠错码字, 交织块数]
const DM_SIZES=[
 [10,8,1,3,5,1],[12,10,1,5,7,1],[14,12,1,8,10,1],[16,14,1,12,12,1],[18,16,1,18,14,1],
 [20,18,1,22,18,1],[22,20,1,30,20,1],[24,22,1,36,24,1],[26,24,1,44,28,1],
 [32,14,2,62,36,1],[36,16,2,86,42,1],[40,18,2,114,48,1],[44,20,2,144,56,1],[48,22,2,174,68,1],
 [52,24,2,204,84,2],[64,14,4,280,112,2],[72,16,4,368,144,4],[80,18,4,456,192,4],
 [88,20,4,576,224,4],[96,22,4,696,272,4],[104,24,4,816,336,6],[120,18,6,1050,408,6],[132,20,6,1304,496,8]];
// GF(256)，本原多项式 0x12D
const DEXP=new Array(512),DLOG=new Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){DEXP[i]=x;DLOG[x]=i;x<<=1;if(x&0x100)x^=0x12D;}for(let i=255;i<512;i++)DEXP[i]=DEXP[i-255];})();
const dmMul=(a,b)=>(a&&b)?DEXP[DLOG[a]+DLOG[b]]:0;
function dmECC(data,n){let g=[1];
  for(let i=1;i<=n;i++){const a=DEXP[i],ng=new Array(g.length+1).fill(0);
    for(let j=0;j<g.length;j++){ng[j]^=g[j];ng[j+1]^=dmMul(g[j],a);}g=ng;}
  const r=new Array(n).fill(0);
  for(const d of data){const f=d^r[0];r.shift();r.push(0);for(let i=0;i<n;i++)r[i]^=dmMul(g[i+1],f);}
  return r;}
function dmASCII(text,gs1){const bytes=Array.from(new TextEncoder().encode(String(text)));const out=gs1?[232]:[];
  for(let i=0;i<bytes.length;i++){const c=bytes[i],n=bytes[i+1];
    if(gs1&&c===29){out.push(232);continue;}  // GS1 分隔符 → FNC1
    if(c>=48&&c<=57&&n!==undefined&&n>=48&&n<=57){out.push(130+(c-48)*10+(n-48));i++;}
    else if(c<128)out.push(c+1);
    else{out.push(235);out.push(c-128+1);}}
  return out;}
function dmPlacement(nrow,ncol){
  const A=new Array(nrow*ncol).fill(0);
  const mod=(row,col,chr,b)=>{if(row<0){row+=nrow;col+=4-((nrow+4)%8);}if(col<0){col+=ncol;row+=4-((ncol+4)%8);}A[row*ncol+col]=10*chr+b;};
  const utah=(r,c,chr)=>{mod(r-2,c-2,chr,1);mod(r-2,c-1,chr,2);mod(r-1,c-2,chr,3);mod(r-1,c-1,chr,4);
    mod(r-1,c,chr,5);mod(r,c-2,chr,6);mod(r,c-1,chr,7);mod(r,c,chr,8);};
  const c1=chr=>{mod(nrow-1,0,chr,1);mod(nrow-1,1,chr,2);mod(nrow-1,2,chr,3);mod(0,ncol-2,chr,4);mod(0,ncol-1,chr,5);mod(1,ncol-1,chr,6);mod(2,ncol-1,chr,7);mod(3,ncol-1,chr,8);};
  const c2=chr=>{mod(nrow-3,0,chr,1);mod(nrow-2,0,chr,2);mod(nrow-1,0,chr,3);mod(0,ncol-4,chr,4);mod(0,ncol-3,chr,5);mod(0,ncol-2,chr,6);mod(0,ncol-1,chr,7);mod(1,ncol-1,chr,8);};
  const c3=chr=>{mod(nrow-3,0,chr,1);mod(nrow-2,0,chr,2);mod(nrow-1,0,chr,3);mod(0,ncol-2,chr,4);mod(0,ncol-1,chr,5);mod(1,ncol-1,chr,6);mod(2,ncol-1,chr,7);mod(3,ncol-1,chr,8);};
  const c4=chr=>{mod(nrow-1,0,chr,1);mod(nrow-1,ncol-1,chr,2);mod(0,ncol-3,chr,3);mod(0,ncol-2,chr,4);mod(0,ncol-1,chr,5);mod(1,ncol-3,chr,6);mod(1,ncol-2,chr,7);mod(1,ncol-1,chr,8);};
  let chr=1,row=4,col=0;
  do{
    if(row===nrow&&col===0)c1(chr++);
    if(row===nrow-2&&col===0&&ncol%4)c2(chr++);
    if(row===nrow-2&&col===0&&ncol%8===4)c3(chr++);
    if(row===nrow+4&&col===2&&!(ncol%8))c4(chr++);
    do{if(row<nrow&&col>=0&&!A[row*ncol+col])utah(row,col,chr++);row-=2;col+=2;}while(row>=0&&col<ncol);
    row+=1;col+=3;
    do{if(row>=0&&col<ncol&&!A[row*ncol+col])utah(row,col,chr++);row+=2;col-=2;}while(row<nrow&&col>=0);
    row+=3;col+=1;
  }while(row<nrow||col<ncol);
  if(!A[nrow*ncol-1]){A[nrow*ncol-1]=A[nrow*ncol-ncol-2]=1;}
  return A;}
// 含非 ASCII（如中文）时：ECI 26（UTF-8）+ Base256，扫码器按 UTF-8 还原，不再按 Latin-1 乱码
function dmBase256UTF8(text){const bytes=Array.from(new TextEncoder().encode(String(text)));
  const out=[241,27,231];const n=bytes.length;
  const body=(n<=249?[n]:[Math.floor(n/250)+249,n%250]).concat(bytes);
  for(const v of body){const pos=out.length+1,r=((149*pos)%255)+1,t=v+r;out.push(t<=255?t:t-256);}
  return out;}
function encodeDM(text,opt){
  const isAscii=!/[^\x00-\x7f]/.test(String(text)),gs1=!!(opt&&opt.gs1);
  const data=(isAscii||gs1)?dmASCII(text,gs1):dmBase256UTF8(text);
  const spec=DM_SIZES.find(s=>s[3]>=data.length);
  if(!spec)throw new Error('DataMatrix 数据过长');
  const [S,R,nReg,nData,nEcc,nBlk]=spec;
  // 填充：首个 129，其后按 253 状态随机化
  const cws=data.slice();
  if(cws.length<nData)cws.push(129);
  while(cws.length<nData){const pos=cws.length+1;const t=129+((149*pos)%253)+1;cws.push(t<=254?t:t-254);}
  // 交织：数据按块轮转，块内各自算纠错
  const eccPer=nEcc/nBlk, all=cws.slice();
  for(let b=0;b<nBlk;b++){const blk=[];for(let i=b;i<nData;i+=nBlk)blk.push(cws[i]);
    const e=dmECC(blk,eccPer);for(let j=0;j<eccPer;j++)all[nData+b+j*nBlk]=e[j];}
  // 放置到映射矩阵（不含寻边）
  const mapN=nReg*R, A=dmPlacement(mapN,mapN);
  const dark=v=>{if(v===1)return true;if(v<10)return false;const c=all[Math.floor(v/10)-1],b=v%10;return ((c>>(8-b))&1)===1;};
  // 组装：每个数据区外围 L 形实线寻边（左+下）+ 时钟线（上+右）
  const M=Array.from({length:S},()=>new Array(S).fill(false)),T=R+2;
  for(let rr=0;rr<nReg;rr++)for(let rc=0;rc<nReg;rc++){const y0=rr*T,x0=rc*T;
    for(let i=0;i<T;i++){M[y0+T-1][x0+i]=true;M[y0+i][x0]=true;M[y0][x0+i]=i%2===0;M[y0+i][x0+T-1]=i%2===1;}
    M[y0+T-1][x0+T-1]=true;
    for(let r=0;r<R;r++)for(let c=0;c<R;c++)M[y0+1+r][x0+1+c]=dark(A[(rr*R+r)*mapN+rc*R+c]);}
  return {size:S,modules:M};
}
return {encodeQR,encodeDM};
})();

/* ---------- Code128 原创编码 ---------- */
const C128 = (() => {
  const PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
    "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
    "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
    "114131","311141","411131","211412","211214","211232","2331112"
  ];
  const START_B=104, START_C=105, STOP=106;
  const isDigit=c=>c>='0'&&c<='9';
  function run(s,p){let n=0;while(p+n<s.length&&isDigit(s[p+n]))n++;return n;}
  // 数据里的 \x1d 表示 FNC1（GS1-128：起始后一个、可变长 AI 之后作分隔）；C / B 子集里都是码字 102
  const FNC1='\x1d';
  function encode(data){
    const codes=[]; let i=0, mode, p0=0;
    while(data[p0]===FNC1)p0++;
    if(run(data,p0)>=4){mode='C';codes.push(START_C);} else {mode='B';codes.push(START_B);}
    while(i<data.length){
      if(data[i]===FNC1){codes.push(102);i++;continue;}
      if(mode==='C'){
        const r=run(data,i);
        if(r>=2){const pairs=Math.floor(r/2);for(let p=0;p<pairs;p++){codes.push(parseInt(data.substr(i,2),10));i+=2;}}
        else {codes.push(100);mode='B';}
      } else {
        const r=run(data,i);
        if(r>=4&&(r%2===0||r>=6)){codes.push(99);mode='C';}
        else {const ch=data.charCodeAt(i);
          if(ch<32||ch>126)throw new Error("Code128 仅支持 ASCII 32-126");
          codes.push(ch-32);i++;}
      }
    }
    let sum=codes[0];for(let k=1;k<codes.length;k++)sum+=codes[k]*k;
    codes.push(sum%103);codes.push(STOP);
    return codes.map(c=>PATTERNS[c]).join("");
  }
  // 返回 0/1 模块串
  function modules(data){
    const seq=encode(data);let out="";
    for(let k=0;k<seq.length;k++){const w=+seq[k];out+=(k%2===0?"1":"0").repeat(w);}
    return out;
  }
  return {modules};
})();

/* ---------- 数字类条码公共校验 ----------
   允许空格 / 横线分隔（自动去掉），其余非数字直接报错，不再静默删除；
   给出完整位数时核对校验位，错了就报错，避免打出扫不出的码。 */
function digitsOf(raw,name){const s=String(raw==null?'':raw).replace(/[\s-]/g,'');
  if(!/^\d*$/.test(s))throw new Error(name+' 只能包含数字（收到 "'+raw+'"）');return s;}
function checkGiven(d,ck,name){if(+d[d.length-1]!==ck)throw new Error(name+' 校验位错误：'+d+' 的最后一位应为 '+ck);}

/* ---------- EAN-13 原创编码 ---------- */
const EAN13=(()=>{
  const L=["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
  const G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
  const R=["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
  const PAR=["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
  function checksum(d12){let s=0;for(let i=0;i<12;i++)s+=(+d12[i])*(i%2?3:1);return (10-(s%10))%10;}
  function normalize(raw){
    const d=digitsOf(raw,'EAN-13');
    if(d.length===12)return d+checksum(d);
    if(d.length===13){checkGiven(d,checksum(d),'EAN-13');return d;}
    throw new Error("EAN-13 需要 12 或 13 位数字（收到 "+d.length+" 位）");
  }
  function modules(raw){
    const d=normalize(raw);
    const first=+d[0], left=d.slice(1,7), right=d.slice(7);
    let s="101"; // 左护线
    const par=PAR[first];
    for(let i=0;i<6;i++)s+=(par[i]==='L'?L:G)[+left[i]];
    s+="01010"; // 中护线
    for(let i=0;i<6;i++)s+=R[+right[i]];
    s+="101"; // 右护线
    return {bits:s, text:d, groups:[d[0], d.slice(1,7), d.slice(7)]};
  }
  return {modules};
})();

/* ---------- EAN-8 / UPC-A 原创编码（复用 L/R 码） ---------- */
const EANLR={
  L:["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"],
  R:["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"]
};
const EAN8=(()=>{
  const {L,R}=EANLR;
  const ck=d=>{let s=0;for(let i=0;i<7;i++)s+=(+d[i])*(i%2===0?3:1);return (10-s%10)%10;};
  function modules(raw){let d=digitsOf(raw,'EAN-8');
    if(d.length===7)d+=ck(d);else if(d.length===8)checkGiven(d,ck(d),'EAN-8');else throw new Error('EAN-8 需要 7 或 8 位数字（收到 '+d.length+' 位）');
    let s='101';for(let i=0;i<4;i++)s+=L[+d[i]];s+='01010';for(let i=4;i<8;i++)s+=R[+d[i]];s+='101';
    return {bits:s,text:d};}
  return {modules};
})();
const UPCA=(()=>{
  const {L,R}=EANLR;
  const ck=d=>{let s=0;for(let i=0;i<11;i++)s+=(+d[i])*(i%2===0?3:1);return (10-s%10)%10;};
  function modules(raw){let d=digitsOf(raw,'UPC-A');
    if(d.length===11)d+=ck(d);else if(d.length===12)checkGiven(d,ck(d),'UPC-A');else throw new Error('UPC-A 需要 11 或 12 位数字（收到 '+d.length+' 位）');
    let s='101';for(let i=0;i<6;i++)s+=L[+d[i]];s+='01010';for(let i=6;i<12;i++)s+=R[+d[i]];s+='101';
    return {bits:s,text:d};}
  return {modules};
})();

/* ---------- Code39 原创编码 ---------- */
const C39=(()=>{
  const T={'0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn','U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'};
  function modules(raw){const N=1,W=3;const data=String(raw).toUpperCase();
    const seq=['*',...data,'*'];let s='';
    seq.forEach((ch,idx)=>{const p=T[ch];if(!p)throw new Error('Code39 不支持字符: '+ch);
      for(let i=0;i<9;i++)s+=(i%2===0?'1':'0').repeat(p[i]==='w'?W:N);
      if(idx<seq.length-1)s+='0'.repeat(N);});
    return {bits:s,text:data};}
  return {modules};
})();

/* ---------- ITF-25（交叉 25 码）原创编码 ---------- */
const ITF=(()=>{
  const P={'0':'nnwwn','1':'wnnnw','2':'nwnnw','3':'wwnnn','4':'nnwnw','5':'wnwnn','6':'nwwnn','7':'nnnww','8':'wnnwn','9':'nwnwn'};
  function modules(raw){let d=digitsOf(raw,'ITF-25');if(!d)throw new Error('ITF 需要数字');
    if(d.length%2)d='0'+d;const N=1,W=3;
    let s='1'.repeat(N)+'0'.repeat(N)+'1'.repeat(N)+'0'.repeat(N); // 起始 nnnn
    for(let i=0;i<d.length;i+=2){const a=P[d[i]],b=P[d[i+1]];
      for(let k=0;k<5;k++){s+='1'.repeat(a[k]==='w'?W:N);s+='0'.repeat(b[k]==='w'?W:N);}}
    s+='1'.repeat(W)+'0'.repeat(N)+'1'.repeat(N); // 终止 宽条 窄空 窄条
    return {bits:s,text:d};}
  return {modules};
})();

/* ---------- GS1 应用标识符（AI） ----------
   输入写法：(01)06925253841665(17)261020(10)B26。校验 AI 格式、长度、GTIN/SSCC 校验位、日期；
   生成条码数据（可变长 AI 后加 FNC1 分隔）和人眼可读文字。 */
// [AI 正则, 格式, 名称]；格式 n=数字 an=字母数字，..N=最多 N 位，否则固定位数；chk=末位 GS1 校验位，date=YYMMDD
const GS1_AI=[
  [/^00$/,'n18 chk','SSCC'],[/^0[123]$/,'n14 chk','GTIN'],[/^1[0]$/,'an..20','批号'],[/^1[1-7]$/,'n6 date','日期'],
  [/^20$/,'n2','变体'],[/^21$/,'an..20','序列号'],[/^22$/,'an..20','消费品变体'],[/^23\d$/,'an..28','']
  ,[/^24[01]$/,'an..30',''],[/^242$/,'n..6',''],[/^243$/,'an..20',''],[/^25[0134]$/,'an..30',''],[/^255$/,'n..25',''],
  [/^30$/,'n..8','数量'],[/^3[1-6]\d\d$/,'n6','计量'],[/^37$/,'n..8','数量'],[/^39[0-3]\d$/,'n..18','金额'],
  [/^40[0-3]$/,'an..30',''],[/^41[0-7]$/,'n13 chk','GLN'],[/^42[0]$/,'an..20','邮编'],[/^421$/,'an..12',''],
  [/^42[2-6]$/,'n..15',''],[/^7\d{3}$/,'an..30',''],[/^80\d\d$/,'an..30',''],[/^8200$/,'an..70','网址'],[/^9\d$/,'an..90','内部'],
];
// 预定义定长的 AI 前两位：其后不需要 FNC1 分隔
const GS1_FIXED=new Set(['00','01','02','03','04','11','12','13','14','15','16','17','18','19','20','31','32','33','34','35','36','41']);
const GS1_CSET=/^[!"%&'()*+,\-./0-9:;<=>?A-Z_a-z]*$/; // GS1 AI 编码字符集 82
function gs1Check(d){let s=0;for(let i=0;i<d.length;i++)s+=(+d[d.length-1-i])*(i%2===0?3:1);return (10-s%10)%10;}
function parseGS1(raw){
  const src=String(raw==null?'':raw).trim(),out=[];
  if(!src)throw new Error('GS1 内容为空');
  const re=/\((\d{2,4})\)([^()]*)/g;let m,pos=0;
  while((m=re.exec(src))){
    if(m.index!==pos)throw new Error('GS1 写法应为 (AI)数据(AI)数据…，"'+src.slice(pos,m.index)+'" 无法识别');
    pos=re.lastIndex;
    const ai=m[1],v=m[2],def=GS1_AI.find(d=>d[0].test(ai));
    if(!def)throw new Error('不认识的 GS1 AI ('+ai+')');
    const [fmt,flag]=def[1].split(' '),num=fmt[0]==='n'&&fmt[1]!=='a',var_=fmt.includes('..'),len=+fmt.replace(/\D/g,'');
    if(!v)throw new Error('AI ('+ai+') 没有数据');
    if(num&&!/^\d+$/.test(v))throw new Error('AI ('+ai+') 只能是数字："'+v+'"');
    if(!num&&!GS1_CSET.test(v))throw new Error('AI ('+ai+') 含 GS1 不允许的字符："'+v+'"');
    if(var_?v.length>len:v.length!==len)throw new Error('AI ('+ai+') 应为'+(var_?'最多 ':'')+len+' 位，实际 '+v.length+' 位');
    if(flag==='chk'&&gs1Check(v.slice(0,-1))!==+v.slice(-1))throw new Error('AI ('+ai+') 校验位错误，最后一位应为 '+gs1Check(v.slice(0,-1)));
    if(flag==='date'){const mo=+v.slice(2,4),d=+v.slice(4,6);if(mo<1||mo>12||d>31)throw new Error('AI ('+ai+') 日期无效：'+v+'（YYMMDD）');}
    out.push({ai,v});
  }
  if(pos!==src.length||!out.length)throw new Error('GS1 写法应为 (AI)数据(AI)数据…');
  return out;
}
// 条码数据：\x1d = FNC1 分隔（Code128 → 码字 102，DataMatrix → 码字 232）
function gs1Data(items){return items.map((it,i)=>it.ai+it.v+(i<items.length-1&&!GS1_FIXED.has(it.ai.slice(0,2))?'\x1d':'')).join('');}
const gs1HRI=items=>items.map(it=>'('+it.ai+')'+it.v).join('');
const GS1={parse:parseGS1,data:gs1Data,hri:gs1HRI,check:gs1Check};

/* ---------- UPC-E（零压缩 UPC） ---------- */
const UPCE=(()=>{
  const {L,R}=EANLR,G=L.map(p=>p.split('').reverse().map(b=>b==='1'?'0':'1').join('')); // G = R 码倒序
  const PAR=['EEEOOO','EEOEOO','EEOOEO','EEOOOE','EOEEOO','EOOEEO','EOOOEE','EOEOEO','EOEOOE','EOOEOE'];
  function toUPCA(ns,d){const [a,b,c,x,y,z]=d.split('');
    if(z<='2')return ns+a+b+z+'0000'+c+x+y;
    if(z==='3')return ns+a+b+c+'00000'+x+y;
    if(z==='4')return ns+a+b+c+x+'00000'+y;
    return ns+a+b+c+x+y+'0000'+z;}
  function modules(raw){let d=digitsOf(raw,'UPC-E');
    if(d.length===6)d='0'+d;
    if(d.length!==7&&d.length!==8)throw new Error('UPC-E 需要 6、7 或 8 位数字（收到 '+d.length+' 位）');
    const ns=d[0];if(ns!=='0'&&ns!=='1')throw new Error('UPC-E 首位（数制）只能是 0 或 1');
    const a=toUPCA(ns,d.slice(1,7));let s=0;for(let i=0;i<11;i++)s+=(+a[i])*(i%2===0?3:1);const ck=(10-s%10)%10;
    if(d.length===8)checkGiven(d,ck,'UPC-E');
    const par=PAR[ck];let bits='101';
    for(let i=0;i<6;i++){const odd=(par[i]==='O')!==(ns==='1');bits+=(odd?L:G)[+d[i+1]];}
    bits+='010101';
    return {bits,text:d.slice(0,7)+ck,upca:a+ck};}
  return {modules};
})();

/* ---------- Code 93（含全 ASCII 扩展、双校验字符） ---------- */
const C93=(()=>{
  const CH='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
  const ENC=[0x114,0x148,0x144,0x142,0x128,0x124,0x122,0x150,0x112,0x10A,0x1A8,0x1A4,0x1A2,0x194,0x192,0x18A,0x168,0x164,
    0x162,0x134,0x11A,0x158,0x14C,0x146,0x12C,0x116,0x1B4,0x1B2,0x1AC,0x1A6,0x196,0x19A,0x16C,0x166,0x136,0x13A,
    0x12E,0x1D4,0x1D2,0x1CA,0x16E,0x176,0x1AE,0x126,0x1DA,0x1D6,0x132,0x15E];
  const SH={'$':43,'%':44,'/':45,'+':46}; // 四个移位字符 ($) (%) (/) (+)
  // 全 ASCII：非原生字符用移位字符 + 字母表示
  function expand(ch){const c=ch.charCodeAt(0);
    if(c>127)throw new Error('Code93 仅支持 ASCII');
    if(CH.includes(ch))return [CH.indexOf(ch)];
    const L=(sh,letter)=>[SH[sh],CH.indexOf(letter)];
    if(c===0)return L('%','U');if(c>=1&&c<=26)return L('$',String.fromCharCode(64+c));
    if(c>=27&&c<=31)return L('%',String.fromCharCode(65+c-27));
    if(c>=97&&c<=122)return L('+',String.fromCharCode(c-32));
    const slash='!"#$%&\'()*+,-./',si=slash.indexOf(ch);if(si>=0&&ch!=='$'&&ch!=='%'&&ch!=='+'&&ch!=='-'&&ch!=='.'&&ch!=='/')return L('/',String.fromCharCode(65+si));
    if(ch===':')return L('/','Z');
    const pct={';':'F','<':'G','=':'H','>':'I','?':'J','[':'K','\\':'L',']':'M','^':'N','_':'O','{':'P','|':'Q','}':'R','~':'S','\x7f':'T','@':'V','`':'W'};
    if(pct[ch])return L('%',pct[ch]);
    throw new Error('Code93 不支持字符 '+ch);}
  const bin=v=>v.toString(2).padStart(9,'0');
  function modules(raw){const text=String(raw==null?'':raw);if(!text)throw new Error('Code93 内容为空');
    const vals=[];for(const ch of text)vals.push(...expand(ch));
    const ck=(arr,maxW)=>{let s=0;for(let i=0;i<arr.length;i++)s+=arr[arr.length-1-i]*((i%maxW)+1);return s%47;};
    const c=ck(vals,20),k=ck(vals.concat(c),15);
    const all=[47,...vals,c,k,47];
    return {bits:all.map(v=>bin(ENC[v])).join('')+'1',text};}
  return {modules};
})();

/* ---------- Codabar（库德巴，起止符 A/B/C/D） ---------- */
const CODABAR=(()=>{
  const AL='0123456789-$:/.+ABCD';
  const ENC=[0x003,0x006,0x009,0x060,0x012,0x042,0x021,0x024,0x030,0x048,0x00c,0x018,0x045,0x051,0x054,0x015,0x01A,0x029,0x00B,0x00E];
  function modules(raw){let t=String(raw==null?'':raw).toUpperCase().replace(/\s/g,'');
    if(!t)throw new Error('Codabar 内容为空');
    if(!/^[ABCD]/.test(t))t='A'+t;if(!/[ABCD]$/.test(t)||t.length<3)t=t+'B';
    if(/[ABCD]/.test(t.slice(1,-1)))throw new Error('Codabar 的 A/B/C/D 只能作起止符');
    let bits='';
    for(let i=0;i<t.length;i++){const k=AL.indexOf(t[i]);if(k<0)throw new Error('Codabar 不支持字符 '+t[i]);
      for(let e=0;e<7;e++){const wide=(ENC[k]>>(6-e))&1;bits+=(e%2===0?'1':'0').repeat(wide?3:1);}
      if(i<t.length-1)bits+='0';}
    return {bits,text:t};}
  return {modules};
})();

// 统一入口：一维码类型 → {bits,text}；预览、预检、ZPL 共用，保证三处数据一致
const BARCODE_1D=['barcode','gs1128','ean13','ean8','upca','upce','code39','code93','codabar','itf'];
const BARCODE_2D=['qrcode','datamatrix','gs1dm'];
function encode1D(type,text){
  switch(type){
    case 'barcode':if(String(text)==='')throw new Error('Code128 内容为空');return {bits:C128.modules(String(text)),text:String(text)};
    case 'ean13':return EAN13.modules(text);
    case 'ean8':return EAN8.modules(text);
    case 'upca':return UPCA.modules(text);
    case 'code39':return C39.modules(text);
    case 'itf':return ITF.modules(text);
    case 'gs1128':{const it=GS1.parse(text);return {bits:C128.modules('\x1d'+GS1.data(it)),text:GS1.hri(it)};}
    case 'upce':return UPCE.modules(text);
    case 'code93':return C93.modules(text);
    case 'codabar':return CODABAR.modules(text);
  }
  throw new Error('未知条码类型 '+type);
}
// 二维码：{size, modules}
function encode2D(type,text,ecl){
  if(type==='qrcode')return Codes2D.encodeQR(text||' ',ecl||'M');
  if(type==='datamatrix')return Codes2D.encodeDM(text||' ');
  if(type==='gs1dm')return Codes2D.encodeDM(GS1.data(GS1.parse(text)),{gs1:true});
  throw new Error('未知二维码类型 '+type);
}
const api={Codes2D,C128,EAN13,EAN8,UPCA,C39,ITF,UPCE,C93,CODABAR,GS1,BARCODE_1D,BARCODE_2D,encode1D,encode2D};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
