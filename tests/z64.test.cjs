/* Z64 同步压缩：任何标准 zlib 都能解回原样；CRC 与界面原实现一致；压缩率合理。运行：npm test */
const path = require('path');
const zlib = require('zlib');
const ZPL = require(path.join(__dirname, '..', 'src', 'zpl.js'));
const B = require(path.join(__dirname, '..', 'src', 'barcodes.js'));
const { check, done } = require('./helpers.cjs').suite('Z64 压缩');

// 界面原来的 CRC 实现（逐位），用来对照
function crcRef(s) { let c = 0; for (let i = 0; i < s.length; i++) { c ^= s.charCodeAt(i) << 8; for (let k = 0; k < 8; k++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; } return c.toString(16).padStart(4, '0'); }
const cases = [];
cases.push(['空', new Uint8Array(0)], ['1 字节', new Uint8Array([7])], ['全 0', new Uint8Array(5000)], ['全 FF', new Uint8Array(3000).fill(255)]);
let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) & 255;
cases.push(['随机 20KB', Uint8Array.from({ length: 20000 }, rnd)]);
const bars = ZPL.barsBitmap(B.encode1D('barcode', 'FZ075885L-01110').bits, 3, 80);
cases.push(['Code128 位图', bars.data]);
const q = B.Codes2D.encodeQR('合格证 SN0001 https://example.com/?id=123456', 'M');
cases.push(['QR 位图', ZPL.matrixBitmap(q.modules, q.size, 4).data]);
cases.push(['长距离重复 70KB', Uint8Array.from({ length: 70000 }, (_, i) => (i % 40000 < 20 ? i & 255 : (i * 7) & 3))]);
for (const [name, data] of cases) {
  const z = ZPL.zlibDeflate(data);
  let back = null; try { back = zlib.inflateSync(Buffer.from(z)); } catch (e) { back = e.message; }
  check(`${name}：zlib 解压后逐字节一致`, Buffer.isBuffer(back) && back.equals(Buffer.from(data)), typeof back === 'string' ? back : back.length + ' vs ' + data.length);
  const s = ZPL.z64(data), m = s.match(/^:Z64:([A-Za-z0-9+/=]*):([0-9a-f]{4})$/);
  check(`${name}：Z64 格式与 CRC 正确`, m && m[2] === crcRef(m[1]) && Buffer.from(m[1], 'base64').equals(Buffer.from(z)));
}
check('Code128 位图压缩到 1/10 以下', ZPL.zlibDeflate(bars.data).length < bars.data.length / 10, ZPL.zlibDeflate(bars.data).length + ' / ' + bars.data.length);
done();
