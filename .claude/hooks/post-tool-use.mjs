#!/usr/bin/env node
// NB PostToolUse hook — record tool outcomes into .nb/logs (failures into .nb/evidence).
// Conservative: it records, it never changes the result. No-op without .nb/.
//
// Writes two things:
//   logs/tool-outcomes.log   human-readable one-liner per tool call (legacy, kept)
//   logs/tool-events.jsonl   structured event {ts, tool, ok, cmd?, path?} — the INDEPENDENT record
//     the harness writes (not the AI's narrative). /nb:close reconciles proof claims against this so a
//     fabricated "tests passed" with no matching real run is caught. Secrets are redacted before write.
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
// Single shared scrubber (Codex GATE: this hook used a SMALLER inline redact than proof.mjs, missing JWT / DB-URL
// / slack shapes — a drift that contradicted "writers use the shared redact" and leaked those formats to the log).
import { redact } from '../../scripts/lib/proof.mjs';

// Canonical review-body markers — kept inline (no import) so this hook stays dependency-free and fail-open.
// MUST match scripts/lib/proof.mjs (REVIEW_BODY_START/END, normalizeBody, sha256); test-hooks asserts they
// agree, so the three-way hash (hook == artifact == close) can't silently drift.
const REVIEW_BODY_START = '<!-- nb:review-body:start -->';
const REVIEW_BODY_END = '<!-- nb:review-body:end -->';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cwd = input.cwd || '.';
const nb = join(cwd, '.nb');
if (!existsSync(nb)) process.exit(0);

const tool = String(input.tool_name || 'unknown');
const resp = input.tool_response || {};
const ti = input.tool_input || {};
const ok = resp.success !== false && !resp.error;
const ts = new Date().toISOString();

// Redact secrets before logging (the shared scrubber from proof.mjs — one source, no drift).
const cmd = ti.command ? redact(String(ti.command)).slice(0, 500) : undefined;
const path = ti.file_path || ti.path || ti.notebook_path || undefined;

try {
  const logDir = join(nb, 'logs');
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, 'tool-outcomes.log'), `${ts}\t${tool}\t${ok ? 'ok' : 'FAILED'}\n`);
  const event = { ts, tool, ok };
  if (cmd) event.cmd = cmd;
  if (path) event.path = String(path);

  // Cross-family review runs get an extra independent binding: the hash of the review's canonical body block
  // + the session/transcript that produced it. /nb:close requires this hook-written hash to equal the saved
  // artifact's body hash (three-way match) before an analytical proof can pass — the one trusted-tier write
  // that binds a review artifact to a real run.
  const rawCmd = ti.command ? String(ti.command) : '';
  if (/codex\s+exec|cross-review/i.test(rawCmd)) {
    const text = [resp.stdout, resp.output, resp.stderr].filter((s) => typeof s === 'string').join('\n');
    const i = text.indexOf(REVIEW_BODY_START);
    const j = i === -1 ? -1 : text.indexOf(REVIEW_BODY_END, i + REVIEW_BODY_START.length);
    if (i !== -1 && j !== -1) {
      const body = text.slice(i + REVIEW_BODY_START.length, j).replace(/\r\n/g, '\n').trim();
      event.cross_review = true;
      event.stdout_hash = createHash('sha256').update(body, 'utf8').digest('hex');
    }
    if (input.session_id) event.session_id = String(input.session_id);
    if (input.transcript_path) event.transcript_path = String(input.transcript_path);
    if (input.tool_use_id) event.tool_use_id = String(input.tool_use_id);
  }
  appendFileSync(join(logDir, 'tool-events.jsonl'), JSON.stringify(event) + '\n');
  if (!ok) {
    const evDir = join(nb, 'evidence');
    mkdirSync(evDir, { recursive: true });
    appendFileSync(join(evDir, 'failures.log'), `${ts}\t${tool}\t${redact(JSON.stringify(resp)).slice(0, 500)}\n`);
  }
} catch { /* fail-open */ }
process.exit(0);
