import { LocalRoom } from '../packages/room/index.js';
import { FALLBACK_QUESTIONS } from '../games/trivia/fallback.js';

/** A controllable clock so tests never wait on real time. */
export function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; return t; } };
}
export function makeRoom(game, { names, seed = 7, config = {}, content = null, clock = fakeClock() } = {}) {
  const room = new LocalRoom(game, { config, content, seed, now: clock.now });
  const ids = names.map((n) => room.join(n));
  return { room, ids, clock };
}
export const triviaContent = (n = 5) => ({ questions: FALLBACK_QUESTIONS.slice(0, n), source: 'fallback', note: '' });
export const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
