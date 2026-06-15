#!/usr/bin/env node
// Tests for scripts/nb-run.mjs — the Generic-mode trusted execution path. Dependency-free.
// Drives nb-run against a temp .nb (NB_DIR) and checks: exit-code propagation, the trusted log event
// (run_id + output_sha256 + source), evidence + proof writing, and that the GENERATED proof actually
// verifies against the logged run via verifyProof (run_id binding) — and that tampering breaks it.
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyProof, loadEvents } from './lib/proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NBRUN = join(ROOT, 'scripts', 'nb-run.mjs');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
function tmpNb() { const t = mkdtempSync(join(tmpdir(), 'nb-run-')); for (const d of ['logs', 'evidence', 'proofs']) mkdirSync(join(t, '.nb', d), { recursive: true }); return join(t, '.nb'); }
const run = (nb, args) => spawnSync('node', [NBRUN, ...args], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });

// 1) success: exit 0 propagated; log event bound; evidence + proof written; the generated proof VERIFIES.
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 'clamp', '--evidence', '--pack', 'testing', '--proof', 'verify', '--cmd', 'node --version']);
  check('exit 0 propagated', r.status === 0);
  const events = loadEvents(nb);
  check('log event: run_id + output_sha256 + source:nb-run + ok', events.length === 1 && !!events[0].run_id && !!events[0].output_sha256 && events[0].source === 'nb-run' && events[0].ok === true);
  check('evidence written', existsSync(join(nb, 'evidence', 'clamp.md')));
  const pp = join(nb, 'proofs', 'clamp.testing.verify.json');
  check('proof written', existsSync(pp));
  const proof = JSON.parse(readFileSync(pp, 'utf8'));
  check('generated proof carries run_id + output_sha256 + exit 0', !!proof.run_id && !!proof.output_sha256 && proof.exit_code === 0);
  check('generated proof VERIFIES against the logged run', verifyProof(proof, { task_slug: 'clamp', pack: 'testing' }, events).ok === true);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 1b) QUOTED command preserved (the C3 fix): a command with quotes+spaces runs verbatim via --cmd.
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 'q', '--pack', 'testing', '--proof', 'verify', '--cmd', 'node -e "console.log(1 + 2)"']);
  check('quoted command runs (exit 0)', r.status === 0);
  check('quoted command produced 3', /(^|\D)3(\D|$)/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 1c) SILENT success (regression): a command that exits 0 with NO output must still self-verify — an empty
// excerpt would trip the verifier's stub guard and fail nb-run's own generated proof.
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 'silent', '--pack', 'testing', '--proof', 'verify', '--cmd', 'node --version > NUL']);
  check('silent success: exit 0 propagated', r.status === 0);
  const events = loadEvents(nb);
  const proof = JSON.parse(readFileSync(join(nb, 'proofs', 'silent.testing.verify.json'), 'utf8'));
  check('silent success: excerpt is non-stub synthetic marker', /no output captured/.test(proof.output_excerpt) && proof.output_excerpt.length > 0);
  check('silent success: generated proof VERIFIES (no stub regression)', verifyProof(proof, { task_slug: 'silent', pack: 'testing' }, events).ok === true);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 2) failing command: non-zero exit propagated; logged ok:false; the proof does NOT verify (command failed).
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 't', '--pack', 'testing', '--proof', 'verify', '--cmd', 'exit 3']);
  check('non-zero exit propagated', r.status === 3);
  const events = loadEvents(nb);
  check('failed run logged ok:false', !!events[0] && events[0].ok === false);
  const proof = JSON.parse(readFileSync(join(nb, 'proofs', 't.testing.verify.json'), 'utf8'));
  check('failed proof exit_code=3', proof.exit_code === 3);
  check('failed proof does NOT verify', verifyProof(proof, { task_slug: 't', pack: 'testing' }, events).ok === false);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 3) tamper: forged run_id, tampered hash, AND a run_id proof MISSING the hash are all rejected (strict binding).
{
  const nb = tmpNb();
  run(nb, ['--task', 't', '--pack', 'testing', '--proof', 'verify', '--cmd', 'node --version']);
  const events = loadEvents(nb);
  const proof = JSON.parse(readFileSync(join(nb, 'proofs', 't.testing.verify.json'), 'utf8'));
  const ctx = { task_slug: 't', pack: 'testing' };
  check('forged run_id -> blocked', verifyProof({ ...proof, run_id: 'deadbeef-not-in-log' }, ctx, events).ok === false);
  check('tampered output_sha256 -> blocked', verifyProof({ ...proof, output_sha256: '0'.repeat(64) }, ctx, events).ok === false);
  const noHash = { ...proof }; delete noHash.output_sha256;
  check('run_id proof missing output_sha256 -> blocked (strict)', verifyProof(noHash, ctx, events).ok === false);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 4) usage error (no --cmd) -> exit 2
{ const nb = tmpNb(); const r = run(nb, ['--task', 't']); check('no command -> exit 2', r.status === 2); rmSync(resolve(nb, '..'), { recursive: true, force: true }); }

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
