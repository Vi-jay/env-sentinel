import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkContents } from '../src/check.js';
import { loadSchemaFromContents, mergeSchemas } from '../src/schema.js';

const SECRET = 'sk_live_EXAMPLE_SECRET_VALUE';

function schemaOf(example: string) {
  return loadSchemaFromContents(example, '.env.example', 'dotenv');
}

describe('checkContents', () => {
  const schema = schemaOf(`# @type url
APP_URL=https://example.com
# @type port
PORT=3000
# @type enum(development,test,production)
NODE_ENV=development
# @optional @type email
ALERT_EMAIL=
# @type int
WORKERS=2
# @optional
HOST=
`);

  it('reports missing, empty, type, duplicate, malformed, and extra keys without the secret', () => {
    const env = `APP_URL=not a url
PORT=
NODE_ENV=prod
EXTRA_TOKEN=${SECRET}
WORKERS=2
WORKERS=3
THIS IS BAD ${SECRET}
`;
    const report = checkContents({ schema, env: { path: '.env', contents: env } });
    const codes = report.findings.map((finding) => finding.code);
    assert.deepEqual(codes.sort(), [
      'duplicate',
      'empty',
      'extra',
      'malformed',
      'type-mismatch',
      'type-mismatch',
    ]);
    assert.equal(report.ok, false);
    const extra = report.findings.find((finding) => finding.code === 'extra');
    assert.equal(extra?.severity, 'warning');
    assert.equal(extra?.key, 'EXTRA_TOKEN');
    const blob = JSON.stringify(report);
    assert.equal(blob.includes(SECRET), false);
    assert.equal(report.findings.find((finding) => finding.key === 'PORT')?.maskedValue, '(empty)');
    assert.equal(report.findings.find((finding) => finding.key === 'APP_URL')?.maskedValue, '****');
  });

  it('promotes extras to errors when strict', () => {
    const report = checkContents({
      schema,
      strict: true,
      env: { path: '.env', contents: 'APP_URL=https://example.com\nPORT=3000\nNODE_ENV=development\nWORKERS=2\nDEBUG=1\n' },
    });
    const extra = report.findings.find((finding) => finding.code === 'extra');
    assert.equal(extra?.severity, 'error');
    assert.equal(report.ok, false);
  });

  it('accepts a complete file and type-checks expanded values', () => {
    const report = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'HOST=https://example.com\nAPP_URL=${HOST}/app\nPORT=3000\nNODE_ENV=development\nWORKERS=4\n',
      },
    });
    assert.equal(report.ok, true);
    assert.equal(report.findings.length, 0);
  });

  it('flags an undefined reference and does not type-check the template', () => {
    const report = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=${HOST}/app\nPORT=3000\nNODE_ENV=development\nWORKERS=4\n',
      },
    });
    assert.equal(report.ok, false);
    const finding = report.findings.find((item) => item.code === 'undefined-var');
    assert.equal(finding?.key, 'APP_URL');
    assert.equal(finding?.message, 'References undefined variable HOST');
    assert.equal(report.findings.some((item) => item.code === 'type-mismatch'), false);
  });

  it('uses a default when the referenced name is missing and masks a bad expansion', () => {
    const fallback = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=${HOST:-https://example.com}/app\nPORT=${PORT_FILE:-3000}\nNODE_ENV=development\nWORKERS=4\n',
      },
    });
    assert.equal(fallback.ok, true);

    const report = checkContents({
      schema,
      env: {
        path: '.env',
        contents: `HOST=${SECRET}\nAPP_URL=\${HOST}/app\nPORT=3000\nNODE_ENV=development\nWORKERS=4\n`,
      },
    });
    assert.equal(report.ok, false);
    const mismatch = report.findings.find((item) => item.code === 'type-mismatch');
    assert.equal(mismatch?.key, 'APP_URL');
    assert.equal(mismatch?.maskedValue, '****');
    assert.equal(JSON.stringify(report).includes(SECRET), false);
  });

  it('flags a cycle and an undefined reference on an undocumented key', () => {
    const cycle = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=${ALT}\nALT=${APP_URL}\nPORT=3000\nNODE_ENV=development\nWORKERS=4\n',
      },
    });
    assert.equal(cycle.findings.some((item) => item.code === 'circular-ref' && item.key === 'APP_URL'), true);

    const extra = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=https://example.com\nPORT=3000\nNODE_ENV=development\nWORKERS=4\nDEBUG=${MISSING}\n',
      },
    });
    assert.equal(extra.findings.some((item) => item.code === 'extra' && item.key === 'DEBUG'), true);
    assert.equal(extra.findings.some((item) => item.code === 'undefined-var' && item.key === 'DEBUG'), true);
  });

  it('allows a missing optional key and an empty optional value', () => {
    const report = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=https://example.com\nPORT=80\nNODE_ENV=test\nWORKERS=1\nALERT_EMAIL=\n',
      },
    });
    assert.equal(report.ok, true);
  });

  it('flags an optional key when its value has the wrong type', () => {
    const report = checkContents({
      schema,
      env: {
        path: '.env',
        contents: 'APP_URL=https://example.com\nPORT=80\nNODE_ENV=test\nWORKERS=1\nALERT_EMAIL=nope\n',
      },
    });
    assert.equal(report.findings.some((finding) => finding.key === 'ALERT_EMAIL' && finding.code === 'type-mismatch'), true);
  });
});

describe('schema merge', () => {
  it('lets a JSON schema override annotations and add keys', () => {
    const example = loadSchemaFromContents('# @type int\nPORT=3000\n', '.env.example', 'dotenv');
    const json = loadSchemaFromContents(
      JSON.stringify({
        variables: {
          PORT: { type: 'port', required: true },
          LOG_LEVEL: { type: 'enum', values: ['debug', 'info'], optional: true, description: 'Verbosity' },
        },
      }),
      'env.schema.json',
      'json',
    );
    const merged = mergeSchemas(example, json);
    const port = merged.variables.find((variable) => variable.name === 'PORT');
    const level = merged.variables.find((variable) => variable.name === 'LOG_LEVEL');
    assert.equal(port?.type?.name, 'port');
    assert.equal(level?.required, false);
    assert.deepEqual(level?.type?.values, ['debug', 'info']);
    assert.equal(level?.description, 'Verbosity');
  });

  it('reports invalid JSON', () => {
    const schema = loadSchemaFromContents('{', 'env.schema.json', 'json');
    assert.equal(schema.findings[0]?.code, 'schema-invalid');
    assert.equal(schema.variables.length, 0);
  });
});
