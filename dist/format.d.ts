import type { CheckReport } from './types.js';
export interface FormatOptions {
    format: 'human' | 'json';
    color: boolean;
    version?: string;
}
export declare function formatReport(report: CheckReport, options: FormatOptions): string;
//# sourceMappingURL=format.d.ts.map