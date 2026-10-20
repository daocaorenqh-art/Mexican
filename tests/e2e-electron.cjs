/* 桌面版端到端测试：启动 Electron，连本机模拟的网络标签机（9100 端口），走真实的「指令直发」流程：
   读打印机状态 → DPI 不符提示 → 分批发送 → 打印机收到的数据可解析；ZPL 和 TSPL 各一遍。
   需要 Playwright + 已下载的 Electron（npm install 时自动下载），Linux 无桌面时用 xvfb-run 运行：
     xvfb-run -a node tests/e2e-electron.cjs
   缺少依赖时跳过。 */
const path = require('path');
const fs = require('fs');
const net = require('net');
const { execSync } = require('child_process');
const { suite } = require('./helpers.cjs');
const ZPL = require(path.join(__dirname, '..', 'src', 'zpl.js'));

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return null;
}
const ROOT = path.join(__dirname, '..');
const pw = loadPlaywright();
let electronBin = null; try { electronBin = require('electron'); } catch (e) {}
if (!pw || !electronBin || !fs.existsSync(electronBin)) { console.log('桌面版端到端测试：缺少 Playwright 或 Electron，跳过'); process.exit(0); }
const { check, eq, done } = suite('桌面版端到端测试');

// 模拟标签机：记录收到的数据；~HS/~HI 与 ESC !? 按设定回应
function mockPrinter(dpmm) {
  const jobs = [];
  const server = net.createServer((s) => {
    const chunks = [];
    s.on('data', (d) => {
      const t = d.toString('latin1');
      if (t.startsWith('~HS')) { s.write('\x02030,0,0,1245,000,0,0,0,000,0,0,0\x03\r\n\x02001,0,0,0,1,2,6,0,00000000,1,000\x03\r\n\x021234,0\x03\r\n'); return; }
      if (t.startsWith('~HI')) { s.write('\x02ZT410,V75,' + dpmm + ',8192KB\x03\r\n'); return; }
      if (d[0] === 0x1B && d[1] === 0x21 && d[2] === 0x3F) { s.write(Buffer.from([0])); return; }
      chunks.push(d);
    });
    s.on('end', () => { if (chunks.length) jobs.push(Buffer.concat(chunks)); s.end(); });
    s.on('error', () => {});
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, jobs, close: () => server.close() })));
}

(async () => {
  const printer = await mockPrinter(12); // 300 dpi
  const app = await pw._electron.launch({ executablePath: electronBin, args: ['--no-sandbox', ROOT], cwd: ROOT });
  const w = await app.firstWindow();
  const errors = []; w.on('pageerror', (e) => errors.push(e.message));
  await w.waitForLoadState('domcontentloaded');
  await w.evaluate(() => localStorage.clear()); await w.reload(); await w.waitForTimeout(500);
  check('桌面版接口可用、页面拿不到 Node', await w.evaluate(() => !!window.labelPrinter && typeof window.require === 'undefined'));
  const dialogs = [];
  w.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

  // 5 条数据 × 1 份，每批 2 张 → 3 批
  await w.evaluate((port) => {
    elements = [{ type: 'text', x: 3, y: 3, size: 3, content: '{SKU}' }, { type: 'barcode', x: 8, y: 10, h: 8, module: 0.25, showText: false, content: '{SKU}' }];
    $('#csv').value = 'SKU\nA1\nA2\nA3\nA4\nA5'; $('#applyCsv').click();
    $('#rawKind').value = 'tcp'; $('#rawKind').onchange(); $('#rawAddr').value = '127.0.0.1'; $('#rawPort').value = String(port);
    $('#zBatch').value = '2'; render();
  }, printer.port);
  await w.evaluate(() => { doSendZPL(); });
  await w.waitForFunction(() => /已发送 5 张/.test(document.querySelector('#prnMsg').textContent), null, { timeout: 20000 });
  check('DPI 不符时提示（设计 203，打印机 300）', dialogs.some((m) => m.includes('300 dpi')), JSON.stringify(dialogs));
  eq('分 3 批发送', printer.jobs.length, 3);
  const zpl = printer.jobs.map((b) => b.toString('utf8')).join('');
  eq('打印机共收到 5 张 ZPL', (zpl.match(/\^XA/g) || []).length, 5);
  check('ZPL 含文字位图', /\^GFA,/.test(zpl));

  // TSPL
  printer.jobs.length = 0; dialogs.length = 0;
  await w.evaluate(() => { $('#zLang').value = 'tspl'; $('#zBatch').value = '10'; $('#dpi').value = '300'; render(); doSendZPL(); });
  await w.waitForFunction(() => /已发送 5 张/.test(document.querySelector('#prnMsg').textContent), null, { timeout: 20000 });
  eq('TSPL 一批发完', printer.jobs.length, 1);
  const labs = ZPL.parseTSPL(new Uint8Array(printer.jobs[0]));
  eq('打印机收到 5 张 TSPL', labs.length, 5);
  // 文字是位图；一维码 / 线条能用 BAR 矩形精确画出时用 BAR（体积小）
  check('TSPL 每张含位图（文字）与条码（BAR 或位图）', labs.every((l) => l.bitmaps.length >= 1 && l.bitmaps.length + l.bars.length >= 2), JSON.stringify(labs.map((l) => [l.bitmaps.length, l.bars.length])));
  check('DPI 一致时不提示', !dialogs.some((m) => m.includes('dpi')));

  // 检测打印机
  await w.evaluate(() => doPrinterStatus());
  await w.waitForFunction(() => /就绪/.test(document.querySelector('#prnMsg').textContent), null, { timeout: 10000 });
  check('检测打印机：就绪', true);
  check('页面无脚本错误', errors.length === 0, JSON.stringify(errors));
  await app.close(); printer.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
