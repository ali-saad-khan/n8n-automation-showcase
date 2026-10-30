// Copies the static viewer to dist-demo/ (no bundler). Output uses only relative URLs.
import { cpSync, rmSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, [join(root, 'scripts/build-data.mjs')], { stdio: 'inherit' });
const out = join(root, 'dist-demo');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'docs'), out, { recursive: true });

// sanity: no absolute or external URLs in the HTML/CSS entry files
for (const f of ['index.html', 'viewer.css']) {
  const t = readFileSync(join(out, f), 'utf8');
  const bad = t.match(/(?:src|href)="(?:https?:)?\/[^"]*"|url\((?:https?:)?\/[^)]*\)/g);
  if (bad) { console.error('absolute URL found in', f, bad); process.exit(1); }
}
const count = (d) => readdirSync(d).reduce((n, e) => n + (statSync(join(d, e)).isDirectory() ? count(join(d, e)) : 1), 0);
console.log(`dist-demo ready: ${count(out)} files`);
