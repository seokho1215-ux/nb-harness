#!/usr/bin/env node
// Tests for lib/decision.mjs — deep subjective-decision validation. Dependency-free.
// The point: a decision counts ONLY with the real shape of a decision (what/why/who/when/scope), not the
// mere words "approved_by" + a date. approved_by is friction, not human-auth — we only block AI self-approval.
import { verifyDecision } from './lib/decision.mjs';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log(`PASS ${n}`); } else { fail++; console.log(`FAIL ${n}`); } };

// a fully valid acknowledgment decision
const ackText = `# Decision — secret
task: add-byok
kind: secret
decision: Store the BYOK key in the OS keychain, never in .nb or env files.
rationale: The key is a long-lived user credential; persisting it in the repo or process env would leak it into logs and backups.
approved_by: Maintainer
timestamp: 2026-06-11
`;
const ackCtx = { kind: 'secret', taskSlug: 'add-byok' };
const swap = (t, line, repl) => t.replace(line, repl);

// 1) valid ack -> ok
check('valid acknowledgment passes', verifyDecision(ackText, ackCtx).ok === true);

// 2) empty -> fail
check('empty decision blocked', verifyDecision('   ', ackCtx).ok === false);

// 3) missing decision: -> fail
{ const r = verifyDecision(swap(ackText, /decision:.*\n/, ''), ackCtx);
  check('missing decision statement blocked', !r.ok && /decision:/.test(r.reasons.join())); }

// 4) thin rationale -> fail
{ const r = verifyDecision(swap(ackText, /rationale:.*\n/, 'rationale: ok\n'), ackCtx);
  check('thin rationale blocked', !r.ok && /rationale too thin/.test(r.reasons.join())); }

// 5) stub rationale -> fail
{ const r = verifyDecision(swap(ackText, /rationale:.*\n/, 'rationale: n/a\n'), ackCtx);
  check('stub rationale blocked', !r.ok && /rationale/.test(r.reasons.join())); }

// 6) AI self-approval -> fail (the firewall point: a human must own it)
{ const r = verifyDecision(swap(ackText, /approved_by:.*\n/, 'approved_by: Claude\n'), ackCtx);
  check('AI self-approval blocked', !r.ok && /self-approval/.test(r.reasons.join())); }

// 7) missing approved_by -> fail
{ const r = verifyDecision(swap(ackText, /approved_by:.*\n/, ''), ackCtx);
  check('missing approved_by blocked', !r.ok && /approved_by/.test(r.reasons.join())); }

// 8) task mismatch -> fail
{ const r = verifyDecision(ackText, { kind: 'secret', taskSlug: 'other-task' });
  check('task mismatch blocked', !r.ok && /task/.test(r.reasons.join())); }

// 9) kind mismatch -> fail
{ const r = verifyDecision(ackText, { kind: 'data', taskSlug: 'add-byok' });
  check('kind mismatch blocked', !r.ok && /kind/.test(r.reasons.join())); }

// 10) missing timestamp -> fail
{ const r = verifyDecision(swap(ackText, /timestamp:.*\n/, ''), ackCtx);
  check('missing timestamp blocked', !r.ok && /timestamp|date/.test(r.reasons.join())); }

// 11) CHOICE kind without alternatives -> fail
const choiceBase = `task: add-byok
kind: approach
decision: Use a keychain adapter abstraction rather than one hardcoded provider.
rationale: We must support macOS Keychain, Windows Credential Manager, and libsecret without branching everywhere.
approved_by: Maintainer
timestamp: 2026-06-11
`;
{ const r = verifyDecision(choiceBase, { kind: 'approach', taskSlug: 'add-byok' });
  check('choice without alternatives blocked', !r.ok && /alternatives/.test(r.reasons.join())); }

// 12) CHOICE kind WITH alternatives -> ok
{ const withAlts = choiceBase + 'alternatives: considered a single env-var store (insecure) and a plaintext file (rejected).\n';
  check('choice with alternatives passes', verifyDecision(withAlts, { kind: 'approach', taskSlug: 'add-byok' }).ok === true); }

// 13) staleness: decision older than the task window -> fail (deterministic via injected now)
{ const now = Date.parse('2026-06-20T00:00:00Z');
  const r = verifyDecision(ackText, { ...ackCtx, now, maxAgeMs: 24 * 60 * 60 * 1000 });
  check('stale decision blocked', !r.ok && /stale/.test(r.reasons.join())); }

// 14) markdown bold field styling still parses
{ const bold = `- **task:** add-byok
- **kind:** secret
- **decision:** Store the BYOK key in the OS keychain.
- **rationale:** A long-lived user credential must not be persisted in the repo or env where it leaks.
- **approved_by:** Maintainer
- **timestamp:** 2026-06-11
`;
  check('bold/markdown field styling parses', verifyDecision(bold, ackCtx).ok === true); }

// 15) fields hidden inside a fenced code block do NOT satisfy shape (a template/example block is not a decision)
{ const fenced = '# Decision\n\nFill in the template below:\n\n```\ntask: add-byok\nkind: secret\ndecision: example\nrationale: this is just an illustrative template block, not a real recorded decision for the task\napproved_by: Someone\ntimestamp: 2026-06-11\n```\n';
  check('fenced-only (template) decision does not satisfy', verifyDecision(fenced, ackCtx).ok === false); }

console.log(`\n${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
