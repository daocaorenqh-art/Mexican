/* 内容求值 / 变量 / 日期 / 表达式函数 / CSV 解析 / 编码识别 单元测试。运行：npm test */
const path = require('path');
const T = require(path.join(__dirname, '..', 'src', 'textdata.js'));
const { check, eq, done } = require('./helpers.cjs').suite('内容与数据解析');

const row = { '品名': '女包', 'SKU': 'A1', 'unit price': '9', 'JYPRICE': '558', 'MFG': '2026-01-31' };
const now = new Date(2026, 9, 20, 8, 5, 9); // 2026-10-20 08:05:09（本地时间）
const ctx = (extra) => T.makeCtx(Object.assign({ row, now, vars: { SN: '0007' }, prompts: { '批号': 'B26' }, n: 3, rec: 2, copy: 1 }, extra));

// 插值：中文、空格、表前缀、大小写回退
eq('{中文字段}', T.evalContent('品名：{品名}', row), '品名：女包');
eq('{带空格字段}', T.evalContent('{unit price}', row), '9');
eq('{表.字段}', T.evalContent('{goods.SKU}', row), 'A1');
eq('字段名不区分大小写回退', T.evalContent('{sku}', row), 'A1');
eq('未加载数据时显示占位', T.evalContent('{品名}', null), '[品名]');
{ const c = ctx(); eq('未知字段为空', T.evalContent('{SKUU}', c), ''); check('未知字段被记录', c.missing.has('SKUU')); }
eq('旧表达式写法兼容', T.evalContent('="零售价："+[JYPRICE]+".00"', row), '零售价：558.00');
eq('表达式里的中文字段', T.evalContent('=[品名]', row), '女包');

// 变量
eq('{#SN}', T.evalContent('SN{#SN}', ctx()), 'SN0007');
eq('{#DATE}', T.evalContent('{#DATE}', ctx()), '2026-10-20');
eq('{#DATE:格式}', T.evalContent('{#DATE:YYYYMMDD}', ctx()), '20261020');
eq('{#DATE+30}', T.evalContent('{#DATE+30:YYYY-MM-DD}', ctx()), '2026-11-19');
eq('{#DATE+6M} 月偏移', T.evalContent('{#DATE+6M:YYYY-MM-DD}', ctx()), '2027-04-20');
eq('{#DATE-1}', T.evalContent('{#DATE-1:MM/DD}', ctx()), '10/19');
eq('{#TIME}', T.evalContent('{#TIME}', ctx()), '08:05:09');
eq('{#N}{#REC}{#COPY}', T.evalContent('{#N}-{#REC}-{#COPY}', ctx()), '3-2-1');
eq('{?打印时输入}', T.evalContent('批号{?批号}', ctx()), '批号B26');
eq('表达式里的变量', T.evalContent('=[SKU]+"-"+[#SN]', ctx()), 'A1-0007');
check('promptNames', JSON.stringify(T.promptNames('{?批号}/{?班组}')) === '["批号","班组"]');

// 日期函数
eq('fmtDate 全部格式符', T.fmtDate(now, 'YY年MM月DD日 HH:mm:ss JJJ WW'), '26年10月20日 08:05:09 293 43');
eq('月末偏移取月末', T.fmtDate(T.addDate(new Date(2026, 0, 31), 1, 'm'), 'YYYY-MM-DD'), '2026-02-28');
eq('按年偏移', T.fmtDate(T.addDate(new Date(2024, 1, 29), 1, 'y'), 'YYYY-MM-DD'), '2025-02-28');
eq('adddate 保质期', T.evalContent('=adddate([MFG],18,"m","YYYY-MM-DD")', row), '2027-07-31');
eq('date() 今天偏移', T.evalContent('=date("YYYYMMDD",7)', ctx()), '20261027');
eq('fmtdate', T.evalContent('=fmtdate("20260105","YYYY/MM/DD")', row), '2026/01/05');
eq('today', T.evalContent('=today("YY")', ctx()), '26');

// 表达式函数
const E = (s) => T.evalContent('=' + s, ctx());
eq('add 数字相加（+ 仍是拼接）', E('add([unit price],1)'), '10');
eq('+ 拼接保持兼容', E('[unit price]+1'), '91');
eq('mul / fixed', E('fixed(mul([JYPRICE],0.8),2)'), '446.40');
eq('div / round', E('round(div(10,3),2)'), '3.33');
eq('sub', E('sub(10,2.5,0.5)'), '7');
eq('浮点不出现 0.30000000000000004', E('add(0.1,0.2)'), '0.3');
eq('if / gt', E('if(gt([JYPRICE],500),"高价","普通")'), '高价');
eq('if / eq 字符串', E('if(eq([SKU],"A1"),"是","否")'), '是');
eq('and / or / not / empty', E('concat(and(1,1),or(0,0),not(0),empty(""))'), '1011');
eq('padl / padr', E('padl(7,4)+"|"+padr("A",3,"*")'), '0007|A**');
eq('replace / len', E('replace("a-b-c","-","")+len("中文")'), 'abc2');
eq('mod10 GS1 校验位', E('mod10("692525384166")'), '5');
eq('mod43', E('mod43("CODE39")'), 'W');
eq('字符串转义', E('"他说\\"好\\""'), '他说"好"');
eq('负数', E('add(5,-2)'), '3');
check('非数字参与计算报错', E('add("abc",1)').startsWith('⚠'));
check('除以 0 报错', E('div(1,0)').startsWith('⚠'));
check('未知函数报错', E('foo(1)').startsWith('⚠'));
check('缺右括号报错', E('left("abc",1').startsWith('⚠'));
{ const c = ctx(); T.evalContent('=add("x",1)', c); check('表达式错误被记录到 ctx.errors', c.errors && c.errors.length === 1); }

// CSV
let r = T.parseData('a,b\n"line1\nline2",x\n');
check('引号内换行', r && r.length === 1 && r[0].a === 'line1\nline2' && r[0].b === 'x', JSON.stringify(r));
r = T.parseData('﻿name;price\r\n苹果;3,50\r\n');
check('分号分隔 + BOM + CRLF', r && r[0].name === '苹果' && r[0].price === '3,50', JSON.stringify(r));
r = T.parseData('a\tb\n1\t"x ""y"""\n\n2\t\n');
check('Tab 分隔、"" 转义、空行跳过、缺列补空', r && r.length === 2 && r[0].b === 'x "y"' && r[1].b === '', JSON.stringify(r));
r = T.parseData(' 品名 ,,价格\n女包, ,558');
check('表头去空格、空表头自动命名', r && '品名' in r[0] && '列2' in r[0] && r[0]['价格'] === '558', JSON.stringify(r));
check('只有表头返回 null', T.parseData('a,b\n') === null);

// 编码识别
eq('UTF-8', T.decodeText(Buffer.from('品名,价格', 'utf8')), '品名,价格');
eq('UTF-8 BOM', T.decodeText(Buffer.from('﻿品名', 'utf8')), '品名');
eq('GBK（中文版 Excel 另存为 CSV）', T.decodeText(Buffer.from('c6b7c3fb2cbcdbb8f1', 'hex')), '品名,价格');

// 设计里定义的变量（ctx.defs）：数据字段优先；无数据时直接取变量值；都没有时无数据显示 [名]、有数据记缺失
{
  const defs = { '批号': 'B26', '品名': '不应使用' };
  eq('变量：无数据时取变量值', T.evalContent('{批号}', T.makeCtx({ defs })), 'B26');
  eq('变量：数据里有同名字段时以数据为准', T.evalContent('{品名}', T.makeCtx({ row, defs })), '女包');
  eq('变量：数据里没有该字段时用变量', T.evalContent('{批号}/{SKU}', T.makeCtx({ row, defs })), 'B26/A1');
  eq('变量：表达式里同样可用', T.evalContent('=[批号]+"-"+left([品名],1)', T.makeCtx({ row, defs })), 'B26-女');
  eq('变量：未定义且无数据显示占位', T.evalContent('{颜色}', T.makeCtx({ defs })), '[颜色]');
  const c = T.makeCtx({ row, defs }); T.evalContent('{颜色}', c);
  check('变量：未定义且有数据记为缺失', c.missing.has('颜色'));
}
done();
