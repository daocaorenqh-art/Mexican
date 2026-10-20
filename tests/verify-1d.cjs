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
const cpp = async (bits, opt) => {
  const r = await decodeBits(bits.length, 40, (x) => bits[x] === '1', Object.assign({ quiet: 20, scale: 2 }, opt));
  return r.length ? r[0] : null;
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
    const z = zxing1d(r.bits), c = ((await cpp(r.bits)) || {}).text;
    const norm = (s) => (type === 'upca' && s && s.length === 13 && s[0] === '0') ? s.slice(1) : s;
    eq(`${type} "${input}" ZXing`, norm(z), want);
    eq(`${type} "${input}" zxing-cpp`, norm(c), want);
  }
  // 新码制：UPC-E / Code93（含全 ASCII）/ Codabar
  const more = [['upce', '0123456', '01234565'], ['upce', '01234565', '01234565'], ['upce', '1987654', null],
    ['code93', 'CODE93-TEST', 'CODE93-TEST'], ['code93', 'Hello, World! a@b', 'Hello, World! a@b'], ['code93', 'SN0001/2026', 'SN0001/2026'],
    ['codabar', '12345', 'A12345B'], ['codabar', 'C31117013206375D', 'C31117013206375D'], ['codabar', 'a40156b', 'A40156B']];
  for (const [type, input, want0] of more) {
    const r = B.encode1D(type, input), want = want0 || r.text;
    eq(`${type} "${input}" 人眼可读文字`, r.text, want);
    const c = await cpp(r.bits);
    // zxing-cpp 读 Codabar 默认不带起止符；UPC-E 可能按展开后的 13 位（0 + UPC-A）给出
    let got = c && (type === 'codabar' && c.text.length === want.length - 2 ? want[0] + c.text + want.slice(-1) : c.text);
    if (type === 'upce' && got === '0' + r.upca) got = r.text;
    eq(`${type} "${input}" zxing-cpp`, got, want);
    // @zxing/library 0.23 没有 UPC-E 读码器，UPC-E 只用 zxing-cpp 校验
    if (type !== 'codabar' && type !== 'upce') eq(`${type} "${input}" ZXing`, zxing1d(r.bits), want);
  }
  // GS1-128：FNC1 起始 + 可变长 AI 后 FNC1 分隔；zxing-cpp 按 GS1 人眼格式读回
  for (const src of ['(01)06925253841665(17)261020(10)B26', '(00)006925253841665002', '(10)LOT-7(21)SN0001(30)25', '(01)06925253841665(3103)001250(15)270131']) {
    const r = B.encode1D('gs1128', src);
    eq(`GS1-128 ${src} 人眼文字`, r.text, src);
    const c = await cpp(r.bits, { textMode: 'HRI' });
    check(`GS1-128 ${src} zxing-cpp 识别为 GS1`, c && c.text === src, c && c.text);
  }
  throws('GS1 GTIN 校验位错被拒绝', () => B.encode1D('gs1128', '(01)06925253841660'), '校验位');
  throws('GS1 日期无效被拒绝', () => B.encode1D('gs1128', '(17)261320'), '日期无效');
  throws('GS1 定长位数不对被拒绝', () => B.encode1D('gs1128', '(01)123'), '14 位');
  throws('GS1 可变长超长被拒绝', () => B.encode1D('gs1128', '(10)' + 'A'.repeat(21)), '最多 20');
  throws('GS1 写法错误被拒绝', () => B.encode1D('gs1128', '0106925253841665'), '写法');
  throws('GS1 不认识的 AI 被拒绝', () => B.encode1D('gs1128', '(99999)1'), '写法');
  throws('UPC-E 数制只能 0/1', () => B.encode1D('upce', '2123456'), '数制');
  throws('UPC-E 校验位错被拒绝', () => B.encode1D('upce', '01234560'), '校验位');
  throws('Codabar 中间不能有 A–D', () => B.encode1D('codabar', 'A12B34B'), '起止符');
  throws('Code93 中文被拒绝', () => B.encode1D('code93', '中'), 'ASCII');

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
  // EAN / UPC 附加码：zxing-cpp 读附加码时把它接在主码后面（空格分隔）
  for (const [type, input, main, add] of [['ean13', '9771234567003+02', '9771234567003', '02'], ['ean13', '978711512345+52800', '9787115123459', '52800'],
    ['upca', '03600029145+12', '036000291452', '12'], ['ean8', '1234567+00', '12345670', '00'], ['upce', '0123456+99999', '01234565', '99999'],
    ['ean13', '6925253841665 + 07', '6925253841665', '07']]) {
    const r = B.encode1D(type, input);
    check(`${type} "${input}" 主码文字 / 附加码`, r.text === main && r.addon && r.addon.text === add && r.addon.from === r.mainLen + B.ADDON.GAP, JSON.stringify([r.text, r.addon]));
    const c = await cpp(r.bits, { eanAddOnSymbol: 'Require' });
    let got = c && c.text.replace(/\s/g, '');
    if (type === 'upca' && got && got.length === 13 + add.length && got[0] === '0') got = got.slice(1);
    if (type === 'upce' && got && got.startsWith('0' + B.encode1D('upce', main).upca)) got = main + got.slice(13);
    eq(`${type} "${input}" zxing-cpp 读出主码 + 附加码`, got, main + add);
  }
  throws('附加码位数不对被拒绝', () => B.encode1D('ean13', '9771234567003+123'), '2 位或 5 位');
  throws('附加码含字母被拒绝', () => B.encode1D('ean13', '9771234567003+AB'), '2 位或 5 位');
  // ITF-14：补 / 核对 GS1 校验位
  for (const [input, want] of [['1069252538416', null], ['10692525384160', '10692525384160'], ['0 0012345 67890 5', '00012345678905']]) {
    const r = B.encode1D('itf14', input), w = want || r.text;
    check(`ITF-14 "${input}" 14 位且校验位正确`, r.text.length === 14 && +r.text[13] === B.GS1.check(r.text.slice(0, 13)), r.text);
    eq(`ITF-14 "${input}" zxing-cpp`, ((await cpp(r.bits)) || {}).text, w);
    eq(`ITF-14 "${input}" ZXing`, zxing1d(r.bits), w);
  }
  throws('ITF-14 校验位错被拒绝', () => B.encode1D('itf14', '10692525384161'), '校验位');
  throws('ITF-14 位数不对被拒绝', () => B.encode1D('itf14', '123456'), '13 或 14 位');
  check('BARCODE_1D 列表', B.BARCODE_1D.length === 11);
  done();
})();
