#!/usr/bin/env node
// NB Stop hook — if NB is mid-task but nothing was recorded, nudge once to complete closure.
// Conservative: only nudges when mode != idle AND no evidence/review/brief exists. Loop-guarded.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
if (input.stop_hook_active) process.exit(0); // avoid loops
const cwd = input.cwd || '.';
const nb = join(cwd, '.nb');
if (!existsSync(nb)) process.exit(0);

let mode = 'idle';
try { mode = JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8')).current_mode || 'idle'; } catch { /* no state */ }
if (mode === 'idle') process.exit(0);

const has = (d) => { try { return readdirSync(join(nb, d)).some((f) => f !== '.gitkeep'); } catch { return false; } };
const missing = [];
if (!has('evidence')) missing.push('no self-check evidence (.nb/evidence)');
if (!has('reviews')) missing.push('no cross-family review (.nb/reviews)');
if (!has('briefs')) missing.push('no human brief (.nb/briefs)');

if (missing.length === 3) {
  const reason = `NB closure reminder: mode is "${mode}" but nothing was recorded — ${missing.join('; ')}. Consider recording evidence / running a review / /nb-grill before finishing.`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}
process.exit(0);
