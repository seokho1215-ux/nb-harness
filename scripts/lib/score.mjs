// NB scoring engine (shared, dependency-free). The single source of truth for "is this task ready
// to claim done?" — read by scripts/harness-score.mjs (prints the score) and scripts/close.mjs (the
// /nb:close completion firewall). Keeping it here means the two can never drift apart.
//
// Readiness is tied to the CURRENT task: stale directory artifacts AND stale state pointers
// (last_evidence / last_review / last_brief pointing at another task's file) both read as stale.
// "Ready" means the steps for *this* task happened, not that the code is good.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripBom } from './proof.mjs';
import { requiredFor } from './workflow.mjs';
import { statePresetGates } from './preset.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Assess one task's readiness against a .nb directory. Returns a structured verdict; no printing.
export function scoreTask(nbDir) {
  let state = {};
  try { state = JSON.parse(stripBom(readFileSync(join(nbDir, 'state.json'), 'utf8'))); } catch { /* none */ }

  const task = state.current_task || null;
  const workflow = state.current_workflow || null;
  const slug = state.current_task_slug
    || (task ? task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : null);

  // Does this artifact belong to the current task? (filename includes the task/slug, or file
  // metadata carries a "Task: <task>" line). If there's no current task, anything matches.
  function matchesTask(filename, fullPath) {
    if (!task && !slug) return true;
    const fn = filename.toLowerCase();
    if (slug && fn.includes(slug)) return true;
    if (task && fn.includes(task.toLowerCase())) return true;
    try {
      const c = readFileSync(fullPath, 'utf8');
      const parts = [task, slug].filter(Boolean).map(escapeRe).join('|');
      if (parts && new RegExp(`task:\\s*(${parts})\\b`, 'i').test(c)) return true;
    } catch { /* unreadable */ }
    return false;
  }

  // Assess one artifact category against the current task. Returns { v: 'yes'|'missing'|'stale', note? }.
  function assess(pointer, dir) {
    let files = [];
    try { files = readdirSync(join(nbDir, dir)).filter((f) => f !== '.gitkeep'); } catch { /* none */ }

    if (pointer) {
      const base = String(pointer).split('/').pop();
      const full = join(nbDir, dir, base);
      if (!existsSync(full)) return { v: 'missing', note: `pointer ${pointer} not found` };
      if (matchesTask(base, full)) return { v: 'yes' };
      return { v: 'stale', note: `pointer ${pointer} does not match task ${task}` };
    }
    if (task || slug) {
      const match = files.find((fl) => matchesTask(fl, join(nbDir, dir, fl)));
      if (match) return { v: 'yes' };
    }
    if (files.length) return { v: 'stale', note: `.nb/${dir}/${files[0]}` };
    return { v: 'missing' };
  }

  // Prefer the artifact ledger (.nb/artifacts.jsonl) when present; else fall back to state pointers.
  let ledger = null;
  try {
    const live = join(nbDir, 'artifacts.jsonl');
    if (existsSync(live)) {
      ledger = {};
      for (const ln of stripBom(readFileSync(live, 'utf8')).split(/\r?\n/)) {
        const t = ln.trim(); if (!t) continue;
        try {
          const r = JSON.parse(t);
          if (r.status === 'current' && (!slug || r.task_slug === slug)) (ledger[r.type] ||= []).push(r);
        } catch { /* skip bad row */ }
      }
    }
  } catch { /* none */ }
  const fromLedger = (type, pointer, dir) => (ledger ? (ledger[type]?.length ? { v: 'yes' } : { v: 'missing' }) : assess(pointer, dir));

  const plan = (task || workflow) ? 'yes' : 'missing';
  const intent = state.intent_summary ? 'yes' : 'missing';
  const evidence = fromLedger('evidence', state.last_evidence, 'evidence');
  const review = fromLedger('review', state.last_review, 'reviews');
  const brief = fromLedger('brief', state.last_brief, 'briefs');
  const openRiskList = Array.isArray(state.open_risks) ? state.open_risks : [];
  const openRisks = openRiskList.length;

  // Ready to CLAIM DONE = the core steps THIS workflow requires actually happened. plan + intent are always
  // required; evidence/review/brief are gated by the workflow's required_artifacts (audit #35) so harness-score
  // agrees with /nb:close (a docs-only flow isn't "not ready" for a review it never runs). Unknown => all three.
  // An applied preset (audit M1) can only RAISE the required set — UNION its always-required artifacts so
  // harness-score agrees with /nb:close (both honor the preset; neither can be looser than the other).
  const required = [...new Set([...requiredFor(REPO_ROOT, workflow), ...statePresetGates(state).require_artifacts])];
  const artifactOk = (k, r) => !required.includes(k) || r.v === 'yes';
  const ready = plan === 'yes' && intent === 'yes'
    && artifactOk('evidence', evidence) && artifactOk('review', review) && artifactOk('brief', brief);

  return { task, workflow, slug, plan, intent, evidence, review, brief, openRisks, openRiskList, ready };
}
