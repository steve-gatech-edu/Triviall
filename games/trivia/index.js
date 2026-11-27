// Trivia: pure, deterministic game module. No clocks, sockets, or storage; time arrives as `now`.
import { rng, ok, fail } from '../../packages/game-sdk/index.js';

export const manifest = {
  id: 'trivia', name: 'Trivia', version: '0.1.0', sdk: 1,
  minPlayers: 1, maxPlayers: 50, anonymous: true, reconnection: true, recoverable: 'between-questions',
};
export const defaults = { count: 20, timeMs: 20000, revealMs: 6000 };
/** Keys that must never appear in a display or player payload before reveal. */
export const secretKeys = ['correct', 'correctIndex', 'correctAnswer'];

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const SOURCE_LINE = { opentdb: 'Questions from the Open Trivia Database (opentdb.com), CC BY-SA 4.0.', fallback: 'Questions: bundled starter set.' };

export function create(config = {}, { seed = 1, content = null } = {}) {
  const cfg = { ...defaults, ...config };
  cfg.count = clamp(cfg.count | 0, 1, 50);
  const s = { phase: 'lobby', cfg, rng: seed, players: {}, order: [], questions: [], idx: -1, deadline: null,
    qDeadline: null, answers: {}, lastPoints: {}, source: content?.source ?? 'fallback', note: content?.note ?? '' };
  const r = rng(s);
  s.questions = (content?.questions ?? []).slice(0, cfg.count).map((q) => {
    const choices = q.type === 'boolean' ? ['True', 'False'] : r.shuffle([q.correctAnswer, ...q.incorrectAnswers]);
    return { category: q.category, prompt: q.prompt, choices, correct: choices.indexOf(q.correctAnswer) };
  });
  s.cfg.count = s.questions.length;
  return s;
}

export function join(state, { id, name }) {
  if (state.players[id]) return ok(state);
  if (state.phase !== 'lobby') return fail('game_started');
  if (state.order.length >= manifest.maxPlayers) return fail('room_full');
  const s = structuredClone(state);
  s.players[id] = { name: String(name).slice(0, 20), score: 0 };
  s.order.push(id);
  return ok(s);
}

function lock(s, now) {
  const q = s.questions[s.idx];
  s.lastPoints = {};
  for (const [pid, a] of Object.entries(s.answers)) {
    if (a.choice !== q.correct) continue;
    const remaining = clamp(s.qDeadline - a.at, 0, s.cfg.timeMs);
    const pts = Math.round(1000 * (0.5 + 0.5 * remaining / s.cfg.timeMs));
    s.players[pid].score += pts;
    s.lastPoints[pid] = pts;
  }
  s.phase = 'reveal';
  s.deadline = now + s.cfg.revealMs;
}

function nextQuestion(s, now) {
  s.idx += 1;
  if (s.idx >= s.questions.length) { s.phase = 'final'; s.deadline = null; return; }
  s.phase = 'question';
  s.answers = {};
  s.lastPoints = {};
  s.qDeadline = now + s.cfg.timeMs;
  s.deadline = s.qDeadline;
}

export function handleInput(state, pid, input, now) {
  if (input.type !== 'answer') return fail('unknown_input');
  if (!state.players[pid]) return fail('unknown_player');
  if (state.phase !== 'question' || now >= state.qDeadline) return fail('wrong_phase');
  const q = state.questions[state.idx];
  if (!Number.isInteger(input.choice) || input.choice < 0 || input.choice >= q.choices.length) return fail('invalid_choice');
  if (state.answers[pid]) return fail('already_answered');
  const s = structuredClone(state);
  s.answers[pid] = { choice: input.choice, at: now };
  if (s.order.every((id) => s.answers[id])) lock(s, now);
  return ok(s);
}

export function handleHostCommand(state, cmd, now) {
  const s = structuredClone(state);
  if (cmd.type === 'start') {
    if (s.phase !== 'lobby') return fail('wrong_phase');
    if (!s.order.length) return fail('no_players');
    if (!s.questions.length) return fail('no_questions');
    nextQuestion(s, now);
    return ok(s);
  }
  if (cmd.type === 'skip') {
    if (s.phase === 'question') lock(s, now);
    else if (s.phase === 'reveal') nextQuestion(s, now);
    else return fail('wrong_phase');
    return ok(s);
  }
  return fail('unknown_command');
}

export function handleTimer(state, now) {
  if (state.deadline == null || now < state.deadline) return null;
  const s = structuredClone(state);
  if (s.phase === 'question') lock(s, now);
  else if (s.phase === 'reveal') nextQuestion(s, now);
  else return null;
  return ok(s);
}

const ranking = (s) => s.order.map((id) => ({ id, name: s.players[id].name, score: s.players[id].score }))
  .sort((a, b) => b.score - a.score);
const timer = (s) => (s.deadline == null ? null : { deadline: s.deadline, totalMs: s.phase === 'question' ? s.cfg.timeMs : s.cfg.revealMs });

export function getDisplayView(s) {
  const q = s.questions[s.idx];
  if (s.phase === 'lobby') {
    return { phase: 'lobby', title: 'Triviall', subtitle: `${s.cfg.count} questions. Join on your phone.`,
      participants: s.order.map((id) => ({ name: s.players[id].name })) };
  }
  if (s.phase === 'question') {
    const answered = Object.keys(s.answers).length;
    return { phase: 'question', title: `Question ${s.idx + 1} of ${s.questions.length}`, subtitle: q.category, body: q.prompt,
      choices: q.choices.map((label) => ({ label, state: 'neutral' })), timer: timer(s), footer: `${answered} of ${s.order.length} answered` };
  }
  if (s.phase === 'reveal') {
    const counts = q.choices.map((_, i) => Object.values(s.answers).filter((a) => a.choice === i).length);
    return { phase: 'reveal', title: `Question ${s.idx + 1} of ${s.questions.length}`, subtitle: q.category, body: q.prompt,
      choices: q.choices.map((label, i) => ({ label, state: i === q.correct ? 'correct' : 'wrong', count: counts[i] })),
      scoreboard: ranking(s).slice(0, 8), timer: timer(s) };
  }
  return { phase: 'final', title: 'Final results', scoreboard: ranking(s), footer: SOURCE_LINE[s.source] };
}

export function getPlayerView(s, pid) {
  const me = s.players[pid];
  const rank = ranking(s).findIndex((r) => r.id === pid) + 1;
  if (s.phase === 'lobby') return { phase: 'lobby', headline: `You are in, ${me.name}`, lines: ['Waiting for the host to start.'] };
  if (s.phase === 'question') {
    const q = s.questions[s.idx];
    const a = s.answers[pid];
    return { phase: 'question', headline: q.prompt, timer: timer(s),
      prompt: { kind: 'answer', label: a ? 'Answer locked in' : 'Pick one', options: q.choices.map((label, id) => ({ id, label })), submitted: !!a, chosen: a?.choice ?? null } };
  }
  if (s.phase === 'reveal') {
    const q = s.questions[s.idx];
    const a = s.answers[pid];
    const right = a && a.choice === q.correct;
    return { phase: 'reveal', tone: right ? 'good' : 'bad',
      headline: right ? `Correct! +${s.lastPoints[pid]}` : a ? 'Not this time' : 'No answer',
      lines: [`Answer: ${q.choices[q.correct]}`, `Score ${me.score}. Rank ${rank} of ${s.order.length}.`], timer: timer(s) };
  }
  return { phase: 'final', headline: `You finished ${rank} of ${s.order.length}`, lines: [`Final score ${me.score}`] };
}

export function getHostView(s) {
  const commands = s.phase === 'lobby' ? [{ id: 'start', label: 'Start game' }]
    : s.phase === 'question' ? [{ id: 'skip', label: 'Lock answers now' }]
    : s.phase === 'reveal' ? [{ id: 'skip', label: 'Next question' }] : [];
  return { phase: s.phase, title: 'Host: Trivia',
    status: [{ label: 'Phase', value: s.phase }, { label: 'Question', value: `${Math.max(0, s.idx + 1)} of ${s.questions.length}` },
      { label: 'Source', value: s.source === 'opentdb' ? 'Open Trivia Database' : 'Bundled set' }],
    players: s.order.map((id) => ({ name: s.players[id].name, tag: s.phase === 'question' && s.answers[id] ? 'answered' : '' })),
    commands, notes: s.note ? [s.note] : [] };
}

/** Lab-only helper (not a client surface): what a human reviewer would want to peek at. */
export function debug(s) {
  const q = s.questions[s.idx];
  return q ? [`Correct answer: ${q.choices[q.correct]}`] : [];
}
