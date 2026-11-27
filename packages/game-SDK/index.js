// Game SDK helpers: seeded RNG that lives inside serializable state, transition helpers,
// manifest validation, and a leak detector used by tests and the lab.
import { SDK_VERSION } from '../protocol/index.js';

export function seedFrom(input) {
  if (typeof input === 'number') return (input >>> 0) || 1;
  let h = 2166136261;
  for (const ch of String(input)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}

/** Deterministic RNG. Its only state is `state.rng` (a uint32), so game state stays JSON-serializable. */
export function rng(state) {
  const next = () => {
    state.rng = (state.rng + 0x6d2b79f5) >>> 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (arr) => arr[int(arr.length)];
  const shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = int(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  return { next, int, pick, shuffle };
}

export const ok = (state) => ({ state });
export const fail = (error) => ({ error });

export function validateManifest(m) {
  const problems = [];
  if (!m || typeof m !== 'object') return ['manifest missing'];
  for (const k of ['id', 'name', 'version']) if (typeof m[k] !== 'string' || !m[k]) problems.push(`${k} required`);
  if (m.sdk !== SDK_VERSION) problems.push(`sdk must be ${SDK_VERSION}, got ${m.sdk}`);
  if (!Number.isInteger(m.minPlayers) || !Number.isInteger(m.maxPlayers) || m.minPlayers < 1 || m.maxPlayers < m.minPlayers) {
    problems.push('player limits invalid');
  }
  return problems;
}

/** Walks a view and reports any banned key or string value. Returns a list of paths. */
export function findLeaks(view, { keys = [], values = [] } = {}) {
  const hits = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (keys.includes(k)) hits.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
    } else if (typeof node === 'string' && values.some((x) => node.includes(x))) hits.push(path);
  };
  walk(view, '$');
  return hits;
}
