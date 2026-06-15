#!/usr/bin/env node
// NB Harness — HUD status line.
// Registered in .claude/settings.json (statusLine). Claude Code pipes session JSON on stdin.
// We also read .nb/state.json (written by the main session as it moves through stages) so the
// line shows the current NB stage / agent, not just model + context%.
// Output: one line to stdout, e.g.:  [nb] Opus security ▸ red-team (round 2/2)  ·  ctx 51%  ·  task 4/4
import { readFileSync } from 'node:fs';

// --- Claude Code session JSON (stdin) ---
let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { /* no stdin (manual run) */ }
let cc = {};
try { cc = JSON.parse(raw || '{}'); } catch { /* ignore malformed */ }

const pct = cc?.context_window?.used_percentage;        // pre-calculated 0..100 (may be null)
const model = cc?.model?.display_name ?? '';
const cwd = cc?.workspace?.current_dir ?? cc?.cwd ?? '.';

// --- NB stage state (.nb/state.json in the project) ---
let st = {};
try { st = JSON.parse(readFileSync(`${cwd}/.nb/state.json`, 'utf8')); } catch { /* idle */ }

const mode = st.current_mode ?? 'idle';
const lane = st.active_agent_lane ? ` ▸ ${st.active_agent_lane}` : '';
const task = st.current_task ? `  ·  ${st.current_task}` : '';
const ctx = (typeof pct === 'number') ? `  ·  ctx ${Math.round(pct)}%` : '';
const mdl = model ? ` ${model}` : '';

process.stdout.write(`[nb]${mdl} ${mode}${lane}${ctx}${task}`);
