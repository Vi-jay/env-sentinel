import type { ParseResult } from './types.js';
/**
 * Parse a dotenv document.
 *
 * Supported on purpose, and covered by tests:
 * - `KEY=value` with spaces around `=`
 * - `export KEY=value`
 * - single quotes, double quotes, and backticks
 * - multiline quoted values
 * - double-quote escapes (`\n`, `\r`, `\t`, `\\`, `\"`, `\'`, `\``, `\$`, `\uXXXX`)
 * - single-quote escapes (`\\`, `\'` only)
 * - full-line `#` comments and inline comments (a `#` ends an unquoted value when
 *   it is the first value character, or when whitespace precedes it)
 * - duplicate keys (recorded; the last assignment wins in `variables`)
 * - CRLF, lone CR, and a leading UTF-8 BOM
 *
 * Values are returned decoded. Callers that print anything must mask them.
 */
export declare function parseEnv(contents: string): ParseResult;
//# sourceMappingURL=parse.d.ts.map