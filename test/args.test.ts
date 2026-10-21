import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('defaults to check and collects repeated env files', () => {
    const parsed = parseArgs(['--env', '.env', '--env=.env.local', '--strict', '--format', 'json']);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.args.command, 'check');
    assert.deepEqual(parsed.args.env, ['.env', '.env.local']);
    assert.equal(parsed.args.strict, true);
    assert.equal(parsed.args.format, 'json');
  });

  it('splits comma-separated env paths', () => {
    const parsed = parseArgs(['check', '-e', '.env, .env.production']);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.args.env, ['.env', '.env.production']);
  });

  it('rejects flags on the wrong command', () => {
    const prune = parseArgs(['check', '--prune']);
    assert.equal(prune.ok, false);
    const strict = parseArgs(['sync', '--strict']);
    assert.equal(strict.ok, false);
    const unknown = parseArgs(['lint']);
    assert.equal(unknown.ok, false);
    const discover = parseArgs(['sync', '--discover', 'packages/*']);
    assert.equal(discover.ok, false);
  });

  it('accepts sync options', () => {
    const parsed = parseArgs(['sync', '--prune', '--dry-run', '--example', '.env.example']);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.args.prune, true);
    assert.equal(parsed.args.dryRun, true);
    assert.equal(parsed.args.example, '.env.example');
  });
});
