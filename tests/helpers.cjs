/* 测试公共工具：计数断言 + zxing-cpp（zxing-wasm，离线加载本地 wasm）解码器。 */
const fs = require('fs');
const path = require('path');

function suite(name) {
  let pass = 0, fail = 0;
  const check = (label, cond, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', label, extra === undefined ? '' : extra); } };
  const eq = (label, got, want) => check(label, got === want, '得到 ' + JSON.stringify(got) + '，应为 ' + JSON.stringify(want));
  const throws = (label, fn, includes) => {
    try { fn(); check(label, false, '没有抛错'); }
    catch (e) { check(label, !includes || String(e.message).includes(includes), e.message); }
  };
  const done = () => { console.log(`${name}：通过 ${pass} / 失败 ${fail}`); process.exit(fail ? 1 : 0); };
  return { check, eq, throws, done };
}

let zx = null;
async function zxing() {
  if (zx) return zx;
  const Z = require('zxing-wasm/reader');
  const wasm = path.join(path.dirname(require.resolve('zxing-wasm/reader')), '..', '..', 'reader', 'zxing_reader.wasm');
  await Z.prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(wasm) }, fireImmediately: true });
  zx = Z;
  return Z;
}
// 1-bit 位图（{w,h,get(x,y)}）加白边、放大 → RGBA → 解码，返回 [{format,text}]
async function decodeBits(w, h, get, { quiet = 12, scale = 3, formats, textMode = 'Plain' } = {}) {
  const Z = await zxing();
  const W = (w + quiet * 2) * scale, H = (h + quiet * 2) * scale, d = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (get(x, y))
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + quiet) * scale + dy) * W + (x + quiet) * scale + dx) * 4; d[i] = d[i + 1] = d[i + 2] = 0;
    }
  const r = await Z.readBarcodes({ data: d, width: W, height: H, colorSpace: 'srgb' },
    { formats: formats || [], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 8, textMode });
  return r.filter(x => x.isValid).map(x => ({ format: x.format, text: x.text }));
}

// 最小 zip 写入器（deflate 压缩），只用于生成测试数据
function makeZip(files) {
  const zlib = require('zlib');
  const local = [], central = []; let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const nm = Buffer.from(name), raw = Buffer.from(text), data = zlib.deflateRawSync(raw), crc = zlib.crc32(raw);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26);
    local.push(h, nm, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 8); e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...local, cd, e]);
}

module.exports = { suite, zxing, decodeBits, makeZip };
