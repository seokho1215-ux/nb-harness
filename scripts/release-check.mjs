#!/usr/bin/env node
// NB release check — public-release gate with a REAL install smoke test.
//
// Separates two readiness signals, because Claude Code is an ADAPTER, not the product:
//   - Core release readiness (tool-agnostic): validators, install smoke, docs, secrets. Always gates.
//   - Claude adapter readiness (optional): `claude plugin validate`. A missing Claude CLI is a WARN,
//     not a blocking failure — NB's Core runs without it. A claude CLI that IS present but reports a
//     broken plugin is a real FAIL.
//
// Flags:
//   --require-claude-plugin  Treat a missing OR failing Claude plugin validation as blocking. For
//                            publishers shipping the Claude plugin who want it gated in their pipeline.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireClaude = process.argv.includes('--require-claude-plugin');
let coreFail = 0;
const ok = (m) => console.log(`OK   ${m}`);
const bad = (m) => { coreFail++; console.log(`FAIL ${m}`); };
const node = (args, opts = {}) => spawnSync('node', args, { encoding: 'utf8', ...opts });

console.log('NB release check\n');
console.log('Core release readiness (tool-agnostic)\n');

// 1. source health
node([join(ROOT, 'scripts', 'doctor.mjs'), '--source']).status === 0 ? ok('doctor --source passes') : bad('doctor --source reports problems');
node([join(ROOT, 'scripts', 'validate-manifests.mjs')]).status === 0 ? ok('manifests valid') : bad('invalid manifests');
node([join(ROOT, 'scripts', 'test-hooks.mjs')]).status === 0 ? ok('hook tests pass') : bad('hook tests fail');
node([join(ROOT, 'scripts', 'test-harness-score.mjs')]).status === 0 ? ok('harness-score tests pass') : bad('harness-score tests fail');
node([join(ROOT, 'scripts', 'test-close.mjs')]).status === 0 ? ok('close firewall tests pass') : bad('close firewall tests fail');
node([join(ROOT, 'scripts', 'test-close-e2e.mjs')]).status === 0 ? ok('close end-to-end (real contracts) tests pass') : bad('close end-to-end tests fail');
node([join(ROOT, 'scripts', 'test-proof.mjs')]).status === 0 ? ok('proof verifier tests pass') : bad('proof verifier tests fail');
node([join(ROOT, 'scripts', 'test-activation.mjs')]).status === 0 ? ok('activation engine tests pass') : bad('activation engine tests fail');
node([join(ROOT, 'scripts', 'test-close-engine.mjs')]).status === 0 ? ok('close-engine tests pass') : bad('close-engine tests fail');
node([join(ROOT, 'scripts', 'test-workflow.mjs')]).status === 0 ? ok('workflow required-artifacts tests pass') : bad('workflow required-artifacts tests fail');
node([join(ROOT, 'scripts', 'test-validate-state.mjs')]).status === 0 ? ok('validate-state tests pass') : bad('validate-state tests fail');
node([join(ROOT, 'scripts', 'test-decision.mjs')]).status === 0 ? ok('decision verifier tests pass') : bad('decision verifier tests fail');
node([join(ROOT, 'scripts', 'validate-workflows.mjs')]).status === 0 ? ok('workflows valid') : bad('workflows invalid');
node([join(ROOT, 'scripts', 'validate-commands.mjs')]).status === 0 ? ok('commands valid') : bad('commands invalid');
node([join(ROOT, 'scripts', 'validate-state.mjs')]).status === 0 ? ok('state valid') : bad('state invalid');
node([join(ROOT, 'scripts', 'validate-artifacts.mjs')]).status === 0 ? ok('artifacts valid') : bad('artifacts invalid');
node([join(ROOT, 'scripts', 'validate-packs.mjs')]).status === 0 ? ok('packs valid') : bad('packs invalid');
node([join(ROOT, 'scripts', 'test-validate-packs.mjs')]).status === 0 ? ok('close_contract validator tests pass') : bad('close_contract validator tests fail');
node([join(ROOT, 'scripts', 'validate-presets.mjs')]).status === 0 ? ok('presets valid') : bad('presets invalid');
node([join(ROOT, 'scripts', 'test-preset.mjs')]).status === 0 ? ok('preset apply/verify tests pass') : bad('preset apply/verify tests fail');
node([join(ROOT, 'scripts', 'test-package-risk.mjs')]).status === 0 ? ok('package-risk (supply-chain) tests pass') : bad('package-risk tests fail');
node([join(ROOT, 'scripts', 'test-ci-workflow-scan.mjs')]).status === 0 ? ok('CI-workflow scanner tests pass') : bad('CI-workflow scanner tests fail');
node([join(ROOT, 'scripts', 'test-publish-hygiene.mjs')]).status === 0 ? ok('publish-hygiene tests pass') : bad('publish-hygiene tests fail');
node([join(ROOT, 'scripts', 'test-attack-gate.mjs')]).status === 0 ? ok('attack-gate (sandbox pins) tests pass') : bad('attack-gate tests fail');
node([join(ROOT, 'scripts', 'test-secret-redaction.mjs')]).status === 0 ? ok('secret-redaction (M4) tests pass') : bad('secret-redaction tests fail');
node([join(ROOT, 'scripts', 'test-design-docs.mjs')]).status === 0 ? ok('design-docs (P-e/M2) tests pass') : bad('design-docs tests fail');
node([join(ROOT, 'scripts', 'test-model-policy.mjs')]).status === 0 ? ok('model-policy tests pass') : bad('model-policy tests fail');
node([join(ROOT, 'scripts', 'test-review-budget.mjs')]).status === 0 ? ok('review-budget tests pass') : bad('review-budget tests fail');
node([join(ROOT, 'scripts', 'test-security-report-check.mjs')]).status === 0 ? ok('security report-check tests pass') : bad('security report-check tests fail');
node([join(ROOT, 'scripts', 'test-nb-run.mjs')]).status === 0 ? ok('nb-run tests pass') : bad('nb-run tests fail');
node([join(ROOT, 'scripts', 'test-setup.mjs')]).status === 0 ? ok('setup tests pass') : bad('setup tests fail');
node([join(ROOT, 'scripts', 'test-strength-judge.mjs')]).status === 0 ? ok('strength-judge tests pass') : bad('strength-judge tests fail');
node([join(ROOT, 'scripts', 'test-intent-lock.mjs')]).status === 0 ? ok('intent-lock tests pass') : bad('intent-lock tests fail');
node([join(ROOT, 'scripts', 'test-no-eval.mjs')]).status === 0 ? ok('no-eval scanner tests pass') : bad('no-eval scanner tests fail');
node([join(ROOT, 'scripts', 'no-eval-check.mjs')]).status === 0 ? ok('no string-execution in runtime code (no-eval gate)') : bad('forbidden string-execution construct found in runtime code (run no-eval-check.mjs)');
node([join(ROOT, 'scripts', 'test-exec-detect.mjs')]).status === 0 ? ok('dynamic-exec detector tests pass') : bad('dynamic-exec detector tests fail');
node([join(ROOT, 'scripts', 'test-install-fixtures.mjs')]).status === 0 ? ok('install fixtures pass') : bad('install fixtures fail');

// 2. real install smoke (dry-run -> apply -> doctor --target -> status, in a temp dir)
const tmp = mkdtempSync(join(tmpdir(), 'nb-release-'));
try {
  const dry = node([join(ROOT, 'scripts', 'install.mjs'), tmp]);
  (dry.status === 0 && /Dry-run/.test(dry.stdout)) ? ok('installer dry-run writes nothing') : bad('installer dry-run failed');
  const app = node([join(ROOT, 'scripts', 'install.mjs'), tmp, '--apply', '--yes']);
  app.status === 0 ? ok('installer apply') : bad('installer apply failed');
  const tgt = node([join(tmp, 'scripts', 'doctor.mjs'), '--target'], { cwd: tmp });
  tgt.status === 0 ? ok('doctor --target passes on the installed project') : bad('doctor --target FAILED on install:\n' + tgt.stdout);
  const st = node([join(tmp, 'scripts', 'status.mjs')], { cwd: tmp });
  st.status === 0 ? ok('status runs in the installed project') : bad('status failed in target');
  // install hygiene (guards install.mjs excludeFromTarget): NB's own dev tests must not land in a
  // consumer project, or a bare `node --test` (a common verify command) would discover and fail them.
  const stray = existsSync(join(tmp, 'scripts')) ? readdirSync(join(tmp, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)) : [];
  stray.length === 0 ? ok('no NB dev test scripts leaked into the install (node --test stays clean)') : bad('NB test-*.mjs leaked into target scripts/: ' + stray.join(', '));
  // maintainer-only docs must not land in a consumer install
  !existsSync(join(tmp, 'docs', 'RELEASE.md')) ? ok('maintainer docs/RELEASE.md not copied into the install') : bad('maintainer docs/RELEASE.md leaked into the install');
  // FIREWALL HAS ITS CONTRACTS: packs/ must ship AND the installed close must LOAD them. Regression guard
  // for a dogfood-found P0 — packs/ was missing from COPY_DIRS, so the installed close had zero contracts:
  // pack proofs went unenforced and a normal change escalated as unknown_impact. doctor/status alone never
  // caught it because neither runs close against a pack contract. This seeds a logged `npm test` run and
  // asserts the INSTALLED close activates the testing pack from it.
  existsSync(join(tmp, 'packs', 'testing', 'nb-pack.json'))
    ? ok('packs/ ships into the install (firewall has its contracts)')
    : bad('packs/ missing from the install — the completion firewall would have NO contracts');
  // pack-scoped skills must ship too (item 7): the install must include packs/<pack>/skills/<skill>/SKILL.md,
  // else the active-pack skill guidance points at files that aren't there. (dogfood-style packaging guard.)
  existsSync(join(tmp, 'packs', 'data', 'skills', 'rollback-proof', 'SKILL.md'))
    ? ok('pack-scoped skills ship into the install (packs/<pack>/skills/<skill>/SKILL.md)')
    : bad('pack-scoped skills missing from the install — active-pack skill guidance would dangle');
  mkdirSync(join(tmp, '.nb', 'logs'), { recursive: true });
  writeFileSync(join(tmp, '.nb', 'logs', 'tool-events.jsonl'),
    JSON.stringify({ tool: 'Bash', ok: true, cmd: 'npm test', source: 'nb-run' }) + '\n');
  const cl = node([join(tmp, 'scripts', 'close.mjs')], { cwd: tmp });
  /Active packs:[^\n]*testing/.test(cl.stdout)
    ? ok('installed close loads pack contracts (a logged `npm test` activates the testing pack)')
    : bad('installed close did not load pack contracts — testing pack never activated:\n' + cl.stdout);
  // ...and the contract is ENFORCED, not merely loaded: with the run logged but NO proof written, the
  // testing pack's objective_proof must be DEMANDED (proves packs ship AND activation_rules load AND
  // close_contract.objective_proofs is enforced — the full firewall path, in one assertion).
  /testing: objective proof "verify" missing/.test(cl.stdout)
    ? ok('installed close ENFORCES the pack objective proof (not silently skipped)')
    : bad('installed close did not demand the testing objective proof — contract loaded but unenforced:\n' + cl.stdout);
  // /nb:setup foundation: the INSTALLED setup.mjs must deterministically scaffold a valid idle state.json
  // (status/hud/score/close all read it). --no-doctor isolates the scaffold from the doctor run above.
  const setupRes = node([join(tmp, 'scripts', 'setup.mjs'), '--no-doctor'], { cwd: tmp });
  const setupState = join(tmp, '.nb', 'state.json');
  const setupOk = setupRes.status === 0 && existsSync(setupState);
  const setupValid = setupOk && node([join(tmp, 'scripts', 'validate-state.mjs')], { cwd: tmp, env: { ...process.env, NB_DIR: join(tmp, '.nb') } }).status === 0;
  setupValid
    ? ok('installed setup.mjs scaffolds a valid idle state.json (deterministic foundation)')
    : bad('installed setup.mjs did not produce a valid state.json:\n' + (setupRes.stdout || '') + (setupRes.stderr || ''));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// 3. public-readiness docs
const readme = existsSync(join(ROOT, 'README.md')) ? readFileSync(join(ROOT, 'README.md'), 'utf8') : '';
(/install/i.test(readme) && /(quickstart|first 15|60-second|first-use)/i.test(readme)) ? ok('README has install + quickstart') : bad('README missing install/quickstart');
const exDir = join(ROOT, 'examples');
(existsSync(exDir) && readdirSync(exDir).some((f) => f.endsWith('.md'))) ? ok('examples present') : bad('no examples');
existsSync(join(ROOT, 'LICENSE')) ? ok('LICENSE present') : bad('no LICENSE');
existsSync(join(ROOT, 'ACCEPTABLE_USE.md')) ? ok('ACCEPTABLE_USE present') : bad('no ACCEPTABLE_USE.md');

// 4. obvious-secret scan
const SECRET = /(sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/;
const SKIP = new Set(['.git', 'node_modules']);
function scan(dir) {
  const hits = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { hits.push(...scan(p)); continue; }
    if (p === join(ROOT, 'scripts', 'release-check.mjs')) continue;
    try { if (SECRET.test(readFileSync(p, 'utf8'))) hits.push(p.slice(ROOT.length + 1)); } catch { /* binary */ }
  }
  return hits;
}
const leaks = scan(ROOT);
leaks.length === 0 ? ok('no obvious secrets') : bad('possible secrets: ' + leaks.join(', '));

// 5. Claude adapter readiness (optional — Claude Code is an adapter, not the product)
console.log('\nClaude adapter readiness (optional)\n');

// Distinguish "claude not installed" (ABSENT -> warn) from "claude present but plugin broken" (FAIL)
// without parsing error-message text: Windows localizes "is not recognized" (e.g. Korean) and returns
// exit 1 — the SAME code a real validation failure uses — so message/exit heuristics on the shell
// fallback are unreliable. We rely on ENOENT (direct spawn) and a locale-independent existence probe.
function checkClaudePlugin() {
  // 1) Direct spawn resolves PATH (incl. PATHEXT for .cmd/.exe). ENOENT on both = not on PATH.
  for (const bin of ['claude', 'claude.cmd']) {
    const r = spawnSync(bin, ['plugin', 'validate', '.'], { encoding: 'utf8', cwd: ROOT });
    if (!r.error) return { found: true, status: r.status, out: r.stdout || r.stderr || '' };
  }
  // 2) Existence probe for a shell alias/function via EXIT CODE (not message text): where/command -v
  //    return 0 iff claude resolves. Only then do we run the real validation through the shell.
  const probe = spawnSync(process.platform === 'win32' ? 'where claude' : 'command -v claude', { encoding: 'utf8', shell: true });
  if (probe.status === 0) {
    const r = spawnSync('claude plugin validate .', { encoding: 'utf8', cwd: ROOT, shell: true });
    return { found: true, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
  }
  return { found: false };
}

const cp = checkClaudePlugin();
let adapter, adapterBlocking = 0;
if (cp.found && cp.status === 0) {
  adapter = 'validated';
  ok('claude plugin validate');
} else if (cp.found) {
  adapter = 'broken';
  adapterBlocking = 1;
  console.log('FAIL claude plugin validate failed (claude CLI present, plugin broken):\n' + (cp.out || ''));
} else {
  adapter = 'absent';
  if (requireClaude) {
    adapterBlocking = 1;
    console.log('FAIL claude CLI not found — required by --require-claude-plugin');
  } else {
    console.log('WARN claude CLI not found — Claude is an optional adapter; run `claude plugin validate .` before publishing the Claude plugin');
  }
}

// summary — Core and Claude adapter reported separately
console.log(`\nCore release readiness:   ${coreFail === 0 ? 'READY' : 'NOT READY'} (${coreFail} blocking)`);
const adapterLabel = adapter === 'validated' ? 'READY (claude plugin validate passed)'
  : adapter === 'broken' ? 'NOT READY (claude CLI present but plugin validate failed)'
  : requireClaude ? 'NOT READY (claude CLI not found; required by --require-claude-plugin)'
  : 'WARN (claude CLI not found — optional adapter, not validated)';
console.log(`Claude adapter readiness: ${adapterLabel}`);

const totalBlocking = coreFail + adapterBlocking;
console.log(`\n${totalBlocking === 0 ? 'READY' : 'NOT READY'} (${totalBlocking} blocking)`);
process.exit(totalBlocking ? 1 : 0);
