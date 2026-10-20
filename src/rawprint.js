'use strict';
/* 把原始指令（ZPL 等）直接送到打印机，不经过驱动渲染：
   - 网络打印机：TCP 9100（斑马/TSC 等标签机通用的 RAW 端口）
   - 本机打印机按名称：Windows 后台打印 RAW（OpenPrinter / StartDocPrinter(RAW) / WritePrinter），USB 打印机无需设共享
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
    let connected = false;
    sock.on('error', (e) => fail(new Error((connected ? '打印机中途断开连接，数据可能未收全：' : '无法连接打印机：') + e.message)));
    sock.on('connect', () => {
      connected = true;
      // 写完后不立即算成功：打印机中途复位 / 断网时数据会丢，系统只会在之后报 ECONNRESET。
      // 等打印机正常关闭连接即成功；不主动断开的打印机，写完 1.5 秒内没出错也算成功（然后由我们关闭）
      sock.end(buf, () => {
        if (settled) return;
        sock.setTimeout(0);
        const t = setTimeout(() => { if (settled) return; settled = true; sock.destroy(); resolve(); }, 1500);
        sock.once('close', (hadError) => { clearTimeout(t); if (settled) return; settled = true;
          hadError ? reject(new Error('打印机中途断开连接（' + host + ':' + p + '），数据可能未收全')) : resolve(); });
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

// Windows 后台打印 RAW：PowerShell 内联 C#（winspool.drv）。打印机名和文件路径经环境变量传入，不进命令行
const SPOOL_PS = `$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LabelRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static string Send(string name, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(name, out h, IntPtr.Zero)) return "OpenPrinter " + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO(); di.pDocName = "Label"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "StartDocPrinter " + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(h)) return "StartPagePrinter " + Marshal.GetLastWin32Error();
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length) return "WritePrinter " + Marshal.GetLastWin32Error();
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
    return "";
  }
}
'@
$r = [LabelRawPrinter]::Send($env:LABEL_PRINTER, [IO.File]::ReadAllBytes($env:LABEL_FILE))
if ($r) { [Console]::Error.WriteLine($r); exit 1 }`;
function spoolRaw(name, buf) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') return reject(new Error('按打印机名直发仅支持 Windows'));
    const tmp = path.join(os.tmpdir(), 'label-' + process.pid + '-' + Date.now() + '.prn');
    fs.writeFileSync(tmp, buf);
    const cmd = Buffer.from(SPOOL_PS, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', cmd],
      { windowsHide: true, timeout: 60000, env: Object.assign({}, process.env, { LABEL_PRINTER: name, LABEL_FILE: tmp }) },
      (err, stdout, stderr) => {
        fs.unlink(tmp, () => {});
        if (err) {
          const msg = String(stderr || stdout || err.message).trim();
          // 1801 = 打印机名无效；3003 等 = 驱动不接受 RAW（部分 v4 / XPS 驱动）
          if (/OpenPrinter 1801/.test(msg)) return reject(new Error('找不到打印机「' + name + '」'));
          return reject(new Error('发送失败：' + msg));
        }
        resolve();
      });
  });
}

// 串口参数：波特率 / 校验 / 数据位 / 停止位，全部白名单（会作为 mode 命令参数）
const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
function serialMode(t) {
  if (t.baud == null || t.baud === '') return null;
  const baud = Number(t.baud), parity = String(t.parity || 'n').toLowerCase(), data = Number(t.dataBits || 8), stop = Number(t.stopBits || 1);
  if (!BAUDS.includes(baud)) throw new Error('波特率只能是 ' + BAUDS.join(' / '));
  if (!['n', 'e', 'o'].includes(parity)) throw new Error('校验位只能是 n / e / o');
  if (![7, 8].includes(data)) throw new Error('数据位只能是 7 或 8');
  if (![1, 2].includes(stop)) throw new Error('停止位只能是 1 或 2');
  return ['BAUD=' + baud, 'PARITY=' + parity, 'DATA=' + data, 'STOP=' + stop];
}
function runMode(port, args) {
  return new Promise((resolve, reject) => {
    execFile('cmd.exe', ['/d', '/c', 'mode', port + ':', ...args], { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error('设置串口参数失败：' + String(stderr || stdout || err.message).trim()));
      resolve();
    });
  });
}

async function sendRaw(target, data) {
  // 字符串（ZPL）按 UTF-8；二进制（TSPL 位图等，Uint8Array）原样发送
  const buf = Buffer.isBuffer(data) ? data : (data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(String(data == null ? '' : data), 'utf8'));
  if (!buf.length) throw new Error('没有可发送的内容');
  const t = target || {};
  if (t.kind === 'tcp') return sendTcp(String(t.host || '').trim(), t.port, buf);
  if (t.kind === 'share') {
    const name = String(t.name || '').trim();
    if (!SHARE_RE.test(name)) throw new Error('共享打印机名只能包含字母、数字、空格、点、下划线和横线');
    return copyRaw('\\\\localhost\\' + name, buf);
  }
  if (t.kind === 'spool') {
    const name = String(t.name || '').trim();
    if (!name || name.length > 256 || /[\x00-\x1f]/.test(name)) throw new Error('打印机名无效');
    return spoolRaw(name, buf);
  }
  if (t.kind === 'com') {
    const port = String(t.port || '').trim().toUpperCase();
    if (!COM_RE.test(port)) throw new Error('串口格式应为 COM1、COM2…');
    const mode = serialMode(t);           // 先校验参数，再判断平台
    if (process.platform === 'win32' && mode) await runMode(port, mode);
    return copyRaw(port, buf);
  }
  throw new Error('未知的发送方式');
}

/* ---------- 打印机状态（仅网络打印机：共享 / 串口是单向的） ----------
   ZPL：~HS 主机状态（缺纸、暂停、开盖、缺碳带、过热……），~HI 型号 / 固件 / 分辨率（点/毫米）
   TSPL：<ESC>!? 返回一个状态字节 */
function queryTcp(host, port, payload, { timeoutMs = 3000, until } = {}) {
  return new Promise((resolve, reject) => {
    if (!HOST_RE.test(host)) return reject(new Error('打印机地址无效'));
    const p = Number(port) || 9100;
    if (!(Number.isInteger(p) && p > 0 && p < 65536)) return reject(new Error('端口无效'));
    const sock = net.createConnection({ host, port: p }), chunks = [];
    let done = false;
    const finish = (err) => {
      if (done) return; done = true; sock.destroy();
      const buf = Buffer.concat(chunks);
      if (err && !buf.length) reject(err); else resolve(buf);
    };
    sock.setTimeout(timeoutMs, () => finish(new Error('打印机没有回应（' + host + ':' + p + '）')));
    sock.on('error', (e) => finish(new Error('无法连接打印机：' + e.message)));
    sock.on('connect', () => sock.write(payload));
    sock.on('data', (c) => { chunks.push(c); if (until && until(Buffer.concat(chunks))) finish(); });
    sock.on('end', () => finish());
  });
}
// ~HS 三段：STX ... ETX CR LF，各段逗号分隔
function parseHS(buf) {
  const parts = buf.toString('latin1').split('\x02').map(s => s.split('\x03')[0].trim()).filter(Boolean);
  if (parts.length < 2) throw new Error('打印机状态格式无法识别');
  const a = parts[0].split(','), b = parts[1].split(',');
  return {
    paperOut: a[1] === '1', paused: a[2] === '1', bufferFull: a[5] === '1', underTemp: a[10] === '1', overTemp: a[11] === '1',
    headUp: b[2] === '1', ribbonOut: b[3] === '1', thermalTransfer: b[4] === '1', labelsRemaining: +b[8] || 0,
  };
}
// ~HI：型号,固件,点/毫米,内存,选项
function parseHI(buf) {
  const s = buf.toString('latin1').replace(/[\x02\x03\r\n]/g, '').trim(), f = s.split(',');
  const dpmm = +f[2];
  return { model: f[0] || '', firmware: f[1] || '', dpi: { 6: 152, 8: 203, 12: 300, 24: 600 }[dpmm] || (dpmm ? Math.round(dpmm * 25.4) : 0) };
}
// TSPL 状态字节
function parseTSPLStatus(b) {
  return { headUp: !!(b & 0x01), paperJam: !!(b & 0x02), paperOut: !!(b & 0x04), ribbonOut: !!(b & 0x08),
    paused: !!(b & 0x10), printing: !!(b & 0x20), coverOpen: !!(b & 0x40), otherError: !!(b & 0x80) };
}
const PROBLEMS = { paperOut: '缺纸', ribbonOut: '缺碳带', headUp: '打印头抬起', paperJam: '卡纸', coverOpen: '上盖打开',
  paused: '暂停中', bufferFull: '接收缓冲区满', underTemp: '温度过低', overTemp: '打印头过热', otherError: '其他错误' };
async function printerStatus(target, lang) {
  const t = target || {};
  if (t.kind !== 'tcp') throw new Error('只有网络打印机能读取状态（共享打印机 / 串口是单向的）');
  const host = String(t.host || '').trim(), port = t.port;
  let st, info = {};
  if (lang === 'tspl') {
    const r = await queryTcp(host, port, Buffer.from([0x1B, 0x21, 0x3F]), { until: (b) => b.length >= 1 });
    if (!r.length) throw new Error('打印机没有回应状态');
    st = parseTSPLStatus(r[0]);
  } else {
    const etx = (n) => (b) => b.toString('latin1').split('\x03').length - 1 >= n;
    st = parseHS(await queryTcp(host, port, '~HS', { until: etx(3) }));
    try { info = parseHI(await queryTcp(host, port, '~HI', { until: etx(1) })); } catch (e) { /* 部分机型不支持 ~HI */ }
  }
  const problems = Object.keys(PROBLEMS).filter((k) => st[k]).map((k) => PROBLEMS[k]);
  return Object.assign({ ready: problems.length === 0, problems }, st, info);
}

module.exports = { sendRaw, printerStatus, parseHS, parseHI, parseTSPLStatus, serialMode };
