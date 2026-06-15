// NB preset engine (pure, dependency-free). Presets are advanced/team OPT-IN profiles (presets/*.yaml). The
// default experience stays automatic (core/strength.md); a preset only matters once you APPLY it. This module is
// the single source of truth for parsing a profile preset, validating its shape, and mapping it to the enforceable
// gate config that /nb:close and harness-score honor. Used by scripts/apply-preset.mjs (the writer) AND
// scripts/validate-presets.mjs (the validator) — same bar, no drift (mirror of lib/intent.mjs's checkIntentText).
//
// RAISE-ONLY is the core invariant: a preset can only TIGHTEN the firewall, never loosen it. apply-preset records
// a preset's gates as MINIMUMS; close/score UNION them with the workflow's required artifacts and MAX the strength
// against the safety floor. A preset's "low"/"floor" therefore adds nothing (it can't subtract); only "high"/"max"
// /"detailed" add a requirement. statePresetGates() re-validates the persisted block on read, so even a
// hand-edited state.preset can only contribute VALID extra requirements — garbage is ignored, never lowers a gate.
import { stripBom } from './proof.mjs';

export const ARTIFACT_KINDS = ['evidence', 'review', 'brief'];
const STRICTNESS = ['low', 'medium', 'high'];
const SECURITY = ['floor', 'floor+module', 'high', 'max'];
const BRIEF_DEPTH = ['short', 'standard', 'detailed'];
const STRENGTHS = ['light', 'standard', 'full'];

// The profile shape this module owns. presets/full.yaml is a DIFFERENT kind (a pipeline preset: sequence /
// cross_family / defaults) and is NOT a gate profile — isProfileText() distinguishes so the validator/apply path
// never misread it as a malformed profile.
export const PROFILE_KEYS = [
  'id', 'name', 'description', 'default_workflow_bias',
  'review_strictness', 'evidence_strictness', 'security_strictness',
  'cross_family_required', 'human_brief_depth',
];

// Is this a flat gate-profile preset (vs. the full.yaml pipeline preset)? A profile declares review_strictness
// at the top level; the pipeline preset never does. Cheap, shape-based, no full parse.
export function isProfileText(text) {
  return /^\s*review_strictness\s*:/m.test(stripBom(String(text || '')));
}

// Parse a flat `key: value` profile preset. The profile files are single-line scalars only (no nested maps, no
// block scalars) — this is intentionally a tiny line reader, NOT a general YAML parser, so it must only ever be
// fed profile text (gate with isProfileText first). Returns { ok, errors, preset }. Inline `# comment` and simple
// quotes are stripped; the FIRST colon splits key/value (so a value may itself contain a colon).
export function parsePreset(text) {
  const errors = [];
  const preset = {};
  const lines = stripBom(String(text || '')).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = raw.indexOf(':');
    if (idx < 0) { errors.push(`line ${i + 1}: not a "key: value" pair (${JSON.stringify(t)})`); continue; }
    const key = raw.slice(0, idx).trim();
    let val = raw.slice(idx + 1).replace(/\s+#.*$/, '').trim(); // strip an inline comment (whitespace + #)
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (Object.prototype.hasOwnProperty.call(preset, key)) errors.push(`line ${i + 1}: duplicate key "${key}"`);
    preset[key] = val;
  }
  return { ok: errors.length === 0, errors, preset };
}

const isBool = (v) => v === 'true' || v === 'false' || v === true || v === false;
const truthy = (v) => v === true || v === 'true';

// Validate a parsed profile against the schema. Optional opts.workflows = the valid workflow ids (so
// default_workflow_bias is checked against the real workflows/ set). Returns an array of error strings (empty = ok).
// An UNKNOWN key is an error (a typo'd or vanity field must not pass silently); every required key must be present
// and a valid enum/string.
export function validatePreset(preset, opts = {}) {
  const errors = [];
  if (!preset || typeof preset !== 'object') return ['preset is not an object'];
  for (const k of Object.keys(preset)) {
    if (!PROFILE_KEYS.includes(k)) errors.push(`unknown field "${k}" (allowed: ${PROFILE_KEYS.join(', ')})`);
  }
  const str = (k) => typeof preset[k] === 'string' && preset[k].trim().length > 0;
  for (const k of ['id', 'name', 'description']) if (!str(k)) errors.push(`${k} is required (non-empty string)`);
  const en = (k, set) => { if (!set.includes(preset[k])) errors.push(`${k} must be one of ${set.join('|')} (got ${JSON.stringify(preset[k])})`); };
  en('review_strictness', STRICTNESS);
  en('evidence_strictness', STRICTNESS);
  en('security_strictness', SECURITY);
  en('human_brief_depth', BRIEF_DEPTH);
  if (!isBool(preset.cross_family_required)) errors.push(`cross_family_required must be true|false (got ${JSON.stringify(preset.cross_family_required)})`);
  if (!str('default_workflow_bias')) errors.push('default_workflow_bias is required');
  else if (Array.isArray(opts.workflows) && opts.workflows.length && !opts.workflows.includes(preset.default_workflow_bias)) {
    errors.push(`default_workflow_bias "${preset.default_workflow_bias}" is not a file in workflows/ (${opts.workflows.join(', ')})`);
  }
  return errors;
}

// Map a VALID profile to the enforceable gate config. RAISE-ONLY: only the tightening values add anything.
//   require_artifacts — review when review_strictness=high; evidence when evidence_strictness=high;
//                       brief when human_brief_depth=detailed. (medium/low/short add nothing — workflow gates them.)
//   min_strength      — security_strictness high|max => full; floor+module => standard; floor => null (no raise).
//   cross_family      — recorded ADVISORY only (not a hard gate this increment): the AI is expected to use a
//                       cross-family review when one is available. NOT machine-enforced here (a hard
//                       provenance gate via NB_REVIEW_PROVENANCE is a possible follow-up).
//   workflow_bias     — recorded as the default workflow the AI should lean toward (a bias, never a floor drop).
export function presetGates(preset) {
  const require_artifacts = [];
  if (preset.review_strictness === 'high') require_artifacts.push('review');
  if (preset.evidence_strictness === 'high') require_artifacts.push('evidence');
  if (preset.human_brief_depth === 'detailed') require_artifacts.push('brief');
  const min_strength = (preset.security_strictness === 'high' || preset.security_strictness === 'max') ? 'full'
    : preset.security_strictness === 'floor+module' ? 'standard' : null;
  return {
    require_artifacts,
    min_strength,
    cross_family: truthy(preset.cross_family_required),
    workflow_bias: preset.default_workflow_bias || null,
  };
}

// Read the enforceable gates back from a persisted state.preset block, RE-VALIDATING every field. This is the
// raise-only firewall on the read side: close/score call this, so a hand-edited or corrupt state.preset can only
// contribute VALID extra requirements (valid artifact kinds; a real strength enum). Anything malformed is dropped
// to the empty/none default — it can never LOWER a gate. Missing/absent preset => no extra requirements.
export function statePresetGates(state) {
  const g = state && state.preset && typeof state.preset === 'object' ? state.preset.gates : null;
  if (!g || typeof g !== 'object') return { require_artifacts: [], min_strength: null, cross_family: false, workflow_bias: null };
  return {
    require_artifacts: Array.isArray(g.require_artifacts) ? [...new Set(g.require_artifacts.filter((k) => ARTIFACT_KINDS.includes(k)))] : [],
    min_strength: STRENGTHS.includes(g.min_strength) ? g.min_strength : null,
    cross_family: g.cross_family === true,
    workflow_bias: typeof g.workflow_bias === 'string' ? g.workflow_bias : null,
  };
}
