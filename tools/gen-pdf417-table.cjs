'use strict';
/* 生成 PDF417 码字图样表（ISO/IEC 15438 规定的 3 个簇 × 929 个码字，每个 17 模块：4 条 4 空）。
   这张表是标准数据，没有公式可推；这里从开源解码库 @zxing/library（Apache-2.0）里的同一张表换算出来，
   按簇号 (b1-b2+b3-b4+9) mod 9 ∈ {0,3,6} 分簇，压成字符串写进 src/barcodes.js。
   tests/pdf417.test.cjs 会再次与该库逐项比对。用法：node tools/gen-pdf417-table.cjs */
const { default: C } = require('@zxing/library/cjs/core/pdf417/PDF417Common.js');
function widths(p) { const w = []; let prev = 1, run = 0;
  for (let b = 16; b >= 0; b--) { const v = (p >> b) & 1; if (v === prev) run++; else { w.push(run); run = 1; prev = v; } }
  w.push(run); return w; }
function table() {
  const T = [new Array(929), new Array(929), new Array(929)];
  C.SYMBOL_TABLE.forEach((sym, i) => {
    const p = sym & 0x1FFFF, cw = (C.CODEWORD_TABLE[i] - 1) % 929, w = widths(p);
    if (w.length !== 8 || w.reduce((a, b) => a + b) !== 17) throw new Error('图样不是 4 条 4 空：' + sym);
    const k = (w[0] - w[2] + w[4] - w[6] + 9) % 9; if (k % 3) throw new Error('簇号异常：' + sym);
    if (T[k / 3][cw] !== undefined) throw new Error('重复码字');
    T[k / 3][cw] = p;
  });
  T.forEach((t) => { for (let i = 0; i < 929; i++) if (t[i] === undefined) throw new Error('缺码字 ' + i); });
  return T;
}
// 首位恒为条（1）、末位恒为空（0）：只存中间 15 位，每个码字 3 个 base32 字符
const pack = (T) => T.map((t) => t.map((p) => ((p >> 1) & 0x7FFF).toString(32).padStart(3, '0')).join('')).join('');
module.exports = { table, pack };
if (require.main === module) {
  const s = pack(table());
  const fs = require('fs'), path = require('path'), f = path.join(__dirname, '..', 'src', 'barcodes.js');
  const src = fs.readFileSync(f, 'utf8'), re = /(const PDF417_TABLE=')[0-9a-v]*(';)/;
  if (!re.test(src)) { console.log(s.length + ' 字符（src/barcodes.js 里还没有 PDF417_TABLE）'); process.exit(0); }
  fs.writeFileSync(f, src.replace(re, '$1' + s + '$2'));
  console.log('已写入 src/barcodes.js，' + s.length + ' 字符');
}
