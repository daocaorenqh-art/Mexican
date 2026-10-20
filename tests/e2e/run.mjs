// 依次运行全部端到端测试；任一测试退出码非 0 或输出含 ✗ 即判失败。
// 用法：node tests/e2e/run.mjs [测试名…]   （不带参数跑全部）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = fs.readdirSync(here).filter(f => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run.mjs')
  .filter(f => !only.length || only.some(o => f.startsWith(o))).sort();
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(here, f)], { encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = out.split('\n').filter(l => l.includes('✗'));
  const ok = r.status === 0 && !bad.length;
  const summary = (out.match(/^==== .*====$/m) || [''])[0];
  results.push({ f, ok, ms: Date.now() - t0 });
  console.log(`${ok ? '✓' : '✗'} ${f.padEnd(20)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${summary}`);
  if (!ok) console.log(out.split('\n').map(l => '    │ ' + l).join('\n'));
}
const failed = results.filter(r => !r.ok);
console.log(`\n端到端测试：${results.length - failed.length} / ${results.length} 个通过` + (failed.length ? '；失败：' + failed.map(r => r.f).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
