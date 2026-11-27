import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFetch, renderBlock, replaceBlock, START, END } from '../scripts/spike-lib.mjs';

test('fetch classification distinguishes public, private, and interstitial responses', () => {
  assert.equal(classifyFetch(200, '<title>Triviall</title>').kind, 'public-ok');
  assert.equal(classifyFetch(302).kind, 'auth-redirect');
  assert.equal(classifyFetch(401).kind, 'auth-required');
  const other = classifyFetch(200, '<title>Open in Codespaces?</title>');
  assert.equal(other.kind, 'other');
  assert.match(other.text, /Open in Codespaces/);
});

test('replaceBlock rewrites only the auto block and preserves manual content', () => {
  const run = { at: 'T', node: 'v22', inCodespace: true, csId: 'abc', checks: { A1: { status: 'pass', summary: 'ok' } } };
  const md = `top\n${START}\nold\n${END}\n| A7 | my manual note |\n`;
  const out = replaceBlock(md, renderBlock(run, [run]));
  assert.match(out, /\| A1 \| PASS \| ok \|/);
  assert.doesNotMatch(out, /\nold\n/);
  assert.match(out, /my manual note/);
  assert.equal(out.split(START).length, 2);
  assert.equal(replaceBlock(out, renderBlock(run, [run, run])).split(START).length, 2);
});
