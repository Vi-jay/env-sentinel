import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { check } from '../src/check.js';
import { loadConfig } from '../src/config.js';
import { loadSchemaFromContents } from '../src/schema.js';
import { typeProblem } from '../src/validate.js';

describe('JSON schema', () => {
  it('accepts an array of variables and enum(a,b) types', () => {
    const schema = loadSchemaFromContents(
      JSON.stringify({
        variables: [
          { name: 'PORT', type: 'port', required: true },
          { name: 'LEVEL', type: 'enum(debug,info)', optional: true },
        ],
      }),
      'env.schema.json',
      'json',
    );
    assert.equal(schema.findings.length, 0);
    assert.equal(schema.variables[1]?.required, false);
    assert.deepEqual(schema.variables[1]?.type?.values, ['debug', 'info']);
  });

  it('reports structural problems', () => {
    const missing = loadSchemaFromContents('{"title":"x"}', 'env.schema.json', 'json');
    assert.equal(missing.findings.some((finding) => finding.message.includes('variables')), true);
    assert.equal(missing.findings.some((finding) => finding.severity === 'warning'), true);

    const badName = loadSchemaFromContents('{"variables":{"1PORT":{"type":"int"}}}', 's.json', 'json');
    assert.equal(badName.findings.some((finding) => finding.message.includes('invalid variable name')), true);

    const conflict = loadSchemaFromContents(
      '{"variables":{"A":{"required":true,"optional":true}}}',
      's.json',
      'json',
    );
    assert.equal(conflict.findings.some((finding) => finding.message.includes('conflicting')), true);

    const array = loadSchemaFromContents('[]', 's.json', 'json');
    assert.equal(array.findings[0]?.code, 'schema-invalid');
  });

  it('flags an unknown annotation type on the example', () => {
    const schema = loadSchemaFromContents('# @type urll\nPORT=1\n', '.env.example', 'dotenv');
    assert.equal(schema.findings[0]?.code, 'unknown-type');
    assert.equal(schema.variables[0]?.name, 'PORT');
    assert.equal(schema.variables[0]?.type, undefined);
  });
});

describe('check files', () => {
  it('reads env and example files from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-check-'));
    writeFileSync(join(dir, '.env.example'), '# @type port\nPORT=3000\n');
    writeFileSync(join(dir, '.env'), 'PORT=80\nEXTRA=1\n');
    const report = check({ cwd: dir, envPaths: ['.env'], examplePath: '.env.example' });
    assert.equal(report.ok, true);
    assert.equal(report.summary.warnings, 1);
    assert.equal(report.files.some((file) => file.path === '.env'), true);
  });

  it('stops when the example file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-check-'));
    writeFileSync(join(dir, '.env'), 'PORT=1\n');
    const report = check({ cwd: dir, envPaths: ['.env'], examplePath: '.env.example' });
    assert.equal(report.ok, false);
    assert.equal(report.files[0]?.findings[0]?.code, 'file-not-found');
    assert.equal(report.files.some((file) => file.role === 'env'), false);
  });
});

describe('loadConfig', () => {
  it('reads a config file and rejects unknown fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-cfg-'));
    const path = join(dir, 'env-sentinel.config.json');
    writeFileSync(path, '{"env":".env,.env.local","strict":true,"format":"json"}\n');
    const loaded = loadConfig(path);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.deepEqual(loaded.config.env, ['.env', '.env.local']);
    assert.equal(loaded.config.strict, true);

    writeFileSync(path, '{"envs":[".env"]}\n');
    const bad = loadConfig(path);
    assert.equal(bad.ok, false);
  });
});

describe('url schemes', () => {
  it('accepts mailto and file URLs', () => {
    const url = { name: 'url' as const, raw: 'url' };
    assert.equal(typeProblem(url, 'mailto:dev@example.com'), null);
    assert.equal(typeProblem(url, 'file:///tmp/app'), null);
  });
});
