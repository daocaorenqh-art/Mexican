// 交付验收的适配层：所有场景只通过这里操作界面，界面函数名变了只改这一个文件。
// 判定一律用独立工具：Zebrash（zpl-renderer-js）渲染 ZPL、zxing-cpp（zxing-wasm）扫码、自写 TSPL 解析。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
export const OUT = path.join(process.env.ACC_OUT || path.join(os.tmpdir(), 'label-acceptance'), 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const ZR = path.join(ROOT, 'tests', 'e2e', 'zebrash-render.cjs');
const { zxing } = require(path.join(ROOT, 'tests', 'helpers.cjs'));
export const ZPLmod = require(path.join(ROOT, 'src', 'zpl.js'));

/* ---------- 结果记录 ---------- */
export function recorder(area) {
  const items = [];
  const rec = (id, title, status, evidence = '') => {   // status: pass | fail | gap（界面尚未提供该功能）
    items.push({ area, id, title, status, evidence: String(evidence).slice(0, 400) });
    console.log(`  ${status === 'pass' ? '✓' : status === 'gap' ? '○' : '✗'} [${id}] ${title}${evidence ? '  — ' + String(evidence).slice(0, 200) : ''}`);
  };
  rec.check = (id, title, cond, evidence) => rec(id, title, cond ? 'pass' : 'fail', evidence);
  rec.gap = (id, title, why) => rec(id, title, 'gap', why);
  rec.items = items;
  rec.save = () => fs.writeFileSync(path.join(OUT, `result-${area}.json`), JSON.stringify(items, null, 1));
  return rec;
}

/* ---------- 打开应用 ---------- */
// 原生对话框：confirm 默认「确定」，prompt 默认留空；可用 page._dialogPlan 临时改为取消
export async function openApp(browser, opt = {}) {
  const page = await browser.newPage(Object.assign({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } }, opt));
  page._errors = []; page._dialogs = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  page.on('dialog', async (d) => {
    page._dialogs.push(d.type() + ':' + d.message());
    const plan = page._dialogPlan && page._dialogPlan.shift();
    if (plan === 'dismiss') await d.dismiss(); else await d.accept(plan && plan !== 'accept' ? plan : undefined);
  });
  await page.goto(APP);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#preview .label');
  return page;
}

/* ---------- 功能探测 ---------- */
export const has = (page, expr) => page.evaluate((e) => { try { return !!(0, eval)(e); } catch (x) { return false; } }, expr);
export const supportsType = (page, type) => page.evaluate((t) => typeof DEFAULTS !== 'undefined' && !!DEFAULTS[t], type);

/* ---------- 设计与数据 ---------- */
export async function loadDesign(page, design) {
  await page.evaluate((d) => loadDesign(JSON.parse(JSON.stringify(d))), design);
  await page.waitForTimeout(50);
}
export async function setCSV(page, text) {
  await page.evaluate((t) => { document.querySelector('#csv').value = t; document.querySelector('#applyCsv').click(); }, text);
  await page.waitForTimeout(50);
}
export async function importFile(page, file) {
  await page.setInputFiles('#fileIn', file);
  await page.waitForTimeout(400);
}
export const setField = (page, id, v) => page.evaluate(([id, v]) => { const e = document.getElementById(id); if (!e) return false;
  if (e.type === 'checkbox') e.checked = !!v; else e.value = String(v);
  e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [id, v]);
export const previewTexts = (page) => page.evaluate(() => [...document.querySelectorAll('#preview .label')].map((l) => l.innerText));
export const labelCount = (page) => page.locator('#preview .label:not(.slot)').count();

/* ---------- 弹窗（界面内的自定义对话框） ---------- */
// 处理导出 / 打印过程中出现的界面对话框：打印时变量、打印时输入、预检。choice：'ok' | 'skip' | 'cancel'
async function handleUiDialogs(page, choice, values, deadline) {
  const seen = [];
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const vis = (s) => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none' ? e : null; };
      const v = vis('#varDlg'), d = vis('#dlg');
      return { var: v ? (document.querySelector('#varDlgHd') || {}).textContent || '变量' : null,
        dlg: d ? ((document.querySelector('#dlgHd') || {}).textContent || '') + '｜' + ((document.querySelector('#dlgBody') || {}).innerText || '') : null };
    });
    if (st.var) { seen.push('变量：' + st.var);
      await page.evaluate((vals) => { document.querySelectorAll('#varDlgBody input,#varDlgBody select').forEach((el, i) => { if (vals && vals[i] != null) el.value = vals[i]; }); document.querySelector('#varDlgOk').click(); }, values || null);
      await page.waitForTimeout(100); continue; }
    if (st.dlg) { seen.push(st.dlg.slice(0, 300));
      await page.evaluate(([c, vals]) => {
        document.querySelectorAll('#dlgBody input[data-pk]').forEach((el, i) => { if (vals && vals[i] != null) el.value = vals[i]; });
        const btns = [...document.querySelectorAll('#dlgFt button')];
        const pick = c === 'cancel' ? btns.find((b) => /返回|取消/.test(b.textContent)) : c === 'skip' ? (btns.find((b) => /跳过/.test(b.textContent)) || btns.find((b) => b.classList.contains('primary'))) : btns.find((b) => b.classList.contains('primary'));
        (pick || btns[0]).click(); }, [choice, values || null]);
      await page.waitForTimeout(100); continue; }
    await page.waitForTimeout(100);
    if (seen.length && Date.now() > deadline - 100) break;
  }
  return seen;
}

/* ---------- 导出打印机指令 ---------- */
// lang：'zpl' | 'tspl'。返回 {data:Buffer|null, dialogs:[], gap?}
export async function exportCmd(page, { lang = 'zpl', choice = 'skip', values, timeout = 120000 } = {}) {
  if (lang === 'tspl') {
    const ok = await page.evaluate(() => { const s = document.querySelector('#zLang'); if (!s || ![...s.options].some((o) => o.value === 'tspl')) return false; s.value = 'tspl'; s.dispatchEvent(new Event('change')); return true; });
    if (!ok) return { data: null, dialogs: [], gap: '界面没有 TSPL 指令语言选项' };
  } else await page.evaluate(() => { const s = document.querySelector('#zLang'); if (s) { s.value = 'zpl'; s.dispatchEvent(new Event('change')); } });
  const dl = page.waitForEvent('download', { timeout }).catch(() => null);
  await page.evaluate(() => { const a = document.querySelector('#menubar [data-cmd="zpl"]'); if (a) a.click(); else exportZPL(); });
  const deadline = Date.now() + 3000;
  const dialogs = await handleUiDialogs(page, choice, values, deadline);
  const d = await Promise.race([dl, new Promise((r) => setTimeout(() => r(null), dialogs.length && choice === 'cancel' ? 1500 : timeout))]);
  if (!d) return { data: null, dialogs };
  return { data: fs.readFileSync(await d.path()), name: d.suggestedFilename(), dialogs };
}

/* ---------- 独立判定 ---------- */
let renderSeq = 0;
// 用 Zebrash 渲染 ZPL，返回 PNG 文件路径数组
export function renderZPL(zpl, wMM, hMM, dpi) {
  const tag = 'z' + (++renderSeq) + '-' + process.pid, f = OUT + tag + '.zpl';
  fs.writeFileSync(f, zpl);
  execFileSync('node', [ZR, f, OUT + tag, String(wMM), String(hMM), String(dpi >= 600 ? 24 : dpi >= 300 ? 12 : 8)], { stdio: 'pipe', timeout: 600000 });
  return fs.readdirSync(OUT).filter((x) => x.startsWith(tag + '-') && x.endsWith('.png')).sort((a, b) => parseInt(a.split('-').pop()) - parseInt(b.split('-').pop())).map((x) => OUT + x);
}
// ZPL 里一共会出几张（^PQ 合并计入）
export function zplLabelCount(zpl) {
  let n = 0; for (const blk of zpl.split('^XZ')) { if (!blk.includes('^XA')) continue; const m = blk.match(/\^PQ(\d+)/); n += m ? +m[1] : 1; } return n;
}
// 扫 PNG 文件（或 RGBA）里的全部条码；GS1 按人眼格式 (01)… 返回
export async function scanPNG(file, textMode = 'HRI') {
  const Z = await zxing();
  const r = await Z.readBarcodes(new Uint8Array(fs.readFileSync(file)), { formats: [], tryHarder: true, tryRotate: true, maxNumberOfSymbols: 12, textMode });
  return r.filter((x) => x.isValid).map((x) => ({ format: x.format, text: x.text }));
}
// TSPL：解析后把 BITMAP / BAR / BOX 还原成点阵 PNG（用浏览器画布编码）
export async function renderTSPL(page, bytes, wMM, hMM, dpi, invert = true) {
  const labs = ZPLmod.parseTSPL(new Uint8Array(bytes)), W = Math.round(wMM * dpi / 25.4), H = Math.round(hMM * dpi / 25.4), files = [];
  for (let i = 0; i < labs.length; i++) {
    const bm = ZPLmod.Bitmap(W, H), lab = labs[i];
    for (const b of lab.bitmaps) for (let y = 0; y < b.h; y++) for (let x = 0; x < b.bpr * 8; x++) {
      const v = b.bytes[y * b.bpr + (x >> 3)]; if ((((v >> (7 - (x & 7))) & 1) === (invert ? 0 : 1))) ZPLmod.setPx(bm, b.x + x, b.y + y); }
    for (const [x, y, w, h] of lab.bars) ZPLmod.fillRect(bm, x, y, w, h);
    const png = await page.evaluate(([w, h, bits]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const im = g.createImageData(w, h); for (let p = 0; p < w * h; p++) { const v = bits[p] ? 0 : 255; im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = v; im.data[p * 4 + 3] = 255; }
      g.putImageData(im, 0, 0); return c.toDataURL('image/png').split(',')[1]; },
      [W, H, Array.from({ length: W * H }, (_, p) => ZPLmod.getPx(bm, p % W, Math.floor(p / W)))]);
    const f = OUT + `tspl-${process.pid}-${++renderSeq}.png`; fs.writeFileSync(f, Buffer.from(png, 'base64')); files.push({ file: f, copies: lab.copies });
  }
  return files;
}
// 预览截图（放大 3 倍，近似 288dpi 屏幕采样）后扫码
export async function scanPreview(page, index = 0) {
  const loc = page.locator('#preview .label:not(.slot)').nth(index);
  const f = OUT + `preview-${process.pid}-${++renderSeq}.png`;
  await loc.screenshot({ path: f, scale: 'device' });
  return scanPNG(f);
}
