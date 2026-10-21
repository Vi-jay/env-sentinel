import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
export function readText(path) {
    try {
        const stat = statSync(path);
        if (!stat.isFile()) {
            return { ok: false, code: 'unreadable', message: `Not a file: ${path}` };
        }
        return { ok: true, contents: readFileSync(path, 'utf8') };
    }
    catch (error) {
        const code = errorCode(error);
        if (code === 'ENOENT') {
            return { ok: false, code: 'file-not-found', message: `File not found: ${path}` };
        }
        return { ok: false, code: 'unreadable', message: `Cannot read ${path} (${code ?? 'error'})` };
    }
}
export function fileExists(path) {
    try {
        return statSync(path).isFile();
    }
    catch {
        return false;
    }
}
/** Write via a temp file in the same directory so a crash cannot truncate the target. */
export function writeTextAtomic(path, contents) {
    const dir = dirname(path);
    try {
        const stat = statSync(dir);
        if (!stat.isDirectory()) {
            return { ok: false, message: `Not a directory: ${dir}` };
        }
    }
    catch (error) {
        const code = errorCode(error);
        if (code === 'ENOENT')
            return { ok: false, message: `Directory does not exist: ${dir}` };
        return { ok: false, message: `Cannot write ${path} (${code ?? 'error'})` };
    }
    const tmp = join(dir, `.${basename(path)}.${String(process.pid)}.tmp`);
    try {
        writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o644 });
        renameSync(tmp, path);
        return { ok: true };
    }
    catch (error) {
        try {
            rmSync(tmp, { force: true });
        }
        catch {
            // The original write error is the one that matters.
        }
        return { ok: false, message: `Cannot write ${path} (${errorCode(error) ?? 'error'})` };
    }
}
function errorCode(error) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = error.code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}
//# sourceMappingURL=fsutil.js.map