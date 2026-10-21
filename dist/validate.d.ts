import type { TypeSpec } from './types.js';
/** True when the value is only a `$NAME` or `${NAME}` reference, or contains one. */
export declare function containsInterpolation(value: string): boolean;
/**
 * Return a problem description when `value` does not match `type`.
 * Returns null when the value is acceptable. Callers mask the value themselves.
 */
export declare function typeProblem(type: TypeSpec, value: string): string | null;
//# sourceMappingURL=validate.d.ts.map