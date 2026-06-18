#!/usr/bin/env node
// Tests for scripts/intent-lock.mjs + the validate-state intent rule. Dependency-free.
// Checks: deep-shape rejection of stub/thin intent+DoD, persist to state, non-goals parsing, task-match +
// no-current-task + corrupt-state guards (exit 2), and that validate-state REQUIRES a locked intent once
// implementing (design exempt).
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IL = join(ROOT, 'scripts', 'intent-lock.mjs');
const VS = join(ROOT, 'scripts', 'validate-state.mjs');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
function tmpNb() {
  const t = mkdtempSync(join(tmpdir(), 'nb-il-'));
  mkdirSync(join(t, '.nb'), { recursive: true });
  // seed the 3-tier design docs for slug 't' so POST_PLAN validate-state isn't blocked on P-e/M2 (this test
  // probes the intent rules, not the design-docs rule).
  mkdirSync(join(t, 'pipeline', 't', '03-tasks'), { recursive: true });
  writeFileSync(join(t, 'pipeline', 't', '01-architecture.md'), '# Arch\n\n## Design Decisions\nFirst cut covers the core; nothing deferred. core_value -> task 01 acceptance.\n');
  writeFileSync(join(t, 'pipeline', 't', '02-module.md'), '# Contract\n');
  writeFileSync(join(t, 'pipeline', 't', '03-tasks', '01.md'), '# Task\n\n## Context Budget\n~20%.\n');
  return join(t, '.nb');
}
const run = (nb, args) => spawnSync('node', [IL, ...args], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const vstate = (nb) => spawnSync('node', [VS], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const setState = (nb, o) => writeFileSync(join(nb, 'state.json'), JSON.stringify(o, null, 2));
const readState = (nb) => JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8'));
const rm = (nb) => rmSync(resolve(nb, '..'), { recursive: true, force: true });
const planned = { current_task: 't', current_task_slug: 't', current_mode: 'design', strength_level: 'standard', current_workflow: 'standard-feature', model_policy: { planner: 'strongest', implement: 'strongest', review: 'strongest', security: 'strongest', family: 'two-family' }, review_budget: { level: 'two_round', source: 'auto', floor: 'two_round' } };

// 1) basic: a real intent + DoD persist; non_goals parse; then validate-state accepts implement.
{
  const nb = tmpNb();
  setState(nb, planned);
  const r = run(nb, ['--task', 't', '--intent', 'build the user list view with paging', '--dod', 'the list renders 20 items per page and paginates', '--non-goals', 'no auth changes; no schema migration', '--must-not-change', 'src/auth/; /\\.lock$/']);
  check('basic: exit 0', r.status === 0);
  const s = readState(nb);
  check('basic: intent persisted', s.intent_summary === 'build the user list view with paging');
  check('basic: DoD persisted', /paginates/.test(s.definition_of_done));
  check('basic: non_goals parsed to list', Array.isArray(s.non_goals) && s.non_goals.length === 2 && s.non_goals[0] === 'no auth changes');
  check('basic: must_not_change parsed to list', Array.isArray(s.must_not_change) && s.must_not_change.length === 2 && s.must_not_change[0] === 'src/auth/');
  setState(nb, { ...readState(nb), current_mode: 'implement' });
  check('basic: validate-state OK with locked intent in implement', vstate(nb).status === 0);
  rm(nb);
}

// 2) deep-shape: thin/stub intent or DoD -> exit 2 (a guessed/blank intent is not a locked intent).
{
  const nb = tmpNb();
  setState(nb, planned);
  check('thin intent (one word) -> exit 2', run(nb, ['--task', 't', '--intent', 'stuff', '--dod', 'the thing is fully working now']).status === 2);
  check('stub intent (TODO) -> exit 2', run(nb, ['--task', 't', '--intent', 'TODO figure this out later', '--dod', 'the thing is fully working now']).status === 2);
  check('thin DoD -> exit 2', run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'done']).status === 2);
  check('missing DoD -> exit 2', run(nb, ['--task', 't', '--intent', 'build the proper list view']).status === 2);
  rm(nb);
}

// 3) guards: task mismatch, no current task, corrupt state -> exit 2.
{
  const nb = tmpNb();
  setState(nb, planned);
  check('task mismatch -> exit 2', run(nb, ['--task', 'other', '--intent', 'build the proper list view', '--dod', 'the list renders correctly always']).status === 2);
  setState(nb, { current_mode: 'idle' });
  check('no current task -> exit 2', run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'the list renders correctly always']).status === 2);
  writeFileSync(join(nb, 'state.json'), '{ not json');
  check('corrupt state -> exit 2', run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'the list renders correctly always']).status === 2);
  check('corrupt state left as-is', readFileSync(join(nb, 'state.json'), 'utf8') === '{ not json');
  rm(nb);
}

// 3b) an invalid /regex/ in --must-not-change is rejected loudly (must not degrade to a substring) + the
// validator catches a hand-edited bad regex too (Codex GATE-2).
{
  const nb = tmpNb();
  setState(nb, planned);
  check('invalid /regex/ in must-not-change -> writer exit 2', run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'the list renders correctly with paging', '--must-not-change', '/[auth/']).status === 2);
  // a valid mix still works
  check('valid must-not-change (substring + /regex/) -> exit 0', run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'the list renders correctly with paging', '--must-not-change', 'src/auth/; /\\.lock$/']).status === 0);
  // hand-edit a bad regex into state -> validate-state INVALID
  writeFileSync(join(nb, 'state.json'), JSON.stringify({ ...planned, must_not_change: ['/[auth/'] }));
  check('hand-edited invalid /regex/ -> validate-state FAIL', vstate(nb).status === 1);
  rm(nb);
}

// 4) validate-state REQUIRES a locked intent once implementing; design is exempt.
{
  const nb = tmpNb();
  // design without intent is fine (still planning)
  setState(nb, planned);
  check('design w/o intent -> validate-state OK', vstate(nb).status === 0);
  // implement without intent must FAIL
  setState(nb, { ...planned, current_mode: 'implement' });
  check('implement w/o intent -> validate-state FAIL', vstate(nb).status === 1);
  // lock it -> OK
  run(nb, ['--task', 't', '--intent', 'build the proper list view', '--dod', 'the list renders correctly with paging']);
  setState(nb, { ...readState(nb), current_mode: 'implement' });
  check('implement after intent-lock -> validate-state OK', vstate(nb).status === 0);
  rm(nb);
}

// 5) token soup is rejected by BOTH the writer AND the validator at the SAME bar (Codex C1/C2 regression).
{
  const nb = tmpNb();
  setState(nb, planned);
  check('token-soup intent -> writer exit 2', run(nb, ['--task', 't', '--intent', 'aaa bbb ccc ddd', '--dod', 'the list renders correctly with paging']).status === 2);
  // hand-poison state to token soup at implement -> validate-state must ALSO reject (not just isStub).
  setState(nb, { ...planned, current_mode: 'implement', intent_summary: 'aaa bbb ccc ddd', definition_of_done: 'eee fff ggg hhh', non_goals: [] });
  const v = vstate(nb);
  check('token-soup intent at implement -> validate-state FAIL (same bar as writer)', v.status === 1);
  check('validator names the placeholder reason', /placeholder tokens/.test(v.stdout));
  rm(nb);
}

// 6) non-Latin (Korean) intent must PASS — the substance check is language-neutral, not English-only
// (Codex GATE-2: VOWEL/CONSONANT was Latin-only, false-rejecting legitimate Korean intent).
{
  const nb = tmpNb();
  setState(nb, planned);
  const r = run(nb, ['--task', 't', '--intent', '로그인 리다이렉트 버그를 제대로 고친다', '--dod', '로그인 후 원래 페이지로 정확히 이동한다']);
  check('Korean intent -> writer exit 0 (not a false placeholder)', r.status === 0);
  setState(nb, { ...readState(nb), current_mode: 'implement' });
  check('Korean intent -> validate-state OK', vstate(nb).status === 0);
  // and a single-char-repeat placeholder in Korean is still caught
  check('Korean repeat soup (ㅋㅋㅋ …) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'ㅋㅋㅋ ㅎㅎㅎ ㅋㅋㅋ ㅎㅎㅎ', '--dod', '로그인 후 원래 페이지로 정확히 이동한다']).status === 2);
  rm(nb);
}

// 7) space-free scripts (Japanese/Chinese) must PASS — judged by character substance, not word count
// (Codex GATE-3: split(/\s+/)+minWords penalized a real no-space Japanese sentence as 1 word).
{
  const nb = tmpNb();
  setState(nb, planned);
  const r = run(nb, ['--task', 't', '--intent', 'ログインリダイレクトのバグを修正する', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']);
  check('Japanese (no spaces) intent -> writer exit 0', r.status === 0);
  setState(nb, { ...readState(nb), current_mode: 'implement' });
  check('Japanese intent -> validate-state OK', vstate(nb).status === 0);
  // a no-space run-soup is still rejected (language-neutral run guard)
  check('no-space repeat soup (aaabbbcccddd…) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'aaabbbcccdddeeefff', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 2);
  // a no-space LATIN keyboard-mash must NOT slip through the space-free path (Codex GATE-4)
  check('no-space latin mash (asdfghjklqwerty) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'asdfghjklqwerty', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 2);
  check('no-space latin mash (qwertyuiopasdfg) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'qwertyuiopasdfghjkl', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 2);
  // Cyrillic phrase passes too
  check('Cyrillic intent -> writer exit 0', run(nb, ['--task', 't', '--intent', 'исправить ошибку входа пользователя', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 0);
  // short CJK sentence (< 15 chars) passes — judged by non-Latin letters, not the Latin char/word bar
  check('short Chinese (< 15 chars) -> writer exit 0', run(nb, ['--task', 't', '--intent', '修正登录后的跳转错误', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 0);
  // latin mash padded with a few CJK chars must NOT launder through the space-free path (Codex GATE-5)
  check('latin mash + 6 CJK (asdfghjkl修正登录后跳) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'asdfghjkl修正登录后跳', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 2);
  check('latin mash + CJK (qwertyuiop修正登录后跳) -> writer exit 2', run(nb, ['--task', 't', '--intent', 'qwertyuiop修正登录后跳', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 2);
  // a real CJK sentence with a short acronym still passes (non-Latin dominates)
  check('CJK + short acronym (ログインAPIのバグを修正する) -> writer exit 0', run(nb, ['--task', 't', '--intent', 'ログインAPIのバグを修正する', '--dod', 'ログイン後にユーザーが元のページへ正しく遷移する']).status === 0);
  rm(nb);
}

// 8) scope & core-value (core/scope-value.md): --core-value/--must-preserve/--defer persist as lists; absent
// flags leave them unset (no empty arrays written); validate-state accepts the shape and rejects a non-list.
{
  const nb = tmpNb();
  setState(nb, planned);
  const r = run(nb, ['--task', 't', '--intent', 'build the knowledge spine view', '--dod', 'the spine renders and nodes are clickable', '--core-value', 'node-click causal highlight; time<->topic axis switch', '--must-preserve', 'the spine view is the heart', '--defer', 'export to PDF (user OK)']);
  check('core-value: exit 0', r.status === 0);
  const s = readState(nb);
  check('core-value parsed to list (2)', Array.isArray(s.core_value) && s.core_value.length === 2 && s.core_value[0] === 'node-click causal highlight');
  check('must-preserve parsed to list (1)', Array.isArray(s.must_preserve) && s.must_preserve.length === 1);
  check('defer parsed to list (1)', Array.isArray(s.defer_candidates) && s.defer_candidates.length === 1);
  check('core-value: stdout reports it', /core-value:/.test(r.stdout));
  setState(nb, { ...readState(nb), current_mode: 'implement' });
  check('core-value: validate-state OK', vstate(nb).status === 0);
  rm(nb);
}

// 8b) absent scope flags write nothing (proportionality — light/non-product work carries none).
{
  const nb = tmpNb();
  setState(nb, planned);
  run(nb, ['--task', 't', '--intent', 'fix the small label color', '--dod', 'the label renders in the brand color']);
  const s = readState(nb);
  check('no core-value flag -> field absent', s.core_value === undefined && s.must_preserve === undefined && s.defer_candidates === undefined);
  rm(nb);
}

// 8c) a hand-edited non-list core_value -> validate-state INVALID (shape guard).
{
  const nb = tmpNb();
  setState(nb, { ...planned, current_mode: 'implement', intent_summary: 'build the knowledge spine view', definition_of_done: 'the spine renders and nodes are clickable', non_goals: [], core_value: 'not a list' });
  check('non-list core_value -> validate-state FAIL', vstate(nb).status === 1);
  rm(nb);
}

// 8d) transparency floor (core/scope-value.md): a declared core_value with NO "## Design Decisions" section in
// the design docs -> validate-state FAIL at implement; adding the section -> OK. No core_value -> not required.
{
  const nb = tmpNb();
  const root = resolve(nb, '..');
  // strip the Design Decisions section tmpNb seeds, to prove the gate fires
  writeFileSync(join(root, 'pipeline', 't', '01-architecture.md'), '# Arch\n(no decisions section)\n');
  setState(nb, { ...planned, current_mode: 'implement', intent_summary: 'build the knowledge spine view', definition_of_done: 'the spine renders and nodes are clickable', non_goals: [], core_value: ['node-click causal highlight'] });
  const v = vstate(nb);
  check('core_value w/o Design Decisions -> validate-state FAIL', v.status === 1);
  check('failure names the missing Design Decisions', /Design Decisions/.test(v.stdout));
  // add the section -> OK
  writeFileSync(join(root, 'pipeline', 't', '01-architecture.md'), '# Arch\n\n## Design Decisions\ncore value is in the first cut; traced to task 01.\n');
  check('core_value WITH Design Decisions -> validate-state OK', vstate(nb).status === 0);
  // no core_value at all -> the floor does not apply even without a decisions section
  writeFileSync(join(root, 'pipeline', 't', '01-architecture.md'), '# Arch\n(no decisions section)\n');
  setState(nb, { ...planned, current_mode: 'implement', intent_summary: 'build the knowledge spine view', definition_of_done: 'the spine renders and nodes are clickable', non_goals: [] });
  check('no core_value -> Design Decisions not required', vstate(nb).status === 0);
  rm(nb);
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
