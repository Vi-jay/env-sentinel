export interface EnvPair {
    envPath: string;
    examplePath: string;
}
/**
 * Find `.env` / `.env.example` pairs under directories matched by `patterns`.
 * A pair is `.env` with `.env.example`, or `.env.<name>` with `.env.<name>.example`.
 * Both files must exist. `*` matches one path segment and `**` matches any depth.
 * `node_modules`, `.git`, `dist`, `dist-test`, and `coverage` are skipped. Symlinks are not followed.
 */
export declare function discoverEnvPairs(cwd: string, patterns: readonly string[]): {
    ok: true;
    pairs: EnvPair[];
} | {
    ok: false;
    message: string;
};
//# sourceMappingURL=discover.d.ts.map