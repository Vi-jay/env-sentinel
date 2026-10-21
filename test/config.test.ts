import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { checkContents } from '../src/check.js';
import { ignoreMatch, loadConfig, loadPackageConfig } from '../src/config.js';
import { loadSchemaFromContents } from '../src/schema.js';

describe('ignore patterns', () => {
  it('matches exact names, stars, and question marks', () => {
    assert.equal(ignoreMatch('DEBUG', ['DEBUG']), true);
    assert.equal(ignoreMatch('DATABASE_URL', ['*_URL']), true);
    assert.equal(ignoreMatch('APP_URL', ['*_URL']), true);
    assert.equal(ignoreMatch('DEBUG', ['*_URL']), false);
    assert.equal(ignoreMatch('ABC', ['A?C']), true);
    assert.equal(ignoreMatch('AC', ['A?C']), false);
  });

  it('hides extra keys and still reports a required key that matches', () => {
    const schema = loadSchemaFromContents('# @type url\nAPP_URL=https://example.com\n', '.env.example', 'dotenv');
    const report = checkContents({
      schema,
      ignore: ['APP_URL', 'DEBUG', '*_TOKEN'],
      env: { path: '.env', contents: 'DEBUG=1\nAPI_TOKEN=local\nFEATURE=1\n' },
    });
    const codes = report.findings.map((finding) => `${finding.code}:${finding.key ?? ''}`);
    assert.deepEqual(codes.sort(), ['extra:FEATURE', 'missing:APP_URL']);
  });
});

describe('package.json config', () => {
  it('reads the env-sentinel key and rejects unknown fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-pkg-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'demo', 'env-sentinel': { strict: true, ignore: ['DEBUG'] } }),
    );
    const loaded = loadPackageConfig(dir);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.equal(loaded.config?.strict, true);
    assert.deepEqual(loaded.config?.ignore, ['DEBUG']);

    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n');
    const absent = loadPackageConfig(dir);
    assert.equal(absent.ok, true);
    if (!absent.ok) return;
    assert.equal(absent.config, null);

    writeFileSync(join(dir, 'package.json'), '{"env-sentinel":{"envs":[".env"]}}\n');
    const bad = loadPackageConfig(dir);
    assert.equal(bad.ok, false);

    const configPath = join(dir, 'env-sentinel.config.json');
    writeFileSync(configPath, '{"ignore":["*_URL"]}\n');
    const file = loadConfig(configPath);
    assert.equal(file.ok, true);
    if (!file.ok) return;
    assert.deepEqual(file.config.ignore, ['*_URL']);

    writeFileSync(configPath, '{"ignore":[""]}\n');
    assert.equal(loadConfig(configPath).ok, false);
  });
});
