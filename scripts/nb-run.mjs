#!/usr/bin/env node
// nb-run — the Generic-mode TRUSTED EXECUTION PATH. Runs a command, then writes the records /nb:close needs
// so an OBJECTIVE proof can be machine-verified WITHOUT the Claude PostToolUse hook (any AI tool / overlay).
//
// HONEST framing (Codex GATE-1): nb-run is NOT an automatic observer like the hook — it only records when the
// AI runs through it. So its *coverage* is weaker than the hook's. But a proof can only PASS /nb:close when it
// reconciles against this log, so the trust ceiling of a *passable* objective proof is the same tamper-evident
// grade. Proofs are machine-verified only when produced through this path.
//
// Strength over the hook model: nb-run binds the proof to the exact run via run_id + output_sha256 (generated
// from the REAL spawnSync result) — a proof can't claim an exit/output that didn't happen, nor reuse a stale run.
//
// Usage: node scripts/nb-run.mjs [--task <slug>] [--evidence] [--pack <p> --proof <type>] -- <command...>
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { redact, sha256 } from './lib/proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');

// --- parse args. The command is ONE string passed to --cmd (so quoting is preserved verbatim — joining
// multiple argv tokens and re-shelling them mangles quoted commands like `node -e "..."`). ---
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const has = (name) => argv.includes(name);
const command = flag('--cmd');
if (!command || !command.trim()) {
  console.error('usage: node scripts/nb-run.mjs [--task <slug>] [--evidence] [--pack <p> --proof <type>] --cmd "<command>"');
  console.error('  pass the WHOLE command as one quoted string to --cmd, e.g.  --cmd "node -e \\"console.log(1)\\""');
  process.exit(2);
}
const task = flag('--task');
const pack = flag('--pack');
const proofType = flag('--proof');
const wantEvidence = has('--evidence');

const runId = randomUUID();
const startedAt = new Date().toISOString();
// run it (shell so arbitrary commands + the Windows .cmd shims work); capture output.
const res = spawnSync(command, { shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const endedAt = new Date().toISOString();
// exit mapping: a signal-killed run is NEVER success. status -> use it; else signal -> non-zero; else spawn error -> 1.
const signal = res.signal || null;
const exitCode = res.status != null ? res.status : (signal ? 128 : (res.error ? 1 : 0));
const ok = exitCode === 0;

// redact BOTH the excerpt and the stored full output with the same rule the hook/proof use.
const rawOut = `${res.stdout || ''}${res.stderr ? `\n[stderr]\n${res.stderr}` : ''}`;
const fullOut = redact(rawOut);
const outputSha = sha256(fullOut);
// A command can legitimately succeed with NO output (e.g. `node --version > NUL`). An empty excerpt would
// then trip the proof verifier's stub guard (isStub: empty == stub) and fail nb-run's OWN generated proof.
// Substitute a non-stub synthetic marker stating the real facts; output_sha256 stays the hash of the actual
// (empty) output, so the run_id binding is unchanged — trust is identical, the self-verification regression is gone.
const trimmedOut = fullOut.trim();
const excerpt = trimmedOut ? trimmedOut.slice(0, 500) : `[no output captured; command exited ${exitCode}; output_sha256=${outputSha}]`;
const cmdRedacted = redact(command).slice(0, 500);

process.stdout.write(rawOut); // surface the real output to the human/AI

let recordFailed = false;
try {
  // 1) always: the trusted log event (schema matches the hook + adds run_id/hash/source/signal for binding)
  const logDir = join(nb, 'logs');
  mkdirSync(join(logDir, 'nb-run'), { recursive: true });
  writeFileSync(join(logDir, 'nb-run', `${runId}.out.txt`), fullOut);
  const event = { ts: endedAt, tool: 'Bash', source: 'nb-run', ok, cmd: cmdRedacted, run_id: runId, output_sha256: outputSha, signal, started_at: startedAt, ended_at: endedAt };
  appendFileSync(join(logDir, 'tool-events.jsonl'), JSON.stringify(event) + '\n');

  // 2) --evidence: human-readable evidence artifact + an artifact-ledger row.
  if (wantEvidence && task) {
    mkdirSync(join(nb, 'evidence'), { recursive: true });
    writeFileSync(join(nb, 'evidence', `${task}.md`),
      `# Evidence — ${task}\n\nTask: ${task}\nrun_id: ${runId}\ncommand: \`${cmdRedacted}\`\nexit_code: ${exitCode}${signal ? ` (signal ${signal})` : ''}\noutput_sha256: ${outputSha}\n\n\`\`\`\n${excerpt}\n\`\`\`\n\nFull (redacted) output: .nb/logs/nb-run/${runId}.out.txt\n`);
    appendFileSync(join(nb, 'artifacts.jsonl'),
      JSON.stringify({ ts: endedAt, type: 'evidence', task_slug: task, status: 'current', path: `.nb/evidence/${task}.md`, run_id: runId }) + '\n');
    // append-only: multiple 'current' rows of a type may accrue — score.mjs treats presence as satisfaction
    // (the latest row's path is what a pointer would reference). No supersede rewrite of prior lines.
  }

  // 3) --pack/--proof: the OBJECTIVE proof, generated from the REAL run (can't claim a different exit/output)
  if (pack && proofType && task) {
    mkdirSync(join(nb, 'proofs'), { recursive: true });
    writeFileSync(join(nb, 'proofs', `${task}.${pack}.${proofType}.json`),
      JSON.stringify({ task, pack, proof_type: proofType, command: cmdRedacted, exit_code: exitCode, output_excerpt: excerpt, output_sha256: outputSha, run_id: runId, signal, timestamp: endedAt }, null, 2));
  }
} catch (e) {
  recordFailed = true;
  console.error(`nb-run: could not write the trusted records — this run is NOT usable as a proof: ${e && e.message ? e.message : e}`);
}

// A trusted-execution-path run whose records didn't land must report failure, even if the command itself
// succeeded — otherwise "verified" is shown but /nb:close will block. Recording failure => exit 2.
process.exit(recordFailed ? 2 : exitCode);
