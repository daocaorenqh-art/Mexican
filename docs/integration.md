# 两条开发线合并进度

`claude/blissful-wright-35axkd`（另一会话）已合并进主线 `claude/amazing-wright-d20yfm`。

- **已直接合入**：`src/barcodes.js`、`src/textdata.js`、`src/job.js`、`src/zpl.js`、`src/xlsx.js`、`src/rawprint.js`（状态读取 / Windows RAW / 串口参数）、主进程与预加载（sandbox、禁止跳转、IPC 来源校验、`printer:status`、静默打印传页面尺寸）、`src/datasource.js`（本地时间日期、图片 BLOB、只读查询、Access 驱动提示）、全部单元测试、文档、示例。
- **界面（`index.html`）**：以主线为准（多选 / 数据库浏览 / 变量面板 / 艺术字 / 富文本 / ZPL 压缩等），对方界面层的功能逐项移植，每项带测试。下表未勾选的即尚未进入界面。

| # | 功能（来自另一会话） | 状态 |
|---|---|---|
| 1 | 向导字段名转义（XSS）、换图片进入撤消历史 | ☑ |
| 2 | 编码器改用 `src/barcodes.js`：EAN/UPC 校验位检查、DataMatrix 中文（ECI 26 + Base256） | ☑ |
| 3 | 新条码：GS1-128、GS1 DataMatrix、UPC-E、Code93、Codabar | ☑ |
| 4 | CSV：UTF-8 / GBK 自动识别、引号内换行、分号；直接导入 .xlsx | ☑ |
| 5 | 打印范围填反报错；数量字段；选择记录 | ☑ |
| 6 | 打印方式：标签机模式（@page = 标签尺寸）/ 整页模式（纸张、边距、起始位置）；静默打印传页面尺寸 | ☑（`claude/vibrant-hopper-b2muip`） |
| 7 | 打印前预检（编码失败、字段缺失、出界、静区、模块 < 1 点…），可跳过出错标签 | ☑（`claude/vibrant-hopper-b2muip`） |
| 8 | 变量 `{#SN}` `{#DATE+30:fmt}` `{#TIME}` `{#N}` `{#REC}` `{#COPY}`、打印时输入 `{?名}`、表达式函数；流水号命名 / 每条记录 / 每 N 张 / 进制；日期偏移 | ☑ |
| 9 | 文字适应宽度（自动缩小字号）；动态图片（字段 / 路径 / 数据库图片）、阈值 / 抖动 | ☐ |
| 10 | 打印机参数：浓度、速度、热敏 / 热转印、间隙 / 黑标 / 连续纸、出纸方式、偏移；相同标签合并 `^PQ` | ☐ |
| 11 | TSPL 指令（TSC / 佳博 / 芯烨） | ☐ |
| 12 | 直发：按打印机名 RAW、串口波特率、检测打印机（状态 / DPI 不符提示）、分批发送 / 取消 / 续打 | ☐ |
| 13 | 车间模式（只打印）、打印日志 | ☐ |
| 14 | 载入设计文件时校验 | ☑ |
| 15 | 对方的端到端测试 `tests/e2e-smoke.cjs`、`tests/e2e-electron.cjs` 在主线界面上跑通 | ☐ |
