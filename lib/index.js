/**
 * dsh-market host entry: mounts the market's HTTP routes once the profile
 * composes the webServer and shell services. The optional `llm` service is
 * used for query translation; when absent, search falls back to the thesaurus.
 */
import { mountMarketRoutes } from './routes.js';
export const name = 'dsh-market';
/**
 * Register the market against the host context.
 * @param ctx - Host context that may acquire webServer, llm and shell services.
 * @param config - Optional profile override from the loader.
 */
export function apply(ctx, config) {
    const resolved = {
        profile: config?.profile ?? 'web',
        translateProvider: config?.translateProvider,
        translateModel: config?.translateModel,
    };
    ctx.inject(['webServer'], (hostCtx) => {
        hostCtx.effect(() => mountMarketRoutes(hostCtx, resolved, ctx.get('llm')), 'dsh-market: http routes');
    });
}
