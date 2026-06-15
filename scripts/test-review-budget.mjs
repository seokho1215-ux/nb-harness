#!/usr/bin/env node
// Tests for lib/review-budget.mjs — the user-steerable review axis. NB auto-derives a floor from workflow/risk;
// the user raises freely (plain language) but lowering below the floor needs a review-degrade decision.
import { deriveReviewFloor, parseReviewIntent, resolveReviewBudget, belowFloor, validateReviewBudget, reviewRequirements, compareLevel, LEVELS } from './lib/review-budget.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

// --- compareLevel ---
check('none < single < two_round', compareLevel('none', 'single') === -1 && compareLevel('single', 'two_round') === -1);
check('unknown ranks below', compareLevel('bogus', 'none') === -1);

// --- deriveReviewFloor ---
check('docs-only -> none', deriveReviewFloor({ workflow: 'docs-only' }) === 'none');
check('light-change -> none', deriveReviewFloor({ workflow: 'light-change' }) === 'none');
check('standard-feature -> single', deriveReviewFloor({ workflow: 'standard-feature' }) === 'single');
check('bugfix -> single', deriveReviewFloor({ workflow: 'bugfix' }) === 'single');
check('refactor -> single', deriveReviewFloor({ workflow: 'refactor' }) === 'single');
check('security-sensitive -> two_round', deriveReviewFloor({ workflow: 'security-sensitive' }) === 'two_round');
check('release -> two_round', deriveReviewFloor({ workflow: 'release' }) === 'two_round');
// SECURITY risk categories (narrow) -> two_round (they need a red/blue security review)
check('docs-only + auth (security) -> two_round', deriveReviewFloor({ workflow: 'docs-only', categories: ['auth'] }) === 'two_round');
check('docs-only + code-execution (security) -> two_round', deriveReviewFloor({ workflow: 'docs-only', categories: ['code-execution'] }) === 'two_round');
check('docs-only + secret (security) -> two_round', deriveReviewFloor({ workflow: 'docs-only', categories: ['secret'] }) === 'two_round');
// NON-security risk categories -> single (forbid none, but no red/blue): supply-chain/data/deploy have own gates
check('docs-only + supply-chain (risk, not security) -> single', deriveReviewFloor({ workflow: 'docs-only', categories: ['supply-chain'] }) === 'single');
check('docs-only + data (risk, not security) -> single', deriveReviewFloor({ workflow: 'docs-only', categories: ['data'] }) === 'single');
check('docs-only + deploy (risk, not security) -> single', deriveReviewFloor({ workflow: 'docs-only', categories: ['deploy'] }) === 'single');
// security pack active -> two_round regardless
check('security pack active -> two_round', deriveReviewFloor({ workflow: 'standard-feature', securityActive: true }) === 'two_round');
check('non-risk category leaves none', deriveReviewFloor({ workflow: 'docs-only', categories: ['something-benign'] }) === 'none');

// --- parseReviewIntent ---
check('"빡쎄게" -> two_round', parseReviewIntent('이거 빡쎄게 해줘') === 'two_round');
check('"빡세게" -> two_round', parseReviewIntent('빡세게') === 'two_round');
check('"강하게" -> two_round', parseReviewIntent('리뷰 강하게') === 'two_round');
check('"보안 빡세" -> two_round', parseReviewIntent('보안 빡세게 봐줘') === 'two_round');
check('"full review" -> two_round', parseReviewIntent('do a full review') === 'two_round');
check('"1회만" -> single', parseReviewIntent('리뷰 1회만') === 'single');
check('"한 번만 리뷰" -> single', parseReviewIntent('한 번만 리뷰하고') === 'single');
check('"single review" -> single', parseReviewIntent('just a single review') === 'single');
check('"넘어가" -> none', parseReviewIntent('리뷰 넘어가') === 'none');
check('"토큰 아껴" -> none', parseReviewIntent('토큰 아껴서 가자') === 'none');
check('"빠르게" -> none', parseReviewIntent('빠르게 가자') === 'none');
check('no review intent -> null', parseReviewIntent('add a login button') === null);

// --- resolveReviewBudget (raise-only vs floor) ---
check('no request -> floor', (() => { const r = resolveReviewBudget({ floor: 'single', request: null }); return r.level === 'single' && r.source === 'floor' && !r.belowFloor; })());
check('request above floor -> user_raise', (() => { const r = resolveReviewBudget({ floor: 'single', request: 'two_round' }); return r.level === 'two_round' && r.source === 'user_raise' && !r.belowFloor; })());
check('request equal to floor -> floor', resolveReviewBudget({ floor: 'single', request: 'single' }).source === 'floor');
check('request below floor -> user_degrade + belowFloor', (() => { const r = resolveReviewBudget({ floor: 'two_round', request: 'single' }); return r.level === 'single' && r.source === 'user_degrade' && r.belowFloor; })());
check('none below a single floor -> belowFloor', resolveReviewBudget({ floor: 'single', request: 'none' }).belowFloor === true);

// --- belowFloor ---
check('none below single', belowFloor('none', 'single'));
check('single not below single', !belowFloor('single', 'single'));
check('two_round not below single', !belowFloor('two_round', 'single'));

// --- validateReviewBudget ---
check('valid budget passes', validateReviewBudget({ level: 'single', source: 'auto', floor: 'single' }).length === 0);
check('bad level rejected', validateReviewBudget({ level: 'triple', source: 'auto' }).some((e) => /level/.test(e)));
check('bad source rejected', validateReviewBudget({ level: 'single', source: 'whatever' }).some((e) => /source/.test(e)));

// --- reviewRequirements ---
check('none requires no review', !reviewRequirements('none').requiresReview && !reviewRequirements('none').requiresTwoRound);
check('single requires review, not two_round', reviewRequirements('single').requiresReview && !reviewRequirements('single').requiresTwoRound);
check('two_round requires review + two_round', reviewRequirements('two_round').requiresReview && reviewRequirements('two_round').requiresTwoRound);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
