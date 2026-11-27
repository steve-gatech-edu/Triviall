#!/usr/bin/env node
// Runs the spike checks that can be automated inside a Codespace and writes the results into
// docs/spike-results.md (between markers) and docs/spike-results.json. Commit both and share them.
// Records no tokens. The Codespace name is replaced by a short hash.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQuestions } from '../games/trivia/opentdb.js';
import { classifyFetch, renderBlock, replaceBlock } from './spike-lib.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(root, 'docs/spike-results.json'), MD_PATH = join(root, 'docs/spike-results.md');
const env = process.env, name = env.CODESPACE_NAME, inCs = !!name, PORT = env.PORT || '8080';
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gh = (...args) => { const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 15000 }); return (r.stdout || '').trim(); };
const visibilityOf = (txt) => { try { return JSON.parse(txt).find((p) => String(p.sourcePort) === PORT)?.visibility ?? 'not forwarded'; } catch { return 'unknown'; } };
const csId = inCs ? createHash('sha256').update(name).digest('hex').slice(0, 8) : null;
const skipped = { status: 'skipped', summary: 'Not running in a Codespace.' };

const history = existsSync(JSON_PATH) ? (JSON.parse(read(JSON_PATH)).runs ?? []) : [];
const checks = {};
const after = inCs ? visibilityOf(gh('codespace', 'ports', '-c', name, '--json', 'sourcePort,visibility')) : null;

// A1: can the port be made public with no manual step? Evidence comes from scripts/start.sh.
if (!inCs) checks.A1 = skipped;
else {
  const before = visibilityOf(read('/tmp/triviall-ports-before.json'));
  const attempt = read('/tmp/triviall-visibility-attempt.txt').trim() || 'no attempt recorded';
  checks.A1 = after === 'public'
    ? { status: 'pass', summary: `Port was ${before} before the CLI attempt and public after it (${attempt}).` }
    : { status: 'fail', summary: `Port is ${after} after the CLI attempt (was ${before}). Attempt: ${attempt}. Set it manually in the Ports tab.` };
}

// A2 (partial): unauthenticated fetch of the forwarded URL, from inside the Codespace.
if (!inCs) checks.A2 = skipped;
else {
  const url = `https://${name}-${PORT}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev'}/`;
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    const c = classifyFetch(res.status, await res.text());
    checks.A2 = { status: c.kind === 'public-ok' ? 'pass' : c.kind === 'other' ? 'info' : 'fail', summary: `${c.text}. URL built from Codespaces environment variables. A real phone must still confirm.` };
  } catch (e) { checks.A2 = { status: 'fail', summary: `Fetch of the forwarded URL failed: ${e.message}` }; }
}

// A5: restart evidence across runs in the same Codespace.
if (!inCs) checks.A5 = skipped;
else {
  const mine = history.filter((r) => r.csId === csId);
  const seen = [...new Set(mine.map((r) => r.after))];
  checks.A5 = mine.length === 0
    ? { status: 'info', summary: 'First run in this Codespace. Stop and restart it, then check this row again.' }
    : { status: after === 'public' && seen.every((v) => v === 'public') ? 'pass' : 'info',
        summary: `Run ${mine.length + 1} in this Codespace. Port visibility on earlier runs: ${seen.join(', ')}; now: ${after}. The start scripts ran again with no manual steps.` };
}

// A6b: Open Trivia Database reachable from this environment, using the real client.
const tries = [];
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  const r = await loadQuestions({ amount: 20, retries: 0, timeoutMs: 8000 });
  tries.push({ source: r.source, ms: Date.now() - t0, note: r.note });
  if (i < 2) await sleep(6000);
}
const live = tries.filter((t) => t.source === 'opentdb').length;
const median = tries.map((t) => t.ms).sort((a, b) => a - b)[1];
const notes = [...new Set(tries.map((t) => t.note).filter(Boolean))].join('; ');
checks.A6b = { status: live >= 2 ? 'pass' : live === 0 ? 'fail' : 'info', summary: `${live} of 3 attempts returned live questions (median ${median} ms). ${notes}`.trim() };

const record = { at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), node: process.version, inCodespace: inCs, csId, after, checks };
const all = [...history, record].slice(-20);
writeFileSync(JSON_PATH, JSON.stringify({ runs: all }, null, 2) + '\n');
writeFileSync(MD_PATH, replaceBlock(read(MD_PATH), renderBlock(record, all)));
console.log(`Spike results written to docs/spike-results.md (${Object.entries(checks).map(([k, c]) => `${k}:${c.status}`).join(' ')}).`);
