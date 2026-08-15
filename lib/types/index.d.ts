/**
 * dsh-plugin-market host entry types.
 * `apply` registers the market's HTTP routes against the host context.
 */
export declare const name: string;
export declare function apply(ctx: {
    get(service: 'llm' | 'loader' | 'webServer'): unknown;
    inject(services: string[], callback: (hostCtx: any) => void): void;
}, config?: {
    profile?: string;
    translateProvider?: string;
    translateModel?: string;
}): void;
