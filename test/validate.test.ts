import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { typeProblem } from '../src/validate.js';
import type { TypeSpec } from '../src/types.js';

function spec(name: TypeSpec['name'], values?: string[]): TypeSpec {
  return { name, raw: name, ...(values ? { values } : {}) };
}

describe('typeProblem', () => {
  it('accepts the documented shapes', () => {
    assert.equal(typeProblem(spec('url'), 'postgres://user:pass@localhost:5432/app'), null);
    assert.equal(typeProblem(spec('url'), 'https://example.com/a'), null);
    assert.equal(typeProblem(spec('int'), '-12'), null);
    assert.equal(typeProblem(spec('int'), '08'), 'Expected an integer');
    assert.equal(typeProblem(spec('bool'), 'YES'), null);
    assert.equal(typeProblem(spec('email'), 'dev@example.com'), null);
    assert.equal(typeProblem(spec('port'), '443'), null);
    assert.equal(typeProblem(spec('port'), '0'), 'Expected a TCP port from 1 to 65535');
    assert.equal(typeProblem(spec('port'), '65536'), 'Expected a TCP port from 1 to 65535');
    assert.equal(typeProblem(spec('enum', ['a', 'b']), 'a'), null);
    assert.equal(typeProblem(spec('enum', ['a', 'b']), 'A')?.startsWith('Expected one of'), true);
    assert.equal(typeProblem(spec('string'), 'anything goes'), null);
  });

  it('rejects values without a scheme', () => {
    assert.ok(typeProblem(spec('url'), 'localhost:3000'));
    assert.ok(typeProblem(spec('email'), 'not-an-email'));
  });
});
