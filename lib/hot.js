/**
 * Restart-free installs: mount a freshly installed plugin into the running
 * composition through a market-owned Include subtree.
 *
 * Durable state stays with the profile's `dsh.profile.bundles` (reconciled by
 * the dsh CLI at install time), so the next boot loads the plugin through the
 * normal bundle layer. The subtree here exists only for the current process:
 * its input files live under `<profile>/.dsh-plugin-market/` and are wiped on every
 * boot, so a crash can never leave a file that collides with the bundle layer
 * (inserting an id the bundle layer also inserts is a hard boot failure).
 *
 * The Include subclass suppresses `write()` — the loader otherwise persists
 * tree changes back to the file it read (see dsh's agent-presets PresetTree
 * for the in-tree precedent).
 */
var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { logEvent } from './log.js';
const HOT_DIR = '.dsh-plugin-market';
let hotTreeClass;
/**
 * Candidate specifiers for the include plugin. It ships inside the dsh
 * package's dependency tree (unpublished), so we resolve it through:
 * 1. the bare specifier (older app bundles that expose it to the profile),
 * 2. the npm global root (`npm root -g` → @deepseek-ai/dsh/node_modules/…),
 * 3. the Node install's own global node_modules next to process.execPath.
 * The first one that imports wins.
 */
function includeSpecifierCandidates() {
    const out = ['@deepseek-ai/cordis-plugin-include'];
    const rel = join('@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'cordis-plugin-include', 'lib', 'index.js');
    try {
        const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
        if (root !== '') out.push(join(root, rel));
    }
    catch { /* npm unavailable */ }
    try {
        out.push(join(dirname(dirname(process.execPath)), 'lib', 'node_modules', rel));
    }
    catch { /* ignore */ }
    return [...new Set(out)];
}
/**
 * The Include subclass, built once per process; null when the loader's include
 * plugin is not importable (older harness) — callers fall back to restart.
 */
async function loadHotTreeClass() {
    if (hotTreeClass !== undefined)
        return hotTreeClass;
    try {
        // Computed specifiers: the include plugin ships with the harness (vendored,
        // unpublished), so it resolves at runtime and is not typecheckable as a
        // dependency.
        for (const specifier of includeSpecifierCandidates()) {
            let mod = null;
            try {
                mod = (await import(__rewriteRelativeImportExtension(specifier)));
            }
            catch { /* try next candidate */ }
            if (mod === null || mod.Include === undefined)
                continue;
            const Include = mod.Include;
            class MarketHotTree extends Include {
                /** Runtime-only mount list; the bundle layer owns persistence. */
                write() { }
            }
            hotTreeClass = MarketHotTree;
            return hotTreeClass;
        }
        hotTreeClass = null;
    }
    catch {
        hotTreeClass = null;
    }
    return hotTreeClass;
}
/**
 * Insert rows of a plugin's bundle patch, or null when the patch contains
 * anything beyond plain `id`/`name` insert rows (config blocks, disables,
 * expressions) — those compositions fall back to restart activation.
 */
export function parseSimplePatch(patchText) {
    const rows = [];
    let pending = null;
    for (const raw of patchText.split('\n')) {
        const line = raw.replace(/#.*$/, '').trimEnd();
        if (line.trim() === '')
            continue;
        if (/^-\s+insert:\s*$/.test(line))
            continue;
        const id = /^\s+-\s+id:\s*(\S+)\s*$/.exec(line);
        if (id !== null) {
            if (pending !== null)
                return null;
            pending = id[1];
            continue;
        }
        const name = /^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
        if (name !== null && pending !== null) {
            rows.push({ id: pending, name: name[1] });
            pending = null;
            continue;
        }
        return null;
    }
    if (pending !== null || rows.length === 0)
        return null;
    return rows;
}
/** Wipe leftover hot-mount inputs; call once when the market host starts. */
export function cleanHotDir(profileDir) {
    rmSync(join(profileDir, HOT_DIR), { force: true, recursive: true });
}
let hotSequence = 0;
const hotHandles = new Map();
/**
 * Dispose a plugin hot-mounted earlier in this session, removing it from the
 * running composition immediately.
 * @param packageName - package to unmount.
 * @returns true when a live hot mount was found and disposed.
 */
export async function hotUnmount(packageName) {
    const handle = hotHandles.get(packageName);
    if (handle === undefined)
        return false;
    hotHandles.delete(packageName);
    try {
        await handle.dispose();
        logEvent('info', 'hot-unmount', `${packageName}: removed live`);
        return true;
    }
    catch (error) {
        logEvent('warn', 'hot-unmount', `${packageName}: dispose failed — ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
/**
 * Mount `packageName` (just installed into the profile) into the running
 * composition.
 * @param ctx - market host context; the subtree unwinds with the market's fiber.
 * @param profileDir - profile the package was installed into.
 * @param packageName - installed package to activate.
 * @returns true when the plugin is live without a restart; false when the
 * caller should show the restart banner instead.
 */
export async function hotMount(ctx, profileDir, packageName) {
    try {
        const HotTree = await loadHotTreeClass();
        if (HotTree === null)
            return false;
        const patchText = readFileSync(join(profileDir, 'node_modules', packageName, 'cordis.patch.yml'), 'utf8');
        const rows = parseSimplePatch(patchText);
        if (rows === null)
            return false;
        const dir = join(profileDir, HOT_DIR);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        hotSequence += 1;
        const file = join(dir, `hot-${String(hotSequence)}.yml`);
        const yml = rows
            .map(row => `- id: mkt-${row.id}\n  name: '${row.name}'\n`)
            .join('');
        writeFileSync(file, yml);
        const handle = ctx.plugin(HotTree, { path: pathToFileURL(file).href });
        await handle.await();
        hotHandles.set(packageName, handle);
        ctx.logger?.info?.(`[dsh-plugin-market] hot-mounted ${packageName}`);
        logEvent('info', 'hot-mount', `${packageName}: live`);
        return true;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn(`[dsh-plugin-market] hot mount of ${packageName} failed, restart required: ${message}`);
        logEvent('warn', 'hot-mount', `${packageName}: fell back to restart — ${message}`);
        return false;
    }
}
