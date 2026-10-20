/* 数据来源测试：数据库取值格式化（时区 / BLOB）、只读保护、ODBC 转义；.xlsx 直接导入。运行：npm test */
const path = require('path');
const { suite, makeZip } = require('./helpers.cjs');
const { check, eq, throws, done } = suite('数据来源');

(async () => {
  // ---- 数据库取值：在 UTC+8 下日期不能少一天 ----
  process.env.TZ = 'Asia/Shanghai';
  const ds = require(path.join(__dirname, '..', 'src', 'datasource.js'));
  eq('DATE 列（驱动返回本地零点）', ds.formatValue(new Date(2026, 9, 20)), '2026-10-20');
  eq('DATETIME 列保留时分秒', ds.formatValue(new Date(2026, 9, 20, 7, 5, 9)), '2026-10-20 07:05:09');
  eq('null → 空', ds.formatValue(null), '');
  eq('数字', ds.formatValue(558), '558');
  check('PNG BLOB → data: 地址', ds.formatValue(Buffer.from([0x89, 0x50, 0x4E, 0x47, 1, 2])).startsWith('data:image/png;base64,'));
  check('JPEG BLOB → data: 地址', ds.formatValue(Buffer.from([0xFF, 0xD8, 0xFF])).startsWith('data:image/jpeg;base64,'));
  eq('其他二进制给提示', ds.formatValue(Buffer.from([1, 2, 3])), '[二进制 3 字节]');
  ds.assertReadOnly('SELECT * FROM 商品 WHERE 单号 = 1');
  ds.assertReadOnly('  -- 注释\n /* 多行 */ with t as (select 1) select * from t;');
  check('SELECT / WITH 允许', true);
  throws('DELETE 被拒绝', () => ds.assertReadOnly('DELETE FROM t'), '只允许 SELECT');
  throws('多条语句被拒绝', () => ds.assertReadOnly('SELECT 1; DROP TABLE t'), '一次只能');
  eq('ODBC 值转义', ds.odbcVal('C:\\a;b}.mdb'), '{C:\\a;b}}.mdb}');

  // ---- .xlsx：测试内现场生成一个工作簿（共享字符串、内联字符串、数字、日期样式、空单元格） ----
  const XLSX = require(path.join(__dirname, '..', 'src', 'xlsx.js'));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="商品" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>品名</t></si><si><t>价格</t></si><si><t>生产日期</t></si><si><r><t>女</t></r><r><t>包 &amp; 鞋</t></r></si><si><t>条码</t></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy/mm/dd"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>4</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>558.1</v></c><c r="C2" s="1"><v>46315</v></c><c r="D2"><v>6925253841665</v></c></row>' +
      '<row r="4"><c r="A4" t="inlineStr"><is><t>男鞋</t></is></c><c r="C4" s="2"><v>46316.5</v></c><c r="D4" t="str"><v>0012</v></c></row>' +
      '</sheetData></worksheet>',
  };
  const zip = makeZip(files);
  const rows = await XLSX.readRows(zip);
  check('读出 2 条记录（跳过空行）', rows && rows.length === 2, JSON.stringify(rows));
  eq('共享字符串 + 富文本', rows[0]['品名'], '女包 & 鞋');
  eq('数字', rows[0]['价格'], '558.1');
  eq('内置日期格式 → YYYY-MM-DD', rows[0]['生产日期'], '2026-10-20');
  eq('长数字条码不变成科学计数', rows[0]['条码'], '6925253841665');
  eq('内联字符串', rows[1]['品名'], '男鞋');
  eq('缺失单元格为空', rows[1]['价格'], '');
  eq('自定义日期格式 + 时间', rows[1]['生产日期'], '2026-10-21 12:00');
  eq('文本型数字保留前导 0', rows[1]['条码'], '0012');
  eq('转制表符文本（回填数据框）', XLSX.toTSV([{ a: 'x\ty', b: '1' }]), 'a\tb\n"x\ty"\t1');
  let threw = false; try { await XLSX.readRows(Buffer.from('not a zip')); } catch (e) { threw = /xlsx/.test(e.message); }
  check('非 xlsx 文件给出明确错误', threw);
  done();
})();
