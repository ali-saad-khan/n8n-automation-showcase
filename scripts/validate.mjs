#!/usr/bin/env node
// Static validator for the workflow exports. Zero dependencies. Exit code 1 on any failure.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { META, ORDER } from './workflow-meta.mjs';
import { buildDataSource } from './build-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'workflows');
const errors = [];
const checks = new Set();
const err = (f, m) => errors.push(`${f}: ${m}`);

const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{20,}/, 'OpenAI-style key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{16,}/, 'Slack webhook URL'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT'],
  [/\bBearer\s+(?!\{\{)[A-Za-z0-9._~+/-]{20,}/, 'literal bearer token'],
  [/(?:api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9/+_-]{24,}["']/i, 'inline credential assignment'],
];
const isSticky = (n) => n.type === 'n8n-nodes-base.stickyNote';
const isTrigger = (n) => /Trigger$/.test(n.type) || n.type === 'n8n-nodes-base.webhook' || n.type === '@n8n/n8n-nodes-langchain.chatTrigger';
const isStarter = (n) => isTrigger(n); // nodes allowed to have no incoming connection

const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
if (!files.length) err('workflows/', 'no workflow files found');

for (const f of files) {
  const raw = readFileSync(join(dir, f), 'utf8');
  let w;
  try { w = JSON.parse(raw); checks.add('valid JSON'); } catch (e) { err(f, `invalid JSON: ${e.message}`); continue; }

  if (typeof w.name !== 'string' || !w.name) err(f, 'missing name');
  if (!Array.isArray(w.nodes) || !w.nodes.length) { err(f, 'nodes must be a non-empty array'); continue; }
  if (typeof w.connections !== 'object' || w.connections === null) { err(f, 'connections must be an object'); continue; }
  if (typeof w.settings !== 'object') err(f, 'missing settings');
  checks.add('schema shape (name/nodes/connections/settings)');

  const names = new Set(), ids = new Set();
  for (const n of w.nodes) {
    for (const k of ['id', 'name', 'type', 'typeVersion', 'position', 'parameters']) if (!(k in n)) err(f, `node "${n.name ?? '?'}" missing ${k}`);
    if (typeof n.typeVersion !== 'number') err(f, `node "${n.name}" typeVersion must be a number`);
    if (!Array.isArray(n.position) || n.position.length !== 2 || n.position.some((p) => typeof p !== 'number')) err(f, `node "${n.name}" bad position`);
    if (names.has(n.name)) err(f, `duplicate node name "${n.name}"`); names.add(n.name);
    if (ids.has(n.id)) err(f, `duplicate node id "${n.id}"`); ids.add(n.id);
    if (!/^(n8n-nodes-base|@n8n\/n8n-nodes-langchain)\./.test(n.type)) err(f, `node "${n.name}" is not a core node type: ${n.type}`);
    for (const [ct, c] of Object.entries(n.credentials ?? {})) if (c.id !== 'REPLACE_ME') err(f, `node "${n.name}" credential ${ct} must use placeholder id REPLACE_ME`);
  }
  checks.add('node required fields, unique names/ids, core-node types only, credential placeholders');

  const hasIn = new Set(), hasOut = new Set(), aiOut = new Set();
  for (const [src, types] of Object.entries(w.connections)) {
    if (!names.has(src)) err(f, `connection source "${src}" is not a node`);
    for (const [type, outs] of Object.entries(types)) {
      if (!Array.isArray(outs)) { err(f, `connections.${src}.${type} must be an array`); continue; }
      for (const group of outs) for (const t of group ?? []) {
        if (!names.has(t.node)) err(f, `connection ${src} -> "${t.node}": target does not exist`);
        hasIn.add(t.node); hasOut.add(src); if (type !== 'main') aiOut.add(src);
      }
    }
  }
  checks.add('all connection sources/targets exist');

  for (const n of w.nodes) {
    if (isSticky(n)) continue;
    const connected = hasIn.has(n.name) || hasOut.has(n.name);
    if (!connected) err(f, `node "${n.name}" is not connected`);
    else if (!isStarter(n) && !hasIn.has(n.name) && !aiOut.has(n.name)) err(f, `node "${n.name}" has no incoming connection and is not a trigger or AI sub-node`);
    if (isStarter(n) && !hasOut.has(n.name)) err(f, `trigger "${n.name}" has no outgoing connection`);
  }
  checks.add('no unconnected nodes (triggers, AI sub-nodes and sticky notes excepted)');

  if (!w.nodes.some(isTrigger)) err(f, 'no trigger node (needs a *Trigger, webhook or chat trigger)');
  checks.add('trigger present');

  const webhook = w.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
  if (webhook?.parameters?.responseMode === 'responseNode' && !w.nodes.some((n) => n.type === 'n8n-nodes-base.respondToWebhook')) err(f, 'webhook uses responseNode but no Respond to Webhook node exists');
  checks.add('responseNode webhooks have a Respond node');

  for (const [re, label] of SECRET_PATTERNS) if (re.test(raw)) err(f, `looks like a secret (${label})`);
  checks.add('no secret-looking strings');

  if (!META[f]) err(f, 'missing entry in scripts/workflow-meta.mjs');
  if (!ORDER.includes(f)) err(f, 'missing from ORDER in scripts/workflow-meta.mjs');
  checks.add('viewer metadata present');
}
for (const f of ORDER) if (!files.includes(f)) err(f, 'listed in workflow-meta ORDER but file missing');

// generated viewer data must be in sync with workflows/
const dataFile = join(root, 'docs/workflows-data.js');
if (!existsSync(dataFile)) err('docs/workflows-data.js', 'missing - run npm run build:data');
else if (readFileSync(dataFile, 'utf8') !== buildDataSource()) err('docs/workflows-data.js', 'stale - run npm run build:data');
checks.add('docs/workflows-data.js up to date');

console.log(`Checked ${files.length} workflow files: ${files.join(', ')}`);
console.log('Checks run:\n  - ' + [...checks].join('\n  - '));
if (errors.length) { console.error(`\n${errors.length} problem(s):\n` + errors.map((e) => '  x ' + e).join('\n')); process.exit(1); }
console.log('\nAll checks passed.');
