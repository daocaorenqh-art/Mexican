'use strict';
/* 把原始指令（ZPL 等）直接送到打印机，不经过驱动渲染：
   - 网络打印机：TCP 9100（斑马/TSC 等标签机通用的 RAW 端口）
   - Windows 共享打印机：copy /b 到 \\localhost\共享名（USB 打印机设为共享后即可 RAW 打印）
   - 串口：copy /b 到 COMn
   打印机名 / 串口 / 地址都做白名单校验，杜绝拼进命令行的注入。 */
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const SHARE_RE = /^[A-Za-z0-9 _.\-]{1,64}$/;
const COM_RE = /^COM[1-9]\d{0,2}$/i;
const HOST_RE = /^[A-Za-z0-9.\-:]{1,253}$/;

function sendTcp(host, port, buf, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (!HOST_RE.test(host)) return reject(new Error('打印机地址无效'));
    const p = Number(port) || 9100;
    if (!(Number.isInteger(p) && p > 0 && p < 65536)) return reject(new Error('端口无效'));
    const sock = net.createConnection({ host, port: p });
    let settled = false;
    const fail = (e) => { if (settled) return; settled = true; sock.destroy(); reject(e); };
    sock.setTimeout(timeoutMs, () => fail(new Error('连接打印机超时（' + host + ':' + p + '）')));
    sock.on('error', (e) => fail(new Error('无法连接打印机：' + e.message)));
    sock.on('connect', () => {
      // 数据全部写出即视为成功；有的打印机不主动断开，稍后自行关闭
      sock.end(buf, () => {
        if (settled) return;
        settled = true;
        sock.setTimeout(3000, () => sock.destroy());
        resolve();
      });
    });
  });
}

function copyRaw(dest, buf) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('共享打印机 / 串口直发仅支持 Windows'));
    const tmp = path.join(os.tmpdir(), 'label-' + process.pid + '-' + Date.now() + '.prn');
    fs.writeFileSync(tmp, buf);
    execFile('cmd.exe', ['/d', '/c', 'copy', '/b', tmp, dest], { windowsHide: true, timeout: 20000 }, (err, stdout, stderr) => {
      fs.unlink(tmp, () => {});
      if (err) return reject(new Error('发送失败：' + String(stderr || stdout || err.message).trim()));
      resolve();
    });
  });
}

async function sendRaw(target, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data == null ? '' : data), 'utf8');
  if (!buf.length) throw new Error('没有可发送的内容');
  const t = target || {};
  if (t.kind === 'tcp') return sendTcp(String(t.host || '').trim(), t.port, buf);
  if (t.kind === 'share') {
    const name = String(t.name || '').trim();
    if (!SHARE_RE.test(name)) throw new Error('共享打印机名只能包含字母、数字、空格、点、下划线和横线');
    return copyRaw('\\\\localhost\\' + name, buf);
  }
  if (t.kind === 'com') {
    const port = String(t.port || '').trim().toUpperCase();
    if (!COM_RE.test(port)) throw new Error('串口格式应为 COM1、COM2…');
    return copyRaw(port, buf);
  }
  throw new Error('未知的发送方式');
}

module.exports = { sendRaw };
