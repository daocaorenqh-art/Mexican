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
  tables: (cfg) => ipcRenderer.invoke('db:tables', cfg),
  columns: (cfg, table) => ipcRenderer.invoke('db:columns', { cfg, table }),
  encrypt: (text) => ipcRenderer.invoke('secret:encrypt', text),
  decrypt: (b64) => ipcRenderer.invoke('secret:decrypt', b64)
});

// 敏感信息（数据库密码）加解密，由主进程交给系统完成（labelDB.encrypt/decrypt 的同名接口）
contextBridge.exposeInMainWorld('labelSecret', {
  encrypt: (plain) => ipcRenderer.invoke('secret:encrypt', plain),
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

// 设计文件：打开 / 保存（同一路径直接覆盖）/ 另存为 / 最近文件
contextBridge.exposeInMainWorld('labelFile', {
  recent: () => ipcRenderer.invoke('file:recent'),
  open: (path) => ipcRenderer.invoke('file:open', path || null),
  save: (opts) => ipcRenderer.invoke('file:save', opts)
});
