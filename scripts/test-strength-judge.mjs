#!/usr/bin/env node
// Tests for scripts/strength-judge.mjs + the validate-state strength rule. Dependency-free.
// Drives the judge against a temp .nb (NB_DIR) and checks: persist to design, the safety FLOOR can only
// RAISE strength (never lower), workflow validation/inference, declared/implied packs, bad input -> exit 2,
// and that validate-state now REQUIRES strength_level once a task is in flight.
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SJ = join(ROOT, 'scripts', 'strength-judge.mjs');
const VS = join(ROOT, 'scripts', 'validate-state.mjs');
const EXAMPLE = join(ROOT, '.nb', 'state.example.json');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
function tmpNb() {
  const t = mkdtempSync(join(tmpdir(), 'nb-sj-'));
  mkdirSync(join(t, '.nb'), { recursive: true });
  copyFileSync(EXAMPLE, join(t, '.nb', 'state.example.json'));
  return join(t, '.nb');
}
const run = (nb, args) => spawnSync('node', [SJ, ...args], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const vstate = (nb) => spawnSync('node', [VS], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const readState = (nb) => JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8'));
const rm = (nb) => rmSync(resolve(nb, '..'), { recursive: true, force: true });

// 1) basic: light task persists to design + passes validate-state.
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 'add-thing', '--strength', 'light', '--workflow', 'light-change']);
  check('basic: exit 0', r.status === 0);
  const s = readState(nb);
  check('basic: mode -> design', s.current_mode === 'design');
  check('basic: strength light', s.strength_level === 'light');
  check('basic: workflow light-change', s.current_workflow === 'light-change');
  check('basic: validate-state passes', vstate(nb).status === 0);
  rm(nb);
}

// 2) safety floor RAISES light -> full on an auth task, workflow -> security-sensitive, security pack implied.
{
  const nb = tmpNb();
  const r = run(nb, ['--task', 'add login auth flow', '--strength', 'light']);
  const s = readState(nb);
  check('floor: raised light -> full (auth)', s.strength_level === 'full');
  check('floor: workflow security-sensitive', s.current_workflow === 'security-sensitive');
  check('floor: reports "raised"', /raised/.test(r.stdout));
  check('floor: security pack implied', Array.isArray(s.declared_packs) && s.declared_packs.includes('security'));
  rm(nb);
}

// 3) --categories forces the floor even when the text is innocuous.
{
  const nb = tmpNb();
  run(nb, ['--task', 'tweak the ui copy', '--strength', 'light', '--categories', 'payment']);
  check('category: payment -> full', readState(nb).strength_level === 'full');
  rm(nb);
}

// 4) bad input -> exit 2 (loud).
{
  const nb = tmpNb();
  check('invalid strength -> exit 2', run(nb, ['--task', 'x', '--strength', 'huge']).status === 2);
  check('invalid workflow -> exit 2', run(nb, ['--task', 'x', '--workflow', 'nope']).status === 2);
  check('no --task -> exit 2', run(nb, ['--strength', 'light']).status === 2);
  rm(nb);
}

// 5) default = full when the AI names no level (core/strength.md), infers full-feature.
{
  const nb = tmpNb();
  run(nb, ['--task', 'build a normal thing']);
  const s = readState(nb);
  check('default: strength full', s.strength_level === 'full');
  check('default: workflow full-feature', s.current_workflow === 'full-feature');
  rm(nb);
}

// 6) standard, no floor -> standard-feature inferred.
{
  const nb = tmpNb();
  run(nb, ['--task', 'add a plain list view', '--strength', 'standard']);
  check('standard: workflow standard-feature', readState(nb).current_workflow === 'standard-feature');
  rm(nb);
}

// 7) validate-state REQUIRES strength AND workflow once in flight (the binding).
{
  const nb = tmpNb();
  writeFileSync(join(nb, 'state.json'), JSON.stringify({ current_mode: 'design', current_task: 't', current_task_slug: 't' }));
  check('design w/o strength -> validate-state FAIL', vstate(nb).status === 1);
  // strength present but workflow absent must ALSO fail.
  writeFileSync(join(nb, 'state.json'), JSON.stringify({ current_mode: 'design', current_task: 't', current_task_slug: 't', strength_level: 'standard' }));
  check('design w/ strength but no workflow -> validate-state FAIL', vstate(nb).status === 1);
  run(nb, ['--task', 't', '--strength', 'standard']);
  check('after strength-judge -> validate-state OK', vstate(nb).status === 0);
  rm(nb);
}

// 8) task-pollution guard: a DIFFERENT in-flight task is refused (fail loud), --replace-task starts fresh,
// and re-judging the SAME task needs no flag.
{
  const nb = tmpNb();
  run(nb, ['--task', 'first-task', '--strength', 'standard']);
  const r = run(nb, ['--task', 'second-task', '--strength', 'light']);
  check('different in-flight task -> exit 2', r.status === 2);
  check('original task left untouched', readState(nb).current_task === 'first-task');
  const r2 = run(nb, ['--task', 'second-task', '--strength', 'light', '--replace-task']);
  check('--replace-task -> exit 0', r2.status === 0);
  check('--replace-task swaps the task cleanly', readState(nb).current_task === 'second-task');
  check('re-judge SAME task needs no flag', run(nb, ['--task', 'second-task', '--strength', 'standard']).status === 0);
  rm(nb);
}

// 9) corrupt state.json -> exit 2 (fail loud; never overwrite a broken foundation).
{
  const nb = tmpNb();
  writeFileSync(join(nb, 'state.json'), '{ this is not json');
  const r = run(nb, ['--task', 't', '--strength', 'light']);
  check('corrupt state.json -> exit 2', r.status === 2);
  check('corrupt state.json left as-is (not overwritten)', readFileSync(join(nb, 'state.json'), 'utf8') === '{ this is not json');
  rm(nb);
}

// 10) --replace-task is a FRESH START: the previous task's task-scoped fields are CLEARED, no bleed.
{
  const nb = tmpNb();
  run(nb, ['--task', 'first-task', '--strength', 'standard']);
  const p = join(nb, 'state.json');
  const s = JSON.parse(readFileSync(p, 'utf8'));
  Object.assign(s, {
    intent_summary: 'old intent', definition_of_done: 'old dod', non_goals: ['old ng'],
    last_evidence: 'first-task.md', last_review: 'first-task.md', last_brief: 'first-task.md',
    open_risks: ['old risk'], drift_risks: ['old drift'], declared_packs: ['testing'], blocked_reason: 'old block',
  });
  writeFileSync(p, JSON.stringify(s, null, 2));
  run(nb, ['--task', 'second-task', '--strength', 'standard', '--replace-task']);
  const s2 = JSON.parse(readFileSync(p, 'utf8'));
  check('replace: task swapped', s2.current_task === 'second-task');
  check('replace: old intent + DoD + non_goals cleared', !s2.intent_summary && !s2.definition_of_done && !(s2.non_goals && s2.non_goals.length));
  check('replace: old evidence/review/brief pointers cleared', !s2.last_evidence && !s2.last_review && !s2.last_brief);
  check('replace: old risks + blocked_reason cleared', !(s2.open_risks && s2.open_risks.length) && !(s2.drift_risks && s2.drift_risks.length) && !s2.blocked_reason);
  check('replace: stale declared_packs cleared (no "testing" bleed)', !(s2.declared_packs && s2.declared_packs.includes('testing')));
  check('replace: new task still valid', vstate(nb).status === 0);
  rm(nb);
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
