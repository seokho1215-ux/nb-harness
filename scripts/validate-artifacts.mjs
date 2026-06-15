#!/usr/bin/env node
// Validate the artifact ledger. The committed .nb/artifacts.example.jsonl is shape-only;
// a live .nb/artifacts.jsonl (git-ignored) is fully validated. Dependency-free. NB_DIR overrides.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const TYPES = ['intent', 'evidence', 'review', 'brief', 'decision', 'session', 'log'];
const SECRET = /(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;

function rows(file) {
  const out = [];
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    try { out.push({ row: JSON.parse(t) }); } catch { out.push({ err: `line ${i + 1}: invalid JSON` }); }
  });
  return out;
}
const fileExists = (p) => existsSync(join(ROOT, p)) || existsSync(p) || existsSync(join(nb, '..', p));

const errs = [];
let checked = 0;

// 1) example: structure only (no path existence)
const example = join(nb, 'artifacts.example.jsonl');
if (existsSync(example)) {
  for (const { row, err } of rows(example)) {
    if (err) { errs.push(`example ${err}`); continue; }
    checked++;
    if (!TYPES.includes(row.type)) errs.push(`example: invalid type "${row.type}"`);
    if (!row.id || !row.task_slug || !row.path) errs.push('example: row missing id/task_slug/path');
  }
}

// 2) live ledger: full validation
const live = join(nb, 'artifacts.jsonl');
if (existsSync(live)) {
  let state = {};
  try { state = JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8')); } catch { /* none */ }
  const slug = state.current_task_slug || null;
  const have = new Set();
  for (const { row, err } of rows(live)) {
    if (err) { errs.push(`ledger ${err}`); continue; }
    checked++;
    if (!TYPES.includes(row.type)) errs.push(`ledger: invalid type "${row.type}" (${row.id})`);
    if (!row.path || !fileExists(row.path)) errs.push(`ledger: path not found: ${row.path}`);
    if (row.status === 'current' && slug && row.task_slug !== slug) errs.push(`ledger: current ${row.id} task_slug "${row.task_slug}" != state "${slug}"`);
    if (SECRET.test(row.path || '')) errs.push(`ledger: secret-like path (${row.id})`);
    try { if (row.path && SECRET.test(readFileSync(join(ROOT, row.path), 'utf8'))) errs.push(`ledger: secret in ${row.path}`); } catch { /* unreadable */ }
    if (row.status === 'current') have.add(row.type);
  }
  if (state.current_mode === 'done') {
    for (const t of ['evidence', 'review', 'brief']) if (!have.has(t)) errs.push(`ledger: state is done but no current ${t}`);
  }
}

if (errs.length) { console.log('artifacts INVALID'); errs.forEach((e) => console.log(`   - ${e}`)); process.exit(1); }
console.log(`artifacts OK (${checked} row(s) checked${existsSync(live) ? '' : '; no live ledger — state pointers in use'})`);
process.exit(0);
