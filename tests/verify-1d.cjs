/* 一维码编码器正确性校验：src/barcodes.js 生成的条码，用两个独立解码器（ZXing、zxing-cpp）扫回原文；
   并验证错误数据被拒绝（错校验位、非数字），不会打出扫不出的码。
   运行：npm test */
const path = require('path');
const Z = require('@zxing/library');
const { suite, decodeBits } = require('./helpers.cjs');
const B = require(path.join(__dirname, '..', 'src', 'barcodes.js'));
const { check, eq, throws, done } = suite('一维码编码器校验');

function zxing1d(bits) {
  const scale = 3, quiet = 20, h = 60, W = (bits.length + quiet * 2) * scale;
  const lum = new Uint8ClampedArray(W * h).fill(255);
  for (let y = 0; y < h; y++) for (let i = 0; i < bits.length; i++) if (bits[i] === '1')
    for (let d = 0; d < scale; d++) lum[y * W + (i + quiet) * scale + d] = 0;
  try {
    const hints = new Map([[Z.DecodeHintType.TRY_HARDER, true]]);
    return new Z.MultiFormatOneDReader(hints).decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, W, h))), hints).getText();
  } catch (e) { return null; }
}
const cpp = async (bits) => {
  const r = await decodeBits(bits.length, 40, (x) => bits[x] === '1', { quiet: 20, scale: 2 });
  return r.length ? r[0].text : null;
};

(async () => {
  const cases = [
    ['barcode', '123456', '123456'], ['barcode', 'FZ075885L-01110', 'FZ075885L-01110'], ['barcode', 'A12345', 'A12345'],
    ['barcode', '12345', '12345'], ['barcode', 'Hello World!', 'Hello World!'], ['barcode', '6925253841665', '6925253841665'],
    ['barcode', 'a~b|c{d}', 'a~b|c{d}'], ['barcode', 'SN-0001/2026', 'SN-0001/2026'],
    ['ean13', '690123456789', '6901234567892'], ['ean13', '6925253841665', '6925253841665'], ['ean13', '6925 2538 4166 5', '6925253841665'],
    ['ean8', '1234567', '12345670'], ['ean8', '12345670', '12345670'],
    ['upca', '03600029145', '036000291452'], ['upca', '036000291452', '036000291452'],
    ['code39', 'CODE39', 'CODE39'], ['code39', 'sn-001 a$', 'SN-001 A$'],
    ['itf', '1234567890', '1234567890'], ['itf', '12345', '012345'], ['itf', '00012345678905', '00012345678905'],
  ];
  for (const [type, input, want] of cases) {
    const r = B.encode1D(type, input);
    eq(`${type} "${input}" 人眼可读文字`, r.text, want);
    // UPC-A 在 ZXing 里按 EAN-13 读出（前面补 0）
    const z = zxing1d(r.bits), c = await cpp(r.bits);
    const norm = (s) => (type === 'upca' && s && s.length === 13 && s[0] === '0') ? s.slice(1) : s;
    eq(`${type} "${input}" ZXing`, norm(z), want);
    eq(`${type} "${input}" zxing-cpp`, norm(c), want);
  }
  // 错误数据必须被拒绝
  throws('EAN-13 错校验位被拒绝', () => B.encode1D('ean13', '6925253841660'), '校验位');
  throws('EAN-13 位数不对被拒绝', () => B.encode1D('ean13', '69252538416'), '12 或 13 位');
  throws('EAN-13 含字母被拒绝（不再悄悄删掉）', () => B.encode1D('ean13', '69252538416A5'), '只能包含数字');
  throws('EAN-8 错校验位被拒绝', () => B.encode1D('ean8', '12345678'), '校验位');
  throws('UPC-A 错校验位被拒绝', () => B.encode1D('upca', '036000291450'), '校验位');
  throws('ITF 含字母被拒绝', () => B.encode1D('itf', '12AB'), '只能包含数字');
  throws('Code128 中文被拒绝', () => B.encode1D('barcode', '合格证'), 'ASCII');
  throws('Code128 空内容被拒绝', () => B.encode1D('barcode', ''), '为空');
  throws('Code39 不支持的字符被拒绝', () => B.encode1D('code39', 'A_B'), 'Code39');
  check('BARCODE_1D 列表', B.BARCODE_1D.length === 6);
  done();
})();
