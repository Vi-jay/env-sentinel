#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { HELP, parseArgs, type Args } from './args.js';
import { check, combineReports } from './check.js';
import { discoverEnvPairs } from './discover.js';
import { loadConfig } from './config.js';
import { formatReport } from './format.js';
import { sync } from './sync.js';
import type { CheckReport, FileConfig, SyncResult } from './types.js';

const IO_CODES = new Set(['file-not-found', 'unreadable']);

export function main(argv: string[], cwd = process.cwd()): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(`env-sentinel: ${parsed.message}\n`);
    process.stderr.write('Run env-sentinel --help for usage.\n');
    return 2;
  }
  const args = parsed.args;
  if (args.version && !args.help) {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const configured = resolveSettings(args, cwd);
  if (!configured.ok) {
    process.stderr.write(`env-sentinel: ${configured.message}\n`);
    return 2;
  }
  const settings = configured.settings;

  if (args.command === 'check') {
    const reports: CheckReport[] = [];
    if (args.envSet || settings.discover.length === 0) {
      reports.push(
        check({
          cwd,
          envPaths: settings.envPaths,
          ...(settings.examplePath ? { examplePath: settings.examplePath } : {}),
          ...(settings.schemaPath ? { schemaPath: settings.schemaPath } : {}),
          strict: settings.strict,
        }),
      );
    }
    if (settings.discover.length > 0) {
      const found = discoverEnvPairs(cwd, settings.discover);
      if (!found.ok) {
        process.stderr.write(`env-sentinel: ${found.message}\n`);
        return 2;
      }
      if (found.pairs.length === 0) {
        process.stderr.write('env-sentinel: no .env and .env.example pairs matched\n');
        return 2;
      }
      for (const pair of found.pairs) {
        reports.push(
          check({
            cwd,
            envPaths: [pair.envPath],
            examplePath: pair.examplePath,
            strict: settings.strict,
          }),
        );
      }
    }
    const report = reports.length === 1 ? reports[0] : combineReports(reports, settings.strict);
    if (!report) return 2;
    const color = settings.format === 'json' ? false : useColor(args.color);
    const text = formatReport(report, { format: settings.format, color, version: readVersion() });
    if (!(args.quiet && settings.format === 'human' && report.ok)) process.stdout.write(text);
    return reportExit(report);
  }

  if (args.command !== 'sync' && args.command !== 'init') {
    process.stderr.write(`env-sentinel: unknown command "${args.command}"\n`);
    return 2;
  }
  const result = sync({
    cwd,
    envPaths: settings.envPaths,
    examplePath: settings.examplePath ?? '.env.example',
    prune: args.prune,
    dryRun: args.dryRun,
    command: args.command,
  });
  return reportSync(result, args.dryRun);
}

interface Settings {
  envPaths: string[];
  examplePath?: string;
  schemaPath?: string;
  strict: boolean;
  format: 'human' | 'json';
  discover: string[];
}

function resolveSettings(args: Args, cwd: string): { ok: true; settings: Settings } | { ok: false; message: string } {
  const configPath = args.config
    ? isAbsolute(args.config)
      ? args.config
      : resolve(cwd, args.config)
    : join(cwd, 'env-sentinel.config.json');

  let config: FileConfig = {};
  let configDir = cwd;
  const configRequested = args.config !== undefined;
  if (!args.noConfig && (configRequested || existsSync(configPath))) {
    if (!existsSync(configPath)) return { ok: false, message: `File not found: ${configPath}` };
    const loaded = loadConfig(configPath);
    if (!loaded.ok) return loaded;
    config = loaded.config;
    configDir = dirname(configPath);
  }

  const envSource = args.envSet ? args.env : (config.env ?? ['.env']);
  const envBase = args.envSet ? cwd : config.env ? configDir : cwd;
  const envPaths = envSource.map((file) => locate(file, envBase, cwd));

  const exampleSet = args.exampleSet || config.example !== undefined;
  const schemaSet = args.schemaSet || config.schema !== undefined;
  let examplePath: string | undefined;
  let schemaPath: string | undefined;
  if (args.exampleSet && args.example) examplePath = locate(args.example, cwd, cwd);
  else if (config.example) examplePath = locate(config.example, configDir, cwd);
  if (args.schemaSet && args.schema) schemaPath = locate(args.schema, cwd, cwd);
  else if (config.schema) schemaPath = locate(config.schema, configDir, cwd);

  if (args.command === 'check' && !exampleSet && !schemaSet) examplePath = '.env.example';
  if (args.command !== 'check' && !examplePath) examplePath = '.env.example';

  const settings: Settings = {
    envPaths,
    strict: args.strictSet ? args.strict : (config.strict ?? false),
    format: args.format ?? config.format ?? 'human',
    discover: args.discoverSet ? args.discover : (config.discover ?? []),
  };
  if (examplePath) settings.examplePath = examplePath;
  if (schemaPath) settings.schemaPath = schemaPath;
  return { ok: true, settings };
}

function locate(file: string, base: string, cwd: string): string {
  if (isAbsolute(file)) return file;
  if (base === cwd) return file;
  return resolve(base, file);
}

function reportExit(report: CheckReport): number {
  for (const file of report.files) {
    for (const finding of file.findings) {
      if (IO_CODES.has(finding.code)) return 2;
    }
  }
  return report.ok ? 0 : 1;
}

function reportSync(result: SyncResult, dryRun: boolean): number {
  for (const message of result.messages) {
    process.stderr.write(`env-sentinel: ${message.message}\n`);
  }
  if (result.refused || result.messages.some((message) => message.severity === 'error')) return 2;
  if (dryRun) {
    process.stderr.write(
      result.changed
        ? `env-sentinel: dry run, ${result.path} was not written\n`
        : `env-sentinel: dry run, ${result.path} is already up to date\n`,
    );
    process.stdout.write(result.contents);
    return 0;
  }
  if (result.wrote && result.created) {
    process.stdout.write(`Created ${result.path} (${String(result.added.length)} keys, values omitted)\n`);
    return 0;
  }
  if (result.wrote) {
    const parts = [`Updated ${result.path}`];
    if (result.added.length > 0) parts.push(`+${formatKeys(result.added)}`);
    if (result.removed.length > 0) parts.push(`-${formatKeys(result.removed)}`);
    process.stdout.write(`${parts.join(' ')}\n`);
    return 0;
  }
  process.stdout.write(`${result.path} is already up to date\n`);
  return 0;
}

function formatKeys(keys: string[]): string {
  if (keys.length <= 8) return keys.join(', ');
  return `${String(keys.length)} keys`;
}

function useColor(flag: boolean | undefined): boolean {
  if (flag !== undefined) return flag;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  return Boolean(process.stdout.isTTY);
}

export function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: string };
    if (typeof pkg.version === 'string') return pkg.version;
  }
  return '0.0.0';
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  process.exitCode = main(process.argv.slice(2));
}
