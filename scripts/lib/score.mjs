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
import { stripBom, sha256, parseProvenance, normalizeBody, reviewBinding, loadEvents } from './proof.mjs';
import { requiredFor } from './workflow.mjs';

// Canonical text for hashing a provenance-LESS (manual) review so it can't be laundered into a 2nd "round" by
// whitespace alone: reuse proof.mjs normalizeBody (CRLF->LF + outer trim), then strip per-line trailing
// whitespace and collapse blank lines. Real content differences still hash differently.
const reviewDedupKey = (txt) => sha256(normalizeBody(txt).split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/\n{2,}/g, '\n'));
import { statePresetGates } from './preset.mjs';
import { deriveReviewFloor, reviewRequirements } from './review-budget.mjs';

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

  // H2: classify the CORE review's provenance strength (cross-family / manual / unverified) so the firewall and
  // harness-score can state honestly what it IS, instead of crediting a bare task-matching file as a full
  // cross-family review. The block-vs-warn decision is close-engine's (it knows the preset/cross_family context);
  // here we only surface bound/strength/reason on the review verdict.
  // The artifact graded is THE declared review, resolved deterministically: the state.last_review pointer, ELSE
  // the artifact ledger's review row path(s), ELSE task-matched files. To stop a laundering path (Codex GATE
  // finding) where a present-but-unbound DECLARED review is masked by a separate bound task-matched file, we grade
  // the WEAKEST strength across the resolved candidate set — a bound file can never raise a weaker declared one.
  if (review.v === 'yes') {
    const mode = (state.mode === 'generic' || state.adapter === 'generic') ? 'generic' : 'native';
    const RS = { unverified: 0, manual: 1, 'cross-family': 2 };
    let candidates = [];
    if (state.last_review) candidates = [String(state.last_review).split('/').pop()];
    else if (ledger && Array.isArray(ledger.review) && ledger.review.length) {
      candidates = ledger.review.map((r) => r && r.path).filter(Boolean).map((p) => String(p).split('/').pop());
    } else {
      try {
        const dir = join(nbDir, 'reviews');
        candidates = readdirSync(dir).filter((f) => f !== '.gitkeep' && matchesTask(f, join(dir, f)));
      } catch { /* none */ }
    }
    const events2 = loadEvents(nbDir);
    let weakest = null;
    for (const name of candidates) {
      let txt = null;
      try { txt = readFileSync(join(nbDir, 'reviews', name), 'utf8'); } catch { /* missing -> unverified below */ }
      const b = txt != null ? reviewBinding(txt, events2, mode)
        : { bound: false, strength: 'unverified', reason: `declared review "${name}" not found` };
      if (weakest === null || (RS[b.strength] ?? 0) < (RS[weakest.strength] ?? 0)) weakest = b;
    }
    const b = weakest || { bound: false, strength: 'unverified', reason: 'review artifact not found to verify its provenance' };
    review.bound = b.bound; review.strength = b.strength; review.reason = b.reason;
  }
  const openRiskList = Array.isArray(state.open_risks) ? state.open_risks : [];
  const openRisks = openRiskList.length;

  // How many DISTINCT review ROUNDS happened (for review_budget two_round in a GENERAL context — two reviews, not
  // the security-report-check). Counted from the ACTUAL review artifacts (not the ledger, whose append-only rows
  // can point at the same file twice). Each round must be a UNIQUE, TASK-MATCHED artifact: dedup by the
  // cross-review provenance hash (a distinct review RUN) when present, else by a NORMALIZED content hash (a
  // distinct artifact, whitespace-laundering-resistant). So the same file referenced twice, an identical/copied
  // review, a whitespace-only variant, or a DIFFERENT-TASK review can't inflate the count to 2.
  // (Honest limit: this excludes OTHER-task reviews, not an OLD round of the SAME task — same-task staleness
  // isn't deterministically detectable here without per-review base_ref/run metadata.)
  let reviewCount = 0;
  try {
    const seen = new Set();
    for (const f of readdirSync(join(nbDir, 'reviews'))) {
      if (f === '.gitkeep') continue;
      const full = join(nbDir, 'reviews', f);
      if (!matchesTask(f, full)) continue; // task-matched only (excludes OTHER-task artifacts)
      let txt = ''; try { txt = readFileSync(full, 'utf8'); } catch { continue; }
      const prov = parseProvenance(txt);
      seen.add(prov && prov.output_sha256 ? `p:${prov.output_sha256}` : `c:${reviewDedupKey(txt)}`);
    }
    reviewCount = seen.size;
  } catch { reviewCount = 0; }

  // Ready to CLAIM DONE = the core steps THIS workflow requires actually happened. plan + intent are always
  // required; evidence/review/brief are gated by the workflow's required_artifacts (audit #35) so harness-score
  // agrees with /nb:close (a docs-only flow isn't "not ready" for a review it never runs). Unknown => all three.
  // An applied preset (audit M1) can only RAISE the required set — UNION its always-required artifacts so
  // harness-score agrees with /nb:close (both honor the preset; neither can be looser than the other). The
  // review-budget axis adds 'review' when its level is single/two_round (close re-derives from the observed diff;
  // score uses the recorded budget or the workflow/declared-pack floor).
  const rbSecurity = Array.isArray(state.declared_packs) && state.declared_packs.includes('security');
  const rbFloor = deriveReviewFloor({ workflow, categories: [], securityActive: rbSecurity });
  const rbLevel = (state.review_budget && state.review_budget.level) || rbFloor;
  const rbReview = reviewRequirements(rbLevel).requiresReview ? ['review'] : [];
  const required = [...new Set([...requiredFor(REPO_ROOT, workflow), ...statePresetGates(state).require_artifacts, ...rbReview])];
  const artifactOk = (k, r) => !required.includes(k) || r.v === 'yes';
  const ready = plan === 'yes' && intent === 'yes'
    && artifactOk('evidence', evidence) && artifactOk('review', review) && artifactOk('brief', brief);

  return { task, workflow, slug, plan, intent, evidence, review, brief, reviewCount, openRisks, openRiskList, ready };
}
