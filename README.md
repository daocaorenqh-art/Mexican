# 标签打印工具

一个纯浏览器运行的标签 / 条码设计与批量打印工具，无需安装，可打印到任意打印机（普通办公打印机或标签机）。全部为原创实现。

## 使用

用 Chrome / Edge 直接打开 `index.html` 即可。

## 功能

- **标签 & 纸张**：自定义标签宽高（mm）、打印精度 DPI（96 / 203 / 300）、整页套打时的标签间距。
- **元素**：
  - 文字（字号、加粗、字体、对齐）
  - 条码：Code128、EAN-13、EAN-8、UPC-A、Code39、ITF-25（均为自写编码，含自动校验位）
  - 二维码（使用开源 qrcodejs 渲染，浏览器从 CDN 加载）
  - 图片 / Logo（本地上传）
  - 线条 / 边框 / 黑块
  - 每个元素支持任意角度旋转、复制
  - 预览缩放
- **数据套打**：第一行字段名，每行数据生成一张标签。支持逗号或 Tab 分隔（可直接从 Excel 复制粘贴），也可导入 CSV 文件。
- **内容语法**：
  - 普通文字直接写（可含 `[` `]` 等任意字符）。
  - 简单插值：`{字段}`，如 `{GOODSNAME}`。
  - 表达式：以 `=` 开头，支持 `[字段]` 或 `[表.字段]`、字符串 `"文字"`、`+` 拼接，以及函数
    `left(s,n)` `right(s,n)` `mid(s,起,长)` `upper(s)` `lower(s)` `trim(s)` `concat(...)`
  - 例：`=[JYPRICE] + ".00"`、`=left([GOODSRMK],20)`、`=mid([GOODSRMK],21,25)`
- **保存 / 载入设计**：把当前标签设计导出为 `.json`，下次载入继续用。
- **打印**：一键调起系统打印；整页套打的多张标签按间距自动平铺换行。

## 示例

`examples/` 下有一个服装吊牌示例（由一份 StrandWare `.qdf` 吊牌模板还原字段与表达式）：

1. 打开 `index.html`，点「载入设计」选 `examples/clothing-tag.json`。
2. 在「数据套打」里点「导入 CSV 文件」选 `examples/clothing-tag.csv`，再点「生成标签」。
3. 预览确认后点「打印」。

坐标 / 字号是估算值，可按实际吊牌微调。

## 桌面安装版（本地运行 + 连数据库）

除了直接打开 `index.html`，本项目也可打包成 Windows 安装版客户端（基于 Electron），本地安装运行，并直接连数据库做套打。

支持的数据库：**SQLite、Microsoft Access(.mdb/.accdb)、MySQL、PostgreSQL、SQL Server**。

### 方式一：下载已打包好的安装程序（推荐）

仓库已配置 GitHub Actions 自动在 Windows 上打包：

- 在 GitHub 仓库页 **Actions → Build Windows Installer**，手动运行（Run workflow），完成后在该次运行页底部下载 `label-print-tool-windows` 产物，解压得到 `.exe` 安装程序。
- 或推一个 `v` 开头的标签（如 `git tag v0.2.0 && git push --tags`），会自动在 **Releases** 页发布安装包，直接下载。

### 方式二：在你的 Windows 电脑上自己构建

> 需先装 [Node.js](https://nodejs.org)（建议 18+）。

```bat
npm install
npm run dist
```

完成后在 `dist/` 目录得到安装程序（`.exe`），双击安装即可。开发调试用：

```bat
npm start
```

> 数据库驱动列为可选依赖：某个驱动在你的机器上编译不成功，不会中断安装，只是该类型数据库暂不可用，其它功能照常。

### 连数据库套打

1. 打开客户端，在「数据库」面板选类型、填连接信息（Access/SQLite 选本地文件，其余填主机/账号/库名）。
2. 点「测试连接」，再填一条 `SELECT` 查询，点「取数生成标签」。
3. 查询返回的每一行生成一张标签，列名即可在元素里用 `[列名]` 或 `{列名}` 引用。

> Access 连接需本机已安装「Microsoft Access Database Engine / ODBC 驱动」。
> 各数据库驱动（better-sqlite3 / odbc / mysql2 / pg / mssql）为原生模块，由 `npm install` 自动编译安装；没用到的类型即使未成功安装也不影响其它功能。

## 关于二维码库

二维码用开源库 [qrcodejs](https://github.com/davidshimjs/qrcodejs)，通过 CDN 在浏览器端加载，离线或无法访问 CDN 时二维码不渲染（会给出提示），其余功能不受影响。如需完全离线，可把该库下载到本地并改为本地引用。
