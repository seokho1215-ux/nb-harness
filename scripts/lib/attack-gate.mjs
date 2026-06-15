// NB attack-gate (pure, dependency-free except redact). Sandbox Attack Mode runs a REAL attack, so the five
// hard pins from modules/security/attack-gate.md are enforced HERE IN CODE, not by prose: a real attack is
// authorized ONLY when every pin passes. This is a SAFETY INTERLOCK, not an exploit engine — it ships no attack
// code; it decides whether a planned attack is allowed and refuses (fail-closed) otherwise.
//
// Pins (all must hold):
//   explicit_consent  — a human-approved attack-consent decision exists (no silent attack).
//   ownership_proof   — the target is a CLONE the operator made (ability to clone = ownership); never the original.
//   allowlist         — the target host is local/clone or explicitly allowlisted; never an arbitrary third party.
//   no_destructive    — the plan contains no real delete/drop/truncate/wipe (even on the copy).
//   no_real_payment   — the plan contains no real payment / mail / external-money action (even on the copy).
//   result_redaction  — the authorization record is redacted (no real secrets recorded).
import { redact } from './proof.mjs';

const DESTRUCTIVE = /(\bdrop\s+(table|database|schema)\b|\bdelete\s+from\b|\btruncate\b|\brm\s+-rf?\b|\bwipe\b|\bformat\s+[a-z]:|\bmkfs\b|\bshutdown\b|\breboot\b|>\s*\/dev\/sd|\bdd\s+if=.*of=\/dev)/i;
const PAYMENT = /(\bstripe\b|\bcharge\b|\bpayment\b|\brefund\b|\bpayout\b|\bbilling\b|\binvoice\b|\bsendmail\b|\bsmtp\b|\bmailgun\b|\bsendgrid\b|\btwilio\b|\bwire[\s_-]?transfer\b|\bach\b|\bswift\b)/i;
const RATE_CAP_DEFAULT = 50;

// Hosts that are always in-scope (the clone / your own machine). Everything else needs an explicit allowlist entry.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);
const LOCAL_SUFFIX = /\.(local|test|localhost|internal)$/i;

// Extract a bare host from a target string (URL, host:port, or plain host). Returns lowercased host or ''.
export function hostOf(target) {
  let t = String(target || '').trim();
  if (!t) return '';
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(t);
  if (m) t = m[1];               // strip scheme://
  t = t.replace(/^[^@]*@/, '');  // strip user:pass@
  if (t.startsWith('[')) { const e = t.indexOf(']'); if (e > 0) return t.slice(0, e + 1).toLowerCase(); }
  return t.replace(/:\d+$/, '').toLowerCase(); // strip :port
}

export function isLocalHost(host) {
  return LOCAL_HOSTS.has(host) || LOCAL_SUFFIX.test(host);
}

// Is the target host permitted? Local/clone hosts always; otherwise it must match an allowlist entry (exact host
// or a leading-dot suffix like `.example.com`). A public third-party host that's not allowlisted is denied.
export function hostAllowed(target, allowlist = []) {
  const host = hostOf(target);
  if (!host) return false;
  if (isLocalHost(host)) return true;
  return allowlist.some((a) => {
    const p = String(a).toLowerCase().trim();
    if (!p) return false;
    if (p.startsWith('.')) return host === p.slice(1) || host.endsWith(p);
    return host === p;
  });
}

// Evaluate a planned attack against the five pins. Returns { allowed, denials, authorization }.
//   plan: { target, actions: string[], rate?: number }
//   ctx:  { consent:{ok,approvedBy?}, ownership:{isCopy,cloneOf?,target?}, allowlist?: string[], rateCap?, task?, now? }
// allowed only when denials is empty. The authorization record is REDACTED (result_redaction pin).
export function evaluateAttack(plan = {}, ctx = {}) {
  const denials = [];
  const actions = Array.isArray(plan.actions) ? plan.actions.map((a) => String(a)) : [];
  const allText = actions.join('\n') + '\n' + String(plan.target || '');

  // explicit_consent
  if (!(ctx.consent && ctx.consent.ok === true)) denials.push('explicit_consent: a human-approved attack-consent decision is required (no silent attack)');

  // ownership_proof — must be attacking a CLONE you made, never the original
  const own = ctx.ownership || {};
  if (own.isCopy !== true || !own.cloneOf) denials.push('ownership_proof: the target must be a CLONE you made (record clone_of + is_copy) — attack the copy, never the original');
  else if (own.target && hostOf(own.target) !== hostOf(plan.target)) denials.push(`ownership_proof: plan target (${hostOf(plan.target)}) is not the registered clone (${hostOf(own.target)})`);

  // allowlist
  if (!hostAllowed(plan.target, ctx.allowlist || [])) denials.push(`allowlist: target host "${hostOf(plan.target)}" is not local/clone and not allowlisted`);

  // no_destructive
  const destructive = actions.filter((a) => DESTRUCTIVE.test(a));
  if (DESTRUCTIVE.test(allText)) denials.push(`no_destructive: a destructive action is not allowed even on the copy${destructive.length ? ` (${destructive.slice(0, 3).map((a) => redact(a)).join('; ')})` : ''}`);

  // no_real_payment
  const payment = actions.filter((a) => PAYMENT.test(a));
  if (PAYMENT.test(allText)) denials.push(`no_real_payment: a real payment/mail/external-money action is not allowed${payment.length ? ` (${payment.slice(0, 3).map((a) => redact(a)).join('; ')})` : ''}`);

  // rate limit — a provided rate must be a FINITE POSITIVE INTEGER within the cap. A bogus rate (-1, 0, 1.5,
  // Infinity, NaN) is refused, never silently allowed (Codex GATE: rate:-1 used to pass `> cap` as false).
  const cap = typeof ctx.rateCap === 'number' ? ctx.rateCap : RATE_CAP_DEFAULT;
  if (plan.rate != null) {
    if (!Number.isInteger(plan.rate) || plan.rate < 1) denials.push(`rate_limit: rate must be a positive integer (got ${plan.rate})`);
    else if (plan.rate > cap) denials.push(`rate_limit: requested rate ${plan.rate} exceeds the cap ${cap} (no request floods)`);
  }

  const allowed = denials.length === 0;
  const authorization = allowed ? {
    mode: 'sandbox_attack',
    task: ctx.task || null,
    target: redact(String(plan.target || '')),
    clone_of: redact(String(own.cloneOf || '')),
    consent_by: redact(String((ctx.consent && ctx.consent.approvedBy) || '')),
    action_count: actions.length,
    pins_passed: ['explicit_consent', 'ownership_proof', 'allowlist', 'no_destructive', 'no_real_payment', 'rate_limit'],
    timestamp: ctx.now || null,
  } : null;
  return { allowed, denials, authorization };
}
