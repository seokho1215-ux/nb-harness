// NB security-floor (pure, dependency-free) — the SINGLE source of truth for the two "security floor" notions,
// shared by model_policy and review_budget so they can't disagree. There are TWO sets, deliberately:
//
//   securityFloorOn (NARROW) — work that genuinely needs a red/blue SECURITY review: it forces review two_round
//     + the 2-round security-report-check. Categories: auth/secret/payment/code-execution/ci-security.
//   modelSecurityFloorOn (BROAD) — work that should at least run on the strongest model + a two-family review,
//     but doesn't necessarily need the heavy security report (it has its own gate): the NARROW set PLUS
//     supply-chain (vetted-deps decision) and deploy (devops proof). Cost = a better model, no extra artifact.
//
// This split is on purpose: "빡쎄게" on UI/docs/backend is a GENERAL 2-round review (two perspectives), NOT a
// security report; and an `npm install` (supply-chain) or a Dockerfile edit (deploy) gets a strong model without
// over-firing the full red/blue. Either floor is also on when the workflow is security-sensitive or the security
// pack is active.

export const SECURITY_CATEGORIES = new Set(['auth', 'secret', 'payment', 'code-execution', 'ci-security']);
export const MODEL_SECURITY_CATEGORIES = new Set([...SECURITY_CATEGORIES, 'supply-chain', 'deploy']);

// NARROW — forces review two_round + the security-report-check.
export function securityFloorOn({ workflow, categories = [], securityActive = false } = {}) {
  if (workflow === 'security-sensitive') return true;
  if (securityActive) return true;
  return (Array.isArray(categories) ? categories : []).some((c) => SECURITY_CATEGORIES.has(c));
}

// BROAD — forces the strongest model + a two-family review (model_policy security floor).
export function modelSecurityFloorOn({ workflow, categories = [], securityActive = false } = {}) {
  if (workflow === 'security-sensitive') return true;
  if (securityActive) return true;
  return (Array.isArray(categories) ? categories : []).some((c) => MODEL_SECURITY_CATEGORIES.has(c));
}
