/* 生成真机测试标签（D6）：node tests/make-test-labels.cjs → examples/test-labels/*.json
   每张标签都用来量一件事，量法见 examples/test-labels/README.md 与 docs/print-test-matrix.md。 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'examples', 'test-labels');
fs.mkdirSync(OUT, { recursive: true });

const label = (w, h, extra) => Object.assign({ w, h, dpi: 203, cols: 0, gapX: 3, gapY: 3, pmode: 'roll' }, extra || {});
const T = (x, y, size, content, extra) => Object.assign({ type: 'text', x, y, size, bold: false, align: 'left', font: '', rot: 0, content }, extra || {});
const box = (x, y, w, h, border, extra) => Object.assign({ type: 'box', x, y, w, h, border, fill: false, rot: 0 }, extra || {});
const bc = (type, x, y, h, module, content, extra) => Object.assign({ type, x, y, h, module, showText: true, color: '#000000', bg: '', rot: 0, content }, extra || {});
const mx = (type, x, y, size, content, extra) => Object.assign({ type, x, y, size, ecl: 'M', color: '#000000', bg: '', rot: 0, content }, extra || {});
const files = {};

// 1. 尺寸校准尺：外框 100×60、内框 50×30、刻度每 10mm。用卡尺量，误差应 ≤ 0.3mm（203dpi 一个点 0.125mm）
{
  const els = [box(0, 0, 100, 60, 0.25), box(10, 20, 50, 30, 0.25)];
  for (let x = 10; x < 100; x += 10) els.push(box(x, 0, 0.25, x % 50 === 0 ? 8 : 5, 0.25, { fill: true }), T(x + 0.6, 5.5, 2, String(x)));
  for (let y = 10; y < 60; y += 10) els.push(box(0, y, y % 50 === 0 ? 8 : 5, 0.25, 0.25, { fill: true }), T(5.5, y + 0.4, 2, String(y)));
  els.push(T(12, 22, 2.5, '内框 50.0 × 30.0 mm'), T(12, 26, 2.5, '外框 100.0 × 60.0 mm'), T(12, 30, 2.5, '刻度间距 10.0 mm'),
    T(62, 52, 2, '{#DATE:YYYY-MM-DD HH:mm}'));
  files['01-calibration-ruler'] = { v: 1, label: label(100, 60), elements: els };
}

// 2. 一维码模块宽梯度（203dpi 下 0.125/0.25/0.375/0.5mm = 1/2/3/4 点；300dpi 自动换算）
const ladder = (name, type, content, mods, h) => {
  const els = [T(2, 1, 2.2, name + ' 模块宽梯度（标注为设定值 mm）', { bold: true })];
  mods.forEach((m, i) => { const y = 5 + i * (h + 6); els.push(T(2, y + 1, 2, m.toFixed(3)), bc(type, 14, y, h, m, content)); });
  return { v: 1, label: label(100, 5 + mods.length * (h + 6)), elements: els };
};
files['02-ladder-code128'] = ladder('Code128', 'barcode', '1234567890', [0.125, 0.19, 0.25, 0.33, 0.375, 0.5], 6);
files['03-ladder-ean13'] = ladder('EAN-13', 'ean13', '6925253841665', [0.25, 0.264, 0.33, 0.375, 0.5], 9);
files['04-ladder-code39'] = ladder('Code39', 'code39', 'AB-123', [0.125, 0.19, 0.25, 0.33], 6);
files['05-ladder-itf'] = ladder('ITF-25', 'itf', '12345678', [0.19, 0.25, 0.33, 0.5], 6);

// 3. 中文小字梯度 1.5–4mm，常规 / 加粗；记录哪一档开始笔画断开、粘连
{
  const els = [T(2, 1, 2.2, '中文小字梯度（字号 mm，左常规 右加粗）', { bold: true })];
  [1.5, 2, 2.5, 3, 3.5, 4].forEach((s, i) => {
    const y = 5 + i * 6.5;
    els.push(T(2, y, 2, s.toFixed(1)), T(10, y, s, '合格证 镊铸鑫 B26'), T(55, y, s, '合格证 镊铸鑫 B26', { bold: true }));
  });
  files['06-cjk-size-ladder'] = { v: 1, label: label(100, 46), elements: els };
}

// 4. 二维码尺寸梯度：QR 与 DataMatrix（含中文）
{
  const els = [T(2, 1, 2.2, 'QR / DataMatrix 尺寸梯度（边长 mm）', { bold: true })];
  [8, 10, 12, 15, 20].forEach((s, i) => { const x = 3 + [0, 12, 26, 42, 61][i];
    els.push(T(x, 5, 2, 'QR ' + s), mx('qrcode', x, 8, s, 'https://example.com/合格证?sn=0001'),
      T(x, 31, 2, 'DM ' + s), mx('datamatrix', x, 34, s, '合格证 DM-0001')); });
  files['07-2d-size-ladder'] = { v: 1, label: label(100, 58), elements: els };
}

// 5. 旋转 0/90/180/270：文字、Code128、QR 都要能扫、方向正确
{
  const els = [];
  [[0, 5, 5], [90, 95, 5], [180, 95, 75], [270, 5, 75]].forEach(([r, x, y]) => {
    els.push(T(x, y, 2.5, '旋转 ' + r + '°', { rot: r }));
    const dx = (a, b) => [x + a * Math.cos(r * Math.PI / 180) - b * Math.sin(r * Math.PI / 180), y + a * Math.sin(r * Math.PI / 180) + b * Math.cos(r * Math.PI / 180)];
    const [bx, by] = dx(0, 5), [qx, qy] = dx(0, 18);
    els.push(bc('barcode', +bx.toFixed(2), +by.toFixed(2), 8, 0.25, 'ROT' + r, { rot: r }), mx('qrcode', +qx.toFixed(2), +qy.toFixed(2), 12, 'ROT-QR-' + r, { rot: r }));
  });
  files['08-rotation'] = { v: 1, label: label(100, 80), elements: els };
}

// 6. 静区与贴边：同一个码分别贴边、留足静区；预检会对贴边的给出提醒（预期）
{
  const els = [T(2, 1, 2.2, '静区与贴边（上排贴边，下排留足 10X / 4 模块）', { bold: true }),
    bc('barcode', 0, 5, 8, 0.25, 'EDGE128'), bc('barcode', 68.5, 5, 8, 0.25, 'EDGE128R'),
    bc('barcode', 3, 22, 8, 0.25, 'QUIET128'), mx('qrcode', 0.2, 38, 12, 'EDGE-QR'), mx('qrcode', 30, 38, 12, 'QUIET-QR'),
    bc('ean13', 55, 36, 10, 0.33, '6925253841665')];
  files['09-quiet-zone'] = { v: 1, label: label(100, 52), elements: els };
}

for (const [name, d] of Object.entries(files)) fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(d, null, 2) + '\n');
console.log('已生成 ' + Object.keys(files).length + ' 个测试标签 → ' + path.relative(process.cwd(), OUT));
