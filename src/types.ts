/**
 * Shared types for the env-sentinel library.
 * Parsed values are real secrets. Never log a `ParsedEntry` or raw file
 * contents; use `maskSecret` and the finding types, which are already masked.
 */

export type Severity = 'error' | 'warning';

export type FindingCode =
  | 'missing'
  | 'extra'
  | 'empty'
  | 'duplicate'
  | 'malformed'
  | 'unclosed-quote'
  | 'type-mismatch'
  | 'undefined-var'
  | 'circular-ref'
  | 'unknown-type'
  | 'schema-invalid'
  | 'file-not-found'
  | 'unreadable';

export type TypeName = 'string' | 'url' | 'int' | 'bool' | 'email' | 'port' | 'enum';

export interface TypeSpec {
  name: TypeName;
  /** Present when `name` is `enum`. */
  values?: string[];
  /** The annotation text, such as `port` or `enum(debug,info)`. */
  raw: string;
}

export interface Finding {
  severity: Severity;
  code: FindingCode;
  message: string;
  file: string;
  line?: number;
  endLine?: number;
  key?: string;
  /** A fully masked stand-in. Never the raw value. */
  maskedValue?: string;
  /** Character length of the raw value, when a value was inspected. */
  valueLength?: number;
}

export type QuoteStyle = 'none' | 'single' | 'double' | 'backtick';

export interface ParseDiagnostic {
  code: 'malformed' | 'unclosed-quote' | 'duplicate';
  message: string;
  line: number;
  endLine: number;
  key?: string;
  /** Line of the earlier definition when `code` is `duplicate`. */
  otherLine?: number;
}

export interface ParsedEntry {
  key: string;
  /** Decoded value. This is secret material. Do not print it. */
  value: string;
  /**
   * Exact characters between quotes, or the trimmed unquoted text.
   * Secret material. Used only to keep generated examples from echoing values.
   */
  rawInner: string;
  quote: QuoteStyle;
  exported: boolean;
  line: number;
  endLine: number;
  /** Comment text with the leading `#` removed and trimmed, preceding lines then inline. */
  comments: string[];
  /** Original comment lines belonging to this key, without line breaks. */
  precedingCommentLines: string[];
  /** Original inline comment including the `#` and the space before it, or empty. */
  inlineSuffix: string;
  /** Whitespace before `export` or the key. */
  indent: string;
  /** Index of the first preceding comment, or of the assignment line. */
  blockStart: number;
  /** Index just after the newline that ends the assignment. */
  blockEnd: number;
  wellFormed: boolean;
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Last well-formed (or last) assignment wins, matching dotenv. */
  variables: Map<string, ParsedEntry>;
  diagnostics: ParseDiagnostic[];
}

export interface Variable {
  name: string;
  required: boolean;
  /** True when the declaration explicitly used `@optional`, `@required`, `required`, or `optional`. */
  requiredSpecified?: boolean;
  type?: TypeSpec;
  description?: string;
  /** Line of the key in the file that declared it. */
  line?: number;
  source: string;
}

export interface Schema {
  /** Display name of the schema source, usually a file path. */
  path: string;
  variables: Variable[];
  findings: Finding[];
}

export interface FileReport {
  path: string;
  role: 'env' | 'schema';
  ok: boolean;
  /** Schema keys compared, or variables parsed for a schema file. */
  checked: number;
  findings: Finding[];
}

export interface CheckReport {
  ok: boolean;
  strict: boolean;
  files: FileReport[];
  summary: {
    errors: number;
    warnings: number;
  };
}

export interface CheckOptions {
  cwd?: string;
  envPaths: string[];
  examplePath?: string;
  schemaPath?: string;
  strict?: boolean;
}

export interface CheckContentsInput {
  schema: Schema;
  env: { path: string; contents: string };
  strict?: boolean;
}

export type SyncCommand = 'sync' | 'init';

export interface SyncMessage {
  severity: Severity;
  message: string;
  line?: number;
  key?: string;
}

export interface SyncResult {
  path: string;
  contents: string;
  created: boolean;
  changed: boolean;
  wrote: boolean;
  /** True when a copied comment still contained an env value. Nothing is written. */
  refused: boolean;
  added: string[];
  removed: string[];
  messages: SyncMessage[];
}

export interface SyncOptions {
  cwd?: string;
  /** Read in order. The first file contributes structure; later files only add new keys. */
  envPaths: string[];
  examplePath: string;
  prune?: boolean;
  dryRun?: boolean;
  /** `init` refuses when the example file already exists. `sync` creates or updates it. */
  command: SyncCommand;
}

export interface FileConfig {
  env?: string[];
  example?: string;
  schema?: string;
  strict?: boolean;
  format?: 'human' | 'json';
}
