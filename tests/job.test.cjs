/* 打印作业：范围 / 份数 / 跳过、流水号、变量、打印前预检 单元测试。运行：npm test */
const path = require('path');
const Job = require(path.join(__dirname, '..', 'src', 'job.js'));
const { check, eq, done } = require('./helpers.cjs').suite('打印作业与预检');

const rows = [1, 2, 3, 4, 5].map(i => ({ SKU: 'A' + i, EAN: i === 3 ? '6925253841660' : '6925253841665' }));

// 范围 / 份数
let L = Job.makePrintList(rows, 2, 3, 2);
eq('范围 2–3 × 2 份 = 4 张', L.length, 4);
check('每项带记录号 / 份号 / 序号', L[3].rec === 3 && L[3].copy === 2 && L[3].idx === 3 && L[3].recPos === 1, JSON.stringify(L[3]));
L = Job.makePrintList(rows, 5, 3, 1);
check('范围填反：不出标签并给出原因（不再悄悄打第 1 条）', L.length === 0 && /范围有误/.test(L.error), L.error);
L = Job.makePrintList(rows, 9, 0, 1);
check('起始超出条数：报错', L.length === 0 && /超出/.test(L.error));
eq('到第 0 条 = 到最后', Job.makePrintList(rows, 1, 0, 1).length, 5);
eq('无数据时 1 张', Job.makePrintList(null, 1, 0, 3).length, 3);
L = Job.makePrintList(rows, 1, 0, 1, new Set([2]));
check('跳过出错标签后序号保持不变', L.length === 4 && L[2].idx === 3);

// 记录选择 / 数量字段
const qrows = [{ SKU: 'A', QTY: '2' }, { SKU: 'B', QTY: '0' }, { SKU: 'C', QTY: 'x' }, { SKU: 'D', QTY: '3' }];
L = Job.makePrintList(qrows, 1, 0, 1, null, { qtyField: 'QTY' });
eq('数量字段：A×2 + D×3，0 和非数字不打', L.map(e => e.row.SKU).join(''), 'AADDD');
check('数量字段：同一记录的份号 / 记录序号', L[4].copy === 3 && L[4].recPos === 1 && L[4].rec === 4, JSON.stringify(L[4]));
eq('数量字段 × 每条份数', Job.makePrintList(qrows, 1, 0, 2, null, { qtyField: 'QTY' }).length, 10);
L = Job.makePrintList(qrows, 1, 0, 1, null, { selected: new Set([1, 3]) });
eq('只打选中的记录', L.map(e => e.row.SKU).join(''), 'BD');
eq('选中记录的序号连续', L.map(e => e.recPos).join(','), '0,1');
L = Job.makePrintList(qrows, 1, 0, 1, null, { selected: new Set() });
check('一条都没选：给出原因', L.length === 0 && /没有选中/.test(L.error));
L = Job.makePrintList(qrows, 2, 3, 1, null, { qtyField: 'QTY' });
check('范围内数量都无效：给出原因', L.length === 0 && /数量字段/.test(L.error), L.error);
// 文字适应宽度
eq('未超宽不缩小', Job.effectiveSize({ size: 4, fitW: 50 }, 'AB'), 4);
check('超宽按比例缩小', Math.abs(Job.effectiveSize({ size: 4, fitW: 10 }, '中文中文中文') - 10 / 24 * 4) < 1e-9);
eq('不小于最小字号', Job.effectiveSize({ size: 4, fitW: 1, minSize: 2 }, '很长很长很长的内容'), 2);
const fitR = Job.preflight({ elements: [{ type: 'text', x: 1, y: 1, size: 5, fitW: 40, content: '这是一段非常非常非常长的商品名称文字' }], list: Job.makePrintList(null, 1, 0, 1), label: { w: 50, h: 30, dpi: 203 }, now: new Date() });
check('适应宽度后不再报超出标签', !fitR.warnings.length, JSON.stringify(fitR.warnings.map(w => w.msg)));

// 流水号
const c = { type: 'counter', start: 1, step: 1, pad: 4, prefix: 'SN', suffix: '' };
L = Job.makePrintList(rows, 1, 2, 2);
eq('每张递增', L.map(e => Job.counterText(c, e)).join(','), 'SN0001,SN0002,SN0003,SN0004');
eq('每条记录递增（多份同号）', L.map(e => Job.counterText({ ...c, per: 'record' }, e)).join(','), 'SN0001,SN0001,SN0002,SN0002');
eq('每 3 张递增', Job.makePrintList(null, 1, 0, 7).map(e => Job.counterText({ ...c, every: 3, prefix: '' }, e)).join(','), '0001,0001,0001,0002,0002,0002,0003');
eq('十六进制', Job.counterText({ start: 255, step: 1, pad: 4, radix: '16' }, { idx: 1, recPos: 0 }), '0100');
eq('36 进制', Job.counterText({ start: 35, step: 1, radix: '36' }, { idx: 0, recPos: 0 }), 'Z');
eq('步进 10', Job.counterText({ start: 100, step: 10 }, { idx: 3, recPos: 0 }), '130');
eq('续号：每张递增前进 4', Job.counterAdvance(c, L), 4);
eq('续号：每条记录递增前进 2', Job.counterAdvance({ ...c, per: 'record' }, L), 2);
eq('续号：每 3 张递增，7 张后前进 3', Job.counterAdvance({ ...c, every: 3 }, Job.makePrintList(null, 1, 0, 7)), 3);

// 变量：流水号可在条码 / 二维码里引用
const els = [{ type: 'counter', name: 'SN', start: 1, step: 1, pad: 3 }, { type: 'qrcode', content: '{SKU}-{#SN}' },
  { type: 'date', format: 'YYYYMMDD', offset: 30 }];
const now = new Date(2026, 9, 20);
L = Job.makePrintList(rows, 1, 2, 1);
const ctx = Job.labelCtx(els, L[1], { now });
eq('二维码内容引用流水号', Job.elementText(els[1], ctx, L[1]), 'A2-002');
eq('日期元素偏移', Job.elementText(els[2], ctx, L[1]), '20261119');
eq('打印时输入项收集', Job.promptsUsed([{ content: '{?批号}' }, { content: '=[?班组]+"x"' }, { type: 'box' }]).join(','), '批号,班组');

// 预检
const label = { w: 60, h: 40, dpi: 203 };
const design = [
  { type: 'ean13', x: 6, y: 2, h: 10, module: 0.33, showText: true, content: '{EAN}' },
  { type: 'text', x: 2, y: 30, size: 3, content: '{SKUX}' },
  { type: 'barcode', x: 1, y: 15, h: 8, module: 0.5, showText: false, content: '{SKU}0000000000000' },
  { type: 'qrcode', x: 50, y: 30, size: 12, ecl: 'M', content: '{SKU}' },
];
L = Job.makePrintList(rows, 1, 0, 1);
const r = Job.preflight({ elements: design, list: L, label, now });
const E = Job.groupIssues(r.errors, 'error'), W = Job.groupIssues(r.warnings, 'warn');
check('错校验位的记录被标为错误', E.some(g => g.ei === 0 && /校验位/.test(g.msg) && g.labels.join() === '3'), JSON.stringify(E.map(g => g.msg)));
check('未知字段被标为错误', E.some(g => g.ei === 1 && /SKUX/.test(g.msg) && g.labels.length === 5));
check('超出标签被警告', W.some(g => g.ei === 3 && /超出标签/.test(g.msg)));
check('一维码静区不足被警告', W.some(g => g.ei === 2 && /静区/.test(g.msg)));
check('二维码静区不足被警告', W.some(g => g.ei === 3 && /静区/.test(g.msg)));
check('EAN 模块宽在 GS1 范围内不警告', !W.some(g => g.ei === 0 && /GS1/.test(g.msg)));
const r2 = Job.preflight({ elements: [{ type: 'ean13', x: 6, y: 2, h: 10, module: 0.2, content: '6925253841665' }], list: Job.makePrintList(null, 1, 0, 1), label, now });
check('EAN 模块宽过小被警告', r2.warnings.some(w => /GS1/.test(w.msg)));
const r3 = Job.preflight({ elements: [{ type: 'text', x: 1, y: 1, size: 3, content: '=add("x",1)' }], list: Job.makePrintList(null, 1, 0, 1), label, now });
check('表达式错误被标为错误', r3.errors.some(e => /表达式错误/.test(e.msg)));
const r4 = Job.preflight({ elements: [{ type: 'text', x: 1, y: 1, size: 3, content: '{?批号}' }], list: Job.makePrintList(null, 1, 0, 1), label, now, prompts: {} });
check('打印时输入未填被标为错误', r4.errors.some(e => /批号/.test(e.msg)));
const ok = Job.preflight({ elements: [{ type: 'text', x: 2, y: 2, size: 3, content: '{SKU}' }], list: L, label, now });
check('正常设计无问题', !ok.errors.length && !ok.warnings.length, JSON.stringify(ok));
const ov = Job.preflight({ elements: [{ type: 'barcode', x: 5, y: 5, h: 10, module: 0.25, content: 'ABC123' }, { type: 'text', x: 8, y: 8, size: 3, content: 'X' },
  { type: 'box', x: 1, y: 1, w: 58, h: 38, border: 0.3 }], list: Job.makePrintList(null, 1, 0, 1), label, now });
check('条码被文字压住被警告（外框线不算）', ov.warnings.filter(w => /重叠/.test(w.msg)).length === 1 && ov.warnings.some(w => /#2/.test(w.msg)), JSON.stringify(ov.warnings.map(w => w.msg)));
// 旋转后的外框
const bx = Job.rotatedBox(10, 10, 20, 5, 90);
check('旋转 90° 外框（绕左上角顺时针）', Math.abs(bx.x0 - 5) < 1e-9 && Math.abs(bx.x1 - 10) < 1e-9 && Math.abs(bx.y1 - 30) < 1e-9, JSON.stringify(bx));
eq('图片路径转 file 地址', Job.imageSrc({}, 'C:\\img\\a.png'), 'file:///C:/img/a.png');
eq('网址图片不加载（离线）', Job.imageSrc({ src: '' }, 'https://example.com/a.png'), '');
eq('data: 图片照常', Job.imageSrc({}, 'data:image/png;base64,AA'), 'data:image/png;base64,AA');

// 预检：界面提供的尺寸（sizeOf）优先于通用估算
{
  const els = [{ type: 'rich', x: 5, y: 5, w: 10, content: 'x' }];
  const L1 = Job.makePrintList(null, 1, 0, 1);
  const big = Job.preflight({ elements: els, list: L1, label: { w: 30, h: 20, dpi: 203 }, sizeOf: () => ({ w: 40, h: 5 }) });
  check('sizeOf 给出的宽度超出标签 → 警告', big.warnings.some(w => w.msg.includes('超出标签')));
  const fit = Job.preflight({ elements: els, list: L1, label: { w: 30, h: 20, dpi: 203 }, sizeOf: () => ({ w: 10, h: 5 }) });
  check('sizeOf 给出的尺寸在标签内 → 无警告', !fit.warnings.length && !fit.errors.length);
}
// 流水号按周期归零
{
  const d1 = new Date(2026, 9, 20, 23, 59), d2 = new Date(2026, 9, 21, 8, 0), m2 = new Date(2026, 10, 1, 8, 0);
  eq('周期键：每天', Job.periodKey('day', d1), '2026-10-20');
  eq('周期键：每月', Job.periodKey('month', d1), '2026-10');
  eq('周期键：每年', Job.periodKey('year', d1), '2026');
  eq('周期键：不归零', Job.periodKey('', d1), '');
  const c = { type: 'counter', start: 57, step: 1, pad: 3, reset: 'day', resetStart: 1, period: '2026-10-20' };
  const e0 = Job.makePrintList(null, 1, 0, 1)[0];
  eq('同一天：接着上次的号', Job.counterText(c, e0, d1), '057');
  eq('第二天：从 1 重新编号', Job.counterText(c, e0, d2), '001');
  eq('归零起点可设（从 0 开始）', Job.counterText({ ...c, resetStart: 0 }, e0, d2), '000');
  const L3 = Job.makePrintList(null, 1, 0, 3);
  const r1 = Job.advanceCounter(c, L3, d2);
  check('第二天打 3 张后：起始 4、周期记为当天', r1.start === 4 && r1.period === '2026-10-21', JSON.stringify(r1));
  const r2 = Job.advanceCounter(c, L3, d1);
  check('同一天打 3 张后：起始 60', r2.start === 60 && r2.period === '2026-10-20', JSON.stringify(r2));
  eq('每月归零：同月第二天不归零', Job.counterText({ ...c, reset: 'month', period: '2026-10' }, e0, d2), '057');
  eq('每月归零：下个月归零', Job.counterText({ ...c, reset: 'month', period: '2026-10' }, e0, m2), '001');
  eq('从未打印过（无周期记录）→ 用起始值', Job.counterText({ ...c, period: undefined }, e0, d2), '057');
  const nr = Job.advanceCounter({ ...c, reset: '' }, L3, d2);
  check('不归零：照常顺延、不记周期', nr.start === 60 && nr.period === undefined, JSON.stringify(nr));
  const ctx = Job.labelCtx([{ ...c, name: 'SN' }], e0, { now: d2 });
  eq('labelCtx 的 {#SN} 也按作业时间归零', ctx.vars ? ctx.vars.SN : Job.elementText({ type: 'text', content: '{#SN}' }, ctx), '001');
}
done();
