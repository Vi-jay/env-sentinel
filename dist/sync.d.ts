import type { SyncMessage, SyncOptions, SyncResult } from './types.js';
/**
 * Build example-file text from an env document.
 * Assignment values are never copied. Comment lines and blank lines are kept.
 * Malformed lines are dropped so a broken line cannot carry a secret into the example.
 */
export declare function renderExample(contents: string): {
    contents: string;
    messages: SyncMessage[];
};
export declare function sync(options: SyncOptions): SyncResult;
//# sourceMappingURL=sync.d.ts.map