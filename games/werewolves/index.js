// Werewolves: pure, deterministic social deduction game. The runtime narrates; no human moderator needed.
// Information rules (release gate): the display and other players never receive hidden roles or night choices.
import { rng, ok, fail } from '../../packages/game-sdk/index.js';

export const manifest = {
  id: 'werewolves', name: 'Werewolves', version: '0.1.0', sdk: 1,
  minPlayers: 5, maxPlayers: 15, anonymous: true, reconnection: true, recoverable: 'phase-boundary',
};
export const defaults = { revealMs: 8000, nightMs: 20000, dawnMs: 6000, discussMs: 60000, voteMs: 30000, verdictMs: 6000, revealDead: true };
/** Keys that must never appear in a display payload. */
export const secretKeys = ['role', 'roles', 'nightChoice', 'inspect', 'protect'];

const NAMES = { werewolf: 'Werewolf', seer: 'Seer', doctor: 'Doctor', villager: 'Villager' };
const BLURB = {
  werewolf: 'Hunt in the night. Stay hidden by day.',
  seer: 'Each night, learn whether one player is a werewolf.',
  doctor: 'Each night, protect one player. Not the same player twice in a row.',
  villager: 'Find the werewolves before they find you.',
};
const NIGHT_LABEL = { werewolf: 'Choose a victim', seer: 'Inspect someone', doctor: 'Protect someone', villager: 'Choose someone to watch' };

export function roleCounts(n) {
  const werewolf = n <= 6 ? 1 : n <= 9 ? 2 : n <= 12 ? 3 : 4;
  const seer = 1;
  const doctor = n >= 7 ? 1 : 0;
  return { werewolf, seer, doctor, villager: n - werewolf - seer - doctor };
}

export function create(config = {}, { seed = 1 } = {}) {
  return { phase: 'lobby', cfg: { ...defaults, ...config }, rng: seed, players: {}, order: [], day: 0, deadline: null, totalMs: null,
    night: null, votes: {}, lastProtected: null, seerLog: {}, announce: '', verdict: null, winner: null };
}

export function join(state, { id, name }) {
  if (state.players[id]) return ok(state);
  if (state.phase !== 'lobby') return fail('game_started');
  if (state.order.length >= manifest.maxPlayers) return fail('room_full');
  const s = structuredClone(state);
  s.players[id] = { name: String(name).slice(0, 20), role: null, alive: true };
  s.order.push(id);
  return ok(s);
}

const alive = (s) => s.order.filter((id) => s.players[id].alive);
const wolvesOf = (s) => s.order.filter((id) => s.players[id].role === 'werewolf');
const enter = (s, phase, now, ms) => { s.phase = phase; s.totalMs = ms ?? null; s.deadline = ms == null ? null : now + ms; };

function winner(s) {
  const a = alive(s);
  const w = a.filter((id) => s.players[id].role === 'werewolf').length;
  if (w === 0) return 'villagers';
  return w >= a.length - w ? 'werewolves' : null;
}
function setOver(s, w) {
  s.winner = w; s.phase = 'over'; s.deadline = null; s.totalMs = null;
  s.announce = w === 'villagers' ? 'The village wins.' : 'The werewolves win.';
}
function startNight(s, now) {
  s.day += 1;
  s.night = { acted: {}, wolf: {}, seer: {}, doctor: {} };
  enter(s, 'night', now, s.cfg.nightMs);
}

function nightOptions(s, pid) {
  const p = s.players[pid], a = alive(s);
  if (p.role === 'werewolf') return a.filter((id) => s.players[id].role !== 'werewolf');
  if (p.role === 'doctor') return a.filter((id) => id !== s.lastProtected);
  return a.filter((id) => id !== pid);
}

function resolveNight(s, now) {
  const r = rng(s);
  const tally = {};
  Object.values(s.night.wolf).forEach((t) => { tally[t] = (tally[t] ?? 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((t) => tally[t] === max);
  const victim = max > 0 ? r.pick(top) : null;
  const protectedId = Object.values(s.night.doctor)[0] ?? null;
  for (const [seerId, t] of Object.entries(s.night.seer)) {
    (s.seerLog[seerId] ??= []).push({ day: s.day, name: s.players[t].name, wolf: s.players[t].role === 'werewolf' });
  }
  s.lastProtected = protectedId;
  if (victim && victim !== protectedId) {
    s.players[victim].alive = false;
    const p = s.players[victim];
    s.announce = `${p.name} was eliminated in the night.` + (s.cfg.revealDead ? ` They were a ${NAMES[p.role]}.` : '');
  } else s.announce = 'Nobody was eliminated in the night.';
  enter(s, 'dawn', now, s.cfg.dawnMs);
}

function resolveVote(s, now) {
  const r = rng(s);
  const tally = {};
  Object.values(s.votes).forEach((t) => { tally[t] = (tally[t] ?? 0) + 1; });
  const max = Math.max(0, ...Object.values(tally));
  const top = Object.keys(tally).filter((t) => tally[t] === max);
  s.verdict = Object.entries(tally).map(([id, count]) => ({ name: s.players[id].name, count })).sort((a, b) => b.count - a.count);
  if (max > 0 && top.length === 1) {
    const p = s.players[top[0]];
    p.alive = false;
    s.announce = `${p.name} was voted out.` + (s.cfg.revealDead ? ` They were a ${NAMES[p.role]}.` : '');
  } else { r.next(); s.announce = 'The vote was tied. Nobody was voted out.'; }
  enter(s, 'verdict', now, s.cfg.verdictMs);
}

/** Performs the timer action for the current phase. Used by deadlines and by the host's skip command. */
function advance(s, now) {
  switch (s.phase) {
    case 'reveal': startNight(s, now); break;
    case 'night': resolveNight(s, now); break;
    case 'dawn': { const w = winner(s); if (w) setOver(s, w); else enter(s, 'day', now, s.cfg.discussMs); break; }
    case 'day': s.votes = {}; enter(s, 'vote', now, s.cfg.voteMs); break;
    case 'vote': resolveVote(s, now); break;
    case 'verdict': { const w = winner(s); if (w) setOver(s, w); else startNight(s, now); break; }
    default: return false;
  }
  return true;
}

export function handleInput(state, pid, input, now) {
  const p = state.players[pid];
  if (!p) return fail('unknown_player');
  if (!p.alive) return fail('not_alive');
  if (input.type === 'night') {
    if (state.phase !== 'night' || now >= state.deadline) return fail('wrong_phase');
    if (state.night.acted[pid]) return fail('already_acted');
    if (!nightOptions(state, pid).includes(input.choice)) return fail('invalid_target');
    const s = structuredClone(state);
    s.night.acted[pid] = true;
    // Every role may submit, so villagers' decoy actions look the same on the wire. Only three roles have an effect.
    if (p.role === 'werewolf') s.night.wolf[pid] = input.choice;
    else if (p.role === 'seer') s.night.seer[pid] = input.choice;
    else if (p.role === 'doctor') s.night.doctor[pid] = input.choice;
    return ok(s);
  }
  if (input.type === 'vote') {
    if (state.phase !== 'vote' || now >= state.deadline) return fail('wrong_phase');
    if (state.votes[pid]) return fail('already_acted');
    if (input.choice === pid || !state.players[input.choice]?.alive) return fail('invalid_target');
    const s = structuredClone(state);
    s.votes[pid] = input.choice;
    if (alive(s).every((id) => s.votes[id])) resolveVote(s, now);
    return ok(s);
  }
  return fail('unknown_input');
}

export function handleHostCommand(state, cmd, now) {
  const s = structuredClone(state);
  if (cmd.type === 'start') {
    if (s.phase !== 'lobby') return fail('wrong_phase');
    if (s.order.length < manifest.minPlayers) return fail('not_enough_players');
    const r = rng(s);
    const c = roleCounts(s.order.length);
    const roles = r.shuffle(Object.entries(c).flatMap(([role, n]) => Array(n).fill(role)));
    s.order.forEach((id, i) => { s.players[id].role = roles[i]; });
    enter(s, 'reveal', now, s.cfg.revealMs);
    return ok(s);
  }
  if (cmd.type === 'skip') return advance(s, now) ? ok(s) : fail('wrong_phase');
  return fail('unknown_command');
}

export function handleTimer(state, now) {
  if (state.deadline == null || now < state.deadline) return null;
  const s = structuredClone(state);
  return advance(s, now) ? ok(s) : null;
}

const timer = (s) => (s.deadline == null ? null : { deadline: s.deadline, totalMs: s.totalMs });

export function getDisplayView(s) {
  const participants = s.order.map((id) => {
    const p = s.players[id];
    const showRole = s.phase === 'over' || (!p.alive && s.cfg.revealDead);
    return { name: p.name, out: !p.alive, tag: showRole ? NAMES[p.role] : !p.alive ? 'Out' : '' };
  });
  const base = { phase: s.phase, participants, timer: timer(s) };
  switch (s.phase) {
    case 'lobby': return { ...base, title: 'Werewolves', subtitle: 'Join on your phone. 5 to 15 players.' };
    case 'reveal': return { ...base, title: 'Check your phone', subtitle: 'Your role is for your eyes only.' };
    case 'night': return { ...base, title: `Night ${s.day}`, subtitle: 'Everyone, close your eyes. Act on your phone.' };
    case 'dawn': return { ...base, title: 'Dawn', announcement: s.announce };
    case 'day': return { ...base, title: `Day ${s.day}`, subtitle: 'Discuss. Who is a werewolf?', announcement: s.announce };
    case 'vote': return { ...base, title: 'Vote', subtitle: 'Choose someone on your phone.' };
    case 'verdict': return { ...base, title: 'The village has spoken', announcement: s.announce,
      choices: s.verdict.map((v) => ({ label: v.name, state: 'neutral', count: v.count })) };
    default: return { ...base, title: s.winner === 'villagers' ? 'Villagers win' : 'Werewolves win', announcement: s.announce };
  }
}

export function getPlayerView(s, pid) {
  const me = s.players[pid];
  const role = me.role;
  const t = timer(s);
  if (s.phase === 'lobby') return { phase: 'lobby', headline: `You are in, ${me.name}`, lines: ['Waiting for the host to start.'] };
  if (s.phase === 'over') {
    return { phase: 'over', headline: s.announce, lines: s.order.map((id) => `${s.players[id].name}: ${NAMES[s.players[id].role]}`) };
  }
  if (!me.alive) {
    return { phase: s.phase, tone: 'secret', headline: 'You are out', lines: [`You were a ${NAMES[role]}.`, 'Watch the rest unfold.'], timer: t };
  }
  const pack = role === 'werewolf' ? [`Your pack: ${wolvesOf(s).filter((id) => id !== pid).map((id) => s.players[id].name).join(', ') || 'you are alone'}`] : [];
  const seen = role === 'seer' ? (s.seerLog[pid] ?? []).map((x) => `Night ${x.day}: ${x.name} ${x.wolf ? 'is a werewolf' : 'is not a werewolf'}`) : [];
  if (s.phase === 'reveal') {
    return { phase: 'reveal', tone: 'secret', headline: `You are a ${NAMES[role]}`, lines: [BLURB[role], ...pack], timer: t };
  }
  if (s.phase === 'night') {
    return { phase: 'night', tone: 'secret', headline: 'Night', lines: [], timer: t,
      prompt: { kind: 'night', label: NIGHT_LABEL[role], submitted: !!s.night.acted[pid],
        options: nightOptions(s, pid).map((id) => ({ id, label: s.players[id].name })) } };
  }
  if (s.phase === 'vote') {
    return { phase: 'vote', headline: 'Who is a werewolf?', lines: [...pack, ...seen], timer: t,
      prompt: { kind: 'vote', label: 'Cast your vote', submitted: !!s.votes[pid],
        options: alive(s).filter((id) => id !== pid).map((id) => ({ id, label: s.players[id].name })) } };
  }
  return { phase: s.phase, headline: s.announce || `Day ${s.day}`, lines: [...pack, ...seen], timer: t };
}

export function getHostView(s) {
  const a = alive(s);
  const acting = s.phase === 'night' ? Object.keys(s.night.acted).length : s.phase === 'vote' ? Object.keys(s.votes).length : null;
  const commands = s.phase === 'lobby' ? [{ id: 'start', label: 'Start game', disabled: s.order.length < manifest.minPlayers }]
    : s.phase === 'over' ? [] : [{ id: 'skip', label: 'Skip this phase' }];
  return { phase: s.phase, title: 'Host: Werewolves',
    status: [{ label: 'Phase', value: s.phase }, { label: 'Day', value: String(s.day) }, { label: 'Alive', value: `${a.length} of ${s.order.length}` },
      ...(acting == null ? [] : [{ label: 'Acted', value: `${acting} of ${a.length}` }])],
    players: s.order.map((id) => ({ name: s.players[id].name, tag: s.players[id].alive ? '' : 'out' })),
    commands, notes: ['Roles are hidden from the host so the host can also play.'] };
}

/** Lab-only helper (not a client surface). */
export function debug(s) {
  return s.order.map((id) => `${s.players[id].name}: ${s.players[id].role ?? 'unassigned'}${s.players[id].alive ? '' : ' (out)'}`);
}
