window.__ModuleLoader__.load({ id: "dshmarket", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

/**
 * dsh-market client: registers a "Market" settings section rendering the
 * plugin market UI, styled after the official settings plugin inventory
 * (compact two-column collapsible cards, official design tokens) and the
 * official permission/approval presentation for audit results. Hand-authored
 * CJS bundle (no build step); the only external is the loader module table's
 * `react`.
 */

const React = require('react')
const h = React.createElement
const { useState, useEffect, useMemo, useCallback } = React

const NS = 'dsh-market'

const zh = {
  nav: '插件市场',
  subtitle: '发现社区为 DeepSeek Harness 打造的能力',
  searchPh: '搜索插件：名称或描述，中英近义互通（如「提醒」可命中 notification）',
  tabDiscover: '发现',
  tabInstalled: '已安装',
  install: '安装',
  installing: '安装中…',
  installedBadge: '✓ 已装好',
  alreadyInstalled: '✓ 已安装',
  restartBanner: '项变更完成，重启 DeepSeek Harness 后生效',
  uninstall: '卸载',
  confirmRemove: '确认卸载？',
  uninstalling: '卸载中…',
  restartHint: '重启方式：关闭当前 dsh 进程后重新运行（例如 dsh web）',
  confirmTitle: '安装',
  confirmWarn: '插件是社区第三方代码。安装即表示你信任该来源；构建脚本默认被禁止执行。',
  cancel: '取消',
  empty: '没有匹配的插件',
  installedEmpty: '还没有装过社区插件，去「发现」页逛逛吧',
  loadFail: '插件目录加载失败，请稍后重试',
  installFail: '安装失败',
  viewSource: '源码',
  hotBanner: '个新插件已装好，刷新页面即可使用',
  refresh: '刷新页面',
  update: '更新',
  updating: '更新中…',
  updated: '✓ 已更新，重启后生效',
  updateFail: '更新失败',
  upToDate: '已是最新',
  linkedDev: '本地开发链接',
  disable: '停用',
  enable: '启用',
  disabledTag: '已停用',
  marketLock: '市场插件自身不可停用',
  notPlugin: '非插件依赖',
  notPluginHint: '普通依赖库或未注册 dsh.bundle 的包：不参与加载，无需停用',
  exportLog: '导出日志',
  readme: '使用说明',
  terminalWarn: '这看起来是终端/命令行插件：装进网页版可能无效，甚至导致 DeepSeek Harness 无法启动。建议先看它的使用说明，按说明装进对应的 profile。',
  envMissing: '还差一个小组件才能安装插件',
  envFix: '自动装好',
  envFixing: '正在准备…',
  envFixFail: '自动准备没成功，请点"导出日志"把文件发给我们反馈',
  loading: '正在加载插件目录…',
  backTop: '回到顶部',
  sortHot: '最热',
  sortNew: '最新',
  sortTime: '按安装时间',
  sortTimeNew: '最近安装在前（点击切换方向）',
  sortTimeOld: '最早安装在前（点击切换方向）',
  installedAt: '安装时间',
  updatedAt: '更新时间',
  marketUpdate: '市场有新版本，升级',
  progressHint: '首次安装需要下载与解析依赖，大插件可能要 1-3 分钟',
  toastReady: '已装好并已生效',
  gotIt: '知道了',
  auditingPhase: '安全审计中…（下载源码并静态扫描）',
  auditPassNote: '点「安装」后会先做静态安全审计，通过后自动开始安装',
  auditBlockTitle: '安全审计未通过',
  auditBlocked: '已阻止安装/更新',
  auditRisk: '风险等级',
  auditFindings: '审计发现',
  auditHooks: '安装期脚本钩子',
  auditHookBlock: '包含安装期脚本，为安全起见已阻止（这类脚本会在安装时以你的身份执行任意命令）',
  auditReviewHint: '把插件名告诉 Agent，可人工复核源码后再决定是否放行',
  auditGateOff: '审计闸门已关闭（DSHMARKET_AUDIT_GATE=off），社区来源不可安装',
  auditNoFindings: '未发现高危项（可能因钩子或审计不可用而阻止）',
  communityBadge: '社区',
  curatedTag: '精选',
  searching: '正在搜索…',
  searchNote: 'GitHub 实时搜索 + 精选目录中英双语/近义词匹配（输入中文可命中英文近义描述，反之亦然）',
  translatedAs: '已翻译',
  searchRateLimited: '搜索太频繁被限流，请稍等',
  searchFail: '搜索失败，请稍后重试',
  retry: '重试',
  communityWarn: '该插件来自社区实时搜索，未经精选收录——请确认来源可信',
  browseAll: '社区全部',
  browseCurated: '精选目录',
  browseAllHint: 'GitHub dsh-plugin 主题按 star 实时排行：绿标「精选」为精选收录，灰标「社区」为未收录——每次加载 50 个，点「加载更多」翻页',
  searchResults: '搜索结果',
  mixedNote: '精选 + 社区混合',
  more: '加载更多',
  loadingMore: '加载中…',
  githubCapNote: '已加载 GitHub 分页可检索的上限 {fetchable} 个（该主题共 {total} 个，其余可用搜索查找）',
  bundlelessWarn: '安装成功，但 {names} 未声明 dsh.bundle，默认不会自动加载——需按插件说明手动配置（如在 profile 的 cordis.patch.yml 中加 insert 行）后重启才生效',
  agentHelp: '让 Agent 协助处理',
  agentHelpPrompt: '我刚在插件市场安装了插件 {name}（安装来源 {spec}），现在无法生效。请帮我排查：检查它的安装状态、bundle 声明与 profile 配置，完成必要的接线（cordis.patch.yml、凭证、依赖等），并确保重启后它能成功运行。如需配置项，请逐项帮我确认填写。',
  owner: '作者',
  stars: 'Star',
  category: '分类',
  source: '来源',
  version: '版本',
  kind: '类型',
  repository: '仓库',
  riskHigh: '高危',
  riskMedium: '中',
  riskLow: '低',
  permRead: '只读',
  permWrite: '工作区写入',
  permSubprocess: '子进程',
  permNetwork: '网络',
  permEnv: '环境变量',
  permEnvSensitive: '敏感环境变量',
  permCredentials: '凭据访问',
  permDynamic: '动态执行',
}

const en = {
  nav: 'Plugin Market',
  subtitle: 'Discover community plugins for DeepSeek Harness',
  searchPh: 'Search plugins — name or description, zh/en synonyms both match',
  tabDiscover: 'Discover',
  tabInstalled: 'Installed',
  install: 'Install',
  installing: 'Installing…',
  installedBadge: '✓ Installed',
  alreadyInstalled: '✓ Installed',
  restartBanner: 'change(s) done — restart DeepSeek Harness to apply',
  uninstall: 'Uninstall',
  confirmRemove: 'Confirm?',
  uninstalling: 'Removing…',
  restartHint: 'To restart: stop the current dsh process and run it again (e.g. dsh web)',
  confirmTitle: 'Install',
  confirmWarn: 'Plugins are third-party community code. Installing means you trust this source; build scripts are blocked by default.',
  cancel: 'Cancel',
  empty: 'No plugins match',
  installedEmpty: 'No community plugins yet — browse the Discover tab',
  loadFail: 'Failed to load the plugin catalog, please retry later',
  installFail: 'Install failed',
  viewSource: 'Source',
  hotBanner: 'new plugin(s) ready — refresh the page to use them',
  refresh: 'Refresh',
  update: 'Update',
  updating: 'Updating…',
  updated: '✓ Updated — restart to apply',
  updateFail: 'Update failed',
  upToDate: 'Up to date',
  linkedDev: 'linked (dev)',
  disable: 'Disable',
  enable: 'Enable',
  disabledTag: 'Disabled',
  marketLock: 'The market plugin cannot disable itself',
  notPlugin: 'Not a plugin',
  notPluginHint: 'A plain library or a package without a dsh.bundle declaration: it is not loaded, so there is nothing to disable',
  exportLog: 'Export log',
  readme: 'README',
  terminalWarn: 'This looks like a terminal/CLI plugin: installing it into the web profile may do nothing, or even break DeepSeek Harness startup. Read its README and install it into the profile it targets.',
  envMissing: 'One small component is needed before installing plugins',
  envFix: 'Set up automatically',
  envFixing: 'Setting up…',
  envFixFail: 'Automatic setup failed — please use "Export log" and send us the file',
  loading: 'Loading the catalog…',
  backTop: 'Back to top',
  sortHot: 'Top',
  sortNew: 'New',
  sortTime: 'By install time',
  sortTimeNew: 'Newest first (click to toggle direction)',
  sortTimeOld: 'Oldest first (click to toggle direction)',
  installedAt: 'Installed',
  updatedAt: 'Updated',
  marketUpdate: 'Market update available — upgrade',
  progressHint: 'First installs download and resolve dependencies — large plugins can take 1-3 minutes',
  toastReady: 'installed and live',
  gotIt: 'Got it',
  auditingPhase: 'Security audit running… (downloading source and scanning)',
  auditPassNote: 'A static security audit runs when you click Install; installation starts automatically when it passes',
  auditBlockTitle: 'Security audit failed',
  auditBlocked: 'install/update blocked',
  auditRisk: 'Risk',
  auditFindings: 'Findings',
  auditHooks: 'Install-time script hooks',
  auditHookBlock: 'Contains install-time scripts — blocked for safety (they run arbitrary commands as you during install)',
  auditReviewHint: 'Tell the Agent this plugin name — it can review the source manually before you decide',
  auditGateOff: 'Audit gate is off (DSHMARKET_AUDIT_GATE=off) — community sources cannot be installed',
  auditNoFindings: 'No high-risk findings (blocked by hooks or an unavailable audit)',
  communityBadge: 'community',
  curatedTag: 'curated',
  searching: 'Searching…',
  searchNote: 'Live GitHub search + curated bilingual/thesaurus matches (Chinese finds English synonyms and vice versa)',
  translatedAs: 'Translated as',
  searchRateLimited: 'Search is rate-limited — retry in a moment',
  searchFail: 'Search failed — please retry later',
  retry: 'Retry',
  communityWarn: 'This plugin comes from live community search and is not in the curated list — verify the source',
  browseAll: 'All community',
  browseCurated: 'Curated',
  browseAllHint: 'Live GitHub dsh-plugin topic ranked by stars — green "curated" tags mark vetted entries, grey "community" tags the rest; 50 per load, use "Load more"',
  searchResults: 'Search results',
  mixedNote: 'curated + community',
  more: 'Load more',
  loadingMore: 'Loading…',
  githubCapNote: 'Loaded all {fetchable} repos GitHub exposes through pagination (the topic has {total} total — use search to reach the rest)',
  bundlelessWarn: 'Installed, but {names} declares no dsh.bundle and will NOT auto-load — follow its README to wire it manually (e.g. an insert row in the profile cordis.patch.yml), then restart',
  agentHelp: 'Let the Agent handle it',
  agentHelpPrompt: 'I just installed the plugin {name} (source {spec}) from the plugin market and it is not taking effect. Please diagnose: check its install state, bundle declaration and profile wiring, complete whatever is needed (cordis.patch.yml rows, credentials, dependencies) and make sure it runs after a restart. Walk me through any configuration it needs.',
  owner: 'Owner',
  stars: 'Stars',
  category: 'Category',
  source: 'Source',
  version: 'Version',
  kind: 'Kind',
  repository: 'Repository',
  riskHigh: 'high',
  riskMedium: 'medium',
  riskLow: 'low',
  permRead: 'Read-only',
  permWrite: 'Workspace write',
  permSubprocess: 'Subprocess',
  permNetwork: 'Network',
  permEnv: 'Env vars',
  permEnvSensitive: 'Sensitive env',
  permCredentials: 'Credential access',
  permDynamic: 'Dynamic exec',
}

// Design language mirrors the official settings plugin inventory
// (`@deepseek-ai/dsh-client-ui-settings-plugin-inventory`) and permission UI:
// official tokens (--dsw-alias-*), 36px search input, compact two-column
// collapsible cards, 11px config tags, 7px status dots, dl-grid details,
// pill "selector" surfaces for the audit gate.
const CSS = `
.dshm-root{height:100%;display:flex;flex-direction:column;min-width:0;color:var(--dsw-alias-label-primary,#1f2328);position:relative}
.dshm-head{width:100%;max-width:760px;margin:0 auto;padding:4px 4px 12px;box-sizing:border-box}
.dshm-title{font-size:16px;font-weight:600;line-height:24px;margin:0}
.dshm-sub{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);margin-top:2px}
.dshm-search{margin-top:12px;width:100%;color:var(--dsw-alias-label-tertiary,#9ca3af);align-items:center;display:flex;position:relative}
.dshm-search>svg{pointer-events:none;position:absolute;left:12px}
.dshm-search input{border:1px solid var(--dsw-alias-border-l2,#d9d9d9);background:var(--dsw-alias-bg-layer-1,#fff);width:100%;height:36px;color:var(--dsw-alias-label-primary,#1f2328);font:inherit;border-radius:8px;outline:none;padding:0 34px 0 36px;font-size:13px;box-sizing:border-box}
.dshm-search input::placeholder{color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dshm-search input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#4f6ef7);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 18%,transparent)}
.dshm-browse{display:flex;gap:2px;background:var(--dsw-alias-bg-module-platform,#f3f4f6);border-radius:18px;padding:2px;margin-top:8px;width:fit-content}
.dshm-browse button{border:none;background:none;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b7280);padding:3px 12px;border-radius:16px;cursor:pointer}
.dshm-browse button.on{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-weight:500;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.dshm-tabs{display:flex;gap:2px;margin-top:10px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb)}
.dshm-tab{border:none;background:none;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,#6b7280);padding:7px 12px;cursor:pointer;border-bottom:2px solid transparent}
.dshm-tab.on{color:var(--dsw-alias-label-primary,#1f2328);border-bottom-color:var(--dsw-alias-state-business-primary,#4f6ef7);font-weight:600}
.dshm-banner{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:8px;padding:8px 12px;font-size:12px;line-height:18px;margin:10px 0 0;color:var(--dsw-alias-label-secondary,#6b7280);max-width:760px;width:100%;box-sizing:border-box;align-self:center}
.dshm-body{flex:1;overflow-y:auto;padding:12px 4px 24px}
.dshm-bodyInner{width:100%;max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px;box-sizing:border-box}
.dshm-catalogHeading{align-items:baseline;gap:7px;padding:0 2px;display:flex}
.dshm-catalogHeading h3{margin:0;font-size:13px;font-weight:600;line-height:20px}
.dshm-catalogHeading span{color:var(--dsw-alias-label-tertiary,#9ca3af);font-variant-numeric:tabular-nums;font-size:12px;line-height:18px}
.dshm-headingSort{display:flex;gap:2px;margin-left:auto}
.dshm-headingSort button{border:none;background:none;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);padding:0 4px;cursor:pointer}
.dshm-headingSort button.on{color:var(--dsw-alias-state-business-primary,#4f6ef7);font-weight:600}
.dshm-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start;gap:10px;margin:0;padding:0;list-style:none}
.dshm-card{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;min-width:0;overflow:hidden}
.dshm-card.dshm-open{border-color:var(--dsw-alias-border-l1,#d1d5db);box-shadow:var(--dsw-shadow-lv1,0 2px 8px rgba(0,0,0,.06))}
.dshm-cardContent{box-sizing:border-box;width:100%;min-height:52px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;display:flex}
.dshm-cardContent:hover,.dshm-card.dshm-open>.dshm-cardContent{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.03))}
.dshm-cardContent:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4f6ef7);outline-offset:-2px}
.dshm-cardTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:14px;font-weight:600;line-height:20px;overflow:hidden}
.dshm-cardTrailing{color:var(--dsw-alias-label-tertiary,#9ca3af);flex:none;align-items:center;gap:7px;display:inline-flex}
.dshm-statusDot{background:var(--dsw-alias-label-tertiary,#9ca3af);border-radius:999px;flex:none;width:7px;height:7px;display:inline-block}
.dshm-statusDot.on{background:var(--dsw-alias-state-success-primary,#16a34a)}
.dshm-statusDot.update{background:var(--dsw-alias-state-warn-primary,#ea580c)}
.dshm-configTag{background:var(--dsw-alias-bg-layer-1,#fff);min-height:20px;color:var(--dsw-alias-label-secondary,#6b7280);white-space:nowrap;border-radius:5px;align-items:center;padding:1px 6px;font-size:11px;line-height:16px;display:inline-flex}
.dshm-configTag.on{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 10%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
.dshm-configTag.warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#ea580c) 10%,transparent);color:var(--dsw-alias-state-warn-primary,#ea580c)}
.dshm-configTag.err{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 10%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshm-chevron{color:var(--dsw-alias-label-tertiary,#9ca3af);flex:none;display:inline-flex}
.dshm-card.dshm-open .dshm-chevron{transform:rotate(180deg)}
.dshm-cardDetails{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-module-platform,#f7f8fa);padding:10px 14px 12px}
.dshm-cardDesc{overflow-wrap:anywhere;margin:0 0 8px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:18px}
.dshm-entryValue{overflow-wrap:anywhere;color:var(--dsw-alias-label-primary,#1f2328);font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-size:12px;line-height:18px;display:block}
.dshm-details{grid-template-columns:76px minmax(0,1fr);gap:6px 10px;margin:8px 0 0;display:grid}
.dshm-details>div{display:contents}
.dshm-details dt{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:11px;line-height:17px}
.dshm-details dd{overflow-wrap:anywhere;min-width:0;color:var(--dsw-alias-label-secondary,#6b7280);margin:0;font-size:12px;line-height:17px}
.dshm-acts{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:10px}
.dshm-richCard{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;min-width:0;padding:12px 14px;display:flex;flex-direction:column;gap:8px}
.dshm-richTop{display:flex;align-items:center;gap:10px;min-width:0}
.dshm-av{width:32px;height:32px;border-radius:8px;display:grid;place-items:center;font-weight:600;color:#fff;font-size:14px;flex-shrink:0}
.dshm-richHead{min-width:0;flex:1}
.dshm-richTitle{font-size:14px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-richMeta{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-richDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b7280);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:36px}
.dshm-richFoot{display:flex;align-items:center;gap:8px}
.dshm-irow{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;min-width:0;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease}
.dshm-irow.dshm-irowSelected{border-color:var(--dsw-alias-state-success-primary,#16a34a);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 22%,transparent)}
.dshm-irow.dshm-irowOff{opacity:.55}
.dshm-irow.dshm-irowOff:hover{opacity:.85}
.dshm-irowTime{font-size:11px;line-height:18px;color:var(--dsw-alias-state-success-primary,#16a34a);margin-top:2px;font-variant-numeric:tabular-nums}
.dshm-irowMain{min-width:0;flex:1}
.dshm-irowTitle{font-size:14px;font-weight:600;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-irowVersion{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dshm-irowStatus{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);white-space:nowrap;flex-shrink:0}
.dshm-spec{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;display:block}
.dshm-irowDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b7280);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}
.dshm-grow{flex:1}
.dshm-src{font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af);text-decoration:none}
.dshm-src:hover{color:var(--dsw-alias-state-business-primary,#4f6ef7)}
.dshm-btn{border:1px solid transparent;background:0 0;border-radius:6px;padding:4px 10px;font:inherit;font-size:12px;line-height:18px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;text-decoration:none}
.dshm-btn.primary{background:var(--dsw-alias-state-business-primary,#4f6ef7);color:#fff;font-weight:500}
.dshm-btn.primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4f6ef7) 88%,#000)}
.dshm-btn.ghost{border-color:var(--dsw-alias-border-l2,#d9d9d9);color:var(--dsw-alias-label-primary,#1f2328)}
.dshm-btn.ghost:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.03))}
.dshm-btn.upd{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#ea580c) 10%,transparent);color:var(--dsw-alias-state-warn-primary,#ea580c);font-weight:500}
.dshm-btn.danger{border-color:var(--dsw-alias-state-error-primary,#dc2626);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshm-btn.danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 10%,transparent)}
.dshm-btn.danger.armed{background:var(--dsw-alias-state-error-primary,#dc2626);color:#fff}
.dshm-btn.done{color:var(--dsw-alias-state-success-primary,#16a34a);cursor:default}
.dshm-btn.busy{opacity:.65;cursor:default}
.dshm-dot{display:inline-block;width:7px;height:7px;border-radius:999px;background:var(--dsw-alias-state-error-primary,#ef4444);margin-left:5px;vertical-align:2px}
.dshm-loading{display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px;color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:13px}
.dshm-spin{width:22px;height:22px;border:3px solid var(--dsw-alias-border-l2,#e5e7eb);border-top-color:var(--dsw-alias-state-business-primary,#4f6ef7);border-radius:999px;animation:dshm-sp .8s linear infinite}
@keyframes dshm-sp{to{transform:rotate(360deg)}}
.dshm-progress{display:flex;align-items:center;gap:9px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-radius:8px;padding:8px 12px;font-size:12px;line-height:18px;margin:8px 0 0;color:var(--dsw-alias-label-secondary,#6b7280)}
.dshm-progress .dshm-spin{width:14px;height:14px;border-width:2px;flex-shrink:0}
.dshm-progress code{font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshm-empty{color:var(--dsw-alias-label-tertiary,#9ca3af);font-size:13px;line-height:20px;padding:24px;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px}
.dshm-err{color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px;margin:8px 0 0;white-space:pre-wrap;word-break:break-all;max-width:760px;width:100%;align-self:center}
.dshm-note{font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af);padding:0 2px}
.dshm-more{display:flex;justify-content:center;padding:4px 0 8px}
.dshm-mask{position:fixed;inset:0;background:rgba(15,18,25,.4);display:flex;align-items:center;justify-content:center;z-index:1000}
.dshm-modal{width:min(420px,90%);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;padding:18px 20px;box-shadow:var(--dsw-shadow-lv2,0 24px 70px rgba(0,0,0,.25))}
.dshm-modal h3{font-size:14px;font-weight:600;line-height:22px;margin:0 0 8px}
.dshm-modal p{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,#6b7280);margin:4px 0}
.dshm-cmd{font-size:12px;line-height:18px;background:var(--dsw-alias-bg-module-platform,#f7f8fa);border-radius:6px;padding:6px 9px;font-family:var(--ds-font-family-code,ui-monospace,Menlo,monospace);margin:8px 0;word-break:break-all}
.dshm-audit{border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;padding:12px 14px;margin:10px 0 0;max-width:760px;width:100%;box-sizing:border-box;align-self:center}
.dshm-audit-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.dshm-pill{background:var(--dsw-alias-bg-module-platform,#f3f4f6);min-height:30px;font:inherit;color:var(--dsw-alias-label-primary,#1f2328);border:none;border-radius:18px;align-items:center;gap:6px;padding:0 14px;font-size:13px;line-height:20px;display:inline-flex}
.dshm-pill.block{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 10%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
.dshm-audit-title{font-size:14px;font-weight:400;line-height:22px;color:var(--dsw-alias-label-primary,#1f2328)}
.dshm-audit-desc{font-size:12px;font-weight:400;line-height:18px;color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dshm-perm-tags{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.dshm-top{position:absolute;right:18px;bottom:18px;z-index:20;width:36px;height:36px;border-radius:18px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#6b7280);font-size:16px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}
.dshm-top:hover{color:var(--dsw-alias-state-business-primary,#4f6ef7)}
.dshm-toast{position:fixed;right:22px;bottom:22px;z-index:2000;background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;padding:13px 16px;box-shadow:var(--dsw-shadow-lv2,0 12px 40px rgba(0,0,0,.18));display:flex;align-items:center;gap:10px;font-size:13px;color:var(--dsw-alias-label-primary,#1f2328);pointer-events:auto;max-width:340px}
@media (width<=680px){.dshm-cards{grid-template-columns:minmax(0,1fr)}}
`

function injectStyles() {
  if (document.querySelector('style[data-plugin-css="dsh-market/market"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = "dshmarket"
  tag.dataset.pluginCss = 'dsh-market/market'
  tag.textContent = CSS
  document.head.appendChild(tag)
}

function repoOf(url) {
  const m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(url)
  return m ? m[1] : null
}

function readSession(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') } catch { return null }
}

/** Heuristic: plugins that target a terminal surface rather than the web UI. */
function looksTerminal(plugin, lang) {
  const desc = descOf(plugin, lang)
  return /\b(tui|cli|tty|terminal)\b|终端|命令行/i.test(plugin.name + ' ' + desc)
}

/** Search results carry plain-string descriptions; curated entries carry per-locale maps. */
function descOf(plugin, lang) {
  if (typeof plugin.description === 'string') return plugin.description
  return (plugin.description && (plugin.description[lang] || plugin.description.en)) || ''
}

function avatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return 'hsl(' + (((hash % 360) + 360) % 360) + ' 55% 52%)'
}

/** Built-in zh↔en domain thesaurus (same table as the host) for local search. */
const BILINGUAL_TERMS = [
  { zh: ['通知', '提醒', '弹窗', '推送'], en: ['notification', 'notify', 'alert', 'toast', 'push'] },
  { zh: ['终端', '命令行', '命令'], en: ['terminal', 'cli', 'tty', 'shell', 'command'] },
  { zh: ['记忆', '上下文', '历史'], en: ['memory', 'context', 'history'] },
  { zh: ['聊天', '对话'], en: ['chat', 'conversation'] },
  { zh: ['微信'], en: ['wechat', 'weixin'] },
  { zh: ['钉钉'], en: ['dingtalk'] },
  { zh: ['邮件', '邮箱'], en: ['email', 'mail', 'smtp'] },
  { zh: ['翻译', '本地化'], en: ['translate', 'translation', 'i18n'] },
  { zh: ['日历', '日程'], en: ['calendar', 'schedule'] },
  { zh: ['待办', '任务', '事项'], en: ['todo', 'task'] },
  { zh: ['搜索', '检索'], en: ['search'] },
  { zh: ['文件', '目录'], en: ['file', 'fs', 'directory'] },
  { zh: ['图片', '图像', '照片'], en: ['image', 'picture', 'photo'] },
  { zh: ['截图'], en: ['screenshot', 'capture'] },
  { zh: ['音频', '语音', '声音', '听写'], en: ['audio', 'voice', 'speech', 'transcribe'] },
  { zh: ['视频', '录制'], en: ['video', 'record'] },
  { zh: ['下载'], en: ['download'] },
  { zh: ['浏览器', '网页'], en: ['browser', 'web'] },
  { zh: ['工作流', '流程'], en: ['workflow', 'flow'] },
  { zh: ['主题', '外观', '皮肤'], en: ['theme', 'style'] },
  { zh: ['快捷键', '热键'], en: ['shortcut', 'hotkey'] },
  { zh: ['表格'], en: ['sheet', 'spreadsheet', 'table'] },
  { zh: ['文档'], en: ['doc', 'document'] },
  { zh: ['知识库'], en: ['knowledge', 'wiki'] },
  { zh: ['定时', '计划', '周期'], en: ['timer', 'cron', 'periodic', 'schedule'] },
  { zh: ['审批', '批准', '同意'], en: ['approval', 'approve'] },
  { zh: ['安全', '审计', '扫描'], en: ['security', 'audit', 'scan'] },
  { zh: ['智能体', '代理'], en: ['agent'] },
  { zh: ['技能'], en: ['skill'] },
  { zh: ['总结', '摘要'], en: ['summary', 'summarize'] },
  { zh: ['消息', '信息'], en: ['message'] },
  { zh: ['天气'], en: ['weather'] },
  { zh: ['音乐', '歌曲'], en: ['music', 'song'] },
  { zh: ['股票', '行情'], en: ['stock'] },
  { zh: ['市场', '商城'], en: ['market', 'marketplace'] },
  { zh: ['会议', '纪要', '转录'], en: ['meeting', 'minutes', 'transcript'] },
  { zh: ['识别', '识图', 'OCR'], en: ['ocr', 'recognize', 'vision'] },
  { zh: ['日志'], en: ['log', 'logging'] },
  { zh: ['存储'], en: ['storage'] },
  { zh: ['数据库'], en: ['database', 'db'] },
  { zh: ['会话'], en: ['session'] },
  { zh: ['工作区'], en: ['workspace'] },
  { zh: ['模型'], en: ['model', 'llm'] },
  { zh: ['语音识别'], en: ['speech', 'asr', 'stt'] },
]

/** Expand a query with zh↔en thesaurus equivalents (mirrors the host side). */
function expandQuery(q) {
  const text = String(q).toLowerCase()
  const terms = new Set()
  if (text !== '') terms.add(text)
  const cjk = /[\u4e00-\u9fff]/.test(text)
  for (const row of BILINGUAL_TERMS) {
    const from = cjk ? row.zh : row.en
    const to = cjk ? row.en : row.zh
    if (from.some(term => text.includes(term))) for (const t of to) terms.add(t)
  }
  return [...terms]
}

/** Millisecond epoch → 'YYYY-MM-DD HH:mm' local string. */
function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  const pad = n => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** A plugin counts as installed when its package name, npm name, or GitHub spec appears in the profile dependencies. */
function isInstalled(plugin, installed) {
  if (installed[plugin.name] !== undefined) return true
  if (plugin.npm && installed[plugin.npm] !== undefined) return true
  const repo = repoOf(plugin.url)
  if (repo === null) return false
  const needle = ('github:' + repo).toLowerCase()
  return Object.values(installed).some(spec => String(spec).toLowerCase().includes(needle))
}

function riskLabel(risk, t) {
  if (risk === 'review') return t('riskHigh')
  if (risk === 'notice') return t('riskMedium')
  if (risk === 'info') return t('riskLow')
  return '?'
}

/** Permission summary as official preset-style chips; danger = flagged capability. */
function auditChips(t, audit, hooks) {
  const chips = []
  if (audit && audit.permissions) {
    const p = audit.permissions
    if (p.fsWrite) chips.push({ label: t('permWrite'), danger: true })
    else if (p.fsRead) chips.push({ label: t('permRead'), danger: false })
    if (p.subprocess) chips.push({ label: t('permSubprocess'), danger: true })
    if (p.network) chips.push({ label: t('permNetwork') + (Array.isArray(p.hosts) && p.hosts.length ? ' · ' + p.hosts.length : ''), danger: true })
    if (Array.isArray(p.sensitiveEnvVars) && p.sensitiveEnvVars.length) chips.push({ label: t('permEnvSensitive') + ' · ' + p.sensitiveEnvVars.length, danger: true })
    else if (Array.isArray(p.envVars) && p.envVars.length) chips.push({ label: t('permEnv') + ' · ' + p.envVars.length, danger: false })
    if (Array.isArray(p.credentialPaths) && p.credentialPaths.length) chips.push({ label: t('permCredentials'), danger: true })
    if (p.dynamicExec) chips.push({ label: t('permDynamic'), danger: true })
  }
  if (Array.isArray(hooks) && hooks.length) chips.push({ label: t('auditHooks') + ' · ' + hooks.map(hh => hh.hook).join(', '), danger: true })
  return chips
}

function searchIcon() {
  return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
    h('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.5 }),
    h('path', { d: 'M10.5 10.5 14 14', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }))
}

function MarketSection(props) {
  const t = props.t
  const localeSnap = React.useSyncExternalStore(
    cb => props.locale.subscribe(cb),
    () => props.locale.getSnapshot(),
  )
  const lang = String(localeSnap.active).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [installed, setInstalled] = useState({})
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem('dshm-tab')
    if (saved !== null) sessionStorage.removeItem('dshm-tab')
    return saved || 'discover'
  })
  const [q, setQ] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [busyUrl, setBusyUrl] = useState(null)
  const [doneUrls, setDoneUrls] = useState([])
  const [installError, setInstallError] = useState(null)
  const [updates, setUpdates] = useState({})
  const [updatingName, setUpdatingName] = useState(null)
  const [updatedNames, setUpdatedNames] = useState([])
  const [hotUrls, setHotUrls] = useState([])
  const [hotNames, setHotNames] = useState([])
  const [progressLine, setProgressLine] = useState(null)
  const [removeArmed, setRemoveArmed] = useState(null)
  const [removingName, setRemovingName] = useState(null)
  const [removedCount, setRemovedCount] = useState(0)
  const [envReady, setEnvReady] = useState(true)
  const [envFixing, setEnvFixing] = useState(false)
  const [envFailed, setEnvFailed] = useState(false)
  const [bootId, setBootId] = useState(null)
  const [showTop, setShowTop] = useState(false)
  const [sort, setSort] = useState('hot')
  const [browseAll, setBrowseAll] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMeta, setSearchMeta] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [searchNonce, setSearchNonce] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [auditBlock, setAuditBlock] = useState(null)
  const [bundleless, setBundleless] = useState(null)
  const [installedTimeDesc, setInstalledTimeDesc] = useState(true)
  const [installedTimes, setInstalledTimes] = useState({})
  const [selectedName, setSelectedName] = useState(null)
  const [entries, setEntries] = useState([])
  const [togglingId, setTogglingId] = useState(null)
  const [gateOn, setGateOn] = useState(true)
  const bodyRef = React.useRef(null)
  // Pagination bookkeeping kept in refs so "load more" always appends exactly
  // one page of NEW items (GitHub's star-ranked pages drift slightly over
  // time; extra fetched items buffer for the next click instead of dupes).
  const searchQueryRef = React.useRef('')
  const searchMetaRef = React.useRef(null)
  const seenRef = React.useRef(new Set())
  const bufferRef = React.useRef([])
  const nextPageRef = React.useRef(1)
  const sortRef = React.useRef('hot')
  useEffect(() => { sortRef.current = sort }, [sort])

  const refreshInstalled = useCallback((force) => {
    fetch('/dsh-market/installed', { cache: 'no-store' })
      .then(res => res.json())
      .then(body => {
        setInstalled(body.installed || {})
        setInstalledTimes(body.times || {})
      })
      .catch(() => {})
    fetch('/dsh-market/updates' + (force === true ? '?force=1' : ''), { cache: 'no-store' })
      .then(res => res.json())
      .then(body => setUpdates(body.updates || {}))
      .catch(() => {})
  }, [])

  const refreshEntries = useCallback(() => {
    fetch('/dsh-market/entries', { cache: 'no-store' })
      .then(res => res.json())
      .then(body => setEntries(Array.isArray(body.entries) ? body.entries : []))
      .catch(() => {})
  }, [])

  /** Hot enable/disable of a loader row (the market's own row is protected). */
  const doToggle = useCallback((rowId, enable) => {
    setTogglingId(rowId)
    setInstallError(null)
    fetch('/dsh-market/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: rowId, enable }),
    })
      .then(res => res.json().then(body => ({ status: res.status, body })))
      .then(({ status, body }) => {
        if (status === 200 && body.ok) {
          setEntries(Array.isArray(body.entries) ? body.entries : [])
        } else {
          const text = v => typeof v === 'string' ? v : (v && typeof v.text === 'string') ? v.text : v == null ? '' : JSON.stringify(v)
          setInstallError((text(body.error) || 'error').trim().slice(-300))
        }
      })
      .catch(error => setInstallError(String(error)))
      .finally(() => setTogglingId(null))
  }, [])

  useEffect(() => {
    injectStyles()
    fetch('/dsh-market/registry', { cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json() })
      .then(body => setData(body.registry))
      .catch(() => setLoadError(true))
    fetch('/dsh-market/status', { cache: 'no-store' })
      .then(res => res.json())
      .then(status => {
        setEnvReady(status.pnpm !== false)
        if (typeof status.boot === 'string') setBootId(status.boot)
        if (typeof status.auditGate === 'boolean') setGateOn(status.auditGate)
      })
      .catch(() => {})
    refreshInstalled()
    refreshEntries()
  }, [refreshInstalled, refreshEntries])

  // Pending-restart flags survive tab switches and page reloads, scoped to
  // one host process: a different boot id means the restart happened and the
  // stale banner must not resurrect.
  useEffect(() => {
    if (bootId === null) return
    const saved = readSession('dshm-restart')
    if (saved === null) return
    if (saved.boot !== bootId) {
      sessionStorage.removeItem('dshm-restart')
      return
    }
    if (Array.isArray(saved.doneUrls) && saved.doneUrls.length > 0) setDoneUrls(saved.doneUrls)
    if (Array.isArray(saved.updated) && saved.updated.length > 0) setUpdatedNames(saved.updated)
    if (typeof saved.removed === 'number' && saved.removed > 0) setRemovedCount(saved.removed)
  }, [bootId])

  useEffect(() => {
    if (bootId === null) return
    if (doneUrls.length === 0 && updatedNames.length === 0 && removedCount === 0) return
    sessionStorage.setItem('dshm-restart', JSON.stringify({
      boot: bootId,
      doneUrls,
      updated: updatedNames,
      removed: removedCount,
    }))
  }, [bootId, doneUrls, updatedNames, removedCount])

  /** Raw GitHub-side page fetch; mutates only the meta ref. */
  const fetchPageRaw = useCallback((query, page) => {
    const url = '/dsh-market/search?q=' + encodeURIComponent(query) + '&lang=' + lang
      + (query === '' ? '&limit=50' : '&limit=20') + '&page=' + page
      + '&sort=' + (sortRef.current === 'new' ? 'new' : 'hot')
    return fetch(url, { cache: 'no-store' })
      .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json() })
      .then(body => {
        searchMetaRef.current = {
          note: typeof body.note === 'string' ? body.note : '',
          rateLimited: body.rateLimited === true,
          retryAfterSeconds: Number(body.retryAfterSeconds) || 0,
          hasMore: body.hasMore === true,
          page: Number(body.page) || 1,
          total: Number(body.total) || 0,
          fetchable: Number(body.fetchable) || 0,
          perPage: Number(body.perPage) || (query === '' ? 50 : 20),
          translatedTerms: Array.isArray(body.translatedTerms) ? body.translatedTerms : [],
        }
        return body
      })
      .catch(() => null)
  }, [lang])

  const applySearchMeta = useCallback(() => {
    setSearchMeta(searchMetaRef.current ? { ...searchMetaRef.current } : null)
  }, [])

  /** Fresh search/browse (page 1): reset pagination bookkeeping and show it. */
  const fetchSearchPage = useCallback((query, page) => {
    searchQueryRef.current = query
    return fetchPageRaw(query, page).then(body => {
      if (body === null) {
        setSearchResults([])
        setSearchQuery(query)
        setSearchFailed(true)
        applySearchMeta()
        return
      }
      setSearchQuery(query)
      const items = Array.isArray(body.results) ? body.results : []
      seenRef.current = new Set(items.map(r => r.url.toLowerCase()))
      bufferRef.current = []
      nextPageRef.current = (Number(body.page) || 1) + 1
      setSearchResults(items)
      setSearchFailed(false)
      applySearchMeta()
    })
  }, [fetchPageRaw, applySearchMeta])

  // Community search/browse behind the search box; the curated registry stays
  // the default for an empty query unless "All community" is on.
  useEffect(() => {
    const query = q.trim()
    if (query === '' && !browseAll) {
      setSearchResults([])
      setSearchMeta(null)
      searchMetaRef.current = null
      searchQueryRef.current = ''
      setSearchQuery('')
      setSearching(false)
      setSearchFailed(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(() => {
      fetchSearchPage(query, 1).finally(() => setSearching(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [q, lang, searchNonce, browseAll, sort, fetchSearchPage])

  /** "Load more": keep fetching GitHub pages until one full page of NEW items
   *  is collected (drift-tolerant); surplus stays buffered for the next click,
   *  so every click appends exactly perPage items until the listing ends. */
  const loadMore = useCallback(() => {
    if (loadingMore) return
    const query = searchQueryRef.current
    const per = searchMetaRef.current?.perPage || 50
    setLoadingMore(true)
    ;(async () => {
      try {
        let collected = 0
        let guard = 0
        while (collected < per && guard < 10) {
          const pageNo = nextPageRef.current
          const body = await fetchPageRaw(query, pageNo)
          if (body === null) break
          nextPageRef.current = pageNo + 1
          const items = Array.isArray(body.results) ? body.results : []
          if (items.length === 0) break
          for (const r of items) {
            const key = r.url.toLowerCase()
            if (seenRef.current.has(key)) continue
            seenRef.current.add(key)
            bufferRef.current.push(r)
            collected++
          }
          guard++
          if (items.length < per || body.hasMore !== true) break
        }
        const take = Math.min(per, bufferRef.current.length)
        if (take > 0) {
          const shown = bufferRef.current.splice(0, take)
          setSearchResults(prev => prev.concat(shown))
        }
        applySearchMeta()
      }
      finally {
        setLoadingMore(false)
      }
    })()
  }, [loadingMore, fetchPageRaw, applySearchMeta])

  const fixEnv = useCallback(() => {
    setEnvFixing(true)
    setEnvFailed(false)
    fetch('/dsh-market/setup-pnpm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(res => res.json())
      .then(body => {
        if (body.ok) setEnvReady(true)
        else setEnvFailed(true)
      })
      .catch(() => setEnvFailed(true))
      .finally(() => setEnvFixing(false))
  }, [])

  /** Hand the plugin's setup off to the Agent: jump to a fresh session with
   *  a pre-filled diagnosis prompt. */
  const agentHelp = useCallback((name) => {
    const spec = installed[name] !== undefined ? String(installed[name]) : ''
    const prompt = t('agentHelpPrompt').replace('{name}', name).replace('{spec}', spec || '—')
    if (typeof props.openAgentSession === 'function') props.openAgentSession(prompt)
  }, [installed, t, props.openAgentSession])

  // Recover an install whose HTTP response was lost (page navigated away or
  // the connection dropped): the pending marker survives in sessionStorage and
  // the poll below converges the button state from the host's ground truth.
  useEffect(() => {
    const pending = readSession('dshm-pending')
    if (pending !== null && typeof pending.url === 'string') setBusyUrl(pending.url)
  }, [])

  useEffect(() => {
    if (busyUrl === null && updatingName === null) {
      setProgressLine(null)
      return
    }
    const timer = setInterval(() => {
      fetch('/dsh-market/status', { cache: 'no-store' })
        .then(res => res.json())
        .then(status => {
          if (status.active) {
            setProgressLine((status.lastLine || '…') + '  (' + status.seconds + 's)')
          } else if (status.auditing === true) {
            setProgressLine(t('auditingPhase'))
          } else {
            setProgressLine(null)
            setInstalled(status.installed || {})
            const pending = readSession('dshm-pending')
            if (pending !== null && busyUrl !== null) {
              const nowInstalled = data !== null && data.plugins.some(p =>
                p.url === busyUrl && isInstalled(p, status.installed || {}))
              if (nowInstalled) {
                sessionStorage.removeItem('dshm-pending')
                setDoneUrls(urls => urls.includes(busyUrl) ? urls : urls.concat(busyUrl))
                setBusyUrl(null)
              }
            }
          }
        })
        .catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [busyUrl, updatingName, data, t])

  const plugins = useMemo(() => {
    const query = q.trim()
    if ((browseAll || query !== '') && searchQuery === query) return searchResults
    if (data === null) return []
    const needle = query.toLowerCase()
    const terms = needle === '' ? [] : expandQuery(needle)
    const list = data.plugins.filter(p => {
      if (needle === '') return true
      const cat = data.categories[p.category]
      const hay = [p.name, p.owner, p.npm || '', descOf(p, 'zh'), descOf(p, 'en'), cat && cat.zh || '', cat && cat.en || ''].join(' ').toLowerCase()
      return terms.some(term => term !== '' && hay.includes(term))
    })
    if (sort === 'hot') return [...list].sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1))
    if (sort === 'new') return [...list].sort((a, b) => String(b.added).localeCompare(String(a.added)))
    return list
  }, [data, q, browseAll, searchResults, searchQuery, sort, lang])

  const doInstall = useCallback((plugin) => {
    setConfirming(null)
    setInstallError(null)
    setAuditBlock(null)
    setBusyUrl(plugin.url)
    sessionStorage.setItem('dshm-pending', JSON.stringify({ url: plugin.url }))
    fetch('/dsh-market/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: plugin.url, community: plugin.curated === false }),
    })
      .then(res => res.json().then(body => ({ status: res.status, body })))
      .then(({ status, body }) => {
        sessionStorage.removeItem('dshm-pending')
        if (status === 200 && body.ok) {
          sessionStorage.setItem('dshm-tab', 'installed')
          if (body.hot) {
            setHotUrls(urls => urls.includes(plugin.url) ? urls : urls.concat(plugin.url))
            setHotNames(names => names.includes(plugin.name) ? names : names.concat(plugin.name))
          } else {
            setDoneUrls(urls => urls.includes(plugin.url) ? urls : urls.concat(plugin.url))
          }
          if (Array.isArray(body.bundleless) && body.bundleless.length > 0) setBundleless(body.bundleless)
          refreshInstalled()
        } else if (body.audit !== undefined && body.audit !== null) {
          setAuditBlock({ name: plugin.name, audit: body.audit, hooks: Array.isArray(body.hooks) ? body.hooks : [] })
        } else {
          const text = v => typeof v === 'string' ? v : (v && typeof v.text === 'string') ? v.text : v == null ? '' : JSON.stringify(v)
          const detail = text(body.error) || text(body.stderr) || text(body.stdout) || ('exit ' + body.exitCode)
          setInstallError(t('installFail') + ': ' + plugin.name + ' — ' + detail.trim().slice(-600))
        }
      })
      .catch(error => {
        sessionStorage.removeItem('dshm-pending')
        setInstallError(t('installFail') + ': ' + String(error))
      })
      .finally(() => setBusyUrl(null))
  }, [refreshInstalled, t])

  const doUpdate = useCallback((name) => {
    setInstallError(null)
    setAuditBlock(null)
    setUpdatingName(name)
    fetch('/dsh-market/update', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(res => res.json().then(body => ({ status: res.status, body })))
      .then(({ status, body }) => {
        if (status === 200 && body.ok) {
          setUpdatedNames(names => names.concat(name))
          refreshInstalled()
        } else if (body.audit !== undefined && body.audit !== null) {
          setAuditBlock({ name, audit: body.audit, hooks: Array.isArray(body.hooks) ? body.hooks : [] })
        } else {
          const text = v => typeof v === 'string' ? v : (v && typeof v.text === 'string') ? v.text : v == null ? '' : JSON.stringify(v)
          const detail = text(body.error) || text(body.stderr) || text(body.stdout) || ('exit ' + body.exitCode)
          setInstallError(t('updateFail') + ': ' + name + ' — ' + detail.trim().slice(-600))
        }
      })
      .catch(error => setInstallError(t('updateFail') + ': ' + String(error)))
      .finally(() => setUpdatingName(null))
  }, [refreshInstalled, t])

  const doUninstall = useCallback((name) => {
    setRemoveArmed(null)
    setInstallError(null)
    setRemovingName(name)
    fetch('/dsh-market/uninstall', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(res => res.json().then(body => ({ status: res.status, body })))
      .then(({ status, body }) => {
        if (status === 200 && body.ok) {
          if (!body.hot) setRemovedCount(n => n + 1)
          refreshInstalled()
        } else {
          const text = v => typeof v === 'string' ? v : (v && typeof v.text === 'string') ? v.text : v == null ? '' : JSON.stringify(v)
          setInstallError((text(body.error) || text(body.stderr) || 'error').trim().slice(-600))
        }
      })
      .catch(error => setInstallError(String(error)))
      .finally(() => setRemovingName(null))
  }, [refreshInstalled])

  const pendingRestart = doneUrls.length + updatedNames.length + removedCount
  const hasUpdates = Object.keys(installed).some(
    name => !updatedNames.includes(name) && updates[name] && updates[name].updateAvailable,
  )

  /** Rich card for the curated catalog: avatar, description, stars and the
   *  install button all visible up front, like the market's original look
   *  (official tokens for type/sizes/colors). With `showTier`, community
   *  browse/search results carry a 精选/社区 tag next to the title. */
  const renderRichCard = (p, showTier) => {
    const desc = descOf(p, lang)
    const done = doneUrls.includes(p.url) || hotUrls.includes(p.url)
    const already = isInstalled(p, installed)
    const busy = busyUrl === p.url
    const catLabel = (data !== null && data.categories[p.category] && (data.categories[p.category][lang] || data.categories[p.category].en)) || p.category || ''
    const letter = p.name.replace(/^@[^/]+\//, '').replace(/^dsh[-_]/i, '').charAt(0).toUpperCase() || 'P'
    return h('div', { key: p.url, className: 'dshm-richCard' },
      h('div', { className: 'dshm-richTop' },
        h('div', { className: 'dshm-av', style: { background: avatarColor(p.name) } }, letter),
        h('div', { className: 'dshm-richHead' },
          h('div', { className: 'dshm-richTitle', title: p.name }, p.name),
          h('div', { className: 'dshm-richMeta' }, p.owner,
            typeof p.stars === 'number' && ' · ★ ' + p.stars)),
        showTier && (p.curated === false
          ? h('span', { className: 'dshm-configTag' }, t('communityBadge'))
          : h('span', { className: 'dshm-configTag on' }, t('curatedTag'))),
        done
          ? h('span', { className: 'dshm-btn done' }, t('installedBadge'))
          : already
            ? h('span', { className: 'dshm-btn done' }, t('alreadyInstalled'))
            : busy
              ? h('button', { className: 'dshm-btn primary busy', disabled: true }, t('installing'))
              : h('button', {
                  className: 'dshm-btn primary',
                  disabled: busyUrl !== null || !envReady || (p.curated === false && !gateOn),
                  title: (p.curated === false && !gateOn) ? t('auditGateOff') : undefined,
                  onClick: () => setConfirming(p),
                }, t('install'))),
      h('div', { className: 'dshm-richDesc', title: desc }, desc),
      busy && h('div', { className: 'dshm-progress' },
        h('span', { className: 'dshm-spin' }),
        h('code', { className: 'dshm-grow' }, progressLine || t('progressHint'))),
      h('div', { className: 'dshm-richFoot' },
        catLabel !== '' && h('span', { className: 'dshm-configTag' }, catLabel),
        h('span', { className: 'dshm-grow' }),
        h('a', { className: 'dshm-src', href: p.url, target: '_blank', rel: 'noreferrer' }, t('viewSource'))))
  }

  const query = q.trim()
  const browsing = browseAll && query === ''
  const searchActive = browseAll || query !== ''

  const discoverBody = (() => {
    if (searchActive) {
      if (searching || searchQuery !== query) {
        return h('div', { className: 'dshm-loading' }, h('span', { className: 'dshm-spin' }), t('searching'))
      }
      if (searchFailed && searchResults.length === 0) {
        return h('div', { className: 'dshm-empty' }, t('searchFail'), ' ',
          h('button', { className: 'dshm-btn ghost', onClick: () => setSearchNonce(n => n + 1) }, t('retry')))
      }
      return h(React.Fragment, null,
        h('div', { className: 'dshm-catalogHeading' },
          h('h3', null, browsing ? t('browseAll') : t('searchResults')),
          h('span', null, searchResults.length + (searchMeta && searchMeta.total ? ' / ' + searchMeta.total : '')),
          browsing && h('span', { className: 'dshm-configTag' }, t('mixedNote')),
          h('div', { className: 'dshm-headingSort' },
            ['hot', 'new'].map(key => h('button', {
              key,
              className: sort === key ? 'on' : '',
              onClick: () => setSort(key),
            }, t(key === 'hot' ? 'sortHot' : 'sortNew'))))),
        searchMeta && searchMeta.rateLimited && h('div', { className: 'dshm-note' }, '⚠️ ' + t('searchRateLimited')
          + (searchMeta.retryAfterSeconds ? ' (~' + Math.max(1, Math.ceil(searchMeta.retryAfterSeconds / 60)) + ' min)' : '')),
        searchResults.length > 0 && h('div', { className: 'dshm-note' },
          (browsing ? t('browseAllHint') : t('searchNote'))
          + (searchMeta && searchMeta.translatedTerms && searchMeta.translatedTerms.length > 0
            ? ' · ' + t('translatedAs') + ': ' + searchMeta.translatedTerms.slice(0, 4).join(', ')
            : '')),
        searchResults.length === 0
          ? h('div', { className: 'dshm-empty' }, t('empty'))
          : h('div', { className: 'dshm-cards' }, searchResults.map(p => renderRichCard(p, true))),
        searchMeta && searchMeta.hasMore && h('div', { className: 'dshm-more' },
          h('button', { className: 'dshm-btn ghost', disabled: loadingMore, onClick: loadMore },
            loadingMore ? t('loadingMore') : t('more') + ' · ' + searchResults.length + ' / ' + searchMeta.total)),
        searchMeta && !searchMeta.hasMore && searchMeta.total > searchMeta.fetchable && searchMeta.fetchable > 0
          && h('div', { className: 'dshm-note' }, t('githubCapNote')
            .replace('{fetchable}', String(searchMeta.fetchable))
            .replace('{total}', String(searchMeta.total))))
    }
    if (loadError) return h('div', { className: 'dshm-empty' }, t('loadFail'))
    if (data === null) return h('div', { className: 'dshm-loading' }, h('span', { className: 'dshm-spin' }), t('loading'))
    return h(React.Fragment, null,
      h('div', { className: 'dshm-catalogHeading' },
        h('h3', null, t('tabDiscover')),
        h('span', null, plugins.length),
        h('div', { className: 'dshm-headingSort' },
          ['hot', 'new'].map(key => h('button', {
            key,
            className: sort === key ? 'on' : '',
            onClick: () => setSort(key),
          }, t(key === 'hot' ? 'sortHot' : 'sortNew'))))),
      plugins.length === 0
        ? h('div', { className: 'dshm-empty' }, t('empty'))
        : h('div', { className: 'dshm-cards' }, plugins.map(renderRichCard)))
  })()

  const installedEntries = Object.entries(installed)
  installedEntries.sort((a, b) => (installedTimes[b[0]]?.installed ?? 0) - (installedTimes[a[0]]?.installed ?? 0))
  if (!installedTimeDesc) installedEntries.reverse()

  const installedBody = installedEntries.length === 0
    ? h('div', { className: 'dshm-empty' }, t('installedEmpty'))
    : h(React.Fragment, null,
        h('div', { className: 'dshm-catalogHeading' },
          h('h3', null, t('tabInstalled')),
          h('span', null, installedEntries.length),
          h('div', { className: 'dshm-headingSort' },
            h('button', {
              className: 'on',
              title: installedTimeDesc ? t('sortTimeNew') : t('sortTimeOld'),
              onClick: () => setInstalledTimeDesc(v => !v),
            }, t('sortTime') + (installedTimeDesc ? ' ↓' : ' ↑')))),
        installedEntries.map(([name, spec]) => {
          const entry = data === null ? undefined : data.plugins.find(p => p.name === name
            || (repoOf(p.url) !== null && String(spec).toLowerCase().includes(('github:' + repoOf(p.url)).toLowerCase())))
          const status = updates[name]
          const version = status && status.version ? 'v' + status.version : ''
          const specText = String(spec)
          const ghSpec = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:#|$)/.exec(specText)
          const repoUrl = entry !== undefined ? entry.url : ghSpec !== null ? 'https://github.com/' + ghSpec[1] : null
          const updAvailable = !!(status && status.updateAvailable)
          const timeInfo = installedTimes[name]
          const timeTitle = (timeInfo?.installed || timeInfo?.updated)
            ? t('installedAt') + ': ' + (fmtTime(timeInfo.installed) || '—') + '\n' + t('updatedAt') + ': ' + (fmtTime(timeInfo.updated) || '—')
            : ''
          const loaderRow = entries.find(r => r.name === name)
          const isMarket = name === 'dsh-market' || name === 'dshmarket'
          const rowDisabled = loaderRow !== undefined && loaderRow.disabled === true
          return h('div', {
            key: name,
            className: 'dshm-irow' + (selectedName === name ? ' dshm-irowSelected' : '') + (rowDisabled ? ' dshm-irowOff' : ''),
            title: timeTitle,
            onClick: e => {
              if (e.target.closest('button, a')) return
              setSelectedName(selectedName === name ? null : name)
            },
          },
            h('div', { className: 'dshm-irowMain', title: timeTitle },
              h('div', { className: 'dshm-irowTitle', title: name }, name,
                version !== '' && h('span', { className: 'dshm-irowVersion' }, ' ' + version),
                rowDisabled && h('span', { className: 'dshm-configTag', style: { marginLeft: '6px' } }, t('disabledTag'))),
              repoUrl !== null
                ? h('a', { className: 'dshm-spec dshm-src', href: repoUrl, target: '_blank', rel: 'noreferrer' }, specText)
                : h('span', { className: 'dshm-spec' }, specText),
              entry !== undefined && h('div', { className: 'dshm-irowDesc' }, descOf(entry, lang)),
              selectedName === name && h('div', { className: 'dshm-irowTime' },
                t('installedAt') + ': ' + (fmtTime(timeInfo?.installed) || '—') + ' · ' + t('updatedAt') + ': ' + (fmtTime(timeInfo?.updated) || '—')),
              updatingName === name && h('div', { className: 'dshm-progress' },
                h('span', { className: 'dshm-spin' }),
                h('code', { className: 'dshm-grow' }, progressLine || t('progressHint')))),
            h('span', { className: 'dshm-grow' }),
            updatedNames.includes(name)
              ? h('span', { className: 'dshm-irowStatus', style: { color: 'var(--dsw-alias-state-success-primary,#16a34a)' } }, t('updated'))
              : updatingName === name
                ? h('span', { className: 'dshm-irowStatus' }, t('updating'))
                : updAvailable
                  ? null
                  : h('span', { className: 'dshm-irowStatus' }, status && status.kind === 'linked' ? t('linkedDev') : t('upToDate')),
            isMarket
              ? h('span', { className: 'dshm-irowStatus', title: t('marketLock') }, '🔒')
              : loaderRow !== undefined && h('button', {
                  className: 'dshm-btn ghost' + (togglingId === loaderRow.id ? ' busy' : ''),
                  disabled: togglingId !== null || busyUrl !== null,
                  onClick: () => doToggle(loaderRow.id, rowDisabled),
                }, rowDisabled ? t('enable') : t('disable')),
            !isMarket && loaderRow === undefined && h('span', { className: 'dshm-configTag', title: t('notPluginHint') }, t('notPlugin')),
            repoUrl !== null && h('a', { className: 'dshm-btn ghost', href: repoUrl + '#readme', target: '_blank', rel: 'noreferrer' }, t('readme')),
            updAvailable && h('button', {
              className: 'dshm-btn upd',
              disabled: updatingName !== null || busyUrl !== null,
              onClick: () => doUpdate(name),
            }, t('update')),
            name !== 'dsh-market' && name !== 'dshmarket' && (
              removingName === name
                ? h('button', { className: 'dshm-btn danger busy', disabled: true }, t('uninstalling'))
                : removeArmed === name
                  ? h('button', {
                      className: 'dshm-btn danger armed',
                      onClick: () => doUninstall(name),
                      onMouseLeave: () => setRemoveArmed(null),
                    }, t('confirmRemove'))
                  : h('button', {
                      className: 'dshm-btn danger',
                      disabled: removingName !== null || busyUrl !== null || updatingName !== null,
                      onClick: () => setRemoveArmed(name),
                    }, t('uninstall'))),
          )
        }))

  const auditFindings = auditBlock !== null && auditBlock.audit && Array.isArray(auditBlock.audit.findings)
    ? auditBlock.audit.findings.filter(f => f.severity === 'review').slice(0, 6)
    : []

  return h('div', { className: 'dshm-root' },
    h('div', { className: 'dshm-head' },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
        h('h2', { className: 'dshm-title' }, t('nav')),
        (() => {
          const self = installed['dshmarket'] !== undefined ? 'dshmarket' : 'dsh-market'
          return updates[self] && updates[self].updateAvailable && !updatedNames.includes(self)
            && h('button', {
              className: 'dshm-btn upd',
              style: { fontSize: '11px', padding: '3px 10px' },
              disabled: updatingName !== null || busyUrl !== null,
              onClick: () => { setTab('installed'); doUpdate(self) },
            }, updatingName === self ? t('updating') : t('marketUpdate'))
        })()),
      h('div', { className: 'dshm-sub' },
        t('subtitle'), ' · ',
        h('a', { className: 'dshm-src', href: '/dsh-market/logs', download: 'dsh-market-log.txt' }, t('exportLog'))),
      h('label', { className: 'dshm-search' },
        searchIcon(),
        h('input', {
          type: 'search',
          placeholder: t('searchPh'),
          value: q,
          onChange: e => setQ(e.target.value),
          'aria-label': t('searchPh'),
        })),
      tab === 'discover' && h('div', { className: 'dshm-browse', title: t('browseAllHint') },
        h('button', { className: !browseAll ? 'on' : '', onClick: () => setBrowseAll(false) }, t('browseCurated')),
        h('button', { className: browseAll ? 'on' : '', onClick: () => setBrowseAll(true) }, t('browseAll'))),
      h('div', { className: 'dshm-tabs' },
        h('button', { className: 'dshm-tab' + (tab === 'discover' ? ' on' : ''), onClick: () => setTab('discover') }, t('tabDiscover')),
        h('button', { className: 'dshm-tab' + (tab === 'installed' ? ' on' : ''), onClick: () => { setTab('installed'); refreshInstalled(true) } },
          t('tabInstalled') + (Object.keys(installed).length > 0 ? ' (' + Object.keys(installed).length + ')' : ''),
          hasUpdates && h('span', { className: 'dshm-dot' })))),
    !envReady && h('div', { className: 'dshm-banner' },
      h('span', null, '🧩'),
      h('span', { className: 'dshm-grow' }, envFailed ? t('envFixFail') : t('envMissing')),
      !envFailed && h('button', {
        className: 'dshm-btn primary' + (envFixing ? ' busy' : ''),
        disabled: envFixing,
        onClick: fixEnv,
      }, envFixing ? t('envFixing') : t('envFix'))),
    hotUrls.length > 0 && h('div', { className: 'dshm-banner' },
      h('span', null, '✨'),
      h('span', { className: 'dshm-grow' }, h('b', null, hotUrls.length), ' ', t('hotBanner')),
      h('button', {
        className: 'dshm-btn primary',
        onClick: () => {
          sessionStorage.setItem('dshm-toast', JSON.stringify(hotNames))
          sessionStorage.setItem('dshm-tab', 'installed')
          location.reload()
        },
      }, t('refresh'))),
    pendingRestart > 0 && h('div', { className: 'dshm-banner' },
      h('span', null, '🔄'),
      h('span', { className: 'dshm-grow' }, h('b', null, pendingRestart), ' ', t('restartBanner')),
      h('span', { title: t('restartHint') }, 'ℹ️')),
    bundleless !== null && h('div', { className: 'dshm-banner', style: { borderColor: 'var(--dsw-alias-state-warn-primary,#ea580c)' } },
      h('span', null, '⚠️'),
      h('span', { className: 'dshm-grow' }, t('bundlelessWarn').replace('{names}', bundleless.join(', '))),
      bundleless.length === 1 && h('button', { className: 'dshm-btn primary', onClick: () => agentHelp(bundleless[0]) }, t('agentHelp')),
      h('button', { className: 'dshm-btn ghost', onClick: () => setBundleless(null) }, '✕')),
    auditBlock !== null && h('div', { className: 'dshm-audit' },
      h('div', { className: 'dshm-audit-head' },
        h('span', { className: 'dshm-pill block' }, '🔒 ', h('b', null, t('auditBlocked'))),
        h('span', { className: 'dshm-grow' }),
        h('button', { className: 'dshm-btn ghost', onClick: () => setAuditBlock(null), 'aria-label': t('cancel') }, '✕')),
      h('div', { className: 'dshm-audit-title' }, t('auditBlockTitle') + ' · ' + auditBlock.name),
      h('div', { className: 'dshm-audit-desc' },
        t('auditRisk') + ': ' + (auditBlock.audit && typeof auditBlock.audit.risk === 'string' ? riskLabel(auditBlock.audit.risk, t) : '?'),
        auditBlock.audit && auditBlock.audit.target && typeof auditBlock.audit.target.filesScanned === 'number'
          ? ' · ' + auditBlock.audit.target.filesScanned + (lang === 'zh' ? ' 个文件' : ' files')
            + (auditBlock.audit.target.name ? ' · ' + auditBlock.audit.target.name + (auditBlock.audit.target.version ? '@' + auditBlock.audit.target.version : '') : '')
          : ''),
      (() => {
        const chips = auditChips(t, auditBlock.audit, auditBlock.hooks)
        return chips.length > 0 && h('div', { className: 'dshm-perm-tags' },
          chips.map((c, i) => h('span', { key: i, className: 'dshm-configTag' + (c.danger ? ' err' : '') }, c.label)))
      })(),
      (auditBlock.hooks && auditBlock.hooks.length > 0) && h('div', { className: 'dshm-audit-desc' }, t('auditHookBlock')),
      auditFindings.length > 0
        ? h(React.Fragment, null,
            h('div', { className: 'dshm-audit-title', style: { fontSize: '12px', marginTop: '6px' } }, t('auditFindings')),
            h('dl', { className: 'dshm-details' },
              auditFindings.map((f, i) => h('div', { key: i },
                h('dt', null, f.capability || '?'),
                h('dd', null,
                  h('code', { className: 'dshm-entryValue' }, (f.file || '?') + (f.line != null ? ':' + f.line : '')),
                  ' ', String(f.evidence || f.detail || '').slice(0, 160))))))
        : h('div', { className: 'dshm-audit-desc', style: { marginTop: '6px' } }, t('auditNoFindings')),
      h('div', { className: 'dshm-audit-desc', style: { marginTop: '6px' } }, t('auditReviewHint'))),
    installError !== null && h('div', { className: 'dshm-err' }, installError),
    h('div', {
      className: 'dshm-body',
      ref: bodyRef,
      onScroll: e => setShowTop(e.currentTarget.scrollTop > 400),
    },
      h('div', { className: 'dshm-bodyInner' },
        tab === 'discover' ? discoverBody : installedBody)),
    showTop && h('button', {
      className: 'dshm-top',
      title: t('backTop'),
      onClick: () => { const el = bodyRef.current; if (el) el.scrollTo({ top: 0, behavior: 'smooth' }) },
    }, '↑'),
    confirming !== null && h('div', { className: 'dshm-mask', onClick: e => { if (e.target === e.currentTarget) setConfirming(null) } },
      h('div', { className: 'dshm-modal' },
        h('h3', null, t('confirmTitle') + ' ' + confirming.name + '?'),
        h('p', null, descOf(confirming, lang)),
        h('div', { className: 'dshm-cmd' }, confirming.install),
        confirming.curated === false && h('p', { style: { color: 'var(--dsw-alias-state-warn-primary, #b45309)', fontWeight: 600 } },
          '🔎 ' + t('communityWarn')),
        looksTerminal(confirming, lang) && h('p', { style: { color: 'var(--dsw-alias-state-warn-primary, #b45309)', fontWeight: 600 } },
          '🖥️ ' + t('terminalWarn') + ' ',
          h('a', { className: 'dshm-src', href: confirming.url + '#readme', target: '_blank', rel: 'noreferrer' }, t('readme'))),
        h('p', null, '🛡️ ' + t('auditPassNote')),
        h('p', null, '⚠️ ' + t('confirmWarn')),
        h('div', { className: 'dshm-acts' },
          h('button', { className: 'dshm-btn ghost', onClick: () => setConfirming(null) }, t('cancel')),
          h('button', { className: 'dshm-btn primary', onClick: () => doInstall(confirming) }, t('install'))))))
}

exports.name = 'dsh-market'
exports.inject = ['slots', 'locale']
exports.apply = function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-market: dictionaries')
  const t = ctx.locale.bind(NS)

  /** Close settings, jump to a fresh session and prefill its composer with
   *  the hand-off prompt, so the Agent takes over the setup work. */
  const openAgentSession = (prompt) => {
    try {
      const close = [...document.querySelectorAll('[role="dialog"] button')]
        .find(b => b.getAttribute('aria-label') === '关闭' || b.textContent.trim() === '关闭')
      if (close) close.click()
    }
    catch { /* dialog close is best-effort */ }
    const ws = ctx.get('workspaces')
    if (ws && typeof ws.startSession === 'function') {
      try { ws.startSession() }
      catch { /* session navigation failures are non-fatal */ }
    }
    let tries = 0
    const fill = () => {
      const el = document.querySelector('textarea[placeholder]')
      if (el) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
        if (setter) setter.set.call(el, prompt)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.focus()
      }
      else if (tries < 30) {
        tries += 1
        setTimeout(fill, 150)
      }
    }
    setTimeout(fill, 500)
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'market',
    order: 40,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ t }),
  }, () => h(MarketSection, { t, locale: ctx.locale, openAgentSession })))

  // Post-reload confirmation: a floating "installed and live" card in the
  // shell overlay layer, shown once after the refresh that follows a hot
  // install, so the user lands back in their flow with visible proof.
  function InstallToast() {
    const [names, setNames] = useState(() => {
      const value = readSession('dshm-toast')
      sessionStorage.removeItem('dshm-toast')
      return Array.isArray(value) ? value : []
    })
    useEffect(() => {
      if (names.length === 0) return
      injectStyles()
      const timer = setTimeout(() => setNames([]), 10000)
      return () => clearTimeout(timer)
    }, [names])
    if (names.length === 0) return null
    return h('div', { className: 'dshm-toast' },
      h('span', null, '✨'),
      h('span', null, names.join(', ') + ' ' + t('toastReady')),
      h('button', { className: 'dshm-btn primary', onClick: () => setNames([]) }, t('gotIt')))
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'dsh-market-toast',
    label: () => 'dsh-market',
  }, InstallToast))
}

return module.exports; } });
