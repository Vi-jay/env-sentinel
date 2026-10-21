import { readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'dist-test', 'coverage']);
const MAX_DIRECTORIES = 2000;
const MAX_DEPTH = 30;
/**
 * Find `.env` / `.env.example` pairs under directories matched by `patterns`.
 * A pair is `.env` with `.env.example`, or `.env.<name>` with `.env.<name>.example`.
 * Both files must exist. `*` matches one path segment and `**` matches any depth.
 * `node_modules`, `.git`, `dist`, `dist-test`, and `coverage` are skipped. Symlinks are not followed.
 */
export function discoverEnvPairs(cwd, patterns) {
    if (patterns.length === 0)
        return { ok: false, message: 'Provide a discover pattern' };
    const state = { count: 0 };
    const directories = new Set();
    for (const pattern of patterns) {
        const parts = patternParts(pattern);
        if (!parts)
            return { ok: false, message: `Discover pattern "${pattern}" must be a relative path using /` };
        for (const dir of expandPattern(cwd, parts, state))
            directories.add(dir);
        if (state.error)
            return { ok: false, message: state.error };
    }
    const pairs = [];
    const seen = new Set();
    for (const dir of [...directories].sort()) {
        for (const pair of pairsIn(cwd, dir, state)) {
            const key = `${pair.envPath}\0${pair.examplePath}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            pairs.push(pair);
        }
        if (state.error)
            return { ok: false, message: state.error };
    }
    pairs.sort((a, b) => a.envPath.localeCompare(b.envPath));
    return { ok: true, pairs };
}
function patternParts(pattern) {
    if (pattern.length === 0 || isAbsolute(pattern) || pattern.includes('\\') || pattern.includes('\0'))
        return null;
    const parts = pattern.split('/').filter((part) => part.length > 0);
    if (parts.length === 0)
        return null;
    if (parts.some((part) => part === '.' || part === '..'))
        return null;
    return parts;
}
function expandPattern(cwd, parts, state) {
    let current = [resolve(cwd)];
    for (const part of parts) {
        const next = [];
        for (const dir of current) {
            if (part === '**') {
                next.push(dir, ...descendants(dir, state));
                if (state.error)
                    return [];
                continue;
            }
            for (const child of childDirectories(dir, state)) {
                if (segmentMatch(part, child.name))
                    next.push(child.path);
            }
            if (state.error)
                return [];
        }
        current = [...new Set(next)];
    }
    return current;
}
function descendants(dir, state) {
    const found = [];
    const queue = [{ path: dir, depth: 0 }];
    const seen = new Set([dir]);
    while (queue.length > 0) {
        const item = queue.shift();
        if (!item || item.depth >= MAX_DEPTH)
            continue;
        const children = childDirectories(item.path, state);
        if (state.error)
            return found;
        for (const child of children) {
            if (seen.has(child.path))
                continue;
            seen.add(child.path);
            if (!countDirectory(state))
                return found;
            found.push(child.path);
            queue.push({ path: child.path, depth: item.depth + 1 });
        }
    }
    return found;
}
function childDirectories(dir, state) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'unreadable directory';
        state.error = detail;
        return [];
    }
    const children = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink())
            continue;
        if (SKIP_DIRECTORIES.has(entry.name))
            continue;
        children.push({ name: entry.name, path: join(dir, entry.name) });
    }
    return children;
}
function pairsIn(cwd, dir, state) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : 'unreadable directory';
        state.error = detail;
        return [];
    }
    const files = new Set(entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name));
    const pairs = [];
    for (const name of [...files].sort()) {
        if (!name.startsWith('.env') || name.endsWith('.example'))
            continue;
        const example = name === '.env' ? '.env.example' : `${name}.example`;
        if (!files.has(example))
            continue;
        pairs.push({
            envPath: displayPath(cwd, join(dir, name)),
            examplePath: displayPath(cwd, join(dir, example)),
        });
    }
    return pairs;
}
function countDirectory(state) {
    state.count += 1;
    if (state.count <= MAX_DIRECTORIES)
        return true;
    state.error = `Discover looked at more than ${String(MAX_DIRECTORIES)} directories`;
    return false;
}
function segmentMatch(pattern, name) {
    let expression = '^';
    for (const char of pattern) {
        if (char === '*')
            expression += '[^/]*';
        else if (char === '?')
            expression += '[^/]';
        else
            expression += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(`${expression}$`).test(name);
}
function displayPath(cwd, absolute) {
    const rel = relative(cwd, absolute);
    return rel.length === 0 ? '.' : rel;
}
//# sourceMappingURL=discover.js.map