import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_EXPAND_DEPTH, expandValue } from '../src/expand.js';
import { containsInterpolation } from '../src/validate.js';

function lookup(values: Record<string, string | undefined>) {
  return (name: string) => values[name];
}

describe('expandValue', () => {
  it('leaves text without references unchanged', () => {
    const result = expandValue('https://example.com', lookup({}));
    assert.equal(result.ok, true);
    assert.equal(result.hasReference, false);
    assert.equal(result.value, 'https://example.com');
    assert.equal(containsInterpolation('https://example.com'), false);
    assert.equal(containsInterpolation('${HOST'), false);
  });

  it('expands bare, braced, and default forms', () => {
    const values = lookup({ HOST: 'https://example.com', EMPTY: '', SET: 'kept' });
    assert.equal(expandValue('$HOST/app', values).value, 'https://example.com/app');
    assert.equal(expandValue('${HOST}/app', values).value, 'https://example.com/app');
    assert.equal(expandValue('${MISSING:-https://example.com}', values).value, 'https://example.com');
    assert.equal(expandValue('${MISSING-https://example.com}', values).value, 'https://example.com');
    assert.equal(expandValue('${EMPTY:-fallback}', values).value, 'fallback');
    assert.equal(expandValue('${EMPTY-fallback}', values).value, '');
    assert.equal(expandValue('${SET:-fallback}', values).value, 'kept');
    assert.equal(expandValue('${HOST:-${MISSING:-https://example.com}}', lookup({})).value, 'https://example.com');
    assert.equal(containsInterpolation('${HOST:-https://example.com}'), true);
    assert.equal(containsInterpolation('$HOST'), true);
  });

  it('reports each undefined name once and does not return a partial value', () => {
    const result = expandValue('${HOST}/x/${HOST}/$PORT', lookup({}));
    assert.equal(result.ok, false);
    assert.deepEqual(result.undefinedNames, ['HOST', 'PORT']);
    assert.equal(result.value, '');
  });

  it('reports a self-cycle and a two-node cycle', () => {
    const self = expandValue('${A}', lookup({ A: '${A}' }));
    assert.equal(self.ok, false);
    assert.deepEqual(self.circularNames, ['A']);

    const cycle = expandValue('${A}', lookup({ A: '${B}', B: '${A}-tail' }));
    assert.equal(cycle.ok, false);
    assert.equal(cycle.circularNames.includes('A'), true);
    assert.equal(cycle.value, '');
  });

  it('stops a chain that exceeds the depth limit', () => {
    const values: Record<string, string> = {};
    const length = MAX_EXPAND_DEPTH + 5;
    for (let index = 0; index < length; index += 1) {
      values[`V${String(index)}`] = index === length - 1 ? 'end' : `\${V${String(index + 1)}}`;
    }
    const result = expandValue('${V0}', lookup(values));
    assert.equal(result.depthExceeded, true);
    assert.equal(result.ok, false);
    assert.equal(result.value, '');
  });

  it('keeps an unclosed brace and an unknown operator as text', () => {
    assert.equal(expandValue('pre ${HOST post', lookup({ HOST: 'nope' })).value, 'pre ${HOST post');
    assert.equal(expandValue('${HOST:?nope}', lookup({ HOST: 'nope' })).hasReference, false);
  });

  it('uses an empty default and a nested default that is itself unset', () => {
    assert.equal(expandValue('${MISSING:-}', lookup({})).value, '');
    const nested = expandValue('${A:-${B}}', lookup({}));
    assert.equal(nested.ok, false);
    assert.deepEqual(nested.undefinedNames, ['B']);
  });
});
