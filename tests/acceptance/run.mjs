// 交付验收总入口：依次跑网页端与桌面版验收，汇总成 docs/acceptance-report.md。
// 用法：node tests/acceptance/run.mjs        （Linux 无桌面：xvfb-run -a node tests/acceptance/run.mjs）
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { ROOT, OUT } from './_app.mjs';

const here = path.join(ROOT, 'tests', 'acceptance');
const runs = [['web', '网页端'], ['desktop', '桌面版（Electron）']];
for (const [f] of runs) {
  try { fs.unlinkSync(path.join(OUT, `result-${f}.json`)); } catch (e) {}
  const r = spawnSync(process.execPath, [path.join(here, f + '.mjs')], { stdio: 'inherit', timeout: 3600000 });
  if (r.status === null) console.log(`${f} 超时或被终止`);
}
const all = runs.flatMap(([f, name]) => { try { return JSON.parse(fs.readFileSync(path.join(OUT, `result-${f}.json`), 'utf8')).map((x) => ({ ...x, part: name })); } catch (e) { return [{ part: name, id: f + '-run', title: name + '验收未能运行', status: 'fail', evidence: '' }]; } });
const pass = all.filter((x) => x.status === 'pass').length, fail = all.filter((x) => x.status === 'fail'), gap = all.filter((x) => x.status === 'gap');
let commit = ''; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (e) {}
const icon = { pass: '✅', fail: '❌', gap: '⬜' };
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# 交付验收报告\n\n- 版本：\`${commit}\`　生成时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC\n`
  + `- 结果：**达标 ${pass} / ${all.length}**；不达标 ${fail.length}；缺口（界面尚未提供）${gap.length}\n`
  + `- 判定方法：界面实际操作 + 独立工具判定（Zebrash 渲染 ZPL 出纸、zxing-cpp 扫码、Chromium 打印 PDF、真实 SQLite、模拟网络标签机）\n`
  + `- 交付条件：不达标 = 0 且缺口 = 0；另附真机现场测试单（docs/handoff-local.md）\n\n`;
if (fail.length || gap.length) md += `## 待解决\n\n| 状态 | 编号 | 项目 | 证据 |\n|---|---|---|---|\n` + [...fail, ...gap].map((x) => `| ${icon[x.status]} | ${x.id} | ${esc(x.title)} | ${esc(x.evidence)} |`).join('\n') + '\n\n';
for (const [, name] of runs) {
  md += `## ${name}\n\n| 状态 | 编号 | 项目 | 证据 |\n|---|---|---|---|\n` + all.filter((x) => x.part === name).map((x) => `| ${icon[x.status]} | ${x.id} | ${esc(x.title)} | ${esc(x.evidence)} |`).join('\n') + '\n\n';
}
fs.writeFileSync(path.join(ROOT, 'docs', 'acceptance-report.md'), md);
console.log(`\n==== 交付验收：达标 ${pass} / ${all.length}，不达标 ${fail.length}，缺口 ${gap.length} → docs/acceptance-report.md ====`);
process.exit(fail.length || gap.length ? 1 : 0);
