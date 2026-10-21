import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config.js';
import { discoverEnvPairs } from '../src/discover.js';

const SECRET = 'sk_live_EXAMPLE_SECRET_VALUE';

function writePair(dir: string, envName: string, exampleName: string, envText: string, exampleText: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, envName), envText);
  writeFileSync(join(dir, exampleName), exampleText);
}

describe('discoverEnvPairs', () => {
  it('finds sibling pairs and nested pairs, and skips dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'env-sentinel-discover-'));
    writePair(join(root, 'packages', 'web'), '.env', '.env.example', `TOKEN=${SECRET}\n`, 'TOKEN=\n');
    writePair(
      join(root, 'packages', 'web', 'nested'),
      '.env',
      '.env.example',
      'PORT=3000\n',
      '# @type port\nPORT=3000\n',
    );
    writePair(
      join(root, 'packages', 'api'),
      '.env.production',
      '.env.production.example',
      'PORT=443\n',
      'PORT=\n',
    );
    writeFileSync(join(root, 'packages', 'api', '.env.example'), 'ONLY_EXAMPLE=\n');
    writePair(join(root, 'packages', 'node_modules', 'left'), '.env', '.env.example', 'A=1\n', 'A=\n');
    mkdirSync(join(root, 'packages', 'linked'), { recursive: true });
    symlinkSync(join(root, 'packages', 'web'), join(root, 'packages', 'linked', 'web'), 'dir');

    const shallow = discoverEnvPairs(root, ['packages/*']);
    assert.equal(shallow.ok, true);
    if (!shallow.ok) return;
    assert.deepEqual(
      shallow.pairs.map((pair) => pair.envPath),
      ['packages/api/.env.production', 'packages/web/.env'],
    );
    assert.equal(shallow.pairs[1]?.examplePath, 'packages/web/.env.example');
    assert.equal(JSON.stringify(shallow).includes(SECRET), false);

    const deep = discoverEnvPairs(root, ['packages/**']);
    assert.equal(deep.ok, true);
    if (!deep.ok) return;
    assert.deepEqual(
      deep.pairs.map((pair) => pair.envPath),
      ['packages/api/.env.production', 'packages/web/.env', 'packages/web/nested/.env'],
    );

    const unsafe = discoverEnvPairs(root, ['../outside']);
    assert.equal(unsafe.ok, false);
  });

  it('reads discover globs from the config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-discover-cfg-'));
    const path = join(dir, 'env-sentinel.config.json');
    writeFileSync(path, '{"discover":["packages/*","apps/**"]}\n');
    const loaded = loadConfig(path);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    assert.deepEqual(loaded.config.discover, ['packages/*', 'apps/**']);
  });
});
