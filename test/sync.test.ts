import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { renderExample, sync } from '../src/sync.js';

const SECRET = 'super-secret-pass';
const TOKEN = 'another-secret-value';

describe('renderExample', () => {
  it('strips assignment values and keeps comments', () => {
    const source = `# database\nDATABASE_URL=postgres://user:${SECRET}@localhost/db\n\nPORT=3000\n`;
    const rendered = renderExample(source);
    assert.equal(rendered.contents, '# database\nDATABASE_URL=\n\nPORT=\n');
    assert.equal(rendered.contents.includes(SECRET), false);
    assert.equal(rendered.contents.includes('3000'), false);
  });

  it('drops malformed lines and unclosed quotes instead of copying them', () => {
    const bad = 'secret-in-bad-line';
    const source = `GOOD=${TOKEN}\nNOT A KEY ${bad}\nCERT="line-${TOKEN}\nstill-${TOKEN}\n`;
    const rendered = renderExample(source);
    assert.equal(rendered.contents.includes(TOKEN), false);
    assert.equal(rendered.contents.includes(bad), false);
    assert.match(rendered.contents, /^GOOD=\nCERT=\n$/);
    assert.ok(rendered.messages.length >= 2);
    assert.equal(JSON.stringify(rendered.messages).includes(TOKEN), false);
  });

  it('writes a duplicate key once', () => {
    const rendered = renderExample(`A=${TOKEN}\nA=${SECRET}\n`);
    assert.equal(rendered.contents, 'A=\n');
    assert.equal(rendered.messages.some((message) => message.message.includes('duplicated')), true);
  });
});

describe('sync', () => {
  it('creates an example, then updates it without replacing placeholders', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    const envPath = join(dir, '.env');
    const examplePath = join(dir, '.env.example');
    writeFileSync(envPath, `DATABASE_URL=postgres://user:${SECRET}@localhost/db\nPORT=3000\n`);

    const created = sync({ cwd: dir, envPaths: [envPath], examplePath, command: 'init' });
    assert.equal(created.wrote, true);
    assert.equal(created.created, true);
    const first = readFileSync(examplePath, 'utf8');
    assert.equal(first.includes(SECRET), false);
    assert.equal(first.includes('3000'), false);
    assert.match(first, /DATABASE_URL=\n/);

    writeFileSync(examplePath, '# keep\nDATABASE_URL=postgres://localhost/app\nOLD=placeholder\n');
    writeFileSync(envPath, `DATABASE_URL=postgres://user:${SECRET}@localhost/db\nNEW_KEY=${TOKEN}\n`);
    const updated = sync({ cwd: dir, envPaths: ['.env'], examplePath: '.env.example', command: 'sync' });
    assert.equal(updated.wrote, true);
    assert.deepEqual(updated.added, ['NEW_KEY']);
    const next = readFileSync(examplePath, 'utf8');
    assert.match(next, /DATABASE_URL=postgres:\/\/localhost\/app\n/);
    assert.match(next, /NEW_KEY=\n/);
    assert.equal(next.includes(SECRET), false);
    assert.equal(next.includes(TOKEN), false);
    assert.match(next, /OLD=placeholder\n/);
  });

  it('prunes example keys that are gone from the env file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env'), 'KEEP=abc\n');
    writeFileSync(join(dir, '.env.example'), 'KEEP=\nGONE=\n');
    const result = sync({
      cwd: dir,
      envPaths: ['.env'],
      examplePath: '.env.example',
      command: 'sync',
      prune: true,
    });
    assert.deepEqual(result.removed, ['GONE']);
    assert.equal(readFileSync(join(dir, '.env.example'), 'utf8').includes('GONE'), false);
    assert.match(readFileSync(join(dir, '.env.example'), 'utf8'), /KEEP=\n/);
  });

  it('refuses to write when a comment repeats a value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env'), `# token ${TOKEN}\nTOKEN=${TOKEN}\n`);
    const result = sync({ cwd: dir, envPaths: ['.env'], examplePath: '.env.example', command: 'init' });
    assert.equal(result.refused, true);
    assert.equal(result.wrote, false);
    assert.equal(result.messages.some((message) => message.message.includes('TOKEN')), true);
    assert.equal(result.messages.some((message) => message.message.includes(TOKEN)), false);
  });

  it('does not overwrite an existing example on init', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env'), `TOKEN=${TOKEN}\n`);
    writeFileSync(join(dir, '.env.example'), 'TOKEN=keep-me\n');
    const result = sync({ cwd: dir, envPaths: ['.env'], examplePath: '.env.example', command: 'init' });
    assert.equal(result.wrote, false);
    assert.match(result.messages[0]?.message ?? '', /already exists/);
    assert.equal(readFileSync(join(dir, '.env.example'), 'utf8'), 'TOKEN=keep-me\n');
  });

  it('dry-run prints the example and leaves the disk alone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env'), `TOKEN=${TOKEN}\n`);
    const result = sync({
      cwd: dir,
      envPaths: ['.env'],
      examplePath: '.env.example',
      command: 'sync',
      dryRun: true,
    });
    assert.equal(result.wrote, false);
    assert.equal(result.contents.includes(TOKEN), false);
    assert.equal(result.contents.includes('TOKEN='), true);
  });
});
