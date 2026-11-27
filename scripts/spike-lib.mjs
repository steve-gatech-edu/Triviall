// Pure helpers for the spike recorder, kept separate so they can be unit tested.
export const START = '<!-- auto:start -->';
export const END = '<!-- auto:end -->';

/** Classifies an unauthenticated fetch of the forwarded URL. */
export function classifyFetch(status, body = '') {
  if (status >= 300 && status < 400) return { kind: 'auth-redirect', text: `HTTP ${status}: redirected, likely to a GitHub sign-in` };
  if (status === 401 || status === 403 || status === 404) return { kind: 'auth-required', text: `HTTP ${status}: port is private or not forwarded` };
  if (status === 200 && /Triviall/.test(body)) return { kind: 'public-ok', text: 'HTTP 200 and the Triviall page loaded with no sign-in or interstitial' };
  const title = (body.match(/<title>([^<]{0,80})/i) || [])[1] ?? 'no title';
  return { kind: 'other', text: `HTTP ${status} but not the Triviall page (title: ${title.trim()})` };
}

export const ICON = { pass: 'PASS', fail: 'FAIL', info: 'INFO', skipped: 'SKIPPED' };

export function renderBlock(run, history) {
  const rows = Object.entries(run.checks).map(([id, c]) => `| ${id} | ${ICON[c.status]} | ${c.summary} |`).join('\n');
  const hist = history.slice(-10).reverse().map((r) =>
    `| ${r.at} | ${r.csId ?? 'local'} | ${Object.entries(r.checks).map(([k, c]) => `${k}:${ICON[c.status]}`).join(' ')} |`).join('\n');
  return `${START}
## Automated results (latest run)

Written by \`scripts/spike.mjs\` on every Codespace start. Run \`make spike\` to refresh. Do not edit between the markers; edits are overwritten.

Run at ${run.at}. Environment: ${run.inCodespace ? 'GitHub Codespace' : 'not a Codespace (Codespace checks skipped)'}, Node ${run.node}.

| Check | Result | What was observed |
| --- | --- | --- |
${rows}

Limits: these checks run from inside the Codespace. They cannot prove that a phone on cellular can load the page, and they do not cover the server, Cast, or devices. Use the manual table below for those.

### Run history (newest first)

| When (UTC) | Codespace id | Results |
| --- | --- | --- |
${hist}
${END}`;
}

export function replaceBlock(md, block) {
  const a = md.indexOf(START), b = md.indexOf(END);
  if (a >= 0 && b > a) return md.slice(0, a) + block + md.slice(b + END.length);
  return md.trimEnd() + '\n\n' + block + '\n';
}
