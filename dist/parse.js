/**
 * Parse a dotenv document.
 *
 * Supported on purpose, and covered by tests:
 * - `KEY=value` with spaces around `=`
 * - `export KEY=value`
 * - single quotes, double quotes, and backticks
 * - multiline quoted values
 * - double-quote escapes (`\n`, `\r`, `\t`, `\\`, `\"`, `\'`, `\``, `\$`, `\uXXXX`)
 * - single-quote escapes (`\\`, `\'` only)
 * - full-line `#` comments and inline comments (a `#` ends an unquoted value when
 *   it is the first value character, or when whitespace precedes it)
 * - duplicate keys (recorded; the last assignment wins in `variables`)
 * - CRLF, lone CR, and a leading UTF-8 BOM
 *
 * Values are returned decoded. Callers that print anything must mask them.
 */
export function parseEnv(contents) {
    const entries = [];
    const variables = new Map();
    const diagnostics = [];
    const firstLine = new Map();
    let i = 0;
    let line = 1;
    if (contents.charCodeAt(0) === 0xfeff)
        i = 1;
    let pending = [];
    while (i < contents.length) {
        const lineStart = i;
        let j = i;
        while (isHorizontalSpace(contents.charAt(j)))
            j += 1;
        if (j >= contents.length)
            break;
        const breakLen = newlineLength(contents, j);
        if (breakLen > 0) {
            pending = [];
            line += 1;
            i = j + breakLen;
            continue;
        }
        if (contents.charAt(j) === '#') {
            const eol = readToEol(contents, j);
            const raw = contents.slice(lineStart, eol.eol);
            pending.push({ raw, body: commentBody(raw), start: lineStart });
            line += 1;
            i = eol.next;
            continue;
        }
        const indent = contents.slice(lineStart, j);
        const exported = matchExport(contents, j);
        let keyAt = j;
        if (exported !== null) {
            keyAt = exported;
            while (isHorizontalSpace(contents.charAt(keyAt)))
                keyAt += 1;
        }
        if (!isKeyStart(contents.charAt(keyAt))) {
            const eol = readToEol(contents, j);
            diagnostics.push({
                code: 'malformed',
                message: `Line ${String(line)}: expected KEY=VALUE`,
                line,
                endLine: line,
            });
            pending = [];
            line += 1;
            i = eol.next;
            continue;
        }
        let keyEnd = keyAt + 1;
        while (isKeyChar(contents.charAt(keyEnd)))
            keyEnd += 1;
        const key = contents.slice(keyAt, keyEnd);
        let eq = keyEnd;
        while (isHorizontalSpace(contents.charAt(eq)))
            eq += 1;
        if (contents.charAt(eq) !== '=') {
            const eol = readToEol(contents, j);
            diagnostics.push({
                code: 'malformed',
                message: `Line ${String(line)}: expected KEY=VALUE`,
                line,
                endLine: line,
                key,
            });
            pending = [];
            line += 1;
            i = eol.next;
            continue;
        }
        const assignment = readAssignment(contents, eq + 1, line);
        const comments = pending.map((item) => item.body);
        if (assignment.inlineBody !== null)
            comments.push(assignment.inlineBody);
        const blockStart = pending[0]?.start ?? lineStart;
        const entry = {
            key,
            value: assignment.value,
            rawInner: assignment.rawInner,
            quote: assignment.quote,
            exported: exported !== null,
            line,
            endLine: assignment.endLine,
            comments,
            precedingCommentLines: pending.map((item) => item.raw),
            inlineSuffix: assignment.inlineSuffix,
            indent,
            blockStart,
            blockEnd: assignment.next,
            wellFormed: assignment.closed && !assignment.trailingJunk,
        };
        if (!assignment.closed) {
            diagnostics.push({
                code: 'unclosed-quote',
                message: `Line ${String(line)}: ${key} has an unclosed ${assignment.quote} quote`,
                line,
                endLine: assignment.endLine,
                key,
            });
        }
        else if (assignment.trailingJunk) {
            diagnostics.push({
                code: 'malformed',
                message: `Line ${String(assignment.endLine)}: unexpected characters after the value of ${key}`,
                line: assignment.endLine,
                endLine: assignment.endLine,
                key,
            });
        }
        const earlier = firstLine.get(key);
        if (earlier !== undefined) {
            diagnostics.push({
                code: 'duplicate',
                message: `${key} is duplicated (first defined on line ${String(earlier)}, again on line ${String(line)}). The last value wins.`,
                line,
                endLine: assignment.endLine,
                key,
                otherLine: earlier,
            });
        }
        else {
            firstLine.set(key, line);
        }
        entries.push(entry);
        variables.set(key, entry);
        pending = [];
        line = assignment.consumedTrailingNewline ? assignment.endLine + 1 : assignment.endLine;
        i = assignment.next;
    }
    return { entries, variables, diagnostics };
}
function readAssignment(contents, valueAt, startLine) {
    let i = valueAt;
    while (isHorizontalSpace(contents.charAt(i)))
        i += 1;
    const quoteChar = contents.charAt(i);
    if (quoteChar === '"' || quoteChar === "'" || quoteChar === '`') {
        return readQuotedAssignment(contents, i, startLine, quoteChar);
    }
    return readUnquotedAssignment(contents, i, startLine);
}
function readQuotedAssignment(contents, quoteIndex, startLine, quoteChar) {
    const quote = quoteOf(quoteChar);
    const scanned = scanQuoted(contents, quoteIndex, startLine, quoteChar);
    let i = scanned.next;
    let trailingJunk = false;
    let inlineSuffix = '';
    let inlineBody = null;
    if (scanned.closed) {
        while (isHorizontalSpace(contents.charAt(i)))
            i += 1;
        if (contents.charAt(i) === '#') {
            const eol = readToEol(contents, i);
            inlineSuffix = contents.slice(i, eol.eol);
            if (isHorizontalSpace(contents.charAt(i - 1))) {
                // Keep a single separating space so `KEY=` + suffix stays valid.
                inlineSuffix = ` ${inlineSuffix.trim()}`;
            }
            inlineBody = commentBody(contents.slice(i, eol.eol));
            i = eol.eol;
        }
        else if (i < contents.length && newlineLength(contents, i) === 0) {
            trailingJunk = true;
            const eol = readToEol(contents, i);
            i = eol.eol;
        }
    }
    const breakLen = newlineLength(contents, i);
    const consumedTrailingNewline = breakLen > 0;
    const next = i + breakLen;
    return {
        value: scanned.value,
        rawInner: scanned.rawInner,
        quote,
        inlineSuffix,
        inlineBody,
        closed: scanned.closed,
        trailingJunk,
        endLine: scanned.endLine,
        next,
        eol: i,
        consumedTrailingNewline,
    };
}
function readUnquotedAssignment(contents, valueAt, startLine) {
    const eol = readToEol(contents, valueAt);
    let commentAt = -1;
    for (let k = valueAt; k < eol.eol; k += 1) {
        if (contents.charAt(k) !== '#')
            continue;
        if (k === valueAt || isHorizontalSpace(contents.charAt(k - 1))) {
            commentAt = k;
            break;
        }
    }
    const rawEnd = commentAt === -1 ? eol.eol : commentAt;
    const rawSlice = contents.slice(valueAt, rawEnd);
    const trimmed = trimHorizontal(rawSlice);
    let inlineSuffix = '';
    let inlineBody = null;
    if (commentAt !== -1) {
        inlineBody = commentBody(contents.slice(commentAt, eol.eol));
        inlineSuffix = ` ${contents.slice(commentAt, eol.eol).trim()}`;
    }
    const breakLen = newlineLength(contents, eol.eol);
    return {
        value: trimmed,
        rawInner: trimmed,
        quote: 'none',
        inlineSuffix,
        inlineBody,
        closed: true,
        trailingJunk: false,
        endLine: startLine,
        next: eol.next,
        eol: eol.eol,
        consumedTrailingNewline: breakLen > 0,
    };
}
function scanQuoted(contents, quoteIndex, startLine, quoteChar) {
    let i = quoteIndex + 1;
    let line = startLine;
    const bodyStart = i;
    while (i < contents.length) {
        const br = newlineLength(contents, i);
        if (br > 0) {
            line += 1;
            i += br;
            continue;
        }
        if (contents.charAt(i) === '\\') {
            const next = i + 1;
            const escapedBreak = newlineLength(contents, next);
            if (escapedBreak > 0) {
                line += 1;
                i = next + escapedBreak;
                continue;
            }
            if (next < contents.length)
                i = next + 1;
            else
                i = next;
            continue;
        }
        if (contents.charAt(i) === quoteChar) {
            const rawInner = contents.slice(bodyStart, i);
            const value = quoteChar === "'" ? unescapeSingle(rawInner) : unescapeDouble(rawInner);
            return { value, rawInner, closed: true, endLine: line, next: i + 1 };
        }
        i += 1;
    }
    const rawInner = contents.slice(bodyStart);
    const value = quoteChar === "'" ? unescapeSingle(rawInner) : unescapeDouble(rawInner);
    return { value, rawInner, closed: false, endLine: line, next: contents.length };
}
function unescapeDouble(input) {
    let out = '';
    for (let i = 0; i < input.length; i += 1) {
        const ch = input.charAt(i);
        if (ch !== '\\') {
            out += ch;
            continue;
        }
        const next = input.charAt(i + 1);
        if (next === '') {
            out += '\\';
            break;
        }
        i += 1;
        switch (next) {
            case 'n':
                out += '\n';
                break;
            case 'r':
                out += '\r';
                break;
            case 't':
                out += '\t';
                break;
            case '\\':
                out += '\\';
                break;
            case '"':
                out += '"';
                break;
            case "'":
                out += "'";
                break;
            case '`':
                out += '`';
                break;
            case '$':
                out += '$';
                break;
            case 'u': {
                const hex = input.slice(i + 1, i + 5);
                if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                    out += String.fromCharCode(Number.parseInt(hex, 16));
                    i += 4;
                }
                else {
                    out += '\\u';
                }
                break;
            }
            default:
                out += `\\${next}`;
                break;
        }
    }
    return out;
}
function unescapeSingle(input) {
    let out = '';
    for (let i = 0; i < input.length; i += 1) {
        const ch = input.charAt(i);
        const next = input.charAt(i + 1);
        if (ch === '\\' && (next === '\\' || next === "'")) {
            out += next;
            i += 1;
            continue;
        }
        out += ch;
    }
    return out;
}
function matchExport(contents, i) {
    if (contents.slice(i, i + 6) !== 'export')
        return null;
    if (!isHorizontalSpace(contents.charAt(i + 6)))
        return null;
    return i + 6;
}
function quoteOf(ch) {
    if (ch === "'")
        return 'single';
    if (ch === '`')
        return 'backtick';
    return 'double';
}
function commentBody(rawLine) {
    const hash = rawLine.indexOf('#');
    if (hash === -1)
        return rawLine.trim();
    return rawLine.slice(hash + 1).trim();
}
function readToEol(contents, i) {
    let j = i;
    while (j < contents.length && newlineLength(contents, j) === 0)
        j += 1;
    const br = newlineLength(contents, j);
    return { eol: j, next: j + br };
}
function newlineLength(contents, i) {
    const ch = contents.charAt(i);
    if (ch === '\n')
        return 1;
    if (ch === '\r')
        return contents.charAt(i + 1) === '\n' ? 2 : 1;
    return 0;
}
function isHorizontalSpace(ch) {
    return ch === ' ' || ch === '\t';
}
function isKeyStart(ch) {
    return /[A-Za-z_]/.test(ch);
}
function isKeyChar(ch) {
    return /[A-Za-z0-9_]/.test(ch);
}
function trimHorizontal(value) {
    let start = 0;
    let end = value.length;
    while (start < end && isHorizontalSpace(value.charAt(start)))
        start += 1;
    while (end > start && isHorizontalSpace(value.charAt(end - 1)))
        end -= 1;
    return value.slice(start, end);
}
//# sourceMappingURL=parse.js.map