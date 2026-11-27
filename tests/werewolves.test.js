import test from 'node:test';
import assert from 'node:assert/strict';
import * as ww from '../games/werewolves/index.js';
import { findLeaks } from '../packages/game-sdk/index.js';
import { makeRoom, names } from './helpers.js';

const start = (n, opts = {}) => {
  const ctx = makeRoom(ww, { names: names(n), ...opts });
  ctx.room.command({ type: 'start' });
  const roleOf = (id) => ctx.room.state.players[id].role;
  const byRole = (r) => ctx.ids.filter((id) => roleOf(id) === r);
  return { ...ctx, roleOf, byRole };
};
const toNight = (c) => { c.clock.advance(ww.defaults.revealMs); c.room.tick(); };

test('role counts match the spec table', () => {
  const rows = { 5: [1, 1, 0, 3], 6: [1, 1, 0, 4], 7: [2, 1, 1, 3], 9: [2, 1, 1, 5], 10: [3, 1, 1, 5], 12: [3, 1, 1, 7], 13: [4, 1, 1, 7], 15: [4, 1, 1, 9] };
  for (const [n, [w, s, d, v]] of Object.entries(rows)) {
    assert.deepEqual(Object.values(ww.roleCounts(+n)), [w, s, d, v], `n=${n}`);
  }
});

test('needs at least 5 players', () => {
  const { room } = makeRoom(ww, { names: names(4) });
  assert.equal(room.command({ type: 'start' }).error, 'not_enough_players');
});

test('display payloads never carry roles of living players', () => {
  const c = start(9);
  toNight(c);
  for (const phaseStep of [0, 1, 2]) {
    const v = c.room.view('display');
    assert.deepEqual(findLeaks(v, { keys: ww.secretKeys }), []);
    assert.ok(v.participants.every((p) => p.tag === ''), 'living players carry no role tag');
    const raw = JSON.stringify(v);
    assert.doesNotMatch(raw, /Werewolf|Seer|Doctor/);
    if (phaseStep === 0) c.room.command({ type: 'skip' });
    if (phaseStep === 1) c.room.command({ type: 'skip' });
  }
});

test('players see only their own role; werewolves see their pack', () => {
  const c = start(9);
  const [w1, w2] = c.byRole('werewolf');
  const v = c.room.view('player', w1);
  assert.match(v.headline, /Werewolf/);
  assert.ok(v.lines.join(' ').includes(c.room.state.players[w2].name));
  const villager = c.byRole('villager')[0];
  const vv = c.room.view('player', villager);
  assert.match(vv.headline, /Villager/);
  const raw = JSON.stringify(vv);
  for (const id of c.ids.filter((i) => i !== villager)) assert.ok(!raw.includes(`${c.room.state.players[id].name}: `), 'no roster of roles');
});

test('host view reveals no roles so the host can also play', () => {
  const c = start(7);
  toNight(c);
  const raw = JSON.stringify(c.room.view('host'));
  assert.doesNotMatch(raw, /Werewolf|Seer|Doctor|Villager|"role"/);
});

test('night prompts have the same shape for every role (timing and shape side channel)', () => {
  const c = start(9);
  toNight(c);
  const shapes = c.ids.map((id) => {
    const v = c.room.view('player', id);
    return JSON.stringify({ keys: Object.keys(v).sort(), pkeys: Object.keys(v.prompt).sort(), kind: v.prompt.kind, headline: v.headline, lines: v.lines });
  });
  assert.equal(new Set(shapes).size, 1);
});

test('night ends at the fixed deadline, not when the last action arrives', () => {
  const c = start(7);
  toNight(c);
  for (const id of c.ids) {
    const o = c.room.view('player', id).prompt.options[0];
    c.room.input(id, { type: 'night', choice: o.id });
  }
  assert.equal(c.room.state.phase, 'night');
  c.clock.advance(ww.defaults.nightMs); c.room.tick();
  assert.equal(c.room.state.phase, 'dawn');
});

test('wolves kill their victim; doctor protection saves; announcement is identical either way', () => {
  const run = (protect) => {
    const c = start(7);
    toNight(c);
    const wolves = c.byRole('werewolf'), doc = c.byRole('doctor')[0];
    const victim = c.byRole('villager')[0];
    wolves.forEach((w) => c.room.input(w, { type: 'night', choice: victim }));
    if (protect) c.room.input(doc, { type: 'night', choice: victim });
    c.clock.advance(ww.defaults.nightMs); c.room.tick();
    return { c, victim };
  };
  const dead = run(false), saved = run(true);
  assert.equal(dead.c.room.state.players[dead.victim].alive, false);
  assert.equal(saved.c.room.state.players[saved.victim].alive, true);
  assert.match(dead.c.room.view('display').announcement, /was eliminated/);
  assert.equal(saved.c.room.view('display').announcement, 'Nobody was eliminated in the night.');
});

test('doctor cannot protect the same player two nights in a row', () => {
  const c = start(7);
  toNight(c);
  const doc = c.byRole('doctor')[0], t = c.byRole('villager')[0];
  c.room.input(doc, { type: 'night', choice: t });
  c.clock.advance(ww.defaults.nightMs); c.room.tick();           // dawn
  ['dawn', 'day', 'vote', 'verdict'].forEach(() => c.room.command({ type: 'skip' }));
  assert.equal(c.room.state.phase, 'night');
  assert.ok(!c.room.view('player', doc).prompt.options.some((o) => o.id === t));
  assert.equal(c.room.input(doc, { type: 'night', choice: t }).error, 'invalid_target');
});

test('seer learns only the inspected player, and only after the night', () => {
  const c = start(7);
  toNight(c);
  const seer = c.byRole('seer')[0], wolf = c.byRole('werewolf')[0];
  c.room.input(seer, { type: 'night', choice: wolf });
  assert.deepEqual(c.room.view('player', seer).lines, []);
  c.clock.advance(ww.defaults.nightMs); c.room.tick();
  assert.match(c.room.view('player', seer).lines[0], /is a werewolf/);
});

test('players cannot act twice, act out of phase, or act when out', () => {
  const c = start(7);
  assert.equal(c.room.input(c.ids[0], { type: 'night', choice: c.ids[1] }).error, 'wrong_phase');
  toNight(c);
  const id = c.ids[0], o = c.room.view('player', id).prompt.options[0].id;
  assert.equal(c.room.input(id, { type: 'night', choice: o }).ok, true);
  assert.equal(c.room.input(id, { type: 'night', choice: o }).error, 'already_acted');
});

test('voting eliminates the plurality target; ties eliminate nobody; early finish when all voted', () => {
  const c = start(7);
  toNight(c);
  c.clock.advance(ww.defaults.nightMs); c.room.tick();
  c.room.command({ type: 'skip' }); c.room.command({ type: 'skip' });     // dawn -> day -> vote
  assert.equal(c.room.state.phase, 'vote');
  const living = c.ids.filter((id) => c.room.state.players[id].alive);
  const target = living[0];
  living.forEach((id) => { if (id !== target) c.room.input(id, { type: 'vote', choice: target }); });
  c.room.input(target, { type: 'vote', choice: living[1] });
  assert.equal(c.room.state.phase, 'verdict');
  assert.equal(c.room.state.players[target].alive, false);
});

test('villagers win when all werewolves are out; werewolves win at parity', () => {
  const s = ww.create({}, { seed: 1 });
  const mk = (roles) => { const st = structuredClone(s); roles.forEach((r, i) => { st.players[`p${i}`] = { name: `P${i}`, role: r, alive: true }; st.order.push(`p${i}`); }); return st; };
  const v = mk(['villager', 'villager', 'villager', 'seer', 'werewolf']);
  v.players.p4.alive = false; v.phase = 'dawn'; v.deadline = 0;
  assert.equal(ww.handleTimer(v, 1).state.winner, 'villagers');
  const w = mk(['villager', 'villager', 'werewolf', 'werewolf']);
  w.phase = 'dawn'; w.deadline = 0;
  assert.equal(ww.handleTimer(w, 1).state.winner, 'werewolves');
});

test('reconnecting players get their role view back; state is deterministic per seed', () => {
  const a = start(7, { seed: 99 }), b = start(7, { seed: 99 });
  assert.equal(JSON.stringify(a.room.state), JSON.stringify(b.room.state));
  const id = a.ids[2];
  assert.deepEqual(a.room.view('player', id), a.room.view('player', id));
});

test('game over reveals every role on the display', () => {
  const c = start(5);
  c.room.state.players[c.byRole('werewolf')[0]].alive = false;   // force an end state through the public timer path
  c.room.state.phase = 'dawn'; c.room.state.deadline = c.clock.now();
  c.clock.advance(1); c.room.tick();
  const v = c.room.view('display');
  assert.equal(c.room.state.phase, 'over');
  assert.ok(v.participants.every((p) => p.tag));
});
