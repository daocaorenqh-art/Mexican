/* 数据源层校验：标识符/连接串转义（纯函数），以及用真实 SQLite 跑通 列表→字段→生成查询→取数。
   SQLite 驱动是可选依赖，未安装时跳过实库部分。运行：npm test */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ds = require(path.join(__dirname, '..', 'src', 'datasource.js'));

let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('  ✗', name, extra || ''); } };
const rejects = async (fn, inc) => { try { await fn(); return false; } catch (e) { return !inc || String(e.message).includes(inc); } };

(async () => {
  // 纯函数：各库标识符引号与转义
  check('MySQL 反引号并转义', ds.quoteIdent('mysql', 'a`b') === '`a``b`');
  check('SQL Server 方括号并转义', ds.quoteIdent('mssql', 'a]b') === '[a]]b]');
  check('Access 方括号', ds.quoteIdent('access', '吊牌 表') === '[吊牌 表]');
  check('PostgreSQL/SQLite 双引号并转义', ds.quoteIdent('postgres', 'a"b') === '"a""b"' && ds.quoteIdent('sqlite', 'x') === '"x"');
  check('ODBC 连接串取值：含 ; 与 } 的密码被安全包裹', ds._odbcVal('p;w}d') === '{p;w}}d}');
  check('不支持的类型报错', await rejects(() => ds.test({ type: 'oracle' }), '不支持的数据库类型'));
  check('空 SQL 报错', await rejects(() => ds.query({ type: 'sqlite', file: 'x' }, '  '), 'SQL 不能为空'));
  check('未选表时列字段报错', await rejects(() => ds.listColumns({ type: 'sqlite', file: 'x' }, ''), '请先选择表'));

  let Database = null;
  try { Database = require('better-sqlite3'); } catch (e) { /* 可选依赖未装 */ }
  if (!Database) {
    console.log('  （未安装 better-sqlite3，跳过 SQLite 实库校验）');
  } else {
    const file = path.join(os.tmpdir(), 'label-ds-test-' + process.pid + '.db');
    try { fs.unlinkSync(file); } catch (e) {}
    const db = new Database(file);
    db.exec(`CREATE TABLE "合格证" ("品名" TEXT, "零售 价" REAL, SKU TEXT, 上架日期 TEXT, 备注 TEXT);
             CREATE TABLE "odd""name" (id INTEGER);
             CREATE VIEW v_sku AS SELECT SKU FROM "合格证";`);
    const ins = db.prepare('INSERT INTO "合格证" VALUES (?,?,?,?,?)');
    ins.run('女包', 558, 'FZ075885L-01110', '2026-10-20', null);
    ins.run('男鞋', 398.5, 'FZ075886L-02220', '2026-10-21', 'x');
    db.close();
    const cfg = { type: 'sqlite', file };

    check('连接测试通过', await ds.test(cfg));
    const tables = await ds.listTables(cfg);
    check('列出表和视图（含中文表名、带引号的表名）', JSON.stringify(tables) === JSON.stringify(['odd"name', 'v_sku', '合格证']), JSON.stringify(tables));
    const cols = await ds.listColumns(cfg, '合格证');
    check('列出字段（含带空格的字段名、按定义顺序）', JSON.stringify(cols) === JSON.stringify(['品名', '零售 价', 'SKU', '上架日期', '备注']), JSON.stringify(cols));
    const injected = await ds.listColumns(cfg, "合格证') UNION SELECT 'x");
    check('字段查询参数化：注入串只当作表名、查不到任何字段', Array.isArray(injected) && injected.length === 0, JSON.stringify(injected));
    const rows = await ds.query(cfg, ds.selectAll(cfg, '合格证'));
    check('生成的 SELECT 能执行并取回 2 行', rows.length === 2 && rows[0]['品名'] === '女包' && rows[0]['零售 价'] === '558', JSON.stringify(rows[0]));
    check('NULL 规整为空串、数字转字符串', rows[0]['备注'] === '' && rows[1]['零售 价'] === '398.5');
    check('带引号的表名经转义后可查询', (await ds.query(cfg, ds.selectAll(cfg, 'odd"name'))).length === 0);
    check('数据库文件不存在 → 明确报错', await rejects(() => ds.test({ type: 'sqlite', file: file + '.missing' })));
    check('只读打开：写操作被拒绝', await rejects(() => ds.query(cfg, 'DELETE FROM "合格证"')));
    try { fs.unlinkSync(file); } catch (e) {}
  }

  console.log(`数据源校验：通过 ${pass} / 失败 ${fail}`);
  process.exit(fail ? 1 : 0);
})();
