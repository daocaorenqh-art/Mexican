'use strict';
/* 多数据库数据源抽象。
   cfg 形如：
     { type:'sqlite',   file:'C:\\data\\app.db' }
     { type:'access',   file:'C:\\xe-v6\\v63\\tm\\temptm.mdb' }   // 需系统装 Access ODBC 驱动
     { type:'mysql',    host, port, user, password, database }
     { type:'postgres', host, port, user, password, database }
     { type:'mssql',    host, port, user, password, database }
   每个驱动按需 require；没装的驱动给出友好提示而不是崩溃。
   query() 统一返回纯对象数组 [{列:值, ...}, ...]，正好对接 index.html 的套打。 */

// ODBC 连接串里的值用 {} 包起来，值里有 ; 或 } 也不会串到下一个参数
function odbcVal(v) { return '{' + String(v == null ? '' : v).replace(/}/g, '}}') + '}'; }

function need(name) {
  try { return require(name); }
  catch (e) {
    throw new Error(`缺少数据库驱动 "${name}"，请先 npm install ${name}（原始错误：${e.message}）`);
  }
}

const adapters = {
  async sqlite(cfg, sql) {
    const Database = need('better-sqlite3');
    const db = new Database(cfg.file, { readonly: true, fileMustExist: true });
    try { return db.prepare(sql).all(); }
    finally { db.close(); }
  },

  async access(cfg, sql) {
    const odbc = need('odbc');
    const driver = cfg.driver || 'Microsoft Access Driver (*.mdb, *.accdb)';
    const connStr = `Driver={${driver}};Dbq=${odbcVal(cfg.file)};Uid=${odbcVal(cfg.user)};Pwd=${odbcVal(cfg.password)};`;
    let conn;
    try { conn = await odbc.connect(connStr); }
    catch (e) {
      // 最常见：64 位程序 + 32 位 Office 的 Access 驱动（或没装驱动）
      if (/IM002|data source name not found|未发现数据源|找不到数据源/i.test(String(e && (e.message || (e.odbcErrors && JSON.stringify(e.odbcErrors))))))
        throw new Error('找不到 Access ODBC 驱动。本软件是 64 位，请安装 64 位「Microsoft Access Database Engine」（与 Office 位数不符时可用 /quiet 参数强制安装）');
      throw e;
    }
    try { return await conn.query(sql); }
    finally { await conn.close(); }
  },

  async mysql(cfg, sql) {
    const mysql = need('mysql2/promise');
    const conn = await mysql.createConnection({
      host: cfg.host || 'localhost', port: cfg.port || 3306,
      user: cfg.user, password: cfg.password, database: cfg.database
    });
    try { const [rows] = await conn.query(sql); return rows; }
    finally { await conn.end(); }
  },

  async postgres(cfg, sql) {
    const { Client } = need('pg');
    const client = new Client({
      host: cfg.host || 'localhost', port: cfg.port || 5432,
      user: cfg.user, password: cfg.password, database: cfg.database
    });
    await client.connect();
    try { const r = await client.query(sql); return r.rows; }
    finally { await client.end(); }
  },

  async mssql(cfg, sql) {
    const mssql = need('mssql');
    const pool = await mssql.connect({
      server: cfg.host || 'localhost', port: cfg.port || 1433,
      user: cfg.user, password: cfg.password, database: cfg.database,
      options: { encrypt: cfg.encrypt !== false, trustServerCertificate: true }
    });
    try { const r = await pool.request().query(sql); return r.recordset; }
    finally { await pool.close(); }
  }
};

// 各类型的轻量连接测试 SQL
const PING = {
  sqlite: 'SELECT 1',
  access: 'SELECT 1',
  mysql: 'SELECT 1',
  postgres: 'SELECT 1',
  mssql: 'SELECT 1'
};

function pick(cfg) {
  const fn = adapters[cfg && cfg.type];
  if (!fn) throw new Error('不支持的数据库类型：' + (cfg && cfg.type));
  return fn;
}

const pad = (n) => String(n).padStart(2, '0');
// 单元格值 → 文本：日期按本地时间（不再转 UTC 而差一天），有时分秒才带时间；
// 图片 BLOB（PNG/JPEG/GIF/BMP）转 data: 地址，可直接给图片元素用；其余二进制给出提示
function formatValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    const d = v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    return (v.getHours() || v.getMinutes() || v.getSeconds())
      ? d + ' ' + pad(v.getHours()) + ':' + pad(v.getMinutes()) + ':' + pad(v.getSeconds()) : d;
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    const b = Buffer.from(v);
    const mime = b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0xFF && b[1] === 0xD8 ? 'image/jpeg'
      : b[0] === 0x47 && b[1] === 0x49 ? 'image/gif' : b[0] === 0x42 && b[1] === 0x4D ? 'image/bmp' : null;
    return mime ? 'data:' + mime + ';base64,' + b.toString('base64') : '[二进制 ' + b.length + ' 字节]';
  }
  return String(v);
}

// 套打只需要读数据：只允许 SELECT / WITH 查询，防止误执行 UPDATE / DELETE
function assertReadOnly(sql) {
  const s = String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim();
  if (!/^(select|with)\b/i.test(s)) throw new Error('只允许 SELECT 查询（套打只读取数据）');
  if (/;\s*\S/.test(s)) throw new Error('一次只能执行一条查询');
}

async function query(cfg, sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL 不能为空');
  assertReadOnly(sql);
  const rows = await pick(cfg)(cfg, sql);
  // 规整成纯对象，值统一转文本，方便标签套打
  return (rows || []).map(r => {
    const o = {};
    for (const k of Object.keys(r)) o[k] = formatValue(r[k]);
    return o;
  });
}

async function test(cfg) {
  // Access 用文件存在性 + 一次 ODBC 连接；其余跑 PING
  await pick(cfg)(cfg, PING[cfg.type] || 'SELECT 1');
  return true;
}

module.exports = { query, test, formatValue, assertReadOnly, odbcVal };
