'use strict';
/* 启动自检：`标签打印工具.exe --smoke-test [--smoke-out=结果.json]`
   打包后在 CI 里真机启动一次，确认窗口、预加载接口、ZPL 引擎、网络直发和数据库驱动都能用，然后按结果退出（0=全部通过）。
   不连任何真实数据库/打印机：SQLite 用临时文件，网络直发用本机临时端口。 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const datasource = require('./datasource');
const rawprint = require('./rawprint');

async function run(win, pageErrors) {
  const results = [];
  const check = async (name, fn) => {
    try { results.push({ name, ok: true, detail: String(await fn()) }); }
    catch (e) { results.push({ name, ok: false, detail: String(e && e.message || e) }); }
  };
  const js = (code) => win.webContents.executeJavaScript(code);

  await check('窗口加载', async () => {
    const n = await js("document.querySelectorAll('#preview .label').length");
    if (!n) throw new Error('预览区没有标签');
    return n + ' 张预览';
  });
  await check('预加载接口', async () => {
    const t = await js('[typeof window.labelDB, typeof window.labelPrinter, typeof window.labelSecret, typeof window.labelFile].join()');
    if (t !== 'object,object,object,object') throw new Error(t);
    return t;
  });
  let zpl = '';
  await check('ZPL 引擎（Z64）', async () => {
    zpl = await js("(async () => { document.querySelector('#zplComp').value = 'z64'; return buildZPL(); })()");
    if (!/\^XA[\s\S]*\^XZ/.test(zpl) || !/:Z64:/.test(zpl)) throw new Error('输出不完整');
    return zpl.length + ' 字节';
  });
  await check('ZPL 网络直发', () => new Promise((resolve, reject) => {
    let got = Buffer.alloc(0);
    const srv = net.createServer((s) => {
      s.on('data', (d) => { got = Buffer.concat([got, d]); });
      s.on('end', () => {
        srv.close();
        got.toString('utf8') === zpl ? resolve(got.length + ' 字节到达') : reject(new Error('收到的数据与发送不一致'));
      });
    });
    srv.listen(0, '127.0.0.1', () => {
      rawprint.sendRaw({ kind: 'tcp', host: '127.0.0.1', port: srv.address().port }, zpl).catch((e) => { srv.close(); reject(e); });
    });
  }));
  await check('SQLite 驱动', async () => {
    const file = path.join(os.tmpdir(), 'labelprint-smoke-' + process.pid + '.db');
    const Database = require('better-sqlite3');
    const db = new Database(file);
    db.exec("CREATE TABLE t(a TEXT); INSERT INTO t VALUES('合格证')");
    db.close();
    try {
      const rows = await datasource.query({ type: 'sqlite', file }, 'SELECT a FROM t');
      if (!rows.length || rows[0].a !== '合格证') throw new Error(JSON.stringify(rows));
      // 再从页面经 IPC 查一次：验证预加载接口、主进程来源校验、只读查询限制整条链路
      const r = await js('window.labelDB.query(' + JSON.stringify({ type: 'sqlite', file }) + ', "SELECT a FROM t")');
      if (!r.ok || !r.rows.length || r.rows[0].a !== '合格证') throw new Error('IPC 查询失败：' + JSON.stringify(r));
      const w = await js('window.labelDB.query(' + JSON.stringify({ type: 'sqlite', file }) + ', "DELETE FROM t")');
      if (w.ok) throw new Error('非 SELECT 语句没有被拦截');
      return '读写正常，页面经 IPC 查询正常，非 SELECT 已拦截';
    } finally { fs.rmSync(file, { force: true }); }
  });
  for (const m of ['mysql2/promise', 'pg', 'mssql']) await check(m + ' 驱动', () => { require(m); return '已加载'; });
  // odbc 依赖系统的 ODBC 管理器，Windows 自带；其它平台未必有，只在 Windows 上要求
  if (process.platform === 'win32') await check('odbc 驱动', () => { require('odbc'); return '已加载'; });
  await check('设计文件保存 / 打开', async () => {
    // 只能读写用户选过的文件：先把临时文件放进最近列表（相当于用户选过），结束后恢复原列表
    const { app } = require('electron');
    const listFile = path.join(app.getPath('userData'), 'recent-files.json');
    const before = fs.existsSync(listFile) ? fs.readFileSync(listFile) : null;
    const file = path.join(os.tmpdir(), 'labelprint-smoke-' + process.pid + '.json');
    try {
      fs.mkdirSync(path.dirname(listFile), { recursive: true });
      fs.writeFileSync(listFile, JSON.stringify([file]));
      const text = await js('designJSON()');
      const saved = await js('window.labelFile.save(' + JSON.stringify({ path: file, text }) + ')');
      if (!saved || saved.path !== file || fs.readFileSync(file, 'utf8') !== text) throw new Error('保存结果不一致');
      const opened = await js('window.labelFile.open(' + JSON.stringify(file) + ')');
      if (!opened || opened.text !== text) throw new Error('打开结果不一致');
      const recent = await js('window.labelFile.recent()');
      if (!recent.includes(file)) throw new Error('最近文件里没有：' + JSON.stringify(recent));
      const refused = await js('window.labelFile.open(' + JSON.stringify(path.join(os.tmpdir(), 'not-picked.json')) + ').then(() => false, () => true)');
      if (!refused) throw new Error('未选过的路径没有被拒绝');
      return '保存 / 打开 / 最近文件正常，未选过的路径已拒绝';
    } finally {
      fs.rmSync(file, { force: true });
      if (before) fs.writeFileSync(listFile, before); else fs.rmSync(listFile, { force: true });
    }
  });
  await check('程序图标', () => {
    const f = path.join(__dirname, '..', 'assets', 'icon.ico');
    if (!fs.existsSync(f)) throw new Error('缺少 ' + f);
    return fs.statSync(f).size + ' 字节';
  });
  await check('打印机列表', async () => (await win.webContents.getPrintersAsync()).length + ' 台');
  await check('页面无报错', () => {
    if (pageErrors.length) throw new Error(pageErrors.join('; '));
    return '无';
  });
  return results;
}

module.exports = { run };
