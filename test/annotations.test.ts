import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseAnnotations } from '../src/annotations.js';

describe('parseAnnotations', () => {
  it('reads type, optional, and description', () => {
    const parsed = parseAnnotations(['Primary database', '@type url']);
    assert.equal(parsed.type?.name, 'url');
    assert.equal(parsed.required, true);
    assert.equal(parsed.description, 'Primary database');
  });

  it('lets the later required marker win and parses enums', () => {
    const optional = parseAnnotations(['@required @optional', '@type enum(debug, info, "warn")']);
    assert.equal(optional.required, false);
    assert.equal(optional.requiredSpecified, true);
    assert.deepEqual(optional.type?.values, ['debug', 'info', 'warn']);

    const required = parseAnnotations(['@optional', '@required']);
    assert.equal(required.required, true);
  });

  it('reports an unknown type and an empty enum', () => {
    assert.equal(parseAnnotations(['@type urll']).unknownType, 'urll');
    assert.equal(parseAnnotations(['@type enum()']).invalidEnum, true);
  });
});
