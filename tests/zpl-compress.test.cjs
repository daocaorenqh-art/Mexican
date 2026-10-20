/* ZPL 位图压缩（ACS）往返校验：从 index.html 取出实际发布的 acsEncode，
   用独立写的解码器按 ZPL 手册规则还原，必须与原始十六进制逐字一致。运行：npm test */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('function acsRun(n){');
const b = html.indexOf("// Z64：", a);
if (a < 0 || b < 0) throw new Error('index.html 中找不到 acsEncode');
const acsEncode = new Function(html.slice(a, b) + '\nreturn acsEncode;')();

// 独立解码器（按 ZPL II 手册的 Alternative Data Compression Scheme）
function acsDecode(s, bpr) {
  const L = bpr * 2, rows = [];
  let row = '', count = 0;
  const flush = () => { rows.push(row); row = ''; };
  for (const ch of s) {
    if (ch >= 'G' && ch <= 'Y') { count += ch.charCodeAt(0) - 70; continue; }        // G=1 … Y=19
    if (ch >= 'g' && ch <= 'z') { count += (ch.charCodeAt(0) - 102) * 20; continue; } // g=20 … z=400
    if (ch === ',') { row = row.padEnd(L, '0'); flush(); continue; }
    if (ch === '!') { row = row.padEnd(L, 'F'); flush(); continue; }
    if (ch === ':') { if (!rows.length) throw new Error('首行不能是 :'); rows.push(rows[rows.length - 1]); continue; }
    if (!/[0-9A-F]/.test(ch)) throw new Error('非法字符 ' + ch);
    row += ch.repeat(count || 1); count = 0;
    while (row.length >= L) { rows.push(row.slice(0, L)); row = row.slice(L); }
  }
  if (row.length) throw new Error('数据不足一整行');
  return rows.join('');
}

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra || ''); } };
const rt = (name, hex, bpr) => {
  let dec, enc; try { enc = acsEncode(hex, bpr); dec = acsDecode(enc, bpr); } catch (e) { dec = 'ERR ' + e.message; }
  check(name, dec === hex, dec === hex ? '' : `bpr=${bpr} enc=${String(enc).slice(0, 60)}`);
  // 「!」的含义各实现不一（填 F 还是填十六进制 1），编码器不得输出
  check(name + '（不含 !）', !String(enc).includes('!'), String(enc).slice(0, 60));
  return enc;
};

rt('整行全黑（行尾全 F）', 'F'.repeat(60) + 'F'.repeat(60), 30);
rt('行尾全 F', '00' + 'F'.repeat(58), 30);
check('计数字母：1→G 19→Y 20→g 400→z 419→zY 1000→zzp', ['G','Y','g','z','zY','zzp'].every((v, i) => {
  const s = new Function(html.slice(a, html.indexOf('function acsEncode', a)) + '\nreturn acsRun;')()([1,19,20,400,419,1000][i]); return s === v; }));
rt('全白行', '00'.repeat(30), 30);
rt('全黑行', 'FF'.repeat(30), 30);
rt('行尾全白', 'A5' + '00'.repeat(29), 30);
rt('行尾全黑', '3C' + 'FF'.repeat(29), 30);
rt('只有 1 个尾零（不应用逗号）', 'ABCDE0', 3);
rt('重复行', ('12AB' + '00'.repeat(10)).repeat(5), 12);
rt('首行即重复内容不能用冒号', '0F0F'.repeat(3), 2);
rt('超长游程 >400、>800 跨多行', ('0'.repeat(500) + 'F'.repeat(900) + '7'.repeat(1201) + '1').padEnd(2700, '0'), 270);
rt('游程恰好 2 个（不压缩）与 3 个（压缩）', 'AA1BBB2C', 4);
// 随机位图：疏、中、密三种墨量
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
for (const density of [0.03, 0.3, 0.8]) for (let t = 0; t < 40; t++) {
  const bpr = 1 + Math.floor(rnd() * 60), rows = 1 + Math.floor(rnd() * 40); let hex = '';
  for (let r = 0; r < rows; r++) {
    if (r && rnd() < 0.2) { hex += hex.slice(-bpr * 2); continue; }       // 偶尔重复上一行
    for (let k = 0; k < bpr; k++) { let v = 0; for (let bit = 0; bit < 8; bit++) if (rnd() < density) v |= 1 << bit;
      hex += (v < 16 ? '0' : '') + v.toString(16).toUpperCase(); }
  }
  rt(`随机位图 墨量${density}`, hex, bpr);
}
const textLike = ('00'.repeat(40) + ('0'.repeat(20) + '7FFE' + '0'.repeat(56)).slice(0, 80) + '00'.repeat(40)).repeat(30);
const enc = rt('文字型位图', textLike, 40);
check('文字型位图压缩率 > 5 倍', textLike.length / enc.length > 5, (textLike.length / enc.length).toFixed(1) + ' 倍');

// Z64 的 CRC：取出发布的 crc16x，对照标准校验值与 zpl-image（生产库）的表驱动实现
const c0 = html.indexOf('function crc16x(s){');
const crc16x = new Function(html.slice(c0, html.indexOf('\n', html.indexOf('return c.toString(16)', c0)) + 1) + '\nreturn crc16x;')();
check('CRC-16/XMODEM 标准校验值 "123456789" → 31c3', crc16x('123456789') === '31c3', crc16x('123456789'));
const table = []; for (let i = 0; i < 256; i++) { let c = i << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff; table.push(c); }
check('表首几项与 zpl-image 一致（0000,1021,2042,3063）', table.slice(0, 4).join() === [0x0000, 0x1021, 0x2042, 0x3063].join());
const tableCrc = (str) => { let c = 0; for (let i = 0; i < str.length; i++) { const j = (str.charCodeAt(i) ^ (c >> 8)) & 0xff; c = table[j] ^ (c << 8); }
  return (c & 0xffff).toString(16).padStart(4, '0'); };
let crcOk = true;
for (let t = 0; t < 300; t++) { let str = ''; const n = Math.floor(rnd() * 200);
  for (let i = 0; i < n; i++) str += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='[Math.floor(rnd() * 65)];
  if (crc16x(str) !== tableCrc(str)) { crcOk = false; console.log('    mismatch', str); break; } }
check('300 个随机 base64 串：与 zpl-image 表驱动算法结果一致', crcOk);

console.log(`ZPL 压缩往返校验：通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
