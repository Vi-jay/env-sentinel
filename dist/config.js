import { readText } from './fsutil.js';
const ALLOWED = new Set(['env', 'example', 'schema', 'strict', 'format', 'discover']);
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
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { ok: false, message: `${path} must be a JSON object` };
    }
    const record = parsed;
    const unknown = Object.keys(record).filter((key) => !ALLOWED.has(key));
    if (unknown.length > 0) {
        return { ok: false, message: `${path} has unknown fields: ${unknown.join(', ')}` };
    }
    const config = {};
    if (record.env !== undefined) {
        const env = normalizeEnv(record.env);
        if (!env)
            return { ok: false, message: `${path} "env" must be a string or an array of strings` };
        config.env = env;
    }
    if (record.example !== undefined) {
        if (typeof record.example !== 'string' || record.example.length === 0) {
            return { ok: false, message: `${path} "example" must be a non-empty string` };
        }
        config.example = record.example;
    }
    if (record.schema !== undefined) {
        if (typeof record.schema !== 'string' || record.schema.length === 0) {
            return { ok: false, message: `${path} "schema" must be a non-empty string` };
        }
        config.schema = record.schema;
    }
    if (record.strict !== undefined) {
        if (typeof record.strict !== 'boolean')
            return { ok: false, message: `${path} "strict" must be a boolean` };
        config.strict = record.strict;
    }
    if (record.format !== undefined) {
        if (record.format !== 'human' && record.format !== 'json') {
            return { ok: false, message: `${path} "format" must be "human" or "json"` };
        }
        config.format = record.format;
    }
    if (record.discover !== undefined) {
        const discover = normalizeEnv(record.discover);
        if (!discover)
            return { ok: false, message: `${path} "discover" must be a string or an array of strings` };
        config.discover = discover;
    }
    return { ok: true, config };
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