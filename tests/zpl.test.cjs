/* ZPL 生成测试：位图压缩可逆；把生成的 ZPL 用测试内置的小型 ZPL 栅格器（^FO/^GFA/^GB）还原成打印点阵，
   再用 zxing-cpp 扫码，验证打印机实际会打出的条码能扫回原文（含旋转 90/180/270、中文二维码）。
   另检查原生指令模式、^PQ 合并、打印机参数、图形填充。运行：npm test */
const path = require('path');
const ZPL = require(path.join(__dirname, '..', 'src', 'zpl.js'));
const Job = require(path.join(__dirname, '..', 'src', 'job.js'));
const { suite, decodeBits } = require('./helpers.cjs');
const { check, eq, done } = suite('ZPL 生成');

// 测试用 ZPL 栅格器：支持 ^PW ^LL ^FO ^GFA（含 ASCII 压缩）^GB
function renderZPL(zpl) {
  const labels = [];
  for (const blk of zpl.split('^XZ').filter(b => b.includes('^XA'))) {
    const W = +(blk.match(/\^PW(\d+)/) || [0, 400])[1], H = +(blk.match(/\^LL(\d+)/) || [0, 400])[1];
    const bm = ZPL.Bitmap(W, H);
    const re = /\^FO(\d+),(\d+)(\^GFA,(\d+),\d+,(\d+),([^\^]*)|\^GB(\d+),(\d+),(\d+))/g;
    let m;
    while ((m = re.exec(blk))) {
      const x = +m[1], y = +m[2];
      if (m[4]) {
        const bpr = +m[5], rows = +m[4] / bpr, lines = ZPL.gfaDecode(m[6], bpr, rows);
        lines.forEach((hex, yy) => { for (let b = 0; b < bpr; b++) { const v = parseInt(hex.substr(b * 2, 2), 16);
          for (let k = 0; k < 8; k++) if (v & (0x80 >> k)) ZPL.setPx(bm, x + b * 8 + k, y + yy); } });
      } else {
        const w = +m[7], h = +m[8], t = +m[9];
        ZPL.fillRect(bm, x, y, w, t); ZPL.fillRect(bm, x, y + h - t, w, t); ZPL.fillRect(bm, x, y, t, h); ZPL.fillRect(bm, x + w - t, y, t, h);
      }
    }
    labels.push({ bm, pq: +(blk.match(/\^PQ(\d+)/) || [0, 1])[1] });
  }
  return labels;
}
const decodeLabel = (bm) => decodeBits(bm.w, bm.h, (x, y) => ZPL.getPx(bm, x, y), { quiet: 10, scale: 2 });
const build = (elements, extra) => ZPL.build(Object.assign({ label: { w: 80, h: 60, dpi: 203 }, elements,
  list: Job.makePrintList(null, 1, 0, 1), now: new Date(2026, 9, 20) }, extra));

(async () => {
  // 1) 压缩可逆
  const rnd = ZPL.Bitmap(83, 40); for (let i = 0; i < 900; i++) ZPL.setPx(rnd, (i * 37) % 83, (i * 11) % 40);
  for (const bm of [rnd, ZPL.barsBitmap('1101001110100011', 3, 50), ZPL.Bitmap(200, 3)]) {
    const raw = ZPL.gfa(bm, false), cmp = ZPL.gfa(bm, true);
    const bodyRaw = raw.split(',').slice(4).join(','), bodyCmp = cmp.split(',').slice(4).join(',');
    const want = []; for (let y = 0; y < bm.h; y++) want.push(bodyRaw.substr(y * bm.bpr * 2, bm.bpr * 2));
    check(`压缩可逆 ${bm.w}x${bm.h}`, JSON.stringify(ZPL.gfaDecode(bodyCmp, bm.bpr, bm.h)) === JSON.stringify(want));
    check(`压缩更小 ${bm.w}x${bm.h}`, bodyCmp.length < bodyRaw.length, bodyCmp.length + ' vs ' + bodyRaw.length);
  }
  eq('重复计数编码', ZPL.compressRow('FFFFFFFFFFFFFFFFFFFFFFFFF000000'), 'gKF,');

  // 2) 位图模式：打印点阵扫码（各码制 × 各旋转角度）
  const cases = [
    { type: 'barcode', content: 'FZ075885L-01110', want: 'FZ075885L-01110' },
    { type: 'ean13', content: '6925253841665', want: '6925253841665' },
    { type: 'ean8', content: '1234567', want: '12345670' },
    { type: 'upca', content: '03600029145', want: '036000291452' },
    { type: 'code39', content: 'sn-001', want: 'SN-001' },
    { type: 'itf', content: '12345', want: '012345' },
    { type: 'qrcode', content: '合格证 SN0001', want: '合格证 SN0001', size: 18 },
    { type: 'datamatrix', content: '批号B26-品名女包', want: '批号B26-品名女包', size: 14 },
  ];
  for (const c of cases) for (const rot of [0, 90, 180, 270]) {
    const el = Object.assign({ x: 30, y: 25, h: 10, module: 0.25, showText: false, ecl: 'M', rot }, c);
    // 旋转后保证仍在标签内：90° 向左长、180° 向左上、270° 向上
    if (rot === 90 || rot === 180) el.x = 75; if (rot === 180 || rot === 270) el.y = 55;
    const r = build([el], { label: { w: 100, h: 70, dpi: 203 } });
    const got = await decodeLabel(renderZPL(r.zpl)[0].bm);
    check(`${c.type} 旋转 ${rot}° 打印点阵可扫`, got.some(g => g.text === c.want || (c.type === 'upca' && g.text === '0' + c.want)), JSON.stringify(got));
  }
  // 位置：5mm @203dpi = 40 点；旋转 90° 时外框左移条高
  let z = build([{ type: 'barcode', x: 5, y: 5, h: 10, module: 0.25, content: 'ABC' }]).zpl;
  check('^FO 按 mm→点换算', /\^FO40,40\^GFA/.test(z), z.slice(0, 120));
  z = build([{ type: 'barcode', x: 20, y: 5, h: 10, module: 0.25, content: 'ABC', rot: 90 }]).zpl;
  check('旋转 90° 的 ^FO 与预览一致（绕左上角）', /\^FO80,40\^GFA/.test(z), (z.match(/\^FO\d+,\d+/) || [])[0]);

  // 3) 原生指令模式
  const nat = (el) => build([Object.assign({ x: 5, y: 5, h: 10, module: 0.25, showText: true }, el)], { options: { barcodes: 'native' } }).zpl;
  check('Code128 自动模式 ,A', /\^BCN,80,Y,N,N,A\^FH_\^FD/.test(nat({ type: 'barcode', content: '12345678' })));
  check('^ ~ _ 用 ^FH 十六进制转义（数据不再被改成空格）', nat({ type: 'barcode', content: 'A^B~C_D' }).includes('^FDA_5EB_7EC_5FD^FS'));
  check('EAN-13 发校验过的前 12 位', nat({ type: 'ean13', content: '6925253841665' }).includes('^FD692525384166^FS'));
  check('Code39 与预览一样转大写', nat({ type: 'code39', content: 'ab-1' }).includes('^FDAB-1^FS'));
  check('ITF 与预览一样补前导 0', nat({ type: 'itf', content: '12345' }).includes('^FD012345^FS'));
  check('原生模式旋转 90° 用方向参数 R', /\^BCR,/.test(nat({ type: 'barcode', content: 'AB', rot: 90, x: 30 })));
  check('二维码原生模式', /\^BQN,2,\d+\^FH_\^FDMA,ABC\^FS/.test(nat({ type: 'qrcode', content: 'ABC', size: 15 })));

  // 4) ^PQ 合并 / 流水号逐张
  const one = { type: 'text', x: 1, y: 1, size: 3, content: 'X' }, R = { text: () => ({ bm: ZPL.Bitmap(8, 8), dx: 0, dy: 0 }) };
  let out = ZPL.build({ label: { w: 50, h: 30, dpi: 203 }, elements: [one], list: Job.makePrintList(null, 1, 0, 3), raster: R });
  check('相同标签合并为一个 ^PQ3', (out.zpl.match(/\^XA/g) || []).length === 1 && out.zpl.includes('^PQ3') && out.labels === 3);
  out = ZPL.build({ label: { w: 50, h: 30, dpi: 203 }, elements: [{ type: 'counter', x: 1, y: 1, size: 3, start: 1, pad: 3 }],
    list: Job.makePrintList(null, 1, 0, 3), raster: { text: (t) => ({ bm: ZPL.barsBitmap(t === '001' ? '1' : t === '002' ? '11' : '111', 1, 1), dx: 0, dy: 0 }) } });
  check('流水号每张不同则逐张输出', (out.zpl.match(/\^XA/g) || []).length === 3 && out.labels === 3);

  // 5) 打印机参数
  out = build([one], { raster: R, options: { printer: { darkness: 15, speed: 4, media: 'transfer', track: 'mark', mode: 'peel', top: -8, left: 4 } } }).zpl;
  check('浓度 ~SD15', out.startsWith('~SD15'));
  check('速度 / 热转印 / 黑标 / 剥离 / 偏移', ['^PR4', '^MTT', '^MNM', '^MMP', '^LT-8', '^LS4'].every(s => out.includes(s)), out.slice(0, 160));
  out = build([one], { raster: R }).zpl;
  check('未设参数时不输出（沿用打印机设置）', !/\^PR|\^MT|\^MN|~SD/.test(out));

  // 6) 图形
  z = build([{ type: 'ellipse', x: 1, y: 1, w: 10, h: 6, border: 0.5, fill: true }]).zpl;
  check('实心椭圆 ^GE 线宽 = 短边一半', z.includes('^GE80,48,24,B'), z);
  z = build([{ type: 'box', x: 20, y: 1, w: 10, h: 4, border: 0.5, rot: 90 }]).zpl;
  check('旋转 90° 的线框宽高互换', z.includes('^FO128,8^GB32,80,4,B'), z);
  const lab = renderZPL(build([{ type: 'box', x: 1, y: 1, w: 10, h: 5, border: 0.5 }]).zpl)[0].bm;
  check('线框画在正确位置', ZPL.getPx(lab, 8, 8) === 1 && ZPL.getPx(lab, 30, 20) === 0);

  // 7) 无栅格回调时给出提示而不是静默丢内容
  out = ZPL.build({ label: { w: 50, h: 30, dpi: 203 }, elements: [one, { type: 'image', src: 'data:image/png;base64,AA', x: 1, y: 1, w: 5, h: 5 }], list: Job.makePrintList(null, 1, 0, 1) });
  check('缺少栅格回调时有警告', out.warnings.length === 2, JSON.stringify(out.warnings));
  done();
})();
