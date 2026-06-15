#!/usr/bin/env node
// NB PreCompact hook — write a compact session summary into .nb/sessions before compaction.
// Preserves mode, decisions, evidence pointers, and open risks. No-op without .nb/.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cwd = input.cwd || '.';
const nb = join(cwd, '.nb');
if (!existsSync(nb)) process.exit(0);

let s = {};
try { s = JSON.parse(readFileSync(join(nb, 'state.json'), 'utf8')); } catch { /* idle */ }
const list = (d) => { try { return readdirSync(join(nb, d)).filter((f) => f !== '.gitkeep'); } catch { return []; } };

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const summary = [
  `# NB session summary — ${ts}`,
  '',
  `- mode: ${s.current_mode ?? 'idle'}`,
  `- task: ${s.current_task ?? '-'}`,
  `- strength: ${s.strength_level ?? '-'}`,
  `- active gates: ${(s.active_gates || []).join(', ') || '-'}`,
  `- open risks: ${(s.open_risks || []).join('; ') || 'none'}`,
  `- evidence: ${list('evidence').join(', ') || '-'}`,
  `- reviews: ${list('reviews').join(', ') || '-'}`,
  `- decisions: ${list('decisions').join(', ') || '-'}`,
  '',
].join('\n');

try {
  mkdirSync(join(nb, 'sessions'), { recursive: true });
  writeFileSync(join(nb, 'sessions', `${ts}.md`), summary);
} catch { /* fail-open */ }
process.exit(0);
