// 用独立的 Zebrash 引擎渲染 ZPL：node render.cjs in.zpl outprefix widthMm heightMm dpmm
const fs=require('fs');
(async()=>{
  const {ready,ZEBRASH_VERSION}=require('zpl-renderer-js');
  const {api}=await ready;
  const [,,inp,outp,w,h,dpmm]=process.argv;
  const zpl=fs.readFileSync(inp,'utf8');
  const imgs=await api.zplToBase64MultipleAsync(zpl,+w,+h,+dpmm);
  imgs.forEach((b,i)=>fs.writeFileSync(`${outp}-${i}.png`,Buffer.from(b,'base64')));
  console.log(`Zebrash ${ZEBRASH_VERSION}: rendered ${imgs.length} label(s)`);
})().catch(e=>{console.error('ERR',e.message||e);process.exit(1);});
