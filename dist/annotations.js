const TYPE_NAMES = new Set(['string', 'url', 'int', 'bool', 'email', 'port', 'enum']);
/**
 * Read `@type`, `@optional`, and `@required` from comment bodies.
 * Later markers win. Surrounding prose becomes the description.
 */
export function parseAnnotations(comments) {
    const text = comments.join('\n');
    const marks = [];
    const typeRe = /@type\s+([A-Za-z][A-Za-z0-9]*)(?:\(([^)]*)\))?/gi;
    const optionalRe = /@optional\b/gi;
    const requiredRe = /@required\b/gi;
    for (const match of text.matchAll(typeRe)) {
        const rawType = match[1] ?? '';
        marks.push({
            index: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length,
            kind: 'type',
            rawType,
            enumInner: match[2],
        });
    }
    for (const match of text.matchAll(optionalRe)) {
        marks.push({
            index: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length,
            kind: 'optional',
        });
    }
    for (const match of text.matchAll(requiredRe)) {
        marks.push({
            index: match.index ?? 0,
            end: (match.index ?? 0) + match[0].length,
            kind: 'required',
        });
    }
    marks.sort((a, b) => a.index - b.index || a.end - b.end);
    let required = true;
    let requiredSpecified = false;
    let type;
    let unknownType;
    let invalidEnum = false;
    for (const mark of marks) {
        if (mark.kind === 'optional') {
            required = false;
            requiredSpecified = true;
            continue;
        }
        if (mark.kind === 'required') {
            required = true;
            requiredSpecified = true;
            continue;
        }
        const parsed = parseTypeToken(mark.rawType ?? '', mark.enumInner);
        if (parsed.unknown) {
            unknownType = parsed.unknown;
            type = undefined;
            continue;
        }
        if (parsed.invalidEnum) {
            invalidEnum = true;
            unknownType = parsed.raw;
            type = undefined;
            continue;
        }
        type = parsed.type;
        unknownType = undefined;
        invalidEnum = false;
    }
    const description = stripMarks(text, marks);
    const result = { required, requiredSpecified, invalidEnum };
    if (type)
        result.type = type;
    if (description)
        result.description = description;
    if (unknownType)
        result.unknownType = unknownType;
    return result;
}
export function parseTypeToken(rawName, enumInner, explicitValues) {
    const name = rawName.toLowerCase();
    const raw = enumInner !== undefined && !explicitValues ? `${rawName}(${enumInner})` : rawName;
    if (!TYPE_NAMES.has(name)) {
        return { unknown: rawName, raw };
    }
    if (name === 'enum') {
        const values = explicitValues ?? splitEnum(enumInner ?? '');
        if (!values || values.length === 0) {
            return { invalidEnum: true, raw: explicitValues ? 'enum' : raw };
        }
        return { type: { name: 'enum', values, raw: `enum(${values.join(',')})` }, raw };
    }
    if (explicitValues && explicitValues.length > 0) {
        return { unknown: rawName, raw };
    }
    return { type: { name: name, raw: name }, raw };
}
function splitEnum(inner) {
    if (inner.trim() === '')
        return null;
    const parts = inner.split(',').map((part) => stripQuotes(part.trim()));
    if (parts.some((part) => part.length === 0))
        return null;
    return parts;
}
function stripQuotes(value) {
    if (value.length >= 2) {
        const first = value.charAt(0);
        const last = value.charAt(value.length - 1);
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
function stripMarks(text, marks) {
    if (marks.length === 0)
        return collapse(text);
    let cursor = 0;
    let kept = '';
    for (const mark of marks) {
        kept += text.slice(cursor, mark.index);
        cursor = mark.end;
    }
    kept += text.slice(cursor);
    return collapse(kept);
}
function collapse(text) {
    return text.replace(/\s+/g, ' ').trim();
}
//# sourceMappingURL=annotations.js.map