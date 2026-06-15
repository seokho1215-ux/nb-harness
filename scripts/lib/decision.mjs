// NB subjective-decision verifier (pure, dependency-free). A decision artifact (.nb/decisions/<task>.<kind>.md)
// is the accountability anchor for a risk acceptance or an approach choice. /nb:close counts one ONLY when it
// has the real SHAPE of a decision — not merely the words "approved_by" + a date, which was bypassable.
//
// HONEST SCOPE (a firewall, not theater): `approved_by` is accountability FRICTION, NOT proof a human
// approved. A local harness cannot verify identity — we require the field and reject obvious AI self-approval,
// and say so plainly. Do not present `approved_by` as human authentication.
import { isStub, redact } from './proof.mjs';

// Pure risk-acknowledgment kinds expect no "alternatives" (there was no choice — a risk was accepted).
// Everything else is treated as a CHOICE decision and must name what else was considered.
const ACK_KINDS = new Set([
  'baseline-risk', 'risks-accepted',
  'data', 'auth', 'secret', 'payment', 'deploy', 'delete', 'network', 'mcp', 'supply-chain', 'ci-security', 'code-execution', 'attack-consent', 'drift-accepted', 'model-degrade', 'review-degrade',
]);

// approved_by must not be the AI grading its own homework. Soft (a human can still type a fake name) — this
// only blocks the obvious self-approval bypass; it is NOT identity proof.
const AI_SELF = /^(assistant|claude|ai|nb|agent|gpt|codex|llm|bot|model|copilot)\b/i;

// Pull a `name: value` field off its own line, tolerating an optional `- `/`* ` list marker. Bold (`**`) is
// stripped by the caller first, so `**approved_by:** X` and `- approved_by = X` both reduce to the same form.
// `names` are regex fragments (e.g. 'approved[_ ]?by'); the first that matches wins.
function field(text, names) {
  for (const n of names) {
    const m = new RegExp(`^\\s*(?:[-*+]\\s+)?${n}\\s*[:=]\\s*(.+?)\\s*$`, 'im').exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

// Verify one decision file's text. ctx = { kind, taskSlug, now?, maxAgeMs? }.
// Returns { ok, reasons:[], fields:{} } — empty reasons => satisfies the deep check.
export function verifyDecision(text, ctx = {}) {
  const reasons = [];
  const raw = String(text || '');
  if (!raw.trim()) return { ok: false, reasons: ['decision file is empty'], fields: {} };

  const { kind, taskSlug, now, maxAgeMs } = ctx;
  // Strip fenced code blocks FIRST, then markdown bold. Otherwise a decision file that only contains a
  // template/example code block (```\ntask: ...\napproved_by: ...\n```) would satisfy the shape with no real
  // decision. Fields must live in the prose, not in an illustrative code fence.
  const norm = raw.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '').replace(/\*\*/g, '');

  const decision = field(norm, ['decision']);
  const rationale = field(norm, ['rationale', 'why', 'reason']);
  const approvedBy = field(norm, ['approved[_ ]?by', 'approver']);
  const taskField = field(norm, ['task']);
  const kindField = field(norm, ['kind', 'type']);
  const tsField = field(norm, ['timestamp', 'date']) || (/(\d{4}-\d{2}-\d{2}(?:[ T][0-9:]+Z?)?)/.exec(norm)?.[1] ?? null);

  // what was decided
  if (!decision || isStub(decision)) reasons.push('no decision: statement (what was decided)');

  // rationale with real substance — measured AFTER redaction + whitespace fold so filler/formatting can't pad
  const rNorm = redact(String(rationale || '')).replace(/\s+/g, ' ').trim();
  if (!rationale || isStub(rationale)) reasons.push('no rationale:/why: (a non-stub reason)');
  else if (rNorm.length < 20 || rNorm.split(' ').length < 4) reasons.push('rationale too thin (needs a real reason, not one word)');

  // alternatives — required only for CHOICE kinds (an acknowledgment had no alternative)
  if (kind && !ACK_KINDS.has(kind)) {
    const alts = field(raw, ['alternatives', 'considered', 'options']);
    if (!alts || isStub(alts)) reasons.push('choice decision needs alternatives:/considered: (≥1 named)');
  }

  // approved_by — accountability friction, NOT human auth (see header)
  if (!approvedBy) reasons.push('no approved_by (who is accountable for this decision)');
  else if (AI_SELF.test(approvedBy)) reasons.push(`approved_by "${approvedBy}" is an AI self-approval — a human must own this decision`);

  // scope tie — exact task + kind fields, not a free-form mention a stray file could satisfy
  if (taskSlug) {
    if (!taskField) reasons.push('no task: field (the decision must name its task)');
    else if (taskField.toLowerCase() !== String(taskSlug).toLowerCase()) reasons.push(`task: "${taskField}" does not match current task "${taskSlug}"`);
  }
  if (kind) {
    if (!kindField) reasons.push('no kind: field');
    else if (kindField.toLowerCase() !== String(kind).toLowerCase()) reasons.push(`kind: "${kindField}" does not match "${kind}"`);
  }

  // timestamp parseable + optional task-window staleness (deterministic via injected now)
  if (!tsField) reasons.push('no timestamp/date');
  else {
    const t = Date.parse(tsField);
    if (Number.isNaN(t)) reasons.push('timestamp not parseable');
    else if (maxAgeMs && now && (now - t) > maxAgeMs) reasons.push('decision is stale (older than this task window)');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    fields: { decision, rationale, approved_by: approvedBy, task: taskField, kind: kindField, timestamp: tsField },
  };
}
