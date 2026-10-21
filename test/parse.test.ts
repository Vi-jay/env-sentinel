import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEnv } from '../src/parse.js';

describe('parseEnv', () => {
  it('parses plain assignments, export, and surrounding spaces', () => {
    const parsed = parseEnv('export PORT = 3000\nNAME=ada\n');
    assert.equal(parsed.diagnostics.length, 0);
    assert.equal(parsed.entries[0]?.key, 'PORT');
    assert.equal(parsed.entries[0]?.value, '3000');
    assert.equal(parsed.entries[0]?.exported, true);
    assert.equal(parsed.entries[1]?.value, 'ada');
    assert.equal(parsed.variables.get('PORT')?.value, '3000');
  });

  it('keeps hashes inside quotes and treats a spaced hash as a comment', () => {
    const parsed = parseEnv('A=hello # note\nB="hash # inside"\nC=hash#inside\n');
    assert.equal(parsed.entries[0]?.value, 'hello');
    assert.equal(parsed.entries[0]?.comments[0], 'note');
    assert.equal(parsed.entries[0]?.inlineSuffix, ' # note');
    assert.equal(parsed.entries[1]?.value, 'hash # inside');
    assert.equal(parsed.entries[2]?.value, 'hash#inside');
  });

  it('decodes double-quote escapes and leaves single quotes literal', () => {
    const parsed = parseEnv(`${String.raw`A="a\nb\t\"\\ \u0041"`}\n${String.raw`B='a\nb\'c'`}\n`);
    assert.equal(parsed.entries[0]?.value, 'a\nb\t"\\ A');
    assert.equal(parsed.entries[1]?.value, String.raw`a\nb'c`);
  });

  it('reads multiline quoted values and backtick quotes', () => {
    const parsed = parseEnv('CERT="-----BEGIN\\nLINE"\nPEM="line1\nline2"\nQ=`tick`\n');
    assert.equal(parsed.entries[0]?.value, '-----BEGIN\nLINE');
    assert.equal(parsed.entries[1]?.value, 'line1\nline2');
    assert.equal(parsed.entries[1]?.line, 2);
    assert.equal(parsed.entries[1]?.endLine, 3);
    assert.equal(parsed.entries[2]?.line, 4);
    assert.equal(parsed.entries[2]?.quote, 'backtick');
    assert.equal(parsed.entries[2]?.value, 'tick');
  });

  it('attaches preceding comments and stops them at a blank line', () => {
    const parsed = parseEnv('# orphan\n\n# @type port\n# listen port\nPORT=1\n');
    assert.equal(parsed.entries[0]?.key, 'PORT');
    assert.deepEqual(parsed.entries[0]?.comments, ['@type port', 'listen port']);
    assert.deepEqual(parsed.entries[0]?.precedingCommentLines, ['# @type port', '# listen port']);
  });

  it('reports trailing junk after a quoted value', () => {
    const parsed = parseEnv('KEY="value" oops\n');
    assert.equal(parsed.entries[0]?.value, 'value');
    assert.equal(parsed.entries[0]?.wellFormed, false);
    assert.equal(parsed.diagnostics[0]?.code, 'malformed');
    assert.equal(parsed.diagnostics[0]?.message.includes('oops'), false);
  });

  it('reports duplicates and lets the last value win', () => {
    const parsed = parseEnv('TOKEN=one\nTOKEN=two\n');
    assert.equal(parsed.variables.get('TOKEN')?.value, 'two');
    assert.equal(parsed.diagnostics.length, 1);
    assert.equal(parsed.diagnostics[0]?.code, 'duplicate');
    assert.equal(parsed.diagnostics[0]?.otherLine, 1);
    assert.equal(parsed.diagnostics[0]?.line, 2);
    assert.equal(parsed.diagnostics[0]?.message.includes('one'), false);
    assert.equal(parsed.diagnostics[0]?.message.includes('two'), false);
  });

  it('reports malformed lines and unclosed quotes without echoing the text', () => {
    const secret = 'super-secret-malformed';
    const parsed = parseEnv(`GOOD=1\n1BAD=${secret}\nNOPE\nOPEN="still-${secret}\nMORE=${secret}\n`);
    const codes = parsed.diagnostics.map((item) => item.code);
    assert.ok(codes.includes('malformed'));
    assert.ok(codes.includes('unclosed-quote'));
    const blob = JSON.stringify(parsed.diagnostics);
    assert.equal(blob.includes(secret), false);
    assert.equal(parsed.entries.some((entry) => entry.key === 'OPEN' && entry.wellFormed === false), true);
  });

  it('handles a BOM, CRLF, and empty values', () => {
    const parsed = parseEnv('\uFEFFA=\r\nB=""\r\nC=\'\'\r\n');
    assert.equal(parsed.entries.map((entry) => entry.value).join(','), ',,');
    assert.equal(parsed.entries[0]?.line, 1);
    assert.equal(parsed.entries[2]?.line, 3);
    assert.equal(parsed.diagnostics.length, 0);
  });

  it('keeps unicode values, lone CR, and a tabbed inline comment', () => {
    const parsed = parseEnv('NAME=héllo\rCITY="你好"\r\nNOTE=café\t# accent\nFLAG=😀\nexport=1\n');
    assert.equal(parsed.diagnostics.length, 0);
    assert.equal(parsed.entries[0]?.value, 'héllo');
    assert.equal(parsed.entries[0]?.endLine, 1);
    assert.equal(parsed.entries[1]?.value, '你好');
    assert.equal(parsed.entries[2]?.value, 'café');
    assert.equal(parsed.entries[2]?.comments[0], 'accent');
    assert.equal(parsed.entries[3]?.value, '😀');
    assert.equal(parsed.entries[4]?.key, 'export');
    assert.equal(parsed.entries[4]?.exported, false);
    assert.equal(parsed.entries[4]?.value, '1');
  });

  it('keeps a mid-value BOM and treats a leading hash as a comment', () => {
    const parsed = parseEnv('A=ok\nB=mid\uFEFFvalue\nC=#not-a-comment\nD=hash#inside\n# only a comment\n');
    assert.equal(parsed.diagnostics.length, 0);
    assert.equal(parsed.entries.length, 4);
    assert.equal(parsed.entries[1]?.value, 'mid\uFEFFvalue');
    assert.equal(parsed.entries[2]?.value, '');
    assert.equal(parsed.entries[2]?.comments[0], 'not-a-comment');
    assert.equal(parsed.entries[3]?.value, 'hash#inside');
  });

  it('reads a quoted value that spans CRLF lines', () => {
    const parsed = parseEnv('CERT="line1\r\nline2"\r\nNEXT=1\r\n');
    assert.equal(parsed.diagnostics.length, 0);
    assert.equal(parsed.entries[0]?.value, 'line1\r\nline2');
    assert.equal(parsed.entries[0]?.endLine, 2);
    assert.equal(parsed.entries[1]?.key, 'NEXT');
    assert.equal(parsed.entries[1]?.line, 3);
  });

  it('records block offsets that cover the preceding comment and the whole assignment', () => {
    const contents = '# note\nKEY="line1\nline2"\n';
    const parsed = parseEnv(contents);
    const entry = parsed.entries[0];
    assert.ok(entry);
    assert.equal(contents.slice(entry.blockStart, entry.blockEnd), contents);
    assert.equal(entry.wellFormed, true);
  });
});
