// LocalRoom: an in-memory stand-in for the future server runtime. It is the authority:
// it owns game state, applies transitions, and projects a separate view for each client role.
// It has no network code. The server milestone replaces this transport, not the contract.
import { validateInput, envelope } from '../protocol/index.js';
import { seedFrom, validateManifest } from '../game-sdk/index.js';

export class LocalRoom {
  constructor(game, { config = {}, content = null, seed = 1, now = () => Date.now(), roomId = 'LAB1' } = {}) {
    const problems = validateManifest(game.manifest);
    if (problems.length) throw new Error('Invalid manifest: ' + problems.join('; '));
    this.game = game;
    this.now = now;
    this.roomId = roomId;
    this.revision = 0;
    this.players = new Map();
    this.seen = new Map();
    this.listeners = new Set();
    this._n = 0;
    this.state = game.create(config, { seed: seedFrom(seed), content });
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _apply(result) {
    if (!result || result.error) return { error: result?.error ?? 'noop' };
    this.state = result.state;
    this.revision += 1;
    this.listeners.forEach((fn) => fn(this.revision));
    return { ok: true };
  }

  join(name) {
    const id = `p${this._n + 1}`;
    const r = this._apply(this.game.join(this.state, { id, name }));
    if (r.error) throw new Error(`join failed: ${r.error}`);
    this._n += 1;
    this.players.set(id, { id, name });
    return id;
  }

  /** Player input. `inputId` makes delivery idempotent: a repeated id is acknowledged but not re-applied. */
  input(playerId, input, inputId) {
    const bad = validateInput(input);
    if (bad) return { error: bad };
    if (!this.players.has(playerId)) return { error: 'unknown_player' };
    const seen = this.seen.get(playerId) ?? new Set();
    if (inputId && seen.has(inputId)) return { ok: true, duplicate: true };
    const r = this._apply(this.game.handleInput(this.state, playerId, input, this.now()));
    if (r.ok && inputId) { seen.add(inputId); this.seen.set(playerId, seen); }
    return r;
  }

  command(cmd) {
    const bad = validateInput(cmd);
    if (bad) return { error: bad };
    return this._apply(this.game.handleHostCommand(this.state, cmd, this.now()));
  }

  /** Fires any due timers (several phases can be overdue after a long pause). */
  tick() {
    let changed = false;
    for (let i = 0; i < 8; i++) {
      const r = this.game.handleTimer(this.state, this.now());
      if (!r) break;
      this._apply(r);
      changed = true;
    }
    return changed;
  }

  view(role, playerId) {
    const g = this.game, s = this.state;
    let payload;
    if (role === 'host') payload = g.getHostView(s);
    else if (role === 'display') payload = g.getDisplayView(s);
    else if (role === 'player') {
      if (!this.players.has(playerId)) throw new Error('unknown player');
      payload = g.getPlayerView(s, playerId);
    } else throw new Error(`unknown role ${role}`);
    return { ...payload, room: { code: this.roomId, players: this.players.size } };
  }

  snapshot(role, playerId) {
    return envelope({ roomId: this.roomId, revision: this.revision, role, payload: this.view(role, playerId), at: this.now() });
  }
}
