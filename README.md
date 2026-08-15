# DSH-Plugin-Market · Plugin Market

**English** | [中文](README.zh.md)

[![topic](https://img.shields.io/badge/topic-dsh--plugin-blue)](https://github.com/topics/dsh-plugin)
[![stars](https://img.shields.io/github/stars/nanshan1995/DSH-Plugin-Market?style=flat)](https://github.com/nanshan1995/DSH-Plugin-Market)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Plugin market inside DeepSeek Harness: browse, search, one-click install — every install/update passes a **static security audit gate** first.

## Features

- **Live community browse** of the GitHub `dsh-plugin` topic (ranked by stars / latest, paginated) plus a personal **My Favorites** list (☆-save, survives restarts)
- **Cross-language search**: Chinese queries find English plugins and vice versa — built-in thesaurus **plus real-time LLM translation** via the host model
- Pre-install audit of the exact published artifact (dynamic exec, credential access, install scripts are hard-blocked); when blocked, the audit card offers **"Install anyway" (forced download, at your own risk)** and **"Cancel"** side by side
- In-flight ops (installing / updating / uninstalling / audit-blocked awaiting decision) are **pinned to the top** of the lists with live progress
- Official design language (`--dsw-alias-*` tokens); audit results in the official "request approval" pill style
- Update checks, one-click updates (audited too), uninstall with **arm/confirm on the same button** (click 卸载 → the button becomes 确认卸载? → click again to run; clicking anywhere else reverts it), hot mounting, log export, self-service pnpm setup
- **Git links for every installed plugin**: each Installed row resolves its repository from `package.json` (`repository` / GitHub `homepage`), the `github:` spec, or a scan of the shipped README — the spec text and a "Source" button open the repo
- **In-market README viewer**: HTML tables/images render, relative image links point to raw; switch language by clicking the in-README language links (e.g. 中文) — the dialog reloads that file in place; a ↻ button force-refreshes; READMEs that shipped double-encoded (UTF-8 mis-decoded as GB18030, e.g. `——` → `鈥斺€`) are detected and restored (a "encoding repaired" badge shows; spots already destroyed upstream render as `?`); cache is memory-only, 30-min TTL with a size cap
- **Cross-platform**: macOS / Windows / Linux (toolchain auto-detected per platform: fnm / Volta / Homebrew / scoop / %APPDATA%\npm…; Windows uses tar.exe / curl.exe / cmd-compatible spawns)
- **Network-adaptive**: README and audit downloads auto-detect the local proxy (env vars → parallel probe of common local proxy ports → direct fallback; proxy failure retries direct), machines without a proxy reach the direct path after at most one probe timeout (~1.2s) — nothing is hardcoded

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
dsh plugin --profile web add dsh-plugin-market
```

Restart DeepSeek Harness, then open Settings → Plugin Market.

## Usage

- **Discover**: browse the whole GitHub `dsh-plugin` topic ranked by stars (50 per load, "Load more" to page; GitHub exposes at most 1000 results — the real total is shown, and search reaches the rest); in-flight ops are pinned to the top
- **Search**: live keyword search with zh/en thesaurus **plus LLM translation**; the UI shows "Translated as: …"
- **My Favorites**: ☆ on any community card saves it into your personal list (stored in the profile, survives restarts); favorites support install / update / uninstall / README exactly like the community list
- **Install**: click Install → the real source is downloaded and statically audited → auto-installs on pass; on block, an audit card is shown ("Install anyway" to force, "Cancel" to give up, or hand the plugin name to the Agent for manual review)
- **Installed**: sort by install time (toggle direction), hover/select to see install & update times; **hot enable/disable (no restart)**, update and uninstall entry points; disabled plugins dim with a "Disabled" tag and stay disabled across restarts; the market itself cannot be disabled
- **Installed rows link to their git**: the spec text becomes a link and a "Source" button opens the repo — resolved from `package.json` `repository` (or GitHub `homepage`), the `github:` spec, or a README scan when the package declares no repository (e.g. dsh-plugin-audit)
- **README (usage instructions)**: the "README" button opens the plugin's usage instructions in-market; language links inside the README reload the file in the dialog; garbled double-encoded READMEs are repaired automatically, with a badge when repair happened
- **Plugins without a `dsh.bundle` declaration**: a yellow notice appears after install with a **"Let the Agent handle it"** button — it opens a fresh session with a pre-filled diagnosis task so the Agent finishes the wiring for you

## Configuration

| Env var | Effect |
|---|---|
| `DSHMARKET_AUDIT_GATE=off` | Disables the audit gate (all sources are then refused outright — fail-closed) |
| `DSHMARKET_GITHUB_TOKEN` | Raises the GitHub search quota (unauthenticated is ~10 req/min) |
| `DSHMARKET_TRANSLATE_PROVIDER` / `DSHMARKET_TRANSLATE_MODEL` | Model used for query translation (defaults `deepseek-official` / `deepseek-v4-flash`, using the host's configured LLM credentials) |
| `DSHMARKET_README_PROXY` | Explicit HTTP proxy for README/audit downloads (otherwise auto-detected: env proxy → local port probe → direct) |

## How it works

A standard dsh-plugin (`dsh.bundle` + `dsh.client`):

```
lib/index.js          host entry: injects webServer (+ optional llm/loader), mounts HTTP routes
lib/routes.js         routes: search/install/update/uninstall/favorites/readme/entries/toggle/status/updates/logs/setup-pnpm
lib/audit-scanner.js  bundled static audit engine (from dsh-plugin-audit's scanner)
lib/hot.js            hot-mount after install (no restart needed)
lib/log.js            sanitized logging and export
client/client.js      self-contained client (settings UI, audit card, agent handoff)
cordis.patch.yml      bundle patch: inserts the dsh-plugin-market row into the profile
```

**Audit gate (fail-closed)**: before install/update, the exact artifact that would be installed (npm dist tarball or GitHub codeload HEAD) is downloaded into a temp dir and scanned statically — code is never executed:

- Graded capability profile: fs read/write, subprocess, network hosts, env vars, credential paths, dynamic execution (`eval`/`vm`/`new Function`), service injection, bundle patch, dependencies
- Hard blocks (risk=review): dynamic execution, credential paths/sensitive env vars, patches that override other plugins
- Additional hard rules: `preinstall`/`install`/`postinstall` (plus `prepare` for git installs) are always blocked; any audit failure blocks
- The report card shows risk level, permission chips and each finding (file:line + evidence)

**Search & translation**: GitHub search API (paged, sortable by stars/updated); the query is expanded by the built-in zh/en thesaurus and then translated live by the host LLM (10-min cache, 6s timeout, silent fallback to the thesaurus). Translated terms join the GitHub OR-query.

**README fetch**: curl channel (auto proxy detection + direct fallback), language-priority candidates (`README.zh.md` → `README.md`, rare-name fallback, follows in-README language links), other language warm-loaded in the background; content passes encoding repair and relative-URL rewriting; memory-only cache, 30-min TTL + size cap.

**Favorites**: stored as a JSON file in the profile (`dsh-plugin-market-favorites.json`), so the personal list survives restarts without any third-party catalog dependency.

**Pagination**: 50 per load for community browse, 20 for search; the client's "Load more" appends exactly one page of new items (drift-compensating backfill), shows loaded/real totals and notes GitHub's 1000-result retrieval cap.

**Install executor**: same-origin POST → audit → re-invoke the `dsh` CLI to forward pnpm (PATH patched per platform) → hot-mount on success; packages declaring `dsh.bundle` are auto-added to the profile's bundle stack. Uninstall = `dsh remove` + stop the still-loaded entry + drop the profile-bundles reference, so the plugin disappears immediately and does not resurrect after a restart.

**Agent handoff**: for plugins that don't activate after install, the client calls `workspaces.startSession`, opens a fresh session and prefills the composer with a diagnosis task; the Agent takes over once the user sends it.

## Security notes

The static audit is a **capability radar, not a behavior firewall**: it blocks the highest-risk static patterns (dynamic exec, credential theft, install scripts, tampering with other plugins) but cannot judge runtime data-flow intent (e.g. "read documents, then upload"). Curation ≠ endorsement: only install sources you trust, and pair this with a runtime sentinel (e.g. dsh-plugin-audit) and commit pinning.

## Disclaimer

This market only provides plugin **browsing, download and management**. Before download it runs only the most basic static check — no safety or compliance promise is made. **The author is not responsible for any issues or losses arising from the download or use of any plugin.**

## Development workflow (branch policy)

- `main` — **stable release branch**: only accepts tested merges; every merge is a releasable state
- `test` — **daily development branch**: all adjustments, fixes and experiments happen here; merged back to `main` after tests pass

Flow: develop and self-test on `test` → verify → open a PR into `main` → merge after the maintainer approves → `main` is the release.

## Data sources & license

- The community listing is the live GitHub `dsh-plugin` topic search; My Favorites is personal data stored only on the local machine
- MIT License
