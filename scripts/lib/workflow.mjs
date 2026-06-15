// Per-workflow required artifacts (audit #35/N10). The SOT is each workflow's own .md frontmatter
// (`required_artifacts: evidence, review, brief`), so close and harness-score both judge "ready" by what THIS
// workflow actually needs — a docs-only change isn't held to a cross-family review it never runs, while a full
// feature still is. plan + intent are ALWAYS required (the foundation, set by /nb:plan); only evidence / review
// / brief are workflow-gated. Unknown/absent frontmatter => all three required (fail SAFE: stricter, not looser).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ARTIFACT_KINDS = ['evidence', 'review', 'brief'];
export const DEFAULT_REQUIRED = [...ARTIFACT_KINDS]; // when the workflow is unknown, require everything

// Extract the LEADING frontmatter block ONLY — the document must OPEN with `---` (optional BOM), nothing before
// it. NO /m flag on purpose: with /m, `^` matches the start of any line, so a `---\n…\n---` block buried in the
// body parses as machine frontmatter and an author could spoof `required_artifacts` to exempt a real workflow
// from review/brief (Codex GATE blocker). Anchoring to string-start makes body text body text. Shared by the
// validator so both judge "is this real frontmatter?" by the identical rule. Returns the inner text, or null.
export function leadingFrontmatter(txt) {
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(txt);
  return fm ? fm[1] : null;
}

// Parse `required_artifacts: a, b` from ONLY the leading frontmatter block of a workflow .md. Returns the
// validated subset of ARTIFACT_KINDS, or null when the workflow/file/field is absent (caller applies the default).
export function requiredArtifacts(root, workflow) {
  if (!workflow) return null;
  const p = join(root, 'workflows', `${workflow}.md`);
  if (!existsSync(p)) return null;
  let txt = '';
  try { txt = readFileSync(p, 'utf8'); } catch { return null; }
  const body = leadingFrontmatter(txt);
  if (body === null) return null;
  const m = /^\s*required_artifacts\s*:\s*(.+)$/im.exec(body);
  if (!m) return null;
  const kinds = m[1].split(',').map((s) => s.trim().toLowerCase()).filter((s) => ARTIFACT_KINDS.includes(s));
  // May be [] when the field is present but names no VALID kind (typo'd/malformed). This is NOT "require none":
  // requiredFor() (and close-engine defense-in-depth) treat [] like null and fall to the strict default.
  return kinds;
}

// The set close/score should enforce for a workflow: the parsed list, or the strict default when unknown.
// null (no workflow / no field) AND [] (field present but no VALID kinds — a typo'd/malformed list) both fall
// to the strict default — a malformed frontmatter must never quietly mean "require nothing" (fail SAFE).
export function requiredFor(root, workflow) {
  const parsed = requiredArtifacts(root, workflow);
  return parsed === null || parsed.length === 0 ? DEFAULT_REQUIRED : parsed;
}
