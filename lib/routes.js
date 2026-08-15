/**
 * HTTP routes bridging the browser market UI to the host: registry fallback,
 * community search (live GitHub topic + curated bilingual matches, paginated),
 * installed-plugin listing, and the install executor behind a fail-closed
 * pre-install audit gate.
 *
 * Security: the install route executes a shell command, so it accepts only
 * same-origin POSTs and only sources present in the curated registry or
 * GitHub repos surfaced by the search route; every install/update first
 * passes a static security audit of the exact artifact that would be
 * installed, and install-time lifecycle hooks are blocked.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdtempSync, lstatSync, writeFileSync, readdirSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { loadRegistry } from './registry.js';
import { cleanHotDir, hotMount, hotUnmount } from './hot.js';
import { exportLogs, logEvent } from './log.js';

/**
 * Resolve runtime-only dependencies (js-yaml, the host's dsh-llm) relative to
 * the profile: plain `import()` resolves from the real path of this file, and
 * linked checkouts live outside the profile's module tree. `createRequire`
 * anchored at the profile directory walks profile node_modules + the DSH
 * module fallback, which exists on every deployment.
 */
function profileRequire(profile) {
    return createRequire(join(profileDir(profile), 'noop.js'));
}
async function loadProfileModule(profile, spec) {
    const resolved = profileRequire(profile).resolve(spec);
    return import(pathToFileURL(resolved).href);
}

const PROFILE_RE = /^[A-Za-z0-9_-]+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Tool discovery for CLI children. The desktop-launched host often runs with
 * a minimal PATH, and different machines put node/npm/pnpm/corepack in very
 * different places — Homebrew, nvm, Volta, asdf, fnm, official installers.
 * Instead of one hardcoded prefix, we scan a broad set of common locations
 * plus the inherited PATH, cache what we find, and build the child PATH from
 * the found directories so installs work on any machine.
 */
const WIN32 = process.platform === 'win32';
const PATH_DELIM = WIN32 ? ';' : ':';
let toolDirsCache = null;

function candidateToolDirs() {
    const dirs = [];
    const push = (dir) => { if (dir) dirs.push(dir); };
    const home = homedir();
    push(join(home, '.volta', 'bin'));
    push(join(home, '.asdf', 'shims'));
    push(join(home, '.local', 'bin'));
    try {
        const nvm = join(home, '.nvm', 'versions', 'node');
        for (const entry of readdirSync(nvm)) push(join(nvm, entry, 'bin'));
    }
    catch { /* no nvm */ }
    try {
        const fnm = join(home, 'Library', 'Application Support', 'fnm', 'node-versions');
        for (const entry of readdirSync(fnm)) push(join(fnm, entry, 'installation', 'bin'));
    }
    catch { /* no fnm (macOS) */ }
    try {
        const fnm2 = join(home, '.local', 'share', 'fnm', 'node-versions');
        for (const entry of readdirSync(fnm2)) push(join(fnm2, entry, 'installation', 'bin'));
    }
    catch { /* no fnm (linux) */ }
    if (process.platform === 'darwin') { push('/opt/homebrew/bin'); push('/usr/local/bin'); }
    if (process.platform === 'linux') { push('/usr/local/bin'); }
    push('/usr/bin');
    push('/bin');
    push(dirname(process.execPath));
    return dirs;
}

function toolDirs() {
    if (toolDirsCache !== null) return toolDirsCache;
    const dirs = [];
    const seen = new Set();
    for (const dir of [...candidateToolDirs(), ...String(process.env.PATH ?? '').split(PATH_DELIM)]) {
        if (!dir || seen.has(dir)) continue;
        seen.add(dir);
        dirs.push(dir);
    }
    toolDirsCache = dirs;
    return dirs;
}

/** Absolute path of a tool (pnpm/npm/corepack/node), or null when unknown. */
function findTool(name) {
    const file = WIN32 ? `${name}.cmd` : name;
    const exe = WIN32 ? `${name}.exe` : name;
    for (const dir of toolDirs()) {
        const candidate = join(dir, file);
        if (existsSync(candidate)) return candidate;
        if (WIN32) {
            const alt = join(dir, exe);
            if (existsSync(alt)) return alt;
        }
    }
    return null;
}
export { findTool, toolDirs, candidateToolDirs };

function childEnv(extra) {
    const env = { ...process.env, ...(extra ?? {}) };
    env.PATH = [...toolDirs(), ...String(process.env.PATH ?? '').split(PATH_DELIM)]
        .filter((v, i, a) => v !== '' && a.indexOf(v) === i)
        .join(PATH_DELIM);
    return env;
}

/**
 * Argv re-invoking the CLI that launched this host process, so installs work
 * whether dsh runs from a global bin, a local install, or repo source
 * (`node --import tsx/esm .../bin.ts`). Falls back to a PATH `dsh`.
 *
 * Installs run through node:child_process, not ctx.shell: the shell service is
 * the agent's sandboxed executor and denies writes to the profile directory.
 */
function dshArgv() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        // cwd near the entry keeps execArgv imports (tsx/esm) resolvable on source launches.
        return { file: process.execPath, args: [...process.execArgv, entry], cwd: dirname(entry) };
    }
    return { file: 'dsh', args: [], cwd: undefined };
}

/** Whether `pnpm` resolves; success is cached, absence is re-probed. */
let pnpmReady = false;
/** Presence of the other toolchain pieces, for diagnostics in the UI. */
function toolReport() {
    return {
        node: findTool('node') !== null || existsSync(process.execPath),
        npm: findTool('npm') !== null,
        corepack: findTool('corepack') !== null,
        pnpm: findTool('pnpm') !== null,
    };
}

function probePnpm() {
    if (pnpmReady) return Promise.resolve(true);
    return new Promise((resolvePromise) => {
        const pnpm = findTool('pnpm');
        const child = spawn(pnpm ?? 'pnpm', ['--version'], { env: childEnv(), stdio: 'ignore' });
        child.on('error', () => resolvePromise(false));
        child.on('close', (code) => {
            pnpmReady = code === 0;
            resolvePromise(pnpmReady);
        });
    });
}

function runQuiet(file, args, timeoutMs) {
    return new Promise((resolvePromise) => {
        const child = spawn(file, args, { env: childEnv({ CI: 'true' }), stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
        const collect = (chunk) => { output = (output + chunk.toString()).slice(-8 * 1024); };
        child.stdout.on('data', collect);
        child.stderr.on('data', collect);
        child.on('error', (error) => { clearTimeout(timer); resolvePromise({ code: 127, output: error.message }); });
        child.on('close', (code) => { clearTimeout(timer); resolvePromise({ code, output }); });
    });
}

/**
 * Provision pnpm without user involvement: corepack (ships with Node) first,
 * a global npm install as fallback.
 * @returns true when `pnpm --version` succeeds afterwards.
 */
async function provisionPnpm() {
    const corepackPath = findTool('corepack');
    const npmPath = findTool('npm');
    if (corepackPath !== null) {
        const corepack = await runQuiet(corepackPath, ['enable', 'pnpm'], 60 * 1000);
        logEvent(corepack.code === 0 ? 'info' : 'warn', 'setup-pnpm', `corepack enable: exit=${String(corepack.code)} ${corepack.output.slice(-200)}`);
        if (await probePnpm()) return true;
    }
    if (npmPath !== null) {
        const npm = await runQuiet(npmPath, ['install', '-g', 'pnpm'], 3 * 60 * 1000);
        logEvent(npm.code === 0 ? 'info' : 'error', 'setup-pnpm', `npm -g: exit=${String(npm.code)} ${npm.output.slice(-200)}`);
        return probePnpm();
    }
    logEvent('error', 'setup-pnpm', 'no corepack and no npm found — cannot provision pnpm automatically');
    return false;
}

/** Live progress of the running plugin command, for the status route. */
const progress = { active: false, target: '', startedAt: 0, lastLine: '' };

/** Identifies this host process; the client scopes its pending-restart flags to it. */
const BOOT_ID = `${String(process.pid)}-${String(Date.now())}`;

function trackProgress(chunk) {
    const lines = chunk.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length > 0) progress.lastLine = lines[lines.length - 1].slice(0, 200);
}

function runDshPlugin(profile, pluginArgs) {
    const { file, args, cwd } = dshArgv();
    progress.active = true;
    progress.target = pluginArgs[pluginArgs.length - 1] ?? '';
    progress.startedAt = Date.now();
    progress.lastLine = '';
    return new Promise((resolvePromise) => {
        const child = spawn(file, [...args, 'plugin', '--profile', profile, ...pluginArgs], {
            cwd,
            // pnpm v10 blocks forever on a silent interactive prompt without a TTY
            // (observed on re-add over a pinned git spec); CI mode forces it to act
            // or fail instead of asking.
            env: childEnv({ CI: 'true' }),
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, INSTALL_TIMEOUT_MS);
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdout = (stdout + text).slice(-256 * 1024);
            trackProgress(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderr = (stderr + text).slice(-64 * 1024);
            trackProgress(text);
        });
        child.on('error', (error) => {
            clearTimeout(timer);
            progress.active = false;
            resolvePromise({ exitCode: 127, timedOut: false, stdout, stderr: `${stderr}\n${error.message}` });
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            progress.active = false;
            resolvePromise({ exitCode: code, timedOut, stdout, stderr });
        });
    });
}

function sendJson(response, status, payload) {
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(payload));
}

function sameOrigin(request) {
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin === undefined || host === undefined) return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}

async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 4096) throw new Error('request body too large');
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function profileDir(profile) {
    const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
    return join(home, 'profiles', profile);
}

/** Community dependencies of the profile (official in-box scope filtered out). */
function readInstalled(profile) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'package.json'), 'utf8'));
        const installed = {};
        for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
            if (!name.startsWith('@deepseek-ai/')) installed[name] = spec;
        }
        return installed;
    }
    catch {
        return {};
    }
}

/** Per-plugin install/update ledger: { name: { installed, updated } } in ms. */
function timesLedgerPath(profile) {
    return join(profileDir(profile), '.market-times.json');
}
function readTimesLedger(profile) {
    try {
        return JSON.parse(readFileSync(timesLedgerPath(profile), 'utf8'));
    }
    catch {
        return {};
    }
}
function writeTimesLedger(profile, ledger) {
    try {
        writeFileSync(timesLedgerPath(profile), JSON.stringify(ledger, null, 2));
    }
    catch { /* best effort */ }
}

/** Forget a plugin's install/update times on uninstall. */
function forgetTimes(profile, name) {
    try {
        const ledger = readTimesLedger(profile);
        if (ledger[name] === undefined) return;
        delete ledger[name];
        writeTimesLedger(profile, ledger);
    }
    catch { /* best effort */ }
}

/**
 * Remove every profile-patch trace of a plugin: top-level `{id, disabled}`
 * toggles targeting its row ids, insert rows that carry its id or name, and
 * empty insert groups. Used by both uninstall paths so a removed plugin can
 * never leave a dangling loader row behind.
 */
async function cleanProfilePatch(profile, name, rowIds) {
    const file = join(profileDir(profile), 'cordis.patch.yml');
    let text;
    try {
        text = readFileSync(file, 'utf8');
    }
    catch {
        return; // no patch file — nothing to clean
    }
    let yaml;
    try {
        yaml = (await loadProfileModule(profile, 'js-yaml')).default;
    }
    catch {
        return; // yaml unavailable — leave the file untouched
    }
    const cleaned = cleanProfilePatchText(text, name, rowIds, yaml);
    if (cleaned !== null) {
        const header = '# Your patch layer for this dsh profile, applied after every bundle layer:\n'
            + '# a top-level YAML array of loader patch entries (id-targeted config\n'
            + '# overrides, disables, and insert lists; `!!js` expressions allowed).\n';
        writeFileSync(file, header + cleaned);
    }
}

/** Pure text-level cleanup (exported for tests): returns null when untouched. */
export function cleanProfilePatchText(text, name, rowIds, yaml) {
    const ids = new Set(Array.isArray(rowIds) ? rowIds : []);
    const patches = yaml.load(text);
    const list = Array.isArray(patches) ? patches : [];
    const kept = [];
    let changed = false;
    for (const entry of list) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { kept.push(entry); continue; }
        // our own {id, disabled} toggle entries
        if (typeof entry.id === 'string' && ids.has(entry.id) && Object.keys(entry).every((k) => k === 'id' || k === 'disabled')) {
            changed = true;
            continue;
        }
        if (Array.isArray(entry.insert)) {
            const insert = entry.insert.filter((row) => {
                if (!row || typeof row !== 'object' || Array.isArray(row)) return true;
                const drop = (typeof row.id === 'string' && ids.has(row.id)) || (typeof row.name === 'string' && row.name === name);
                if (drop) changed = true;
                return !drop;
            });
            if (insert.length > 0) kept.push({ ...entry, insert });
            else changed = true;
            continue;
        }
        kept.push(entry);
    }
    return changed ? yaml.dump(kept.length > 0 ? kept : []) : null;
}
export { readTimesLedger, writeTimesLedger, collectTimes, forgetTimes, cleanProfilePatch, loadProfileModule };

/**
 * Install/update times per installed plugin. The package directory mtime is
 * the last write (install or update); the ledger records first-seen time as
 * `installed` so both times survive across runs.
 */
function collectTimes(profile, installed) {
    const ledger = readTimesLedger(profile);
    const times = {};
    let dirty = false;
    for (const name of Object.keys(installed)) {
        let mtime = 0;
        for (const dir of [join(profileDir(profile), 'node_modules', name), join(profileDir(profile), '..', 'node_modules', name)]) {
            try {
                mtime = lstatSync(dir).mtimeMs;
                break;
            }
            catch { /* try the next location */ }
        }
        const rec = typeof ledger[name] === 'object' && ledger[name] !== null ? ledger[name] : {};
        if (typeof rec.installed !== 'number' || rec.installed <= 0) {
            rec.installed = mtime > 0 ? mtime : Date.now();
            dirty = true;
        }
        if (mtime > 0 && mtime > (typeof rec.updated === 'number' ? rec.updated : 0)) {
            rec.updated = mtime;
            dirty = true;
        }
        ledger[name] = rec;
        times[name] = { installed: rec.installed, updated: rec.updated ?? rec.installed };
    }
    if (dirty) writeTimesLedger(profile, ledger);
    return times;
}

/** GitHub `owner/repo` for a registry URL, or null when it is not a GitHub repo URL. */
function repoOf(url) {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+?)\/?$/.exec(url);
    if (m === null || !REPO_RE.test(m[1])) return null;
    return m[1];
}

/** Pinned commit per `owner/repo` from the profile lockfile's codeload tarball URLs. */
function readLockCommits(profile) {
    const commits = new Map();
    try {
        const lock = readFileSync(join(profileDir(profile), 'pnpm-lock.yaml'), 'utf8');
        for (const m of lock.matchAll(/codeload\.github\.com\/([^/\s]+\/[^/\s]+)\/tar\.gz\/([0-9a-f]{40})/g)) {
            commits.set(m[1].toLowerCase(), m[2]);
        }
    }
    catch { /* no lockfile — no git installs to report */ }
    return commits;
}

function readInstalledVersion(profile, name) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir(profile), 'node_modules', name, 'package.json'), 'utf8'));
        return manifest.version ?? null;
    }
    catch {
        return null;
    }
}

/**
 * Pre-install audit gate (fail-closed). Resolves the plugin's source (npm
 * tarball or GitHub codeload), extracts it to a temp dir, runs the bundled
 * static audit engine, and additionally blocks install-time lifecycle hooks,
 * which the engine does not inspect. Set DSHMARKET_AUDIT_GATE=off to disable.
 */
const AUDIT_GATE_ENABLED = process.env.DSHMARKET_AUDIT_GATE !== 'off';
/** Non-null while a pre-install audit is running, for live status reporting. */
const auditGateBusy = { active: false };
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'];
const AUDIT_SOURCE_LIMIT_BYTES = 64 * 1024 * 1024;
function auditScannerPath(profile) {
    const inPackage = fileURLToPath(new URL('./audit-scanner.js', import.meta.url));
    if (existsSync(inPackage)) return inPackage;
    return join(profileDir(profile), 'vendor', 'audit-scanner.js');
}
async function fetchTarball(url, dest) {
    const res = await fetch(url, {
        headers: { accept: 'application/octet-stream', 'user-agent': 'dsh-market-audit-gate' },
        signal: AbortSignal.timeout(120 * 1000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > AUDIT_SOURCE_LIMIT_BYTES) throw new Error('source tarball exceeds 64 MiB');
    await writeFile(dest, bytes);
}
function extractTarball(tarball, dest) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn('tar', ['xzf', tarball, '-C', dest], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
        child.on('error', rejectPromise);
        child.on('close', code => code === 0 ? resolvePromise() : rejectPromise(new Error(`tar exit ${String(code)}: ${stderr.slice(-200)}`)));
    });
}
async function findPackageRoot(dir) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(join(dir, entry.name, 'package.json'))) return join(dir, entry.name);
    }
    return dir;
}
export async function runAuditGate(entry, profile) {
    if (!AUDIT_GATE_ENABLED) return { ok: true, skipped: true, report: null, hooks: [] };
    auditGateBusy.active = true;
    const temp = mkdtempSync(join(tmpdir(), 'dshmarket-audit-'));
    try {
        if (typeof entry.npm === 'string') {
            const meta = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(entry.npm)}/latest`);
            if (typeof meta.version !== 'string' || !(meta.dist && typeof meta.dist.tarball === 'string')) throw new Error('registry metadata missing tarball');
            await fetchTarball(meta.dist.tarball, join(temp, 'source.tgz'));
        }
        else {
            const repo = repoOf(entry.url);
            if (repo === null) throw new Error('unsupported source url');
            await fetchTarball(`https://codeload.github.com/${repo}/tar.gz/HEAD`, join(temp, 'source.tgz'));
        }
        await extractTarball(join(temp, 'source.tgz'), temp);
        const root = await findPackageRoot(temp);
        let pkg = {};
        try {
            pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
        }
        catch { /* audit still proceeds; hook check just finds nothing */ }
        const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        const hooks = [];
        for (const hook of INSTALL_HOOKS) {
            if (typeof scripts[hook] === 'string') hooks.push({ hook, script: scripts[hook] });
        }
        if (typeof entry.npm !== 'string' && typeof scripts.prepare === 'string') hooks.push({ hook: 'prepare (git install)', script: scripts.prepare });
        const { auditPlugin } = await import(pathToFileURL(auditScannerPath(profile)).href);
        const report = await auditPlugin(root);
        return { ok: report.risk !== 'review' && hooks.length === 0, report, hooks };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, report: null, hooks: [], reason: 'audit unavailable', message };
    }
    finally {
        auditGateBusy.active = false;
        rmSync(temp, { recursive: true, force: true });
    }
}

/**
 * Community search: live GitHub `dsh-plugin` topic search, enriched with
 * curated registry entries matched bilingually AND by a built-in zh/en
 * thesaurus — a Chinese query like 提醒 also finds English "notification"/
 * "notify" plugins (and the other way around), without needing an LLM.
 * `page`/`limit` paginate the GitHub side; `sort` is `hot` (stars) or `new`
 * (last updated). Registry matches supplement page 1; everything merges by
 * the selected ranking.
 */
const GH_SEARCH_CACHE = new Map();
const GH_SEARCH_TTL_MS = 5 * 60 * 1000;
const GH_SEARCH_TOKEN = process.env.DSHMARKET_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const REGISTRY_SUPPLEMENT_MAX = 30;

/**
 * LLM-backed query translation: a Chinese query is translated into English
 * search terms (and vice versa) using the host's LLM service, on top of the
 * built-in thesaurus. Cached per query; every failure falls back silently to
 * the thesaurus-only expansion. The provider/model default to this
 * deployment's agent defaults and can be overridden via env
 * (DSHMARKET_TRANSLATE_PROVIDER / DSHMARKET_TRANSLATE_MODEL) or market config.
 */
const TRANSLATE_TTL_MS = 10 * 60 * 1000;
const translateCache = new Map();
const TRANSLATE_PROVIDER = process.env.DSHMARKET_TRANSLATE_PROVIDER ?? 'deepseek-official';
const TRANSLATE_MODEL = process.env.DSHMARKET_TRANSLATE_MODEL ?? 'deepseek-v4-flash';

async function translateForSearch(host, q) {
    if (q === '' || !host || !host.llm || typeof host.llm.stream !== 'function') return [];
    const hit = translateCache.get(q);
    if (hit !== undefined && Date.now() - hit.at < TRANSLATE_TTL_MS) return hit.terms;
    const provider = host.config?.translateProvider ?? TRANSLATE_PROVIDER;
    const model = host.config?.translateModel ?? TRANSLATE_MODEL;
    try {
        let llmModule;
        try {
            llmModule = await loadProfileModule(host.config?.profile ?? 'web', '@deepseek-ai/dsh-llm');
        }
        catch {
            try {
                llmModule = await import('@deepseek-ai/dsh-llm');
            }
            catch {
                return [];
            }
        }
        const { BlockAssembler, createUserMessage } = llmModule;
        const messages = [createUserMessage({
            content: [{ type: 'text', text: `Translate this plugin-search query into search terms for BOTH languages. Query: ${JSON.stringify(q)}` }],
            source: { kind: 'plugin', plugin: 'dsh-market' },
        })];
        const system = 'You translate plugin-market search queries. Reply with ONLY one JSON object: {"en":["english search terms"],"zh":["中文搜索词"]}. Terms are for matching plugin names and descriptions; include close synonyms; at most 4 terms per language.';
        const assembler = new BlockAssembler();
        for await (const chunk of host.llm.stream({
            provider,
            model,
            messages,
            system,
            maxTokens: 128,
            signal: AbortSignal.timeout(6000),
        })) {
            assembler.push(chunk);
        }
        const text = assembler.blocks().filter(b => b.type === 'text').map(b => b.text).join(' ');
        const json = /{[\s\S]*}/.exec(text);
        let terms = [];
        if (json) {
            try {
                const parsed = JSON.parse(json[0]);
                terms = [...(Array.isArray(parsed.en) ? parsed.en : []), ...(Array.isArray(parsed.zh) ? parsed.zh : [])]
                    .map(t => String(t).trim())
                    .filter(t => t !== '' && t.length <= 40)
                    .slice(0, 8);
            }
            catch { /* unparseable model output — fall back */ }
        }
        translateCache.set(q, { at: Date.now(), terms });
        return terms;
    }
    catch {
        return [];
    }
}

/** Built-in zh↔en domain thesaurus used for cross-language query expansion. */
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
];

/**
 * Expand a query into a set of search terms: the query itself plus zh↔en
 * thesaurus equivalents in the other direction, so a Chinese query matches
 * English texts of similar meaning and vice versa.
 */
function expandQuery(q) {
    const text = String(q).toLowerCase();
    const terms = new Set();
    if (text !== '') terms.add(text);
    const cjk = /[\u4e00-\u9fff]/.test(text);
    for (const row of BILINGUAL_TERMS) {
        const from = cjk ? row.zh : row.en;
        const to = cjk ? row.en : row.zh;
        if (from.some(term => text.includes(term))) for (const t of to) terms.add(t);
    }
    return [...terms];
}

export async function searchPlugins(query, lang = 'en', limit = 12, page = 1, sort = 'hot', extraTerms = []) {
    const q = String(query ?? '').trim();
    // Empty query = browse the whole topic. GitHub caps one page at 100
    // results and 1000 total across pages; the "load more" flow walks pages
    // until the cap.
    const browseAll = q === '';
    const sortNew = sort === 'new';
    const perPage = Math.max(1, Math.min(Math.floor(Number(limit)) || (browseAll ? 100 : 20), browseAll ? 100 : 20));
    const p = Math.max(1, Math.min(Math.floor(Number(page)) || 1, Math.ceil(1000 / perPage)));
    const llmTerms = (Array.isArray(extraTerms) ? extraTerms : []).map(t => String(t).trim().toLowerCase()).filter(t => t !== '' && t.length <= 40);
    const terms = browseAll ? [] : [...new Set([...expandQuery(q), ...llmTerms])];

    // Curated bilingual + thesaurus matches (zh/en name, description,
    // category, owner, npm).
    let registryMatches = [];
    const curated = new Map();
    try {
        const { registry } = await loadRegistry();
        for (const entry of registry.plugins) curated.set(entry.url.toLowerCase(), entry);
        if (!browseAll) {
            registryMatches = registry.plugins
                .filter((entry) => {
                    const cat = entry.category && registry.categories?.[entry.category] ? registry.categories[entry.category] : {};
                    const haystack = [
                        entry.name, entry.owner, entry.npm ?? '', entry.install ?? '',
                        entry.description?.zh ?? '', entry.description?.en ?? '',
                        cat?.zh ?? '', cat?.en ?? '',
                    ].join(' ').toLowerCase();
                    return terms.some(term => term !== '' && haystack.includes(term));
                })
                .map((entry) => ({
                    name: entry.name,
                    owner: entry.owner,
                    url: entry.url,
                    description: (entry.description && (entry.description[lang] ?? entry.description.en)) ?? '',
                    stars: entry.stars ?? 0,
                    pushed: entry.added ?? '',
                    install: entry.install ?? '',
                    npm: entry.npm ?? null,
                    category: entry.category ?? null,
                    curated: true,
                }))
                .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
                .slice(0, REGISTRY_SUPPLEMENT_MAX);
        }
    }
    catch { /* supplement is optional */ }

    const key = `${q.toLowerCase()}\u0000${lang}\u0000${perPage}\u0000${p}\u0000${sort}`;
    const hit = GH_SEARCH_CACHE.get(key);
    let githubResults;
    if (hit !== undefined && Date.now() - hit.at < GH_SEARCH_TTL_MS) {
        githubResults = hit.data;
    }
    else {
        // Keyword queries expand to an OR group (up to 4 terms) so the GitHub
        // side also matches cross-language equivalents; multi-word terms are
        // quoted. For English queries the GitHub side gets the raw query plus
        // LLM translations only — thesaurus zh terms would pollute ranking
        // (e.g. "market" → 股票/行情). Browse keeps plain topic listing;
        // `new` ranks by updated.
        const cjkQuery = /[\u4e00-\u9fff]/.test(q);
        const ghTerms = browseAll ? [] : [...new Set([
            q,
            ...llmTerms.filter(t => t !== q.toLowerCase()),
            ...(cjkQuery ? expandQuery(q).filter(t => t.toLowerCase() !== q.toLowerCase()) : []),
        ])].slice(0, 4).map(t => t.includes(' ') ? `"${t}"` : t);
        const ghQuery = browseAll ? '' : `${ghTerms.length > 1 ? `(${ghTerms.join(' OR ')})` : ghTerms[0] ?? ''} `;
        const sortParam = (browseAll || sortNew) ? `&sort=${sortNew ? 'updated' : 'stars'}&order=desc` : '';
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(`${ghQuery}topic:dsh-plugin`)}${sortParam}&per_page=${perPage}&page=${p}`;
        const res = await fetch(url, {
            headers: {
                accept: 'application/vnd.github+json',
                'user-agent': 'dsh-market-search',
                ...(GH_SEARCH_TOKEN !== '' ? { authorization: `Bearer ${GH_SEARCH_TOKEN}` } : {}),
            },
            signal: AbortSignal.timeout(8000),
        });
        if (res.status === 403 || res.status === 429) {
            const reset = Number(res.headers.get('x-ratelimit-reset'));
            const retryAfterSeconds = Number.isFinite(reset) && reset > 0 ? Math.max(0, reset - Math.floor(Date.now() / 1000)) : 60;
            return {
                results: registryMatches,
                total: registryMatches.length,
                page: p,
                perPage,
                hasMore: false,
                rateLimited: true,
                retryAfterSeconds,
                translatedTerms: llmTerms,
                note: `GitHub search is rate-limited (HTTP ${res.status}); ${GH_SEARCH_TOKEN !== '' ? 'the configured token is also limited' : 'the unauthenticated limit resets within the hour'} — showing curated bilingual matches (${registryMatches.length}) until it resets`,
            };
        }
        if (!res.ok) throw new Error(`GitHub search HTTP ${res.status}`);
        const body = await res.json();
        githubResults = {
            total: Math.max(0, Math.floor(Number(body.total_count ?? 0))),
            items: (body.items ?? []).map((it) => ({
                name: String(it.name ?? ''),
                owner: String(it.owner?.login ?? ''),
                url: String(it.html_url ?? ''),
                description: String(it.description ?? ''),
                stars: Number(it.stargazers_count ?? 0),
                pushed: String(it.pushed_at ?? ''),
                install: `dsh plugin --profile web add github:${String(it.full_name ?? '')}`,
                curated: false,
            })),
        };
        GH_SEARCH_CACHE.set(key, { at: Date.now(), data: githubResults });
    }
    const trueTotal = Math.max(0, Math.floor(githubResults.total ?? 0));
    // GitHub's search API only exposes the first 1000 results through
    // pagination; the real topic count can exceed it (e.g. ~1900 repos).
    const total = Math.min(trueTotal, 1000);
    const enriched = githubResults.items.map((r) => {
        const entry = curated.get(r.url.toLowerCase());
        if (entry === undefined) return r;
        const desc = entry.description && (entry.description[lang] ?? entry.description.en);
        return {
            ...r,
            curated: true,
            npm: entry.npm ?? null,
            category: entry.category ?? null,
            description: desc ?? r.description,
            stars: typeof r.stars === 'number' && r.stars > 0 ? r.stars : (entry.stars ?? r.stars),
        };
    });
    const seen = new Set(enriched.map((r) => r.url.toLowerCase()));
    const combined = p === 1
        ? [...enriched, ...registryMatches.filter((m) => !seen.has(m.url.toLowerCase()))]
        : enriched;
    // Browse and "new" rank by stars/updated; keyword search keeps GitHub's
    // best-match relevance order (supplements are already star-sorted and sit
    // after the GitHub hits), so a new repo matching the query is not buried.
    if (browseAll || sortNew) {
        combined.sort((a, b) => sortNew
            ? String(b.pushed ?? b.added ?? '').localeCompare(String(a.pushed ?? a.added ?? ''))
            : (b.stars ?? 0) - (a.stars ?? 0));
    }
    const hasMore = p * perPage < total;
    return {
        results: combined,
        total: trueTotal,
        fetchable: total,
        page: p,
        perPage,
        hasMore,
        rateLimited: false,
        translatedTerms: llmTerms,
        note: browseAll
            ? (sortNew
                ? `Live GitHub \`dsh-plugin\` topic ranked by latest updates — ${trueTotal} repositories in the topic (GitHub pagination exposes the top ${total}); page ${p} shows ${combined.length}`
                : `Live GitHub \`dsh-plugin\` topic ranked by stars — ${trueTotal} repositories in the topic (GitHub pagination exposes the top ${total}); page ${p} shows ${combined.length}`)
            : `Live GitHub search + curated bilingual/thesaurus matches (zh/en name, description and synonyms) — GitHub side: ${trueTotal} results (top ${total} fetchable)`,
    };
}

const UPDATES_TTL_MS = 30 * 60 * 1000;
let updatesCache = null;
async function fetchJson(url) {
    const res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-market' },
        signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

/** Per-plugin update checks; a failed check reports no update rather than failing the listing. */
async function checkUpdates(profile, force = false) {
    if (!force && updatesCache && Date.now() - updatesCache.at < UPDATES_TTL_MS) return updatesCache.data;
    const installed = readInstalled(profile);
    const lockCommits = readLockCommits(profile);
    const result = {};
    await Promise.all(Object.entries(installed).map(async ([name, spec]) => {
        const version = readInstalledVersion(profile, name);
        if (spec.startsWith('link:') || spec.startsWith('file:')) {
            result[name] = { kind: 'linked', version, current: null, latest: null, updateAvailable: false };
            return;
        }
        const gh = /^(?:github:)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:#.*)?$/.exec(spec);
        try {
            if (spec.startsWith('github:') && gh !== null) {
                const current = lockCommits.get(gh[1].toLowerCase()) ?? null;
                const head = (await fetchJson(`https://api.github.com/repos/${gh[1]}/commits/HEAD`));
                const latest = typeof head.sha === 'string' ? head.sha : null;
                result[name] = {
                    kind: 'github', version, current, latest,
                    updateAvailable: current !== null && latest !== null && current !== latest,
                };
            }
            else {
                const meta = (await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`));
                const latest = typeof meta.version === 'string' ? meta.version : null;
                result[name] = {
                    kind: 'npm', version, current: version, latest,
                    updateAvailable: version !== null && latest !== null && version !== latest,
                };
            }
        }
        catch {
            result[name] = { kind: spec.startsWith('github:') ? 'github' : 'npm', version, current: null, latest: null, updateAvailable: false };
        }
    }));
    updatesCache = { at: Date.now(), data: result };
    return result;
}

/**
 * Register the market's HTTP routes.
 * @param host - Acquired webServer + shell services.
 * @param config - Validated market configuration.
 * @returns Disposer removing every registered route.
 */
export function mountMarketRoutes(host, config, llm, loader) {
    if (!PROFILE_RE.test(config.profile)) {
        throw new Error(`dsh-market: invalid profile name: ${config.profile}`);
    }
    // Boot-time wipe: stale hot-mount inputs from a previous session must never
    // survive into a composition where the bundle layer already covers them.
    cleanHotDir(profileDir(config.profile));
    const llmHost = { llm, config };
    let installing = false;

    /** Loader rows currently composed (id/name/disabled/active). */
    function readLoaderEntries() {
        const rows = [];
        try {
            for (const entry of loader.entries()) {
                const options = entry.options;
                if (options && typeof options.id === 'string' && typeof options.name === 'string') {
                    rows.push({
                        id: options.id,
                        name: options.name,
                        disabled: entry.disabled === true,
                        active: entry.fiber !== void 0,
                    });
                }
            }
        }
        catch { /* loader unavailable — empty listing */ }
        return rows;
    }

    /** Deps + patch-loaded community rows, the full management view. */
    function mergedInstalled() {
        const installed = readInstalled(config.profile);
        for (const row of readLoaderEntries()) {
            if (row.name.startsWith('@deepseek-ai/') || row.name.startsWith('cordis:')) continue;
            if (installed[row.name] !== undefined) continue;
            installed[row.name] = `patch:${row.id}`;
        }
        return installed;
    }

    /** The plugin's README (locale-first) from its package or fallback dir. */
    function readPluginReadme(name, lang) {
        const dirs = [join(profileDir(config.profile), 'node_modules', name), join(profileDir(config.profile), '..', 'node_modules', name)];
        const ordered = lang === 'zh'
            ? ['README.zh.md', 'README.zh-CN.md', 'README_zh.md', 'README.md', 'README']
            : ['README.md', 'README.zh.md', 'README.zh-CN.md', 'README_zh.md', 'README'];
        for (const dir of dirs) {
            let files;
            try {
                files = readdirSync(dir);
            }
            catch {
                continue;
            }
            for (const file of ordered) {
                if (!files.includes(file)) continue;
                try {
                    const raw = readFileSync(join(dir, file), 'utf8');
                    const content = raw.length > 200 * 1024 ? raw.slice(0, 200 * 1024) + '\n\n…(truncated)' : raw;
                    return { content, source: file, dir };
                }
                catch { /* keep looking */ }
            }
            const anyReadme = files.find((f) => /^readme/i.test(f) && !f.endsWith('.map'));
            if (anyReadme !== undefined) {
                try {
                    const raw = readFileSync(join(dir, anyReadme), 'utf8');
                    const content = raw.length > 200 * 1024 ? raw.slice(0, 200 * 1024) + '\n\n…(truncated)' : raw;
                    return { content, source: anyReadme, dir };
                }
                catch { /* keep looking */ }
            }
        }
        return null;
    }

    /**
     * Persist a toggle into the profile's cordis.patch.yml: remove every
     * {id, disabled} entry for the row, then re-add {id, disabled:true} when
     * disabling. Best effort — the hot toggle already applied via the loader.
     */
    async function persistToggle(rowId, disabled) {
        const file = join(profileDir(config.profile), 'cordis.patch.yml');
        try {
            const yaml = (await loadProfileModule(config.profile, 'js-yaml')).default;
            const text = readFileSync(file, 'utf8');
            const patches = yaml.load(text);
            const list = Array.isArray(patches) ? patches : [];
            const kept = list.filter((entry) => !(entry && typeof entry === 'object' && !Array.isArray(entry) && entry.id === rowId && Object.keys(entry).every((k) => k === 'id' || k === 'disabled')));
            if (disabled) kept.push({ id: rowId, disabled: true });
            const header = '# Your patch layer for this dsh profile, applied after every bundle layer:\n'
                + '# a top-level YAML array of loader patch entries (id-targeted config\n'
                + '# overrides, disables, and insert lists; `!!js` expressions allowed).\n';
            writeFileSync(file, header + yaml.dump(kept.length > 0 ? kept : []));
        }
        catch (error) {
            logEvent('warn', 'toggle-persist', `patch persist failed for ${rowId}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    const disposers = [
        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/registry',
            handler: async (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                try {
                    const { registry, source } = await loadRegistry();
                    sendJson(response, 200, { source, registry });
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/entries',
            handler: (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                sendJson(response, 200, { entries: readLoaderEntries() });
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/toggle',
            handler: async (request, response) => {
                if (request.method !== 'POST') {
                    response.writeHead(405, { allow: 'POST' });
                    response.end();
                    return;
                }
                if (!sameOrigin(request)) {
                    sendJson(response, 403, { error: 'untrusted origin' });
                    return;
                }
                try {
                    const body = (await readJsonBody(request));
                    const rowId = typeof body.id === 'string' ? body.id : '';
                    const enable = body.enable !== false;
                    if (rowId === '' ) {
                        sendJson(response, 400, { error: 'missing row id' });
                        return;
                    }
                    if (rowId === 'dsh-market') {
                        sendJson(response, 400, { error: 'the market cannot disable itself' });
                        return;
                    }
                    const rows = readLoaderEntries();
                    const row = rows.find((r) => r.id === rowId);
                    if (row === undefined) {
                        sendJson(response, 400, { error: 'unknown loader row' });
                        return;
                    }
                    // Hot apply through the loader: `disabled: null` deletes the
                    // key (re-enable), `disabled: true` disposes the fiber.
                    let entry = undefined;
                    for (const candidate of loader.entries()) {
                        if (candidate.options?.id === rowId) { entry = candidate; break; }
                    }
                    if (entry === undefined) {
                        sendJson(response, 400, { error: 'loader row not found' });
                        return;
                    }
                    await entry.update(enable ? { disabled: null } : { disabled: true });
                    await persistToggle(rowId, !enable);
                    logEvent('info', 'toggle', `${rowId} ${enable ? 'enabled' : 'disabled'} (hot)`);
                    const after = readLoaderEntries().find((r) => r.id === rowId);
                    sendJson(response, 200, { ok: true, id: rowId, disabled: after?.disabled === true, active: after?.active === true, entries: readLoaderEntries() });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    host.logger?.warn(`[dsh-market] toggle failed: ${message}`);
                    logEvent('error', 'toggle', `route error: ${message}`);
                    sendJson(response, 500, { error: message });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/readme',
            handler: (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                const u = new URL(request.url ?? '/', 'http://localhost');
                const name = u.searchParams.get('name') ?? '';
                const lang = u.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
                // Only serve READMEs for names actually in the management view.
                if (mergedInstalled()[name] === undefined) {
                    sendJson(response, 404, { error: 'unknown plugin' });
                    return;
                }
                const readme = readPluginReadme(name, lang);
                if (readme === null) {
                    let description = '';
                    try {
                        for (const dir of [join(profileDir(config.profile), 'node_modules', name), join(profileDir(config.profile), '..', 'node_modules', name)]) {
                            const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
                            if (typeof pkg.description === 'string' && pkg.description !== '') { description = pkg.description; break; }
                        }
                    }
                    catch { /* no manifest description */ }
                    sendJson(response, 200, { ok: false, description });
                    return;
                }
                sendJson(response, 200, { ok: true, name, ...readme });
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/search',
            handler: async (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                try {
                    const u = new URL(request.url ?? '/', 'http://localhost');
                    const q = u.searchParams.get('q') ?? '';
                    const lang = u.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
                    const limit = Number(u.searchParams.get('limit')) || 0;
                    const page = Number(u.searchParams.get('page')) || 1;
                    const sort = u.searchParams.get('sort') === 'new' ? 'new' : 'hot';
                    // LLM-backed translation first (cached, non-fatal), then search.
                    const extraTerms = q.trim() === '' ? [] : await translateForSearch(llmHost, q.trim());
                    sendJson(response, 200, await searchPlugins(q, lang, limit, page, sort, extraTerms));
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/installed',
            handler: (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                const installed = mergedInstalled();
                // Real install/update time per plugin (ledger + package dir
                // mtime) — package.json's dependency order is alphabetical,
                // so it cannot serve as install order.
                const times = collectTimes(config.profile, installed);
                sendJson(response, 200, { profile: config.profile, installed, times });
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/status',
            handler: async (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                sendJson(response, 200, {
                    active: progress.active,
                    auditing: auditGateBusy.active,
                    auditGate: AUDIT_GATE_ENABLED,
                    target: progress.target,
                    seconds: progress.active ? Math.round((Date.now() - progress.startedAt) / 1000) : 0,
                    lastLine: progress.lastLine,
                    pnpm: await probePnpm(),
                    tools: toolReport(),
                    boot: BOOT_ID,
                    installed: readInstalled(config.profile),
                });
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/logs',
            handler: (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                let version = 'unknown';
                try {
                    version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? version;
                }
                catch { /* export still works without the version line */ }
                response.writeHead(200, {
                    'cache-control': 'no-store',
                    'content-type': 'text/plain; charset=utf-8',
                    'content-disposition': 'attachment; filename="dsh-market-log.txt"',
                });
                response.end(exportLogs({
                    'dsh-market': version,
                    platform: `${process.platform} ${process.arch}`,
                    node: process.version,
                    profile: config.profile,
                }));
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/updates',
            handler: async (request, response) => {
                if (request.method !== 'GET') {
                    response.writeHead(405, { allow: 'GET' });
                    response.end();
                    return;
                }
                try {
                    const force = (request.url ?? '').includes('force=1');
                    sendJson(response, 200, { updates: await checkUpdates(config.profile, force) });
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/update',
            handler: async (request, response) => {
                if (request.method !== 'POST') {
                    response.writeHead(405, { allow: 'POST' });
                    response.end();
                    return;
                }
                if (!sameOrigin(request)) {
                    sendJson(response, 403, { error: 'untrusted origin' });
                    return;
                }
                if (installing) {
                    sendJson(response, 409, { error: 'another install is already running' });
                    return;
                }
                try {
                    const body = (await readJsonBody(request));
                    const name = typeof body.name === 'string' ? body.name : '';
                    const spec = readInstalled(config.profile)[name];
                    if (spec === undefined) {
                        sendJson(response, 400, { error: 'plugin is not installed' });
                        return;
                    }
                    if (spec.startsWith('link:') || spec.startsWith('file:')) {
                        sendJson(response, 400, { error: 'locally linked plugins update from their checkout' });
                        return;
                    }
                    // Re-running add re-resolves the source: git HEAD for github specs,
                    // dist-tag latest for registry installs.
                    const target = spec.startsWith('github:') ? spec.replace(/#.*$/, '') : `${name}@latest`;
                    // Pre-install audit gate for updates too: a newer release is new
                    // third-party code, so it passes the same fail-closed scan before
                    // anything is fetched into the profile.
                    const ghUpdate = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:#|$)/.exec(spec);
                    const auditEntry = ghUpdate !== null
                        ? { url: `https://github.com/${ghUpdate[1]}`, npm: null }
                        : { url: '', npm: name };
                    const audit = await runAuditGate(auditEntry, config.profile);
                    if (!audit.ok) {
                        const parts = [];
                        if (audit.report !== null) {
                            const revs = (audit.report.findings ?? []).filter(f => f.severity === 'review').slice(0, 4)
                                .map(f => `- ${f.capability} ${f.file}${f.line !== undefined && f.line !== null ? `:${f.line}` : ''} ${(f.evidence ?? f.detail ?? '').slice(0, 100)}`);
                            if (revs.length > 0) parts.push(`静态审计高危: ${revs.join(' | ')}`);
                        }
                        if ((audit.hooks ?? []).length > 0) parts.push(`安装期钩子: ${audit.hooks.map(h => h.hook).join(', ')}`);
                        if (audit.reason !== undefined) parts.push(audit.message !== undefined && audit.message !== '' ? `审计不可用: ${audit.message.slice(0, 200)}` : '审计不可用');
                        logEvent('warn', 'update-audit-blocked', `${name} -> ${target} ${parts.join(' ; ').slice(0, 400)}`);
                        sendJson(response, 400, {
                            error: `更新前安全审计未通过，已阻止更新。${parts.join(' ; ')}`,
                            audit: audit.report,
                            hooks: audit.hooks ?? [],
                        });
                        return;
                    }
                    installing = true;
                    try {
                        const result = await runDshPlugin(config.profile, ['add', target]);
                        const ok = result.exitCode === 0 && !result.timedOut;
                        if (ok) updatesCache = null;
                        logEvent(ok ? 'info' : 'error', 'update', `${name} -> ${target} exit=${String(result.exitCode)}${result.timedOut ? ' TIMEOUT' : ''}${ok ? '' : ` stderr=${result.stderr.slice(-300)}`}`);
                        sendJson(response, ok ? 200 : 502, {
                            ok,
                            exitCode: result.exitCode,
                            timedOut: result.timedOut,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            installed: readInstalled(config.profile),
                        });
                    }
                    finally {
                        installing = false;
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    host.logger?.warn(`[dsh-market] update failed: ${message}`);
                    logEvent('error', 'update', `route error: ${message}`);
                    sendJson(response, 500, { error: message });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/setup-pnpm',
            handler: async (request, response) => {
                if (request.method !== 'POST') {
                    response.writeHead(405, { allow: 'POST' });
                    response.end();
                    return;
                }
                if (!sameOrigin(request)) {
                    sendJson(response, 403, { error: 'untrusted origin' });
                    return;
                }
                try {
                    sendJson(response, 200, { ok: await provisionPnpm() });
                }
                catch (error) {
                    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/uninstall',
            handler: async (request, response) => {
                if (request.method !== 'POST') {
                    response.writeHead(405, { allow: 'POST' });
                    response.end();
                    return;
                }
                if (!sameOrigin(request)) {
                    sendJson(response, 403, { error: 'untrusted origin' });
                    return;
                }
                if (installing) {
                    sendJson(response, 409, { error: 'another install is already running' });
                    return;
                }
                try {
                    const body = (await readJsonBody(request));
                    const name = typeof body.name === 'string' ? body.name : '';
                    if (name === 'dsh-market' || name === 'dshmarket') {
                        sendJson(response, 400, { error: 'the market cannot uninstall itself; use the dsh CLI' });
                        return;
                    }
                    const spec = readInstalled(config.profile)[name];
                    // Patch-loaded rows (merged into the management view) have
                    // no dependency: uninstall = drop their cordis.patch.yml
                    // entries + remove the fallback module link.
                    if (spec === undefined && readLoaderEntries().some((row) => row.name === name && !row.name.startsWith('@deepseek-ai/') && !row.name.startsWith('cordis:'))) {
                        const row = readLoaderEntries().find((r) => r.name === name);
                         try {
                             cleanProfilePatch(config.profile, name, [row.id]);
                             forgetTimes(config.profile, name);
                             for (const dir of [join(profileDir(config.profile), 'node_modules', name), join(profileDir(config.profile), '..', 'node_modules', name)]) {
                                 try {
                                     const stat = lstatSync(dir);
                                     if (stat.isSymbolicLink() || stat.isDirectory()) rmSync(dir, { recursive: true });
                                 }
                                 catch { /* absent — nothing to remove */ }
                             }
logEvent('info', 'uninstall', `${name} (patch row ${row.id}) removed; restart required`);
                            sendJson(response, 200, {
                                ok: true,
                                hot: false,
                                needsRestart: true,
                                installed: readInstalled(config.profile),
                            });
                        }
                        catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            sendJson(response, 500, { error: `failed to remove patch row: ${message}` });
                        }
                        return;
                    }
                    if (spec === undefined) {
                        sendJson(response, 400, { error: 'plugin is not installed' });
                        return;
                    }
                    installing = true;
                    try {
                        const result = await runDshPlugin(config.profile, ['remove', name]);
                        const ok = result.exitCode === 0 && !result.timedOut;
                        let hot = false;
                        if (ok) {
                            updatesCache = null;
                            hot = await hotUnmount(name);
                            // Sweep profile-patch traces (insert rows / disable
                            // toggles referencing this plugin) so no dangling
                            // loader row survives the next boot, and forget
                            // its install/update times.
                            const rowIds = readLoaderEntries().filter((row) => row.name === name).map((row) => row.id);
                            cleanProfilePatch(config.profile, name, rowIds);
                            forgetTimes(config.profile, name);
                        }
                        logEvent(ok ? 'info' : 'error', 'uninstall', `${name} exit=${String(result.exitCode)}${ok ? ` live-removed=${String(hot)}` : ` stderr=${result.stderr.slice(-300)}`}`);
                        sendJson(response, ok ? 200 : 502, {
                            ok,
                            hot,
                            exitCode: result.exitCode,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            installed: readInstalled(config.profile),
                        });
                    }
                    finally {
                        installing = false;
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    host.logger?.warn(`[dsh-market] uninstall failed: ${message}`);
                    logEvent('error', 'uninstall', `route error: ${message}`);
                    sendJson(response, 500, { error: message });
                }
            },
        }),

        host.webServer.register({
            kind: 'exact',
            path: '/dsh-market/install',
            handler: async (request, response) => {
                if (request.method !== 'POST') {
                    response.writeHead(405, { allow: 'POST' });
                    response.end();
                    return;
                }
                if (!sameOrigin(request)) {
                    sendJson(response, 403, { error: 'untrusted origin' });
                    return;
                }
                if (installing) {
                    sendJson(response, 409, { error: 'another install is already running' });
                    return;
                }
                try {
                    const body = (await readJsonBody(request));
                    const url = typeof body.url === 'string' ? body.url : '';
                    const community = body.community === true;
                    // Registry tarballs beat full-repo GitHub downloads: smaller,
                    // prebuilt, and CDN/mirror served. The npm name comes from our
                    // curated registry, which only maps repo-verified packages.
                    const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
                    let entry;
                    let repo;
                    let target;
                    if (community) {
                        // Community tier (live GitHub search results): outside the
                        // curated whitelist. Installable only through the strict
                        // audit gate — if the gate is off, refuse outright.
                        if (!AUDIT_GATE_ENABLED) {
                            sendJson(response, 400, { error: 'community sources require the audit gate (DSHMARKET_AUDIT_GATE is off)' });
                            return;
                        }
                        repo = repoOf(url);
                        if (repo === null) {
                            sendJson(response, 400, { error: 'unsupported source url' });
                            return;
                        }
                        entry = { url, npm: null };
                        target = `github:${repo}`;
                    }
                    else {
                        const { registry } = await loadRegistry();
                        entry = registry.plugins.find(p => p.url.toLowerCase() === url.toLowerCase());
                        if (entry === undefined) {
                            logEvent('warn', 'install-rejected', `not in curated registry: ${url.slice(0, 120)}`);
                            sendJson(response, 400, { error: 'plugin is not in the curated registry' });
                            return;
                        }
                        repo = repoOf(entry.url);
                        if (repo === null) {
                            sendJson(response, 400, { error: 'unsupported source url' });
                            return;
                        }
                        target = typeof entry.npm === 'string' && NPM_NAME_RE.test(entry.npm)
                            ? entry.npm
                            : `github:${repo}`;
                    }
                    // Pre-install audit gate: static scan + lifecycle-hook block, fail-closed.
                    const audit = await runAuditGate(entry, config.profile);
                    if (!audit.ok) {
                        const parts = [];
                        if (audit.report !== null) {
                            const revs = (audit.report.findings ?? []).filter(f => f.severity === 'review').slice(0, 4)
                                .map(f => `- ${f.capability} ${f.file}${f.line !== undefined && f.line !== null ? `:${f.line}` : ''} ${(f.evidence ?? f.detail ?? '').slice(0, 100)}`);
                            if (revs.length > 0) parts.push(`静态审计高危: ${revs.join(' | ')}`);
                        }
                        if ((audit.hooks ?? []).length > 0) parts.push(`安装期钩子: ${audit.hooks.map(h => h.hook).join(', ')}`);
                        if (audit.reason !== undefined) parts.push(audit.message !== undefined && audit.message !== '' ? `审计不可用: ${audit.message.slice(0, 200)}` : '审计不可用');
                        logEvent('warn', 'install-audit-blocked', `${target} ${parts.join(' ; ').slice(0, 400)}`);
                        sendJson(response, 400, {
                            error: `安装前安全审计未通过，已阻止安装。${parts.join(' ; ')}。把插件名告诉 Agent 可人工复核；DSHMARKET_AUDIT_GATE=off 可关闭闸门`,
                            audit: audit.report,
                            hooks: audit.hooks ?? [],
                        });
                        return;
                    }
                    installing = true;
                    try {
                        const before = new Set(Object.keys(readInstalled(config.profile)));
                        const result = await runDshPlugin(config.profile, ['add', target]);
                        const ok = result.exitCode === 0 && !result.timedOut;
                        if (ok) updatesCache = null;
                        const installed = readInstalled(config.profile);
                        let hot = false;
                        if (ok) {
                            const added = Object.keys(installed).filter(name => !before.has(name));
                            if (added.length > 0) {
                                const results = await Promise.all(
                                    added.map(name => hotMount(host, profileDir(config.profile), name)),
                                );
                                hot = results.every(Boolean);
                            }
                        }
                        // Warn when a newly installed package declares no
                        // `dsh.bundle`: the plugin system cannot auto-activate
                        // it, so it needs manual configuration to load.
                        const bundleless = [];
                        for (const name of Object.keys(installed).filter(name => !before.has(name))) {
                            try {
                                const manifest = JSON.parse(readFileSync(join(profileDir(config.profile), 'node_modules', name, 'package.json'), 'utf8'));
                                if (manifest.dsh?.bundle?.patch === undefined) bundleless.push(name);
                            }
                            catch { /* unknown state — do not warn */ }
                        }
                        logEvent(ok ? 'info' : 'error', 'install', `${target} exit=${String(result.exitCode)}${result.timedOut ? ' TIMEOUT' : ''}${ok ? ` hot=${String(hot)}` : ` stderr=${result.stderr.slice(-300)}`}`);
                        sendJson(response, ok ? 200 : 502, {
                            ok,
                            hot,
                            exitCode: result.exitCode,
                            timedOut: result.timedOut,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            installed,
                            bundleless,
                        });
                    }
                    finally {
                        installing = false;
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    host.logger?.warn(`[dsh-market] install failed: ${message}`);
                    logEvent('error', 'install', `route error: ${message}`);
                    sendJson(response, 500, { error: message });
                }
            },
        }),
    ];

    return () => {
        for (const dispose of disposers) dispose();
    };
}
