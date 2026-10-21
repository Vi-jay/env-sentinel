import { isAbsolute, resolve } from 'node:path';

import { fileExists, readText, writeTextAtomic } from './fsutil.js';
import { parseEnv } from './parse.js';
import type { EnvFill, ParseResult, ParsedEntry, SyncMessage, SyncOptions, SyncResult } from './types.js';

const HEADER = '# --- synced from .env (values omitted) ---';
const FILL_HEADER = '# --- added by env-sentinel sync --fix ---';

const COMMON_VALUES = new Set([
  'true',
  'false',
  'yes',
  'no',
  'development',
  'production',
  'test',
  'staging',
  'localhost',
  'changeme',
  'placeholder',
  'example',
  'postgres',
  'mysql',
  'redis',
  'mongodb',
  'password',
  'secret',
]);

/**
 * Build example-file text from an env document.
 * Assignment values are never copied. Comment lines and blank lines are kept.
 * Malformed lines are dropped so a broken line cannot carry a secret into the example.
 */
export function renderExample(contents: string): { contents: string; messages: SyncMessage[] } {
  const parsed = parseEnv(contents);
  return {
    contents: renderParsed(contents, parsed, null),
    messages: messagesFor(parsed),
  };
}

export function sync(options: SyncOptions): SyncResult {
  const cwd = options.cwd ?? process.cwd();
  const examplePath = options.examplePath;
  const exampleAbsolute = isAbsolute(examplePath) ? examplePath : resolve(cwd, examplePath);

  if (options.envPaths.length === 0) {
    return emptyResult(examplePath, [{ severity: 'error', message: 'Provide at least one env file' }]);
  }

  const envParts: { path: string; contents: string }[] = [];
  for (const envPath of options.envPaths) {
    const envAbsolute = isAbsolute(envPath) ? envPath : resolve(cwd, envPath);
    const envRead = readText(envAbsolute);
    if (!envRead.ok) return emptyResult(examplePath, [{ severity: 'error', message: envRead.message }]);
    envParts.push({ path: envPath, contents: envRead.contents });
  }
  const merged = mergeEnvDocuments(envParts);
  const envKeyList = firstKeys(merged.entries);

  const exists = fileExists(exampleAbsolute);
  if (options.command === 'init' && exists) {
    return {
      path: examplePath,
      contents: '',
      created: false,
      changed: false,
      wrote: false,
      refused: false,
      added: [],
      removed: [],
      messages: [
        {
          severity: 'error',
          message: `${examplePath} already exists. Use sync to update it without copying values.`,
        },
      ],
    };
  }

  const messages = merged.messages;

  if (!exists) {
    const leaked = leakedKeys(merged.contents, merged.entries);
    if (leaked.length > 0) return refusal(examplePath, leaked, messages);
    return attachFill(
      writeResult({
        path: examplePath,
        absolute: exampleAbsolute,
        contents: merged.contents,
        created: true,
        previous: null,
        added: envKeyList,
        removed: [],
        messages,
        dryRun: options.dryRun ?? false,
      }),
      options,
      cwd,
      primaryEnv(envParts),
    );
  }

  const exampleRead = readText(exampleAbsolute);
  if (!exampleRead.ok) {
    return {
      path: examplePath,
      contents: '',
      created: false,
      changed: false,
      wrote: false,
      refused: false,
      added: [],
      removed: [],
      messages: [...messages, { severity: 'error', message: exampleRead.message }],
    };
  }

  const exampleParsed = parseEnv(exampleRead.contents);
  const envKeys = new Set(envKeyList);
  const pruned = options.prune
    ? pruneContents(exampleRead.contents, exampleParsed, envKeys)
    : { contents: exampleRead.contents, removed: [] as string[] };

  const kept = new Set(parseEnv(pruned.contents).entries.map((entry) => entry.key));
  const toAdd = envKeyList.filter((key) => !kept.has(key));
  let contents = pruned.contents;
  if (toAdd.length > 0) {
    const selected = renderSelected(merged.entries, new Set(toAdd));
    const leaked = leakedKeys(
      selected,
      merged.entries.filter((entry) => toAdd.includes(entry.key)),
    );
    if (leaked.length > 0) return refusal(examplePath, leaked, messages);
    contents = appendSection(pruned.contents, selected);
  }

  return attachFill(
    writeResult({
      path: examplePath,
      absolute: exampleAbsolute,
      contents: ensureTrailingNewline(contents),
      created: false,
      previous: exampleRead.contents,
      added: toAdd,
      removed: pruned.removed,
      messages,
      dryRun: options.dryRun ?? false,
    }),
    options,
    cwd,
    primaryEnv(envParts),
  );
}

/**
 * Append example keys that are absent from `envContents`.
 * Copies each example placeholder block. Does not change keys that already exist, including empty ones.
 */
export function fillMissingKeys(
  envContents: string,
  exampleContents: string,
  confirm?: (key: string) => boolean,
): { contents: string; added: string[]; declined: string[] } {
  const example = parseEnv(exampleContents);
  const present = new Set(parseEnv(envContents).entries.map((entry) => entry.key));
  const added: string[] = [];
  const declined: string[] = [];
  const seen = new Set<string>();
  let blocks = '';
  for (const entry of example.entries) {
    if (!entry.wellFormed || seen.has(entry.key)) continue;
    seen.add(entry.key);
    if (present.has(entry.key)) continue;
    if (confirm && !confirm(entry.key)) {
      declined.push(entry.key);
      continue;
    }
    let block = exampleContents.slice(entry.blockStart, entry.blockEnd);
    if (block.length === 0) continue;
    if (!block.endsWith('\n')) block += '\n';
    blocks += block;
    added.push(entry.key);
  }
  if (added.length === 0) return { contents: envContents, added, declined };
  const header = envContents.includes(FILL_HEADER) ? '' : `${FILL_HEADER}\n`;
  const base = envContents.length === 0 ? '' : envContents.endsWith('\n') ? envContents : `${envContents}\n`;
  const gap = base.length === 0 || header.length === 0 ? '' : '\n';
  return { contents: `${base}${gap}${header}${blocks}`, added, declined };
}

function primaryEnv(parts: { path: string; contents: string }[]): { path: string; contents: string } | null {
  return parts[0] ?? null;
}

function attachFill(
  result: SyncResult,
  options: SyncOptions,
  cwd: string,
  env: { path: string; contents: string } | null,
): SyncResult {
  if (!options.fix || !env) return result;
  if (result.refused || result.messages.some((message) => message.severity === 'error')) return result;
  if (result.contents.length === 0) return result;
  const filled = fillMissingKeys(env.contents, result.contents, options.confirm);
  const envFill: EnvFill = {
    path: env.path,
    added: filled.added,
    declined: filled.declined,
    changed: filled.contents !== env.contents,
    wrote: false,
  };
  if (!envFill.changed || options.dryRun) return { ...result, envFill };
  const absolute = isAbsolute(env.path) ? env.path : resolve(cwd, env.path);
  const written = writeTextAtomic(absolute, filled.contents);
  if (!written.ok) {
    return {
      ...result,
      envFill,
      messages: [...result.messages, { severity: 'error', message: written.message }],
    };
  }
  return { ...result, envFill: { ...envFill, wrote: true } };
}

function emptyResult(path: string, messages: SyncMessage[]): SyncResult {
  return {
    path,
    contents: '',
    created: false,
    changed: false,
    wrote: false,
    refused: false,
    added: [],
    removed: [],
    messages,
  };
}

interface MergedEnv {
  contents: string;
  messages: SyncMessage[];
  entries: ParsedEntry[];
}

function mergeEnvDocuments(parts: { path: string; contents: string }[]): MergedEnv {
  const messages: SyncMessage[] = [];
  const entries: ParsedEntry[] = [];
  const seen = new Set<string>();
  let contents = '';
  parts.forEach((part, index) => {
    const parsed = parseEnv(part.contents);
    entries.push(...parsed.entries);
    const prefix = parts.length > 1 ? `${part.path}: ` : '';
    for (const message of messagesFor(parsed)) {
      messages.push({ ...message, message: `${prefix}${message.message}` });
    }
    if (index === 0) {
      contents = renderParsed(part.contents, parsed, null);
      for (const key of firstKeys(parsed.entries)) seen.add(key);
      return;
    }
    const add = new Set<string>();
    for (const entry of parsed.entries) {
      if (seen.has(entry.key)) continue;
      seen.add(entry.key);
      add.add(entry.key);
    }
    if (add.size > 0) contents = appendSection(contents, renderSelected(parsed.entries, add));
  });
  return { contents: ensureTrailingNewline(contents), messages, entries };
}

function firstKeys(entries: ParsedEntry[]): string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    if (!keys.includes(entry.key)) keys.push(entry.key);
  }
  return keys;
}

function appendSection(existing: string, selected: string): string {
  if (selected.length === 0) return existing;
  const header = existing.includes(HEADER) ? '' : `${HEADER}\n`;
  const base = existing.length === 0 ? '' : existing.endsWith('\n') ? existing : `${existing}\n`;
  const gap = base.length === 0 ? '' : '\n';
  return `${base}${gap}${header}${selected}`;
}

function writeResult(input: {
  path: string;
  absolute: string;
  contents: string;
  created: boolean;
  previous: string | null;
  added: string[];
  removed: string[];
  messages: SyncMessage[];
  dryRun: boolean;
}): SyncResult {
  const changed = input.previous === null || input.previous !== input.contents;
  if (!changed || input.dryRun) {
    return {
      path: input.path,
      contents: input.contents,
      created: input.created,
      changed,
      wrote: false,
      refused: false,
      added: input.added,
      removed: input.removed,
      messages: input.messages,
    };
  }
  const written = writeTextAtomic(input.absolute, input.contents);
  if (!written.ok) {
    return {
      path: input.path,
      contents: input.contents,
      created: input.created,
      changed,
      wrote: false,
      refused: false,
      added: input.added,
      removed: input.removed,
      messages: [...input.messages, { severity: 'error', message: written.message }],
    };
  }
  return {
    path: input.path,
    contents: input.contents,
    created: input.created,
    changed: true,
    wrote: true,
    refused: false,
    added: input.added,
    removed: input.removed,
    messages: input.messages,
  };
}

function refusal(path: string, keys: string[], messages: SyncMessage[]): SyncResult {
  return {
    path,
    contents: '',
    created: false,
    changed: false,
    wrote: false,
    refused: true,
    added: [],
    removed: [],
    messages: [
      ...messages,
      {
        severity: 'error',
        message: `Refusing to write ${path}. A comment repeats the value of ${keys.join(', ')}. Assignment values are omitted, but comments are copied as written. Edit the comment and run again.`,
      },
    ],
  };
}

function renderParsed(contents: string, parsed: ParseResult, only: Set<string> | null): string {
  let cursor = contents.charCodeAt(0) === 0xfeff ? 1 : 0;
  let out = '';
  const seen = new Set<string>();
  for (const entry of parsed.entries) {
    if (only && !only.has(entry.key)) {
      cursor = entry.blockEnd;
      continue;
    }
    out += safeGap(contents.slice(cursor, entry.blockStart));
    if (!seen.has(entry.key)) {
      seen.add(entry.key);
      out += emitEntry(entry);
    }
    cursor = entry.blockEnd;
  }
  if (!only) out += safeGap(contents.slice(cursor));
  return ensureTrailingNewline(out);
}

function renderSelected(entries: ParsedEntry[], keys: Set<string>): string {
  let out = '';
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!keys.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out += emitEntry(entry);
  }
  return out;
}

function emitEntry(entry: ParsedEntry): string {
  const lines = [...entry.precedingCommentLines];
  const prefix = entry.exported ? 'export ' : '';
  lines.push(`${entry.indent}${prefix}${entry.key}=${entry.inlineSuffix}`);
  return `${lines.join('\n')}\n`;
}

function safeGap(gap: string): string {
  if (gap.length === 0) return '';
  const endsWithNewline = gap.endsWith('\n');
  const lines = gap.split(/\r?\n/);
  if (endsWithNewline) lines.pop();
  const kept = lines.filter((line) => isSafeGapLine(line));
  if (kept.length === 0) return '';
  return `${kept.join('\n')}\n`;
}

function isSafeGapLine(line: string): boolean {
  return /^\s*$/.test(line) || /^\s*#/.test(line);
}

function pruneContents(
  contents: string,
  parsed: ParseResult,
  keep: Set<string>,
): { contents: string; removed: string[] } {
  const removed: string[] = [];
  const ranges = parsed.entries
    .filter((entry) => !keep.has(entry.key))
    .map((entry) => {
      if (!removed.includes(entry.key)) removed.push(entry.key);
      return [entry.blockStart, entry.blockEnd] as const;
    })
    .sort((a, b) => b[0] - a[0]);
  let next = contents;
  for (const [start, end] of ranges) {
    next = next.slice(0, start) + next.slice(end);
  }
  return { contents: next, removed };
}

function messagesFor(parsed: ParseResult): SyncMessage[] {
  return parsed.diagnostics.map((diagnostic) => ({
    severity: 'warning',
    message:
      diagnostic.code === 'duplicate'
        ? `${diagnostic.message} Only the first occurrence is written to the example.`
        : `${diagnostic.message} The line was omitted from the example.`,
    line: diagnostic.line,
    ...(diagnostic.key ? { key: diagnostic.key } : {}),
  }));
}

function leakedKeys(generated: string, entries: ParsedEntry[]): string[] {
  const leaked: string[] = [];
  for (const entry of entries) {
    if (leaked.includes(entry.key)) continue;
    for (const candidate of secretCandidates(entry)) {
      if (generated.includes(candidate)) {
        leaked.push(entry.key);
        break;
      }
    }
  }
  return leaked;
}

function secretCandidates(entry: ParsedEntry): string[] {
  const chunks = new Set<string>();
  for (const value of [entry.value, entry.rawInner]) {
    if (isSensitive(value)) chunks.add(value);
    for (const line of value.split(/\r?\n/)) {
      if (isSensitive(line)) chunks.add(line);
    }
  }
  return [...chunks];
}

function isSensitive(value: string): boolean {
  if (value.length < 8) return false;
  if (COMMON_VALUES.has(value.toLowerCase())) return false;
  if (/^[0-9]+$/.test(value)) return false;
  return true;
}

function ensureTrailingNewline(contents: string): string {
  if (contents.length === 0 || contents.endsWith('\n')) return contents;
  return `${contents}\n`;
}
