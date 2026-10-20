import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium }=pw;
let pass=0,fail=0;const ok=(n,c,x='')=>{c?(pass++,console.log('  ✓',n,x)):(fail++,console.log('  ✗',n,x));};
const b=await chromium.launch();
const errors=[];

console.log('\n[网页版] 无桌面接口');
{const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(APP);await p.waitForSelector('#preview .label');
 ok('打印机面板隐藏',await p.evaluate(()=>getComputedStyle(document.querySelector('#prnPanel')).display==='none'));
 const msg=await p.evaluate(()=>{let m='';window.alert=x=>m=x;document.querySelector('[data-cmd="zplsend"]').click();return m;});
 ok('菜单点 ZPL 直发 → 友好提示不崩',msg.includes('仅在桌面安装版'),msg);
 await p.close();}

console.log('\n[桌面版] 模拟打印机接口');
const ctx=await b.newContext();
await ctx.addInitScript(()=>{
  window.__calls=[];
  window.labelPrinter={isDesktop:true,
    list:async()=>({ok:true,printers:[{name:'Office-HP',displayName:'Office HP',isDefault:false},{name:'ZT410',displayName:'Zebra ZT410',isDefault:true}]}),
    print:async(d)=>{window.__calls.push(['print',d]);return {ok:true};},
    sendRaw:async(t,data)=>{window.__calls.push(['raw',t,data]);return window.__failRaw?{ok:false,error:'无法连接打印机：ECONNREFUSED'}:{ok:true};}};
});
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
await p.goto(APP);await p.waitForSelector('#preview .label');
await p.waitForTimeout(100);
ok('打印机面板显示',await p.evaluate(()=>getComputedStyle(document.querySelector('#prnPanel')).display!=='none'));
const opts=await p.evaluate(()=>({v:document.querySelector('#prnList').value,n:document.querySelectorAll('#prnList option').length,t:document.querySelector('#prnList').selectedOptions[0].textContent}));
ok('列出 2 台打印机且默认选中 ZT410',opts.n===2&&opts.v==='ZT410',JSON.stringify(opts));

await p.evaluate(()=>{loadDesign({v:1,label:{w:40,h:20,dpi:203,cols:0,gapX:3,gapY:3},elements:[
  {type:'text',x:2,y:2,size:4,content:'{N}'},{type:'counter',x:2,y:10,size:4,prefix:'SN',start:1,step:1,pad:3,suffix:'',persist:true}]});
  document.querySelector('#csv').value='N\nA\nB';document.querySelector('#applyCsv').click();});

// 静默打印 + 可能紧接着的 afterprint：续号只问一次
const sp=await p.evaluate(async()=>{let asks=0;window.confirm=()=>{asks++;return true;};
  window.__calls.length=0;await doSilentPrint();window.dispatchEvent(new Event('afterprint'));
  return {calls:window.__calls,asks,start:elements.find(e=>e.type==='counter').start};});
ok('静默打印传入所选打印机 ZT410',sp.calls.length===1&&sp.calls[0][0]==='print'&&sp.calls[0][1]==='ZT410',JSON.stringify(sp.calls));
ok('静默打印 + afterprint 只确认一次、只续号一次（1→3）',sp.asks===1&&sp.start===3,'asks='+sp.asks+' start='+sp.start);

// ZPL 直发：网络
const net=await p.evaluate(async()=>{const s=(id,v)=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));};
  s('#rawKind','tcp');s('#rawAddr','192.168.1.50');s('#rawPort','9100');window.confirm=()=>false;
  window.__calls.length=0;await new Promise(r=>setTimeout(r,2100));await doSendZPL();
  const c=window.__calls[0],zz=await buildZPL();return {target:c&&c[1],same:c&&c[2]===zz,msg:document.querySelector('#prnMsg').textContent,
    portShown:getComputedStyle(document.querySelector('#rawPortWrap')).display!=='none'};});
ok('网络直发：目标 {tcp,192.168.1.50,9100}',JSON.stringify(net.target)===JSON.stringify({kind:'tcp',host:'192.168.1.50',port:9100}),JSON.stringify(net.target));
ok('发送的数据就是 buildZPL() 的输出',net.same);
ok('显示成功信息（2 张）',net.msg.includes('2 张'),net.msg);
ok('网络方式显示端口框',net.portShown);

// 共享打印机 / 串口
for(const [kind,addr,expect] of [['share','ZT410',{kind:'share',name:'ZT410'}],['com','COM1',{kind:'com',port:'COM1'}]]){
  const r=await p.evaluate(async([kind,addr])=>{const s=(id,v)=>{const e=document.querySelector(id);e.value=v;e.dispatchEvent(new Event('input'));e.dispatchEvent(new Event('change'));};
    s('#rawKind',kind);s('#rawAddr',addr);window.__calls.length=0;await doSendZPL();
    return {t:window.__calls[0]&&window.__calls[0][1],port:getComputedStyle(document.querySelector('#rawPortWrap')).display,lbl:document.querySelector('#rawAddrLbl').textContent};},[kind,addr]);
  ok(`${kind} 方式：目标 ${JSON.stringify(expect)}，隐藏端口`,JSON.stringify(r.t)===JSON.stringify(expect)&&r.port==='none',JSON.stringify(r));
}

// 失败信息
const em=await p.evaluate(async()=>{window.__failRaw=true;await doSendZPL();window.__failRaw=false;
  const m=document.querySelector('#prnMsg');return {t:m.textContent,c:m.style.color};});
ok('发送失败 → 红字显示原因',em.t.includes('ECONNREFUSED')&&em.c.includes('204'),JSON.stringify(em));

// 设置记忆
await p.reload();await p.waitForSelector('#preview .label');await p.waitForTimeout(100);
const mem=await p.evaluate(()=>({k:document.querySelector('#rawKind').value,a:document.querySelector('#rawAddr').value,d:document.querySelector('#prnList').value}));
ok('重启后记住直发方式/地址/打印机',mem.k==='com'&&mem.a==='COM1'&&mem.d==='ZT410',JSON.stringify(mem));

ok('全程无 JS 错误',errors.length===0,errors.join(';'));
console.log(`\n==== 打印机界面：通过 ${pass} / 失败 ${fail} ====`);
await b.close();process.exit(fail?1:0);
