import type { FindingCode } from './types.js';
export type ReadResult = {
    ok: true;
    contents: string;
} | {
    ok: false;
    code: Extract<FindingCode, 'file-not-found' | 'unreadable'>;
    message: string;
};
export declare function readText(path: string): ReadResult;
export declare function fileExists(path: string): boolean;
/** Write via a temp file in the same directory so a crash cannot truncate the target. */
export declare function writeTextAtomic(path: string, contents: string): {
    ok: true;
} | {
    ok: false;
    message: string;
};
//# sourceMappingURL=fsutil.d.ts.map