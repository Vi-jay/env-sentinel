/**
 * Mask a value for display.
 * The result never contains characters from `value`. Empty values are
 * reported as `(empty)` so they are not confused with a masked secret.
 */
export declare function maskSecret(value: string): string;
/** Character length after stripping CR/LF so multiline secrets are counted once. */
export declare function valueLength(value: string): number;
//# sourceMappingURL=mask.d.ts.map