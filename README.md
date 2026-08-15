# dshmarket · Plugin Market

**English** | [中文](README.zh.md)

[![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![stars](https://img.shields.io/github/stars/nanshan1995/DSH-Plugin-Market?style=flat)](https://github.com/nanshan1995/DSH-Plugin-Market)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Plugin market inside DeepSeek Harness: browse, search, one-click install — every install/update passes a **static security audit gate** first.

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
dsh plugin --profile web add github:nanshan1995/DSH-Plugin-Market
```

**Option 2: local link (development)**

```sh
git clone https://github.com/nanshan1995/DSH-Plugin-Market
dsh plugin --profile web add link:$(pwd)/DSH-Plugin-Market
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
- **Installed**: sort by install time (toggle direction), hover/select to see install & update times; **hot enable/disable (no restart)**, update and uninstall entry points; disabled plugins dim with a "Disabled" tag and stay disabled across restarts; the market itself cannot be disabled
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

**Install executor**: same-origin POST → audit → re-invoke the `dsh` CLI to forward pnpm (PATH patched per platform) → hot-mount on success; packages declaring `dsh.bundle` are auto-added to the profile's bundle stack.

**Agent handoff**: for plugins that don't activate after install, the client calls `workspaces.startSession`, opens a fresh session and prefills the composer with a diagnosis task; the Agent takes over once the user sends it.

## Security notes

The static audit is a **capability radar, not a behavior firewall**: it blocks the highest-risk static patterns (dynamic exec, credential theft, install scripts, tampering with other plugins) but cannot judge runtime data-flow intent (e.g. "read documents, then upload"). Curation ≠ endorsement: only install sources you trust, and pair this with a runtime sentinel (e.g. dsh-plugin-audit) and commit pinning.

## Data sources & license

- Curated catalog comes live from [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json) (CI-refreshed daily), with a bundled offline snapshot
- The community listing is the live GitHub `dsh-plugin` topic search
- MIT License
