'use strict';
/* 在渲染进程里安全地暴露数据库接口。
   index.html 通过 window.labelDB.* 调用，不接触 Node / 数据库驱动本身。
   浏览器直接打开 index.html 时 window.labelDB 不存在，界面据此隐藏数据库面板，
   仍可用 CSV / 粘贴方式套打。 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('labelDB', {
  isDesktop: true,
  test: (cfg) => ipcRenderer.invoke('db:test', cfg),
  query: (cfg, sql) => ipcRenderer.invoke('db:query', { cfg, sql }),
  pickFile: (kind) => ipcRenderer.invoke('db:pickFile', kind),
  encrypt: (text) => ipcRenderer.invoke('secret:encrypt', text),
  decrypt: (b64) => ipcRenderer.invoke('secret:decrypt', b64)
});

// 打印机：列表、ZPL 直发、指定打印机静默打印
contextBridge.exposeInMainWorld('labelPrinter', {
  isDesktop: true,
  list: () => ipcRenderer.invoke('printer:list'),
  sendRaw: (target, data) => ipcRenderer.invoke('printer:sendRaw', { target, data }),
  status: (target, lang) => ipcRenderer.invoke('printer:status', { target, lang }),
  print: (deviceName, opts) => ipcRenderer.invoke('printer:print', { deviceName, pageSize: opts && opts.pageSize })
});
