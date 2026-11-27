import { LocalRoom } from '../packages/room/index.js';
import { findLeaks } from '../packages/game-sdk/index.js';
import { renderDisplay, renderPlayer, renderHost, tickTimers } from '../packages/ui-kit/index.js';
import * as trivia from '../games/trivia/index.js';
import * as werewolves from '../games/werewolves/index.js';
import { loadQuestions } from '../games/trivia/opentdb.js';
import { FALLBACK_QUESTIONS } from '../games/trivia/fallback.js';

const GAMES = { trivia, werewolves };
const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lea', 'Max', 'Nia', 'Oz'];
const FAST = {
  trivia: { timeMs: 10000, revealMs: 3500 },
  werewolves: { revealMs: 4000, nightMs: 10000, dawnMs: 3500, discussMs: 15000, voteMs: 12000, verdictMs: 3500 },
};
const $ = (s) => document.querySelector(s);
let ctx = null, dirty = false, toastTimer;

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

async function newRoom() {
  const key = $('#game').value, game = GAMES[key];
  const count = Math.max(game.manifest.minPlayers, Math.min(game.manifest.maxPlayers, +$('#count').value || game.manifest.minPlayers));
  $('#count').value = count;
  let content = null;
  if (key === 'trivia') {
    $('#status').textContent = $('#live').checked ? 'Fetching questions from the Open Trivia Database…' : '';
    content = $('#live').checked
      ? await loadQuestions({ amount: 20, retries: 1, timeoutMs: 6000 })
      : { questions: FALLBACK_QUESTIONS.slice(0, 20), source: 'fallback', note: 'Live fetch is off, so this room uses the bundled set.' };
    $('#status').textContent = content.source === 'opentdb' ? 'Using live Open Trivia Database questions.' : `Using the bundled question set. ${content.note}`.trim();
  } else $('#status').textContent = '';
  const room = new LocalRoom(game, { config: $('#fast').checked ? FAST[key] : {}, content, seed: $('#seed').value || 1 });
  const ids = NAMES.slice(0, count).map((n) => room.join(n));
  room.subscribe(() => { dirty = true; });
  ctx = { room, game, ids, selected: ids[0] };
  dirty = true;
}

function view(role, id) { return ctx.room.view(role, id); }

function render() {
  const { room, game } = ctx;
  $('#display').innerHTML = renderDisplay(view('display'));
  $('#host').innerHTML = renderHost(view('host'));
  $('#phone').innerHTML = renderPlayer(view('player', ctx.selected));
  $('#seats').innerHTML = ctx.ids.map((id) => {
    const v = view('player', id), todo = v.prompt && !v.prompt.submitted;
    return `<button class="seat${id === ctx.selected ? ' sel' : ''}${todo ? ' todo' : ''}" data-seat="${id}">${room.players.get(id).name}</button>`;
  }).join('');
  const which = $('#inspect').value;
  const shown = which === 'player' ? view('player', ctx.selected) : view(which);
  $('#json').textContent = JSON.stringify(shown, null, 2);
  const leaks = findLeaks(view('display'), { keys: game.secretKeys });
  const el = $('#leak');
  el.className = `leak ${leaks.length ? 'bad' : 'ok'}`;
  el.textContent = leaks.length ? `Leak: ${leaks.join(', ')}` : 'Display payload: no secret fields';
  const god = $('#god').checked;
  $('#godout').hidden = !god;
  if (god) $('#godout').textContent = game.debug(room.state).join('\n') || '(nothing hidden right now)';
}

function botsStep() {
  const mode = $('#bots').value;
  if (!ctx || mode === 'off') return;
  for (const id of ctx.ids) {
    if (mode === 'others' && id === ctx.selected) continue;
    const p = view('player', id).prompt;
    if (p && !p.submitted && p.options.length && Math.random() < 0.45) {
      ctx.room.input(id, { type: p.kind, choice: p.options[Math.floor(Math.random() * p.options.length)].id }, crypto.randomUUID());
    }
  }
}

document.addEventListener('click', (e) => {
  if (!ctx) return;
  const t = e.target.closest('[data-input],[data-cmd],[data-seat]');
  if (!t) return;
  let r;
  if (t.dataset.input) r = ctx.room.input(ctx.selected, JSON.parse(t.dataset.input), crypto.randomUUID());
  else if (t.dataset.cmd) r = ctx.room.command({ type: t.dataset.cmd });
  else { ctx.selected = t.dataset.seat; dirty = true; }
  if (r?.error) toast(`Not allowed: ${r.error.replace(/_/g, ' ')}`);
});
for (const id of ['#inspect', '#god']) document.querySelector(id).addEventListener('change', () => { dirty = true; });
$('#game').addEventListener('change', () => {
  const g = GAMES[$('#game').value];
  $('#count').min = g.manifest.minPlayers; $('#count').max = g.manifest.maxPlayers;
  $('#count').value = g.manifest.minPlayers === 1 ? 4 : 7;
  $('#liveRow').style.display = $('#game').value === 'trivia' ? '' : 'none';
});
$('#start').addEventListener('click', async () => { $('#start').disabled = true; try { await newRoom(); } finally { $('#start').disabled = false; } });

setInterval(() => { if (ctx) { ctx.room.tick(); botsStep(); } }, 400);
(function frame() {
  if (ctx) {
    if (dirty) { dirty = false; render(); }
    const now = ctx.room.now();
    tickTimers($('#display'), now); tickTimers($('#phone'), now);
  }
  requestAnimationFrame(frame);
})();
newRoom();
