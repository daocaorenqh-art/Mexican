# 交接：本地开发 / 真机测试（v0.11 之后）

v0.12（分支 `claude/blissful-wright-35axkd`）已在云端完成，v0.12 新增 GS1 / UPC-E / Code93 / Codabar、TSPL、打印机状态、分批直发、USB 按名称直发、串口参数、数量字段、记录选择、打印日志、车间模式、文字适应宽度（见 CHANGELOG）。下面是只能在本地或真机上完成、以及尚未开始的工作。先读这三份文件：

- `docs/print-test-research.md`：完整评估清单，开头有「进度」表，标明已完成 / 未完成和证据级别。
- `CHANGELOG.md`：v0.11 改了什么。注意：居中 / 右对齐的文字现在以 x 为锚点，位置会变。
- `README.md`：内容语法、打印方式、ZPL 参数、代码结构。

## 现状

- 核心逻辑在 `src/barcodes.js`、`src/textdata.js`、`src/job.js`、`src/zpl.js`、`src/xlsx.js`。这些是普通脚本，浏览器里用 `<script src>`，Node 里用 `require`。Chrome 下 file:// 不能用 ES module，不要改成 import。
- 界面在 `index.html`；桌面版在 `main.js`、`preload.js`、`src/datasource.js`、`src/rawprint.js`。
- 测试：
  - `npm ci` 后跑 `npm test`，共 7 组，其中 ZPL 测试会把指令还原成打印点阵再用 zxing-cpp 扫码，含 90/180/270° 旋转；
  - `npm run test:e2e` 需要 Playwright；
  - 推送和 PR 由 `.github/workflows/test.yml` 自动测试。
- 已在云端验证：Electron 33 开 sandbox 启动正常；SQLite 查询正常（含图片 BLOB）。
- **没有任何真打印机验证过。**

## 1. 真机打印测试（最重要）

- **测试标签**，放在 `examples/test-labels/`：
  - 尺寸校准尺（10mm 刻度）；
  - 各码制的模块宽梯度 0.19–0.5mm；
  - 中文小字梯度 1.5–4mm；
  - QR / DM 尺寸梯度；
  - 0/90/180/270° 旋转；
  - 静区与贴边测试；
  - 浓度 × 速度矩阵。
- **测试矩阵**：
  - 机型：斑马 ZT410（203/300 dpi），以及 TSC、佳博、芯烨、A4 打印机；
  - 连接：TCP 9100、USB 共享、串口、驱动打印（标签机模式 / 整页模式）；
  - 介质：间隙纸、黑标纸；热敏、热转印。
- **重点核对**：
  - ZPL「精确位图」和「原生指令」两种模式下，条码宽度和位置与预览一致，尤其是 Code128 自动模式 `^BC…,A` 和 QR 的 `^FO` 偏移；
  - 位图 ASCII 压缩打印正常；
  - `^PQ` 合并生效，`~SD`、`^PR`、`^MT`、`^MN`、`^MM`、`^LT`、`^LS` 生效；
  - 中文 DataMatrix 用扫码枪和手机都能读出中文；
  - 驱动打印时每张一页、尺寸正确、不裁边。
- 能联网时用 Labelary（https://api.labelary.com）渲染导出的 ZPL，与预览对比。
- 用激光一维枪、二维影像枪、手机三类设备扫码，结果记入 `docs/print-test-matrix.md`。有条码检测仪时给出 ISO/IEC 15416/15415 等级，验收线 ≥ C。
- 发现问题就修，每个修复补一条回归测试。

## 2. 直打：已实现，需真机确认

以下功能云端已实现，并用模拟打印机和 Windows CI 测过，但都还没接过真打印机：
- **USB 按名称直发**（Windows 后台打印 RAW）：确认常见驱动（ZDesigner、TSC、佳博、芯烨）接受 RAW；个别 v4 / XPS 驱动不接受时，给出更明确的提示。
- **TSPL**：确认 BITMAP 位图的黑白方向（默认反色，打出黑块就关掉反色）、`DENSITY` / `SPEED` / `GAP` / `BLINE` / `SET PEEL` 生效，以及中文位图清晰。
- **打印机状态**：确认 `~HS` / `~HI` 各字段的位置与实际机型一致；确认 TSPL 的 `ESC !?` 状态字节含义。
- **串口**：确认 `mode COMn BAUD=…` 设置后 `copy /b` 能正常出纸。
- **还没做**：`~DG`/`^DF` 模板（只发送变量部分）；EPL / DPL / SBPL / CPCL。

## 3. LABEL MATRIX 标签导入（需要用户提供样例）

1. 请用户在 LABEL MATRIX 2024 里做一组 `.qdf` 样例：先存一个空白标签，之后每份只改一处（加文字、改坐标、改字号、换成 EAN-13、绑数据库字段、加流水号……），共约 15–20 个。
2. 逐字节对比这些文件，推出格式。
3. 写「导入 LABEL MATRIX 标签」功能，用这些样例做测试。

**只分析用户自己做出来的文件，不反编译 LABEL MATRIX 程序。** 它的商业许可禁止反编译，这样做也违背本项目原创实现的原则。REA（Reverse Engineer Anything）只用于分析用户自己的工具或设备协议。

## 4. 其余功能（详见进度表）

- **条码**：PDF417 / Aztec / MaxiCode（需要码字表，每个都要过独立解码器 CI）、ITF-14 保护框、EAN/UPC 附加码。
- **排版与模板**：E10 不干胶模板库；段落的最大行数和省略号。
- **打印流程**：流水号按日清零、多设计共用计数器；打印日志改存应用数据目录。
- **数据与安全**：F2 参数化查询；G2 内容安全策略（CSP）；G3 升级 Electron 大版本。
- **文件管理**：H5 自动保存改存应用数据目录；H6 另存为、最近文件。
- **编辑体验**：I1–I4。
- **性能**：上万张标签时预检较慢，需要优化。

## 约定

- 编码器全部自写，运行时不引入第三方依赖；每个编码器都要过独立解码器的 CI 校验。
- `index.html` 必须能直接双击打开运行。
- 界面和文档用中文。`npm test` 全部通过才提交；同步更新 CHANGELOG 和进度表。
- 结论注明证据级别：单测、浏览器、Electron、Labelary、真机。没做过的验证不要声称已经做过。
