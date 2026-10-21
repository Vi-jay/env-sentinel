import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEnv } from '../src/parse.js';
import { renderExample } from '../src/sync.js';

interface Generated {
  key: string;
  value: string;
  /** True when the value is long enough that example rendering must not echo it. */
  sensitive: boolean;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  const index = Math.floor(rng() * values.length);
  return values[index] ?? values[0] as T;
}

function letters(rng: () => number, length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += alphabet.charAt(Math.floor(rng() * alphabet.length));
  }
  return text;
}

function generate(rng: () => number): { contents: string; entries: Generated[] } {
  const count = 1 + Math.floor(rng() * 6);
  const entries: Generated[] = [];
  const lines: string[] = [];
  const newline = rng() < 0.5 ? '\n' : '\r\n';
  for (let index = 0; index < count; index += 1) {
    if (rng() < 0.2) lines.push('# comment');
    if (rng() < 0.15) lines.push('');
    const key = `K${letters(rng, 1 + Math.floor(rng() * 4))}${String(index)}`;
    const style = pick(rng, ['plain', 'double', 'single', 'unicode'] as const);
    let value = '';
    let sensitive = false;
    if (style === 'plain') {
      value = `Z${letters(rng, 11)}`;
      sensitive = true;
      lines.push(`${key}=${value}`);
    } else if (style === 'single') {
      value = `café-${letters(rng, 8)}`;
      sensitive = true;
      lines.push(`${key}='${value}'`);
    } else if (style === 'unicode') {
      value = `你好-${letters(rng, 6)}-😀`;
      sensitive = true;
      lines.push(`${key}="${value}"`);
    } else {
      value = `a"b\\c\n${letters(rng, 8)}`;
      sensitive = true;
      lines.push(`${key}="${escapeDouble(value)}"`);
    }
    if (rng() < 0.25 && style === 'plain') lines[lines.length - 1] += ' # note';
    entries.push({ key, value, sensitive });
  }
  const prefix = rng() < 0.3 ? '\uFEFF' : '';
  return { contents: `${prefix}${lines.join(newline)}${newline}`, entries };
}

function escapeDouble(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
}

describe('parser properties', () => {
  it('parses generated documents and keeps secrets out of the example', () => {
    const rng = mulberry32(0x45b2026);
    for (let sample = 0; sample < 40; sample += 1) {
      const generated = generate(rng);
      const parsed = parseEnv(generated.contents);
      assert.equal(parsed.diagnostics.length, 0, generated.contents);
      assert.equal(parsed.entries.length, generated.entries.length);
      for (let index = 0; index < generated.entries.length; index += 1) {
        const expected = generated.entries[index];
        const actual = parsed.entries[index];
        assert.equal(actual?.key, expected?.key);
        assert.equal(actual?.value, expected?.value);
        assert.equal(actual?.wellFormed, true);
      }

      const rendered = renderExample(generated.contents);
      const again = parseEnv(rendered.contents);
      assert.deepEqual(
        again.entries.map((entry) => entry.key),
        generated.entries.map((entry) => entry.key),
      );
      assert.equal(again.entries.every((entry) => entry.value === ''), true);
      for (const entry of generated.entries) {
        if (!entry.sensitive) continue;
        assert.equal(rendered.contents.includes(entry.value), false);
        assert.equal(JSON.stringify(rendered.messages).includes(entry.value), false);
      }
    }
  });
});
