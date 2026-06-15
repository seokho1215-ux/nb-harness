#!/usr/bin/env node
// NB strength-judge — the plan-time half of strength enforcement (audit #7/N2). /nb:plan used to set
// strength/workflow by PROMPT (the AI said a level; nothing persisted or guarded it). This makes it a SCRIPT:
// the AI proposes (--strength/--workflow/--packs), and this persists the judgment to .nb/state.json with the
// SAFETY FLOOR enforced — strength can only be RAISED to what the task's risk demands, never lowered ("go
// fast" can't drop the floor; core/strength.md). The floor categories reuse lib/activation.mjs (one source of
// truth with the close-time detector). close-engine independently RE-floors at close from the real diff; this
// is the plan-time persist + guard that seeds it, so strength/workflow stop being unenforced prose.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, floorStrength, impliedPacks } from './lib/activation.mjs';
import { stripBom, slugify } from './lib/proof.mjs';
import { statePresetGates } from './lib/preset.mjs';
import { deriveModelPolicy } from './lib/model-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const RANK = { light: 1, standard: 2, full: 3 };
const STRENGTHS = ['light', 'standard', 'full'];

const task = flag('--task');
if (!task || !task.trim()) {
  console.error('usage: node scripts/strength-judge.mjs --task "<slug or description>" [--strength light|standard|full] [--workflow <name>] [--packs a,b] [--categories auth,data]');
  process.exit(2);
}

// Default = full when the AI names no level: core/strength.md — "Default = full; lower only when clearly light."
const proposed = (flag('--strength') || 'full').toLowerCase();
if (!STRENGTHS.includes(proposed)) { console.error(`--strength must be light|standard|full (got "${proposed}")`); process.exit(2); }

const extraCats = (flag('--categories') || '').split(',').map((s) => s.trim()).filter(Boolean);
const declaredPacks = (flag('--packs') || '').split(',').map((s) => s.trim()).filter(Boolean);

// Floor from the task TEXT (+ any AI-declared categories) using the SAME category regexes the close-time
// detector uses. Plan-time has no diff yet, so this is a prediction from intent; close re-floors from reality.
const textCats = CATEGORIES.filter((c) => (c.files && c.files.test(task)) || (c.cmds && c.cmds.test(task))).map((c) => c.id);
const cats = [...new Set([...textCats, ...extraCats.filter((c) => CATEGORIES.some((x) => x.id === c))])];
const floor = floorStrength(cats);

// Strength can only be RAISED to the floor, never set below it (the safety floor is non-negotiable).
const final = RANK[proposed] >= RANK[floor] ? proposed : floor;
const raised = final !== proposed;

// Workflow: validate an AI-named one; otherwise infer from floor/strength. Intent-specific workflows
// (bugfix/refactor/docs-only/release) can't be read from risk alone — the AI names those via --workflow.
const workflows = (() => { try { return readdirSync(join(ROOT, 'workflows')).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')); } catch { return []; } })();
let workflow = flag('--workflow');
if (workflow && workflows.length && !workflows.includes(workflow)) {
  console.error(`--workflow "${workflow}" is not a file in workflows/ (${workflows.join(', ')})`);
  process.exit(2);
}
if (!workflow) workflow = floor === 'full' ? 'security-sensitive' : final === 'full' ? 'full-feature' : final === 'standard' ? 'standard-feature' : 'light-change';

// Packs a risk category pulls in (auth->security, data->data, …) ∪ the AI's declared packs.
const packs = [...new Set([...declaredPacks, ...impliedPacks(cats)])];

// Load existing state — FAIL LOUD on a corrupt foundation rather than silently overwriting it (a broken
// state.json is a trust problem for a foundation command; we must not paper over it with a blank slate).
let state = {};
const sp = join(nb, 'state.json');
const ep = join(nb, 'state.example.json');
if (existsSync(sp)) {
  try { state = JSON.parse(stripBom(readFileSync(sp, 'utf8'))); }
  catch (e) { console.error(`strength-judge: .nb/state.json is corrupt (${e && e.message ? e.message : e}) — refusing to overwrite a broken foundation. Fix or remove it, then re-run.`); process.exit(2); }
} else if (existsSync(ep)) {
  try { state = JSON.parse(stripBom(readFileSync(ep, 'utf8'))); delete state.$comment; }
  catch (e) { console.error(`strength-judge: .nb/state.example.json is unreadable (${e && e.message ? e.message : e}) — is NB installed correctly?`); process.exit(2); }
}

// A new task must NOT graft its strength/workflow/packs onto a DIFFERENT in-flight task (state pollution:
// the judge would persist the new task's risk while current_task still names the old one). Proceed only when
// there's no current task, it's the SAME task (re-judge), or --replace-task explicitly starts fresh.
const replaceTask = args.includes('--replace-task');
const differentTask = !!state.current_task && slugify(state.current_task) !== slugify(task);
if (differentTask && !replaceTask) {
  console.error(`strength-judge: a different task is in flight — current "${state.current_task}", requested "${task}". Close/finish it first, or pass --replace-task to start fresh (resets the task's plan fields).`);
  process.exit(2);
}

// --replace-task into a DIFFERENT task = a genuine FRESH START: clear the PREVIOUS task's task-scoped fields so
// no stale intent / evidence / review / risk / packs bleeds into the new task (that would poison intent-lock,
// the brief, and /nb:close downstream). Harness-level fields (e.g. harness_version) are kept. (Codex GATE-2:
// without this, --replace-task only swapped task/strength/workflow and left old intent+evidence behind.)
const TASK_SCOPED = ['workflow_reason', 'escalation_reason', 'active_agent_lane', 'active_gates',
  'intent_summary', 'non_goals', 'definition_of_done', 'taste_notes', 'must_not_change', 'drift_risks',
  'design_docs', 'model_policy', 'last_review', 'last_evidence', 'last_brief', 'last_security',
  'open_risks', 'blocked_reason', 'declared_packs', 'task_base_ref'];
if (differentTask && replaceTask) for (const k of TASK_SCOPED) delete state[k];

// Past the guard: this IS the task being planned. Set it authoritatively (no stale-task carryover).
state.current_task = task;
state.current_task_slug = slugify(task);
state.current_mode = 'design';
state.strength_level = final;
state.current_workflow = workflow;
state.workflow_reason = `${raised ? `raised to ${final} by safety floor (${cats.join(', ')}); ` : ''}strength ${final}, workflow ${workflow}`;
if (packs.length) state.declared_packs = packs;
// Derive the portable model tier from the judged strength/workflow (+ any applied preset) — NB derives it; the
// user doesn't pick a model per task. The standalone scripts/model-policy.mjs re-derives / --show / --degrade.
const pgz = statePresetGates(state);
state.model_policy = deriveModelPolicy({ strength: final, workflow, preset: { min_strength: pgz.min_strength, cross_family: pgz.cross_family } });
state.updated_at = new Date().toISOString();

try { writeFileSync(sp, JSON.stringify(state, null, 2) + '\n'); }
catch (e) { console.error(`strength-judge: could not write state.json: ${e && e.message ? e.message : e}`); process.exit(2); }

console.log(`strength: ${final}${raised ? `  (raised from ${proposed} — safety floor: ${cats.join(', ')})` : ''}`);
console.log(`workflow: ${workflow}`);
if (cats.length) console.log(`floor categories: ${cats.join(', ')} -> floor ${floor}`);
if (packs.length) console.log(`packs: ${packs.join(', ')}`);
console.log('state -> design (.nb/state.json)');
process.exit(0);
