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
    const connStr = `Driver={${driver}};Dbq=${cfg.file};Uid=${cfg.user || ''};Pwd=${cfg.password || ''};`;
    const conn = await odbc.connect(connStr);
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

async function query(cfg, sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL 不能为空');
  const rows = await pick(cfg)(cfg, sql);
  // 规整成纯对象，值统一转字符串（null -> ''），方便标签套打
  return (rows || []).map(r => {
    const o = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      o[k] = (v === null || v === undefined) ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    }
    return o;
  });
}

async function test(cfg) {
  // Access 用文件存在性 + 一次 ODBC 连接；其余跑 PING
  await pick(cfg)(cfg, PING[cfg.type] || 'SELECT 1');
  return true;
}

module.exports = { query, test };
