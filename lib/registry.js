/**
 * Registry access: fetch the curated list from awesome-dsh-plugin.com with an
 * in-memory cache, falling back to the bundled snapshot when offline.
 *
 * `loadRegistry(force)`:
 * - default: serve the in-memory cache when it is fresher than TTL_MS;
 * - force=true: always hit the network (used when the market UI loads so the
 *   curated list is as fresh as possible), falling back to cache/snapshot on
 *   any network failure — never fail the request over staleness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const TTL_MS = 60 * 60 * 1000;
let cache = null;
function snapshot() {
    const path = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url));
    return JSON.parse(readFileSync(path, 'utf8'));
}
export async function loadRegistry(force = false) {
    if (!force && cache && Date.now() - cache.at < TTL_MS) {
        return { registry: cache.data, source: 'cache' };
    }
    try {
        // awesome-dsh-plugin.com 生成整站时响应较慢（实测 5–6s），4s 超时
        // 会让实时拉取总是失败回退；放宽到 15s。
        const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(15000) });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        if (!Array.isArray(data.plugins) || data.plugins.length === 0)
            throw new Error('empty registry');
        cache = { at: Date.now(), data };
        return { registry: data, source: 'live' };
    }
    catch {
        return { registry: cache?.data ?? snapshot(), source: cache ? 'cache' : 'snapshot' };
    }
}
