#!/usr/bin/env node
// NB doctor — validate the harness.
//   --source : the NB repo itself (public files, plugin manifest, SOT, scripts)
//   --target : an installed project (.claude wiring, .nb, nb.config.json, copied SOT)
//   (no flag): auto-detect (plugin manifest -> source; nb.config.json -> target)
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let mode = args.includes('--target') ? 'target' : args.includes('--source') ? 'source' : 'auto';
if (mode === 'auto') {
  if (existsSync(join(ROOT, '.claude-plugin', 'plugin.json'))) mode = 'source';
  else if (existsSync(join(ROOT, 'nb.config.json'))) mode = 'target';
  else mode = 'source';
}

function runChecks(label, fn) {
  let pass = 0, warn = 0, fail = 0;
  const ok = (m) => { pass++; console.log(`PASS ${m}`); };
  const w = (m) => { warn++; console.log(`WARN ${m}`); };
  const f = (m) => { fail++; console.log(`FAIL ${m}`); };
  const need = (rel, kind = f) => (existsSync(join(ROOT, rel)) ? ok(rel) : kind(`missing ${rel}`));
  console.log(`NB doctor --${label}\n`);
  fn({ ok, w, f, need });
  console.log(`\n${pass} PASS / ${warn} WARN / ${fail} FAIL`);
  return fail;
}

function sourceChecks({ ok, w, f, need }) {
  // public-facing files
  ['README.md', 'LICENSE', 'ACCEPTABLE_USE.md', 'nb.config.example.json',
    '.claude-plugin/plugin.json'].forEach((p) => need(p));
  need('examples');
  // core SOT
  ['core/MANIFEST.md', 'core/module-manifest.schema.json', 'core/pack-manifest.schema.json', 'core/self-check.md',
    'core/strength.md', 'core/INSTALL.md', 'core/hud.md', 'core/grill-me.md',
    'core/intent-lock.md', 'core/scope-value.md', 'core/evidence-ledger.md', 'core/state-machine.md', 'core/artifact-ledger.md', 'core/hook-policy.md',
    'presets/full.yaml'].forEach((p) => need(p));
  ['planner', 'implementer', 'plan-reviewer', 'code-reviewer', 'red-team', 'blue-team', 'explore']
    .forEach((a) => need(`agents/${a}.md`));
  ['design', 'implement', 'security'].forEach((m) => need(`modules/${m}/nb-module.json`));
  // packs (optional domain expansions — subordinate to Core)
  need('packs/README.md');
  ['product', 'frontend', 'testing'].forEach((p) => need(`packs/${p}/nb-pack.json`));
  // plugin command + skill surface (root)
  ['setup', 'plan', 'work', 'review', 'security', 'grill', 'status', 'doctor', 'close']
    .forEach((c) => need(`commands/${c}.md`));
  ['self-check', 'strength-judge', 'install-safety', 'security-gate', 'grill-me', 'intent-lock', 'context-budget', 'release-readiness']
    .forEach((s) => need(`skills/${s}/SKILL.md`));
  // hooks (shared by plugin manifest + script settings)
  need('.claude/hooks/hooks.json', w);
  ['user-prompt-submit', 'pre-tool-use', 'post-tool-use', 'stop', 'pre-compact']
    .forEach((h) => need(`.claude/hooks/${h}.mjs`));
  // script-install wrappers (fallback path) — warn-level (not needed for plugin use)
  ['nb-planner', 'nb-implementer', 'nb-plan-reviewer', 'nb-code-reviewer', 'nb-red-team', 'nb-blue-team', 'nb-explore']
    .forEach((a) => need(`.claude/agents/${a}.md`, w));
  need('.claude/settings.json', w);
  // scripts
  ['install.mjs', 'setup.mjs', 'cross-review.mjs', 'hud.mjs', 'doctor.mjs', 'validate-manifests.mjs',
    'status.mjs', 'release-check.mjs', 'test-hooks.mjs', 'harness-score.mjs', 'lib/score.mjs', 'lib/proof.mjs', 'lib/activation.mjs', 'lib/close-engine.mjs', 'lib/workflow.mjs', 'lib/exec-detect.mjs', 'close.mjs', 'nb-run.mjs', 'test-close.mjs', 'test-proof.mjs', 'test-activation.mjs', 'test-close-engine.mjs', 'test-workflow.mjs', 'test-exec-detect.mjs', 'validate-workflows.mjs', 'test-harness-score.mjs',
    'validate-state.mjs', 'test-validate-state.mjs', 'validate-artifacts.mjs', 'validate-commands.mjs', 'validate-packs.mjs', 'test-install-fixtures.mjs',
    'no-eval-check.mjs', 'test-no-eval.mjs', 'claim-map-check.mjs',
    'strength-judge.mjs', 'intent-lock.mjs', 'pack-skills.mjs',
    'lib/preset.mjs', 'apply-preset.mjs', 'validate-presets.mjs', 'test-preset.mjs',
    'lib/package-risk.mjs', 'package-risk-check.mjs', 'test-package-risk.mjs',
    'lib/ci-workflow-scan.mjs', 'test-ci-workflow-scan.mjs',
    'lib/publish-hygiene.mjs', 'publish-check.mjs', 'test-publish-hygiene.mjs',
    'lib/attack-gate.mjs', 'sandbox-attack.mjs', 'test-attack-gate.mjs', 'test-secret-redaction.mjs',
    'lib/design-docs.mjs', 'test-design-docs.mjs', 'lib/model-policy.mjs', 'model-policy.mjs', 'test-model-policy.mjs',
    'lib/review-budget.mjs', 'review-budget.mjs', 'test-review-budget.mjs', 'lib/security-floor.mjs',
    'scaffold-workflow.mjs', 'scaffold-skill.mjs', 'scaffold-module.mjs', 'scaffold-preset.mjs',
    'update.mjs', 'uninstall.mjs', 'migrate-state.mjs']
    .forEach((s) => need(`scripts/${s}`));
  // high-ceiling structure
  ['light-change', 'standard-feature', 'full-feature', 'bugfix', 'refactor', 'docs-only', 'security-sensitive', 'release', 'tdd']
    .forEach((wf) => need(`workflows/${wf}.md`));
  ['starter', 'balanced', 'strict', 'security-heavy', 'solo-builder', 'team-review']
    .forEach((p) => need(`presets/${p}.yaml`));
  // User-facing docs are required. RELEASE.md is a MAINTAINER-only release checklist (omitted from the public
  // export); it's release process, not harness health — so doctor does not hard-require it.
  ['CAPABILITIES', 'EXTENDING', 'WORKFLOWS', 'UPGRADING', 'PACKS', 'PORTABILITY'].forEach((d) => need(`docs/${d}.md`));
  need('examples/sample-run');
  need('examples/overlay-mode/README.md');
  need('examples/fake-done-firewall/README.md');
  need('.claude-plugin/marketplace.json', w);
  // control-plane files
  need('.nb/state.schema.json');
  need('.nb/artifacts.example.jsonl');
  ['advisory', 'approval', 'strict'].forEach((p) => need(`hooks/profiles/${p}.json`));
  need('fixtures');
  // validators
  const run = (script, label) => {
    const r = spawnSync('node', [join(ROOT, 'scripts', script)], { encoding: 'utf8' });
    r.status === 0 ? ok(label) : f(`${label} failed (see scripts/${script})`);
  };
  run('validate-manifests.mjs', 'manifests valid');
  run('validate-workflows.mjs', 'workflows valid');
  run('claim-map-check.mjs', 'claim->enforcement map resolves');
  run('validate-commands.mjs', 'commands valid');
  run('validate-state.mjs', 'state valid');
  run('validate-artifacts.mjs', 'artifacts valid');
  run('validate-packs.mjs', 'packs valid');
  run('validate-presets.mjs', 'presets valid');
  run('harness-score.mjs', 'harness-score runs');
}

function targetChecks({ ok, w, f, need }) {
  // copied SOT
  ['core/MANIFEST.md', 'core/self-check.md', 'core/strength.md', 'core/INSTALL.md',
    'core/hud.md', 'core/grill-me.md', 'core/intent-lock.md', 'core/scope-value.md', 'core/evidence-ledger.md'].forEach((p) => need(p));
  ['planner', 'implementer', 'plan-reviewer', 'code-reviewer', 'red-team', 'blue-team', 'explore']
    .forEach((a) => need(`agents/${a}.md`));
  ['design', 'implement', 'security'].forEach((m) => need(`modules/${m}/nb-module.json`));
  ['light-change', 'standard-feature', 'full-feature', 'bugfix', 'refactor', 'docs-only', 'security-sensitive', 'release', 'tdd']
    .forEach((wf) => need(`workflows/${wf}.md`));
  ['CAPABILITIES', 'EXTENDING', 'WORKFLOWS', 'UPGRADING'].forEach((d) => need(`docs/${d}.md`));
  // config
  need('nb.config.json');
  // .claude wiring (script install)
  ['nb-planner', 'nb-implementer', 'nb-plan-reviewer', 'nb-code-reviewer', 'nb-red-team', 'nb-blue-team', 'nb-explore']
    .forEach((a) => need(`.claude/agents/${a}.md`, w));
  ['nb-self-check', 'nb-strength-judge', 'nb-install-safety', 'nb-security-gate', 'nb-grill-me', 'nb-intent-lock', 'nb-context-budget', 'nb-release-readiness']
    .forEach((s) => need(`.claude/skills/${s}/SKILL.md`, w));
  ['nb-setup', 'nb-plan', 'nb-work', 'nb-review', 'nb-security', 'nb-grill', 'nb-status', 'nb-doctor', 'nb-close']
    .forEach((c) => need(`.claude/commands/${c}.md`, w));
  ['user-prompt-submit', 'pre-tool-use', 'post-tool-use', 'stop', 'pre-compact']
    .forEach((h) => need(`.claude/hooks/${h}.mjs`, w));
  need('.claude/settings.json', w);
  // .nb skeleton
  need('.nb/state.example.json');
  need('.nb/README.md', w);
  ['sessions', 'evidence', 'reviews', 'briefs', 'decisions', 'logs'].forEach((d) => need(`.nb/${d}/.gitkeep`, w));
  // AGENTS pointer (NB AGENTS.md or AGENTS.nb.md when the target already had its own)
  (existsSync(join(ROOT, 'AGENTS.md')) || existsSync(join(ROOT, 'AGENTS.nb.md')))
    ? ok('AGENTS pointer present (AGENTS.md or AGENTS.nb.md)')
    : w('no AGENTS.md / AGENTS.nb.md');
  // manifests valid (copied scripts present?)
  if (existsSync(join(ROOT, 'scripts', 'validate-manifests.mjs'))) {
    const vm = spawnSync('node', [join(ROOT, 'scripts', 'validate-manifests.mjs')], { encoding: 'utf8' });
    vm.status === 0 ? ok('manifests valid') : f('manifests invalid');
  } else { w('scripts/validate-manifests.mjs not copied'); }
  // target must NOT require source-only public files
}

const fail = runChecks(mode, mode === 'target' ? targetChecks : sourceChecks);
process.exit(fail ? 1 : 0);
