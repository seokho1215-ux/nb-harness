// NB review-budget engine (pure, dependency-free). A user-steerable axis SEPARATE from model_policy:
//   model_policy = which model TIER runs each lane · review_budget = HOW MANY review rounds (and how hard).
// NB auto-derives a floor from workflow + observed risk; the user can RAISE freely with plain language
// ("빡쎄게" / "full review") or REQUEST a lower budget ("1회만" / "넘어가" / "토큰 아껴") — but a budget BELOW
// the risk floor needs a human review-degrade decision (so a risky change can't quietly skip review).
//
// Levels (ascending): none < single < two_round.
//   none      — no review.
//   single    — one cross-family review.
//   two_round — TWO review rounds (two perspectives / two families). In a SECURITY context (lib/security-floor.mjs)
//               this is the red/blue 2-round security-report-check; in a general context it's just two reviews —
//               close.mjs decides which by securityFloorOn(), so "빡쎄게" on UI/docs doesn't force a security report.
import { securityFloorOn } from './security-floor.mjs';

export const LEVELS = ['none', 'single', 'two_round'];
export const SOURCES = ['auto', 'user_raise', 'user_degrade', 'preset', 'floor'];

// Risk categories that FORBID `none` (a detected risk floors review at >= single). Mirrors lib/activation.mjs
// CATEGORIES ids + the supply-chain/ci-security/code-execution content categories.
export const RISK_CATS = new Set(['auth', 'payment', 'secret', 'data', 'deploy', 'delete', 'network', 'mcp', 'supply-chain', 'ci-security', 'code-execution']);

const rank = (l) => { const i = LEVELS.indexOf(l); return i < 0 ? -1 : i; };
// compare two levels: -1 (a<b) / 0 / 1. An unknown level ranks -1 (below any real level — fail safe).
export function compareLevel(a, b) { const x = rank(a), y = rank(b); return x < y ? -1 : x > y ? 1 : 0; }
const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);

// Derive the review-budget FLOOR from { workflow, categories[], securityActive }.
//   docs-only / light-change            -> none
//   standard-feature / bugfix / refactor / full-feature -> single
//   security-sensitive / release        -> two_round
//   any RISK_CATS observed              -> at least single (never none)
//   security pack active OR security-sensitive -> two_round
export function deriveReviewFloor({ workflow, categories = [], securityActive = false } = {}) {
  let floor = 'none';
  if (['standard-feature', 'bugfix', 'refactor', 'full-feature'].includes(workflow)) floor = 'single';
  if (['security-sensitive', 'release'].includes(workflow)) floor = 'two_round';
  const cats = Array.isArray(categories) ? categories : [];
  if (cats.some((c) => RISK_CATS.has(c))) floor = maxLevel(floor, 'single');
  // a security floor (security-sensitive / security pack / a SECURITY category) demands two rounds.
  if (securityFloorOn({ workflow, categories: cats, securityActive })) floor = 'two_round';
  return floor;
}

// Parse a plain-language review intent into a REQUESTED level (or null = no review intent expressed).
//   raise to two_round : 빡쎄게/빡세게/강하게/보안 빡세/full review/two round/두 번/2회/red-blue
//   request single     : 1회만/한 번만/single review/1 round/한 차례
//   request none       : 넘어가/생략/스킵/skip/토큰 아껴/아끼/빠르게/빨리/no review/리뷰 없
export function parseReviewIntent(text) {
  const s = String(text || '');
  if (/빡\s*[쎄세]\s*게|강하게|보안\s*빡|풀\s*리뷰|full\s*review|two[\s_-]?round|두\s*번|2\s*회|레드\s*블루|red[\s_-]?blue|빡세/i.test(s)) return 'two_round';
  if (/1\s*회만|한\s*번만|한번만|single\s*review|single|1\s*round|한\s*차례|딱\s*한/i.test(s)) return 'single';
  if (/넘어가|생략|스킵|skip|토큰\s*아껴|아끼|빠르게|빨리|리뷰\s*없|no\s*review|리뷰\s*건너|건너[�뜀]/i.test(s)) return 'none';
  return null;
}

// Is `level` below the `floor` (a degrade that needs a review-degrade decision)?
export function belowFloor(level, floor) { return compareLevel(level, floor) < 0; }

// Resolve a requested level against the floor. Returns { level, source, belowFloor }.
//   no request            -> the floor (source 'floor').
//   request above floor   -> the request (source 'user_raise').
//   request equal to floor -> the floor (source 'floor').
//   request below floor   -> the request, flagged belowFloor (source 'user_degrade') — caller gates on a decision.
export function resolveReviewBudget({ floor, request }) {
  if (request == null) return { level: floor, source: 'floor', belowFloor: false };
  const c = compareLevel(request, floor);
  if (c > 0) return { level: request, source: 'user_raise', belowFloor: false };
  if (c === 0) return { level: floor, source: 'floor', belowFloor: false };
  return { level: request, source: 'user_degrade', belowFloor: true };
}

// Validate a persisted state.review_budget block. Returns an array of error strings (empty = ok).
export function validateReviewBudget(rb) {
  const errors = [];
  if (!rb || typeof rb !== 'object') return ['review_budget is not an object'];
  if (!LEVELS.includes(rb.level)) errors.push(`review_budget.level must be one of ${LEVELS.join('|')} (got ${JSON.stringify(rb.level)})`);
  if (rb.source != null && !SOURCES.includes(rb.source)) errors.push(`review_budget.source must be one of ${SOURCES.join('|')} (got ${JSON.stringify(rb.source)})`);
  return errors;
}

// The enforceable requirements a level implies (consumed by close/score):
//   requiresReview  — a review artifact is required (single + two_round).
//   requiresTwoRound— the 2-round red/blue (security-report-check) is required (two_round only).
export function reviewRequirements(level) {
  return { requiresReview: rank(level) >= rank('single'), requiresTwoRound: level === 'two_round' };
}
