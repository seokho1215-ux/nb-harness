#!/usr/bin/env node
// Tests for validateCloseContract + validatePackSkills (scripts/validate-packs.mjs). Dependency-free.
import { validateCloseContract, validatePackSkills } from './validate-packs.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };
const errs = (m) => validateCloseContract(m);

// 1) scaffold, no contract -> fine
check('scaffold without contract ok', errs({ status: 'scaffold' }).length === 0);

// 2) stable, no contract -> error
check('stable without contract -> error', /requires a close_contract/.test(errs({ status: 'stable' }).join()));

// 3) stable with an objective proof -> ok
check('stable + objective proof ok', errs({ status: 'stable', close_contract: { objective_proofs: [{ proof_type: 'tests', strength: 'standard' }] } }).length === 0);

// 4) stable floor_only:true + reason -> ok
check('stable floor_only + reason ok', errs({ status: 'stable', close_contract: { floor_only: true, floor_only_reason: 'delegates to the auth category floor' } }).length === 0);

// 5) stable floor_only:true WITHOUT reason -> error
check('floor_only without reason -> error', /floor_only:true requires a floor_only_reason/.test(errs({ status: 'stable', close_contract: { floor_only: true } }).join()));

// 6) stable empty contract (no proof, no floor_only) -> error
check('stable empty contract -> error', /at least one objective\/analytical proof/.test(errs({ status: 'stable', close_contract: {} }).join()));

// 7) proof_type with a dot -> error (would break evidence_ref round-trip)
check('proof_type with dot -> error', /proof_type must be lowercase/.test(errs({ status: 'experimental', close_contract: { objective_proofs: [{ proof_type: 'a.b' }] } }).join()));

// 8) claim_id with a dot -> error
check('claim_id with dot -> error', /required_claims\[0\] must be lowercase/.test(errs({ status: 'experimental', close_contract: { analytical_proofs: [{ proof_type: 'cov', required_claims: ['a.b'] }] } }).join()));

// 9) duplicate proof_type across objective+analytical -> error
check('duplicate proof_type -> error', /not unique within the pack/.test(errs({ status: 'experimental', close_contract: { objective_proofs: [{ proof_type: 'x' }], analytical_proofs: [{ proof_type: 'x', required_claims: ['c'] }] } }).join()));

// 10) analytical without required_claims -> error
check('analytical without required_claims -> error', /required_claims must be a non-empty array/.test(errs({ status: 'experimental', close_contract: { analytical_proofs: [{ proof_type: 'cov' }] } }).join()));

// 11) activation_rules /bad regex/ that does not compile -> error
check('uncompilable /regex/ rule -> error', /does not compile/.test(errs({ status: 'experimental', close_contract: { activation_rules: { paths: ['/[/'] }, objective_proofs: [{ proof_type: 'x' }] } }).join()));

// 11b) plain substring rule + valid /regex/ rule -> ok
check('substring + valid regex rule ok', errs({ status: 'experimental', close_contract: { activation_rules: { paths: ['migrations/', '/\\.sql$/i'] }, objective_proofs: [{ proof_type: 'x' }] } }).length === 0);

// 12) bad strength -> error
check('bad strength -> error', /strength not allowed/.test(errs({ status: 'experimental', close_contract: { objective_proofs: [{ proof_type: 'x', strength: 'huge' }] } }).join()));

// 13) full valid contract -> ok
check('full valid contract ok', errs({ status: 'stable', close_contract: {
  activation_rules: { paths: ['/\\bmigrat/i'], commands: ['prisma'] },
  objective_proofs: [{ proof_type: 'migration-down', strength: 'full' }],
  analytical_proofs: [{ proof_type: 'covers-claims', strength: 'standard', required_claims: ['rollback', 'no-data-loss'] }],
} }).length === 0);

// ---- validatePackSkills (item 7 / D안): no vanity agents/workflows, real proof-tied skills only ----
{
  const root = mkdtempSync(join(tmpdir(), 'nb-vp-'));
  const mkSkill = (pack, id, body) => {
    const d = join(root, 'packs', pack, 'skills', id); mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'SKILL.md'), body);
  };
  const goodSkill = (proof) => `---\nname: x\n---\n**Strengthens proof:** \`${proof}\` — y\n**When to read:** before close\n**Output / checkpoint:** the proof\n`;
  const contract = { close_contract: { analytical_proofs: [{ proof_type: 'dod-covered', required_claims: ['a'] }] } };
  const ps = (folder, m) => validatePackSkills(folder, m, root);

  // vanity agents / workflows
  check('adds_agents non-empty -> FAIL', /adds_agents must be empty/.test(ps('product', { ...contract, adds_agents: ['api-implementer'], adds_skills: [] }).join()));
  check('adds_workflows non-empty -> FAIL', /adds_workflows must be empty/.test(ps('product', { ...contract, adds_workflows: ['x'], adds_skills: [] }).join()));

  // declared skill with no file
  check('declared skill, no file -> FAIL', /vanity skill/.test(ps('product', { ...contract, adds_agents: [], adds_workflows: [], adds_skills: ['ghost'] }).join()));

  // real file but strengthens an unknown proof
  mkSkill('product', 'bad-proof', goodSkill('not-a-proof'));
  check('skill strengthens unknown proof -> FAIL', /not a close_contract proof_type/.test(ps('product', { ...contract, adds_agents: [], adds_workflows: [], adds_skills: ['bad-proof'] }).join()));

  // real file missing a required line
  mkSkill('product', 'missing-line', '---\nname: x\n---\n**Strengthens proof:** `dod-covered` — y\n**When to read:** now\n');
  check('skill missing a required line -> FAIL', /missing required line "Output \/ checkpoint:"/.test(ps('product', { ...contract, adds_agents: [], adds_workflows: [], adds_skills: ['missing-line', 'bad-proof'] }).join()));

  // orphan skill dir not in adds_skills
  mkSkill('product', 'orphan', goodSkill('dod-covered'));
  check('orphan skill dir -> FAIL', /orphan skill/.test(ps('product', { ...contract, adds_agents: [], adds_workflows: [], adds_skills: [] }).join()));

  // fully valid: empty agents/workflows + a real, proof-tied skill, no orphan
  rmSync(join(root, 'packs', 'product'), { recursive: true, force: true });
  mkSkill('product', 'definition-of-done', goodSkill('dod-covered'));
  check('valid pack skills -> 0 errors', ps('product', { ...contract, adds_agents: [], adds_workflows: [], adds_skills: ['definition-of-done'] }).length === 0);

  rmSync(root, { recursive: true, force: true });
}

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
