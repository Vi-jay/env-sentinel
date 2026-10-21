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
    const ignored = parseArgs(['check', '--ignore', 'DEBUG,*_TOKEN', '--ignore', 'A?C']);
    assert.equal(ignored.ok, true);
    if (!ignored.ok) return;
    assert.deepEqual(ignored.args.ignore, ['DEBUG', '*_TOKEN', 'A?C']);
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
    const fix = parseArgs(['check', '--fix']);
    assert.equal(fix.ok, false);
    const interactive = parseArgs(['init', '--interactive']);
    assert.equal(interactive.ok, false);
    const ignored = parseArgs(['sync', '--ignore', 'DEBUG']);
    assert.equal(ignored.ok, false);
  });

  it('accepts sync options', () => {
    const parsed = parseArgs(['sync', '--prune', '--dry-run', '--example', '.env.example']);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.args.prune, true);
    assert.equal(parsed.args.dryRun, true);
    assert.equal(parsed.args.example, '.env.example');
    const fixing = parseArgs(['sync', '--interactive']);
    assert.equal(fixing.ok, true);
    if (!fixing.ok) return;
    assert.equal(fixing.args.fix, true);
    assert.equal(fixing.args.interactive, true);
  });
});
