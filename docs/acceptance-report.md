# 交付验收报告

- 版本：`6f217f4`　生成时间：2026-10-20 07:28 UTC
- 结果：**达标 77 / 80**；不达标 2；缺口（界面尚未提供）1
- 判定方法：界面实际操作 + 独立工具判定（Zebrash 渲染 ZPL 出纸、zxing-cpp 扫码、Chromium 打印 PDF、真实 SQLite、模拟网络标签机）
- 交付条件：不达标 = 0 且缺口 = 0；另附真机现场测试单（docs/handoff-local.md）

## 待解决

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ❌ | G-export-time | 1 万张生成 ZPL < 90 秒 | 241.3 秒，9.3MB |
| ❌ | desktop-run | 桌面版（Electron）验收未能运行 |  |
| ⬜ | D-serial-barcode | 流水号可放进条码（{#SN}） | 条码内容里的 {#SN} 未被替换：["SNSN0001","SNSN0002","SNSN0003"] |

## 网页端

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ✅ | A-barcode-preview | Code128：预览可扫回原文 | [{"format":"Code128","text":"FZ075885L-01110"}] |
| ✅ | A-barcode-zpl | Code128：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code128","text":"FZ075885L-01110"}] |
| ✅ | A-barcode-tspl | Code128：TSPL 出纸可扫回原文 | [{"format":"Code128","text":"FZ075885L-01110"}] |
| ✅ | A-ean13-preview | EAN-13：预览可扫回原文 | [{"format":"EAN13","text":"6925253841665"}] |
| ✅ | A-ean13-zpl | EAN-13：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN13","text":"6925253841665"}] |
| ✅ | A-ean13-tspl | EAN-13：TSPL 出纸可扫回原文 | [{"format":"EAN13","text":"6925253841665"}] |
| ✅ | A-ean8-preview | EAN-8：预览可扫回原文 | [{"format":"EAN8","text":"12345670"}] |
| ✅ | A-ean8-zpl | EAN-8：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN8","text":"12345670"}] |
| ✅ | A-ean8-tspl | EAN-8：TSPL 出纸可扫回原文 | [{"format":"EAN8","text":"12345670"}] |
| ✅ | A-upca-preview | UPC-A：预览可扫回原文 | [{"format":"EAN13","text":"0036000291452"}] |
| ✅ | A-upca-zpl | UPC-A：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN13","text":"0036000291452"}] |
| ✅ | A-upca-tspl | UPC-A：TSPL 出纸可扫回原文 | [{"format":"EAN13","text":"0036000291452"}] |
| ✅ | A-upce-preview | UPC-E：预览可扫回原文 | [{"format":"UPCE","text":"0012345000065"}] |
| ✅ | A-upce-zpl | UPC-E：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"UPCE","text":"0012345000065"}] |
| ✅ | A-upce-tspl | UPC-E：TSPL 出纸可扫回原文 | [{"format":"UPCE","text":"0012345000065"}] |
| ✅ | A-code39-preview | Code39：预览可扫回原文 | [{"format":"Code39","text":"SN-001"}] |
| ✅ | A-code39-zpl | Code39：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code39","text":"SN-001"}] |
| ✅ | A-code39-tspl | Code39：TSPL 出纸可扫回原文 | [{"format":"Code39","text":"SN-001"}] |
| ✅ | A-code93-preview | Code93：预览可扫回原文 | [{"format":"Code93","text":"CODE93-1"}] |
| ✅ | A-code93-zpl | Code93：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code93","text":"CODE93-1"}] |
| ✅ | A-code93-tspl | Code93：TSPL 出纸可扫回原文 | [{"format":"Code93","text":"CODE93-1"}] |
| ✅ | A-codabar-preview | Codabar：预览可扫回原文 | [{"format":"Codabar","text":"A40156B"}] |
| ✅ | A-codabar-zpl | Codabar：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Codabar","text":"A40156B"}] |
| ✅ | A-codabar-tspl | Codabar：TSPL 出纸可扫回原文 | [{"format":"Codabar","text":"A40156B"}] |
| ✅ | A-itf-preview | ITF-25：预览可扫回原文 | [{"format":"ITF","text":"1234567890"}] |
| ✅ | A-itf-zpl | ITF-25：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"ITF","text":"1234567890"}] |
| ✅ | A-itf-tspl | ITF-25：TSPL 出纸可扫回原文 | [{"format":"ITF","text":"1234567890"}] |
| ✅ | A-gs1128-preview | GS1-128：预览可扫回原文 | [{"format":"Code128","text":"(01)06925253841665(17)271231(10)B26"}] |
| ✅ | A-gs1128-zpl | GS1-128：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code128","text":"(01)06925253841665(17)271231(10)B26"}] |
| ✅ | A-gs1128-tspl | GS1-128：TSPL 出纸可扫回原文 | [{"format":"Code128","text":"(01)06925253841665(17)271231(10)B26"}] |
| ✅ | A-qrcode-preview | QR 中文：预览可扫回原文 | [{"format":"QRCode","text":"合格证 SN0001 品名：女包"}] |
| ✅ | A-qrcode-zpl | QR 中文：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"QRCode","text":"合格证 SN0001 品名：女包"}] |
| ✅ | A-qrcode-tspl | QR 中文：TSPL 出纸可扫回原文 | [{"format":"QRCode","text":"合格证 SN0001 品名：女包"}] |
| ✅ | A-datamatrix-preview | DataMatrix 中文：预览可扫回原文 | [{"format":"DataMatrix","text":"批号B26 合格证"}] |
| ✅ | A-datamatrix-zpl | DataMatrix 中文：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"DataMatrix","text":"批号B26 合格证"}] |
| ✅ | A-datamatrix-tspl | DataMatrix 中文：TSPL 出纸可扫回原文 | [{"format":"DataMatrix","text":"批号B26 合格证"}] |
| ✅ | A-gs1dm-preview | GS1 DataMatrix：预览可扫回原文 | [{"format":"DataMatrix","text":"(01)06925253841665(10)LOT7(21)SN01"}] |
| ✅ | A-gs1dm-zpl | GS1 DataMatrix：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"DataMatrix","text":"(01)06925253841665(10)LOT7(21)SN01"}] |
| ✅ | A-gs1dm-tspl | GS1 DataMatrix：TSPL 出纸可扫回原文 | [{"format":"DataMatrix","text":"(01)06925253841665(10)LOT7(21)SN01"}] |
| ✅ | A-rot90 | 旋转 90° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT90"}] |
| ✅ | A-rot180 | 旋转 180° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT180"}] |
| ✅ | A-rot270 | 旋转 270° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT270"}] |
| ✅ | A-noerror | 全程无脚本错误 |  |
| ✅ | B-ean-check | EAN 校验位错的记录不会打出（有提示） | 提示：有；出 2 张；扫到：6925253841665,6925253841672 |
| ✅ | B-range | 打印范围填反（3→1）时不出标签并提示 | 未导出 |
| ✅ | B-code128-cjk | Code128 无法编码的记录被拦下（不打错误文字） | 提示：打印前预检｜1 张标签有错误，直接打印会出错误内容或扫不出的码：  ✗ 第 1 张 · #1 Code128：Code128 仅支持 ASCII 32-126；出 1 张 |
| ✅ | C-cjk-field | 中文 / 带空格字段名可插值 | 品名：女包 558 |
| ✅ | C-gbk | 中文版 Excel 另存的 GBK CSV 不乱码 | 品名,SKU 雨伞,A1  |
| ✅ | C-newline | 引号内换行的 CSV 解析为 1 条 | 1 张 |
| ✅ | C-xlsx | 直接导入 .xlsx | 品名：台灯 99 |
| ⬜ | D-serial-barcode | 流水号可放进条码（{#SN}） | 条码内容里的 {#SN} 未被替换：["SNSN0001","SNSN0002","SNSN0003"] |
| ✅ | D-cancel | 未确认打印成功时流水号不前进 | 7 → 7 |
| ✅ | D-persist | 关闭重开后流水号起始值保持 | 7 → 7 |
| ✅ | E-pages | 标签机模式：5 张标签 = 5 页 | 5 页 |
| ✅ | E-pagesize | 标签机模式：页面尺寸 = 标签尺寸 60×40mm | MediaBox 169.9×113.0pt，应为 170.1×113.4 |
| ✅ | E-sheet | 整页模式：A4 页面、前 2 个位置留空 | MediaBox 594.95996×841.91998；留空 2 |
| ✅ | F-qty | 数量字段（每条打几张）：界面已提供 |  |
| ✅ | F-pick | 选择记录打印：界面已提供 |  |
| ✅ | F-preflight | 打印前预检：界面已提供 |  |
| ✅ | F-log | 打印日志：界面已提供 |  |
| ✅ | F-shop | 车间模式（只打印）：界面已提供 |  |
| ✅ | F-tspl | TSPL 指令（国产标签机）：界面已提供 |  |
| ✅ | F-status | 检测打印机（状态 / DPI）：界面已提供 |  |
| ✅ | F-batch | 分批直发 / 续打：界面已提供 |  |
| ✅ | F-sheet | 整页模式（A4 不干胶、起始位置）：界面已提供 |  |
| ✅ | F-fit | 文字适应宽度：界面已提供 |  |
| ✅ | F-qty-out | 数量字段：A×2 + C×3 = 5 张 | 5 张 |
| ✅ | I-defaults | 全部 22 种元素的默认值都能正常渲染 | text,rich,wordart,para,barcode,ean13,ean8,upca,code39,itf,qrcode,datamatrix,gs1dm,gs1128,upce,code93,codabar,counter,date,image,box,ellipse |
| ✅ | I-roundtrip | 保存设计 → 载入后所有元素字段原样 | 22/22 个；差异 0： |
| ✅ | I-undo | 撤消 / 重做 | [5,1,5] |
| ✅ | I-autosave | 意外关闭后重开，设计自动恢复 |  |
| ✅ | I-badautosave | 自动保存损坏时仍能正常启动 |  |
| ✅ | I-baddesign | 载入损坏的设计文件：提示错误、原设计不丢 | alert:读取失败: Expected ',' or '}' after property value in JSON at position 19 (line 1 column 20) |
| ✅ | G-import | 导入并预览 1 万条 < 5 秒 | 0.7 秒 |
| ✅ | G-export-count | 1 万张生成 ZPL 张数正确 | 10000 张 |
| ❌ | G-export-time | 1 万张生成 ZPL < 90 秒 | 241.3 秒，9.3MB |
| ✅ | G-sample-0 | 抽查第 1 张：Code128 / EAN-13 / QR 都正确 | SKU00001\|6920000000012,SKU00001,6920000000012 |
| ✅ | G-sample-9999 | 抽查第 10000 张：Code128 / EAN-13 / QR 都正确 | SKU10000\|6920000100002,SKU10000,6920000100002 |
| ✅ | G-noerror | 大批量全程无脚本错误 |  |

## 桌面版（Electron）

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ❌ | desktop-run | 桌面版（Electron）验收未能运行 |  |

