# dshmarket · DeepSeek Harness 插件市场 / Plugin Market

[![topics](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![stars](https://img.shields.io/github/stars/nanshan1995/dshmarket?style=flat)](https://github.com/nanshan1995/dshmarket)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

逛、搜、点一下安装——每笔安装/更新前都先过**静态安全审计闸门**。
Browse, search, one-click install — every install/update passes a **static security audit gate** first.

---

# 中文

## 功能

- 精选目录（awesome-dsh-plugin 收录）+ GitHub `dsh-plugin` 主题**实时全量浏览**（按 star / 最新排序，分页加载）
- **中英互通搜索**：输入中文能命中英文插件（反之亦然），词表 + 宿主大模型**实时翻译**双层扩展
- 安装前审计：真实发布源码静态扫描（动态执行、凭据访问、安装脚本等硬拦截），不通过弹审计报告卡
- 官方设计风格界面（`--dsw-alias-*` 令牌），审计结果按官方「请求批准」胶囊样式展示
- 更新检测、一键更新（同样过审计）、两步卸载、热挂载、日志导出、pnpm 自助修复

## 安装方式

> 前置：已安装 DeepSeek Harness（`dsh web`），本机可用 pnpm（市场会自查并引导安装）。

**方式一：从 GitHub 安装（推荐）**

```sh
dsh plugin --profile web add github:nanshan1995/dshmarket
```

**方式二：本地链接（开发）**

```sh
git clone https://github.com/nanshan1995/dshmarket
dsh plugin --profile web add link:$(pwd)/dshmarket
```

**方式三：npm**（后续发布后可用）

```sh
dsh plugin --profile web add dshmarket
```

安装后**重启 DeepSeek Harness**，打开 设置 → 插件市场。

## 使用

- **发现**：默认精选目录；切换「社区全部」直接按 star 浏览整个 GitHub 主题（每页 50，点「加载更多」翻页；GitHub 检索上限 1000 条，标题显示真实总数，其余用搜索触达）
- **搜索**：关键词实时搜索（中英双语 + 翻译扩展，界面显示「已翻译: …」）
- **安装**：点安装 → 自动下载真实发布源码做静态审计 → 通过自动安装；不通过弹报告卡（可让 Agent 人工复核）
- **已安装**：按安装时间排序（可切换方向）、悬停/选中显示安装与更新时间；更新、卸载入口
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
cordis.patch.yml      bundle patch：向 profile 插入 dsh-market 行
```

**审计闸门（fail-closed）**：安装/更新前，把即将安装的确切产物（npm dist tarball 或 GitHub codeload HEAD）下载到临时目录，纯静态扫描（绝不执行）：

- 分级能力画像：文件读写、子进程、网络主机、环境变量、凭据路径、动态执行（`eval`/`vm`/`new Function`）、服务注入、bundle patch、依赖
- 硬拦截（risk=review）：动态执行、凭据路径/敏感环境变量、patch 覆盖他人插件
- 附加硬规则：`preinstall/install/postinstall`（git 安装含 `prepare`）一律阻止；审计异常一律阻止
- 报告卡展示风险等级、权限芯片、逐条发现（文件:行号 + 证据）

**搜索与翻译**：GitHub search API（分页 + 排序）与精选目录**双语**本地匹配合并；查询词先经内置中英词表扩展，再经宿主 LLM 实时翻译（10 分钟缓存、6 秒超时、失败自动回退词表），翻译词一并参与 GitHub OR 搜索与目录匹配。

**分页**：社区浏览每页 50、搜索每页 20；客户端「加载更多」严格递增（跨页重复自动向后补齐、余量缓存），显示已加载/真实总数，并注明 GitHub 1000 条检索上限。

**安装执行**：同源 POST → 审计 → 重新唤起 `dsh` CLI 转发 pnpm（补 PATH，桌面宿主可用）→ 成功即热挂载；`dsh.bundle` 声明齐全的包由 profile 的 bundle 层自动加载。

**Agent 协助**：对装后无法生效的插件，客户端经 `workspaces.startSession` 新建会话并把诊断任务预填进输入框，用户发送后由 Agent 接手排查。

## 安全说明

静态审计是**危险能力雷达，不是行为防火墙**：它能拦动态执行、偷凭据、安装脚本、篡改他人插件等最高危静态模式，但无法判断运行时的数据流意图（如「读文档再上传」）。收录 ≠ 背书：只安装你信任的来源；配合运行时哨兵（如 dsh-plugin-audit）与 commit 锁定使用更稳妥。

## 数据源与许可

- 精选目录实时来自 [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json)（CI 每日刷新），离线时用内置快照
- 社区全量来自 GitHub `dsh-plugin` 主题实时搜索
- MIT License

---

# English

## Features

- Curated catalog (awesome-dsh-plugin) + **live full browse** of the GitHub `dsh-plugin` topic (ranked by stars / latest, paginated)
- **Cross-language search**: Chinese queries find English plugins and vice versa — built-in thesaurus **plus real-time LLM translation** via the host model
- Pre-install audit of the exact published artifact (dynamic exec, credential access, install scripts are hard-blocked); blocked installs show an audit report card
- Official design language (`--dsw-alias-*` tokens); audit results in the official "request approval" pill style
- Update checks, one-click updates (audited too), two-step uninstall, hot mounting, log export, self-service pnpm setup

## Installation

> Prerequisites: DeepSeek Harness (`dsh web`) running; pnpm available (the market detects and offers to install it).

**Option 1: from GitHub (recommended)**

```sh
dsh plugin --profile web add github:nanshan1995/dshmarket
```

**Option 2: local link (development)**

```sh
git clone https://github.com/nanshan1995/dshmarket
dsh plugin --profile web add link:$(pwd)/dshmarket
```

**Option 3: npm** (once published)

```sh
dsh plugin --profile web add dshmarket
```

Restart DeepSeek Harness, then open Settings → Plugin Market.

## Usage

- **Discover**: curated catalog by default; switch to **All community** to browse the whole GitHub topic ranked by stars (50 per load, "Load more" to page; GitHub exposes at most 1000 results — the real total is shown, and search reaches the rest)
- **Search**: live keyword search with zh/en thesaurus **plus LLM translation**; the UI shows "Translated as: …"
- **Install**: click Install → the real source is downloaded and statically audited → auto-installs on pass; on block, an audit card is shown (hand it to the Agent for manual review)
- **Installed**: sort by install time (toggle direction), hover/select to see install & update times; update and uninstall entry points
- **Plugins without a `dsh.bundle` declaration**: a yellow notice appears after install with a **"Let the Agent handle it"** button — it opens a fresh session with a pre-filled diagnosis task so the Agent finishes the wiring for you

## Configuration

| Env var | Effect |
|---|---|
| `DSHMARKET_AUDIT_GATE=off` | Disables the audit gate (community sources are then refused outright — fail-closed) |
| `DSHMARKET_GITHUB_TOKEN` | Raises the GitHub search quota (unauthenticated is ~10 req/min) |
| `DSHMARKET_TRANSLATE_PROVIDER` / `DSHMARKET_TRANSLATE_MODEL` | Model used for query translation (defaults `deepseek-official` / `deepseek-v4-flash`, using the host's configured LLM credentials) |

## How it works

A standard dsh-plugin (`dsh.bundle` + `dsh.client`):

```
lib/index.js          host entry: injects webServer (+ optional llm), mounts HTTP routes
lib/routes.js         routes: registry/search/install/update/uninstall/status/updates/logs/setup-pnpm
lib/audit-scanner.js  bundled static audit engine (from dsh-plugin-audit's scanner)
lib/hot.js            hot-mount after install (no restart needed)
lib/log.js            sanitized logging and export
lib/registry.js       curated catalog (awesome-dsh-plugin.com, bundled snapshot fallback)
client/client.js      self-contained CJS client (settings UI, audit card, agent handoff)
cordis.patch.yml      bundle patch: inserts the dsh-market row into the profile
```

**Audit gate (fail-closed)**: before install/update, the exact artifact that would be installed (npm dist tarball or GitHub codeload HEAD) is downloaded into a temp dir and scanned statically — code is never executed:

- Graded capability profile: fs read/write, subprocess, network hosts, env vars, credential paths, dynamic execution (`eval`/`vm`/`new Function`), service injection, bundle patch, dependencies
- Hard blocks (risk=review): dynamic execution, credential paths/sensitive env vars, patches that override other plugins
- Additional hard rules: `preinstall`/`install`/`postinstall` (plus `prepare` for git installs) are always blocked; any audit failure blocks
- The report card shows risk level, permission chips and each finding (file:line + evidence)

**Search & translation**: GitHub search API (paged, sortable) merged with bilingual matches against the curated catalog; the query is expanded by the built-in zh/en thesaurus and then translated live by the host LLM (10-min cache, 6s timeout, silent fallback to the thesaurus). Translated terms join the GitHub OR-query and the catalog matching.

**Pagination**: 50 per load for community browse, 20 for search; the client's "Load more" appends exactly one page of new items (drift-compensating backfill), shows loaded/real totals and notes GitHub's 1000-result retrieval cap.

**Install executor**: same-origin POST → audit → re-invoke the `dsh` CLI to forward pnpm (PATH patched for desktop hosts) → hot-mount on success; packages declaring `dsh.bundle` are auto-added to the profile's bundle stack.

**Agent handoff**: for plugins that don't activate after install, the client calls `workspaces.startSession`, opens a fresh session and prefills the composer with a diagnosis task; the Agent takes over once the user sends it.

## Security notes

The static audit is a **capability radar, not a behavior firewall**: it blocks the highest-risk static patterns (dynamic exec, credential theft, install scripts, tampering with other plugins) but cannot judge runtime data-flow intent (e.g. "read documents, then upload"). Curation ≠ endorsement: only install sources you trust, and pair this with a runtime sentinel (e.g. dsh-plugin-audit) and commit pinning.

## Data sources & license

- Curated catalog comes live from [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json) (CI-refreshed daily), with a bundled offline snapshot
- The community listing is the live GitHub `dsh-plugin` topic search
- MIT License
