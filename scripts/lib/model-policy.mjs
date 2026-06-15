// NB model-policy engine (pure, dependency-free). A SEPARATE axis from preset: preset = how strict the GATES are
// (which artifacts/proofs are required); model_policy = which portable model TIER should execute each lane. NB
// DERIVES the policy from strength/workflow/preset (no per-task model picking) and only asks the human to
// intervene when LOWERING a lane below the derived floor (a model-degrade decision). Raising is free.
//
// Vendor-neutral on purpose — NB never names Claude/GPT/etc.; it derives a tool-agnostic tier the adapter maps to
// a concrete model. Tiers (ascending): fast < balanced < strong < strongest. Family (ascending): single <
// cross-family < two-family (two distinct AI families both required, e.g. red+blue from different vendors).

export const TIERS = ['fast', 'balanced', 'strong', 'strongest'];
export const FAMILIES = ['single', 'cross-family', 'two-family'];
export const LANES = ['planner', 'implement', 'review', 'security'];

const tRank = (t) => { const i = TIERS.indexOf(t); return i < 0 ? -1 : i; };
const fRank = (f) => { const i = FAMILIES.indexOf(f); return i < 0 ? -1 : i; };
// compare two tiers: -1 (a<b) / 0 / 1. Unknown tiers rank -1 (so an invalid tier is "below" any real one).
export function compareTier(a, b) { const x = tRank(a), y = tRank(b); return x < y ? -1 : x > y ? 1 : 0; }
const maxTier = (a, b) => (tRank(a) >= tRank(b) ? a : b);
const maxFamily = (a, b) => (fRank(a) >= fRank(b) ? a : b);

const RANK_STR = { light: 1, standard: 2, full: 3 };

// Base policy per task strength.
const STRENGTH_BASE = {
  light: { planner: 'balanced', implement: 'fast', review: 'balanced', security: null, family: 'single' },
  standard: { planner: 'balanced', implement: 'balanced', review: 'strong', security: null, family: 'single' },
  full: { planner: 'strong', implement: 'strong', review: 'strong', security: 'strong', family: 'cross-family' },
};
// Workflows that RAISE the floor regardless of strength (security-sensitive / release are high-stakes).
const WORKFLOW_RAISE = {
  'security-sensitive': { planner: 'strongest', implement: 'strong', review: 'strongest', security: 'strongest', family: 'two-family' },
  'release': { planner: 'strongest', implement: 'strong', review: 'strongest', security: 'strongest', family: 'two-family' },
};

// Derive the model policy FLOOR from { strength, workflow, preset:{min_strength?, cross_family?} }. Raise-only by
// construction: each lane = the MAX tier across strength-base ∪ workflow-raise; family folds in preset.cross_family.
export function deriveModelPolicy({ strength, workflow, preset } = {}) {
  const presetMin = preset && preset.min_strength;
  const effRank = Math.max(RANK_STR[strength] || RANK_STR.standard, RANK_STR[presetMin] || 0);
  const effStrength = effRank >= 3 ? 'full' : effRank === 2 ? 'standard' : 'light';
  const base = STRENGTH_BASE[effStrength];
  const wf = WORKFLOW_RAISE[workflow] || {};

  const pol = {
    planner: maxTier(base.planner, wf.planner || 'fast'),
    implement: maxTier(base.implement, wf.implement || 'fast'),
    review: maxTier(base.review, wf.review || 'fast'),
    family: maxFamily(maxFamily(base.family, wf.family || 'single'), (preset && preset.cross_family) ? 'cross-family' : 'single'),
  };
  // security lane: set when the base/workflow puts security in play OR a cross-family+ family is required.
  const secBase = wf.security || base.security;
  pol.security = secBase || (fRank(pol.family) >= fRank('cross-family') ? 'strong' : null);
  pol.reason = `derived from strength ${effStrength}${workflow ? `, workflow ${workflow}` : ''}${presetMin ? `, preset min ${presetMin}` : ''}${preset && preset.cross_family ? ', preset cross-family' : ''}`;
  return pol;
}

// Validate a persisted model_policy's shape. Returns an array of error strings (empty = ok).
export function validateModelPolicy(policy) {
  const errors = [];
  if (!policy || typeof policy !== 'object') return ['model_policy is not an object'];
  for (const lane of ['planner', 'implement', 'review']) {
    if (!TIERS.includes(policy[lane])) errors.push(`model_policy.${lane} must be one of ${TIERS.join('|')} (got ${JSON.stringify(policy[lane])})`);
  }
  if (policy.security != null && !TIERS.includes(policy.security)) errors.push(`model_policy.security must be a tier or null (got ${JSON.stringify(policy.security)})`);
  if (!FAMILIES.includes(policy.family)) errors.push(`model_policy.family must be one of ${FAMILIES.join('|')} (got ${JSON.stringify(policy.family)})`);
  return errors;
}

// Which lanes/family of `policy` sit BELOW the derived `floor` (i.e. a degrade that needs a model-degrade
// decision)? Returns a list of human-readable strings (empty = policy meets or exceeds the floor).
export function belowFloor(policy = {}, floor = {}) {
  const out = [];
  for (const lane of ['planner', 'implement', 'review']) {
    if (compareTier(policy[lane], floor[lane]) < 0) out.push(`${lane} ${policy[lane]} < required ${floor[lane]}`);
  }
  // security: floor may require a tier; a null/lower policy security when the floor wants one is a degrade.
  if (floor.security && (policy.security == null || compareTier(policy.security, floor.security) < 0)) {
    out.push(`security ${policy.security || 'none'} < required ${floor.security}`);
  }
  if (fRank(policy.family) < fRank(floor.family)) out.push(`family ${policy.family} < required ${floor.family}`);
  return out;
}

// Merge a derived floor with an existing policy RAISE-ONLY: keep the higher tier/family per lane (so a re-derive
// never lowers a user-raised policy, and a stale low policy is bumped up to the new floor).
export function raiseOnly(floor = {}, existing = {}) {
  if (!existing || typeof existing !== 'object') return { ...floor };
  const out = { reason: floor.reason };
  for (const lane of ['planner', 'implement', 'review']) out[lane] = maxTier(floor[lane], TIERS.includes(existing[lane]) ? existing[lane] : 'fast');
  out.security = floor.security && existing.security ? maxTier(floor.security, existing.security) : (existing.security && TIERS.includes(existing.security) ? maxTier(floor.security || 'fast', existing.security) : floor.security);
  out.family = maxFamily(floor.family, FAMILIES.includes(existing.family) ? existing.family : 'single');
  return out;
}
