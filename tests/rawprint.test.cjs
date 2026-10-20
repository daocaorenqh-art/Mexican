/* ZPL 直发打印机：用本地 TCP 服务模拟斑马机 9100 端口，校验收到的字节与发送内容逐字节一致。
   运行：npm test */
const net = require('net');
const path = require('path');
const { sendRaw } = require(path.join(__dirname, '..', 'src', 'rawprint.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra || ''); } };

// 模拟打印机：收集一次连接的全部字节；keepOpen=true 时不主动断开（部分打印机如此）
function mockPrinter(keepOpen) {
  return new Promise((resolve) => {
    let onData;
    const received = new Promise((r) => { onData = r; });
    const server = net.createServer((s) => {
      const chunks = [];
      s.on('data', (c) => chunks.push(c));
      s.on('end', () => { onData(Buffer.concat(chunks)); if (!keepOpen) s.end(); });
      s.on('error', () => {});
    });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, received, close: () => server.close() }));
  });
}
async function rejects(promiseFn, includes) {
  try { await promiseFn(); return false; } catch (e) { return !includes || String(e.message).includes(includes); }
}

(async () => {
  const zpl = '^XA\n^CI28\n^PW480\n^FO40,40^BQN,2,4^FDMA,合格证 FZ075885L-01110^FS\n^XZ\n';
  let m = await mockPrinter(false);
  await sendRaw({ kind: 'tcp', host: '127.0.0.1', port: m.port }, zpl);
  let got = await m.received; m.close();
  check('TCP 9100：收到内容与 ZPL（含中文 UTF-8）逐字节一致', got.equals(Buffer.from(zpl, 'utf8')));

  const big = '^XA^FO0,0^GFA,' + 'F0'.repeat(1024 * 1024) + '^FS^XZ';
  m = await mockPrinter(false);
  await sendRaw({ kind: 'tcp', host: '127.0.0.1', port: m.port }, big);
  got = await m.received; m.close();
  check('TCP：2MB 大位图完整送达', got.length === Buffer.byteLength(big) && got.equals(Buffer.from(big)));

  m = await mockPrinter(true);
  const t0 = Date.now();
  await sendRaw({ kind: 'tcp', host: '127.0.0.1', port: m.port }, zpl);
  got = await m.received; m.close();
  check('打印机不主动断开也能及时完成', got.equals(Buffer.from(zpl, 'utf8')) && Date.now() - t0 < 3000, (Date.now() - t0) + 'ms');

  const dead = await mockPrinter(false); const deadPort = dead.port; dead.close();
  await new Promise((r) => setTimeout(r, 50));
  check('打印机没开机/连不上 → 明确报错', await rejects(() => sendRaw({ kind: 'tcp', host: '127.0.0.1', port: deadPort }, zpl), '无法连接打印机'));

  check('地址注入被拦截', await rejects(() => sendRaw({ kind: 'tcp', host: '1.2.3.4;calc', port: 9100 }, zpl), '地址无效'));
  check('端口非法被拦截', await rejects(() => sendRaw({ kind: 'tcp', host: '127.0.0.1', port: 70000 }, zpl), '端口无效'));
  check('共享名注入被拦截（&）', await rejects(() => sendRaw({ kind: 'share', name: 'Zebra&calc' }, zpl), '共享打印机名'));
  check('共享名注入被拦截（"）', await rejects(() => sendRaw({ kind: 'share', name: 'Zebra" & del' }, zpl), '共享打印机名'));
  check('串口注入被拦截', await rejects(() => sendRaw({ kind: 'com', port: 'COM1 & calc' }, zpl), '串口格式'));
  check('非串口设备名被拦截（LPT1）', await rejects(() => sendRaw({ kind: 'com', port: 'LPT1' }, zpl), '串口格式'));
  check('空内容被拒绝', await rejects(() => sendRaw({ kind: 'tcp', host: '127.0.0.1', port: 9100 }, ''), '没有可发送'));
  check('未知方式被拒绝', await rejects(() => sendRaw({ kind: 'ftp' }, zpl), '未知的发送方式'));
  const shareFails = await rejects(() => sendRaw({ kind: 'share', name: 'NoSuchPrinter_xyz' }, zpl),
    process.platform === 'win32' ? '发送失败' : '仅支持 Windows');
  check('共享打印机：不存在时报错（非 Windows 明确提示仅支持 Windows）', shareFails);

  console.log(`ZPL 直发校验：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
