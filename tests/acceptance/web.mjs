// 交付验收：浏览器 / 网页版可验证的生产场景（桌面版专属见 desktop.mjs）
// 结果：✓ 达标；✗ 不达标；○ 界面尚未提供该功能（缺口）。退出码非 0 表示存在不达标或缺口。
import fs from 'node:fs';
import path from 'node:path';
import pw from 'playwright';
import { createRequire } from 'node:module';
import { ROOT, OUT, recorder, openApp, supportsType, loadDesign, setCSV, importFile, setField, previewTexts, labelCount,
  exportCmd, renderZPL, zplLabelCount, scanPNG, renderTSPL, scanPreview, has, ZPLmod } from './_app.mjs';

const require = createRequire(import.meta.url);
const { makeZip } = require(path.join(ROOT, 'tests', 'helpers.cjs'));
const rec = recorder('web');
const browser = await pw.chromium.launch();
const gs1chk = (d) => { let s = 0; for (let i = 0; i < d.length; i++) s += (+d[d.length - 1 - i]) * (i % 2 === 0 ? 3 : 1); return (10 - s % 10) % 10; };
const ean = (n) => { const b = '692' + String(n).padStart(9, '0'); return b + gs1chk(b); };
const L = (w, h, dpi = 203) => ({ w, h, dpi, cols: 0, gapX: 3, gapY: 3 });
const design = (els, w = 80, h = 50, dpi = 203) => ({ v: 1, label: L(w, h, dpi), elements: els });
const B1 = (type, content, x = 10, y = 8, extra = {}) => Object.assign({ type, x, y, h: 12, module: 0.33, showText: false, rot: 0, content }, extra);

/* ================= A. 条码：每种码制 × 每条输出路径都能扫回原文 ================= */
console.log('\n[A] 条码全码制：预览 / ZPL（Zebrash 出纸）/ TSPL');
{
  const page = await openApp(browser, { deviceScaleFactor: 3 });
  const cases = [
    ['barcode', 'Code128', 'FZ075885L-01110', 'FZ075885L-01110'],
    ['ean13', 'EAN-13', '6925253841665', '6925253841665'],
    ['ean8', 'EAN-8', '1234567', '12345670'],
    ['upca', 'UPC-A', '03600029145', '036000291452'],
    ['upce', 'UPC-E', '0123456', '01234565'],
    ['code39', 'Code39', 'SN-001', 'SN-001'],
    ['code93', 'Code93', 'CODE93-1', 'CODE93-1'],
    ['codabar', 'Codabar', 'A40156B', '40156'],
    ['itf', 'ITF-25', '1234567890', '1234567890'],
    ['gs1128', 'GS1-128', '(01)06925253841665(17)271231(10)B26', '(01)06925253841665(17)271231(10)B26', { module: 0.25 }],   // 0.33mm 时约 87mm 宽，超出 80mm 标签
    ['qrcode', 'QR 中文', '合格证 SN0001 品名：女包', '合格证 SN0001 品名：女包', { size: 20, ecl: 'M' }],
    ['datamatrix', 'DataMatrix 中文', '批号B26 合格证', '批号B26 合格证', { size: 16 }],
    ['gs1dm', 'GS1 DataMatrix', '(01)06925253841665(10)LOT7(21)SN01', '(01)06925253841665(10)LOT7(21)SN01', { size: 16 }],
  ];
  const norm = (t, s) => t === 'upca' && s.length === 13 && s[0] === '0' ? s.slice(1) : t === 'codabar' ? s.replace(/^[A-D]|[A-D]$/g, '') : t === 'upce' && s.length === 13 ? s : s;
  for (const [type, name, content, want, extra] of cases) {
    if (!(await supportsType(page, type))) { rec.gap(`A-${type}`, `${name}：界面可添加`, '界面没有这种元素'); continue; }
    await loadDesign(page, design([B1(type, content, 12, 10, extra || {})]));
    const ok = (arr) => arr.some((g) => norm(type, g.text) === want || (type === 'upce' && g.text.length === 13));
    const pv = await scanPreview(page, 0);
    rec.check(`A-${type}-preview`, `${name}：预览可扫回原文`, ok(pv), JSON.stringify(pv));
    const z = await exportCmd(page, { lang: 'zpl', choice: 'ok' });
    if (!z.data) rec.check(`A-${type}-zpl`, `${name}：ZPL 出纸可扫回原文`, false, '没有导出 ZPL ' + JSON.stringify(z.dialogs));
    else { const pngs = renderZPL(z.data.toString('utf8'), 80, 50, 203); const got = pngs.length ? await scanPNG(pngs[0]) : [];
      rec.check(`A-${type}-zpl`, `${name}：ZPL 出纸（Zebrash）可扫回原文`, ok(got), JSON.stringify(got)); }
    const t = await exportCmd(page, { lang: 'tspl', choice: 'ok' });
    if (t.gap) rec.gap(`A-${type}-tspl`, `${name}：TSPL 出纸可扫回原文`, t.gap);
    else if (!t.data) rec.check(`A-${type}-tspl`, `${name}：TSPL 出纸可扫回原文`, false, '没有导出 TSPL');
    else { const f = await renderTSPL(page, t.data, 80, 50, 203); const got = f.length ? await scanPNG(f[0].file) : [];
      rec.check(`A-${type}-tspl`, `${name}：TSPL 出纸可扫回原文`, ok(got), JSON.stringify(got)); }
  }
  // 旋转 90/180/270：ZPL 出纸位置与可扫
  for (const rot of [90, 180, 270]) {
    const x = rot === 90 || rot === 180 ? 70 : 12, y = rot === 180 || rot === 270 ? 45 : 5;
    await loadDesign(page, design([B1('barcode', 'ROT' + rot, x, y, { rot, module: 0.25 })]));
    const z = await exportCmd(page, { choice: 'ok' });
    const got = z.data ? await scanPNG(renderZPL(z.data.toString('utf8'), 80, 50, 203)[0]) : [];
    rec.check(`A-rot${rot}`, `旋转 ${rot}° 的条码 ZPL 出纸可扫`, got.some((g) => g.text === 'ROT' + rot), JSON.stringify(got));
  }
  rec.check('A-noerror', '全程无脚本错误', page._errors.length === 0, page._errors.join('; '));
  await page.close();
}

/* ================= B. 错误数据不能打出去 ================= */
console.log('\n[B] 错误数据拦截');
{
  const page = await openApp(browser);
  await loadDesign(page, design([B1('ean13', '{EAN}'), { type: 'text', x: 10, y: 30, size: 3, content: '{SKU}', rot: 0 }]));
  await setCSV(page, 'SKU,EAN\nGOOD1,6925253841665\nBAD,6925253841660\nGOOD2,6925253841672');
  const r = await exportCmd(page, { choice: 'skip' });
  const warned = r.dialogs.some((d) => /校验位|错误/.test(d));
  if (!r.data) rec.check('B-ean-check', 'EAN 校验位错的记录不会打出（有提示）', warned, '未导出；提示：' + r.dialogs.join(' / '));
  else {
    const zpl = r.data.toString('utf8'), n = zplLabelCount(zpl), pngs = renderZPL(zpl, 80, 50, 203), codes = [];
    for (const f of pngs) codes.push(...(await scanPNG(f)).map((g) => g.text));
    const wrong = codes.filter((c) => c !== '6925253841665' && c !== '6925253841672' && /^\d{13}$/.test(c));
    rec.check('B-ean-check', 'EAN 校验位错的记录不会打出（有提示）', warned && n === 2 && !wrong.length,
      `提示：${warned ? '有' : '无'}；出 ${n} 张；扫到：${codes.join(',')}`);
  }
  // 打印范围填反：不应出纸
  await setField(page, 'rFrom', 3); await setField(page, 'rTo', 1);
  const r2 = await exportCmd(page, { choice: 'cancel', timeout: 4000 });
  rec.check('B-range', '打印范围填反（3→1）时不出标签并提示', !r2.data || zplLabelCount(r2.data.toString('utf8')) === 0,
    r2.data ? '仍导出了 ' + zplLabelCount(r2.data.toString('utf8')) + ' 张' : '未导出');
  await setField(page, 'rFrom', 1); await setField(page, 'rTo', 0);
  // Code128 放中文：不能把「⚠ 错误」打出去
  await loadDesign(page, design([B1('barcode', '{SKU}'), { type: 'text', x: 10, y: 30, size: 3, content: 'X', rot: 0 }]));
  await setCSV(page, 'SKU\n合格证\nOK1');
  const r3 = await exportCmd(page, { choice: 'skip' });
  const n3 = r3.data ? zplLabelCount(r3.data.toString('utf8')) : 0;
  rec.check('B-code128-cjk', 'Code128 无法编码的记录被拦下（不打错误文字）', r3.dialogs.some((d) => /Code128|ASCII|错误/.test(d)) && n3 === 1, `提示：${r3.dialogs.join(' / ').slice(0, 120)}；出 ${n3} 张`);
  await page.close();
}

/* ================= C. 数据导入与字段 ================= */
console.log('\n[C] 数据导入');
{
  const page = await openApp(browser);
  await loadDesign(page, design([{ type: 'text', x: 3, y: 3, size: 3, content: '品名：{品名}', rot: 0 }, { type: 'text', x: 3, y: 10, size: 3, content: '{unit price}', rot: 0 }]));
  await setCSV(page, '品名,unit price\n女包,558');
  const t = (await previewTexts(page))[0] || '';
  rec.check('C-cjk-field', '中文 / 带空格字段名可插值', t.includes('品名：女包') && t.includes('558'), t);
  const dir = fs.mkdtempSync(OUT + 'data-');
  fs.writeFileSync(dir + '/gbk.csv', Buffer.from('c6b7c3fb2c534b550ad3eac9a12c41310a', 'hex')); // 品名,SKU / 雨伞,A1（GBK）
  await importFile(page, dir + '/gbk.csv');
  rec.check('C-gbk', '中文版 Excel 另存的 GBK CSV 不乱码', (await previewTexts(page)).some((x) => x.includes('雨伞')), (await page.inputValue('#csv')).slice(0, 30));
  fs.writeFileSync(dir + '/nl.csv', '品名,unit price\n"多行\n品名",1\n');
  await importFile(page, dir + '/nl.csv');
  rec.check('C-newline', '引号内换行的 CSV 解析为 1 条', (await labelCount(page)) === 1, (await labelCount(page)) + ' 张');
  fs.writeFileSync(dir + '/a.xlsx', makeZip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>品名</t></si><si><t>unit price</t></si><si><t>台灯</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>99</v></c></row></sheetData></worksheet>' }));
  await importFile(page, dir + '/a.xlsx');
  rec.check('C-xlsx', '直接导入 .xlsx', (await previewTexts(page)).some((x) => x.includes('品名：台灯')), (await previewTexts(page))[0]);
  await page.close();
}

/* ================= D. 流水号连续（生产不重号、不跳号） ================= */
console.log('\n[D] 流水号');
{
  const page = await openApp(browser, { deviceScaleFactor: 2 });
  const canRef = await page.evaluate(() => { try { return typeof Job !== 'undefined' || /#SN/.test(document.body.innerHTML); } catch (e) { return false; } });
  await loadDesign(page, design([{ type: 'counter', name: 'SN', x: 3, y: 3, size: 3, prefix: 'SN', start: 1, step: 1, pad: 4, persist: true, rot: 0 },
    B1('barcode', '{#SN}', 10, 15, { module: 0.25 })]));   // 流水号元素自带前缀 SN
  await setField(page, 'copies', 3);
  const scanJob = async () => { const z = await exportCmd(page, { choice: 'ok' }); if (!z.data) return null;
    const out = []; for (const f of renderZPL(z.data.toString('utf8'), 80, 50, 203)) out.push(...(await scanPNG(f)).map((g) => g.text)); return out; };
  const j1 = await scanJob(), j2 = await scanJob();
  if (!j1 || !j1.length || !j1[0].startsWith('SN0')) rec.gap('D-serial-barcode', '流水号可放进条码（{#SN}）', '条码内容里的 {#SN} 未被替换：' + JSON.stringify(j1));
  else {
    const all = [...j1, ...j2];
    rec.check('D-serial-continuous', '两次打印的流水号连续、不重号不跳号', all.join(',') === 'SN0001,SN0002,SN0003,SN0004,SN0005,SN0006', all.join(','));
  }
  // 取消确认 → 不前进；刷新页面 → 保持
  const before = await page.evaluate(() => elements.find((e) => e.type === 'counter').start);
  page._dialogPlan = ['dismiss'];
  await exportCmd(page, { choice: 'ok' });
  const afterCancel = await page.evaluate(() => elements.find((e) => e.type === 'counter').start);
  rec.check('D-cancel', '未确认打印成功时流水号不前进', afterCancel === before, `${before} → ${afterCancel}`);
  await page.reload(); await page.waitForSelector('#preview .label');
  const afterReload = await page.evaluate(() => (elements.find((e) => e.type === 'counter') || {}).start);
  rec.check('D-persist', '关闭重开后流水号起始值保持', afterReload === before, `${before} → ${afterReload}`);
  await page.close();
}

/* ================= E. 驱动打印分页（标签机：每张一页、页面 = 标签尺寸） ================= */
console.log('\n[E] 驱动打印分页');
{
  const page = await openApp(browser);
  await loadDesign(page, design([{ type: 'text', x: 3, y: 3, size: 4, content: '{SKU}', rot: 0 }, B1('barcode', '{SKU}', 3, 12, { module: 0.25 })], 60, 40));
  await setCSV(page, 'SKU\nA1\nA2\nA3\nA4\nA5');
  if (await page.$('#pmode')) await setField(page, 'pmode', 'roll');
  await page.evaluate(() => { window.dispatchEvent(new Event('beforeprint')); });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => { window.dispatchEvent(new Event('afterprint')); });
  const s = pdf.toString('latin1'), pages = (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
  const box = (s.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/) || []).slice(1).map(Number);
  const wantW = 60 * 72 / 25.4, wantH = 40 * 72 / 25.4;
  fs.writeFileSync(OUT + 'roll.pdf', pdf);
  rec.check('E-pages', '标签机模式：5 张标签 = 5 页', pages === 5, pages + ' 页');
  rec.check('E-pagesize', '标签机模式：页面尺寸 = 标签尺寸 60×40mm', box.length === 2 && Math.abs(box[0] - wantW) < 1.5 && Math.abs(box[1] - wantH) < 1.5, `MediaBox ${box.map((v) => v.toFixed(1)).join('×')}pt，应为 ${wantW.toFixed(1)}×${wantH.toFixed(1)}`);
  await page.close();
}

/* ================= E2. 整页模式（A4 不干胶） ================= */
{
  const page = await openApp(browser);
  if (!(await page.$('#startPos'))) rec.gap('E-sheet', '整页模式：A4 页面、从第 N 个位置开始', '界面尚未提供');
  else {
    await loadDesign(page, design([{ type: 'text', x: 3, y: 3, size: 4, content: '{SKU}', rot: 0 }], 60, 40));
    await setCSV(page, 'SKU\nA1\nA2\nA3\nA4\nA5\nA6');
    await setField(page, 'pmode', 'sheet'); await setField(page, 'cols', 3); await setField(page, 'startPos', 3);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await page.emulateMedia({ media: 'print' });
    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const box = (pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/) || []).slice(1).map(Number);
    const slots = await page.locator('#preview .label.slot').count();
    rec.check('E-sheet', '整页模式：A4 页面、前 2 个位置留空', box.length && Math.abs(box[0] - 595.3) < 2 && Math.abs(box[1] - 841.9) < 2 && slots === 2, `MediaBox ${box.join('×')}；留空 ${slots}`);
  }
  await page.close();
}

/* ================= F. 生产流程功能 ================= */
console.log('\n[F] 生产流程功能');
{
  const page = await openApp(browser);
  const feat = [
    ['F-qty', '数量字段（每条打几张）', '#qtyField'], ['F-pick', '选择记录打印', '#pickRecs'], ['F-preflight', '打印前预检', 'typeof Job!=="undefined"&&Job.preflight'],
    ['F-log', '打印日志', 'typeof showLog==="function"'], ['F-shop', '车间模式（只打印）', 'typeof toggleShop==="function"'],
    ['F-tspl', 'TSPL 指令（国产标签机）', '#zLang'], ['F-status', '检测打印机（状态 / DPI）', '#prnStatus'], ['F-batch', '分批直发 / 续打', '#rawResume'],
    ['F-sheet', '整页模式（A4 不干胶、起始位置）', '#startPos'], ['F-fit', '文字适应宽度', 'typeof Job!=="undefined"&&Job.effectiveSize'],
  ];
  for (const [id, title, sel] of feat) {
    const ok = sel.startsWith('#') ? !!(await page.$(sel)) : await has(page, sel);
    if (ok) rec.check(id, title + '：界面已提供', true); else rec.gap(id, title, '界面尚未提供');
  }
  if (await page.$('#qtyField')) {
    await loadDesign(page, design([{ type: 'text', x: 3, y: 3, size: 3, content: '{SKU}', rot: 0 }]));
    await setCSV(page, 'SKU,数量\nA,2\nB,0\nC,3');
    await setField(page, 'qtyField', '数量');
    const z = await exportCmd(page, { choice: 'ok' });
    rec.check('F-qty-out', '数量字段：A×2 + C×3 = 5 张', z.data && zplLabelCount(z.data.toString('utf8')) === 5, z.data ? zplLabelCount(z.data.toString('utf8')) + ' 张' : '未导出');
  }
  await page.close();
}

/* ================= J. 生产流程行为（不只是「有这个按钮」） ================= */
console.log('\n[J] 生产流程行为');
{
  const page = await openApp(browser);
  const qr = (content) => ({ type: 'qrcode', x: 40, y: 5, size: 18, ecl: 'M', rot: 0, content });
  const scanAll = async (z) => { const out = []; for (const f of renderZPL(z.data.toString('utf8'), 80, 50, 203)) out.push(...(await scanPNG(f)).map((g) => g.text)); return out; };
  // 打印时输入 + 日期偏移 + 流水号 都进二维码
  await loadDesign(page, design([{ type: 'counter', name: 'SN', x: 2, y: 2, size: 3, prefix: '', start: 7, step: 1, pad: 3, rot: 0 }, qr('{?批号}|{#DATE+30:YYYYMMDD}|{#SN}')]));
  const exp = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); })();
  let z = await exportCmd(page, { choice: 'ok', values: ['B2610'] });
  let got = z.data ? await scanAll(z) : [];
  rec.check('J-prompt-date-sn', '打印时输入的批号、保质期（+30 天）、流水号都正确进入二维码', got.includes(`B2610|${exp}|007`), got.join(',') + ' 应为 ' + `B2610|${exp}|007`);
  // 打印日志：内容
  await page.evaluate(() => localStorage.removeItem('label.printlog'));
  await loadDesign(page, design([{ type: 'counter', name: 'SN', x: 2, y: 2, size: 3, prefix: 'SN', start: 1, step: 1, pad: 4, rot: 0 }, qr('{SKU}')]));
  await setCSV(page, 'SKU\nA\nB\nC'); await setField(page, 'copies', 2);
  z = await exportCmd(page, { choice: 'ok' });
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('label.printlog') || '[]'));
  const g = log[0] || {};
  rec.check('J-log', '打印日志记下张数、记录范围、流水号区间', log.length === 1 && g.labels === 6 && g.recs === '1-3' && /SN0001.*SN0006/.test(JSON.stringify(g.serials)), JSON.stringify(g).slice(0, 200));
  // 选择记录：只出选中的
  await setField(page, 'copies', 1);
  if (await page.$('#pickRecs')) {
    await page.evaluate(() => { pickRecords(); });
    await page.waitForSelector('#recTbl input', { timeout: 5000 }).catch(() => {});
    const okPick = !!(await page.$('#recTbl input'));
    if (okPick) { await page.click('[data-sa="none"]'); await page.check('#recTbl input[data-ri="1"]'); await page.click('#dlgFt button.primary'); }
    z = await exportCmd(page, { choice: 'ok' });
    got = z.data ? await scanAll(z) : [];
    rec.check('J-pick', '选择记录：只出选中的 B', okPick && got.length === 1 && got[0] === 'B', got.join(','));
  }
  // 车间模式：设计锁定（拖不动、删不掉），但仍能打印
  if (await has(page, 'typeof toggleShop==="function"')) {
    await setCSV(page, 'SKU\nA');
    page._dialogPlan = ['']; await page.evaluate(() => toggleShop()); await page.waitForTimeout(200);
    const el = page.locator('#preview .label .el').first(), bb = await el.boundingBox();
    const x0 = await page.evaluate(() => elements[0].x);
    await page.mouse.move(bb.x + 3, bb.y + 3); await page.mouse.down(); await page.mouse.move(bb.x + 60, bb.y + 40, { steps: 5 }); await page.mouse.up();
    await page.keyboard.press('Delete');
    const after = await page.evaluate(() => ({ x: elements[0].x, n: elements.length }));
    z = await exportCmd(page, { choice: 'ok' });
    rec.check('J-shop', '车间模式：元素拖不动、删不掉，打印照常', after.x === x0 && after.n === 2 && !!z.data && !(await page.isVisible('#elist')), JSON.stringify(after) + (z.data ? ' 已出纸' : ' 未出纸'));
    page._dialogPlan = ['accept']; await page.evaluate(() => toggleShop());
  }
  // 动态图片：字段里的图片（data: 地址）出现在 ZPL 出纸里
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 40; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(5, 5, 30, 30); return c.toDataURL(); });
  await loadDesign(page, design([{ type: 'image', x: 5, y: 5, w: 20, h: 20, src: '', content: '{IMG}', rot: 0 }]));
  await setCSV(page, 'IMG\n"' + png + '"');
  z = await exportCmd(page, { choice: 'ok' });
  let ink = 0;
  if (z.data) { const f = renderZPL(z.data.toString('utf8'), 80, 50, 203)[0];
    ink = await page.evaluate(async (b64) => { const im = new Image(); await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++; return n; }, fs.readFileSync(f).toString('base64')); }
  rec.check('J-dynimg', '动态图片（数据里的图片）出现在打印机出纸上', ink > 1500, '黑点 ' + ink);
  rec.check('J-noerror', '全程无脚本错误', page._errors.length === 0, page._errors.join('; '));
  await page.close();
}

/* ================= K. 流水号按周期归零、段落行数限制 ================= */
console.log('\n[K] 流水号归零 / 段落行数');
{
  const page = await openApp(browser);
  const day = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const scanSN = async (z) => { const out = []; for (const f of renderZPL(z.data.toString('utf8'), 80, 50, 203)) out.push(...(await scanPNG(f)).map((g) => g.text)); return out; };
  // 上次续号是昨天、按天归零：今天这批从 resetStart 开始，而不是接着 57
  await page.evaluate(() => localStorage.removeItem('label.printlog'));
  await loadDesign(page, design([{ type: 'counter', name: 'SN', x: 2, y: 2, size: 3, prefix: '', start: 57, step: 1, pad: 4, persist: true, reset: 'day', resetStart: 1, period: day(-1), rot: 0 },
    { type: 'qrcode', x: 40, y: 5, size: 18, ecl: 'M', rot: 0, content: 'SN{#SN}' }]));
  await setField(page, 'copies', 3);
  const pv = (await previewTexts(page))[0] || '';
  let z = await exportCmd(page, { choice: 'ok' });
  let got = z.data ? (await scanSN(z)).sort() : [];
  const st = await page.evaluate(() => { const c = elements.find((e) => e.type === 'counter'); return { start: c.start, period: c.period }; });
  const lg = await page.evaluate(() => (JSON.parse(localStorage.getItem('label.printlog') || '[]')[0] || {}).serials);
  rec.check('K-reset-new-day', '按天归零：跨天后预览 / ZPL / 日志都从 0001 开始', pv.includes('0001') && got.join(',') === 'SN0001,SN0002,SN0003' && /0001.*0003/.test(JSON.stringify(lg)),
    `预览 ${pv.slice(0, 20)}；出纸 ${got.join(',')}；日志 ${JSON.stringify(lg)}`);
  rec.check('K-reset-advance', '归零后续号前进到 4，周期记为今天', st.start === 4 && st.period === day(0), JSON.stringify(st));
  z = await exportCmd(page, { choice: 'ok' });
  got = z.data ? (await scanSN(z)).sort() : [];
  rec.check('K-reset-same-day', '同一天再打：接着 0004 编号，不再归零', got.join(',') === 'SN0004,SN0005,SN0006', got.join(','));
  // 段落最多 2 行 + 省略号：预览末尾有 …；ZPL 出纸的段落高度 ≈ 2 行（字号 3mm，203dpi 每行约 24 点）
  await setField(page, 'copies', 1);
  const longText = '面料：棉100%。本产品执行国家标准，请按洗涤说明保养，避免暴晒和高温熨烫，深浅衣物分开洗涤。';
  await loadDesign(page, design([{ type: 'para', x: 5, y: 5, w: 30, size: 3, maxLines: 2, ellipsis: true, bold: false, align: 'left', font: '', rot: 0, content: longText }]));
  const ptxt = (await previewTexts(page))[0] || '';
  z = await exportCmd(page, { choice: 'ok' });
  let rows = 0;
  if (z.data) { const f = renderZPL(z.data.toString('utf8'), 80, 50, 203)[0];
    rows = await page.evaluate(async (b64) => { const im = new Image(); await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data; let top = -1, bot = -1;
      for (let y = 0; y < im.height; y++) { let ink = false; for (let x = 0; x < im.width; x++) if (d[(y * im.width + x) * 4] < 128) { ink = true; break; } if (ink) { if (top < 0) top = y; bot = y; } }
      return top < 0 ? 0 : bot - top + 1; }, fs.readFileSync(f).toString('base64')); }
  const lineDots = 3 * 203 / 25.4;
  rec.check('K-para-lines', '段落最多 2 行：预览以 … 结尾，出纸高度约 2 行', /…\s*$/.test(ptxt) && ptxt.split('\n').filter((l) => l.trim()).length === 2 && rows > lineDots * 1.3 && rows < lineDots * 2.4,
    `预览 ${JSON.stringify(ptxt.slice(-12))}，${ptxt.split('\n').filter((l) => l.trim()).length} 行；出纸墨迹高 ${rows} 点（1 行约 ${lineDots.toFixed(0)} 点）`);
  rec.check('K-noerror', '全程无脚本错误', page._errors.length === 0, page._errors.join('; '));
  await page.close();
}

/* ================= I. 设计往返与健壮性 ================= */
console.log('\n[I] 设计往返与健壮性');
{
  const page = await openApp(browser);
  // 每种元素都用默认值建一个：预览不报错；保存 → 载入后原样
  const types = await page.evaluate(() => Object.keys(DEFAULTS));
  const all = await page.evaluate((ts) => ts.map((t, i) => Object.assign(JSON.parse(JSON.stringify(DEFAULTS[t])), { x: 2 + (i % 4) * 18, y: 2 + Math.floor(i / 4) * 14 })), types);
  await loadDesign(page, { v: 1, label: L(80, 120), elements: all });
  const warn = await page.evaluate(() => [...document.querySelectorAll('#preview .label:first-child .el')].map((e) => e.textContent).filter((t) => t.includes('⚠')));
  rec.check('I-defaults', `全部 ${types.length} 种元素的默认值都能正常渲染`, warn.length === 0, warn.join(' / ') || types.join(','));
  const dl = page.waitForEvent('download');
  await page.evaluate(() => { const a = document.querySelector('#menubar [data-cmd="save"]'); if (a) a.click(); else document.querySelector('#saveBtn').click(); });
  const saved = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  await page.evaluate(() => { elements = []; render(); });
  await loadDesign(page, saved);
  const back = await page.evaluate(() => JSON.parse(JSON.stringify(elements)));
  const strip = (arr) => arr.map((e) => { const o = { ...e }; delete o.id; return JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]])); });
  const diff = strip(all).filter((x, i) => { const a = JSON.parse(x), b = new Map(JSON.parse(strip(back)[i] || '[]')); return a.some(([k, v]) => JSON.stringify(b.get(k)) !== JSON.stringify(v)); });
  rec.check('I-roundtrip', '保存设计 → 载入后所有元素字段原样', back.length === all.length && diff.length === 0, `${back.length}/${all.length} 个；差异 ${diff.length}：${diff.slice(0, 1).join('')}`);
  // 撤消 / 重做
  await page.evaluate(() => { elements = [{ type: 'text', x: 1, y: 1, size: 3, content: 'A', rot: 0 }]; commit(); render();
    elements[0].x = 5; commit(); elements[0].x = 9; commit(); });
  const ur = await page.evaluate(() => { undo(); const a = elements[0].x; undo(); const b = elements[0].x; redo(); const c = elements[0].x; return [a, b, c]; });
  rec.check('I-undo', '撤消 / 重做', JSON.stringify(ur) === '[5,1,5]', JSON.stringify(ur));
  // 自动保存：刷新后设计还在
  await page.evaluate(() => { elements = [{ type: 'text', x: 7, y: 7, size: 3, content: '自动保存测试', rot: 0 }]; commit(); render(); });
  await page.reload(); await page.waitForSelector('#preview .label');
  rec.check('I-autosave', '意外关闭后重开，设计自动恢复', (await previewTexts(page))[0].includes('自动保存测试'));
  // 损坏的自动保存 / 损坏的设计文件
  await page.evaluate(() => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/autosave/i.test(k)) localStorage.setItem(k, '{坏数据'); } });
  page._errors.length = 0;
  await page.reload(); await page.waitForTimeout(500);
  rec.check('I-badautosave', '自动保存损坏时仍能正常启动', (await page.locator('#preview .label').count()) > 0 && page._errors.length === 0, page._errors.join(';'));
  const bad = OUT + 'bad-design.json'; fs.writeFileSync(bad, '{"elements": "不是数组"');
  page._dialogs.length = 0;
  await page.setInputFiles('#designIn', bad); await page.waitForTimeout(400);
  rec.check('I-baddesign', '载入损坏的设计文件：提示错误、原设计不丢', page._dialogs.length > 0 && (await page.locator('#preview .label').count()) > 0 && page._errors.length === 0, page._dialogs.join(' / ').slice(0, 120));
  await page.close();
}

/* ================= G. 1 万条大批量 ================= */
console.log('\n[G] 1 万条大批量');
{
  const page = await openApp(browser);
  const N = 10000;
  const csv = 'SKU,品名,EAN\n' + Array.from({ length: N }, (_, i) => `SKU${String(i + 1).padStart(5, '0')},商品${i + 1},${ean(i + 1)}`).join('\n');
  await loadDesign(page, design([{ type: 'text', x: 3, y: 3, size: 3, content: '{品名}', rot: 0 }, B1('barcode', '{SKU}', 3, 9, { module: 0.25, h: 8 }),
    B1('ean13', '{EAN}', 3, 20, { h: 10 }), { type: 'qrcode', x: 55, y: 5, size: 16, ecl: 'M', rot: 0, content: '{SKU}|{EAN}' }], 80, 40));
  let t0 = Date.now(); await setCSV(page, csv); const tApply = Date.now() - t0;
  rec.check('G-import', `导入并预览 1 万条 < 5 秒`, tApply < 5000, (tApply / 1000).toFixed(1) + ' 秒');
  t0 = Date.now(); const z = await exportCmd(page, { choice: 'ok', timeout: 600000 }); const tExp = Date.now() - t0;
  if (!z.data) rec.check('G-export', '1 万张生成 ZPL', false, '未导出');
  else {
    const zpl = z.data.toString('utf8'), n = zplLabelCount(zpl);
    rec.check('G-export-count', '1 万张生成 ZPL 张数正确', n === N, n + ' 张');
    rec.check('G-export-time', '1 万张生成 ZPL < 90 秒', tExp < 90000, (tExp / 1000).toFixed(1) + ' 秒，' + (zpl.length / 1048576).toFixed(1) + 'MB');
    // 抽查首尾两张：独立出纸后扫码
    const blocks = zpl.split('^XZ').filter((b) => b.includes('^XA')), pre = zpl.slice(0, zpl.indexOf('^XA'));
    const pick = (i) => pre + blocks[i] + '^XZ\n';
    const want = (i) => [`SKU${String(i + 1).padStart(5, '0')}`, ean(i + 1)];
    for (const i of [0, blocks.length - 1]) {
      const got = (await scanPNG(renderZPL(pick(i), 80, 40, 203)[0])).map((g) => g.text);
      rec.check(`G-sample-${i}`, `抽查第 ${i + 1} 张：Code128 / EAN-13 / QR 都正确`, want(i).every((w) => got.includes(w)) && got.some((g) => g === want(i).join('|')), got.join(','));
    }
  }
  // TSPL 1 万张：耗时与体积（串口 / USB 发送时体积直接决定出纸速度）
  t0 = Date.now(); const t = await exportCmd(page, { lang: 'tspl', choice: 'ok', timeout: 600000 }); const tT = Date.now() - t0;
  if (t.gap) rec.gap('G-tspl', '1 万张 TSPL', t.gap);
  else if (!t.data) rec.check('G-tspl', '1 万张 TSPL', false, '未导出');
  else {
    const labs = ZPLmod.parseTSPL(new Uint8Array(t.data)), n = labs.reduce((a, l) => a + l.copies, 0);
    rec.check('G-tspl-count', '1 万张 TSPL 张数正确', n === N, n + ' 张');
    rec.check('G-tspl-time', '1 万张 TSPL < 90 秒', tT < 90000, (tT / 1000).toFixed(1) + ' 秒');
    rec.check('G-tspl-size', '1 万张 TSPL 体积 < 40MB（平均每张 < 4KB）', t.data.length < 40 * 1048576, (t.data.length / 1048576).toFixed(1) + 'MB');
  }
  rec.check('G-noerror', '大批量全程无脚本错误', page._errors.length === 0, page._errors.join('; '));
  await page.close();
}

await browser.close();
rec.save();
const bad = rec.items.filter((i) => i.status !== 'pass');
console.log(`\n==== 网页端验收：达标 ${rec.items.length - bad.length} / ${rec.items.length}（不达标 ${bad.filter((i) => i.status === 'fail').length}，缺口 ${bad.filter((i) => i.status === 'gap').length}） ====`);
process.exit(bad.length ? 1 : 0);
