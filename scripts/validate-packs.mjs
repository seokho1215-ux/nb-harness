#!/usr/bin/env node
// Validate every packs/<id>/nb-pack.json against the pack-manifest contract.
// Dependency-free: checks required fields, types, and enums by hand (no JSON Schema engine,
// to keep NB's zero-dependency / install-safety promise). Exits non-zero on any invalid pack.
//
// A pack extends NB into a domain but stays SUBORDINATE to Core. This validator is where that
// subordination is enforced: every pack must ride Intent Lock + Evidence Ledger + Harness Score +
// Review Gate, produce only known artifact types, and request only known permissions/gates.
// Packs are OPTIONAL — an absent or empty packs/ is fine (exit 0), not a failure.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS = join(ROOT, 'packs');

const CORE_RULES = ['intent_lock', 'intent_drift_report', 'evidence_ledger', 'harness_score', 'done_claim_firewall', 'risk_receipt', 'install_safety', 'self_check', 'review_gate', 'state_machine', 'artifact_registry', 'human_brief'];
const MANDATORY_CORE = ['intent_lock', 'evidence_ledger', 'review_gate', 'harness_score'];
const ARTIFACT_TYPES = ['intent', 'evidence', 'review', 'brief', 'decision', 'session', 'log'];
const PERMS = ['read', 'write', 'network', 'exec', 'install'];
const GATES = ['self_check', 'intent_lock', 'evidence_ledger', 'review_gate', 'harness_score', 'explicit_consent', 'no_destructive', 'result_redaction', 'security_floor'];
const REVIEW_GATES = ['cross_family', 'cross_family_plus_human', 'single_family', 'human_required'];
const SCORE_DIMS = ['plan', 'intent', 'evidence', 'review', 'brief', 'risks'];
const STATUS = ['scaffold', 'experimental', 'stable'];
const ARRAY_FIELDS = ['requires_core', 'adds_agents', 'adds_skills', 'adds_workflows', 'produces_artifacts', 'evidence_required', 'approvals_required', 'state_updates', 'install_deps', 'permissions', 'safety_gates', 'exit_criteria'];
const REQUIRED = ['id', 'name', 'description', 'domain', 'status', 'requires_core', 'adds_agents', 'adds_skills', 'adds_workflows', 'produces_artifacts', 'evidence_required', 'review_gate', 'approvals_required', 'state_updates', 'harness_score_contribution', 'install_deps', 'permissions', 'safety_gates', 'exit_criteria'];
const STRENGTHS = ['light', 'standard', 'full'];
const ID_RE = /^[a-z][a-z0-9_-]*$/; // no dots — keeps evidence_ref:proof:<pack>.<type> round-trip unambiguous
// Analytical proofs that are LOG-PAIR proofs (reconciled against the tool log via a command pair), not cross-
// review coverage proofs: they carry a command_match instead of required_claims. Verified by verifyTddRedGreen.
const LOG_PAIR_PROOFS = new Set(['tdd-red-green']);

// An activation rule is a substring by default; a /pattern/flags-delimited string is compiled to a RegExp
// at load (scripts/close.mjs). Here we only check that such a string actually compiles.
function ruleCompiles(rule) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(String(rule));
  if (!m) return true; // plain substring — always fine
  try { new RegExp(m[1], m[2]); return true; } catch { return false; }
}

// Validate the close_contract block (the machine-readable /nb:close contract). Exported for unit tests.
// Enforces the 2d locks: flat shape, no-dots ids, unique proof_types, non-empty required_claims, and
// status:stable => a contract that carries a proof OR an explicit floor_only flag + reason.
export function validateCloseContract(m) {
  const errs = [];
  const cc = m.close_contract;
  const stable = m.status === 'stable';
  if (cc == null) {
    if (stable) errs.push('status:stable requires a close_contract (the firewall must be able to verify a settled domain)');
    return errs;
  }
  if (typeof cc !== 'object' || Array.isArray(cc)) { errs.push('close_contract must be an object'); return errs; }

  if (cc.activation_rules != null) {
    const ar = cc.activation_rules;
    if (typeof ar !== 'object' || Array.isArray(ar)) errs.push('close_contract.activation_rules must be an object');
    else for (const k of ['paths', 'commands']) {
      if (ar[k] == null) continue;
      if (!Array.isArray(ar[k])) { errs.push(`activation_rules.${k} must be an array`); continue; }
      ar[k].forEach((r, i) => {
        if (typeof r !== 'string' || !r.trim()) errs.push(`activation_rules.${k}[${i}] must be a non-empty string`);
        else if (!ruleCompiles(r)) errs.push(`activation_rules.${k}[${i}] looks like /regex/ but does not compile: ${r}`);
      });
    }
  }

  const seenTypes = new Set();
  const checkProof = (p, i, kind) => {
    if (typeof p !== 'object' || p == null || Array.isArray(p)) { errs.push(`${kind}[${i}] must be an object`); return; }
    if (!p.proof_type || !ID_RE.test(p.proof_type)) errs.push(`${kind}[${i}].proof_type must be lowercase kebab/snake with no dots: ${p.proof_type}`);
    else if (seenTypes.has(p.proof_type)) errs.push(`proof_type "${p.proof_type}" is not unique within the pack`);
    else seenTypes.add(p.proof_type);
    if (p.strength != null && !STRENGTHS.includes(p.strength)) errs.push(`${kind}[${i}].strength not allowed: ${p.strength}`);
    // command_match binds a proof_type to the command it must have run (substring or /regex/). Valid for
    // objective proofs AND log-pair analytical proofs (tdd-red-green) — both reconcile a recorded command
    // against the tool log. The cross-review analytical proofs are review-hash bound and run no command.
    if (p.command_match != null) {
      if (kind !== 'objective_proofs' && !LOG_PAIR_PROOFS.has(p.proof_type)) errs.push(`${kind}[${i}].command_match is only valid on objective_proofs or a log-pair analytical proof (${[...LOG_PAIR_PROOFS].join(', ')})`);
      else if (typeof p.command_match !== 'string' || !p.command_match.trim()) errs.push(`${kind}[${i}].command_match must be a non-empty string`);
      else if (!ruleCompiles(p.command_match)) errs.push(`${kind}[${i}].command_match looks like /regex/ but does not compile: ${p.command_match}`);
    }
    // required_when_workflow makes a proof OPT-IN: required only when that workflow is chosen (e.g. tdd-red-green
    // only under the `tdd` workflow). Must be a non-empty string when present.
    if (p.required_when_workflow != null && (typeof p.required_when_workflow !== 'string' || !p.required_when_workflow.trim())) {
      errs.push(`${kind}[${i}].required_when_workflow must be a non-empty string`);
    }
  };

  const objs = cc.objective_proofs;
  if (objs != null) { if (!Array.isArray(objs)) errs.push('objective_proofs must be an array'); else objs.forEach((p, i) => checkProof(p, i, 'objective_proofs')); }

  const ans = cc.analytical_proofs;
  if (ans != null) {
    if (!Array.isArray(ans)) errs.push('analytical_proofs must be an array');
    else ans.forEach((p, i) => {
      checkProof(p, i, 'analytical_proofs');
      // A log-pair analytical proof (tdd-red-green) has NO covers_claims — it reconciles a red/green command pair
      // against the tool log (verifyTddRedGreen), so it needs a command_match instead of required_claims.
      if (p && LOG_PAIR_PROOFS.has(p.proof_type)) {
        if (p.command_match == null) errs.push(`analytical_proofs[${i}] (${p.proof_type}) must declare a command_match (the test command its red/green runs must match)`);
        if (p.required_claims != null) errs.push(`analytical_proofs[${i}] (${p.proof_type}) is a log-pair proof and must NOT declare required_claims`);
        return;
      }
      const rc = p && p.required_claims;
      if (!Array.isArray(rc) || rc.length === 0) errs.push(`analytical_proofs[${i}].required_claims must be a non-empty array`);
      else { const seen = new Set(); rc.forEach((c, j) => {
        if (typeof c !== 'string' || !ID_RE.test(c)) errs.push(`analytical_proofs[${i}].required_claims[${j}] must be lowercase with no dots: ${c}`);
        else if (seen.has(c)) errs.push(`analytical_proofs[${i}].required_claims duplicate "${c}"`);
        else seen.add(c);
      }); }
    });
  }

  if (cc.floor_only != null && typeof cc.floor_only !== 'boolean') errs.push('floor_only must be a boolean');
  if (cc.floor_only === true && (!cc.floor_only_reason || !String(cc.floor_only_reason).trim())) errs.push('floor_only:true requires a floor_only_reason');

  if (stable) {
    const hasProof = (Array.isArray(objs) && objs.length > 0) || (Array.isArray(ans) && ans.length > 0);
    if (!hasProof && cc.floor_only !== true) errs.push('status:stable close_contract must declare at least one objective/analytical proof, or set floor_only:true with a reason');
  }
  return errs;
}

// Pack additions discipline (item 7 / D안 — memory nb-pack-skill-bar). Enforces, hard:
//   - adds_agents / adds_workflows MUST be empty (7 fixed agents, never per-domain; core's 9 workflows suffice).
//   - every adds_skills entry MUST resolve to packs/<id>/skills/<entry>/SKILL.md (no manifest-only vanity).
//   - every SKILL.md MUST carry the 3 contract lines (Strengthens proof / When to read / Output / checkpoint).
//   - the "Strengthens proof: `X`" MUST name a proof_type in THIS pack's close_contract (skill tied to a proof).
//   - no orphan skill dir (a SKILL.md not listed in adds_skills) — manifest and files stay in lockstep.
// Exported for unit tests.
export function validatePackSkills(folder, m, root) {
  const errs = [];
  if (Array.isArray(m.adds_agents) && m.adds_agents.length) errs.push(`adds_agents must be empty (7 fixed agents, never per-domain): [${m.adds_agents.join(', ')}]`);
  if (Array.isArray(m.adds_workflows) && m.adds_workflows.length) errs.push(`adds_workflows must be empty (core workflows + close-proof cover packs): [${m.adds_workflows.join(', ')}]`);

  const cc = m.close_contract || {};
  const proofTypes = new Set([...(cc.objective_proofs || []), ...(cc.analytical_proofs || [])].map((p) => p && p.proof_type).filter(Boolean));
  const skillsDir = join(root, 'packs', folder, 'skills');
  const declared = Array.isArray(m.adds_skills) ? m.adds_skills : [];

  for (const sk of declared) {
    if (typeof sk !== 'string' || !ID_RE.test(sk)) { errs.push(`adds_skills entry not a lowercase id: ${sk}`); continue; }
    const file = join(skillsDir, sk, 'SKILL.md');
    if (!existsSync(file)) { errs.push(`adds_skills "${sk}" has no file packs/${folder}/skills/${sk}/SKILL.md (vanity skill)`); continue; }
    let txt = ''; try { txt = readFileSync(file, 'utf8'); } catch { errs.push(`cannot read packs/${folder}/skills/${sk}/SKILL.md`); continue; }
    for (const label of ['Strengthens proof:', 'When to read:', 'Output / checkpoint:']) {
      if (!txt.includes(label)) errs.push(`skill "${sk}" SKILL.md missing required line "${label}"`);
    }
    const pm = /\*\*Strengthens proof:\*\*\s*`([^`]+)`/.exec(txt);
    if (!pm) errs.push(`skill "${sk}" must state **Strengthens proof:** \`<proof_type>\``);
    else if (!proofTypes.has(pm[1])) errs.push(`skill "${sk}" strengthens "${pm[1]}" which is not a close_contract proof_type of pack "${folder}" (skill not tied to a proof)`);
  }

  // reverse check: a skill file that the manifest doesn't declare = orphan (keep manifest <-> files in lockstep)
  if (existsSync(skillsDir)) {
    for (const e of readdirSync(skillsDir, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(join(skillsDir, e.name, 'SKILL.md')) && !declared.includes(e.name)) {
        errs.push(`packs/${folder}/skills/${e.name}/ exists but is not in adds_skills (orphan skill)`);
      }
    }
  }
  return errs;
}

function findPacks(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const mf = join(dir, e.name, 'nb-pack.json');
    if (existsSync(mf)) out.push({ folder: e.name, path: mf });
  }
  return out;
}

function validate(folder, path) {
  const errs = [];
  let m;
  try { m = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { return [`invalid JSON: ${e.message}`]; }

  for (const fld of REQUIRED) if (!(fld in m)) errs.push(`missing required field: ${fld}`);

  // id must be lowercase kebab/snake AND match the folder it lives in (a pack can't masquerade as another)
  if (m.id && !/^[a-z][a-z0-9_-]*$/.test(m.id)) errs.push(`id not lowercase kebab/snake: ${m.id}`);
  if (m.id && m.id !== folder) errs.push(`id "${m.id}" must match folder name "${folder}"`);

  if ('status' in m && !STATUS.includes(m.status)) errs.push(`status not allowed: ${m.status}`);
  for (const fld of ARRAY_FIELDS) if (fld in m && !Array.isArray(m[fld])) errs.push(`${fld} must be an array`);

  // subordination to Core: known rules, and the mandatory four must be present
  if (Array.isArray(m.requires_core)) {
    m.requires_core.forEach((r) => { if (!CORE_RULES.includes(r)) errs.push(`requires_core unknown rule: ${r}`); });
    for (const need of MANDATORY_CORE) if (!m.requires_core.includes(need)) errs.push(`requires_core must include "${need}"`);
  }

  // pack must speak Core vocabularies, not invent its own
  if (Array.isArray(m.produces_artifacts)) m.produces_artifacts.forEach((t) => { if (!ARTIFACT_TYPES.includes(t)) errs.push(`produces_artifacts unknown type: ${t}`); });
  if (Array.isArray(m.permissions)) m.permissions.forEach((p) => { if (!PERMS.includes(p)) errs.push(`permission not allowed: ${p}`); });
  if (Array.isArray(m.safety_gates)) m.safety_gates.forEach((g) => { if (!GATES.includes(g)) errs.push(`safety_gate not allowed: ${g}`); });
  if ('review_gate' in m && !REVIEW_GATES.includes(m.review_gate)) errs.push(`review_gate not allowed: ${m.review_gate}`);

  // harness score stays Core-owned: a pack feeds known dimensions, it does not invent one
  if (m.harness_score_contribution != null) {
    const h = m.harness_score_contribution;
    if (typeof h !== 'object' || Array.isArray(h)) errs.push('harness_score_contribution must be an object');
    else if (!Array.isArray(h.dimensions) || h.dimensions.length === 0) errs.push('harness_score_contribution.dimensions must be a non-empty array');
    else h.dimensions.forEach((d) => { if (!SCORE_DIMS.includes(d)) errs.push(`harness_score_contribution dimension unknown: ${d}`); });
  }

  // honesty: a pack that can't be recorded/briefed/finished doesn't belong in NB
  if (Array.isArray(m.evidence_required) && m.evidence_required.length === 0) errs.push('evidence_required must not be empty');
  if (Array.isArray(m.exit_criteria) && m.exit_criteria.length === 0) errs.push('exit_criteria must not be empty');
  if (Array.isArray(m.install_deps)) m.install_deps.forEach((d, i) => { if (!d || !d.name) errs.push(`install_deps[${i}] needs name`); });

  // every pack folder must document itself
  if (!existsSync(join(PACKS, folder, 'README.md'))) errs.push(`missing packs/${folder}/README.md`);

  // the machine-readable close contract (2d): shape + stable-pack requirement
  errs.push(...validateCloseContract(m));

  // pack additions discipline (item 7): no vanity agents/workflows, real proof-tied skills only
  errs.push(...validatePackSkills(folder, m, ROOT));

  return errs;
}

// Run the validator only when invoked directly (so tests can import validateCloseContract without the
// top-level scan + process.exit firing on import).
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const packs = findPacks(PACKS);
  if (packs.length === 0) {
    console.log('no nb-pack.json found under packs/ — packs are optional, nothing to validate.');
    process.exit(0);
  }
  let failed = 0;
  for (const { folder, path } of packs) {
    const rel = path.slice(ROOT.length + 1).split('\\').join('/');
    const errs = validate(folder, path);
    if (errs.length) { failed++; console.log(`FAIL ${rel}`); errs.forEach((e) => console.log(`   - ${e}`)); }
    else console.log(`OK   ${rel}`);
  }
  console.log(`\n${packs.length} pack(s), ${failed} invalid.`);
  process.exit(failed ? 1 : 0);
}
