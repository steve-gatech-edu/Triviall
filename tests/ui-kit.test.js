import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, renderDisplay, renderPlayer, renderHost } from '../packages/ui-kit/index.js';
import * as trivia from '../games/trivia/index.js';
import * as ww from '../games/werewolves/index.js';
import { makeRoom, triviaContent, names } from './helpers.js';

test('esc neutralizes markup in player-supplied text', () => {
  assert.equal(esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

test('names with markup are escaped on every surface', () => {
  const { room, ids } = makeRoom(trivia, { names: ['<b>x</b>'], content: triviaContent() });
  for (const html of [renderDisplay(room.view('display')), renderPlayer(room.view('player', ids[0])), renderHost(room.view('host'))]) {
    assert.doesNotMatch(html, /<b>x<\/b>/);
  }
});

test('phone buttons carry a parseable input matching the prompt kind', () => {
  const { room, ids } = makeRoom(trivia, { names: ['A'], content: triviaContent() });
  room.command({ type: 'start' });
  const html = renderPlayer(room.view('player', ids[0]));
  const raw = html.match(/data-input="([^"]+)"/)[1].replace(/&quot;/g, '"');
  assert.deepEqual(JSON.parse(raw), { type: 'answer', choice: 0 });
});

test('every game renders every phase on every surface without throwing', () => {
  const run = (game, n, steps) => {
    const { room, ids, clock } = makeRoom(game, { names: names(n), content: game === trivia ? triviaContent() : null });
    room.command({ type: 'start' });
    for (let i = 0; i < steps; i++) {
      renderDisplay(room.view('display')); renderHost(room.view('host'));
      ids.forEach((id) => renderPlayer(room.view('player', id)));
      clock.advance(60000); room.tick();
    }
  };
  run(trivia, 3, 14);
  run(ww, 7, 40);
});
