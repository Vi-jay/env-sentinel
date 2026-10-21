/**
 * Expand `$NAME`, `${NAME}`, `${NAME:-default}`, and `${NAME-default}`
 * inside one env file.
 *
 * `:-` substitutes the default when the name is unset or empty.
 * `-` substitutes the default only when the name is unset.
 * A cycle, an undefined name, or a chain deeper than {@link MAX_EXPAND_DEPTH}
 * fails closed: `value` is empty so a caller cannot print a partial secret.
 * An unclosed `${` is left as literal text.
 */
export declare const MAX_EXPAND_DEPTH = 32;
export interface ExpandResult {
    /** True when every reference resolved. */
    ok: boolean;
    /** Resolved text when `ok`. Empty when expansion failed. */
    value: string;
    /** True when the template contains at least one supported reference. */
    hasReference: boolean;
    undefinedNames: string[];
    circularNames: string[];
    depthExceeded: boolean;
}
export type ExpandLookup = (name: string) => string | undefined;
export declare function expandValue(template: string, lookup: ExpandLookup): ExpandResult;
//# sourceMappingURL=expand.d.ts.map