# DSH-Plugin-Market · 插件市场

[English](README.md) | **中文**

[![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![stars](https://img.shields.io/github/stars/nanshan1995/DSH-Plugin-Market?style=flat)](https://github.com/nanshan1995/DSH-Plugin-Market)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

DeepSeek Harness 插件市场：逛、搜、点一下安装——每笔安装/更新前都先过**静态安全审计闸门**。

## 功能

- GitHub `dsh-plugin` 主题**实时全量浏览**（按 star / 最新排序，分页加载）+ 个人「我的精选」（☆ 收藏，跨重启保留）
- **中英互通搜索**：输入中文能命中英文插件（反之亦然），词表 + 宿主大模型**实时翻译**双层扩展
- 安装前审计：真实发布源码静态扫描（动态执行、凭据访问、安装脚本等硬拦截），不通过弹审计报告卡；**审计被阻止时可选择「仍然安装」强制下载（风险自负），也可点「取消」放弃**——两个选择都摆在卡上
- 安装 / 更新 / 卸载进行中的插件在列表**自动置顶**，进度实时可见
- 官方设计风格界面（`--dsw-alias-*` 令牌），审计结果按官方「请求批准」胶囊样式展示
- 更新检测、一键更新（同样过审计）、原按钮两步确认式卸载（点「卸载」→ 按钮就地变「确认卸载？」→ 再点才执行，点击页面其他地方自动还原）、热挂载、日志导出、pnpm 自助修复
- **已安装插件一键跳转对应 Git**：每一行都会解析出自己的仓库地址（`package.json` 的 `repository` / GitHub `homepage`、`github:` 安装源，都没有时扫描包内 README 里的 GitHub 链接兜底），spec 文本即链接，另有「源码」按钮直接打开仓库
- **市场内直接看使用说明（README），乱码自动修复**：每个插件都有「使用说明」按钮；README 内 HTML 表格、图片正常渲染，相对图片链接自动指向 raw；想切换语言就点 README 内容里的语言链接（如「中文」），在弹窗内直接重载对应文件；发布方把中文 README 存成双重乱码（UTF-8 被按 GB18030 误读后再存，如 —— 变 鈥斺€）时自动还原成可读文本，并打上「已修复乱码」标记；上游已彻底损坏的位置显示为「?」
- **跨平台**：macOS / Windows / Linux 全适配（工具链按平台自动探测：fnm / Volta / Homebrew / scoop / %APPDATA%\npm 等；Windows 使用 tar.exe / curl.exe / cmd 兼容启动）
- **网络自适应**：README 与审计下载自动探测本机代理（环境变量 → 常见本地代理端口并行探测 → 直连回退），代理失败自动直连重试；无代理的机器最多等一个探测超时（约 1.2 秒）即走直连，不写死任何代理地址

## 安装方式

> 前置：已安装 DeepSeek Harness（`dsh web`），本机可用 pnpm（市场会自查并引导安装）。Windows 需 10 1803+（审计解压用系统自带 bsdtar）。

**方式一：从 GitHub 安装（推荐）**

```sh
dsh plugin --profile web add github:nanshan1995/DSH-Plugin-Market
```

**方式二：本地链接（开发）**

```sh
git clone https://github.com/nanshan1995/DSH-Plugin-Market
dsh plugin --profile web add link:$(pwd)/DSH-Plugin-Market
```

**方式三：npm**（发布后可用）

```sh
dsh plugin --profile web add dsh-plugin-market
```

安装后**重启 DeepSeek Harness**，打开 设置 → 插件市场。

## 使用

- **发现**：按 star / 最新浏览整个 GitHub 主题（每页 50，点「加载更多」翻页；GitHub 检索上限 1000 条，标题显示真实总数，其余用搜索触达）；进行中（安装/更新/卸载、审计待决定）的插件自动置顶
- **搜索**：关键词实时搜索（中英双语 + 翻译扩展，界面显示「已翻译: …」）
- **安装**：点安装 → 自动下载真实发布源码做静态审计 → 通过自动安装；不通过弹报告卡（「仍然安装」强制 / 「取消」放弃 / 把插件名告诉 Agent 人工复核）
- **我的精选**：☆ 收藏任意社区插件到个人列表（存 profile 目录，跨重启保留），收藏同样支持安装/更新/卸载/使用说明
- **已安装**：按安装时间排序（可切换方向）；**启用/停用（热插拔，免重启）**、更新、卸载入口；停用的插件灰显并标「已停用」，重启后保持；市场插件自身不可停用
- **已安装行链接到对应 Git**：spec 文本变成链接、另有「源码」按钮打开仓库
- **使用说明（README）**：弹窗内直接查看；乱码自动修复；HTML 与图片正常渲染；点内容里的语言链接在弹窗内切换语言；「↻」按钮强制刷新最新内容（缓存 30 分钟自动过期 + 容量上限 LRU，纯内存不落盘）
- **未声明 `dsh.bundle` 的插件**：装完会弹黄色提示并可点「**让 Agent 协助处理**」——自动开新会话、预填诊断任务，交给 Agent 完成接线

## 配置与开关

| 环境变量 | 作用 |
|---|---|
| `DSHMARKET_AUDIT_GATE=off` | 关闭审计闸门（社区来源将直接禁止安装，fail-closed） |
| `DSHMARKET_GITHUB_TOKEN` | 提升 GitHub 搜索配额（默认未认证约 10 次/分钟）。未设置时会顺带读取通用 `GITHUB_TOKEN`——该凭据只发往 api.github.com |
| `DSHMARKET_TRANSLATE_PROVIDER` / `DSHMARKET_TRANSLATE_MODEL` | 搜索翻译用的大模型（默认 `deepseek-official` / `deepseek-v4-flash`，走宿主已配置的 LLM 凭证） |
| `DSHMARKET_README_PROXY` | 显式指定 README/审计下载走的 HTTP 代理（不设则自动探测：环境变量代理 → 本地端口 → 直连） |

## 实现方式

插件是标准 dsh-plugin（`dsh.bundle` + `dsh.client`）：

```
lib/index.js          宿主入口：注入 webServer（+ 可选 llm/loader），挂载 HTTP 路由
lib/routes.js         HTTP 路由：search/install/update/uninstall/favorites/readme/entries/toggle/status/updates/logs/setup-pnpm
lib/audit-scanner.js  内置静态审计引擎（源自 dsh-plugin-audit 的 scanner，打包随行）
lib/hot.js            安装后热挂载（免重启即用）
lib/log.js            脱敏日志与导出
client/client.js      自包含客户端（设置页 UI、审计报告卡、Agent 协助跳转）
cordis.patch.yml      bundle patch：向 profile 插入 dsh-plugin-market 行
```

**审计闸门（fail-closed）**：安装/更新前，把即将安装的确切产物（npm dist tarball 或 GitHub codeload HEAD）下载到临时目录，纯静态扫描（绝不执行）：

- 分级能力画像：文件读写、子进程、网络主机、环境变量、凭据路径、动态执行（`eval`/`vm`/`new Function`）、服务注入、bundle patch、依赖
- 硬拦截（risk=review）：动态执行、凭据路径/敏感环境变量、patch 覆盖他人插件
- 附加硬规则：`preinstall/install/postinstall`（git 安装含 `prepare`）一律阻止；审计异常一律阻止
- 报告卡展示风险等级、权限芯片、逐条发现（文件:行号 + 证据）

**搜索与翻译**：GitHub search API（分页 + 排序）实时搜索；查询词先经内置中英词表扩展，再经宿主 LLM 实时翻译（10 分钟缓存、6 秒超时、失败自动回退词表），翻译词一并参与 GitHub OR 搜索。

**README 拉取**：curl 通道（自动代理探测 + 直连回退），按语言优先级选文件（`README.zh.md` → `README.md`，罕见命名兜底，并跟随 README 内的语言切换链接），后台预热另一语言；内容经乱码修复与相对 URL 重写后返回；缓存纯内存、30 分钟过期 + 容量上限。

**分页**：社区浏览每页 50、搜索每页 20；客户端「加载更多」严格递增（跨页重复自动向后补齐、余量缓存），显示已加载/真实总数，并注明 GitHub 1000 条检索上限。

**安装执行**：同源 POST → 审计 → 重新唤起 `dsh` CLI 转发 pnpm（按平台补 PATH）→ 成功即热挂载；`dsh.bundle` 声明齐全的包由 profile 的 bundle 层自动加载。卸载 = `dsh remove` + 立即停掉运行中的装配条目 + 清理 profile bundles 引用，界面即时消失、重启不复活。

**Agent 协助**：对装后无法生效的插件，客户端经 `workspaces.startSession` 新建会话并把诊断任务预填进输入框，用户发送后由 Agent 接手排查。

## 安全说明

静态审计是**危险能力雷达，不是行为防火墙**：它能拦动态执行、偷凭据、安装脚本、篡改他人插件等最高危静态模式，但无法判断运行时的数据流意图（如「读文档再上传」）。收录 ≠ 背书：只安装你信任的来源；配合运行时哨兵（如 dsh-plugin-audit）与 commit 锁定使用更稳妥。

## 免责声明

本市场仅提供插件的**浏览、下载与管理**。下载前只做最基础的静态检查，不构成安全或合规承诺。**下载后使用插件产生的一切问题与损失，与作者无关。**

## 开发流程（分支规范）

- `main` —— **稳定发版分支**：只接受经过测试的合并，每次合并后即为可发布版本
- `test` —— **日常开发测试分支**：所有功能调整、修复、实验都在这里进行，测试通过后合并回 `main`

流程：`test` 上开发与自测 → 验证通过 → 向 `main` 提 PR → **维护者授权后**合并 → `main` 即为发版。

## 数据源与许可

- 社区全量来自 GitHub `dsh-plugin` 主题实时搜索；「我的精选」为个人收藏（仅存本机 profile）
- MIT License
