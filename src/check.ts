import { isAbsolute, resolve } from 'node:path';

import { ignoreMatch } from './config.js';
import { expandValue, type ExpandLookup } from './expand.js';
import { maskSecret, valueLength } from './mask.js';
import { parseEnv } from './parse.js';
import { loadSchemaFromContents, mergeSchemas } from './schema.js';
import type {
  CheckContentsInput,
  CheckOptions,
  CheckReport,
  FileReport,
  Finding,
  ParsedEntry,
  Schema,
} from './types.js';
import { typeProblem } from './validate.js';
import { readText } from './fsutil.js';

export function check(options: CheckOptions): CheckReport {
  const cwd = options.cwd ?? process.cwd();
  const strict = options.strict ?? false;
  const files: FileReport[] = [];

  if (!options.examplePath && !options.schemaPath) {
    return finish(
      [
        {
          path: '(schema)',
          role: 'schema',
          ok: false,
          checked: 0,
          findings: [
            {
              severity: 'error',
              code: 'schema-invalid',
              message: 'Provide an example file or a JSON schema',
              file: '(schema)',
            },
          ],
        },
      ],
      strict,
    );
  }

  const loaded = loadInputs(options, cwd);
  files.push(...loaded.reports);
  if (!loaded.schema) return finish(files, strict);

  if (loaded.schema.findings.length > 0) {
    files.push({
      path: loaded.schema.path,
      role: 'schema',
      ok: false,
      checked: loaded.schema.variables.length,
      findings: loaded.schema.findings,
    });
  }

  for (const envPath of options.envPaths) {
    const absolute = resolvePath(cwd, envPath);
    const read = readText(absolute);
    if (!read.ok) {
      files.push({
        path: envPath,
        role: 'env',
        ok: false,
        checked: 0,
        findings: [
          {
            severity: 'error',
            code: read.code,
            message: read.message,
            file: envPath,
          },
        ],
      });
      continue;
    }
    files.push(
      checkContents({
        schema: loaded.schema,
        env: { path: envPath, contents: read.contents },
        strict,
        ...(options.ignore && options.ignore.length > 0 ? { ignore: options.ignore } : {}),
      }),
    );
  }

  return finish(files, strict);
}

export function checkContents(input: CheckContentsInput): FileReport {
  const strict = input.strict ?? false;
  const parsed = parseEnv(input.env.contents);
  const findings: Finding[] = [];

  for (const diagnostic of parsed.diagnostics) {
    findings.push({
      severity: 'error',
      code: diagnostic.code === 'duplicate' ? 'duplicate' : diagnostic.code === 'unclosed-quote' ? 'unclosed-quote' : 'malformed',
      message: diagnostic.message,
      file: input.env.path,
      line: diagnostic.line,
      endLine: diagnostic.endLine,
      ...(diagnostic.key ? { key: diagnostic.key } : {}),
    });
  }

  const schemaNames = new Set(input.schema.variables.map((variable) => variable.name));
  const lookup: ExpandLookup = (name) => {
    const target = parsed.variables.get(name);
    if (!target?.wellFormed) return undefined;
    return target.value;
  };

  for (const variable of input.schema.variables) {
    const entry = parsed.variables.get(variable.name);
    if (!entry) {
      if (!variable.required) continue;
      const where =
        variable.line !== undefined ? ` (declared in ${variable.source}:${String(variable.line)})` : '';
      findings.push({
        severity: 'error',
        code: 'missing',
        message: `Required key is missing${where}`,
        file: input.env.path,
        key: variable.name,
      });
      continue;
    }
    if (!entry.wellFormed) continue;
    if (entry.value.trim() === '') {
      if (variable.required) {
        findings.push({
          severity: 'error',
          code: 'empty',
          message: 'Required value is empty',
          file: input.env.path,
          line: entry.line,
          key: variable.name,
          maskedValue: '(empty)',
          valueLength: 0,
        });
      }
      continue;
    }
    const inspected = inspectExpansion(entry, input.env.path, lookup);
    findings.push(...inspected.findings);
    if (inspected.expanded === null || !variable.type) continue;
    const problem = typeProblem(variable.type, inspected.expanded);
    if (!problem) continue;
    findings.push({
      severity: 'error',
      code: 'type-mismatch',
      message: `${problem}. Value masked`,
      file: input.env.path,
      line: entry.line,
      endLine: entry.endLine,
      key: variable.name,
      maskedValue: maskSecret(inspected.expanded),
      valueLength: valueLength(inspected.expanded),
    });
  }

  const ignore = input.ignore ?? [];
  for (const entry of parsed.entries) {
    if (schemaNames.has(entry.key)) continue;
    if (parsed.variables.get(entry.key) !== entry) continue;
    if (ignoreMatch(entry.key, ignore)) continue;
    findings.push({
      severity: strict ? 'error' : 'warning',
      code: 'extra',
      message: `Not documented in ${input.schema.path}`,
      file: input.env.path,
      line: entry.line,
      key: entry.key,
    });
    if (!entry.wellFormed || entry.value.trim() === '') continue;
    findings.push(...inspectExpansion(entry, input.env.path, lookup).findings);
  }

  findings.sort(compareFindings);
  const errors = findings.filter((finding) => finding.severity === 'error').length;
  return {
    path: input.env.path,
    role: 'env',
    ok: errors === 0,
    checked: input.schema.variables.length,
    findings,
  };
}

function loadInputs(
  options: CheckOptions,
  cwd: string,
): { schema: Schema | null; reports: FileReport[] } {
  const reports: FileReport[] = [];
  const pieces: Schema[] = [];

  if (options.examplePath) {
    const loaded = readSchema(options.examplePath, cwd, 'dotenv');
    if (!loaded.ok) {
      reports.push(loaded.report);
    } else {
      pieces.push(loaded.schema);
    }
  }
  if (options.schemaPath) {
    const format = options.schemaPath.endsWith('.json') ? 'json' : 'dotenv';
    const loaded = readSchema(options.schemaPath, cwd, format);
    if (!loaded.ok) {
      reports.push(loaded.report);
    } else {
      pieces.push(loaded.schema);
    }
  }

  if (reports.some((report) => report.findings.some((finding) => finding.code === 'file-not-found' || finding.code === 'unreadable'))) {
    return { schema: null, reports };
  }
  const first = pieces[0];
  if (!first) return { schema: null, reports };
  const schema = pieces.slice(1).reduce((acc, piece) => mergeSchemas(acc, piece), first);
  return { schema, reports };
}

function readSchema(
  displayPath: string,
  cwd: string,
  format: 'dotenv' | 'json',
): { ok: true; schema: Schema } | { ok: false; report: FileReport } {
  const read = readText(resolvePath(cwd, displayPath));
  if (!read.ok) {
    return {
      ok: false,
      report: {
        path: displayPath,
        role: 'schema',
        ok: false,
        checked: 0,
        findings: [
          {
            severity: 'error',
            code: read.code,
            message: read.message,
            file: displayPath,
          },
        ],
      },
    };
  }
  return { ok: true, schema: loadSchemaFromContents(read.contents, displayPath, format) };
}

export function combineReports(reports: CheckReport[], strict: boolean): CheckReport {
  return finish(
    reports.flatMap((report) => report.files),
    strict,
  );
}

function finish(files: FileReport[], strict: boolean): CheckReport {
  let errors = 0;
  let warnings = 0;
  for (const file of files) {
    let fileErrors = 0;
    for (const finding of file.findings) {
      if (finding.severity === 'error') {
        errors += 1;
        fileErrors += 1;
      } else {
        warnings += 1;
      }
    }
    file.ok = fileErrors === 0;
  }
  return {
    ok: errors === 0,
    strict,
    files,
    summary: { errors, warnings },
  };
}

function inspectExpansion(
  entry: ParsedEntry,
  file: string,
  lookup: ExpandLookup,
): { findings: Finding[]; expanded: string | null } {
  const expansion = expandValue(entry.value, lookup);
  if (!expansion.hasReference && expansion.ok) {
    return { findings: [], expanded: entry.value };
  }
  const base = {
    file,
    line: entry.line,
    endLine: entry.endLine,
    key: entry.key,
  };
  if (expansion.depthExceeded || expansion.circularNames.length > 0) {
    const findings: Finding[] = [];
    if (expansion.depthExceeded) {
      findings.push({
        severity: 'error',
        code: 'circular-ref',
        message: 'Variable expansion exceeded the maximum depth',
        ...base,
      });
    }
    for (const name of expansion.circularNames) {
      findings.push({
        severity: 'error',
        code: 'circular-ref',
        message: `Circular reference while expanding ${name}`,
        ...base,
      });
    }
    return { findings, expanded: null };
  }
  if (expansion.undefinedNames.length > 0) {
    return {
      findings: expansion.undefinedNames.map((name) => ({
        severity: 'error' as const,
        code: 'undefined-var' as const,
        message: `References undefined variable ${name}`,
        ...base,
      })),
      expanded: null,
    };
  }
  return { findings: [], expanded: expansion.value };
}

function compareFindings(a: Finding, b: Finding): number {
  const aMissing = a.code === 'missing' ? 1 : 0;
  const bMissing = b.code === 'missing' ? 1 : 0;
  if (aMissing !== bMissing) return aMissing - bMissing;
  const aLine = a.line ?? Number.MAX_SAFE_INTEGER;
  const bLine = b.line ?? Number.MAX_SAFE_INTEGER;
  if (aLine !== bLine) return aLine - bLine;
  return a.code.localeCompare(b.code);
}

function resolvePath(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
}
