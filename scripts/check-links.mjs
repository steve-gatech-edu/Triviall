// Verifies that every local link, script, stylesheet, ES module import, and #anchor in the site resolves.
// GitHub Pages serves these files as-is, so a broken relative path is a broken site.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const skip = new Set(['node_modules', '.git', 'scripts', 'tests']);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(root);

const problems = [];
const exists = (p) => existsSync(p) && (!statSync(p).isDirectory() || existsSync(join(p, 'index.html')));
const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const isRemote = (u) => /^(https?:|mailto:|data:|\/\/)/.test(u);

for (const f of files) {
  const rel = relative(root, f);
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('.html')) {
    for (const m of text.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const u = m[1];
      if (isRemote(u)) continue;
      const [path, hash] = u.split('#');
      const target = path ? resolve(dirname(f), path) : f;
      if (!exists(target)) { problems.push(`${rel}: missing ${u}`); continue; }
      if (hash) {
        const html = statSync(target).isDirectory() ? join(target, 'index.html') : target;
        if (html.endsWith('.html') && !idsOf(readFileSync(html, 'utf8')).has(hash)) problems.push(`${rel}: no anchor #${hash} in ${relative(root, html)}`);
      }
    }
  }
  if (f.endsWith('.js') || f.endsWith('.html')) {
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      if (!existsSync(resolve(dirname(f), m[1]))) problems.push(`${rel}: unresolved import ${m[1]}`);
    }
  }
}
if (!existsSync(join(root, '.nojekyll'))) problems.push('missing .nojekyll');
if (!existsSync(join(root, 'index.html'))) problems.push('missing landing page index.html');

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`site check ok: ${files.length} files`);
