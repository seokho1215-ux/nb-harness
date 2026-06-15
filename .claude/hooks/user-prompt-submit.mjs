#!/usr/bin/env node
// NB UserPromptSubmit hook — detect risky language and recommend the matching NB skill/command.
// Conservative: it ADDS context, it never blocks.
import { readFileSync } from 'node:fs';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* fail-open */ }
const prompt = String(input.prompt || '').toLowerCase();

const hints = [];
if (/\b(quick|just|only|fast|10 ?min)\b/.test(prompt)) hints.push('pressure language → nb-self-check still applies; the strength floor cannot be lowered.');
if (/\b(install|npm|pip|brew|cargo|curl|npx)\b/.test(prompt)) hints.push('install mentioned → nb-install-safety: show the plan, approve, pin, prefer local.');
if (/\b(delete|remove|\brm\b|overwrite|drop)\b/.test(prompt)) hints.push('destructive language → confirm before any delete/overwrite; nothing irreversible without approval.');
if (/\b(security|auth|token|key|secret|password)\b/.test(prompt)) hints.push('security-sensitive → nb-security-gate; safety floor in force.');
if (/\b(sandbox|attack|exploit|network|external)\b/.test(prompt)) hints.push('attack/external → nb-security-gate: explicit consent + ownership proof before any real attack.');

if (hints.length) {
  const ctx = 'NB harness note:\n- ' + hints.join('\n- ');
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx },
  }));
}
process.exit(0);
