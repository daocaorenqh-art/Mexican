'use strict';
/* 多数据库数据源抽象。
   cfg 形如：
     { type:'sqlite',   file:'C:\\data\\app.db' }
     { type:'access',   file:'C:\\xe-v6\\v63\\tm\\temptm.mdb' }   // 需系统装 Access ODBC 驱动
     { type:'mysql',    host, port, user, password, database }
     { type:'postgres', host, port, user, password, database }
     { type:'mssql',    host, port, user, password, database }
   每个驱动按需 require；没装的驱动给出友好提示而不是崩溃。
   每种库实现 open(cfg) → { q(sql, params), close() }，查询/测试/列表/列字段都走同一条连接路径。
   query() 统一返回纯对象数组 [{列:值, ...}, ...]，正好对接 index.html 的套打。 */

// ODBC 连接串里的值用 {} 包起来，值里有 ; 或 } 也不会串到下一个参数
function odbcVal(v) { return '{' + String(v == null ? '' : v).replace(/}/g, '}}') + '}'; }

function need(name) {
  try { return require(name); }
  catch (e) {
    throw new Error(`缺少数据库驱动 "${name}"，请先 npm install ${name}（原始错误：${e.message}）`);
  }
}

const drivers = {
  sqlite: {
    async open(cfg) {
      const Database = need('better-sqlite3');
      const db = new Database(cfg.file, { readonly: true, fileMustExist: true });
      return { q: async (sql, p = []) => db.prepare(sql).all(...p), close: async () => db.close() };
    },
    tables: "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    columns: 'SELECT name FROM pragma_table_info(?)'
  },

  access: {
    async open(cfg) {
      const odbc = need('odbc');
      const driver = cfg.driver || 'Microsoft Access Driver (*.mdb, *.accdb)';
      let conn;
      try { conn = await odbc.connect(`Driver=${odbcVal(driver)};Dbq=${odbcVal(cfg.file)};Uid=${odbcVal(cfg.user)};Pwd=${odbcVal(cfg.password)};`); }
      catch (e) {
        // 最常见：64 位程序 + 32 位 Office 的 Access 驱动（或没装驱动）
        if (/IM002|data source name not found|未发现数据源|找不到数据源/i.test(String(e && (e.message || (e.odbcErrors && JSON.stringify(e.odbcErrors))))))
          throw new Error('找不到 Access ODBC 驱动。本软件是 64 位，请安装 64 位「Microsoft Access Database Engine」（与 Office 位数不符时可用 /quiet 参数强制安装）');
        throw e;
      }
      return {
        q: async (sql, p = []) => conn.query(sql, p),
        close: () => conn.close(),
        tablesFn: async () => (await conn.tables(null, null, null, 'TABLE')).map(r => r.TABLE_NAME),
        columnsFn: async (t) => (await conn.columns(null, null, t, null)).map(r => r.COLUMN_NAME)
      };
    }
  },

  mysql: {
    async open(cfg) {
      const mysql = need('mysql2/promise');
      const c = await mysql.createConnection({
        host: cfg.host || 'localhost', port: cfg.port || 3306,
        user: cfg.user, password: cfg.password, database: cfg.database
      });
      return { q: async (sql, p = []) => (await c.query(sql, p))[0], close: () => c.end() };
    },
    tables: 'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
    columns: 'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION'
  },

  postgres: {
    async open(cfg) {
      const { Client } = need('pg');
      const c = new Client({
        host: cfg.host || 'localhost', port: cfg.port || 5432,
        user: cfg.user, password: cfg.password, database: cfg.database
      });
      await c.connect();
      return { q: async (sql, p = []) => (await c.query(sql, p)).rows, close: () => c.end() };
    },
    tables: "SELECT table_name AS name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_name",
    columns: 'SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position'
  },

  mssql: {
    async open(cfg) {
      const mssql = need('mssql');
      // 独立连接池：不用 mssql.connect() 的全局池，避免并发查询互相关闭连接
      const pool = await new mssql.ConnectionPool({
        server: cfg.host || 'localhost', port: cfg.port || 1433,
        user: cfg.user, password: cfg.password, database: cfg.database,
        options: { encrypt: cfg.encrypt !== false, trustServerCertificate: true }
      }).connect();
      return {
        q: async (sql, p = []) => { const r = pool.request(); p.forEach((v, i) => r.input('p' + i, v)); return (await r.query(sql)).recordset; },
        close: () => pool.close()
      };
    },
    tables: 'SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME',
    columns: 'SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @p0 ORDER BY ORDINAL_POSITION'
  }
};

async function withConn(cfg, fn) {
  const d = drivers[cfg && cfg.type];
  if (!d) throw new Error('不支持的数据库类型：' + (cfg && cfg.type));
  const c = await d.open(cfg);
  try { return await fn(c, d); }
  finally { try { await c.close(); } catch (e) { /* 关闭失败不影响结果 */ } }
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

// 规整成纯对象，值统一转文本（日期按本地时间、图片 BLOB 转 data: 地址），方便标签套打
function normalize(rows) {
  return (rows || []).map(r => {
    const o = {};
    for (const k of Object.keys(r)) o[k] = formatValue(r[k]);
    return o;
  });
}

async function query(cfg, sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL 不能为空');
  assertReadOnly(sql);
  return normalize(await withConn(cfg, c => c.q(sql)));
}

async function test(cfg) {
  await withConn(cfg, c => c.q('SELECT 1'));
  return true;
}

async function listTables(cfg) {
  return withConn(cfg, async (c, d) => c.tablesFn ? c.tablesFn() : (await c.q(d.tables)).map(r => r.name));
}

// 字段名查询一律参数化，表名不拼进 SQL
async function listColumns(cfg, table) {
  const t = String(table == null ? '' : table);
  if (!t) throw new Error('请先选择表');
  return withConn(cfg, async (c, d) => c.columnsFn ? c.columnsFn(t) : (await c.q(d.columns, [t])).map(r => r.name));
}

// 标识符按各库规则加引号并转义（表名虽来自数据库目录，仍防特殊字符破坏语句）
function quoteIdent(type, name) {
  const n = String(name);
  if (type === 'mysql') return '`' + n.replace(/`/g, '``') + '`';
  if (type === 'mssql' || type === 'access') return '[' + n.replace(/]/g, ']]') + ']';
  return '"' + n.replace(/"/g, '""') + '"';
}
function selectAll(cfg, table) { return 'SELECT * FROM ' + quoteIdent(cfg && cfg.type, table); }

module.exports = { query, test, listTables, listColumns, selectAll, quoteIdent, formatValue, assertReadOnly, odbcVal, _odbcVal: odbcVal };
