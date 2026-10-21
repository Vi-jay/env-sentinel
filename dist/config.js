import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readText } from './fsutil.js';
const ALLOWED = new Set(['env', 'example', 'schema', 'strict', 'format', 'ignore']);
export function loadConfig(path) {
    const read = readText(path);
    if (!read.ok)
        return { ok: false, message: read.message };
    let parsed;
    try {
        parsed = JSON.parse(read.contents);
    }
    catch {
        return { ok: false, message: `${path} is not valid JSON` };
    }
    return parseConfigObject(parsed, path);
}
/**
 * Read the `env-sentinel` object from `package.json` in `cwd`.
 * Returns null when the file or the key is absent.
 */
export function loadPackageConfig(cwd) {
    const path = join(cwd, 'package.json');
    if (!existsSync(path))
        return { ok: true, config: null };
    const read = readText(path);
    if (!read.ok)
        return { ok: false, message: read.message };
    let parsed;
    try {
        parsed = JSON.parse(read.contents);
    }
    catch {
        return { ok: false, message: `${path} is not valid JSON` };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, message: `${path} must be a JSON object` };
    }
    const section = parsed['env-sentinel'];
    if (section === undefined)
        return { ok: true, config: null };
    const loaded = parseConfigObject(section, `${path} "env-sentinel"`);
    if (!loaded.ok)
        return loaded;
    return { ok: true, config: loaded.config };
}
/** True when `name` matches a pattern. `*` is any run of characters and `?` is one character. */
export function ignoreMatch(name, patterns) {
    return patterns.some((pattern) => globMatch(pattern, name));
}
function parseConfigObject(parsed, label) {
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, message: `${label} must be a JSON object` };
    }
    const record = parsed;
    const unknown = Object.keys(record).filter((key) => !ALLOWED.has(key));
    if (unknown.length > 0) {
        return { ok: false, message: `${label} has unknown fields: ${unknown.join(', ')}` };
    }
    const config = {};
    if (record.env !== undefined) {
        const env = normalizeEnv(record.env);
        if (!env)
            return { ok: false, message: `${label} "env" must be a string or an array of strings` };
        config.env = env;
    }
    if (record.example !== undefined) {
        if (typeof record.example !== 'string' || record.example.length === 0) {
            return { ok: false, message: `${label} "example" must be a non-empty string` };
        }
        config.example = record.example;
    }
    if (record.schema !== undefined) {
        if (typeof record.schema !== 'string' || record.schema.length === 0) {
            return { ok: false, message: `${label} "schema" must be a non-empty string` };
        }
        config.schema = record.schema;
    }
    if (record.strict !== undefined) {
        if (typeof record.strict !== 'boolean')
            return { ok: false, message: `${label} "strict" must be a boolean` };
        config.strict = record.strict;
    }
    if (record.format !== undefined) {
        if (record.format !== 'human' && record.format !== 'json') {
            return { ok: false, message: `${label} "format" must be "human" or "json"` };
        }
        config.format = record.format;
    }
    if (record.ignore !== undefined) {
        if (!Array.isArray(record.ignore) || record.ignore.some((item) => typeof item !== 'string' || item.length === 0)) {
            return { ok: false, message: `${label} "ignore" must be an array of non-empty strings` };
        }
        config.ignore = record.ignore;
    }
    return { ok: true, config };
}
function globMatch(pattern, name) {
    let expression = '^';
    for (const char of pattern) {
        if (char === '*')
            expression += '.*';
        else if (char === '?')
            expression += '.';
        else
            expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`${expression}$`).test(name);
}
function normalizeEnv(value) {
    if (typeof value === 'string')
        return splitList(value);
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
        return null;
    const paths = [];
    for (const item of value) {
        const split = splitList(item);
        if (!split)
            return null;
        paths.push(...split);
    }
    return paths.length > 0 ? paths : null;
}
function splitList(value) {
    const parts = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    return parts.length > 0 ? parts : null;
}
//# sourceMappingURL=config.js.map