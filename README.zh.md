# DSH-Plugin-Market · 插件市场

[English](README.md) | **中文**

[![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![stars](https://img.shields.io/github/stars/nanshan1995/DSH-Plugin-Market?style=flat)](https://github.com/nanshan1995/DSH-Plugin-Market)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

DeepSeek Harness 插件市场：逛、搜、点一下安装——每笔安装/更新前都先过**静态安全审计闸门**。

## 功能

- 精选目录（awesome-dsh-plugin 收录）+ GitHub `dsh-plugin` 主题**实时全量浏览**（按 star / 最新排序，分页加载）
- **中英互通搜索**：输入中文能命中英文插件（反之亦然），词表 + 宿主大模型**实时翻译**双层扩展
- 安装前审计：真实发布源码静态扫描（动态执行、凭据访问、安装脚本等硬拦截），不通过弹审计报告卡
- 官方设计风格界面（`--dsw-alias-*` 令牌），审计结果按官方「请求批准」胶囊样式展示
- 更新检测、一键更新（同样过审计）、两步卸载、热挂载、日志导出、pnpm 自助修复
- **已安装插件一键跳转对应 Git**：每一行都会解析出自己的仓库地址（`package.json` 的 `repository` / GitHub `homepage`、`github:` 安装源，都没有时扫描包内 README 里的 GitHub 链接兜底），spec 文本即链接，另有「源码」按钮直接打开仓库
- **市场内直接看使用说明（README），乱码自动修复**：每个已安装插件都有「使用说明」按钮；发布方把中文 README 存成双重乱码（UTF-8 被按 GB18030 误读后再存，如 —— 变 鈥斺€）时自动还原成可读文本，并打上「已修复乱码」标记；上游已彻底损坏的位置显示为「?」

## 安装方式

> 前置：已安装 DeepSeek Harness（`dsh web`），本机可用 pnpm（市场会自查并引导安装）。

**方式一：从 GitHub 安装（推荐）**

```sh
dsh plugin --profile web add github:nanshan1995/DSH-Plugin-Market
```

**方式二：本地链接（开发）**

```sh
git clone https://github.com/nanshan1995/DSH-Plugin-Market
dsh plugin --profile web add link:$(pwd)/DSH-Plugin-Market
```

**方式三：npm**（后续发布后可用）

```sh
dsh plugin --profile web add dsh-plugin-market
```

安装后**重启 DeepSeek Harness**，打开 设置 → 插件市场。

## 使用

- **发现**：默认精选目录；切换「社区全部」直接按 star 浏览整个 GitHub 主题（每页 50，点「加载更多」翻页；GitHub 检索上限 1000 条，标题显示真实总数，其余用搜索触达）
- **搜索**：关键词实时搜索（中英双语 + 翻译扩展，界面显示「已翻译: …」）
- **安装**：点安装 → 自动下载真实发布源码做静态审计 → 通过自动安装；不通过弹报告卡（可让 Agent 人工复核）
- **已安装**：按安装时间排序（可切换方向）、悬停/选中显示安装与更新时间；**启用/停用（热插拔，免重启）**、更新、卸载入口；停用的插件灰显并标「已停用」，重启后保持；市场插件自身不可停用
- **已安装行链接到对应 Git**：spec 文本变成链接、另有「源码」按钮打开仓库——按 `package.json` 的 `repository`（或 GitHub `homepage`）、`github:` 安装源依次解析；包没声明仓库时扫 README 兜底（如 dsh-plugin-audit）
- **使用说明（README）**：「使用说明」按钮在市场上直接查看插件说明；双重 GB18030 乱码的 README 自动还原，修复过会打「已修复乱码」标记
- **未声明 `dsh.bundle` 的插件**：装完会弹黄色提示并可点「**让 Agent 协助处理**」——自动开新会话、预填诊断任务，交给 Agent 完成接线

## 配置与开关

| 环境变量 | 作用 |
|---|---|
| `DSHMARKET_AUDIT_GATE=off` | 关闭审计闸门（社区来源将直接禁止安装，fail-closed） |
| `DSHMARKET_GITHUB_TOKEN` | 提升 GitHub 搜索配额（默认未认证约 10 次/分钟） |
| `DSHMARKET_TRANSLATE_PROVIDER` / `DSHMARKET_TRANSLATE_MODEL` | 搜索翻译用的大模型（默认 `deepseek-official` / `deepseek-v4-flash`，走宿主已配置的 LLM 凭证） |

## 实现方式

插件是标准 dsh-plugin（`dsh.bundle` + `dsh.client`）：

```
lib/index.js          宿主入口：注入 webServer（+ 可选 llm），挂载 HTTP 路由
lib/routes.js         HTTP 路由：registry/search/install/update/uninstall/status/updates/logs/setup-pnpm
lib/audit-scanner.js  内置静态审计引擎（源自 dsh-plugin-audit 的 scanner，打包随行）
lib/hot.js            安装后热挂载（免重启即用）
lib/log.js            脱敏日志与导出
lib/registry.js       精选目录（awesome-dsh-plugin.com，内置快照离线兜底）
client/client.js      自包含 CJS 客户端（设置页 UI、审计报告卡、Agent 协助跳转）
cordis.patch.yml      bundle patch：向 profile 插入 dsh-plugin-market 行
```

**审计闸门（fail-closed）**：安装/更新前，把即将安装的确切产物（npm dist tarball 或 GitHub codeload HEAD）下载到临时目录，纯静态扫描（绝不执行）：

- 分级能力画像：文件读写、子进程、网络主机、环境变量、凭据路径、动态执行（`eval`/`vm`/`new Function`）、服务注入、bundle patch、依赖
- 硬拦截（risk=review）：动态执行、凭据路径/敏感环境变量、patch 覆盖他人插件
- 附加硬规则：`preinstall/install/postinstall`（git 安装含 `prepare`）一律阻止；审计异常一律阻止
- 报告卡展示风险等级、权限芯片、逐条发现（文件:行号 + 证据）

**搜索与翻译**：GitHub search API（分页 + 排序）与精选目录**双语**本地匹配合并；查询词先经内置中英词表扩展，再经宿主 LLM 实时翻译（10 分钟缓存、6 秒超时、失败自动回退词表），翻译词一并参与 GitHub OR 搜索与目录匹配。

**分页**：社区浏览每页 50、搜索每页 20；客户端「加载更多」严格递增（跨页重复自动向后补齐、余量缓存），显示已加载/真实总数，并注明 GitHub 1000 条检索上限。

**安装执行**：同源 POST → 审计 → 重新唤起 `dsh` CLI 转发 pnpm（按平台补 PATH）→ 成功即热挂载；`dsh.bundle` 声明齐全的包由 profile 的 bundle 层自动加载。

**Agent 协助**：对装后无法生效的插件，客户端经 `workspaces.startSession` 新建会话并把诊断任务预填进输入框，用户发送后由 Agent 接手排查。

## 安全说明

静态审计是**危险能力雷达，不是行为防火墙**：它能拦动态执行、偷凭据、安装脚本、篡改他人插件等最高危静态模式，但无法判断运行时的数据流意图（如「读文档再上传」）。收录 ≠ 背书：只安装你信任的来源；配合运行时哨兵（如 dsh-plugin-audit）与 commit 锁定使用更稳妥。

## 免责声明

本市场仅提供插件的**浏览、下载与管理**。下载前只做最基础的静态检查，不构成安全或合规承诺。**下载后使用插件产生的一切问题与损失，与作者无关。**

## 开发流程（分支规范）

- `main` —— **稳定发版分支**：只接受经过测试的合并，每次合并后即为可发布版本
- `test` —— **日常开发测试分支**：所有功能调整、修复、实验都在这里进行，测试通过后合并回 `main`

流程：`test` 上开发与自测 → 验证通过 → 向 `main` 提 PR → **维护者明确同意后**才合并 → `main` 即为发版。

> ⚠️ **发版审批**：`main` 已开启分支保护（必须走 PR，禁止直接推送）。Agent 只负责在 `test` 上开发、自测和提 PR；**合并发版必须由维护者（仓库所有者）亲自确认同意后执行**，Agent 不得自行合并或发版。

```sh
git checkout test          # 切到测试分支
# ...调整、测试...
git add -A && git commit -m "feat/fix: ..."
git push origin test       # 推测试分支
# 测试通过后合并发版
git checkout main && git merge test && git push origin main
```

## 数据源与许可

- 精选目录实时来自 [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json)（CI 每日刷新），离线时用内置快照
- 社区全量来自 GitHub `dsh-plugin` 主题实时搜索
- MIT License
