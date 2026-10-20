'use strict';
/* Electron 主进程：开窗口 + 通过 IPC 处理数据库请求。
   渲染进程（index.html）不直接碰数据库，只通过 preload 暴露的安全接口调用。 */
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const datasource = require('./src/datasource');
const rawprint = require('./src/rawprint');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.setMenuBarVisibility(false);
  // 禁止页面跳走（如把文件拖进窗口会导航到该文件，未保存的设计就丢了）和弹新窗口
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile('index.html');
  return win;
}

app.whenReady().then(() => {
  const win = createWindow();
  if (process.argv.includes('--smoke-test')) smokeTest(win);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 启动自检：跑完 src/smoke.js 里的检查，结果写到 --smoke-out 指定的文件（没指定则打到控制台），按结果退出
function smokeTest(win) {
  const outArg = process.argv.find(a => a.startsWith('--smoke-out='));
  const pageErrors = [];
  win.webContents.on('console-message', (e, level, message) => {
    const lv = e && e.level !== undefined ? e.level : level;          // 新版 Electron 传 details 对象
    if (lv === 'error' || lv === 3) pageErrors.push(e && e.message !== undefined ? e.message : message);
  });
  const finish = (results) => {
    const text = JSON.stringify(results, null, 2);
    if (outArg) fs.writeFileSync(outArg.slice('--smoke-out='.length), text, 'utf8'); else console.log(text);
    app.exit(results.length && results.every(r => r.ok) ? 0 : 1);
  };
  setTimeout(() => finish([{ name: '超时', ok: false, detail: '60 秒内未完成' }]), 60000).unref();
  win.webContents.once('did-finish-load', () => {
    require('./src/smoke').run(win, pageErrors).then(finish, (e) => finish([{ name: '自检', ok: false, detail: String(e) }]));
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 只接受本应用页面（file://）发来的 IPC 请求
function trusted(e) {
  const url = (e.senderFrame && e.senderFrame.url) || '';
  if (!url.startsWith('file://')) throw new Error('拒绝来自非本应用页面的请求');
}

/* ---- IPC：数据库 ---- */

// 测试连接：成功返回 {ok:true}，失败返回 {ok:false, error}
ipcMain.handle('db:test', async (e, cfg) => {
  try {
    trusted(e);
    await datasource.test(cfg);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 执行查询，返回行数组（纯对象）
ipcMain.handle('db:query', async (e, { cfg, sql }) => {
  try {
    trusted(e);
    const rows = await datasource.query(cfg, sql);
    return { ok: true, rows };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 选择本地数据库文件（SQLite / Access）
ipcMain.handle('db:pickFile', async (e, kind) => {
  trusted(e);
  const filters = kind === 'access'
    ? [{ name: 'Access', extensions: ['mdb', 'accdb'] }]
    : [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }];
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});

// 列出表 / 视图
ipcMain.handle('db:tables', async (e, cfg) => {
  try {
    trusted(e);
    return { ok: true, tables: await datasource.listTables(cfg) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 列出某表字段，并给出按该库规则引号转义后的 SELECT
ipcMain.handle('db:columns', async (e, { cfg, table }) => {
  try {
    trusted(e);
    return { ok: true, columns: await datasource.listColumns(cfg, table), sql: datasource.selectAll(cfg, table) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

/* ---- IPC：打印机 ---- */

// 本机打印机列表（含默认打印机标记）
ipcMain.handle('printer:list', async (e) => {
  try {
    const list = await e.sender.getPrintersAsync();
    return { ok: true, printers: list.map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault })) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 原始指令（ZPL）直发：网络 9100 / 共享打印机 / 串口
ipcMain.handle('printer:sendRaw', async (e, { target, data }) => {
  try {
    trusted(e);
    await rawprint.sendRaw(target, data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 读取网络打印机状态（缺纸 / 开盖 / 缺碳带 / 分辨率）：lang 为 'zpl' 或 'tspl'
ipcMain.handle('printer:status', async (e, { target, lang }) => {
  try {
    trusted(e);
    return { ok: true, status: await rawprint.printerStatus(target, lang) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 按指定打印机静默打印当前页面（不弹系统打印对话框）
// pageSize：标签机模式传 {width,height}（微米，= 标签尺寸），整页模式传 'A4' 等纸张名
const PAPERS = new Set(['A3', 'A4', 'A5', 'Legal', 'Letter', 'Tabloid']);
function pageSizeOf(p) {
  if (typeof p === 'string') return PAPERS.has(p) ? p : undefined;
  if (p && +p.width > 0 && +p.height > 0) return { width: Math.round(+p.width), height: Math.round(+p.height) };
  return undefined;
}
ipcMain.handle('printer:print', (e, { deviceName, pageSize }) => new Promise((resolve) => {
  try { trusted(e); } catch (err) { resolve({ ok: false, error: err.message }); return; }
  e.sender.print({ silent: true, deviceName: deviceName || undefined, printBackground: true,
    margins: { marginType: 'none' }, pageSize: pageSizeOf(pageSize) },
    (success, reason) => resolve(success ? { ok: true } : { ok: false, error: reason || '打印失败' }));
}));

/* ---- IPC：敏感信息加密（数据库密码等，用系统钥匙串 / DPAPI，不再明文存 localStorage） ---- */
/* ---- IPC：设计文件（打开 / 保存 / 另存为 / 最近文件） ----
   页面只能读写用户在对话框里选过、或在最近文件列表里的路径；列表存于用户数据目录 */
const RECENT_MAX = 8;
const recentPath = () => path.join(app.getPath('userData'), 'recent-files.json');
function readRecent() {
  try { const a = JSON.parse(fs.readFileSync(recentPath(), 'utf8')); return Array.isArray(a) ? a.filter((p) => typeof p === 'string') : []; }
  catch (err) { return []; }
}
function addRecent(p) {
  const list = [p, ...readRecent().filter((x) => x !== p)].slice(0, RECENT_MAX);
  try { fs.mkdirSync(path.dirname(recentPath()), { recursive: true }); fs.writeFileSync(recentPath(), JSON.stringify(list)); } catch (err) { /* 列表写不了不影响保存本身 */ }
}
const JSON_FILTER = [{ name: '标签设计', extensions: ['json'] }];
ipcMain.handle('file:recent', (e) => {
  trusted(e);
  return readRecent().filter((p) => fs.existsSync(p));
});
ipcMain.handle('file:open', async (e, want) => {
  trusted(e);
  let p = want;
  if (p && !readRecent().includes(p)) throw new Error('只能打开最近文件列表里的文件');
  if (!p) {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: JSON_FILTER });
    if (r.canceled || !r.filePaths[0]) return null;
    p = r.filePaths[0];
  }
  const text = fs.readFileSync(p, 'utf8');
  addRecent(p);
  return { path: p, name: path.basename(p), text };
});
ipcMain.handle('file:save', async (e, { path: want, text, saveAs, suggest }) => {
  trusted(e);
  let p = !saveAs && want && readRecent().includes(want) ? want : null;
  if (!p) {
    const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), {
      defaultPath: want || ((suggest || '标签设计') + '.json'), filters: JSON_FILTER });
    if (r.canceled || !r.filePath) return null;
    p = /\.json$/i.test(r.filePath) ? r.filePath : r.filePath + '.json';
  }
  // 先写临时文件再替换，写到一半断电也不会把原设计弄坏
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, String(text), 'utf8');
  fs.renameSync(tmp, p);
  addRecent(p);
  return { path: p, name: path.basename(p) };
});

ipcMain.handle('secret:encrypt', (e, text) => {
  trusted(e);
  if (!text || !safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(String(text)).toString('base64');
});
ipcMain.handle('secret:decrypt', (e, b64) => {
  trusted(e);
  try { return b64 && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(String(b64), 'base64')) : ''; }
  catch (err) { return ''; }
});
