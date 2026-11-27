// Open Trivia Database client. Behavior follows https://opentdb.com/api_config.php (checked Nov 26, 2026):
// max 50 questions per call, one category per call, one request per IP every 5 seconds (response code 5),
// response codes 0 to 5, url3986 encoding available. Questions are CC BY-SA 4.0: show attribution.
import { FALLBACK_QUESTIONS } from './fallback.js';

export const ATTRIBUTION = 'Questions from the Open Trivia Database (opentdb.com), licensed CC BY-SA 4.0.';
const BASE = 'https://opentdb.com/api.php';
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function buildUrl({ amount = 20, category, difficulty, type } = {}) {
  const p = new URLSearchParams({ amount: String(Math.max(1, Math.min(50, amount))) });
  if (category) p.set('category', String(category));
  if (difficulty) p.set('difficulty', difficulty);
  if (type) p.set('type', type);
  p.set('encode', 'url3986');
  return `${BASE}?${p}`;
}

export function decodeResults(json) {
  return json.results.map((r) => ({
    category: dec(r.category), type: r.type, difficulty: r.difficulty,
    prompt: dec(r.question), correctAnswer: dec(r.correct_answer), incorrectAnswers: r.incorrect_answers.map(dec),
  }));
}

/**
 * Fetches questions once per game. On any failure it returns the bundled set and says why.
 * Never throws, so a bad network cannot block a lobby.
 */
export async function loadQuestions({
  amount = 20, fetchFn = globalThis.fetch, retries = 2, backoffMs = 5000, timeoutMs = 8000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ...filters
} = {}) {
  const url = buildUrl({ amount, ...filters });
  let note = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: ctl?.signal });
      const json = res.status === 429 ? { response_code: 5 } : await res.json();
      if (json.response_code === 0 && json.results?.length) {
        return { questions: decodeResults(json), source: 'opentdb', attribution: ATTRIBUTION, note: '' };
      }
      note = `Open Trivia Database returned response code ${json.response_code}`;
      if (json.response_code === 5 && attempt < retries) { await sleep(backoffMs); continue; }
      break;
    } catch (e) {
      note = `Open Trivia Database unreachable (${e.message})`;
      if (attempt < retries) { await sleep(backoffMs); continue; }
    } finally { clearTimeout(timer); }
    break;
  }
  return { questions: FALLBACK_QUESTIONS.slice(0, amount), source: 'fallback', attribution: null, note };
}
