/* TSPL 生成测试（TSC / 佳博 / 芯烨）：解析生成的指令，按 BITMAP / BAR / BOX 还原打印点阵后扫码；
   检查纸张 / 间隙 / 浓度 / 速度 / 出纸方式等指令、PRINT 合并、位图反色。运行：npm test */
const path = require('path');
const ZPL = require(path.join(__dirname, '..', 'src', 'zpl.js'));
const Job = require(path.join(__dirname, '..', 'src', 'job.js'));
const { suite, decodeBits } = require('./helpers.cjs');
const { check, eq, done } = suite('TSPL 生成');

const txt = (u8) => Buffer.from(u8).toString('latin1');
function render(lab, W, H, invert) {
  const bm = ZPL.Bitmap(W, H);
  for (const b of lab.bitmaps) for (let y = 0; y < b.h; y++) for (let x = 0; x < b.bpr * 8; x++) {
    const v = b.bytes[y * b.bpr + (x >> 3)], on = ((v >> (7 - (x & 7))) & 1) === (invert ? 0 : 1);
    if (on) ZPL.setPx(bm, b.x + x, b.y + y);
  }
  for (const [x, y, w, h] of lab.bars) ZPL.fillRect(bm, x, y, w, h);
  for (const [x0, y0, x1, y1, t] of lab.boxes) { ZPL.fillRect(bm, x0, y0, x1 - x0, t); ZPL.fillRect(bm, x0, y1 - t, x1 - x0, t); ZPL.fillRect(bm, x0, y0, t, y1 - y0); ZPL.fillRect(bm, x1 - t, y0, t, y1 - y0); }
  return bm;
}
const build = (elements, extra) => ZPL.buildTSPL(Object.assign({ label: { w: 80, h: 60, dpi: 203 }, elements,
  list: Job.makePrintList(null, 1, 0, 1), now: new Date(2026, 9, 20) }, extra));

(async () => {
  // 点阵扫码：一维 / 二维 / GS1 / 旋转
  const cases = [
    { type: 'barcode', content: 'TSPL-0001', want: 'TSPL-0001' }, { type: 'ean13', content: '6925253841665', want: '6925253841665' },
    { type: 'qrcode', content: '佳博 芯烨 TSC', want: '佳博 芯烨 TSC', size: 18 }, { type: 'datamatrix', content: '批号B26', want: '批号B26', size: 12 },
    { type: 'gs1128', content: '(01)06925253841665(10)B26', want: '(01)06925253841665(10)B26', hri: true },
  ];
  for (const c of cases) for (const rot of [0, 90]) {
    const el = Object.assign({ x: rot ? 60 : 8, y: 6, h: 10, module: 0.25, showText: false, rot, ecl: 'M' }, c);
    for (const invert of [true, false]) {
      const r = build([el], { options: { printer: { invert } } });
      const lab = ZPL.parseTSPL(r.data)[0];
      const bm = render(lab, Job.dots(80, 203), Job.dots(60, 203), invert);
      const got = await decodeBits(bm.w, bm.h, (x, y) => ZPL.getPx(bm, x, y), { quiet: 10, scale: 2, textMode: c.hri ? 'HRI' : 'Plain' });
      check(`TSPL ${c.type} 旋转 ${rot}° ${invert ? '反色' : '不反色'} 点阵可扫`, got.some(g => g.text === c.want), JSON.stringify(got));
    }
  }

  // 一维码用 BAR 精确画出（体积小），二维码 / 文字仍用 BITMAP
  const r1 = build([{ type: 'barcode', x: 8, y: 6, h: 10, module: 0.25, showText: false, content: 'SIZE-TEST-0001' }]);
  const l1 = ZPL.parseTSPL(r1.data)[0];
  check('一维码改用 BAR、不用 BITMAP', l1.bars.length > 20 && l1.bitmaps.length === 0, l1.bars.length + ' 个 BAR');
  const bmBytes = Math.ceil(ZPL.barsBitmap(require(path.join(__dirname, '..', 'src', 'barcodes.js')).encode1D('barcode', 'SIZE-TEST-0001').bits, 2, 80).w / 8) * 80;
  check('一维码 TSPL 体积小于位图的一半', r1.data.length < bmBytes / 2, r1.data.length + ' 字节 vs 位图 ' + bmBytes);
  const l2 = ZPL.parseTSPL(build([{ type: 'qrcode', x: 8, y: 6, size: 18, ecl: 'M', content: '二维码仍用位图 0123456789' }]).data)[0];
  check('二维码仍用 BITMAP', l2.bitmaps.length === 1);
  const rr = ZPL.bitmapRects(ZPL.barsBitmap('1101', 2, 5), 100);
  check('位图拆矩形精确', JSON.stringify(rr) === '[[0,0,4,5],[6,0,2,5]]', JSON.stringify(rr));

  // 头部指令
  let t = txt(build([{ type: 'box', x: 1, y: 1, w: 10, h: 5, border: 0.5 }]).data);
  check('SIZE / 默认间隙 2mm / 方向 / 原点 / CLS', t.startsWith('SIZE 80 mm,60 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 0\r\nREFERENCE 0,0\r\nCLS\r\n'), t.slice(0, 120));
  check('线框用 BOX（终点坐标）', t.includes('BOX 8,8,88,48,4\r\n'), t);
  check('PRINT 1,1', t.endsWith('PRINT 1,1\r\n'));
  t = txt(build([{ type: 'box', x: 1, y: 1, w: 10, h: 5, fill: true }], { options: { printer: { track: 'mark', gap: 3, speed: 4, darkness: 20, mode: 'peel', top: 8, left: 16 } } }).data);
  check('黑标纸 BLINE / 速度 / 浓度换算 0–15 / 剥离 / 偏移', ['BLINE 3 mm,0 mm', 'SPEED 4', 'DENSITY 10', 'SET PEEL ON', 'SHIFT 8', 'REFERENCE 16,0'].every(s => t.includes(s)), t.slice(0, 200));
  check('实心矩形用 BAR', t.includes('BAR 8,8,80,40\r\n'));
  t = txt(build([{ type: 'box', x: 1, y: 1, w: 10, h: 5 }], { options: { printer: { track: 'continuous', mode: 'cut' } } }).data);
  check('连续纸 GAP 0 / 切刀', t.includes('GAP 0 mm,0 mm') && t.includes('SET CUTTER 1'));

  // PRINT 合并与流水号
  let r = build([{ type: 'box', x: 1, y: 1, w: 10, h: 5 }], { list: Job.makePrintList(null, 1, 0, 4) });
  eq('相同标签合并为 PRINT 1,4', (txt(r.data).match(/PRINT 1,4/g) || []).length, 1);
  eq('张数', r.labels, 4);
  r = build([{ type: 'counter', x: 1, y: 1, size: 3, start: 1, pad: 2 }], { list: Job.makePrintList(null, 1, 0, 3),
    raster: { text: (s) => ({ bm: ZPL.barsBitmap('1'.repeat(+s), 1, 2), dx: 0, dy: 0 }) } });
  eq('流水号逐张：3 个 CLS', ZPL.parseTSPL(r.data).length, 3);

  // 椭圆位图
  const e = ZPL.ellipseBitmap(40, 20, 3, false);
  check('椭圆外圈有点、中心为空', ZPL.getPx(e, 20, 1) === 1 && ZPL.getPx(e, 20, 10) === 0 && ZPL.getPx(e, 0, 0) === 0);
  check('实心椭圆中心有点', ZPL.getPx(ZPL.ellipseBitmap(40, 20, 3, true), 20, 10) === 1);
  t = txt(build([{ type: 'ellipse', x: 1, y: 1, w: 10, h: 6, border: 0.4 }]).data);
  check('椭圆输出为 BITMAP', /BITMAP 8,8,10,48,0,/.test(t));
  done();
})();
