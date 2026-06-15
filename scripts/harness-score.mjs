#!/usr/bin/env node
// NB harness score — a task-aware, checklist-style readiness signal (NOT a quality score).
// Thin printer over scripts/lib/score.mjs (the shared engine, also used by /nb:close). "Green" means
// the steps for *this* task happened, not that the code is good. Never fails a build.
//
// Reads .nb/state.json + .nb/{evidence,reviews,briefs}. Set NB_DIR to point at a different .nb (tests).
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreTask } from './lib/score.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const s = scoreTask(nb);
const line = (r) => `${r.v}${r.note ? ` (${r.note})` : ''}`;

console.log('NB Harness Score');
console.log(`Task: ${s.task || 'unknown'}`);
console.log(`Workflow: ${s.workflow || 'unknown'}`);
console.log(`Plan: ${s.plan}`);
console.log(`Intent: ${s.intent}`);
console.log(`Evidence: ${line(s.evidence)}`);
console.log(`Review: ${line(s.review)}`);
console.log(`Brief: ${line(s.brief)}`);
console.log(`Open risks: ${s.openRisks}`);
console.log(`Status: ${s.ready ? 'READY' : 'NOT READY TO CLAIM DONE'}`);
process.exit(0);
