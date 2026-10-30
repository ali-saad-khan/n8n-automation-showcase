// Tiny static server for docs/ (or dist-demo/ with --dist). Local preview only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', process.argv.includes('--dist') ? 'dist-demo' : 'docs');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const port = Number(process.env.PORT) || 8080;
createServer(async (req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const body = await readFile(join(root, p.endsWith('/') ? p + 'index.html' : p)); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`http://localhost:${port}/`));
