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
      sandbox: false
    }
  });
  win.setMenuBarVisibility(false);
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

// 列出表 / 视图
ipcMain.handle('db:tables', async (_e, cfg) => {
  try {
    return { ok: true, tables: await datasource.listTables(cfg) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

// 列出某表字段，并给出按该库规则引号转义后的 SELECT
ipcMain.handle('db:columns', async (_e, { cfg, table }) => {
  try {
    return { ok: true, columns: await datasource.listColumns(cfg, table), sql: datasource.selectAll(cfg, table) };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

/* ---- IPC：密码加密（交给操作系统，Windows 为 DPAPI：只有本机本用户能解开） ---- */
ipcMain.handle('secret:encrypt', (_e, plain) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(String(plain)).toString('base64');
});
ipcMain.handle('secret:decrypt', (_e, b64) => {
  try {
    if (!b64 || !safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(String(b64), 'base64'));
  } catch (err) {
    return null;
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
