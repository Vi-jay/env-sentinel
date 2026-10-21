import type { FileConfig } from './types.js';
export declare function loadConfig(path: string): {
    ok: true;
    config: FileConfig;
} | {
    ok: false;
    message: string;
};
/**
 * Read the `env-sentinel` object from `package.json` in `cwd`.
 * Returns null when the file or the key is absent.
 */
export declare function loadPackageConfig(cwd: string): {
    ok: true;
    config: FileConfig | null;
} | {
    ok: false;
    message: string;
};
/** True when `name` matches a pattern. `*` is any run of characters and `?` is one character. */
export declare function ignoreMatch(name: string, patterns: readonly string[]): boolean;
//# sourceMappingURL=config.d.ts.map