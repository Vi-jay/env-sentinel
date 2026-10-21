import { parseAnnotations, parseTypeToken } from './annotations.js';
import { parseEnv } from './parse.js';
export function loadSchemaFromContents(contents, path, format) {
    return format === 'json' ? loadJsonSchema(contents, path) : loadDotenvSchema(contents, path);
}
export function mergeSchemas(base, overlay) {
    const byName = new Map();
    const order = [];
    for (const variable of base.variables) {
        byName.set(variable.name, variable);
        order.push(variable.name);
    }
    for (const variable of overlay.variables) {
        const existing = byName.get(variable.name);
        if (!existing) {
            byName.set(variable.name, variable);
            order.push(variable.name);
            continue;
        }
        const requiredSpecified = variable.requiredSpecified === true || existing.requiredSpecified === true;
        byName.set(variable.name, {
            name: variable.name,
            required: variable.requiredSpecified ? variable.required : existing.required,
            requiredSpecified,
            ...(variable.type ?? existing.type ? { type: variable.type ?? existing.type } : {}),
            ...(variable.description ?? existing.description
                ? { description: variable.description ?? existing.description }
                : {}),
            line: variable.line ?? existing.line,
            source: variable.source,
        });
    }
    const variables = [];
    for (const name of order) {
        const variable = byName.get(name);
        if (variable)
            variables.push(toPublicVariable(variable));
    }
    return {
        path: `${base.path} + ${overlay.path}`,
        variables,
        findings: [...base.findings, ...overlay.findings],
    };
}
function toPublicVariable(variable) {
    const next = {
        name: variable.name,
        required: variable.required,
        source: variable.source,
    };
    if (variable.requiredSpecified)
        next.requiredSpecified = true;
    if (variable.type)
        next.type = variable.type;
    if (variable.description)
        next.description = variable.description;
    if (variable.line !== undefined)
        next.line = variable.line;
    return next;
}
function loadDotenvSchema(contents, path) {
    const parsed = parseEnv(contents);
    const findings = parsed.diagnostics.map((diagnostic) => ({
        severity: 'error',
        code: diagnostic.code === 'duplicate' ? 'duplicate' : diagnostic.code === 'unclosed-quote' ? 'unclosed-quote' : 'malformed',
        message: diagnostic.message,
        file: path,
        line: diagnostic.line,
        endLine: diagnostic.endLine,
        ...(diagnostic.key ? { key: diagnostic.key } : {}),
    }));
    const variables = [];
    const seen = new Set();
    for (const entry of parsed.entries) {
        const annotation = parseAnnotations(entry.comments);
        if (annotation.unknownType) {
            findings.push({
                severity: 'error',
                code: annotation.invalidEnum ? 'schema-invalid' : 'unknown-type',
                message: annotation.invalidEnum
                    ? `${entry.key} has an empty @type enum(...). Name at least one allowed value.`
                    : `${entry.key} has unknown @type "${annotation.unknownType}". Expected string, url, int, bool, email, port, or enum(...).`,
                file: path,
                line: entry.line,
                key: entry.key,
            });
        }
        const variable = {
            name: entry.key,
            required: annotation.required,
            requiredSpecified: annotation.requiredSpecified,
            source: path,
            line: entry.line,
        };
        if (annotation.type)
            variable.type = annotation.type;
        if (annotation.description)
            variable.description = annotation.description;
        if (seen.has(entry.key)) {
            const index = variables.findIndex((item) => item.name === entry.key);
            if (index !== -1)
                variables[index] = toPublicVariable(variable);
            continue;
        }
        seen.add(entry.key);
        variables.push(toPublicVariable(variable));
    }
    return { path, variables, findings };
}
function loadJsonSchema(contents, path) {
    const findings = [];
    let parsed;
    try {
        parsed = JSON.parse(contents);
    }
    catch {
        return {
            path,
            variables: [],
            findings: [
                {
                    severity: 'error',
                    code: 'schema-invalid',
                    message: `${path} is not valid JSON`,
                    file: path,
                },
            ],
        };
    }
    if (!isRecord(parsed)) {
        return {
            path,
            variables: [],
            findings: [
                {
                    severity: 'error',
                    code: 'schema-invalid',
                    message: `${path} must be a JSON object with a "variables" object or array`,
                    file: path,
                },
            ],
        };
    }
    for (const key of Object.keys(parsed)) {
        if (key !== 'variables' && key !== '$schema') {
            findings.push({
                severity: 'warning',
                code: 'schema-invalid',
                message: `${path} has unknown root field "${key}"`,
                file: path,
            });
        }
    }
    if (!Object.prototype.hasOwnProperty.call(parsed, 'variables')) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${path} must contain a "variables" object or array`,
            file: path,
        });
        return { path, variables: [], findings };
    }
    const rawVariables = parsed.variables;
    const items = [];
    if (Array.isArray(rawVariables)) {
        rawVariables.forEach((item, index) => {
            if (!isRecord(item) || typeof item.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name)) {
                findings.push({
                    severity: 'error',
                    code: 'schema-invalid',
                    message: `${path} variables[${String(index)}] needs a name matching [A-Za-z_][A-Za-z0-9_]*`,
                    file: path,
                });
                return;
            }
            items.push({ name: item.name, body: item });
        });
    }
    else if (isRecord(rawVariables)) {
        for (const [name, body] of Object.entries(rawVariables)) {
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
                findings.push({
                    severity: 'error',
                    code: 'schema-invalid',
                    message: `${path} has invalid variable name "${name}"`,
                    file: path,
                });
                continue;
            }
            if (!isRecord(body)) {
                findings.push({
                    severity: 'error',
                    code: 'schema-invalid',
                    message: `${path} variable ${name} must be an object`,
                    file: path,
                    key: name,
                });
                continue;
            }
            items.push({ name, body });
        }
    }
    else {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${path} "variables" must be an object or an array`,
            file: path,
        });
        return { path, variables: [], findings };
    }
    const variables = [];
    const seen = new Set();
    for (const item of items) {
        const built = variableFromJson(item.name, item.body, path, findings);
        if (seen.has(item.name)) {
            findings.push({
                severity: 'error',
                code: 'duplicate',
                message: `${item.name} is declared more than once in ${path}. The last declaration wins.`,
                file: path,
                key: item.name,
            });
            const index = variables.findIndex((variable) => variable.name === item.name);
            if (index !== -1)
                variables[index] = built;
            continue;
        }
        seen.add(item.name);
        variables.push(built);
    }
    return { path, variables, findings };
}
function variableFromJson(name, body, path, findings) {
    for (const key of Object.keys(body)) {
        if (!['name', 'type', 'required', 'optional', 'description', 'values'].includes(key)) {
            findings.push({
                severity: 'warning',
                code: 'schema-invalid',
                message: `${name} has unknown field "${key}" in ${path}`,
                file: path,
                key: name,
            });
        }
    }
    let required = true;
    let requiredSpecified = false;
    if (typeof body.required === 'boolean') {
        required = body.required;
        requiredSpecified = true;
    }
    else if (body.required !== undefined) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${name} "required" must be a boolean`,
            file: path,
            key: name,
        });
    }
    if (typeof body.optional === 'boolean') {
        if (typeof body.required === 'boolean' && body.required === body.optional) {
            findings.push({
                severity: 'error',
                code: 'schema-invalid',
                message: `${name} sets conflicting required and optional values`,
                file: path,
                key: name,
            });
        }
        else if (typeof body.required !== 'boolean') {
            required = !body.optional;
            requiredSpecified = true;
        }
    }
    else if (body.optional !== undefined) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${name} "optional" must be a boolean`,
            file: path,
            key: name,
        });
    }
    let type;
    const explicitValues = readValues(name, body.values, path, findings);
    if (typeof body.type === 'string') {
        const enumMatch = /^([A-Za-z][A-Za-z0-9]*)(?:\(([^)]*)\))?$/.exec(body.type);
        if (!enumMatch) {
            findings.push({
                severity: 'error',
                code: 'unknown-type',
                message: `${name} has unknown type "${body.type}"`,
                file: path,
                key: name,
            });
        }
        else {
            const typeName = (enumMatch[1] ?? '').toLowerCase();
            if (explicitValues && typeName !== 'enum') {
                findings.push({
                    severity: 'warning',
                    code: 'schema-invalid',
                    message: `${name} "values" is only used with type enum`,
                    file: path,
                    key: name,
                });
            }
            const parsed = parseTypeToken(enumMatch[1] ?? '', enumMatch[2], typeName === 'enum' ? explicitValues : undefined);
            if (parsed.unknown || parsed.invalidEnum || !parsed.type) {
                findings.push({
                    severity: 'error',
                    code: parsed.invalidEnum ? 'schema-invalid' : 'unknown-type',
                    message: parsed.invalidEnum
                        ? `${name} enum needs a non-empty values array or enum(a,b) type`
                        : `${name} has unknown type "${body.type}". Expected string, url, int, bool, email, port, or enum.`,
                    file: path,
                    key: name,
                });
            }
            else {
                type = parsed.type;
            }
        }
    }
    else if (body.type !== undefined) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${name} "type" must be a string`,
            file: path,
            key: name,
        });
    }
    else if (explicitValues) {
        const parsed = parseTypeToken('enum', undefined, explicitValues);
        if (parsed.type)
            type = parsed.type;
    }
    let description;
    if (typeof body.description === 'string') {
        const trimmed = body.description.trim();
        if (trimmed)
            description = trimmed;
    }
    else if (body.description !== undefined) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${name} "description" must be a string`,
            file: path,
            key: name,
        });
    }
    const variable = {
        name,
        required,
        requiredSpecified,
        source: path,
    };
    if (type)
        variable.type = type;
    if (description)
        variable.description = description;
    return toPublicVariable(variable);
}
function readValues(name, value, path, findings) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
        findings.push({
            severity: 'error',
            code: 'schema-invalid',
            message: `${name} "values" must be an array of non-empty strings`,
            file: path,
            key: name,
        });
        return undefined;
    }
    return value;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=schema.js.map