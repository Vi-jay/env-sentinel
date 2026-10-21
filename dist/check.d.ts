import type { CheckContentsInput, CheckOptions, CheckReport, FileReport } from './types.js';
export declare function check(options: CheckOptions): CheckReport;
export declare function checkContents(input: CheckContentsInput): FileReport;
export declare function combineReports(reports: CheckReport[], strict: boolean): CheckReport;
//# sourceMappingURL=check.d.ts.map