import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, seedFrom, validateManifest, findLeaks } from '../packages/game-sdk/index.js';
import { validateInput } from '../packages/protocol/index.js';
import * as trivia from '../games/trivia/index.js';
import { makeRoom, triviaContent } from './helpers.js';

test('rng is deterministic for a seed and lives in state', () => {
  const a = { rng: seedFrom('x') }, b = { rng: seedFrom('x') };
  assert.deepEqual(rng(a).shuffle([1, 2, 3, 4, 5]), rng(b).shuffle([1, 2, 3, 4, 5]));
  assert.notEqual(a.rng, seedFrom('x'));
});

test('manifest validation flags bad SDK versions and player limits', () => {
  assert.deepEqual(validateManifest(trivia.manifest), []);
  assert.ok(validateManifest({ ...trivia.manifest, sdk: 99 }).length > 0);
  assert.ok(validateManifest({ ...trivia.manifest, minPlayers: 9, maxPlayers: 2 }).length > 0);
});

test('input validation rejects malformed and oversized messages', () => {
  assert.equal(validateInput({ type: 'answer' }), null);
  assert.equal(validateInput(null), 'bad_input');
  assert.equal(validateInput({ type: 'x'.repeat(40) }), 'bad_input');
  assert.equal(validateInput({ type: 'a', blob: 'y'.repeat(5000) }), 'too_large');
});

test('findLeaks reports banned keys and values with paths', () => {
  const hits = findLeaks({ a: [{ role: 'x' }], b: 'the secret word' }, { keys: ['role'], values: ['secret'] });
  assert.deepEqual(hits, ['$.a[0].role', '$.b']);
});

test('room revision increases on every change; repeated input ids are not re-applied', () => {
  const { room, ids } = makeRoom(trivia, { names: ['A', 'B'], content: triviaContent() });
  room.command({ type: 'start' });
  const rev = room.revision;
  assert.equal(room.input(ids[0], { type: 'answer', choice: 0 }, 'i1').ok, true);
  assert.equal(room.revision, rev + 1);
  const dup = room.input(ids[0], { type: 'answer', choice: 1 }, 'i1');
  assert.equal(dup.duplicate, true);
  assert.equal(room.revision, rev + 1);
});

test('snapshots are versioned envelopes with the current revision', () => {
  const { room, ids } = makeRoom(trivia, { names: ['A'], content: triviaContent() });
  const snap = room.snapshot('player', ids[0]);
  assert.equal(snap.v, 1);
  assert.equal(snap.revision, room.revision);
  assert.equal(snap.role, 'player');
});

test('unknown players cannot act or view', () => {
  const { room } = makeRoom(trivia, { names: ['A'], content: triviaContent() });
  assert.equal(room.input('nope', { type: 'answer', choice: 0 }).error, 'unknown_player');
  assert.throws(() => room.view('player', 'nope'));
});
