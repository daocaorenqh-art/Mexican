# 交付验收报告

- 版本：`96f08e7`　生成时间：2026-10-20 06:40 UTC
- 结果：**达标 55 / 82**；不达标 5；缺口（界面尚未提供）22
- 判定方法：界面实际操作 + 独立工具判定（Zebrash 渲染 ZPL 出纸、zxing-cpp 扫码、Chromium 打印 PDF、真实 SQLite、模拟网络标签机）
- 交付条件：不达标 = 0 且缺口 = 0；另附真机现场测试单（docs/handoff-local.md）

## 待解决

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ❌ | B-ean-check | EAN 校验位错的记录不会打出（有提示） | 提示：无；出 3 张；扫到：6925253841665,6925253841672 |
| ❌ | B-code128-cjk | Code128 无法编码的记录被拦下（不打错误文字） | 提示：；出 2 张 |
| ❌ | E-pages | 标签机模式：5 张标签 = 5 页 | 1 页 |
| ❌ | E-pagesize | 标签机模式：页面尺寸 = 标签尺寸 60×40mm | MediaBox 612.0×792.0pt，应为 170.1×113.4 |
| ❌ | G-export-time | 1 万张生成 ZPL < 90 秒 | 166.2 秒，9.2MB |
| ⬜ | A-barcode-tspl | Code128：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-ean13-tspl | EAN-13：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-ean8-tspl | EAN-8：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-upca-tspl | UPC-A：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-upce-tspl | UPC-E：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-code39-tspl | Code39：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-code93-tspl | Code93：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-codabar-tspl | Codabar：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-itf-tspl | ITF-25：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-gs1128-tspl | GS1-128：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-qrcode-tspl | QR 中文：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-datamatrix-tspl | DataMatrix 中文：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | A-gs1dm-tspl | GS1 DataMatrix：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ⬜ | D-serial-barcode | 流水号可放进条码（{#SN}） | 条码内容里的 {#SN} 未被替换：["SNSN0001","SNSN0002","SNSN0003"] |
| ⬜ | F-log | 打印日志 | 界面尚未提供 |
| ⬜ | F-shop | 车间模式（只打印） | 界面尚未提供 |
| ⬜ | F-tspl | TSPL 指令（国产标签机） | 界面尚未提供 |
| ⬜ | F-status | 检测打印机（状态 / DPI） | 界面尚未提供 |
| ⬜ | F-batch | 分批直发 / 续打 | 界面尚未提供 |
| ⬜ | F-sheet | 整页模式（A4 不干胶、起始位置） | 界面尚未提供 |
| ⬜ | H-resume | 发送失败后续打剩余，每张恰好一次 | 界面没有「续打剩余」 |
| ⬜ | H-status | 检测打印机状态 / 分辨率 | 界面没有「检测打印机」 |

## 网页端

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ✅ | A-barcode-preview | Code128：预览可扫回原文 | [{"format":"Code128","text":"FZ075885L-01110"}] |
| ✅ | A-barcode-zpl | Code128：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code128","text":"FZ075885L-01110"}] |
| ⬜ | A-barcode-tspl | Code128：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-ean13-preview | EAN-13：预览可扫回原文 | [{"format":"EAN13","text":"6925253841665"}] |
| ✅ | A-ean13-zpl | EAN-13：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN13","text":"6925253841665"}] |
| ⬜ | A-ean13-tspl | EAN-13：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-ean8-preview | EAN-8：预览可扫回原文 | [{"format":"EAN8","text":"12345670"}] |
| ✅ | A-ean8-zpl | EAN-8：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN8","text":"12345670"}] |
| ⬜ | A-ean8-tspl | EAN-8：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-upca-preview | UPC-A：预览可扫回原文 | [{"format":"EAN13","text":"0036000291452"}] |
| ✅ | A-upca-zpl | UPC-A：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"EAN13","text":"0036000291452"}] |
| ⬜ | A-upca-tspl | UPC-A：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-upce-preview | UPC-E：预览可扫回原文 | [{"format":"UPCE","text":"0012345000065"}] |
| ✅ | A-upce-zpl | UPC-E：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"UPCE","text":"0012345000065"}] |
| ⬜ | A-upce-tspl | UPC-E：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-code39-preview | Code39：预览可扫回原文 | [{"format":"Code39","text":"SN-001"}] |
| ✅ | A-code39-zpl | Code39：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code39","text":"SN-001"}] |
| ⬜ | A-code39-tspl | Code39：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-code93-preview | Code93：预览可扫回原文 | [{"format":"Code93","text":"CODE93-1"}] |
| ✅ | A-code93-zpl | Code93：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code93","text":"CODE93-1"}] |
| ⬜ | A-code93-tspl | Code93：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-codabar-preview | Codabar：预览可扫回原文 | [{"format":"Codabar","text":"A40156B"}] |
| ✅ | A-codabar-zpl | Codabar：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Codabar","text":"A40156B"}] |
| ⬜ | A-codabar-tspl | Codabar：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-itf-preview | ITF-25：预览可扫回原文 | [{"format":"ITF","text":"1234567890"}] |
| ✅ | A-itf-zpl | ITF-25：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"ITF","text":"1234567890"}] |
| ⬜ | A-itf-tspl | ITF-25：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-gs1128-preview | GS1-128：预览可扫回原文 | [{"format":"Code128","text":"(01)06925253841665(17)271231(10)B26"}] |
| ✅ | A-gs1128-zpl | GS1-128：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"Code128","text":"(01)06925253841665(17)271231(10)B26"}] |
| ⬜ | A-gs1128-tspl | GS1-128：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-qrcode-preview | QR 中文：预览可扫回原文 | [{"format":"QRCode","text":"合格证 SN0001 品名：女包"}] |
| ✅ | A-qrcode-zpl | QR 中文：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"QRCode","text":"合格证 SN0001 品名：女包"}] |
| ⬜ | A-qrcode-tspl | QR 中文：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-datamatrix-preview | DataMatrix 中文：预览可扫回原文 | [{"format":"DataMatrix","text":"批号B26 合格证"}] |
| ✅ | A-datamatrix-zpl | DataMatrix 中文：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"DataMatrix","text":"批号B26 合格证"}] |
| ⬜ | A-datamatrix-tspl | DataMatrix 中文：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-gs1dm-preview | GS1 DataMatrix：预览可扫回原文 | [{"format":"DataMatrix","text":"(01)06925253841665(10)LOT7(21)SN01"}] |
| ✅ | A-gs1dm-zpl | GS1 DataMatrix：ZPL 出纸（Zebrash）可扫回原文 | [{"format":"DataMatrix","text":"(01)06925253841665(10)LOT7(21)SN01"}] |
| ⬜ | A-gs1dm-tspl | GS1 DataMatrix：TSPL 出纸可扫回原文 | 界面没有 TSPL 指令语言选项 |
| ✅ | A-rot90 | 旋转 90° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT90"}] |
| ✅ | A-rot180 | 旋转 180° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT180"}] |
| ✅ | A-rot270 | 旋转 270° 的条码 ZPL 出纸可扫 | [{"format":"Code128","text":"ROT270"}] |
| ✅ | A-noerror | 全程无脚本错误 |  |
| ❌ | B-ean-check | EAN 校验位错的记录不会打出（有提示） | 提示：无；出 3 张；扫到：6925253841665,6925253841672 |
| ✅ | B-range | 打印范围填反（3→1）时不出标签并提示 | 未导出 |
| ❌ | B-code128-cjk | Code128 无法编码的记录被拦下（不打错误文字） | 提示：；出 2 张 |
| ✅ | C-cjk-field | 中文 / 带空格字段名可插值 | 品名：女包 558 |
| ✅ | C-gbk | 中文版 Excel 另存的 GBK CSV 不乱码 | 品名,SKU 雨伞,A1  |
| ✅ | C-newline | 引号内换行的 CSV 解析为 1 条 | 1 张 |
| ✅ | C-xlsx | 直接导入 .xlsx | 品名：台灯 99 |
| ⬜ | D-serial-barcode | 流水号可放进条码（{#SN}） | 条码内容里的 {#SN} 未被替换：["SNSN0001","SNSN0002","SNSN0003"] |
| ✅ | D-cancel | 未确认打印成功时流水号不前进 | 7 → 7 |
| ✅ | D-persist | 关闭重开后流水号起始值保持 | 7 → 7 |
| ❌ | E-pages | 标签机模式：5 张标签 = 5 页 | 1 页 |
| ❌ | E-pagesize | 标签机模式：页面尺寸 = 标签尺寸 60×40mm | MediaBox 612.0×792.0pt，应为 170.1×113.4 |
| ✅ | F-qty | 数量字段（每条打几张）：界面已提供 |  |
| ✅ | F-pick | 选择记录打印：界面已提供 |  |
| ✅ | F-preflight | 打印前预检：界面已提供 |  |
| ⬜ | F-log | 打印日志 | 界面尚未提供 |
| ⬜ | F-shop | 车间模式（只打印） | 界面尚未提供 |
| ⬜ | F-tspl | TSPL 指令（国产标签机） | 界面尚未提供 |
| ⬜ | F-status | 检测打印机（状态 / DPI） | 界面尚未提供 |
| ⬜ | F-batch | 分批直发 / 续打 | 界面尚未提供 |
| ⬜ | F-sheet | 整页模式（A4 不干胶、起始位置） | 界面尚未提供 |
| ✅ | F-fit | 文字适应宽度：界面已提供 |  |
| ✅ | F-qty-out | 数量字段：A×2 + C×3 = 5 张 | 5 张 |
| ✅ | G-import | 导入并预览 1 万条 < 5 秒 | 0.4 秒 |
| ✅ | G-export-count | 1 万张生成 ZPL 张数正确 | 10000 张 |
| ❌ | G-export-time | 1 万张生成 ZPL < 90 秒 | 166.2 秒，9.2MB |
| ✅ | G-sample-0 | 抽查第 1 张：Code128 / EAN-13 / QR 都正确 | SKU00001\|6920000000012,SKU00001,6920000000012 |
| ✅ | G-sample-9999 | 抽查第 10000 张：Code128 / EAN-13 / QR 都正确 | SKU10000\|6920000100002,SKU10000,6920000100002 |
| ✅ | G-noerror | 大批量全程无脚本错误 |  |

## 桌面版（Electron）

| 状态 | 编号 | 项目 | 证据 |
|---|---|---|---|
| ✅ | H-sandbox | 页面拿不到 Node（沙箱 + 上下文隔离） |  |
| ✅ | H-api | 桌面版接口可用（数据库 / 打印机） |  |
| ✅ | H-nav | 页面不能被导航走（拖文件进窗口不丢设计） | file:///home/user/Mexican/index.html |
| ✅ | H-sqlite | 真实 SQLite 取数套打（中文表名字段名、日期不差一天） | 已取 2 行 ｜ 女包/2026-10-20/558 \| 男鞋/2026-10-21/398.5 |
| ✅ | H-readonly | 套打查询只读（DELETE 被拒绝） | 查询失败：只允许 SELECT 查询（套打只读取数据） |
| ✅ | H-send | 直发到网络标签机：5 张全部送达 | 5 张；已发送 5 张标签到打印机 |
| ✅ | H-send-serial | 直发的 5 张流水号 SN0001–SN0005 | SN0001,SN0002,SN0003,SN0004,SN0005 |
| ⬜ | H-resume | 发送失败后续打剩余，每张恰好一次 | 界面没有「续打剩余」 |
| ⬜ | H-status | 检测打印机状态 / 分辨率 | 界面没有「检测打印机」 |
| ✅ | H-noerror | 桌面版全程无脚本错误 |  |

