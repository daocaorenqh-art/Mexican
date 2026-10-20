/* ZPL 直发打印机：用本地 TCP 服务模拟斑马机 9100 端口，校验收到的字节与发送内容逐字节一致。
   运行：npm test */
const net = require('net');
const path = require('path');
const { sendRaw, printerStatus, parseHS } = require(path.join(__dirname, '..', 'src', 'rawprint.js'));

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

  // 按打印机名 RAW 直发（Windows 后台打印）：Windows 上验证内联 C# 能编译运行（不存在的打印机 → 找不到）
  check('按打印机名直发：空名称被拒绝', await rejects(() => sendRaw({ kind: 'spool', name: '' }, zpl), '打印机名无效'));
  check('按打印机名直发：控制字符被拒绝', await rejects(() => sendRaw({ kind: 'spool', name: 'a\nb' }, zpl), '打印机名无效'));
  check('按打印机名直发：不存在的打印机明确报错', await rejects(() => sendRaw({ kind: 'spool', name: 'NoSuchPrinter_xyz "&calc' }, zpl),
    process.platform === 'win32' ? '找不到打印机' : '仅支持 Windows'));

  // 串口参数白名单
  const { serialMode } = require(path.join(__dirname, '..', 'src', 'rawprint.js'));
  check('串口参数生成 mode 参数', JSON.stringify(serialMode({ baud: 9600, parity: 'N', dataBits: 8, stopBits: 1 })) === '["BAUD=9600","PARITY=n","DATA=8","STOP=1"]');
  check('未设波特率时不改串口设置', serialMode({}) === null);
  check('非法波特率被拦截', await rejects(() => sendRaw({ kind: 'com', port: 'COM1', baud: '9600 & calc' }, zpl), '波特率'));
  check('非法校验位被拦截', await rejects(() => sendRaw({ kind: 'com', port: 'COM1', baud: 9600, parity: 'x' }, zpl), '校验位'));

  // 打印机收下连接后复位断开：不能报「已发送」
  const resetter = await new Promise((resolve) => {
    const server = net.createServer((s) => { s.once('data', () => { if (s.resetAndDestroy) s.resetAndDestroy(); else s.destroy(); }); s.on('error', () => {}); });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
  check('打印机中途复位断开 → 报错（不误报已发送）', await rejects(() => sendRaw({ kind: 'tcp', host: '127.0.0.1', port: resetter.port }, big), '断开'));
  resetter.close();

  // 二进制（TSPL 位图）原样送达
  const bin = new Uint8Array([0x42, 0x49, 0x54, 0x00, 0xFF, 0x0A, 0x80, 0xE4, 0xB8]);
  m = await mockPrinter(false);
  await sendRaw({ kind: 'tcp', host: '127.0.0.1', port: m.port }, bin);
  got = await m.received; m.close();
  check('二进制数据逐字节一致（不按 UTF-8 转换）', got.equals(Buffer.from(bin)));

  // 打印机状态：模拟斑马机回应 ~HS / ~HI，模拟 TSC 回应 ESC !?
  const STX = '\x02', ETX = '\x03\r\n';
  const statusPrinter = (respond) => new Promise((resolve) => {
    const server = net.createServer((s) => { s.on('data', (d) => { const r = respond(d); if (r != null) s.write(r); }); s.on('error', () => {}); });
    server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
  });
  const hs = (paper, pause, head, ribbon) => STX + `030,${paper},${pause},1245,000,0,0,0,000,0,0,0` + ETX
    + STX + `001,0,${head},${ribbon},1,2,6,0,00000005,1,000` + ETX + STX + '1234,0' + ETX;
  let sp = await statusPrinter((d) => d.toString().includes('~HS') ? hs(0, 0, 0, 0) : d.toString().includes('~HI') ? STX + 'ZT410-300dpi,V75.20.01Z,12,8192KB' + ETX : null);
  let st = await printerStatus({ kind: 'tcp', host: '127.0.0.1', port: sp.port }, 'zpl'); sp.close();
  check('斑马机就绪 + 读出 300dpi 与型号', st.ready && st.dpi === 300 && st.model === 'ZT410-300dpi' && st.labelsRemaining === 5, JSON.stringify(st));
  sp = await statusPrinter((d) => d.toString().includes('~HS') ? hs(1, 1, 1, 1) : null);
  st = await printerStatus({ kind: 'tcp', host: '127.0.0.1', port: sp.port }, 'zpl'); sp.close();
  check('缺纸 / 暂停 / 开盖 / 缺碳带都识别（~HI 无回应不影响）', !st.ready && ['缺纸', '暂停中', '打印头抬起', '缺碳带'].every((p) => st.problems.includes(p)), JSON.stringify(st.problems));
  sp = await statusPrinter((d) => (d[0] === 0x1B && d[1] === 0x21 && d[2] === 0x3F) ? Buffer.from([0x04 | 0x10]) : null);
  st = await printerStatus({ kind: 'tcp', host: '127.0.0.1', port: sp.port }, 'tspl'); sp.close();
  check('TSPL 状态字节：缺纸 + 暂停', st.paperOut && st.paused && !st.headUp && !st.ready, JSON.stringify(st));
  sp = await statusPrinter(() => Buffer.from([0x00]));
  st = await printerStatus({ kind: 'tcp', host: '127.0.0.1', port: sp.port }, 'tspl'); sp.close();
  check('TSPL 就绪', st.ready);
  sp = await statusPrinter(() => null);
  check('打印机不回应状态 → 明确报错', await rejects(() => printerStatus({ kind: 'tcp', host: '127.0.0.1', port: sp.port }, 'zpl'), '没有回应')); sp.close();
  check('共享打印机不支持读状态', await rejects(() => printerStatus({ kind: 'share', name: 'ZT410' }), '只有网络打印机'));
  check('状态格式错误被识别', (() => { try { parseHS(Buffer.from('xx')); return false; } catch (e) { return true; } })());

  console.log(`ZPL 直发校验：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
