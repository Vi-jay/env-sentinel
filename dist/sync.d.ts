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
/**
 * Append example keys that are absent from `envContents`.
 * Copies each example placeholder block. Does not change keys that already exist, including empty ones.
 */
export declare function fillMissingKeys(envContents: string, exampleContents: string, confirm?: (key: string) => boolean): {
    contents: string;
    added: string[];
    declined: string[];
};
//# sourceMappingURL=sync.d.ts.map