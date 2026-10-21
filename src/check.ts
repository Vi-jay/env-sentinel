import { isAbsolute, resolve } from 'node:path';

import { maskSecret, valueLength } from './mask.js';
import { parseEnv } from './parse.js';
import { loadSchemaFromContents, mergeSchemas } from './schema.js';
import type {
  CheckContentsInput,
  CheckOptions,
  CheckReport,
  FileReport,
  Finding,
  Schema,
} from './types.js';
import { containsInterpolation, typeProblem } from './validate.js';
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
    if (!variable.type || containsInterpolation(entry.value)) continue;
    const problem = typeProblem(variable.type, entry.value);
    if (!problem) continue;
    findings.push({
      severity: 'error',
      code: 'type-mismatch',
      message: `${problem}. Value masked`,
      file: input.env.path,
      line: entry.line,
      endLine: entry.endLine,
      key: variable.name,
      maskedValue: maskSecret(entry.value),
      valueLength: valueLength(entry.value),
    });
  }

  for (const entry of parsed.entries) {
    if (schemaNames.has(entry.key)) continue;
    if (parsed.variables.get(entry.key) !== entry) continue;
    findings.push({
      severity: strict ? 'error' : 'warning',
      code: 'extra',
      message: `Not documented in ${input.schema.path}`,
      file: input.env.path,
      line: entry.line,
      key: entry.key,
    });
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
