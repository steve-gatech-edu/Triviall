// Shared presentation components. They turn standard view models into HTML strings, so every game
// gets the same TV display, phone controller, and host panel without writing UI of its own.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const timerHtml = (t) => (t ? `<div class="timer" data-deadline="${t.deadline}" data-total="${t.totalMs}"><i></i><b></b></div>` : '');

/** Updates every timer bar under `root`. Call on animation frames; it only reads data attributes. */
export function tickTimers(root, now) {
  root.querySelectorAll('.timer').forEach((el) => {
    const left = Math.max(0, +el.dataset.deadline - now);
    const total = +el.dataset.total || 1;
    el.firstElementChild.style.width = `${Math.min(1, left / total) * 100}%`;
    el.lastElementChild.textContent = `${Math.ceil(left / 1000)}s`;
  });
}

function scoreboard(rows) {
  const max = Math.max(1, ...rows.map((r) => r.score));
  return `<div class="board">${rows.map((r, i) => `<div><span>${i + 1}. ${esc(r.name)}</span><i style="width:${(r.score / max) * 100}%"></i><em>${r.score}</em></div>`).join('')}</div>`;
}

/** DisplayViewModel -> TV presentation. Public information only; there is nothing here to hide. */
export function renderDisplay(v) {
  const join = v.phase === 'lobby' && v.room
    ? `<div class="join"><span>Room code</span><b>${esc(v.room.code)}</b><span>${v.room.players} joined</span></div>` : '';
  const choices = v.choices ? `<ul class="choices">${v.choices.map((c) => `<li class="${esc(c.state)}"><span>${esc(c.label)}</span>${c.count != null ? `<b>${c.count}</b>` : ''}</li>`).join('')}</ul>` : '';
  const chips = v.participants?.length ? `<div class="chips">${v.participants.map((p) => `<span class="chip${p.out ? ' out' : ''}">${esc(p.name)}${p.tag ? `<small>${esc(p.tag)}</small>` : ''}</span>`).join('')}</div>` : '';
  return `<div class="stage phase-${esc(v.phase)}">
    <header><h2>${esc(v.title)}</h2>${v.subtitle ? `<p class="sub">${esc(v.subtitle)}</p>` : ''}</header>
    ${join}${v.body ? `<p class="body">${esc(v.body)}</p>` : ''}${v.announcement ? `<p class="announce">${esc(v.announcement)}</p>` : ''}
    ${choices}${v.scoreboard ? scoreboard(v.scoreboard) : ''}${chips}
    <div class="bottom">${timerHtml(v.timer)}${v.footer ? `<p class="foot">${esc(v.footer)}</p>` : ''}</div>
  </div>`;
}

/** PlayerViewModel -> phone controller. Buttons carry the input they would send. */
export function renderPlayer(v) {
  const p = v.prompt;
  const opts = p ? `<p class="label">${esc(p.label)}</p><div class="opts">${p.options.map((o) =>
    `<button class="opt${p.chosen === o.id ? ' chosen' : ''}" ${p.submitted ? 'disabled' : ''} data-input="${esc(JSON.stringify({ type: p.kind, choice: o.id }))}">${esc(o.label)}</button>`).join('')}</div>` : '';
  return `<div class="phone tone-${esc(v.tone ?? 'plain')}">${timerHtml(v.timer)}
    <p class="headline">${esc(v.headline)}</p>${(v.lines ?? []).map((l) => `<p class="line">${esc(l)}</p>`).join('')}${opts}</div>`;
}

/** HostViewModel -> admin panel. Commands carry their id; the runtime authorizes them. */
export function renderHost(v) {
  return `<div class="hostpanel"><h3>${esc(v.title)}</h3>
    <dl>${v.status.map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`).join('')}</dl>
    <ul class="roster">${v.players.map((p) => `<li${p.tag ? ' class="has-tag"' : ''}>${esc(p.name)}${p.tag ? ` <small>${esc(p.tag)}</small>` : ''}</li>`).join('')}</ul>
    <div class="cmds">${v.commands.map((c) => `<button class="btn" ${c.disabled ? 'disabled' : ''} data-cmd="${esc(c.id)}">${esc(c.label)}</button>`).join('')}</div>
    ${(v.notes ?? []).map((n) => `<p class="note">${esc(n)}</p>`).join('')}</div>`;
}
