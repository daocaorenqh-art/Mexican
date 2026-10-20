'use strict';
/* Electron 主进程：开窗口 + 通过 IPC 处理数据库请求。
   渲染进程（index.html）不直接碰数据库，只通过 preload 暴露的安全接口调用。 */
const { app, BrowserWindow, ipcMain, dialog, safeStorage } = require('electron');
const path = require('path');
const datasource = require('./src/datasource');
const rawprint = require('./src/rawprint');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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
ipcMain.handle('db:pickFile', async (_e, kind) => {
  const filters = kind === 'access'
    ? [{ name: 'Access', extensions: ['mdb', 'accdb'] }]
    : [{ name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }];
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
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
