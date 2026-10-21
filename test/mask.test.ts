import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { maskSecret } from '../src/mask.js';

describe('maskSecret', () => {
  it('does not reveal any character of the value', () => {
    const secret = 'sk_live_51HhExampleSecret';
    const masked = maskSecret(secret);
    assert.equal(masked, '****');
    assert.equal(secret.includes(masked.replace(/\*/g, '')), true);
    for (const chunk of [secret.slice(0, 4), secret.slice(-4), secret.slice(4, 10)]) {
      assert.equal(masked.includes(chunk), false);
    }
    assert.equal(maskSecret(''), '(empty)');
    assert.equal(maskSecret('ab'), '****');
  });
});
