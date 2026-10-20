// 交付验收：桌面版（Electron）生产场景——真实 SQLite 数据库、连模拟网络标签机直发、断点续打不重号、打印机状态。
// Linux 无桌面时：xvfb-run -a node tests/acceptance/desktop.mjs
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import pw from 'playwright';
import { ROOT, OUT, recorder, renderZPL, zplLabelCount, scanPNG } from './_app.mjs';

const require = createRequire(import.meta.url);
const rec = recorder('desktop');
let electronBin = null; try { electronBin = require('electron'); } catch (e) {}
if (!electronBin || !fs.existsSync(electronBin)) {
  rec.gap('H-env', '桌面版验收环境', '没有 Electron 本体（npm install 时下载）'); rec.save(); process.exit(1);
}
// SQLite 驱动要按 Electron 版本编译
if (!fs.existsSync(path.join(ROOT, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'))) {
  try { execFileSync('npx', ['electron-builder', 'install-app-deps'], { cwd: ROOT, stdio: 'pipe', timeout: 600000 }); } catch (e) {}
}

// 模拟网络标签机：记录每次连接收到的数据；可设为拒绝连接；回应 ~HS / ~HI
function printer(dpmm = 8) {
  const s = { jobs: [], refuse: false };
  s.server = net.createServer((c) => {
    if (s.refuse) { c.destroy(); return; }
    const chunks = [];
    c.on('data', (d) => { const t = d.toString('latin1');
      if (t.startsWith('~HS')) { c.write('\x02030,0,0,1245,000,0,0,0,000,0,0,0\x03\r\n\x02001,0,0,0,1,2,6,0,00000000,1,000\x03\r\n\x021234,0\x03\r\n'); return; }
      if (t.startsWith('~HI')) { c.write('\x02ZT410,V75,' + dpmm + ',8192KB\x03\r\n'); return; }
      chunks.push(d); });
    c.on('end', () => { if (chunks.length) s.jobs.push(Buffer.concat(chunks)); c.end(); });
    c.on('error', () => {});
  });
  return new Promise((r) => s.server.listen(0, '127.0.0.1', () => { s.port = s.server.address().port; r(s); }));
}

const app = await pw._electron.launch({ executablePath: electronBin, args: ['--no-sandbox', ROOT], cwd: ROOT });
const w = await app.firstWindow();
const errors = []; w.on('pageerror', (e) => errors.push(e.message));
w.on('dialog', async (d) => { await d.accept(); });
await w.waitForLoadState('domcontentloaded');
await w.evaluate(() => localStorage.clear()); await w.reload(); await w.waitForSelector('#preview .label');

/* ---------- H1 安全基线 ---------- */
rec.check('H-sandbox', '页面拿不到 Node（沙箱 + 上下文隔离）', await w.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined'));
rec.check('H-api', '桌面版接口可用（数据库 / 打印机）', await w.evaluate(() => !!window.labelDB && !!window.labelPrinter));
const before = w.url(); await w.evaluate(() => { location.href = 'file:///etc/hostname'; }); await w.waitForTimeout(400);
rec.check('H-nav', '页面不能被导航走（拖文件进窗口不丢设计）', w.url() === before, w.url());

/* ---------- H2 真实 SQLite ---------- */
const db = path.join(OUT, 'acc.db');
try { fs.unlinkSync(db); } catch (e) {}
execFileSync('python3', ['-c', `import sqlite3;c=sqlite3.connect(${JSON.stringify(db)});c.execute('create table 商品(品名 text,SKU text,生产日期 date,价格 real)');
c.executemany('insert into 商品 values(?,?,?,?)',[('女包','A1','2026-10-20',558.0),('男鞋','A2','2026-10-21',398.5)]);c.commit()`]);
await w.evaluate((file) => { const s = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  elements = [{ type: 'text', x: 2, y: 2, size: 3, content: '{品名}/{生产日期}/{价格}', rot: 0 }]; render();
  s('dbType', 'sqlite'); s('dbPath', file); s('dbSql', 'SELECT * FROM 商品'); document.getElementById('dbRun').click(); }, db);
await w.waitForFunction(() => /已取|行/.test(document.getElementById('dbMsg').textContent) || /失败/.test(document.getElementById('dbMsg').textContent), null, { timeout: 15000 }).catch(() => {});
const msg = await w.evaluate(() => document.getElementById('dbMsg').textContent);
const txt = await w.evaluate(() => [...document.querySelectorAll('#preview .label')].map((l) => l.innerText).join(' | '));
rec.check('H-sqlite', '真实 SQLite 取数套打（中文表名字段名、日期不差一天）', txt.includes('女包/2026-10-20/558') && txt.includes('男鞋/2026-10-21/398.5'), msg + ' ｜ ' + txt);
await w.evaluate((file) => { document.getElementById('dbSql').value = 'DELETE FROM 商品'; document.getElementById('dbRun').click(); }, db);
await w.waitForTimeout(800);
const msg2 = await w.evaluate(() => document.getElementById('dbMsg').textContent);
rec.check('H-readonly', '套打查询只读（DELETE 被拒绝）', /只允许|失败/.test(msg2), msg2);

/* ---------- H3 网络直发 + 断点续打 ---------- */
const P = await printer(8);
await w.evaluate((port) => { const s = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('change')); e.dispatchEvent(new Event('input')); };
  elements = [{ type: 'counter', name: 'SN', x: 2, y: 2, size: 3, start: 1, step: 1, pad: 4, rot: 0 },
    { type: 'barcode', x: 8, y: 8, h: 10, module: 0.25, showText: false, rot: 0, content: 'SN{#SN}' }];
  document.getElementById('csv').value = 'X\n1\n2\n3\n4\n5'; document.getElementById('applyCsv').click();
  s('rawKind', 'tcp'); s('rawAddr', '127.0.0.1'); s('rawPort', String(port)); s('zBatch', '2'); render(); }, P.port);
await w.evaluate(() => { document.getElementById('rawSend').click(); });
await w.waitForFunction(() => /已发送|失败|错误/.test(document.getElementById('prnMsg').textContent), null, { timeout: 20000 }).catch(() => {});
await w.waitForTimeout(800);
const zAll = P.jobs.map((b) => b.toString('utf8')).join('');
const n1 = zplLabelCount(zAll);
rec.check('H-send', '直发到网络标签机：5 张全部送达', n1 === 5, n1 + ' 张；' + await w.evaluate(() => document.getElementById('prnMsg').textContent));
const sns = [];
for (const f of (zAll ? renderZPL(zAll, 50, 30, 203) : [])) sns.push(...(await scanPNG(f)).map((g) => g.text));
if (sns.length && sns.every((s) => s.startsWith('SN0'))) rec.check('H-send-serial', '直发的 5 张流水号 SN0001–SN0005', sns.join(',') === 'SN0001,SN0002,SN0003,SN0004,SN0005', sns.join(','));
else rec.gap('H-send-serial', '直发的流水号可在条码里扫出', '条码里的 {#SN} 未替换：' + sns.slice(0, 2).join(','));

// 断点续打：第 2 批起打印机拒绝连接 → 失败 → 恢复 → 续打剩余，每张恰好一次
const hasResume = await w.evaluate(() => !!document.getElementById('rawResume'));
if (!hasResume) rec.gap('H-resume', '发送失败后续打剩余，每张恰好一次', '界面没有「续打剩余」');
else {
  P.jobs.length = 0;
  let conn = 0; const orig = P.server.listeners('connection')[0];
  P.server.removeAllListeners('connection'); P.server.on('connection', (c) => { conn++; if (conn >= 2) { c.destroy(); return; } orig(c); });
  await w.evaluate(() => document.getElementById('rawSend').click());
  await w.waitForFunction(() => /失败/.test(document.getElementById('prnMsg').textContent), null, { timeout: 20000 }).catch(() => {});
  const failMsg = await w.evaluate(() => document.getElementById('prnMsg').textContent);
  P.server.removeAllListeners('connection'); P.server.on('connection', orig);
  await w.evaluate(() => document.getElementById('rawResume').click());
  await w.waitForFunction(() => /已发送/.test(document.getElementById('prnMsg').textContent), null, { timeout: 20000 }).catch(() => {});
  await w.waitForTimeout(800);
  const z2 = P.jobs.map((b) => b.toString('utf8')).join(''), got = [];
  for (const f of renderZPL(z2, 50, 30, 203)) got.push(...(await scanPNG(f)).map((g) => g.text));
  rec.check('H-resume', '中途失败后续打：5 张恰好各一次', zplLabelCount(z2) === 5 && new Set(got).size === got.length, `失败提示：${failMsg}；收到 ${zplLabelCount(z2)} 张：${got.join(',')}`);
}

// 打印机状态与 DPI 不符
const hasStatus = await w.evaluate(() => !!document.getElementById('prnStatus'));
if (!hasStatus) rec.gap('H-status', '检测打印机状态 / 分辨率', '界面没有「检测打印机」');
else {
  const P2 = await printer(12);
  await w.evaluate((port) => { document.getElementById('rawPort').value = String(port); document.getElementById('prnStatus').click(); }, P2.port);
  await w.waitForFunction(() => /dpi|就绪|状态/.test(document.getElementById('prnMsg').textContent), null, { timeout: 10000 }).catch(() => {});
  const m = await w.evaluate(() => document.getElementById('prnMsg').textContent);
  rec.check('H-status', '检测打印机：读出 300 dpi 并提示与设计不符', /300/.test(m) && /不符/.test(m), m);
  P2.server.close();
}

rec.check('H-noerror', '桌面版全程无脚本错误', errors.length === 0, errors.join('; '));
P.server.close();
await app.close();
rec.save();
const bad = rec.items.filter((i) => i.status !== 'pass');
console.log(`\n==== 桌面版验收：达标 ${rec.items.length - bad.length} / ${rec.items.length}（不达标 ${bad.filter((i) => i.status === 'fail').length}，缺口 ${bad.filter((i) => i.status === 'gap').length}） ====`);
process.exit(bad.length ? 1 : 0);
