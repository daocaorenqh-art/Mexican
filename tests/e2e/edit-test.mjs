import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium } = pw;
import fs from 'node:fs'; import path from 'node:path';
const design=JSON.parse(fs.readFileSync(path.join(ROOT,'examples/clothing-tag.json'),'utf8'));
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1300,height:1000}});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
await page.goto(APP);
await page.waitForSelector('#preview .label');
await page.evaluate(d=>loadDesign(d),design);
await page.waitForTimeout(150);

// 对齐：选中元素1（品名），水平居中/左/右
await page.click('#preview .el[data-ei="1"]');
const W=await page.evaluate(()=>+document.querySelector('#lw').value);
await page.click('[data-al="C"]');
const cX=await page.evaluate(()=>elements[1].x);
await page.click('[data-al="L"]');
const lX=await page.evaluate(()=>elements[1].x);
await page.click('[data-al="R"]');
const rX=await page.evaluate(()=>elements[1].x);
console.log('=== 对齐到标签 (W='+W+') ===');
console.log('居中 x=',cX,'| 左 x=',lX,'| 右 x=',rX, (lX===0&&cX>0&&rX>cX)?'✓':'✗');

// 吸附：步距5，拖动元素1
await page.evaluate(()=>{document.querySelector('#snapChk').checked=true;document.querySelector('#snapStep').value='5';});
const box=await page.locator('#preview .el[data-ei="1"]').boundingBox();
await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
await page.mouse.down();
await page.mouse.move(box.x+box.width/2+37,box.y+box.height/2+22,{steps:5});
await page.mouse.up();
const snapPos=await page.evaluate(()=>({x:elements[1].x,y:elements[1].y}));
console.log('=== 吸附(步距5mm) ===');
console.log('落点:',snapPos,(snapPos.x%5===0&&snapPos.y%5===0)?'✓ 都是5的倍数':'✗');

// 方向键微调
await page.evaluate(()=>{document.querySelector('#snapChk').checked=false;});
await page.click('#preview .el[data-ei="1"]');
const nb=await page.evaluate(()=>elements[1].x);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
const na=await page.evaluate(()=>elements[1].x);
console.log('=== 方向键微调 ===');
console.log('右移2次(0.5mm):',nb,'->',na,'(Δ='+(na-nb).toFixed(1)+')',Math.abs(na-nb-1)<0.01?'✓':'✗');

// 标尺
await page.evaluate(()=>{document.querySelector('#rulerChk').checked=true;});
await page.evaluate(()=>render());
const ruler=await page.evaluate(()=>({wrap:document.querySelectorAll('.rulerwrap').length,svgs:document.querySelectorAll('.rulerwrap > svg').length}));
console.log('=== 标尺 ===');
console.log('ruler包裹:',ruler.wrap,'| 标尺SVG:',ruler.svgs,'(期望2:上+左)',ruler.wrap===1&&ruler.svgs===2?'✓':'✗');

// 条码颜色
await page.evaluate(()=>{elements[11].color='#cc0000';render();});
const fill=await page.evaluate(()=>{const r=document.querySelector('#preview .el[data-ei="11"] svg path');return r?r.getAttribute('fill'):null;});
console.log('=== 条码前景色 ===');
console.log('条码矩形 fill=',fill,fill==='#cc0000'?'✓':'✗');

await page.locator('#preview').screenshot({path:path.join(OUT,'edit-tools.png')});
console.log('=== 页面错误 ===',errors.length?errors:'无');if(errors.length)process.exitCode=1;
await browser.close();
