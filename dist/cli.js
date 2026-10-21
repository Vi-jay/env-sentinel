#!/usr/bin/env node
import { existsSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HELP, parseArgs } from './args.js';
import { check } from './check.js';
import { loadConfig } from './config.js';
import { formatReport } from './format.js';
import { sync } from './sync.js';
const IO_CODES = new Set(['file-not-found', 'unreadable']);
export function main(argv, cwd = process.cwd()) {
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
        const report = check({
            cwd,
            envPaths: settings.envPaths,
            ...(settings.examplePath ? { examplePath: settings.examplePath } : {}),
            ...(settings.schemaPath ? { schemaPath: settings.schemaPath } : {}),
            strict: settings.strict,
        });
        const color = settings.format === 'json' ? false : useColor(args.color);
        const text = formatReport(report, { format: settings.format, color, version: readVersion() });
        if (!(args.quiet && settings.format === 'human' && report.ok))
            process.stdout.write(text);
        return reportExit(report);
    }
    if (args.command !== 'sync' && args.command !== 'init') {
        process.stderr.write(`env-sentinel: unknown command "${args.command}"\n`);
        return 2;
    }
    if (args.interactive && !process.stdin.isTTY) {
        process.stderr.write('env-sentinel: --interactive needs a terminal\n');
        return 2;
    }
    const result = sync({
        cwd,
        envPaths: settings.envPaths,
        examplePath: settings.examplePath ?? '.env.example',
        prune: args.prune,
        dryRun: args.dryRun,
        fix: args.fix,
        ...(args.interactive ? { confirm: confirmFromTerminal } : {}),
        command: args.command,
    });
    return reportSync(result, args.dryRun);
}
function confirmFromTerminal(key) {
    process.stderr.write(`Add ${key} from the example? [y/N] `);
    let text = '';
    const buffer = Buffer.alloc(256);
    try {
        for (;;) {
            const bytes = readSync(process.stdin.fd, buffer, 0, buffer.length, null);
            if (bytes === 0)
                break;
            text += buffer.subarray(0, bytes).toString('utf8');
            if (text.includes('\n'))
                break;
        }
    }
    catch {
        return false;
    }
    const answer = text.trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
}
function resolveSettings(args, cwd) {
    const configPath = args.config
        ? isAbsolute(args.config)
            ? args.config
            : resolve(cwd, args.config)
        : join(cwd, 'env-sentinel.config.json');
    let config = {};
    let configDir = cwd;
    const configRequested = args.config !== undefined;
    if (!args.noConfig && (configRequested || existsSync(configPath))) {
        if (!existsSync(configPath))
            return { ok: false, message: `File not found: ${configPath}` };
        const loaded = loadConfig(configPath);
        if (!loaded.ok)
            return loaded;
        config = loaded.config;
        configDir = dirname(configPath);
    }
    const envSource = args.envSet ? args.env : (config.env ?? ['.env']);
    const envBase = args.envSet ? cwd : config.env ? configDir : cwd;
    const envPaths = envSource.map((file) => locate(file, envBase, cwd));
    const exampleSet = args.exampleSet || config.example !== undefined;
    const schemaSet = args.schemaSet || config.schema !== undefined;
    let examplePath;
    let schemaPath;
    if (args.exampleSet && args.example)
        examplePath = locate(args.example, cwd, cwd);
    else if (config.example)
        examplePath = locate(config.example, configDir, cwd);
    if (args.schemaSet && args.schema)
        schemaPath = locate(args.schema, cwd, cwd);
    else if (config.schema)
        schemaPath = locate(config.schema, configDir, cwd);
    if (args.command === 'check' && !exampleSet && !schemaSet)
        examplePath = '.env.example';
    if (args.command !== 'check' && !examplePath)
        examplePath = '.env.example';
    const settings = {
        envPaths,
        strict: args.strictSet ? args.strict : (config.strict ?? false),
        format: args.format ?? config.format ?? 'human',
    };
    if (examplePath)
        settings.examplePath = examplePath;
    if (schemaPath)
        settings.schemaPath = schemaPath;
    return { ok: true, settings };
}
function locate(file, base, cwd) {
    if (isAbsolute(file))
        return file;
    if (base === cwd)
        return file;
    return resolve(base, file);
}
function reportExit(report) {
    for (const file of report.files) {
        for (const finding of file.findings) {
            if (IO_CODES.has(finding.code))
                return 2;
        }
    }
    return report.ok ? 0 : 1;
}
function reportSync(result, dryRun) {
    for (const message of result.messages) {
        process.stderr.write(`env-sentinel: ${message.message}\n`);
    }
    if (result.refused || result.messages.some((message) => message.severity === 'error'))
        return 2;
    if (dryRun) {
        process.stderr.write(result.changed
            ? `env-sentinel: dry run, ${result.path} was not written\n`
            : `env-sentinel: dry run, ${result.path} is already up to date\n`);
        reportFill(result, true);
        process.stdout.write(result.contents);
        return 0;
    }
    if (result.wrote && result.created) {
        process.stdout.write(`Created ${result.path} (${String(result.added.length)} keys, values omitted)\n`);
    }
    else if (result.wrote) {
        const parts = [`Updated ${result.path}`];
        if (result.added.length > 0)
            parts.push(`+${formatKeys(result.added)}`);
        if (result.removed.length > 0)
            parts.push(`-${formatKeys(result.removed)}`);
        process.stdout.write(`${parts.join(' ')}\n`);
    }
    else {
        process.stdout.write(`${result.path} is already up to date\n`);
    }
    reportFill(result, false);
    return 0;
}
function reportFill(result, dryRun) {
    const fill = result.envFill;
    if (!fill || (fill.added.length === 0 && fill.declined.length === 0))
        return;
    const sink = dryRun ? process.stderr : process.stdout;
    const prefix = dryRun ? 'env-sentinel: ' : '';
    if (fill.added.length > 0) {
        const verb = dryRun || !fill.wrote ? 'Would add to' : 'Added to';
        sink.write(`${prefix}${verb} ${fill.path}: ${formatKeys(fill.added)}\n`);
    }
    if (fill.declined.length > 0) {
        sink.write(`${prefix}${dryRun ? 'Would skip' : 'Skipped'} ${formatKeys(fill.declined)}\n`);
    }
}
function formatKeys(keys) {
    if (keys.length <= 8)
        return keys.join(', ');
    return `${String(keys.length)} keys`;
}
function useColor(flag) {
    if (flag !== undefined)
        return flag;
    if (process.env.NO_COLOR !== undefined)
        return false;
    if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0')
        return true;
    return Boolean(process.stdout.isTTY);
}
export function readVersion() {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')];
    for (const candidate of candidates) {
        if (!existsSync(candidate))
            continue;
        const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
        if (typeof pkg.version === 'string')
            return pkg.version;
    }
    return '0.0.0';
}
function isDirectRun() {
    const entry = process.argv[1];
    if (!entry)
        return false;
    try {
        return import.meta.url === pathToFileURL(realpathSync(entry)).href;
    }
    catch {
        return false;
    }
}
if (isDirectRun()) {
    process.exitCode = main(process.argv.slice(2));
}
//# sourceMappingURL=cli.js.map