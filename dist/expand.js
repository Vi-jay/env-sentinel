/**
 * Expand `$NAME`, `${NAME}`, `${NAME:-default}`, and `${NAME-default}`
 * inside one env file.
 *
 * `:-` substitutes the default when the name is unset or empty.
 * `-` substitutes the default only when the name is unset.
 * A cycle, an undefined name, or a chain deeper than {@link MAX_EXPAND_DEPTH}
 * fails closed: `value` is empty so a caller cannot print a partial secret.
 * An unclosed `${` is left as literal text.
 */
export const MAX_EXPAND_DEPTH = 32;
export function expandValue(template, lookup) {
    return expand(template, lookup, { valueStack: [], depth: 0 });
}
function expand(template, lookup, frame) {
    if (frame.depth > MAX_EXPAND_DEPTH) {
        return {
            ok: false,
            value: '',
            hasReference: false,
            undefinedNames: [],
            circularNames: [],
            depthExceeded: true,
        };
    }
    let value = '';
    let ok = true;
    let hasReference = false;
    let depthExceeded = false;
    const undefinedNames = [];
    const circularNames = [];
    for (let index = 0; index < template.length;) {
        if (template.charAt(index) !== '$') {
            value += template.charAt(index);
            index += 1;
            continue;
        }
        const reference = readReference(template, index);
        if (!reference) {
            value += '$';
            index += 1;
            continue;
        }
        hasReference = true;
        index = reference.end;
        const resolved = resolveReference(reference, lookup, frame);
        if (resolved.hasReference)
            hasReference = true;
        if (resolved.depthExceeded)
            depthExceeded = true;
        undefinedNames.push(...resolved.undefinedNames);
        circularNames.push(...resolved.circularNames);
        if (!resolved.ok) {
            ok = false;
            continue;
        }
        value += resolved.value;
    }
    if (!ok || depthExceeded) {
        return {
            ok: false,
            value: '',
            hasReference,
            undefinedNames: unique(undefinedNames),
            circularNames: unique(circularNames),
            depthExceeded,
        };
    }
    return {
        ok: true,
        value,
        hasReference,
        undefinedNames: [],
        circularNames: [],
        depthExceeded: false,
    };
}
function resolveReference(reference, lookup, frame) {
    if (frame.valueStack.includes(reference.name)) {
        return {
            ok: false,
            value: '',
            hasReference: true,
            undefinedNames: [],
            circularNames: [reference.name],
            depthExceeded: false,
        };
    }
    const raw = lookup(reference.name);
    const next = {
        valueStack: frame.valueStack,
        depth: frame.depth + 1,
    };
    if (raw === undefined) {
        if (reference.defaultValue === null) {
            return {
                ok: false,
                value: '',
                hasReference: true,
                undefinedNames: [reference.name],
                circularNames: [],
                depthExceeded: false,
            };
        }
        return expand(reference.defaultValue, lookup, next);
    }
    if (raw.length === 0 && reference.defaultOnEmpty && reference.defaultValue !== null) {
        return expand(reference.defaultValue, lookup, next);
    }
    return expand(raw, lookup, {
        valueStack: [...frame.valueStack, reference.name],
        depth: frame.depth + 1,
    });
}
function readReference(input, index) {
    if (input.charAt(index) !== '$')
        return null;
    let cursor = index + 1;
    const braced = input.charAt(cursor) === '{';
    if (braced)
        cursor += 1;
    const name = readName(input, cursor);
    if (!name)
        return null;
    cursor += name.length;
    if (!braced) {
        return { name, end: cursor, defaultValue: null, defaultOnEmpty: false };
    }
    if (input.charAt(cursor) === '}') {
        return { name, end: cursor + 1, defaultValue: null, defaultOnEmpty: false };
    }
    let defaultOnEmpty = false;
    if (input.startsWith(':-', cursor)) {
        defaultOnEmpty = true;
        cursor += 2;
    }
    else if (input.charAt(cursor) === '-') {
        cursor += 1;
    }
    else {
        return null;
    }
    const closed = readDefault(input, cursor);
    if (!closed)
        return null;
    return { name, end: closed.end, defaultValue: closed.value, defaultOnEmpty };
}
function readName(input, index) {
    const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(index));
    return match?.[0] ?? null;
}
/** Read a `${...}` default, honoring nested `${...}` so the matching `}` closes it. */
function readDefault(input, index) {
    let depth = 1;
    let cursor = index;
    while (cursor < input.length) {
        if (input.charAt(cursor) === '$' && input.charAt(cursor + 1) === '{') {
            depth += 1;
            cursor += 2;
            continue;
        }
        if (input.charAt(cursor) === '}') {
            depth -= 1;
            if (depth === 0) {
                return { value: input.slice(index, cursor), end: cursor + 1 };
            }
        }
        cursor += 1;
    }
    return null;
}
function unique(names) {
    const seen = new Set();
    const result = [];
    for (const name of names) {
        if (seen.has(name))
            continue;
        seen.add(name);
        result.push(name);
    }
    return result;
}
//# sourceMappingURL=expand.js.map