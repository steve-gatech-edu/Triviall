import test from 'node:test';
import assert from 'node:assert/strict';
import * as trivia from '../games/trivia/index.js';
import { findLeaks } from '../packages/game-sdk/index.js';
import { loadQuestions, buildUrl, ATTRIBUTION } from '../games/trivia/opentdb.js';
import { FALLBACK_QUESTIONS } from '../games/trivia/fallback.js';
import { makeRoom, triviaContent, names } from './helpers.js';

const correctIndex = (room) => room.state.questions[room.state.idx].correct;

test('default is 20 questions and ends after the last one', () => {
  assert.equal(trivia.defaults.count, 20);
  const { room, clock } = makeRoom(trivia, { names: names(2), content: triviaContent(20) });
  room.command({ type: 'start' });
  for (let i = 0; i < 20; i++) {
    assert.equal(room.state.phase, 'question');
    clock.advance(trivia.defaults.timeMs); room.tick();       // lock
    clock.advance(trivia.defaults.revealMs); room.tick();     // next or final
  }
  assert.equal(room.state.phase, 'final');
});

test('correct answer is absent from display and player payloads until reveal', () => {
  const { room, ids } = makeRoom(trivia, { names: names(3), content: triviaContent() });
  room.command({ type: 'start' });
  const views = [room.view('display'), room.view('host'), ...ids.map((id) => room.view('player', id))];
  for (const v of views) {
    assert.deepEqual(findLeaks(v, { keys: trivia.secretKeys }), []);
    assert.doesNotMatch(JSON.stringify(v), /"correct"/);
  }
  room.command({ type: 'skip' });
  assert.ok(room.view('display').choices.some((c) => c.state === 'correct'));
});

test('faster correct answers score more; wrong answers score zero; first answer locks', () => {
  const { room, ids, clock } = makeRoom(trivia, { names: names(4), content: triviaContent() });
  room.command({ type: 'start' });
  const c = correctIndex(room), wrong = (c + 1) % 4;
  room.input(ids[0], { type: 'answer', choice: c });
  clock.advance(10000);
  room.input(ids[1], { type: 'answer', choice: c });
  room.input(ids[2], { type: 'answer', choice: wrong });
  assert.equal(room.input(ids[2], { type: 'answer', choice: c }).error, 'already_answered');
  room.command({ type: 'skip' });             // host locks; the fourth player never answered
  const s = room.state;
  assert.equal(s.phase, 'reveal');
  assert.equal(s.players[ids[3]].score, 0);
  assert.equal(s.players[ids[0]].score, 1000);
  assert.equal(s.players[ids[1]].score, 750);
  assert.equal(s.players[ids[2]].score, 0);
});

test('late answers and invalid choices are rejected', () => {
  const { room, ids, clock } = makeRoom(trivia, { names: names(2), content: triviaContent() });
  room.command({ type: 'start' });
  assert.equal(room.input(ids[0], { type: 'answer', choice: 9 }).error, 'invalid_choice');
  clock.advance(trivia.defaults.timeMs + 1);
  assert.equal(room.input(ids[0], { type: 'answer', choice: 0 }).error, 'wrong_phase');
});

test('same seed and inputs give identical state', () => {
  const run = () => {
    const { room, ids } = makeRoom(trivia, { names: names(2), seed: 42, content: triviaContent() });
    room.command({ type: 'start' });
    room.input(ids[0], { type: 'answer', choice: 1 });
    return JSON.stringify(room.state);
  };
  assert.equal(run(), run());
});

test('a display reconnect (fresh view) does not change the deadline', () => {
  const { room, clock } = makeRoom(trivia, { names: names(2), content: triviaContent() });
  room.command({ type: 'start' });
  const before = room.view('display').timer.deadline;
  clock.advance(5000);
  assert.equal(room.view('display').timer.deadline, before);
});

test('start needs players and questions', () => {
  const a = makeRoom(trivia, { names: [], content: triviaContent() });
  assert.equal(a.room.command({ type: 'start' }).error, 'no_players');
  const b = makeRoom(trivia, { names: ['A'], content: null });
  assert.equal(b.room.command({ type: 'start' }).error, 'no_questions');
});

test('OpenTDB: builds a url3986 request capped at 50', () => {
  const u = new URL(buildUrl({ amount: 500, category: 9 }));
  assert.equal(u.searchParams.get('amount'), '50');
  assert.equal(u.searchParams.get('encode'), 'url3986');
  assert.equal(u.searchParams.get('category'), '9');
});

const okJson = { response_code: 0, results: [{ category: 'Science%3A%20Computers', type: 'multiple', difficulty: 'easy',
  question: 'Is%20%CF%80%20%3D%203.14%3F', correct_answer: 'Yes', incorrect_answers: ['No', 'Maybe', 'Never'] }] };

test('OpenTDB: decodes url3986 results and reports attribution', async () => {
  const r = await loadQuestions({ amount: 1, fetchFn: async () => ({ status: 200, json: async () => okJson }) });
  assert.equal(r.source, 'opentdb');
  assert.equal(r.questions[0].prompt, 'Is π = 3.14?');
  assert.equal(r.attribution, ATTRIBUTION);
});

test('OpenTDB: rate limit (code 5) backs off, retries, then succeeds', async () => {
  let calls = 0; const sleeps = [];
  const fetchFn = async () => ({ status: 200, json: async () => (++calls < 2 ? { response_code: 5 } : okJson) });
  const r = await loadQuestions({ amount: 1, fetchFn, sleep: async (ms) => sleeps.push(ms) });
  assert.equal(r.source, 'opentdb');
  assert.deepEqual(sleeps, [5000]);
});

test('OpenTDB: every failure mode falls back without throwing', async () => {
  const cases = [
    async () => ({ status: 200, json: async () => ({ response_code: 1, results: [] }) }),
    async () => ({ status: 200, json: async () => ({ response_code: 2, results: [] }) }),
    async () => ({ status: 429, json: async () => ({}) }),
    async () => { throw new Error('offline'); },
    async () => ({ status: 200, json: async () => { throw new Error('bad json'); } }),
  ];
  for (const fetchFn of cases) {
    const r = await loadQuestions({ amount: 5, fetchFn, sleep: async () => {}, retries: 1 });
    assert.equal(r.source, 'fallback');
    assert.equal(r.questions.length, 5);
    assert.ok(r.note.length > 0);
  }
});

test('fallback set is well formed', () => {
  for (const q of FALLBACK_QUESTIONS) {
    assert.equal(new Set([q.correctAnswer, ...q.incorrectAnswers]).size, 4, q.prompt);
  }
});
