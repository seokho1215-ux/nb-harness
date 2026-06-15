#!/usr/bin/env node
// NB intent-lock — the plan-time human checkpoint (audit #8/N3). /nb:plan used to capture intent by PROMPT:
// score.mjs only checked intent_summary EXISTS, and validate-state checked none of DoD/non_goals. Now it's a
// SCRIPT — the AI/user states the intent, and this persists intent_summary + definition_of_done + non_goals
// (+ taste) to .nb/state.json with DEEP-SHAPE validation (rejects empty/stub/one-word placeholders), and
// validate-state REQUIRES a locked intent once a task is being implemented. So "done" is reconciled against a
// REAL definition of done — feeds product `dod-covered` (was free-text token-match) and grill drift-check.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom, slugify } from './lib/proof.mjs';
import { checkIntentText } from './lib/intent.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const task = flag('--task');
const intent = flag('--intent');
const dod = flag('--dod');
if (!task || !task.trim()) {
  console.error('usage: node scripts/intent-lock.mjs --task <slug> --intent "<outcome>" --dod "<done when…>" [--non-goals "a; b"] [--must-not-change "src/auth/; /\\.lock$/"] [--taste "…"]');
  process.exit(2);
}

// Deep-shape: intent + DoD must be REAL — checked by the SAME helper validate-state uses, so the writer and
// the binding agree (no "passes the writer, fails — or worse, passes — the validator"). A guessed/blank/
// placeholder intent is not a locked intent (core/intent-lock.md: "ask if unclear, don't assume").
const iv = checkIntentText(intent);
if (!iv.ok) { console.error(`intent-lock: --intent ${iv.reason} — state the OUTCOME in a real sentence.`); process.exit(2); }
const dv = checkIntentText(dod);
if (!dv.ok) { console.error(`intent-lock: --dod ${dv.reason} — state the concrete "done when…".`); process.exit(2); }

const nonGoals = (flag('--non-goals') || '').split(/\s*;\s*|\n/).map((s) => s.trim()).filter(Boolean);
// must_not_change: off-limits file/area patterns (substring or /regex/). /nb:close compiles + matches these
// against the real changed files and BLOCKS if any was touched (unless the user accepts via a decision).
const mustNotChange = (flag('--must-not-change') || '').split(/\s*;\s*|\n/).map((s) => s.trim()).filter(Boolean);
// A /regex/ pattern MUST compile — a bad one ("/[auth/") must not silently degrade to a substring match, which
// would quietly weaken the off-limits guard the user asked for. Reject it loudly. (Codex GATE-2.)
for (const p of mustNotChange) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(p);
  if (m) { try { new RegExp(m[1], m[2]); } catch (e) { console.error(`intent-lock: --must-not-change has an invalid /regex/ "${p}": ${e && e.message ? e.message : e}`); process.exit(2); } }
}
const taste = flag('--taste');

// Load state — fail loud on a corrupt foundation; require a current task (strength-judge runs first in /nb:plan).
let state = {};
const sp = join(nb, 'state.json');
if (existsSync(sp)) {
  try { state = JSON.parse(stripBom(readFileSync(sp, 'utf8'))); }
  catch (e) { console.error(`intent-lock: .nb/state.json is corrupt (${e && e.message ? e.message : e}) — fix or remove it, then re-run.`); process.exit(2); }
} else { console.error('intent-lock: no .nb/state.json — run /nb:setup then /nb:plan (strength-judge) first.'); process.exit(2); }

if (!state.current_task) { console.error('intent-lock: no current task in state — run strength-judge (/nb:plan) first.'); process.exit(2); }
if (slugify(state.current_task) !== slugify(task)) {
  console.error(`intent-lock: --task "${task}" does not match the current task "${state.current_task}". Lock intent for the task in flight (use strength-judge --replace-task to switch tasks).`);
  process.exit(2);
}

state.intent_summary = intent.trim();
state.definition_of_done = dod.trim();
state.non_goals = nonGoals;
state.must_not_change = mustNotChange;
if (taste && taste.trim()) state.taste_notes = taste.trim();
state.updated_at = new Date().toISOString();

try { writeFileSync(sp, JSON.stringify(state, null, 2) + '\n'); }
catch (e) { console.error(`intent-lock: could not write state.json: ${e && e.message ? e.message : e}`); process.exit(2); }

console.log(`intent locked for "${state.current_task}":`);
console.log(`  intent: ${state.intent_summary}`);
console.log(`  done-when: ${state.definition_of_done}`);
console.log(`  non-goals: ${nonGoals.length ? nonGoals.join('; ') : '(none stated)'}`);
console.log(`  off-limits: ${mustNotChange.length ? mustNotChange.join('; ') : '(none)'}`);
process.exit(0);
