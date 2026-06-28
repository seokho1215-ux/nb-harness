#!/usr/bin/env node
// NB security red/blue courier — runs ONE round of the security swap through the OTHER AI family (Codex),
// so a "codex attacked/defended" claim in the security report is bound to a REAL codex run, not a typed string.
// This is the firewall half of the cross-family 2-cycle: red-team/blue-team (Claude) produce the Claude rounds;
// THIS script produces the Codex rounds via `codex exec` and logs a trusted-execution event the security-report
// checker requires before it will accept a non-Claude family claim.
//
// Usage:
//   node scripts/security-redblue.mjs --task <slug> --round <1|2> --role <attack|defend> --bundle <file> [--out <file>]
//     <file> = the prompt bundle: the code/diff under review + the prior round's output + the role instruction.
//
// Exit: 0 = codex round ran and was persisted · 1 = codex not found / failed (nothing persisted, fail-closed).
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify, sha256, stripBom, REVIEW_BODY_START, REVIEW_BODY_END, reviewBodyHash } from './lib/proof.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nb = process.env.NB_DIR || join(ROOT, '.nb');
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

const task = flag('--task');
const round = flag('--round');
const role = flag('--role');
const bundlePath = flag('--bundle');
let outPath = flag('--out');

if (!task || !['1', '2'].includes(String(round)) || !['attack', 'defend'].includes(String(role)) || !bundlePath) {
  console.error('usage: node scripts/security-redblue.mjs --task <slug> --round <1|2> --role <attack|defend> --bundle <file> [--out <file>]');
  process.exit(1);
}
const slug = slugify(task);

let bundle;
try { bundle = stripBom(readFileSync(bundlePath, 'utf8')); }
catch { console.error(`cannot read bundle: ${bundlePath}`); process.exit(1); }

// read-only sandbox: the OTHER family must not modify anything. `codex` is an npm .cmd shim on Windows; Node
// refuses to spawn a .cmd without a shell (CVE-2024-27980), so use a shell THERE only. The bundle is piped via
// stdin (`input`), never the command line, so it is not subject to shell quoting. (Mirrors cross-review.mjs.)
const isWin = process.platform === 'win32';
const res = spawnSync('codex', ['exec', '--sandbox', 'read-only', '-'], {
  input: bundle, encoding: 'utf8', shell: isWin, maxBuffer: 32 * 1024 * 1024,
});
if (res.error) {
  console.error('codex not found on PATH.');
  console.error('  install: npm i -g @openai/codex   then: codex login');
  console.error('  (without a second family, set degraded_single_family:true in the security report instead)');
  process.exit(1);
}

const stdout = res.stdout ?? '';
const bodyBlock = `${REVIEW_BODY_START}\n${stdout}\n${REVIEW_BODY_END}\n`;
const outputSha = sha256(stdout);
const runId = randomUUID();
const ts = new Date().toISOString();
const cmd = `codex exec security-redblue round ${round} ${role}`; // canonical; the run is bound by run_id+hash
const provenance =
`<!-- NB_REDBLUE_PROVENANCE
reviewer: codex
round: ${round}
role: ${role}
exit_status: ${res.status ?? 0}
run_id: ${runId}
output_sha256: ${outputSha}
-->
`;
process.stdout.write(provenance + bodyBlock); // always show (incl. a failed run) for debugging

// Persist ONLY on a clean exit 0. A failed OR SIGNAL-KILLED run is not evidence the other family participated.
// Codex GATE E: `status` is null when the process was killed by a signal — treat that as failure, not success
// (a PATH-shadowed fake `codex` that self-SIGTERMs must not mint a redblue run).
if (res.signal != null || typeof res.status !== 'number' || res.status !== 0) {
  console.error(`security-redblue: codex did not exit cleanly (status ${res.status}, signal ${res.signal}) — nothing persisted (a failed/killed round is not cross-family evidence)`);
  process.exit(typeof res.status === 'number' && res.status !== 0 ? res.status : 1);
}
outPath = outPath || join(nb, 'reviews', `${slug}.redblue-r${round}-${role}.codex.md`);
try {
  for (const d of ['reviews', 'logs']) mkdirSync(join(nb, d), { recursive: true });
  // Trusted-execution event the security-report checker requires to accept a non-Claude family claim for this
  // round+role. source: security-redblue (no other writer sets it); task-scoped; run_id + hash bind the artifact.
  appendFileSync(join(nb, 'logs', 'tool-events.jsonl'), JSON.stringify({
    ts, tool: 'Bash', source: 'security-redblue', ok: true, cmd, run_id: runId,
    output_sha256: outputSha, reviewer: 'codex', redblue_round: Number(round), redblue_role: role, task: slug,
  }) + '\n');
  writeFileSync(outPath, provenance + bodyBlock);
  console.log(`\nsecurity-redblue: codex round ${round} ${role} -> ${outPath} (run_id ${runId})`);
} catch (e) { console.error(`security-redblue: could not persist (${e && e.message ? e.message : e})`); process.exit(1); }
process.exit(0);
