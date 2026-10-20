/* PDF417 编码器校验：码字图样表与标准表逐项一致；纠错码与生成多项式一致；
   生成的码用两个独立解码器（zxing-cpp、ZXing JS）扫回原文。运行：npm test */
const path = require('path');
const Z = require('@zxing/library');
const { suite, decodeBits } = require('./helpers.cjs');
const B = require(path.join(__dirname, '..', 'src', 'barcodes.js'));
const gen = require(path.join(__dirname, '..', 'tools', 'gen-pdf417-table.cjs'));
const fs = require('fs');
const { check, eq, throws, done } = suite('PDF417');

(async () => {
  // 1. 内嵌的码字图样表 = 从标准表重新生成的结果
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'barcodes.js'), 'utf8');
  const embedded = /const PDF417_TABLE='([0-9a-v]*)'/.exec(src)[1];
  eq('码字图样表与标准表一致（3 × 929）', embedded === gen.pack(gen.table()), true);

  // 2. 纠错：等级 0 的生成多项式是 (x−3)(x−9) = x² + 917x + 27（模 929）；
  //    任意数据加上纠错码后，在 x = 3^i 处的值都为 0
  const data = [5, 453, 178, 121, 239];
  for (const level of [0, 2, 5]) {
    const k = 2 << level, e = B.PDF417.ecc(data, level), all = data.concat(e);
    let ok = e.length === k, a = 1;
    for (let i = 1; i <= k && ok; i++) { a = a * 3 % 929; let v = 0; for (const c of all) v = (v * a + c) % 929; ok = v === 0; }
    check('等级 ' + level + '：' + k + ' 个纠错码字，校验式全为 0', ok);
  }

  // 3. 扫码
  const zxjs = (m) => {
    const s = 3, q = 4, W = (m.w + q * 2) * s, H = (m.h + q * 2) * s, lum = new Uint8ClampedArray(W * H).fill(255);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.modules[y][x])
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) lum[((y + q) * s + dy) * W + (x + q) * s + dx] = 0;
    try { return new Z.PDF417Reader().decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, W, H))),
      new Map([[Z.DecodeHintType.TRY_HARDER, true]])).getText(); } catch (e) { return null; }
  };
  const cases = [
    ['Hello PDF417'], ['ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789'],
    ['mixed: a1B2-c3.D4/e5$ & #x=y^z%*+'], ['punct ;<>@[\\]_`~!"|(){}?\''], ['line1\nline2\ttab\r\nend'],
    ['6925253841665'], ['12345678901234567890123456789012345678901234567890'], ['SN0001'], ['A'],
    ['合格证 品名：女包 零售价：558.00'], ['批号 B200 / 数量 12 / 日期 2026-10-20'],
    ['[)>\x1e06\x1dP12345\x1dQ100\x1dS0001\x1e\x04'],
    ['x'.repeat(400)], ['9'.repeat(800)], ['长文本'.repeat(60)],
    ['Hello', '0'], ['Hello', '8'], ['FIXED COLUMNS 1234567890', '', 6], ['narrow', '', 1],
  ];
  for (const [text, level, cols] of cases) {
    const label = JSON.stringify(text.length > 40 ? text.slice(0, 40) + '…(' + text.length + ')' : text) + (level ? ' 等级' + level : '') + (cols ? ' ' + cols + '列' : '');
    let m;
    try { m = B.encode2D('pdf417', text, level, cols); } catch (e) { check(label + ' 编码', false, e.message); continue; }
    check(label + ' 尺寸 = 17×列 + 69、每行 3 模块', m.w === 17 * m.cols + 69 && m.h === m.rows * 3 && m.modules.length === m.h && m.modules[0].length === m.w);
    if (level) eq(label + ' 用指定纠错等级', m.level, +level);
    if (cols) eq(label + ' 用指定列数', m.cols, cols);
    const r = await decodeBits(m.w, m.h, (x, y) => m.modules[y][x], { quiet: 4, scale: 2, formats: ['PDF417'] });
    eq(label + ' zxing-cpp 扫回原文', r.length ? r[0].text : null, text);
    // ZXing JS 读不了 1–2 个字符的 PDF417（zxing-cpp 自己生成的同内容码它也报格式错），也不按 ECI 解 UTF-8，这些只用 zxing-cpp 判定
    if (text.length > 2 && !/[^\x00-\x7f]/.test(text) && !/[\x1d\x1e\x04]/.test(text)) eq(label + ' ZXing JS 扫回原文', zxjs(m), text);
  }
  const auto = B.encode2D('pdf417', '批号 B200 / 数量 12');
  check('自动布局偏宽（宽高比 ≥ 1.5）', auto.w / auto.h >= 1.5, auto.w + '×' + auto.h);
  throws('空内容报错', () => B.encode2D('pdf417', ''), '为空');
  throws('超长报错', () => B.encode2D('pdf417', '中'.repeat(2000)), '太长');
  throws('列数太少行数超限报错', () => B.encode2D('pdf417', 'x'.repeat(600), '', 1), '超过 90 行');
  done();
})();
