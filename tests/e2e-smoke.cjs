/* 端到端冒烟测试：用无头 Chromium 打开 index.html，走一遍真实界面流程。
   需要 Playwright（npm i -D playwright 或全局安装）；没有则跳过。运行：npm run test:e2e
   覆盖：示例设计 + CSV 套打、打印时输入弹窗、打印前预检弹窗、导出 ZPL（文字栅格化 / 位图压缩）、
   标签机模式的 @page 尺寸、GBK CSV、.xlsx 导入、页面无脚本错误。 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { suite, makeZip } = require('./helpers.cjs');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return null;
}
const pw = loadPlaywright();
if (!pw) { console.log('端到端冒烟测试：未安装 Playwright，跳过'); process.exit(0); }
const { check, eq, done } = suite('端到端冒烟测试');
const ROOT = path.join(__dirname, '..');

(async () => {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  check('启动渲染 1 张预览', (await page.locator('#preview .label').count()) === 1);
  const pageCss = await page.evaluate(() => document.getElementById('pageStyle').textContent);
  check('标签机模式 @page = 标签尺寸、无边距', pageCss.includes('@page{size:50mm 30mm;margin:0}'), pageCss);

  // 示例：服装吊牌 + CSV
  await page.setInputFiles('#designIn', path.join(ROOT, 'examples', 'clothing-tag.json'));
  await page.setInputFiles('#fileIn', path.join(ROOT, 'examples', 'clothing-tag.csv'));
  await page.waitForTimeout(300);
  eq('吊牌 2 条记录 → 2 张', await page.locator('#preview .label').count(), 2);
  const t1 = await page.locator('#preview .label').first().innerText();
  check('吊牌字段与表达式正确', t1.includes('品名：女包') && t1.includes('零售价：558.00') && t1.includes('279Z'), t1);
  // 导出 ZPL：示例无问题应直接下载（不弹预检）
  let dl = page.waitForEvent('download');
  await page.evaluate(() => { exportZPL(); });
  let z = fs.readFileSync(await (await dl).path(), 'utf8');
  check('吊牌 ZPL 2 张、含文字位图', (z.match(/\^XA/g) || []).length === 2 && /\^GFA,\d+,\d+,\d+,/.test(z));
  check('吊牌 ZPL 使用位图压缩', /\^GFA,\d+,\d+,\d+,[^\^]*[:,]/.test(z));

  // 示例：追溯标签（打印时输入 + 流水号进二维码 + 日期偏移 + 计算）
  await page.setInputFiles('#designIn', path.join(ROOT, 'examples', 'serial-qr.json'));
  await page.setInputFiles('#fileIn', path.join(ROOT, 'examples', 'serial-qr.csv'));
  await page.waitForTimeout(300);
  const t2 = await page.locator('#preview .label').nth(1).innerText();
  check('流水号逐张递增', t2.includes('SN00002'), t2);
  check('会员价计算', t2.includes('会员价：358.20'), t2);
  dl = page.waitForEvent('download');
  await page.evaluate(() => { exportZPL(); });
  await page.waitForSelector('#dlg[style*="flex"]');
  check('弹出打印时输入', (await page.locator('#dlgHd').innerText()) === '打印时输入');
  await page.fill('#dlgBody input', 'B2610');
  await page.click('#dlgFt button.primary');
  z = fs.readFileSync(await (await dl).path(), 'utf8');
  check('追溯标签 ZPL 2 张', (z.match(/\^XA/g) || []).length === 2);
  const t3 = await page.locator('#preview .label').first().innerText();
  check('批号回填到预览', t3.includes('批号：B2610'), t3);

  // 预检：错校验位 → 弹窗并可跳过
  await page.evaluate(() => { $('#csv').value = '品名,商品码,零售价,保质期月\n坏码,6925253841660,1,1\n好码,6925253841665,1,1'; $('#applyCsv').click();
    elements.push({ type: 'ean13', x: 3, y: 33, h: 5, module: 0.33, showText: false, content: '{商品码}', rot: 0 }); render(); });
  dl = page.waitForEvent('download');
  await page.evaluate(() => { exportZPL(); });
  await page.waitForSelector('#dlg[style*="flex"]');
  if ((await page.locator('#dlgHd').innerText()) === '打印时输入') { await page.click('#dlgFt button.primary'); await page.waitForTimeout(100); }
  const body = await page.locator('#dlgBody').innerText();
  check('预检指出第 1 张校验位错误', body.includes('第 1 张') && body.includes('校验位'), body);
  await page.click('#dlgFt button.primary'); // 跳过出错的 1 张
  z = fs.readFileSync(await (await dl).path(), 'utf8');
  eq('跳过后只出 1 张', (z.match(/\^XA/g) || []).length, 1);

  // 对齐到标签：居中对齐的文字（锚点在中点）+ 旋转 90° 的条码，点「水平居中」后外框居中
  for (const el of [{ type: 'text', x: 3, y: 3, size: 4, align: 'center', content: '居中锚点' },
    { type: 'barcode', x: 20, y: 3, h: 6, module: 0.25, rot: 90, content: 'AB12' }]) {
    const off = await page.evaluate((el) => { elements = [Object.assign({ rot: 0 }, el)]; sel = 0; rows = null; render(); renderEditor();
      document.querySelector('#canvasbar [data-al="C"]').click();
      const n = document.querySelector('#preview .el[data-ei="0"]').getBoundingClientRect(), l = document.querySelector('#preview .label').getBoundingClientRect();
      return Math.abs((n.left + n.right) / 2 - (l.left + l.right) / 2); }, el);
    check(`对齐到标签水平居中（${el.type}${el.rot ? ' 旋转' : ' 居中锚点'}）`, off < 1.5, off);
  }

  // GBK CSV
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lbl-'));
  fs.writeFileSync(path.join(tmp, 'gbk.csv'), Buffer.from('c6b7c3fb2c534b550ad3eac9a12c41310a', 'hex')); // 品名,SKU\n雨伞,A1
  await page.setInputFiles('#fileIn', path.join(tmp, 'gbk.csv'));
  await page.waitForTimeout(200);
  check('GBK CSV 中文不乱码', (await page.inputValue('#csv')).startsWith('品名,SKU\n雨伞'), await page.inputValue('#csv'));

  // .xlsx（浏览器里用 DecompressionStream 解压）
  fs.writeFileSync(path.join(tmp, 'a.xlsx'), makeZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>品名</t></si><si><t>SKU</t></si><si><t>台灯</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
      + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1001</v></c></row></sheetData></worksheet>' }));
  await page.setInputFiles('#fileIn', path.join(tmp, 'a.xlsx'));
  await page.waitForTimeout(300);
  eq('.xlsx 直接导入', await page.inputValue('#csv'), '品名\tSKU\n台灯\t1001');

  // 整页模式
  await page.selectOption('#pmode', 'sheet');
  const css2 = await page.evaluate(() => document.getElementById('pageStyle').textContent);
  check('整页模式 @page = A4 + 页边距', css2.includes('@page{size:A4;margin:8mm 0 0 8mm}'), css2);
  check('页面无脚本错误', errors.length === 0, JSON.stringify(errors));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
