#!/usr/bin/env node
// Tests for harness-score: readiness must be task-aware and immune to stale artifacts.
// Dependency-free. Runs harness-score against a temp .nb via the NB_DIR env var.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCORE = join(ROOT, 'scripts', 'harness-score.mjs');

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

function tmpNb() {
  const t = mkdtempSync(join(tmpdir(), 'nb-score-'));
  for (const d of ['evidence', 'reviews', 'briefs']) mkdirSync(join(t, d), { recursive: true });
  return t;
}
const run = (dir) => spawnSync('node', [SCORE], { encoding: 'utf8', env: { ...process.env, NB_DIR: dir } }).stdout || '';
const state = (dir, obj) => writeFileSync(join(dir, 'state.json'), JSON.stringify(obj));

// 1) fresh / no state
{
  const t = tmpNb();
  const out = run(t);
  check('fresh -> NOT READY', /NOT READY/.test(out));
  check('fresh -> evidence missing', /Evidence: missing/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 2) state present but no artifacts
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A' });
  const out = run(t);
  check('state-only -> Plan yes', /Plan: yes/.test(out));
  check('state-only -> Intent yes', /Intent: yes/.test(out));
  check('state-only -> Evidence missing', /Evidence: missing/.test(out));
  check('state-only -> NOT READY', /NOT READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 3) stale artifacts from a different task
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A' });
  writeFileSync(join(t, 'evidence', 'old-task.md'), 'old');
  const out = run(t);
  check('stale evidence -> stale', /Evidence: stale/.test(out));
  check('stale -> NOT READY', /NOT READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 4) current artifacts match state
{
  const t = tmpNb();
  state(t, {
    current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A',
    last_evidence: '.nb/evidence/taskA.md', last_review: '.nb/reviews/taskA.md', last_brief: '.nb/briefs/taskA.md',
  });
  writeFileSync(join(t, 'evidence', 'taskA.md'), 'e');
  writeFileSync(join(t, 'reviews', 'taskA.md'), 'r');
  writeFileSync(join(t, 'briefs', 'taskA.md'), 'b');
  const out = run(t);
  check('current match -> READY', /Status: READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 5) open risks shown, do not auto-fail readiness
{
  const t = tmpNb();
  state(t, {
    current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A',
    last_evidence: '.nb/evidence/taskA.md', last_review: '.nb/reviews/taskA.md', last_brief: '.nb/briefs/taskA.md',
    open_risks: ['r1', 'r2'],
  });
  writeFileSync(join(t, 'evidence', 'taskA.md'), 'e');
  writeFileSync(join(t, 'reviews', 'taskA.md'), 'r');
  writeFileSync(join(t, 'briefs', 'taskA.md'), 'b');
  const out = run(t);
  check('open risks counted', /Open risks: 2/.test(out));
  check('open risks do not block readiness', /Status: READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}

// 6) pointer file exists but filename doesn't match current task -> stale
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A', last_evidence: '.nb/evidence/old-task.md' });
  writeFileSync(join(t, 'evidence', 'old-task.md'), 'unrelated content');
  const out = run(t);
  check('pointer mismatched filename -> Evidence stale', /Evidence: stale/.test(out));
  check('pointer mismatch -> NOT READY', /NOT READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 7) pointer filename mismatch but file metadata has "Task: taskA" -> yes
{
  const t = tmpNb();
  state(t, {
    current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A',
    last_evidence: '.nb/evidence/run-2026.md', last_review: '.nb/reviews/taskA.md', last_brief: '.nb/briefs/taskA.md',
  });
  writeFileSync(join(t, 'evidence', 'run-2026.md'), 'Task: taskA\nbuild ok, 12 passed');
  writeFileSync(join(t, 'reviews', 'taskA.md'), 'r');
  writeFileSync(join(t, 'briefs', 'taskA.md'), 'b');
  const out = run(t);
  check('pointer metadata "Task: taskA" -> Evidence yes', /Evidence: yes/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 8) last_review old pointer -> stale
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A', last_review: '.nb/reviews/old.md' });
  writeFileSync(join(t, 'reviews', 'old.md'), 'old review for taskZ');
  const out = run(t);
  check('last_review old pointer -> Review stale', /Review: stale/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 9) last_brief old pointer -> stale
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_workflow: 'standard-feature', intent_summary: 'do A', last_brief: '.nb/briefs/old.md' });
  writeFileSync(join(t, 'briefs', 'old.md'), 'old brief for taskZ');
  const out = run(t);
  check('last_brief old pointer -> Brief stale', /Brief: stale/.test(out));
  rmSync(t, { recursive: true, force: true });
}
// 10) current_task_slug matches filenames -> READY
{
  const t = tmpNb();
  state(t, {
    current_task: 'Add Settings Page', current_task_slug: 'settings-page',
    current_workflow: 'standard-feature', intent_summary: 'x',
    last_evidence: '.nb/evidence/settings-page.md', last_review: '.nb/reviews/settings-page.md', last_brief: '.nb/briefs/settings-page.md',
  });
  writeFileSync(join(t, 'evidence', 'settings-page.md'), 'e');
  writeFileSync(join(t, 'reviews', 'settings-page.md'), 'r');
  writeFileSync(join(t, 'briefs', 'settings-page.md'), 'b');
  const out = run(t);
  check('current_task_slug match -> READY', /Status: READY/.test(out));
  rmSync(t, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
