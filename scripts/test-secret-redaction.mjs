#!/usr/bin/env node
// M4 — secret-write guarantee (regression). NB redacts known secret patterns from the machine output it writes.
// This locks the guarantee end-to-end: the shared scrubber scrubs each canonical shape, and the real writers
// (nb-run evidence/proof/log, the attack authorization) never persist a planted secret in the clear.
// Fake secrets are BUILT AT RUNTIME so this source file holds no real-looking secret.
import { mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from './lib/proof.mjs';
import { evaluateAttack } from './lib/attack-gate.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`OK   ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

// --- unit: the shared scrubber scrubs each canonical shape (built at runtime) ---
const SK = 'sk-' + 'a'.repeat(28);
const GH = 'ghp_' + 'b'.repeat(36);
const AWS = 'AKIA' + 'C'.repeat(16);
const JWT = 'eyJabcd1234.eyJefgh5678.sIgnAtUrE9';
const DBURL = 'postgres://user:supersecretpw@db.host:5432/app';
for (const [name, val] of [['openai key', SK], ['github token', GH], ['aws key', AWS], ['jwt', JWT]]) {
  const r = redact(`leaked ${val} here`);
  check(`redact scrubs ${name}`, r.includes('[redacted]') && !r.includes(val));
}
check('redact scrubs a DB URL password', !redact(DBURL).includes('supersecretpw'));
check('redact scrubs api_key=VALUE', !redact('api_key=' + SK).includes(SK));

// --- integration: nb-run never persists a planted secret in the clear ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'nb-redact-'));
  const nb = join(tmp, '.nb');
  for (const d of ['logs', 'evidence', 'proofs']) mkdirSync(join(nb, d), { recursive: true });
  const planted = 'ghp_' + 'z'.repeat(36);
  const cmd = `echo api_key=${planted}`;
  spawnSync('node', [join(ROOT, 'scripts', 'nb-run.mjs'), '--task', 'leak-test', '--evidence', '--pack', 'data', '--proof', 'migration-up', '--cmd', cmd],
    { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
  // gather every file NB wrote and assert the planted secret appears NOWHERE in the clear, and [redacted] does
  const written = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); e.isDirectory() ? walk(p) : written.push(p); } };
  walk(nb);
  const clear = written.filter((p) => readFileSync(p, 'utf8').includes(planted));
  check('nb-run wrote artifacts', written.length >= 3);
  check('planted secret NOT in any nb-run artifact (clear text)', clear.length === 0);
  const anyRedacted = written.some((p) => readFileSync(p, 'utf8').includes('[redacted]'));
  check('nb-run artifacts contain a [redacted] marker', anyRedacted);
  rmSync(tmp, { recursive: true, force: true });
}

// --- integration: the PostToolUse hook uses the SHARED redact (Codex GATE: it used to miss JWT / DB-URL) ---
{
  const tmp = mkdtempSync(join(tmpdir(), 'nb-hookredact-'));
  mkdirSync(join(tmp, '.nb', 'logs'), { recursive: true });
  const jwt = 'eyJ' + 'a'.repeat(12) + '.eyJ' + 'b'.repeat(12) + '.' + 'c'.repeat(20); // a JWT the old inline redact missed
  const input = { cwd: tmp, tool_name: 'Bash', tool_input: { command: `curl -H "Authorization: Bearer ${jwt}" https://api.x` }, tool_response: { success: true } };
  spawnSync('node', [join(ROOT, '.claude', 'hooks', 'post-tool-use.mjs')], { input: JSON.stringify(input), encoding: 'utf8' });
  const ev = join(tmp, '.nb', 'logs', 'tool-events.jsonl');
  const txt = existsSync(ev) ? readFileSync(ev, 'utf8') : '';
  check('hook logged the command', /"cmd"/.test(txt));
  check('hook redacted the JWT (shared scrubber) — not in clear', txt.length > 0 && !txt.includes(jwt) && txt.includes('[redacted]'));
  rmSync(tmp, { recursive: true, force: true });
}

// --- integration: the attack authorization redacts secrets in its recorded fields ---
{
  const planted = 'sk-' + 'q'.repeat(28);
  const res = evaluateAttack(
    { target: 'http://localhost:3000', actions: ['curl http://localhost:3000'] },
    { consent: { ok: true, approvedBy: `Maintainer token=${planted}` }, ownership: { isCopy: true, cloneOf: `repo ${planted}`, target: 'localhost' }, allowlist: [], now: 'now' });
  const text = JSON.stringify(res.authorization);
  check('attack authorization redacts a secret in its fields', res.allowed && !text.includes(planted) && text.includes('[redacted]'));
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
