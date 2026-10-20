import { S, OUT, ROOT, APP, ZR, FIX } from './_lib.mjs';
import pw from 'playwright';
const { chromium } = pw;
import fs from 'node:fs';
import path from 'node:path';
const design = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/clothing-tag.json'), 'utf8'));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(APP);
await page.waitForSelector('#preview .label');
await page.evaluate(d => loadDesign(d), design);
await page.waitForTimeout(150);

// 第2个元素（品名行）的初始坐标
const before = await page.evaluate(() => ({ x: elements[1].x, y: elements[1].y }));
const box = await page.locator('#preview .label .el[data-ei="1"]').boundingBox();

// 拖动：按住元素中心，移动 +48px / +24px
await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
await page.mouse.down();
await page.mouse.move(box.x + box.width/2 + 48, box.y + box.height/2 + 24, { steps: 6 });
await page.mouse.up();
const after = await page.evaluate(() => ({ x: elements[1].x, y: elements[1].y, sel }));
console.log('=== 拖动移动 ===');
console.log('移动前 mm:', before, ' 移动后 mm:', { x: after.x, y: after.y });
console.log('Δx≈', (after.x - before.x).toFixed(1), 'mm (期望≈', (48/3.78).toFixed(1), ') Δy≈', (after.y - before.y).toFixed(1), 'mm (期望≈', (24/3.78).toFixed(1), ')');
console.log('选中索引 sel =', after.sel, '(期望 1)');

// 选中后应出现缩放手柄
const hasHandle = await page.locator('#preview .label .el[data-ei="1"] .rz').count();
console.log('缩放手柄出现:', hasHandle > 0);

// 拖缩放手柄：文字元素 -> 改字号
const sizeBefore = await page.evaluate(() => elements[1].size);
const hz = await page.locator('#preview .label .el[data-ei="1"] .rz').boundingBox();
await page.mouse.move(hz.x + hz.width/2, hz.y + hz.height/2);
await page.mouse.down();
await page.mouse.move(hz.x + hz.width/2, hz.y + hz.height/2 + 30, { steps: 6 });
await page.mouse.up();
const sizeAfter = await page.evaluate(() => elements[1].size);
console.log('=== 拖角缩放(文字字号) ===');
console.log('字号 前', sizeBefore, '-> 后', sizeAfter, sizeAfter > sizeBefore ? '✓ 变大' : '✗');

// 数字框仍可精确微调：确认右侧编辑器同步了 sel=1 的高亮
const selItem = await page.locator('.elitem.sel').count();
console.log('右侧列表高亮同步:', selItem === 1 ? '✓' : '✗(' + selItem + ')');

await page.locator('#preview').screenshot({ path: path.join(OUT, 'drag-result.png') });
console.log('=== 页面错误 ===',errors.length?errors:'无');if(errors.length)process.exitCode=1;
await browser.close();
