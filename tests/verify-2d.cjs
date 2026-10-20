/* 2D 码编码器正确性校验：直接加载 src/barcodes.js（界面里用的同一份编码器），
   用三个独立解码器（jsQR、ZXing、zxing-cpp）验证生成的码能被扫回原文。
   运行：npm test */
const path = require('path');
const jsQR = require('jsqr');
const Z = require('@zxing/library');
const { decodeBits } = require('./helpers.cjs');
const { Codes2D } = require(path.join(__dirname, '..', 'src', 'barcodes.js'));

// 偶数倍缩放：ZXing 纯码模式按半模块取样，奇数倍会落在边界上
function raster(mod, size, quiet, scale) {
  const W = (size + quiet * 2) * scale;
  const lum = new Uint8ClampedArray(W * W).fill(255), rgba = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x])
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = ((y + quiet) * scale + dy) * W + (x + quiet) * scale + dx;
      lum[i] = 0; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 0;
    }
  return { W, lum, rgba };
}
function zx(reader, img) {
  const hints = new Map([[Z.DecodeHintType.PURE_BARCODE, true], [Z.DecodeHintType.TRY_HARDER, true]]);
  try {
    return reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(img.lum, img.W, img.W))), hints).getText();
  } catch (e) { return null; }
}
const cpp = async (m, formats) => {
  const r = await decodeBits(m.size, m.size, (x, y) => m.modules[y][x], { quiet: 4, scale: 4, formats });
  return r.length ? r[0].text : null;
};

(async () => {
  let pass = 0, fail = 0;
  const check = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗', name); } };

  const qrCases = [
    ['6925253841665', 'M'], ['HELLO WORLD', 'L'], ['https://example.com/p?id=FZ075885L-01110', 'Q'],
    ['合格证 品名：女包 零售价：558.00', 'M'], ['SN-01001', 'H'],
    ['A'.repeat(300) + '中文', 'M'], ['0123456789'.repeat(60), 'L'], ['9'.repeat(2900), 'L'],
  ];
  for (const [text, ecl] of qrCases) {
    const q = Codes2D.encodeQR(text, ecl);
    const img = raster(q.modules, q.size, 4, 4);
    const j = jsQR(img.rgba, img.W, img.W);
    check(`QR v${q.version} ${ecl} jsQR`, j && Buffer.from(j.binaryData).toString('utf8') === text);
    check(`QR v${q.version} ${ecl} ZXing`, zx(new Z.QRCodeReader(), img) === text);
    check(`QR v${q.version} ${ecl} zxing-cpp`, (await cpp(q, ['QRCode'])) === text);
  }
  // DataMatrix：每一档尺寸都塞满数据（最坏情况：无填充、所有交织块满载）
  for (const n of [3, 5, 8, 12, 18, 22, 30, 36, 44, 62, 86, 114, 144, 174, 204, 280, 368, 456, 576, 696, 816, 1050, 1304]) {
    const text = 'K'.repeat(n);
    const d = Codes2D.encodeDM(text);
    check(`DataMatrix ${d.size}x${d.size}`, zx(new Z.DataMatrixReader(), raster(d.modules, d.size, 2, 4)) === text);
  }
  for (const t of ['12345', 'FZ075885L-01110', 'SN:A1B2C3-2026/10/20']) {
    const d = Codes2D.encodeDM(t);
    check(`DataMatrix "${t}" ZXing`, zx(new Z.DataMatrixReader(), raster(d.modules, d.size, 2, 4)) === t);
    check(`DataMatrix "${t}" zxing-cpp`, (await cpp(d, ['DataMatrix'])) === t);
  }
  // 中文 DataMatrix：ECI 26（UTF-8）+ Base256；@zxing/library 不支持 ECI，用 zxing-cpp 校验
  for (const t of ['合格证', '品名：女包 零售价：558.00', '批号 B2026-10-20 生产日期 2026年10月20日', '中'.repeat(260)]) {
    const d = Codes2D.encodeDM(t);
    check(`DataMatrix 中文 ${d.size}x${d.size} "${t.slice(0, 12)}" zxing-cpp`, (await cpp(d, ['DataMatrix'])) === t);
  }
  // GS1 DataMatrix：首码字 FNC1(232)，可变长 AI 后 FNC1 分隔
  const { encode2D } = require(path.join(__dirname, '..', 'src', 'barcodes.js'));
  for (const src of ['(01)06925253841665(17)261020(10)B26(21)SN0001', '(01)06925253841665(10)LOT-A(240)PART/7']) {
    const d = encode2D('gs1dm', src);
    const r = await decodeBits(d.size, d.size, (x, y) => d.modules[y][x], { quiet: 2, scale: 4, formats: ['DataMatrix'], textMode: 'HRI' });
    check(`GS1 DataMatrix ${src} zxing-cpp`, r.length && r[0].text === src);
  }
  let threw = false; try { Codes2D.encodeQR('9'.repeat(8000), 'L'); } catch (e) { threw = true; }
  check('超长 QR 被拒绝', threw);
  threw = false; try { Codes2D.encodeDM('中'.repeat(600)); } catch (e) { threw = true; }
  check('超长 DataMatrix 被拒绝', threw);

  console.log(`2D 编码器校验：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
