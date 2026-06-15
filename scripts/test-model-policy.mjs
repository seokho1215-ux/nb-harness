#!/usr/bin/env node
// Tests for lib/model-policy.mjs — the portable model-tier axis. NB DERIVES the tier from strength/workflow/
// preset (raise-only); lowering below the floor is what needs a decision. Vendor-neutral tiers only.
import { deriveModelPolicy, compareTier, validateModelPolicy, belowFloor, raiseOnly, TIERS } from './lib/model-policy.mjs';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log(`OK   ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };

// --- compareTier ---
check('compareTier fast<strong', compareTier('fast', 'strong') === -1);
check('compareTier strongest>strong', compareTier('strongest', 'strong') === 1);
check('compareTier equal', compareTier('balanced', 'balanced') === 0);
check('compareTier unknown ranks below', compareTier('bogus', 'fast') === -1);

// --- deriveModelPolicy (raise-only) ---
const light = deriveModelPolicy({ strength: 'light', workflow: 'docs-only' });
check('light/docs-only: implement fast', light.implement === 'fast' && light.family === 'single' && light.security === null);
const std = deriveModelPolicy({ strength: 'standard', workflow: 'standard-feature' });
check('standard: implement balanced, review strong', std.implement === 'balanced' && std.review === 'strong');
const full = deriveModelPolicy({ strength: 'full', workflow: 'full-feature' });
check('full: implement strong + cross-family + security strong', full.implement === 'strong' && full.family === 'cross-family' && full.security === 'strong');
const sec = deriveModelPolicy({ strength: 'full', workflow: 'security-sensitive' });
check('security-sensitive: planner/review strongest + two-family', sec.planner === 'strongest' && sec.review === 'strongest' && sec.family === 'two-family' && sec.security === 'strongest');
const rel = deriveModelPolicy({ strength: 'standard', workflow: 'release' });
check('release raises even at standard strength (strongest/two-family)', rel.planner === 'strongest' && rel.family === 'two-family');

// preset raises: min_strength bumps the base; cross_family bumps the family
const pmin = deriveModelPolicy({ strength: 'light', workflow: 'standard-feature', preset: { min_strength: 'full' } });
check('preset min_strength=full lifts a light task to the full base', pmin.implement === 'strong' && pmin.family === 'cross-family');
const pcf = deriveModelPolicy({ strength: 'standard', workflow: 'standard-feature', preset: { cross_family: true } });
check('preset cross_family raises family to cross-family', pcf.family === 'cross-family');

// unknown strength defaults to standard (not below)
check('unknown strength -> standard base', deriveModelPolicy({ strength: undefined, workflow: 'standard-feature' }).implement === 'balanced');

// securityFloor forces the strongest model + two-family review (even on a standard-feature task)
const secFloor = deriveModelPolicy({ strength: 'standard', workflow: 'standard-feature', securityFloor: true });
check('securityFloor -> review/security strongest + two-family', secFloor.review === 'strongest' && secFloor.security === 'strongest' && secFloor.family === 'two-family' && secFloor.planner === 'strongest');
check('no securityFloor on standard-feature stays balanced/single', deriveModelPolicy({ strength: 'standard', workflow: 'standard-feature', securityFloor: false }).family === 'single');

// --- validateModelPolicy ---
check('valid policy passes', validateModelPolicy(full).length === 0);
check('bad tier rejected', validateModelPolicy({ ...full, implement: 'turbo' }).some((e) => /implement/.test(e)));
check('bad family rejected', validateModelPolicy({ ...full, family: 'mono' }).some((e) => /family/.test(e)));
check('security may be null', validateModelPolicy({ ...std, security: null }).length === 0);

// --- belowFloor ---
const floor = deriveModelPolicy({ strength: 'full', workflow: 'security-sensitive' });
check('a fast implement is below the security floor', belowFloor({ ...floor, implement: 'fast' }, floor).some((s) => /implement/.test(s)));
check('a single family is below a two-family floor', belowFloor({ ...floor, family: 'single' }, floor).some((s) => /family/.test(s)));
check('meeting the floor -> nothing below', belowFloor(floor, floor).length === 0);
check('exceeding the floor -> nothing below', belowFloor({ ...floor, implement: 'strongest' }, floor).length === 0);
check('null security when floor requires it is below', belowFloor({ ...floor, security: null }, floor).some((s) => /security/.test(s)));

// --- raiseOnly: never lowers a user-raised policy; bumps a stale-low one up to the floor ---
const raised = raiseOnly(std, { ...std, implement: 'strongest' });
check('raiseOnly keeps a higher user tier', raised.implement === 'strongest');
const bumped = raiseOnly(full, { planner: 'fast', implement: 'fast', review: 'fast', family: 'single' });
check('raiseOnly bumps a stale-low policy up to the floor', compareTier(bumped.implement, full.implement) === 0 && bumped.family === full.family);

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
