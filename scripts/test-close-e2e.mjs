#!/usr/bin/env node
// End-to-end /nb:close tests through the REAL CLI against REAL pack contracts (packs/*/nb-pack.json).
// This is the integration the injected close-engine tests can't reach: close.mjs's own loaders
// (loadPackData / loadProofs / loadReviews / loadDecisions / loadEvents) + resolveActivation + the 3-way
// analytical hash binding, all wired together. Answers Codex GATE-1 §6.3 ("does the contract path actually
// close end-to-end?"). Dependency-free; drives close.mjs with NB_DIR pointing at a temp .nb.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { reviewBodyHash, REVIEW_BODY_START, REVIEW_BODY_END } from './lib/proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLOSE = join(ROOT, 'scripts', 'close.mjs');
let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

function tmpNb() {
  const t = mkdtempSync(join(tmpdir(), 'nb-e2e-'));
  for (const d of ['evidence', 'reviews', 'briefs', 'decisions', 'proofs', 'logs']) mkdirSync(join(t, '.nb', d), { recursive: true });
  return join(t, '.nb');
}
const run = (nb) => spawnSync('node', [CLOSE], { encoding: 'utf8', env: { ...process.env, NB_DIR: nb } });
const wj = (p, o) => writeFileSync(p, JSON.stringify(o));
const wf = (p, s) => writeFileSync(p, s);
// Build a cross-review artifact (provenance + canonical body) and the hook hash that binds it.
function review(nb, slug, body) {
  const block = `${REVIEW_BODY_START}\n${body}\n${REVIEW_BODY_END}\n`;
  const h = reviewBodyHash(block);
  const art = `<!-- NB_REVIEW_PROVENANCE\nreviewer: codex\nexit_status: 0\nmanual_fallback: false\noutput_sha256: ${h}\n-->\n${block}`;
  wf(join(nb, 'reviews', `${slug}.cross-review.md`), art);
  return h;
}
// Core five: task state + matching evidence/review/brief files.
function core(nb, slug, extra = {}) {
  wj(join(nb, 'state.json'), { current_task: slug, current_task_slug: slug, current_workflow: 'standard-feature',
    intent_summary: `do ${slug}`, last_evidence: `.nb/evidence/${slug}.md`, last_review: `.nb/reviews/${slug}.md`,
    last_brief: `.nb/briefs/${slug}.md`, ...extra });
  wf(join(nb, 'evidence', `${slug}.md`), 'e'); wf(join(nb, 'reviews', `${slug}.md`), 'r'); wf(join(nb, 'briefs', `${slug}.md`), 'b');
}
const decision = (nb, slug, kind, what) => wf(join(nb, 'decisions', `${slug}.${kind}.md`),
  `task: ${slug}\nkind: ${kind}\ndecision: ${what}\nrationale: This is a real, considered rationale with enough substance to pass the deep decision check.\napproved_by: Maintainer\ntimestamp: 2026-06-11\n`);

// ---- 1) ANALYTICAL contract path, end-to-end -> READY (product pack, declared) -----------------------
{
  const nb = tmpNb(); const slug = 'add-dod';
  core(nb, slug, { declared_packs: ['product'], strength_level: 'standard' });
  const h = review(nb, slug, 'Reviewed: definition-of-done-met and non-goals-respected. No blockers.');
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }) + '\n');
  wj(join(nb, 'proofs', `${slug}.product.json`), { task: slug, pack: 'product', proof_type: 'dod-covered', timestamp: '2026-06-11T00:00:00Z',
    review_artifact: `.nb/reviews/${slug}.cross-review.md`,
    covers_claims: [ { claim_id: 'definition-of-done-met', verdict: 'pass', evidence_ref: 'review-body' },
                     { claim_id: 'non-goals-respected', verdict: 'pass', evidence_ref: 'review-body' } ] });
  const r = run(nb);
  check('analytical contract (product) closes -> READY', /✓ READY/.test(r.stdout) && r.status === 0);
  // negative: drop the hook event -> the review was not observed to run -> NOT_READY
  wf(join(nb, 'logs', 'tool-events.jsonl'), '');
  const r2 = run(nb);
  check('analytical w/o hook-logged review -> NOT_READY', /NOT READY/.test(r2.stdout) && r2.status === 1);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2) OBJECTIVE + ANALYTICAL + category floor, end-to-end -> READY (data pack, observed) -----------
{
  const nb = tmpNb(); const slug = 'add-orders-table';
  core(nb, slug, { strength_level: 'full' });
  const h = review(nb, slug, 'Migration review: reversible and no-data-loss confirmed against up/down output.');
  // observed: the migrate commands activate the data pack AND trip the Core 'data' category floor (full)
  wf(join(nb, 'logs', 'tool-events.jsonl'),
    JSON.stringify({ tool: 'Bash', ok: true, cmd: 'npm run migrate:up' }) + '\n' +
    JSON.stringify({ tool: 'Bash', ok: true, cmd: 'npm run migrate:down' }) + '\n' +
    JSON.stringify({ tool: 'Bash', ok: true, cross_review: true, stdout_hash: h }) + '\n');
  wj(join(nb, 'proofs', `${slug}.up.json`), { task: slug, pack: 'data', proof_type: 'migration-up', command: 'npm run migrate:up', exit_code: 0, output_excerpt: 'applied 1 migration', timestamp: '2026-06-11T00:00:00Z' });
  wj(join(nb, 'proofs', `${slug}.down.json`), { task: slug, pack: 'data', proof_type: 'migration-down', command: 'npm run migrate:down', exit_code: 0, output_excerpt: 'reverted 1 migration', timestamp: '2026-06-11T00:00:00Z' });
  wj(join(nb, 'proofs', `${slug}.rollback.json`), { task: slug, pack: 'data', proof_type: 'rollback-safety', timestamp: '2026-06-11T00:00:00Z',
    review_artifact: `.nb/reviews/${slug}.cross-review.md`,
    covers_claims: [ { claim_id: 'reversible', verdict: 'pass', evidence_ref: 'review-body' },
                     { claim_id: 'no-data-loss', verdict: 'pass', evidence_ref: 'review-body' } ] });
  // category floor (data, full) + low-confidence baseline (no git) both need a decision
  decision(nb, slug, 'data', 'Accept the additive, reversible orders-table migration.');
  decision(nb, slug, 'baseline-risk', 'Accept the untracked baseline for this sandboxed migration test.');
  const r = run(nb);
  check('objective+analytical+floor (data) closes -> READY', /✓ READY/.test(r.stdout) && r.status === 0);
  // negative: drop the rollback (down) proof -> NOT_READY (firewall blocks an unproven rollback)
  rmSync(join(nb, 'proofs', `${slug}.down.json`), { force: true });
  const r2 = run(nb);
  check('missing migration-down proof -> NOT_READY', /NOT READY/.test(r2.stdout) && r2.status === 1 && /migration-down/.test(r2.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2b) P1 regression: release pack at DEFAULT (standard) strength must REQUIRE its gate proof ----------
// release has no Core category to floor it; its release-check was 'full' and so was silently skipped at
// standard, letting a release close without the gate. Now 'standard' -> required at default strength.
{
  const nb = tmpNb(); const slug = 'cut-release';
  core(nb, slug, { declared_packs: ['release'], strength_level: 'standard' });
  const r = run(nb);
  check('release at standard strength requires release-check -> NOT_READY', /NOT READY/.test(r.stdout) && r.status === 1 && /release-check/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2b2) release pack at FULL strength requires the publish-file-list hygiene proof (strong-bound) -------
{
  const nb = tmpNb(); const slug = 'cut-release-full';
  core(nb, slug, { declared_packs: ['release'], strength_level: 'full' });
  const r = run(nb);
  check('release at full strength requires publish-file-list -> NOT_READY', /NOT READY/.test(r.stdout) && r.status === 1 && /publish-file-list/.test(r.stdout));
  // Codex GATE blocker: a HAND-WRITTEN publish-file-list proof + a matching `npm pack` log line (no run_id
  // binding) must NOT satisfy it — publish-file-list requires the strong run_id binding only publish-check mints.
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Bash', ok: true, cmd: 'npm pack --dry-run --json' }) + '\n');
  wj(join(nb, 'proofs', `${slug}.release.publish-file-list.json`), { task: slug, pack: 'release', proof_type: 'publish-file-list', command: 'npm pack --dry-run --json', exit_code: 0, output_excerpt: 'published 3 files, 0 risky', timestamp: '2026-06-11T00:00:00Z' });
  const r2 = run(nb);
  check('hand-written publish-file-list (command-log fallback) STILL NOT_READY', /NOT READY/.test(r2.stdout) && r2.status === 1 && /publish-file-list/.test(r2.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2c) security pack active without its security-report-check objective proof -> NOT_READY ------------
{
  const nb = tmpNb(); const slug = 'add-auth';
  core(nb, slug, { declared_packs: ['security'], strength_level: 'full' });
  const r = run(nb);
  check('security pack active w/o security-report-check -> NOT_READY', /NOT READY/.test(r.stdout) && r.status === 1 && /security-report-check/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2d) #20: the security-sensitive WORKFLOW forces the security gate even with a benign diff ------------
// No declared security pack, no auth/secret pattern in the diff — choosing the workflow alone must require
// security-report-check (forced pack + full floor). The same benign task on a normal workflow closes.
{
  const nb = tmpNb(); const slug = 'tweak-copy';
  core(nb, slug, { current_workflow: 'security-sensitive', strength_level: 'full' });
  const r = run(nb);
  check('security-sensitive workflow (benign diff) -> NOT_READY on security-report-check',
    /NOT READY/.test(r.stdout) && r.status === 1 && /security-report-check/.test(r.stdout));
  // contrast: identical benign task under standard-feature (no forced pack) -> READY
  core(nb, slug, { current_workflow: 'standard-feature', strength_level: 'standard' });
  const r2 = run(nb);
  check('same benign task under standard-feature -> READY (gate is workflow-triggered)',
    /✓ READY/.test(r2.stdout) && r2.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2e) M1: an applied PRESET raises the required artifacts (raise-only) -----------------------------
// docs-only requires only evidence. With no preset the task closes. Applying the strict gate profile
// (review/evidence/brief required) must now BLOCK on the missing review + brief; a no-extra (starter-style)
// preset must NOT pull docs-only below its evidence-only requirement — a preset can only tighten, never loosen.
{
  const nb = tmpNb(); const slug = 'tweak-docs';
  wf(join(nb, 'evidence', `${slug}.md`), 'e'); // evidence only; NO review/brief
  const base = { current_task: slug, current_task_slug: slug, current_workflow: 'docs-only',
    intent_summary: `do ${slug}`, last_evidence: `.nb/evidence/${slug}.md`, strength_level: 'light' };
  wj(join(nb, 'state.json'), base);
  const r0 = run(nb);
  check('docs-only, evidence only, no preset -> READY', /✓ READY/.test(r0.stdout) && r0.status === 0);
  wj(join(nb, 'state.json'), { ...base, preset: { id: 'strict', gates: { require_artifacts: ['review', 'evidence', 'brief'], min_strength: 'full', cross_family: true } } });
  const r1 = run(nb);
  check('strict preset forces review+brief on docs-only -> NOT_READY', /NOT READY/.test(r1.stdout) && r1.status === 1 && /review/.test(r1.stdout) && /brief/.test(r1.stdout));
  wj(join(nb, 'state.json'), { ...base, preset: { id: 'starter', gates: { require_artifacts: [], min_strength: null, cross_family: false } } });
  const r2 = run(nb);
  check('starter preset (no extra) keeps docs-only closeable -> READY', /✓ READY/.test(r2.stdout) && r2.status === 0);
  // a hand-edited garbage gate block must not forge/lower a gate (statePresetGates re-validates on read)
  wj(join(nb, 'state.json'), { ...base, preset: { id: 'evil', gates: { require_artifacts: 'rm -rf', min_strength: 'godmode' } } });
  const r3 = run(nb);
  check('garbage preset gates are ignored, not honored -> READY (cannot lower the floor either)', /✓ READY/.test(r3.stdout) && r3.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2f) supply-chain category: a dependency change needs a vetted-deps decision at close ----------------
// An install command (or lockfile change) trips the `supply-chain` Core category -> a decision artifact
// ("these dependencies were vetted") is required before close. This is the firewall half of the slopsquatting
// gate (the pre-tool-use hook does the live registry existence check). Mirrors the data-category floor path.
{
  const nb = tmpNb(); const slug = 'add-dep';
  core(nb, slug, { strength_level: 'standard' });
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Bash', ok: true, cmd: 'npm install left-pad' }) + '\n');
  const r = run(nb);
  check('supply-chain change w/o decision -> NOT_READY (needs vetted-deps ack)', /NOT READY/.test(r.stdout) && r.status === 1 && /supply-chain/.test(r.stdout));
  decision(nb, slug, 'supply-chain', 'Reviewed the added dependency left-pad: exists on npm, reputable, pinned.');
  decision(nb, slug, 'baseline-risk', 'Accept the untracked baseline for this sandboxed supply-chain test.');
  const r2 = run(nb);
  check('supply-chain change WITH a vetted-deps decision -> READY', /✓ READY/.test(r2.stdout) && r2.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2g) ci-security: a dangerous GitHub Actions change forces a SECURITY review at close ----------------
// A workflow with `pull_request_target` + an untrusted-head checkout is the "pwn request" pattern. The CI scan
// raises `ci-security` -> full floor + security pack implied -> close requires security-report-check (beyond the
// devops a plain workflow change gives). A hardened workflow does NOT trip it.
{
  const nb = tmpNb(); const root = resolve(nb, '..'); const slug = 'add-ci';
  core(nb, slug, { strength_level: 'standard' });
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
  const evil = 'on: pull_request_target\njobs:\n  b:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: npm ci\n';
  wf(join(root, '.github', 'workflows', 'evil.yml'), evil);
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Write', ok: true, path: '.github/workflows/evil.yml' }) + '\n');
  const r = run(nb);
  check('dangerous workflow -> NOT_READY on security-report-check (ci-security forces security)', /NOT READY/.test(r.stdout) && r.status === 1 && /security-report-check/.test(r.stdout));
  rmSync(root, { recursive: true, force: true });
}

// ---- 2h) review-budget axis: floor forbids skipping review on risky work; two_round forces the 2-round gate --
{
  // code-execution observed (eval in a changed file) -> security implied -> review floor two_round; a hand-set
  // review_budget=none is below the floor and has no review-degrade decision -> blocked.
  const nb = tmpNb(); const root = resolve(nb, '..'); const slug = 'risky-exec';
  core(nb, slug, { strength_level: 'standard', review_budget: { level: 'none', source: 'user_degrade', floor: 'two_round' } });
  mkdirSync(join(root, 'src'), { recursive: true });
  wf(join(root, 'src', 'run.js'), `${'ev' + 'al'}(userInput)\n`); // a code-execution sink, assembled at runtime so this source holds no literal call
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Write', ok: true, path: 'src/run.js' }) + '\n');
  const r = run(nb);
  check('code-execution + review_budget none -> NOT_READY (review below floor)', /NOT READY/.test(r.stdout) && r.status === 1 && /review budget is below the risk floor/.test(r.stdout));
  rmSync(root, { recursive: true, force: true });
}
{
  // docs-only with no risk -> floor none -> review_budget none is allowed -> READY (evidence only, no review).
  const nb = tmpNb(); const slug = 'tweak-docs2';
  wf(join(nb, 'evidence', `${slug}.md`), 'e');
  wj(join(nb, 'state.json'), { current_task: slug, current_task_slug: slug, current_workflow: 'docs-only', intent_summary: `do ${slug}`, last_evidence: `.nb/evidence/${slug}.md`, strength_level: 'light', review_budget: { level: 'none', source: 'auto', floor: 'none' } });
  const r = run(nb);
  check('docs-only + review_budget none -> READY (floor none, review not required)', /✓ READY/.test(r.stdout) && r.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}
{
  // two_round in a SECURITY context (declared security pack) forces the 2-round security-report-check.
  const nb = tmpNb(); const slug = 'hard-sec';
  core(nb, slug, { strength_level: 'full', declared_packs: ['security'], review_budget: { level: 'two_round', source: 'auto', floor: 'two_round' } });
  const r = run(nb);
  check('two_round in a SECURITY context forces security-report-check -> NOT_READY', /NOT READY/.test(r.stdout) && r.status === 1 && /security-report-check/.test(r.stdout));
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}
{
  // GENERAL two_round (UI/docs/backend "빡쎄게") needs a 2nd review ROUND — NOT the security-report-check.
  const nb = tmpNb(); const slug = 'hard-ui';
  core(nb, slug, { strength_level: 'standard', review_budget: { level: 'two_round', source: 'user_raise', floor: 'single' } });
  const r = run(nb);
  check('general two_round needs a 2nd review round (not security-report-check)', /NOT READY/.test(r.stdout) && r.status === 1 && /2nd review round/.test(r.stdout) && !/security-report-check/.test(r.stdout));
  // add a 2nd review artifact -> the 2-round requirement is met (general review, no security report)
  wf(join(nb, 'reviews', `${slug}.round2.md`), `Task: ${slug}\nsecond review round.`);
  const r2 = run(nb);
  check('general two_round with 2 review artifacts -> READY', /✓ READY/.test(r2.stdout) && r2.status === 0);
  rmSync(resolve(nb, '..'), { recursive: true, force: true });
}

// ---- 2j) general two_round reviewCount counts ONLY unique, task-matched review rounds --------------------
{
  const general = (slug, reviews, ledgerDupOf) => {
    const nb = tmpNb();
    wf(join(nb, 'evidence', `${slug}.md`), 'e'); wf(join(nb, 'briefs', `${slug}.md`), 'b');
    for (const rv of reviews) wf(join(nb, 'reviews', rv.name), rv.body);
    wj(join(nb, 'state.json'), { current_task: slug, current_task_slug: slug, current_workflow: 'standard-feature', intent_summary: `do ${slug}`, last_evidence: `.nb/evidence/${slug}.md`, last_review: `.nb/reviews/${reviews[0].name}`, last_brief: `.nb/briefs/${slug}.md`, strength_level: 'standard', review_budget: { level: 'two_round', source: 'user_raise', floor: 'single' } });
    if (ledgerDupOf) wf(join(nb, 'artifacts.jsonl'), [1, 2].map(() => JSON.stringify({ ts: 't', type: 'review', task_slug: slug, status: 'current', path: `.nb/reviews/${ledgerDupOf}` })).join('\n') + '\n');
    const r = run(nb); rmSync(resolve(nb, '..'), { recursive: true, force: true }); return r;
  };
  // one review, but the ledger lists it twice -> still 1 unique round -> NOT_READY
  check('general two_round: ledger double-count of one review -> NOT_READY',
    (() => { const r = general('dupe', [{ name: 'dupe.r1.md', body: 'Task: dupe\nround one' }], 'dupe.r1.md'); return /NOT READY/.test(r.stdout) && /2nd review round/.test(r.stdout); })());
  // round-1 task-matched + two OTHER-task reviews present -> they don't count -> 1 round -> NOT_READY
  check('general two_round: other-task reviews do not count -> NOT_READY',
    (() => { const r = general('mine', [{ name: 'mine.r1.md', body: 'Task: mine\nround one' }, { name: 'x1.md', body: 'Task: elsewhere\na' }, { name: 'x2.md', body: 'Task: elsewhere\nb' }]); return /NOT READY/.test(r.stdout) && /2nd review round/.test(r.stdout); })());
  // two task-matched reviews with IDENTICAL content (a copy) -> dedup by content -> 1 round -> NOT_READY
  check('general two_round: identical-content copies count once -> NOT_READY',
    (() => { const r = general('copyr', [{ name: 'copyr.r1.md', body: 'Task: copyr\nsame body' }, { name: 'copyr.r2.md', body: 'Task: copyr\nsame body' }]); return /NOT READY/.test(r.stdout) && /2nd review round/.test(r.stdout); })());
  // a manual review laundered by WHITESPACE ONLY (CRLF / trailing spaces / extra blank lines) -> same key -> NOT_READY
  check('general two_round: whitespace-only variant of one review counts once -> NOT_READY',
    (() => { const r = general('wash', [{ name: 'wash.r1.md', body: 'Task: wash\nthe review body' }, { name: 'wash.r2.md', body: 'Task: wash\r\nthe review body   \n\n\n' }]); return /NOT READY/.test(r.stdout) && /2nd review round/.test(r.stdout); })());
  // two DISTINCT task-matched reviews -> 2 rounds -> READY
  check('general two_round: two distinct task-matched reviews -> READY',
    (() => { const r = general('twor', [{ name: 'twor.r1.md', body: 'Task: twor\nround one' }, { name: 'twor.r2.md', body: 'Task: twor\nround two' }]); return /✓ READY/.test(r.stdout) && r.status === 0; })());
}

// ---- 2i) observed security raises the model_policy floor (not just the workflow) -------------------------
{
  // a standard-feature task that CHANGES an auth file: the observed `auth` category is a security floor, so the
  // model_policy floor rises to strongest/two-family — a seeded standard-tier policy is now below it -> blocked.
  const nb = tmpNb(); const root = resolve(nb, '..'); const slug = 'auth-change';
  core(nb, slug, { strength_level: 'standard', model_policy: { planner: 'balanced', implement: 'balanced', review: 'strong', security: null, family: 'single' }, review_budget: { level: 'two_round', source: 'auto', floor: 'two_round' } });
  mkdirSync(join(root, 'src', 'auth'), { recursive: true });
  wf(join(root, 'src', 'auth', 'login.ts'), 'export const login = 1\n');
  wf(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({ tool: 'Write', ok: true, path: 'src/auth/login.ts' }) + '\n');
  const r = run(nb);
  check('observed auth -> model_policy below the security floor -> NOT_READY', /NOT READY/.test(r.stdout) && r.status === 1 && /model tier lowered below/.test(r.stdout));
  rmSync(root, { recursive: true, force: true });
}

// ---- 3) SMOKE TABLE: every one of the 14 packs, declared + active with no proofs -> NOT_READY -----------
// Cheap coverage for all 14 contracts (not deep e2e): proves each contract LOADS, the pack ACTIVATES (via
// declaration), and its proof requirement BLOCKS. Uses full strength so even full-tagged proofs are required.
{
  const PACKS = ['product', 'frontend', 'testing', 'data', 'security', 'backend', 'debug', 'refactor', 'docs', 'research', 'devops', 'release', 'git-pr', 'mcp'];
  for (const pack of PACKS) {
    const nb = tmpNb(); const slug = 'cov';
    core(nb, slug, { declared_packs: [pack], strength_level: 'full' });
    const r = run(nb);
    check(`pack "${pack}" active with no proof -> NOT_READY`, /NOT READY/.test(r.stdout) && r.status === 1);
    rmSync(resolve(nb, '..'), { recursive: true, force: true });
  }
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
