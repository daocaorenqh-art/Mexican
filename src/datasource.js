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

function need(name) {
  try { return require(name); }
  catch (e) {
    throw new Error(`缺少数据库驱动 "${name}"，请先 npm install ${name}（原始错误：${e.message}）`);
  }
}

// ODBC 连接串取值：用 {} 包裹、} 转义为 }}，避免路径/密码里的 ; 或 } 截断连接串
const odbcVal = (v) => '{' + String(v == null ? '' : v).replace(/}/g, '}}') + '}';

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
      const conn = await odbc.connect(`Driver=${odbcVal(driver)};Dbq=${odbcVal(cfg.file)};Uid=${odbcVal(cfg.user)};Pwd=${odbcVal(cfg.password)};`);
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

// 规整成纯对象，值统一转字符串（null -> ''），方便标签套打
function normalize(rows) {
  return (rows || []).map(r => {
    const o = {};
    for (const k of Object.keys(r)) {
      const v = r[k];
      o[k] = (v === null || v === undefined) ? '' : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
    }
    return o;
  });
}

async function query(cfg, sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL 不能为空');
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

module.exports = { query, test, listTables, listColumns, selectAll, quoteIdent, _odbcVal: odbcVal };
