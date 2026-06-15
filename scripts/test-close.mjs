#!/usr/bin/env node
// Tests for the /nb:close completion firewall (scripts/close.mjs). Dependency-free.
// Runs close against a temp .nb via NB_DIR and asserts both the verdict text AND the exit code —
// the exit code is what makes it a real firewall (NOT READY must be non-zero).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLOSE = join(ROOT, 'scripts', 'close.mjs');

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

function tmpNb() {
  const t = mkdtempSync(join(tmpdir(), 'nb-close-'));
  for (const d of ['evidence', 'reviews', 'briefs', 'decisions']) mkdirSync(join(t, d), { recursive: true });
  return t;
}
// A deep-valid decision (lib/decision.mjs): names task+kind, states what/why with substance, human approver.
const decision = (dir, kind) => writeFileSync(join(dir, 'decisions', `taska.${kind}.md`),
  `task: taska
kind: ${kind}
decision: Accept the listed open risks for this task and proceed to done.
rationale: The risks are understood and tracked as follow-ups; shipping now is acceptable for this milestone.
approved_by: tester
timestamp: 2026-06-10T00:00:00Z
`);
const run = (dir) => spawnSync('node', [CLOSE], { encoding: 'utf8', env: { ...process.env, NB_DIR: dir } });
const state = (dir, obj) => writeFileSync(join(dir, 'state.json'), JSON.stringify(obj));
const complete = (dir, extra = {}) => {
  state(dir, {
    current_task: 'taskA', current_task_slug: 'taska', current_workflow: 'standard-feature', intent_summary: 'do A',
    last_evidence: '.nb/evidence/taska.md', last_review: '.nb/reviews/taska.md', last_brief: '.nb/briefs/taska.md',
    ...extra,
  });
  writeFileSync(join(dir, 'evidence', 'taska.md'), 'e');
  writeFileSync(join(dir, 'reviews', 'taska.md'), 'r');
  writeFileSync(join(dir, 'briefs', 'taska.md'), 'b');
};

// 1) fresh / nothing -> NOT READY + non-zero (the firewall blocks)
{
  const t = tmpNb();
  const r = run(t);
  check('fresh -> NOT READY text', /NOT READY/.test(r.stdout));
  check('fresh -> exit non-zero (blocked)', r.status === 1);
  check('fresh -> lists evidence blocker', /Evidence: missing/.test(r.stdout));
  rmSync(t, { recursive: true, force: true });
}
// 2) AI says done but evidence is STALE (another task's file) -> NOT READY + blocked
{
  const t = tmpNb();
  state(t, { current_task: 'taskA', current_task_slug: 'taska', current_workflow: 'standard-feature', intent_summary: 'do A', last_evidence: '.nb/evidence/old.md' });
  writeFileSync(join(t, 'evidence', 'old.md'), 'evidence for a different task');
  const r = run(t);
  check('stale evidence -> NOT READY', /NOT READY/.test(r.stdout));
  check('stale evidence -> exit 1', r.status === 1);
  check('stale evidence -> blocker mentions stale', /Evidence: stale/.test(r.stdout));
  rmSync(t, { recursive: true, force: true });
}
// 3) all present, no open risks -> READY + exit 0
{
  const t = tmpNb();
  complete(t);
  const r = run(t);
  check('complete -> READY', /✓ READY/.test(r.stdout));
  check('complete -> exit 0', r.status === 0);
  rmSync(t, { recursive: true, force: true });
}
// 4a) open risks with NO acceptance -> NOT READY (firewall no longer waves risks through)
{
  const t = tmpNb();
  complete(t, { open_risks: ['names clamped silently', 'no rate limit'] });
  const r = run(t);
  check('unaccepted open risks -> NOT READY', /NOT READY/.test(r.stdout) && r.status === 1);
  rmSync(t, { recursive: true, force: true });
}
// 4b) open risks accepted via a decision artifact -> READY WITH RISKS + exit 0
{
  const t = tmpNb();
  complete(t, { open_risks: ['names clamped silently', 'no rate limit'] });
  decision(t, 'risks-accepted');
  const r = run(t);
  check('accepted open risks -> READY WITH RISKS', /READY WITH RISKS/.test(r.stdout));
  check('accepted open risks -> exit 0', r.status === 0);
  rmSync(t, { recursive: true, force: true });
}
// 5) missing only the brief -> NOT READY + blocked
{
  const t = tmpNb();
  complete(t);
  rmSync(join(t, 'briefs', 'taska.md'), { force: true });
  const r = run(t);
  check('missing brief -> NOT READY', /NOT READY/.test(r.stdout));
  check('missing brief -> exit 1', r.status === 1);
  rmSync(t, { recursive: true, force: true });
}
// 6) production refuses an env contract-source override -> CHECK ERROR exit 2 (no firewall backdoor)
{
  const t = tmpNb();
  complete(t);
  const r = spawnSync('node', [CLOSE], { encoding: 'utf8', env: { ...process.env, NB_DIR: t, NB_PACKS_DIR: '/tmp/evil-contracts' } });
  check('env contract override -> CHECK ERROR', /CHECK ERROR/.test(r.stdout));
  check('env contract override -> exit 2', r.status === 2);
  rmSync(t, { recursive: true, force: true });
}

// 7) corrupt (present-but-unparseable) state.json -> CHECK ERROR exit 2 (a judgment command must not treat a
//    garbled state as empty and proceed). A MISSING state is fine (covered by test 1).
{
  const t = tmpNb();
  writeFileSync(join(t, 'state.json'), '{ this is not valid json');
  const r = run(t);
  check('corrupt state.json -> CHECK ERROR', /CHECK ERROR/.test(r.stdout));
  check('corrupt state.json -> exit 2', r.status === 2);
  rmSync(t, { recursive: true, force: true });
}

// 8) a UTF-8 BOM on state.json (PowerShell `Set-Content -Encoding UTF8` adds one) must NOT CHECK ERROR —
//    a BOM is benign encoding, not a trust failure; readers strip it. (Surfaced by the Codex Generic dogfood.)
{
  const t = tmpNb();
  complete(t);
  const BOM = String.fromCharCode(0xFEFF);
  writeFileSync(join(t, 'state.json'), BOM + readFileSync(join(t, 'state.json'), 'utf8'));
  const r = run(t);
  check('BOM-prefixed state parses (not CHECK ERROR) -> READY', /✓ READY/.test(r.stdout) && r.status === 0);
  rmSync(t, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
