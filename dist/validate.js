import { expandValue } from './expand.js';
const BOOLS = new Set(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off']);
/**
 * True when the value contains `$NAME`, `${NAME}`, `${NAME:-default}`, or `${NAME-default}`.
 * An unclosed `${` is not a reference.
 */
export function containsInterpolation(value) {
    return expandValue(value, () => '').hasReference;
}
/**
 * Return a problem description when `value` does not match `type`.
 * Returns null when the value is acceptable. Callers mask the value themselves.
 */
export function typeProblem(type, value) {
    switch (type.name) {
        case 'string':
            return null;
        case 'url':
            return isUrl(value) ? null : 'Expected a URL with a scheme, such as https:// or postgres://';
        case 'int':
            return isInt(value) ? null : 'Expected an integer';
        case 'bool':
            return isBool(value)
                ? null
                : 'Expected a boolean (true, false, yes, no, on, off, 1, 0)';
        case 'email':
            return isEmail(value) ? null : 'Expected an email address';
        case 'port':
            return isPort(value) ? null : 'Expected a TCP port from 1 to 65535';
        case 'enum': {
            const allowed = type.values ?? [];
            return allowed.includes(value) ? null : `Expected one of: ${allowed.join(', ')}`;
        }
        default:
            return null;
    }
}
function isUrl(value) {
    if (value.length === 0 || /\s/.test(value))
        return false;
    try {
        const url = new URL(value);
        if (url.protocol === '' || !url.protocol.endsWith(':'))
            return false;
        if (url.hostname.length > 0)
            return true;
        return url.protocol === 'mailto:' || url.protocol === 'file:';
    }
    catch {
        return false;
    }
}
function isInt(value) {
    if (!/^[+-]?(?:0|[1-9]\d*)$/.test(value))
        return false;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed);
}
function isBool(value) {
    return BOOLS.has(value.toLowerCase());
}
function isEmail(value) {
    if (value.length > 254 || /\s/.test(value))
        return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function isPort(value) {
    if (!/^[1-9]\d*$/.test(value))
        return false;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
}
//# sourceMappingURL=validate.js.map