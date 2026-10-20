'use strict';
/* Electron 主进程：开窗口 + 通过 IPC 处理数据库请求。
   渲染进程（index.html）不直接碰数据库，只通过 preload 暴露的安全接口调用。 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
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

/* ---- IPC：数据库 ---- */

// 测试连接：成功返回 {ok:true}，失败返回 {ok:false, error}
ipcMain.handle('db:test', async (_e, cfg) => {
  try {
    await datasource.test(cfg);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 执行查询，返回行数组（纯对象）
ipcMain.handle('db:query', async (_e, { cfg, sql }) => {
  try {
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
ipcMain.handle('printer:sendRaw', async (_e, { target, data }) => {
  try {
    await rawprint.sendRaw(target, data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 按指定打印机静默打印当前页面（不弹系统打印对话框）
ipcMain.handle('printer:print', (e, { deviceName }) => new Promise((resolve) => {
  e.sender.print({ silent: true, deviceName: deviceName || undefined, printBackground: true, margins: { marginType: 'none' } },
    (success, reason) => resolve(success ? { ok: true } : { ok: false, error: reason || '打印失败' }));
}));
