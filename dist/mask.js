/**
 * Mask a value for display.
 * The result never contains characters from `value`. Empty values are
 * reported as `(empty)` so they are not confused with a masked secret.
 */
export function maskSecret(value) {
    if (value.length === 0)
        return '(empty)';
    return '****';
}
/** Character length after stripping CR/LF so multiline secrets are counted once. */
export function valueLength(value) {
    return value.replace(/\r\n/g, '\n').length;
}
//# sourceMappingURL=mask.js.map