// NB close engine (pure, dependency-free). ALL of the /nb:close decision logic lives here so it can be
// unit-tested by INJECTING contracts — never by an env override of the contract source (that would be a
// backdoor: the firewall's rule source must not be user-changeable). close.mjs is the thin CLI that loads
// the real inputs from the trusted installed root and calls this.
//
// Verdicts: READY | READY_WITH_RISKS | NOT_READY | CHECK_ERROR.
//   CHECK_ERROR = we cannot trust the verdict (engine/contract/source problem, env override, required
//                 stable pack with no contract). NOT_READY = the user's proofs/artifacts are missing/invalid.
//   The CLI maps READY*→0, NOT_READY→1, CHECK_ERROR→2. close fails CLOSED.
import { verifyProof, verifyAnalytical, verifyTddRedGreen } from './proof.mjs';

const RANK = { light: 1, standard: 2, full: 3 };
const rank = (s) => RANK[s] || 1;
// A decision counts only when it passed deep validation (lib/decision.mjs). The CLI loads each decision as a
// { ok, reasons, fields } result; the engine treats it as satisfied ONLY when ok. Single helper so no gate
// regresses to a truthy-present check (existence is bypassable).
const decisionOk = (d) => !!(d && d.ok);

// input (all injected by the CLI; tests pass them directly):
//   core        : scoreTask() result { ready, plan, intent, evidence:{v}, review:{v}, brief:{v}, openRisks }
//   activation  : resolveActivation() result { active_packs, explicit_packs, implied_packs,
//                 observed_categories, floor_strength, unknown_impact, baseline_confidence }
//   contracts   : { pack: { objective_proofs:[{proof_type, strength}], stable?:bool } }  (only packs that have one)
//   stablePacks : Set of pack ids that MUST have a contract (missing ⇒ CHECK ERROR)
//   proofs      : { "pack:proof_type": record }
//   events      : tool-event log (for verifyProof reconciliation)
//   decisions   : { kind: { approved_by, timestamp } }  present, min-shape-valid decision artifacts
//   taskSlug, taskStrength, envOverride(bool)
export function closeEngine(input = {}) {
  const {
    core, activation = {}, contracts = {}, stablePacks = new Set(),
    proofs = {}, events = [], decisions = {}, taskSlug, taskStrength = 'standard', envOverride = false,
    reviewArtifacts = {}, mode = 'native', now, mustNotChange = [], requiredArtifacts, driftRisks = [],
    modelPolicyMissing = false, modelBelowFloor = [], reviewBudgetBelowFloor = false, generalTwoRound = false,
    currentMode, currentWorkflow, presetCrossFamily = false,
  } = input;
  const errors = [];     // -> CHECK_ERROR
  const blockers = [];   // -> NOT_READY
  const warnings = [];   // low-strength notices surfaced by the CLI (e.g. Generic-mode manual review)

  if (envOverride) errors.push('contract source override attempt refused (NB_PACKS_DIR/NB_CONTRACT_ROOT must not be set)');
  if (!core || typeof core !== 'object') return verdict(errors.concat('no readiness result (engine could not score the task)'), blockers, 0);

  // 1. Core five. plan + intent are ALWAYS required (the foundation set by /nb:plan). evidence/review/brief are
  // gated by the workflow's required_artifacts (audit #35): a docs-only change isn't held to a cross-family
  // review it never runs; a full feature still is. Unknown/absent/empty requiredArtifacts => all three (fail SAFE).
  if (core.plan !== 'yes') blockers.push('core: plan missing (no task/workflow)');
  if (core.intent !== 'yes') blockers.push('core: intent not locked');
  // Defense-in-depth: a non-array OR an EMPTY array both fall to the strict default. close.mjs routes through
  // requiredFor() which never yields [], but the engine must not itself accept "[] => require nothing" — a
  // firewall core can't trust its caller to have normalized (Codex GATE blocker).
  const required = Array.isArray(requiredArtifacts) && requiredArtifacts.length
    ? requiredArtifacts
    : ['evidence', 'review', 'brief'];
  for (const k of ['evidence', 'review', 'brief']) {
    if (!required.includes(k)) continue; // this workflow does not require this artifact
    const r = core[k]; if (!r || r.v !== 'yes') blockers.push(`core: ${k} ${r?.v || 'missing'}${r?.note ? ` (${r.note})` : ''}`);
  }

  // 1a. review provenance (H2): when a `review` is required AND present, surface/gate its provenance strength.
  // The core review slot used to credit ANY task-matching file as a full cross-family review (the headline
  // overclaim). Now: a STRICT/cross-family profile (preset cross_family_required — previously recorded-only, M1
  // residual) REQUIRES a machine-verified cross-family review (strength must be 'cross-family'); a manual /
  // Generic-mode / unverified review BLOCKS under that profile. Outside it, a non-cross-family review is accepted
  // but surfaced as a LOW-strength warning — never silently full-credited. (Security's own real cross-family gate
  // is enforced separately via the forced security pack + security-report-check.)
  if (required.includes('review') && core.review && core.review.v === 'yes') {
    const rs = core.review.strength || 'unverified';
    if (rs !== 'cross-family') {
      if (presetCrossFamily) {
        blockers.push(`core: review is not a machine-verified cross-family review (${core.review.reason || rs}) — this preset requires cross-family review; run /nb:review (cross-review.mjs), or record a manual cross-family review and mark it manual_fallback`);
      } else {
        warnings.push(`core review: ${rs} — ${core.review.reason || 'not provenance-bound to a cross-family run'} (counted as low strength; run /nb:review for a machine-verified cross-family review)`);
      }
    }
  }

  // 1b. state-machine (H4): a task in a pre-work or blocked state cannot certify as done. Per core/state-machine.md
  // `done` is reachable only from the working path (implement → review → brief); `idle`/`design` mean nothing is
  // built yet and `blocked` is an unresolved blocker. Only gated when current_mode is SET — a Generic/minimal user
  // may omit it, in which case the artifact + floor gates still apply (fail-safe, never trusts state to PASS).
  const NOT_CLOSEABLE_FROM = new Set(['idle', 'design', 'blocked']);
  if (currentMode && NOT_CLOSEABLE_FROM.has(currentMode)) {
    blockers.push(`task is in "${currentMode}" — not a state it can close from (build → review → brief first${currentMode === 'blocked' ? '; a blocked task must be unblocked, not closed as done' : ''})`);
  }

  // 2. effective strength (computed before proof selection)
  const effective = Math.max(rank(taskStrength), rank(activation.floor_strength || 'light'));

  // 3. packs: declared/observed-by-rule stable packs MUST be contracted; implied-only packs lean on the floor.
  // Two passes: OBJECTIVE proofs first (build the verified set), THEN ANALYTICAL — so an analytical claim's
  // evidence_ref:proof:<pack>.<type> can resolve against proofs that actually passed THIS run. The verifier
  // is chosen by which contract list the proof sits in (objective_proofs vs analytical_proofs) — the
  // contract's declared kind — NEVER by a self-label on the record.
  const explicit = new Set(activation.explicit_packs || []);
  const active = activation.active_packs || [];
  const verifiedProofs = new Set();

  // An implied-ONLY pack (pulled in by a Core category, never declared/observed/forced) whose objective proof
  // is impossible to produce here (e.g. a false-positive `data` on a project with no database -> migration
  // proofs can't exist) can be waived as not-applicable by an explicit human decision
  // (.nb/decisions/<task>.<pack>-na.md). Closes "false-positive category -> permanently unclosable" (KNOWN-ISSUES)
  // without weakening the firewall: the category floor (pass 4) STILL needs acknowledgment, the waiver is a
  // shape-validated, accountable decision on record, and the SECURITY floor is NEVER escapable this way — an
  // auth/secret/payment change always has to produce its security report, implied or not.
  // NA_NEVER = packs that can NEVER be N/A-waived (the safety floor). MAINTENANCE INVARIANT (Codex GATE E): any
  // future pack that a FULL-floor safety category implies (see activation.mjs CATEGORIES + security-floor.mjs)
  // MUST be added here, or a misdetection escape could waive a real safety gate. Today the only security-floor
  // pack is `security` (auth/secret/payment/code-execution/ci-security all imply it).
  const NA_NEVER = new Set(['security']);
  const naWaived = (pack) => !explicit.has(pack) && !NA_NEVER.has(pack) && decisionOk(decisions[`${pack}-na`]);

  // 3a. objective
  for (const pack of active) {
    if (!contracts[pack]) {
      if (explicit.has(pack) && stablePacks.has(pack)) errors.push(`active pack "${pack}" has no close_contract — cannot verify a domain that is in play`);
      continue; // implied-only & uncontracted: no CHECK ERROR; the category floor covers the risk.
    }
    if (naWaived(pack)) continue; // implied-only pack waived as N/A by a human decision — leans on the floor
    for (const p of contracts[pack].objective_proofs || []) {
      if (effective < rank(p.strength || 'standard')) continue; // not required at this strength
      const rec = proofs[`${pack}:${p.proof_type}`];
      if (!rec) { blockers.push(`${pack}: objective proof "${p.proof_type}" missing`); continue; }
      const v = verifyProof(rec, { task_slug: taskSlug, pack, commandMatch: p.command_match }, events);
      if (!v.ok) blockers.push(`${pack}.${p.proof_type}: ${v.reasons[0]}`);
      else verifiedProofs.add(`${pack}:${p.proof_type}`);
    }
  }

  // 3b. analytical (provenance-bound coverage; resolves evidence_ref against verifiedProofs + decisions)
  for (const pack of active) {
    if (!contracts[pack]) continue;
    if (naWaived(pack)) continue; // same N/A waiver as 3a (implied-only, non-security, human decision on record)
    for (const p of contracts[pack].analytical_proofs || []) {
      if (effective < rank(p.strength || 'standard')) continue;
      // OPT-IN proofs (TDD): a proof gated by `required_when_workflow` is required ONLY when that workflow was
      // chosen — so the testing pack's tdd-red-green doesn't fire on every ordinary test change, only under the
      // `tdd` workflow the user opted into. Absent field => always required (back-compat, fail SAFE).
      if (p.required_when_workflow && p.required_when_workflow !== currentWorkflow) continue;
      const rec = proofs[`${pack}:${p.proof_type}`];
      if (!rec) { blockers.push(`${pack}: analytical proof "${p.proof_type}" missing`); continue; }
      // TDD red→green is a log-reconciled pair check (a failed test run then a passed one), not a cross-review
      // coverage claim — it uses its own verifier. Everything else is the provenance-bound cross-review path.
      const v = (p.proof_type === 'tdd-red-green')
        ? verifyTddRedGreen(rec, { task_slug: taskSlug, pack, commandMatch: p.command_match }, events)
        : verifyAnalytical(rec, { task_slug: taskSlug, pack, now }, {
          events, reviewArtifacts, requiredClaims: p.required_claims || [], verifiedProofs, decisions, mode,
        });
      for (const e of v.errors || []) errors.push(`${pack}.${p.proof_type}: ${e}`);
      for (const r of v.reasons || []) blockers.push(`${pack}.${p.proof_type}: ${r}`);
      if (v.ok) for (const w of v.warnings || []) warnings.push(`${pack}.${p.proof_type}: ${w}`);
    }
  }

  // 4. category floor (Core, contract-independent): each observed risk category needs an acknowledgment
  for (const cat of activation.observed_categories || []) {
    if (!decisionOk(decisions[cat])) blockers.push(`floor: category "${cat}" needs a valid acknowledgment (.nb/decisions/<task>.${cat}.md)`);
  }

  // 5. unknown / high-impact change -> escalate
  if (activation.unknown_impact) blockers.push('unclassified high-impact change observed — review required');

  // 5b. must_not_change: a file the plan locked as OFF-LIMITS (intent-lock) was changed -> block unless the
  // user explicitly accepts it (a deliberate, acknowledged exception). Patterns are pre-compiled by close.mjs
  // (a plain substring, or a /regex/) and matched against the SAME observed changes the category floor uses
  // (hook-logged paths ∪ git diff). Empty must_not_change (the common case) is a no-op.
  if (mustNotChange.length) {
    const changed = (activation.changes && activation.changes.files) || [];
    const hits = [...new Set(changed.filter((f) => mustNotChange.some((p) => (p instanceof RegExp ? p.test(f) : String(f).includes(p)))))];
    if (hits.length && !decisionOk(decisions['must-not-change'])) {
      blockers.push(`off-limits files changed (must_not_change): ${hits.join(', ')} — revert them, or accept via .nb/decisions/<task>.must-not-change.md`);
    }
  }

  // 6. baseline confidence: if risk is in play but we cannot trust the diff, require explicit acceptance.
  //    must_not_change being set ALSO puts risk in play: with a low baseline we can't see whether an off-limits
  //    area was touched, so we must NOT silently pass — a low baseline has to be explicitly accepted (Codex
  //    GATE: otherwise must_not_change is un-checkable yet READY). "Can't see it" fails toward blocked.
  const riskInPlay = (activation.observed_categories || []).length > 0 || activation.unknown_impact || mustNotChange.length > 0;
  if (riskInPlay && activation.baseline_confidence === 'low' && !decisionOk(decisions['baseline-risk'])) {
    blockers.push('cannot trust the change baseline (no git/base_ref) — accept via .nb/decisions/<task>.baseline-risk.md');
  }

  // 7. open risks: unaccepted blocks; accepted -> READY WITH RISKS
  const openRisks = core.openRisks || 0;
  if (openRisks > 0 && !decisionOk(decisions['risks-accepted'])) {
    blockers.push(`${openRisks} open risk(s) not accepted — record .nb/decisions/<task>.risks-accepted.md or resolve them`);
  }

  // 7b. intent drift (P-c/#16): a drift signal grill/the AI recorded against the DoD/non_goals must be
  // acknowledged before close, exactly like an open risk — the drift judgment is the AI's, but the RESULT is
  // binding (a non-empty drift_risks without a valid drift-accepted decision blocks).
  const drift = Array.isArray(driftRisks) ? driftRisks.filter(Boolean) : [];
  if (drift.length > 0 && !decisionOk(decisions['drift-accepted'])) {
    blockers.push(`${drift.length} intent-drift risk(s) not accepted — resolve them or record .nb/decisions/<task>.drift-accepted.md`);
  }

  // 7c. model policy (the model-tier axis): an in-flight task needs a derived policy, and LOWERING the model
  // tier below the derived floor (a weak model on risky work) needs an explicit model-degrade decision. Computed
  // by close.mjs (which derives the floor from strength/workflow/preset); the engine just binds the result.
  if (modelPolicyMissing) blockers.push('model_policy not set — run /nb:plan (model-policy derives the portable model tier)');
  if (Array.isArray(modelBelowFloor) && modelBelowFloor.length && !decisionOk(decisions['model-degrade'])) {
    blockers.push(`model tier lowered below the derived floor (${modelBelowFloor.join('; ')}) — raise it, or accept via .nb/decisions/<task>.model-degrade.md`);
  }

  // 7d. review-budget axis: a review budget set BELOW the risk floor (fewer review rounds than the change's risk
  // demands) needs a human review-degrade decision. close.mjs computes the floor from the observed workflow/
  // categories/security; the engine binds the result (the required `review` artifact + two_round's
  // security-report-check are enforced via requiredArtifacts + the forced security pack above).
  if (reviewBudgetBelowFloor && !decisionOk(decisions['review-degrade'])) {
    blockers.push('review budget is below the risk floor (fewer review rounds than the change needs) — raise it, or accept via .nb/decisions/<task>.review-degrade.md');
  }
  // GENERAL two_round (review_budget two_round in a NON-security context): two review ROUNDS are required (two
  // perspectives / two families) — NOT the security-report-check. Security two_round is enforced separately via
  // the forced security pack (close.mjs). This keeps "빡쎄게" on UI/docs/backend from over-firing a security gate.
  if (generalTwoRound && (core.reviewCount || 0) < 2) {
    blockers.push(`review budget two_round needs a 2nd review round — ${core.reviewCount || 0}/2 review artifacts present (provide a round-2 review)`);
  }

  return verdict(errors, blockers, openRisks, warnings);
}

function verdict(errors, blockers, openRisks, warnings = []) {
  if (errors.length) return { verdict: 'CHECK_ERROR', exit: 2, errors, blockers, warnings };
  if (blockers.length) return { verdict: 'NOT_READY', exit: 1, errors, blockers, warnings };
  if (openRisks > 0) return { verdict: 'READY_WITH_RISKS', exit: 0, errors, blockers, warnings };
  return { verdict: 'READY', exit: 0, errors, blockers, warnings };
}
