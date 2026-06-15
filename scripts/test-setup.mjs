#!/usr/bin/env node
// Tests for scripts/setup.mjs — the deterministic .nb scaffold. Dependency-free.
// Drives setup against a temp .nb (NB_DIR, --no-doctor) and checks: runtime dirs + .gitkeep, a state.json
// created from the example shape (idle, no $comment, timestamped) that PASSES validate-state, idempotent
// preservation of live state, --force recreate, and the missing-example failure.
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = join(ROOT, 'scripts', 'setup.mjs');
const EXAMPLE = join(ROOT, '.nb', 'state.example.json');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
function tmpNb({ withExample = true } = {}) {
  const t = mkdtempSync(join(tmpdir(), 'nb-setup-'));
  mkdirSync(join(t, '.nb'), { recursive: true });
  if (withExample) copyFileSync(EXAMPLE, join(t, '.nb', 'state.example.json'));
  return join(t, '.nb');
}
const run = (nb, args = []) => spawnSync('node', [SETUP, ...args], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const RUNTIME = ['sessions', 'evidence', 'reviews', 'briefs', 'decisions', 'logs'];

// 1) fresh scaffold: dirs + .gitkeep, a clean idle state.json that validates.
{
  const nb = tmpNb();
  const r = run(nb, ['--no-doctor']);
  check('fresh: exit 0', r.status === 0);
  check('fresh: state.json created', existsSync(join(nb, 'state.json')));
  const s = JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8'));
  check('fresh: mode idle', s.current_mode === 'idle');
  check('fresh: updated_at is an ISO timestamp', typeof s.updated_at === 'string' && !Number.isNaN(Date.parse(s.updated_at)));
  check('fresh: $comment stripped from live state', !('$comment' in s));
  check('fresh: all runtime dirs + .gitkeep', RUNTIME.every((d) => existsSync(join(nb, d, '.gitkeep'))));
  const v = spawnSync('node', [join(ROOT, 'scripts', 'validate-state.mjs')], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
  check('fresh: generated state passes validate-state', v.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 2) idempotent: an existing (live) state.json is preserved, never clobbered.
{
  const nb = tmpNb();
  run(nb, ['--no-doctor']);
  const p = join(nb, 'state.json');
  const s = JSON.parse(readFileSync(p, 'utf8'));
  s.current_task = 'my-task'; s.current_task_slug = 'my-task'; s.current_mode = 'implement';
  writeFileSync(p, JSON.stringify(s, null, 2));
  const r = run(nb, ['--no-doctor']);
  check('idempotent: exit 0', r.status === 0);
  const s2 = JSON.parse(readFileSync(p, 'utf8'));
  check('idempotent: live task state preserved', s2.current_task === 'my-task' && s2.current_mode === 'implement');
  check('idempotent: reports "preserved"', /preserved/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 3) --force: recreate from the example even over live state.
{
  const nb = tmpNb();
  run(nb, ['--no-doctor']);
  const p = join(nb, 'state.json');
  const s = JSON.parse(readFileSync(p, 'utf8'));
  s.current_task = 'x'; s.current_mode = 'implement';
  writeFileSync(p, JSON.stringify(s, null, 2));
  const r = run(nb, ['--no-doctor', '--force']);
  check('force: exit 0', r.status === 0);
  const s2 = JSON.parse(readFileSync(p, 'utf8'));
  check('force: reset to idle, task cleared', s2.current_mode === 'idle' && !s2.current_task);
  check('force: reports "recreated"', /recreated/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// 4) missing state.example.json (NB not installed here) -> exit 2 (fail loud, no silent half-setup).
{
  const nb = tmpNb({ withExample: false });
  const r = run(nb, ['--no-doctor']);
  check('missing example -> exit 2', r.status === 2);
  check('missing example: no state.json written', !existsSync(join(nb, 'state.json')));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
