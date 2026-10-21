import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cli = join(root, 'dist', 'cli.js');
const SECRET = 'sk_live_EXAMPLE_SECRET_VALUE';

function run(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('cli', () => {
  it('prints help and version', () => {
    const help = run(['--help'], root);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /env-sentinel check/);
    assert.match(help.stdout, /Values are masked/);
    const version = run(['--version'], root);
    assert.equal(version.status, 0);
    assert.equal(version.stdout.trim(), '0.2.0');
  });

  it('checks the broken example and hides secrets in human and json output', () => {
    const human = run(
      ['check', '--env', 'examples/broken/.env', '--example', 'examples/broken/.env.example', '--no-color'],
      root,
    );
    assert.equal(human.status, 1);
    assert.match(human.stdout, /missing/);
    assert.match(human.stdout, /type-mismatch/);
    assert.match(human.stdout, /extra/);
    assert.equal(human.stdout.includes(SECRET), false);
    assert.equal(human.stderr.includes(SECRET), false);

    const json = run(
      ['check', '--env', 'examples/broken/.env', '--example', 'examples/broken/.env.example', '--format', 'json'],
      root,
    );
    assert.equal(json.status, 1);
    const report = JSON.parse(json.stdout) as { ok: boolean; version: string; summary: { errors: number } };
    assert.equal(report.ok, false);
    assert.equal(report.version, '0.2.0');
    assert.ok(report.summary.errors > 0);
    assert.equal(json.stdout.includes(SECRET), false);
  });

  it('accepts the valid example and fails extras under --strict', () => {
    const ok = run(['check', '--env', 'examples/app/.env', '--example', 'examples/app/.env.example'], root);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /0 errors, 0 warnings/);

    const local = run(
      ['check', '--env', 'examples/app/.env.local', '--example', 'examples/app/.env.example'],
      root,
    );
    assert.equal(local.status, 0, local.stdout + local.stderr);
    assert.match(local.stdout, /warning/);

    const strict = run(
      ['check', '--env', 'examples/app/.env.local', '--example', 'examples/app/.env.example', '--strict'],
      root,
    );
    assert.equal(strict.status, 1);

    const both = run(
      [
        'check',
        '--env',
        'examples/app/.env',
        '--env',
        'examples/app/.env.local',
        '--example',
        'examples/app/.env.example',
      ],
      root,
    );
    assert.equal(both.status, 0, both.stdout + both.stderr);
    assert.match(both.stdout, /examples\/app\/\.env\.local/);
    assert.match(both.stdout, /FEATURE_FLAG/);
  });

  it('uses a JSON schema and a config file', () => {
    const schema = run(
      ['check', '--env', 'examples/schema/.env', '--schema', 'examples/schema/env.schema.json', '--no-config'],
      root,
    );
    assert.equal(schema.status, 0, schema.stdout + schema.stderr);

    const configured = run(['check', '--config', 'examples/schema/env-sentinel.config.json'], root);
    assert.equal(configured.status, 0, configured.stdout + configured.stderr);
  });

  it('sync writes an example with values removed and init will not overwrite it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-cli-'));
    writeFileSync(join(dir, '.env'), `# app\nAPP_URL=https://localhost:3000\nTOKEN=${SECRET}\nexport PORT=3000\n`);
    const created = run(['init', '--env', '.env', '--example', '.env.example'], dir);
    assert.equal(created.status, 0, created.stderr);
    const example = readFileSync(join(dir, '.env.example'), 'utf8');
    assert.equal(example.includes(SECRET), false);
    assert.equal(example.includes('3000'), false);
    assert.equal(example.includes('https://localhost:3000'), false);
    assert.match(example, /APP_URL=\n/);
    assert.match(example, /TOKEN=\n/);
    assert.match(example, /export PORT=\n/);

    const again = run(['init'], dir);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /already exists/);

    writeFileSync(join(dir, '.env'), `APP_URL=https://localhost:3000\nTOKEN=${SECRET}\nNEW_FLAG=on\n`, 'utf8');
    const updated = run(['sync'], dir);
    assert.equal(updated.status, 0, updated.stderr);
    const next = readFileSync(join(dir, '.env.example'), 'utf8');
    assert.match(next, /NEW_FLAG=\n/);
    assert.equal(next.includes(SECRET), false);
    assert.equal(existsSync(join(dir, '.env.example')), true);
  });

  it('returns exit code 2 when the env file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-cli-'));
    writeFileSync(join(dir, '.env.example'), 'PORT=\n');
    const result = run(['check'], dir);
    assert.equal(result.status, 2);
    assert.match(result.stdout, /file-not-found/);
  });

  it('documents the broken report and the passing JSON report verbatim', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    const human = run(
      ['check', '--env', 'examples/broken/.env', '--example', 'examples/broken/.env.example', '--no-color'],
      root,
    );
    const json = run(
      ['check', '--env', 'examples/app/.env', '--example', 'examples/app/.env.example', '--format', 'json'],
      root,
    );
    assert.equal(readme.includes(human.stdout.trim()), true);
    assert.equal(readme.includes(json.stdout.trim()), true);
  });

  it('prints github annotations for the broken example without the secret', () => {
    const result = run(
      [
        'check',
        '--env',
        'examples/broken/.env',
        '--example',
        'examples/broken/.env.example',
        '--format',
        'github',
        '--no-color',
      ],
      root,
    );
    assert.equal(result.status, 1);
    const commands = result.stdout.split('\n').filter((line) => line.startsWith('::'));
    assert.ok(commands.some((line) => line.startsWith('::error ') && line.includes('title=missing') && !line.includes(',line=')));
    assert.ok(commands.some((line) => line.startsWith('::error ') && line.includes('file=examples/broken/.env,line=')));
    assert.ok(commands.some((line) => line.startsWith('::warning ') && line.includes('title=extra')));
    assert.match(result.stdout, /6 errors, 1 warning/);
    assert.equal(result.stdout.includes(SECRET), false);
    assert.equal(result.stderr.includes(SECRET), false);
  });

  it('checks each discovered env pair and hides values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    mkdirSync(join(dir, 'packages', 'web'), { recursive: true });
    mkdirSync(join(dir, 'packages', 'api'), { recursive: true });
    writeFileSync(join(dir, 'packages', 'web', '.env.example'), 'APP_URL=https://example.com\n');
    writeFileSync(join(dir, 'packages', 'web', '.env'), `APP_URL=https://example.com\nTOKEN=${SECRET}\n`);
    writeFileSync(join(dir, 'packages', 'api', '.env.example'), 'PORT=3000\n');
    writeFileSync(join(dir, 'packages', 'api', '.env'), 'PORT=\n');
    const result = run(['check', '--discover', 'packages/*', '--no-color'], dir);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /packages\/web\/\.env/);
    assert.match(result.stdout, /packages\/api\/\.env/);
    assert.match(result.stdout, /empty/);
    assert.match(result.stdout, /extra/);
    assert.equal(result.stdout.includes(SECRET), false);
    assert.equal(result.stderr.includes(SECRET), false);

    const none = run(['check', '--discover', 'missing/*'], dir);
    assert.equal(none.status, 2);
    assert.match(none.stderr, /no \.env and \.env\.example pairs matched/);
  });

  it('applies package.json settings, then the config file, then flags', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env.example'), 'APP_URL=https://example.com\n');
    writeFileSync(join(dir, '.env'), 'APP_URL=https://example.com\nDEBUG=1\nAPI_TOKEN=local\nFEATURE=1\n');
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        'env-sentinel': { strict: true, ignore: ['DEBUG', '*_TOKEN'] },
      }),
    );

    const fromPackage = run(['check'], dir);
    assert.equal(fromPackage.status, 1);
    assert.match(fromPackage.stdout, /FEATURE/);
    assert.equal(fromPackage.stdout.includes('DEBUG'), false);
    assert.equal(fromPackage.stdout.includes('API_TOKEN'), false);

    writeFileSync(join(dir, 'env-sentinel.config.json'), '{"strict":false}\n');
    const fromFile = run(['check'], dir);
    assert.equal(fromFile.status, 0);
    assert.match(fromFile.stdout, /FEATURE/);
    assert.equal(fromFile.stdout.includes('DEBUG'), false);

    const forced = run(['check', '--strict'], dir);
    assert.equal(forced.status, 1);

    const bare = run(['check', '--no-config'], dir);
    assert.equal(bare.status, 0);
    assert.match(bare.stdout, /DEBUG/);
    assert.match(bare.stdout, /API_TOKEN/);
  });

  it('rejects an unknown command', () => {
    const result = run(['lint'], root);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown command/);
  });

  it('fills missing env keys from the example and refuses a non-terminal prompt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-sentinel-'));
    writeFileSync(join(dir, '.env'), `TOKEN=${SECRET}\n`);
    writeFileSync(join(dir, '.env.example'), 'TOKEN=\n# @type port\nPORT=3000\n');
    const filled = run(['sync', '--fix', '--env', '.env', '--example', '.env.example'], dir);
    assert.equal(filled.status, 0);
    assert.match(filled.stdout, /Added to \.env: PORT/);
    assert.equal(filled.stdout.includes(SECRET), false);
    assert.equal(filled.stderr.includes(SECRET), false);
    const env = readFileSync(join(dir, '.env'), 'utf8');
    assert.match(env, new RegExp(`TOKEN=${SECRET}\\n`));
    assert.match(env, /PORT=3000\n/);

    const prompted = run(['sync', '--interactive', '--env', '.env', '--example', '.env.example'], dir);
    assert.equal(prompted.status, 2);
    assert.match(prompted.stderr, /needs a terminal/);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), env);
  });
});
