import type { TypeSpec } from './types.js';
export interface AnnotationParse {
    required: boolean;
    /** True when the comments named `@optional` or `@required`. */
    requiredSpecified: boolean;
    type?: TypeSpec;
    description?: string;
    unknownType?: string;
    invalidEnum: boolean;
}
/**
 * Read `@type`, `@optional`, and `@required` from comment bodies.
 * Later markers win. Surrounding prose becomes the description.
 */
export declare function parseAnnotations(comments: string[]): AnnotationParse;
export declare function parseTypeToken(rawName: string, enumInner: string | undefined, explicitValues?: string[]): {
    type?: TypeSpec;
    unknown?: string;
    invalidEnum?: boolean;
    raw: string;
};
//# sourceMappingURL=annotations.d.ts.map