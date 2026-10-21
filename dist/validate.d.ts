import type { TypeSpec } from './types.js';
/**
 * True when the value contains `$NAME`, `${NAME}`, `${NAME:-default}`, or `${NAME-default}`.
 * An unclosed `${` is not a reference.
 */
export declare function containsInterpolation(value: string): boolean;
/**
 * Return a problem description when `value` does not match `type`.
 * Returns null when the value is acceptable. Callers mask the value themselves.
 */
export declare function typeProblem(type: TypeSpec, value: string): string | null;
//# sourceMappingURL=validate.d.ts.map