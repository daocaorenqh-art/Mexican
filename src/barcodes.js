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

/* ---------- EAN / UPC 附加码（2 位 / 5 位，期刊、图书价格等） ----------
   内容写成「主码+附加码」，如 9771234567003+02、9787115123456+52800。
   主码与附加码之间空 9 个模块（标准 7–12）；附加码 = 起始 1011 + 各位数字（L/G 奇偶由数值决定），位间分隔 01 */
const ADDON=(()=>{
  const L=EANLR.L,G=["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
  const P2=["LL","LG","GL","GG"],P5=["GGLLL","GLGLL","GLLGL","GLLLG","LGGLL","LLGGL","LLLGG","LGLGL","LGLLG","LLGLG"];
  const GAP=9;
  function bits(d){
    const par=d.length===2?P2[(+d)%4]:P5[(3*(+d[0]+ +d[2]+ +d[4])+9*(+d[1]+ +d[3]))%10];
    let s='1011';for(let i=0;i<d.length;i++){if(i)s+='01';s+=(par[i]==='L'?L:G)[+d[i]];}
    return s;}
  // 拆出附加码：返回 [主码, 附加码或 '']
  function split(raw){const t=String(raw==null?'':raw);const i=t.lastIndexOf('+');if(i<0)return [t,''];
    const a=t.slice(i+1).replace(/\s/g,'');
    if(!/^(\d{2}|\d{5})$/.test(a))throw new Error('附加码需为 2 位或 5 位数字（收到 "'+t.slice(i+1)+'"）');
    return [t.slice(0,i),a];}
  // 给主码结果接上附加码：bits 连在一起（便于各输出路径直接画），addon 记下附加码起点供界面画短条和上方数字
  function attach(res,a){if(!a)return res;const mainLen=res.bits.length;
    return Object.assign({},res,{bits:res.bits+'0'.repeat(GAP)+bits(a),mainLen,addon:{from:mainLen+GAP,text:a}});}
  return {bits,split,attach,GAP};
})();

/* ---------- ITF-14（箱码，GTIN-14 用交叉 25 码）----------
   13 位自动补 GS1 校验位，14 位核对校验位。保护框（bearer bar）由界面按元素设置画：全框或上下两条，
   粗 BEARER.t 个模块，框内左右各留 BEARER.quiet 个模块静区 */
const BEARER={t:3,quiet:10};
const ITF14={modules(raw){let d=digitsOf(raw,'ITF-14');
  if(d.length===13)d+=gs1Check(d);else if(d.length===14)checkGiven(d,gs1Check(d.slice(0,13)),'ITF-14');
  else throw new Error('ITF-14 需要 13 或 14 位数字（收到 '+d.length+' 位）');
  return {bits:ITF.modules(d).bits,text:d};}};

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

/* ---------- PDF417（ISO/IEC 15438）原创编码 ----------
   数据：文字压缩（大写 / 小写 / 混合 / 标点四个子模式）、≥13 位连续数字用数字压缩、其余按字节压缩；
   含非 ASCII 字符时整段按 UTF-8 并加 ECI 26，扫码枪读出原文（含中文）。
   纠错：GF(929) 上的 Reed-Solomon，等级 0–8（默认按数据量取标准推荐等级）。
   码字图样表是标准数据（3 簇 × 929 个，见 tools/gen-pdf417-table.cjs 的来源说明），每个码字 3 个 base32 字符。
   输出 {w,h,modules}：每行高 3 个模块（标准要求行高 ≥ 3X）。 */
const PDF417_TABLE='qn0tbouluqjgt9sukvl30qhol1ga10l0oa0gln0qrotduljgqpstcvb30lhob1gbn0lroqtubjglpsqsvbholoubroltubpslsvbtuuntqbgt5suivkj0q9ot4ukhgq8s910kgoq8e90gkgc908krgqdst6v9j0kpoqcu9hgkosqcf9gokoe9rgktsqev9poksu9osksf9tskuv9su9sfkb0q5ot2uk9gq4st2f8h0k8oq4e8ggk8c8g88g48r0kdoq6u8pgkcsq6f8ookce8oc8o68tokeu8sskef8se8uuk5gq2st1f890k4oq2e88gk4cq27888k46884k438dgk6sq3f8cok6e8cck678c68c3k7f8e7850k2oq1e84gk2cq17848k26844k2384286o86c86682gq0nk16k13821pbgslsuavij0p9oskuihgp8sskf510igo50girgpdssmv5j0ipopcu5hgios5go5gc5rgitspev5poisu5os5oe5tsiuv5su5uvrb0tlouqur9gtksuqfmh0r8otkemggr8ctk7mg8r86ib0p5osiumr0i9gp4ssifmpgrcstmfdh04ggi8cp47dggmocdg84r0idop6udr04pgicsp6fdpgmssrefdoo4ocdoc4toieudto4ssiefdssmufdse4uuduu4ufdufr5gtisupfm90r4otiem8gr4cti7m88r46m84m82i5gp2sshfmdgi4op2ecp048gr6ep27cog488i46co8mc6i434824dgi6sp3fctg4coi6ecsomeei67csc4c64c34esi7fcus4eecue4e7cu7cvfm50r2othem4gr2cth7m48r26m44r23m42m41450i2op1ecd044gi2cp17ccgm6cr37cc8444i23cc4m63cc246oi3eceo46ci37cecm77ce6463ce3cfecf7m2gr1ctgnm28r16m24r13m22m2142gi1cp0nc6g428i16c68m36i13c64422c6242143cc7cc76c73r0mr0jm11i0m414c34c32c31hb0olosauh9goks2h0h8ooke2ggh8c2g82g42r0hdoomu2pghcsomf2oohce2oc2o62toheu2sshef2se2uu2ufplgsqsudfj90pkosqej8gpkcsq7j88pk6j84pk3h5goiss9fjdgh4ooie6p028gpmeoi76ogjcch466o82846o42dgh6sojf6tg2copnf6sojeeh676sc2c66s62esh7f6us2ee6ue2e72ff6vfrl0tqouterkgtqcut7rk8tq6rk4tq3rk2j50piospend0j4gtresp7ncgrmctr7nc8j44pi3nc4rm3j41250h2oohe6d024gh2coh7et06cgj6cpj7esgnecrn7h23es86c4j63es424126oh3e6eo26ch37euo6ecj77eucnf72636e327e6fe277eve6f7rigtpcusnri8tp6ri4tp3ri2ri1j2gphcsonn6gj28tpnn68rj6ph3n64j22n62j21n6122gh1cogn66g228h16eeg668j36h13ee8n76222ee466222166123ch1n67c236efc676233ef667323nefnrh8tomrh4tojrh2rh1j18pgmn38j14pgjn34rhjn32j11n31218h0m638214h0je78634j1je74n3j211e72631e7163me7me7jtobrghpgbj0ij0h20k61ke3k20h61hglg190gko18ggkcoa7188gk6184gk31dggmsobf1cogme1ccgm71c61c31esgnf1ee1e71ffhl0oqosdehkgoqchk8oq6hk4oq3hk2150gioo9e3d014goreo973cghmcor73c8144gi33c4hm314116ogje3eo16cgj73echn73e616317e3fe1773f7pqgstcuenpq8st6pq4st3pq2pq1higopcjmghi8op6jm8pr6op3jm4hi2jm2hi1jm112gghc36g128opn7eg368hj6gh37e8jn61227e436212136113cghn37c1367fc3761337f637313n37n7fntt8uumtt4uujtt2tt1pp8ssmrr8ttmssjrr4ttjrr2pp1rr1hh8oomjj8hh4oojnn8jj4ppjnn4rrjhh1nn2jj1nn1118ggm338114ggj778334hhjff8774jjj111ff4nnj331ff211m33m11j77m33jffm77jffjtskuubtsitshpokssbrpktsrrpipohrphhgkoobjhkhginjkjhihghnjijhhnjh10kggb31khgr73k31i10hf7k73i31hf7i73hf7h31rf7rts9roqropjgqnhqnhp30q71qf3qf3p0l00kggac0k80k40k20mo0mc0m60m30ne0n7gqggq8od6gq4od3gq2gq10igg9c1mggrcg961m8gr61m4gr31m20i11m10jcg9n1ncgrn1n60j31n30jn1nnot8ot4ot2ot1gp8hr8otmocjhr4otjhr2gp1hr10h81j80h4g8j3n81j40h23n41j20h13n21j10hm1jm0hj3nm1jj3njsuksuisuhoskptksurptioshpthgokocbhpkosrjrkhpigohjrihphjrh0gkg8b1hkgor3jk1hi0gh7nk3ji1hh7ni3jh0gr1hr3jr7nruvauv9suatuqsu9tuposapsqos9rtqpsprtpgoahoqgo9jpqhopnrqulgvast90ukovaet8gukcva7t88uk6t84uk3t82tdgumsvbfqp0tcoumeqogtccum7qo8tc6qo4tc3qo2qtgtesunflp0qsoteelogqscte7lo8qs6lo4qs3lo2ltgqustffbp0lsoqueboglscqu7bo8ls6bo4ls3btglusqvfbsoluebsclu7bs6buslvfbuebu7t50uiov9et4guicv97t48ui6t44ui3t42t41qd0t6oujeqcgt6cuj7qc8t66qc4t63qc2qc1kt0qeot7eksgqect77ks8qe6ks4qe3ks2ks19t0kuoqfe9sgkucqf79s8ku69s4ku39s29uokve9uckv79u69u39ve9v7t2guhcv8nt28uh6t24uh3t22t21q6gt3cuhnq68t36q64t33q62q61kegq7ct3nke8q76ke4q73ke2ke18ugkfcq7n8u8kf68u4kf38u28u18vckfn8v68v38vnt18ugmt14ugjt12t11q38t1mq34t1jq32q31k78q3mk74q3jk72k718f8k7m8f4k7j8f28f18fm8fjt0kugbt0it0hq1kt0rq1iq1hk3kq1rk3ik3h87kk3r87i87ht0at09q0qq0pk1qk1psl0uaov5eskguacv57sk8ua6sk4ua3sk2sk1pd0smoubepcgsmcub7pc8sm6pc4sm3pc2pc1it0peosneisgpecsn7is8pe6is4pe3is2is15t0iuopfe5sgiucpf75s8iu65s4iu35s25uoive5uciv75u65u35ve5v7uqgvdcdfouq8vd6d7suq4vd3d3uuq2uq1sigu9cv4ntmgsi8vdntm8ur6u93tm4si2tm2si1tm1p6gsjcu9nregp68sj6re8tn6sj3re4p62re2p61re1iegp7csjnmugie8p76mu8rf6p73mu4ie2mu2ie1mu14ugifcp7ndug4u8if6du8mv6if3du44u2du24u14vcifndvc4v6dv64v3dv34vnup8vcmcnsup4vcjcjuup2chvup1sh8u8mtj8sh4u8jtj4upjtj2sh1tj1p38shmr78p34shjr74tjjr72p31r71i78p3mmf8i74p3jmf4r7jmf2i71mf14f8i7mcv84f4i7jcv4mfjcv24f1cv14fmcvm4fjcvjuokvcbcbuuoic9vuohsgku8bthkuorthisghthhp1ksgrr3kp1ir3ip1hr3hi3kp1rm7kr3rm7ii3hm7h47ki3rcfk47icfi47hcfh47rcfruoac5vuo9sgatgqsg9tgpp0qr1qp0pr1pi1qm3qi1pm3p43qc7q43pc7puo5sg5tgdp0dr0ti0tm1tsagu5cv2nsa8u56sa4u53sa2sa1omgsbcu5nom8sb6om4sb3om2om1hegoncsbnhe8on6he4on3he2he12ughfconn2u8hf62u4hf32u22u12vchfn2v62v32vnud8v6m6nsud4v6j6juud26hvud1s98u4msr8s94u4jsr4udjsr2s91sr1oj8s9mpn8oj4s9jpn4srjpn2oj1pn1h78ojmjf8h74ojjjf4pnjjf2h71jf12f8h7m6v82f4h7j6v4jfj6v22f16v12fm6vm2fj6vjvekenonbuveiejsn9vvehehuegvuckv6b6buutkvereru69vutiuchepvuths8ku4bspks8itrkutrs8htrisphtrhohks8rpjkohirnkpjiohhrnipjhrnhh3kohrj7kh3infkj7ih3hnfij7hnfh27kh3r6fk27ievk6fi27hevi6fhevh27r6frveaebsn5vve9e9ue8vuca65vusquc9edvusps8asoqs89tpqsoptppogqphqogprjqphprjph1qj3qh1pn7qj3pn7p23q67q23pefq67pefpve5e5ue4vuc5usds85sodtotogdpgtrhth0tj1tn3t21t63te7te2vs58u2ms54u2js52s51ob8s5mob4s5job2ob1gn8obmgn4objgn2gn11f8gnm1f4gnj1f21f11fm1fju6kv3b3buu6i39vu6hs4ku2bsdks4isdis4hsdho9ks4rorko9iorio9horhgjko9rhnkgjihnigjhhnh17kgjr3fk17i3fi17h3fh17r3frv7a7bsjlvv7979u78vu6a35vuequ697dvueps4ascqs49stqscpstpo8qopqo8pprqoppprpghqhjqghpjnqhjpjnp13q37q13p7fq37p7fpfbonluf9snkvf8uf8fv7575uvfdfdu74vfcvu65ueduuts45scdsstttto8dootpptrrtggthhtjjtnnt11t33t77tf5snivf4uf4f72vf6vf2uf2ff1fs2ks2is2ho5ks2ro5io5hgbko5rgbigbh0nkgbr0ni0nh0nru3a1lvu39s2as6qs29s6po4qodqo4podpg9qgrqg9pgrp0jq1nq0jp1npv3l3lu3kvu35u7ds25s6dseto4doctottg8tgpthrt0ht1jt3nt7lsjqv7ku7kf3iv7mvflonqufksnqffkefk77iufmu7iffmffisnpffiefi77hffjffhefh7fgno2qo2pg5qg5p0bq0bps3do2do6tg4tgdt09t0rt1qv3qu3qf7qsjtf7qe7q73pf7rffqontefqcnt7fq6fq37pefre7p7fr7fpcnsnfp6fp37onfpnfomfoj1tf3te3t77tcjun7t67t33sn7tn7sm7sjlfgqnsaf0l7oqjua7gl3sqhva3ol1ua1svb8bfglnsvb4b7oljuvb2b3slhvvb1b1uun8vbmbnsun4vbjbjuun2bhvun1tf8unmtf4unjtf2tf1qv8tfmqv4tfjqv2qv1lv8qvmlv4qvjlv29f0knoqbu97gkjsq9v93okhu91skgv90uv9k9nokruv9i9jskpvv9h9hu9gvujkv9r9ruuji9pvujht7kujrt7it7hqfkt7rqfiqfhkvkqfrkvikvh8ngkbsq5v8jok9u8hsk8v8gu8gfv8q8rskdvv8p8pu8ovuhq8tvuhpt3qt3pq7qq7pkfqkfp8bok5u89sk4v88u88fv8d8du8cvugtt1tq3t85sk2v84u84f86v82u82f5f0inopbu57gijsp9v53oihu51sigv50uv5k5noiruv5i5jsipvv5h5hu5gvubkv5r5ruubi5pvubhsnkubrsnisnhpfksnrpfipfhivkpfriviivhmngrbstlvd70mjor9ud3gmhsr8vd1omgud0smgfd0e4ngibsp5vdng4joi9udjompui8vdhs4gudgu4gfdgfv4q4rsidvvdqv4pdrs4puvdpdpu4ovdovu9q4tvurqu9pdtvurpsjqtnqsjptnpp7qrfqp7prfpifqifpcn0mbor5ucjgm9sr4vchom8ucgsm8fcgecg74boi5ucro49si4vcpsmcvcou48fcofv4d4duvctctu4cvcsvu8tuptshttjtp3tr7ti7tcbgm5sr2vc9om4uc8sm4fc8ec8745si2vcds44uccu44fccf46vcevc5om2uc4sm2fc4ec4742uc6u42fc6fc2sm1fc2ec2741fc3fc1ec172nghbsolv2joh9u2hsh8v2gu2gfv2q2rshdvv2p2pu2ovu5q2tvu5psbqsbponqonphfqhfp6n0jboplu6jgj9spkv6hoj8u6gsj8f6ge6g72boh5u6ro29sh4v6psjcv6ou28f6ofv2d2duv6t6tu2cv6svu4tudts9tsrtojtpnth7tnbgrlstqvej0n9orkuehgn8srkfegon8eegcn87eg66bgj5spiverg69oj4ueponcuj4feos68eeoe687eo725sh2v6ds24uets6cu24fesu6cfesf26v6eveuveb0n5oriue9gn4srife8on4ee8cn47e86e8365oj2uedo64sj2fecsn6fece647ec722u66u22feeu66feefe5gn2srhfe4on2ee4cn27e46e4362sj1fe6s62ee6e627e6721f63fe7fe2on1ee2cn17e26e2361ee3e617e37e1cn0ne16e1360ne1ne0me0j1boglu19sgkv18u18f1du1cvu2ts5tobtgnt3bghlsoqv39ohku38shkf38e38715sgiv3ds14u3cu14f3cf16v3ev7b0jlopqu79gjkspqf78ojke78cjk778678335ohiu7do34shif7cs34e7ce3477c712u36u12f7eu36f7efnlgrqsttff90nkorqef8gnkcrq7f88nk6f84nk3f8275gjisppffdg74ojiefconmeji7fcc746fc6743fc332shhf76s32efes76e327fee767fe711f33f77fffff50niorpef4gnicrp7f48ni6f44ni3f42f4172ojhef6o72cjh7f6cnj7f66723f6331e73e317f7e737f77f2gnhcronf28nh6f24nh3f22f2171cjgnf3c716f36713f3330n71nf3nf18ngmf14ngjf12f1170mf1m70jf1jf0kngbf0if0h70bf0r0lsgav0ku0kf0mv1logqu1ksgqf1ke1k70iu1mu0if1mf3lghqsotf3kohqe3kchq73k63k31isgpf3ms1ie3me1i73m70hf1jf3nf7l0jqopte7kgjqcpt77k8jq67k4jq37k27k13iohpe7mo3ichp77mcjr77m63i37m31he3je1h77ne3j77n7nqgrtctunnq8rt6nq4rt3nq2nq17igjpcpsnfmg7i8jp6fm8nr6jp3fm47i2fm27i1fm13hchon7jc3h6fnc7j63h3fn67j3fn31gn3hn7jnfnnnp8rsmnp4rsjnp2np17h8jomfj87h4jojfj4npjfj27h1fj13gm7hm3gjfjm7hjfjjnokrsbnoinoh7gkjobfhk7gifhi7ghfhh3gb7grfhrnoano97gafgq7g9fgp0au0af0qsgdf0qe0q709f0rf1qogte1qcgt71q61q30pe1re0p71r73qghtcoun3q8ht63q4ht33q23q11pcgsn3rchtn3r61p33r30on1pn3rnjt8pumjt4pujjt2jt13p8hsm7r8jtmhsj7r43p27r23p17r11om3pm1oj7rm3pj7rjruktvbruiruhjskpubntkjsintijshnth3okhsb7pk3oifrk7pi3ohfri7phfrh1ob3or7prfrrruaru9jsansqjs9nsp3oa7oq3o9fpq7opfppru5js5nsd3o57odfot0de0d70tcgen0t60t30cn0tn1t8gum1t4guj1t21t10sm1tm0sj1tjhukovbhuihuh1skgub3tkhur3ti1sh3th0sb1sr3trpvapv9huajuqhu9jup1sa3sq1s97tq3sp7tppv5hu5jud1s53sd7st0em0ej0ukgfb0ui0uh0eb0urgvagv90ua1uq0u91upovl';
const PDF417=(()=>{
  const TXT=0,BYTE=1,NUM=2, ALPHA=0,LOWER=1,MIXED=2,PUNCT=3;
  const MIX=[48,49,50,51,52,53,54,55,56,57,38,13,9,44,58,35,45,46,36,47,43,37,42,61,94,-1,32];
  const PUN=[59,60,62,64,91,92,93,95,96,126,33,13,9,44,58,10,45,46,36,47,34,124,42,40,41,63,123,125,39];
  const mixIdx=new Map(MIX.map((c,i)=>[c,i]).filter(([c])=>c>=0)),punIdx=new Map(PUN.map((c,i)=>[c,i]));
  const isUp=c=>c===32||(c>=65&&c<=90), isLow=c=>c===32||(c>=97&&c<=122);
  const isText=c=>c===9||c===10||c===13||(c>=32&&c<=126);
  let PAT=null;
  const pattern=(k,cw)=>{if(!PAT){PAT=[[],[],[]];for(let k2=0;k2<3;k2++)for(let i=0;i<929;i++)
      PAT[k2][i]=(1<<16)|(parseInt(PDF417_TABLE.substr((k2*929+i)*3,3),32)<<1);}
    return PAT[k][cw];};
  // 文字压缩：先得到 0–29 的子码，再两两合成一个码字
  function text(b,from,to,sub,out){const t=[];
    for(let i=from;i<to;){const c=b[i];
      if(sub===ALPHA){
        if(isUp(c)){t.push(c===32?26:c-65);i++;}
        else if(isLow(c)){sub=LOWER;t.push(27);}
        else if(mixIdx.has(c)){sub=MIXED;t.push(28);}
        else {t.push(29,punIdx.get(c));i++;}}
      else if(sub===LOWER){
        if(isLow(c)){t.push(c===32?26:c-97);i++;}
        else if(isUp(c)){t.push(27,c-65);i++;}
        else if(mixIdx.has(c)){sub=MIXED;t.push(28);}
        else {t.push(29,punIdx.get(c));i++;}}
      else if(sub===MIXED){
        if(mixIdx.has(c)){t.push(mixIdx.get(c));i++;}
        else if(isUp(c)){sub=ALPHA;t.push(28);}
        else if(isLow(c)){sub=LOWER;t.push(27);}
        else if(i+1<to&&punIdx.has(b[i+1])){sub=PUNCT;t.push(25);}
        else {t.push(29,punIdx.get(c));i++;}}
      else {
        if(punIdx.has(c)){t.push(punIdx.get(c));i++;}
        else {sub=ALPHA;t.push(29);}}
    }
    for(let i=0;i<t.length;i+=2)out.push(t[i]*30+(i+1<t.length?t[i+1]:29));
    return sub;}
  // 字节压缩：每 6 字节 → 5 个码字（48 位按 900 进制），余下的字节一个一个
  function bytes(b,from,to,out){const n=to-from;out.push(n%6===0?924:901);let i=from;
    for(;i+6<=to;i+=6){let v=0;for(let j=0;j<6;j++)v=v*256+b[i+j];
      const g=[];for(let j=0;j<5;j++){g.unshift(v%900);v=Math.floor(v/900);}out.push(...g);}
    for(;i<to;i++)out.push(b[i]);}
  // 数字压缩：每 44 位一组，前面加 1 后按 900 进制
  function numeric(b,from,to,out){
    for(let i=from;i<to;i+=44){const e=Math.min(to,i+44);let v=BigInt('1'+String.fromCharCode(...b.slice(i,e)));
      const g=[];while(v>0n){g.unshift(Number(v%900n));v/=900n;}out.push(...g);}}
  const digitRun=(b,p)=>{let n=0;while(p+n<b.length&&b[p+n]>=48&&b[p+n]<=57)n++;return n;};
  function textRun(b,p){let n=0;
    while(p+n<b.length&&isText(b[p+n])){const d=digitRun(b,p+n);if(d>=13)break;n+=Math.max(1,d);}
    return n;}
  function binRun(b,p){let n=0;
    while(p+n<b.length){if(digitRun(b,p+n)>=13)break;let t=0;while(p+n+t<b.length&&isText(b[p+n+t])&&t<5)t++;if(t>=5)break;n++;}
    return n;}
  function highLevel(str){
    const b=[...new TextEncoder().encode(String(str))],out=[];
    if(b.some(c=>c>127))out.push(927,26);   // ECI 26 = UTF-8
    let mode=TXT,sub=ALPHA;
    for(let p=0;p<b.length;){
      const d=digitRun(b,p);
      if(d>=13){out.push(902);mode=NUM;sub=ALPHA;numeric(b,p,p+d,out);p+=d;continue;}
      const t=textRun(b,p);
      if(t>=5||(t>0&&p+t===b.length)){if(mode!==TXT){out.push(900);mode=TXT;sub=ALPHA;}sub=text(b,p,p+t,sub,out);p+=t;continue;}
      const n=Math.max(1,binRun(b,p));
      if(n===1&&mode===TXT)out.push(913,b[p]);
      else {bytes(b,p,p+n,out);mode=BYTE;sub=ALPHA;}
      p+=n;}
    return out;}
  // 纠错码：生成多项式 Π(x − 3^i)，i=1..2^(L+1)
  const genCache={};
  function generator(k){if(genCache[k])return genCache[k];let g=[1];let a=1;
    for(let i=1;i<=k;i++){a=a*3%929;const ng=new Array(g.length+1).fill(0);
      for(let j=0;j<g.length;j++){ng[j+1]=(ng[j+1]+g[j])%929;ng[j]=(ng[j]+(929-a)*g[j])%929;}g=ng;}
    return genCache[k]=g.slice(0,k);}   // 升幂，去掉首一项
  function ecc(data,level){const k=2<<level,c=generator(k),e=new Array(k).fill(0);
    for(const d of data){const t1=(d+e[k-1])%929;
      for(let j=k-1;j>=1;j--)e[j]=(e[j-1]+929-(t1*c[j])%929)%929;
      e[0]=(929-(t1*c[0])%929)%929;}
    return e.map(v=>v?929-v:0).reverse();}
  const autoLevel=n=>n<=40?2:n<=160?3:n<=320?4:5;
  function encode(str,opt){opt=opt||{};
    const data=highLevel(str);
    let level=opt.level===''||opt.level==null||isNaN(+opt.level)?autoLevel(data.length+1):Math.max(0,Math.min(8,Math.floor(+opt.level)));
    let k=2<<level;
    if(data.length+1+k>928){if(opt.level===''||opt.level==null||isNaN(+opt.level))while(level>0&&data.length+1+(2<<level)>928)level--;k=2<<level;}
    if(data.length+1+k>928)throw new Error('PDF417 内容太长（'+(data.length+1)+' 个数据码字，上限 '+(928-k)+'）');
    const n=data.length+1+k;
    // 列数：指定则用；否则选宽高比最接近 3:1 的（宽 17c+69 模块，高 3 行×行数）
    let cols=Math.floor(+opt.cols||0),rows;
    if(cols>0){cols=Math.min(30,cols);rows=Math.max(3,Math.ceil(n/cols));
      if(rows>90)throw new Error('PDF417 列数 '+cols+' 时需要 '+rows+' 行，超过 90 行；请加大列数');}
    else {let best=null;
      for(let c=1;c<=30;c++){const r=Math.max(3,Math.ceil(n/c));if(r>90)continue;
        const ratio=(17*c+69)/(3*r),score=Math.abs(Math.log(ratio/3))+(r*c-n)*0.002;
        if(!best||score<best.score)best={c,r,score};}
      cols=best.c;rows=best.r;}
    const pads=rows*cols-n,cw=[data.length+1+pads,...data,...new Array(pads).fill(900)];
    const all=cw.concat(ecc(cw,level));
    const START=0x1FEA8,STOP=0x3FA29,W=17*cols+69,RH=3,M=[];
    for(let y=0;y<rows;y++){const k3=y%3,b=Math.floor(y/3)*30,
        rI=Math.floor((rows-1)/3),lI=level*3+(rows-1)%3,cI=cols-1;
      const L=b+(k3===0?rI:k3===1?lI:cI),R=b+(k3===0?cI:k3===1?rI:lI);
      const row=[];const put=(v,nb)=>{for(let i=nb-1;i>=0;i--)row.push(((v>>i)&1)===1);};
      put(START,17);put(pattern(k3,L),17);
      for(let x=0;x<cols;x++)put(pattern(k3,all[y*cols+x]),17);
      put(pattern(k3,R),17);put(STOP,18);
      for(let r=0;r<RH;r++)M.push(r?row.slice():row);}
    return {w:W,h:rows*RH,size:W,modules:M,rows,cols,level};}
  return {encode,highLevel,ecc};
})();

// 统一入口：一维码类型 → {bits,text}；预览、预检、ZPL 共用，保证三处数据一致
const BARCODE_1D=['barcode','gs1128','ean13','ean8','upca','upce','code39','code93','codabar','itf','itf14'];
const BARCODE_2D=['qrcode','datamatrix','gs1dm','pdf417'];
function encode1D(type,text){
  switch(type){
    case 'barcode':if(String(text)==='')throw new Error('Code128 内容为空');return {bits:C128.modules(String(text)),text:String(text)};
    case 'ean13':case 'ean8':case 'upca':case 'upce':{const [m,a]=ADDON.split(text);
      return ADDON.attach({ean13:EAN13,ean8:EAN8,upca:UPCA,upce:UPCE}[type].modules(m),a);}
    case 'code39':return C39.modules(text);
    case 'itf':return ITF.modules(text);
    case 'itf14':return ITF14.modules(text);
    case 'gs1128':{const it=GS1.parse(text);return {bits:C128.modules('\x1d'+GS1.data(it)),text:GS1.hri(it)};}
    case 'code93':return C93.modules(text);
    case 'codabar':return CODABAR.modules(text);
  }
  throw new Error('未知条码类型 '+type);
}
// 二维码：{size, modules}；PDF417 是长方形，另给 {w, h}（其余码制 w = h = size）
function encode2D(type,text,ecl,cols){
  if(type==='qrcode')return Codes2D.encodeQR(text||' ',ecl||'M');
  if(type==='datamatrix')return Codes2D.encodeDM(text||' ');
  if(type==='gs1dm')return Codes2D.encodeDM(GS1.data(GS1.parse(text)),{gs1:true});
  if(type==='pdf417'){if(String(text)==='')throw new Error('PDF417 内容为空');return PDF417.encode(text,{level:ecl,cols});}
  throw new Error('未知二维码类型 '+type);
}
const api={Codes2D,PDF417,ADDON,ITF14,BEARER,C128,EAN13,EAN8,UPCA,C39,ITF,UPCE,C93,CODABAR,GS1,BARCODE_1D,BARCODE_2D,encode1D,encode2D};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
