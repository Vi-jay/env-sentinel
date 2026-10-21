import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatReport } from '../src/format.js';
import type { CheckReport } from '../src/types.js';

const SECRET = 'sk_live_EXAMPLE_SECRET_VALUE';

function report(): CheckReport {
  return {
    ok: false,
    strict: false,
    summary: { errors: 2, warnings: 1 },
    files: [
      {
        path: 'a,b.env',
        role: 'env',
        ok: false,
        checked: 2,
        findings: [
          {
            severity: 'error',
            code: 'malformed',
            message: 'Line 4: expected KEY=VALUE',
            file: 'a,b.env',
            line: 4,
            key: 'THIS',
          },
          {
            severity: 'error',
            code: 'missing',
            message: 'Required key is missing (declared in .env.example:2)',
            file: 'a,b.env',
            key: 'DATABASE_URL',
          },
          {
            severity: 'warning',
            code: 'extra',
            message: 'Not documented in .env.example',
            file: 'a,b.env',
            line: 9,
            endLine: 10,
            key: 'EXTRA_TOKEN',
          },
        ],
      },
    ],
  };
}

describe('github annotations', () => {
  it('emits workflow commands without a line for missing keys', () => {
    const text = formatReport(report(), { format: 'github', color: false, version: '0.1.0' });
    const lines = text.split('\n');
    assert.equal(lines[0], '::error file=a%2Cb.env,line=4,title=malformed::Line 4%3A expected KEY=VALUE');
    assert.equal(
      lines[1],
      '::error file=a%2Cb.env,title=missing::Required key is missing (declared in .env.example%3A2)',
    );
    assert.equal(lines[1]?.includes(',line='), false);
    assert.equal(
      lines[2],
      '::warning file=a%2Cb.env,line=9,endLine=10,title=extra::Not documented in .env.example',
    );
    assert.match(text, /2 errors, 1 warning/);
    assert.equal(text.includes(SECRET), false);
  });
});
