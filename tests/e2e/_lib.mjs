// 界面/打印端到端测试的公共路径：S=临时工作目录（产物写在 S/out），ROOT=仓库根，APP=要测的 index.html
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const APP = pathToFileURL(path.join(ROOT, 'index.html')).href;
export const S = (process.env.E2E_OUT || path.join(os.tmpdir(), 'label-e2e')) + '/';
export const OUT = S + 'out/';
export const ZR = path.join(here, 'zebrash-render.cjs');   // 独立 ZPL 渲染器（模拟斑马机出纸）
export const FIX = path.join(here, 'fixtures') + '/';
fs.mkdirSync(OUT, { recursive: true });
