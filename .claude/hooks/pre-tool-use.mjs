#!/usr/bin/env node
// NB PreToolUse hook — flag install / destructive / network / refusal-pattern actions before they run.
// Conservative by design (core/hook-policy.md): the default profile ASKS (surfaces to the user), advisory only
// adds context, and STRICT denies the genuinely dangerous shapes. It fails OPEN (any parse error -> no gate)
// so it never blocks legit work on a malformed event.
//
// Enforcement added (audit P-d #24 + M3):
//   - install pin/local: an UNPINNED or GLOBAL install (npm i left-pad, npm i -g x, curl|sh, pip install x)
//     is denied under strict and asked-with-remediation under approval — "show plan -> approve -> pin -> local".
//   - refusal patterns: a Replace-All / blind whole-file rewrite, and a command that dumps raw internals
//     (secrets / .env / keys) to output, are surfaced (ask) / blocked (strict).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// Supply-chain / slopsquatting gate lives in its OWN lib (separate structure from this hook + from exec-detect).
// Static import: it's dependency-free and ships in the install (scripts/lib/) — release-check asserts it loads.
import { assessInstallSupplyChain } from '../../scripts/lib/package-risk.mjs';

// --- install classification (P-d): is this an install, and is it pinned + local? ---------------------------
// pinned = a version is FIXED (exact). Codex GATE: a floating spec is NOT pinned — npm @latest / @next / @^1 /
// @~1 / @1 / @1.2 / @* / ranges are all unpinned; only exact semver pkg@1.2.3 (with optional -prerelease/+build)
// counts. pip: only `==` or a `-r` lockfile is pinned (>=, ~=, !=, <, > are floating). global = installs outside
// the project (-g/--global, curl|sh, brew/gem). An unpinned OR global install is the risk case.
const EXACT_SEMVER = /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/; // 1.2.3, 1.2.3-alpha.1, 1.2.3+build — NOT 1, 1.2, ^1, latest
// Package tokens, skipping flags AND the VALUE consumed by a value-taking flag (Codex GATE: `--registry <url>`
// counted the URL as a package -> a real pinned install got flagged unpinned). `--flag=value` is one token.
function pkgTokens(rest, valueFlags) {
  const toks = String(rest).trim().split(/\s+/).filter(Boolean);
  const pkgs = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith('-')) { if (valueFlags.has(t)) i++; continue; } // skip this flag's value too
    pkgs.push(t.replace(/^['"]+|['"]+$/g, '')); // strip surrounding quotes so "pkg@1.2.3" reads as pinned
  }
  return pkgs;
}
const NPM_VALUE_FLAGS = new Set(['--registry', '--prefix', '--userconfig', '--globalconfig', '--cache', '--otp', '--tag', '--omit', '--include', '--before', '--workspace', '-w']);
const PIP_VALUE_FLAGS = new Set(['-r', '--requirement', '-c', '--constraint', '-i', '--index-url', '--extra-index-url', '-f', '--find-links', '-t', '--target', '--prefix', '--root']);
const CARGO_VALUE_FLAGS = new Set(['--vers', '--version', '--features', '-F', '--git', '--branch', '--tag', '--rev', '--path', '--registry', '--index']);
const npmPinned = (p) => { const at = p.lastIndexOf('@'); return at > 0 && EXACT_SEMVER.test(p.slice(at + 1)); };
// pip exact pin: ONLY `name==<version>` (no ===, >=, ~=, !=, <, >, *, VCS/URL/egg). The name part excludes any
// operator char so `requests===2` / `requests>=2` can't sneak the trailing `==<digit>` through (Codex GATE).
const pipPinned = (p) => /^[^=<>~!*\s]+==\d[\w.+-]*$/.test(p);

export function classifyInstall(c) {
  const s = String(c);
  // npm / pnpm / yarn  (install | i | add)
  let m = /\b(npm|pnpm|yarn)\s+(install|i|add)\b([^\n]*)/i.exec(s);
  if (m) {
    const rest = m[3] || '';
    const global = /(^|\s)(-g|--global)(\s|$)/.test(rest);
    const pkgs = pkgTokens(rest, NPM_VALUE_FLAGS);
    if (pkgs.length === 0) return { isInstall: true, global, pinned: true, mgr: m[1] }; // lockfile install
    const pinned = pkgs.every(npmPinned); // every package must carry an EXACT version
    return { isInstall: true, global, pinned, mgr: m[1] };
  }
  // npm ci = strictly-from-lockfile = pinned + local
  if (/\bnpm\s+ci\b/i.test(s)) return { isInstall: true, global: false, pinned: true, mgr: 'npm' };
  // pip — a `-r/--requirement` lockfile is a pinned SOURCE, but it does NOT bless extra inline packages on the
  // same line (Codex GATE: `pip install -r req.txt requests` laundered an unpinned package). pkgTokens skips the
  // requirement file (it's a value flag), so any remaining package token must itself be `==`-pinned.
  m = /\bpip3?\s+install\b([^\n]*)/i.exec(s);
  if (m) {
    const rest = m[1] || '';
    const pkgs = pkgTokens(rest, PIP_VALUE_FLAGS);
    if (pkgs.length === 0) return { isInstall: true, global: false, pinned: true, mgr: 'pip' }; // lockfile/bare
    const pinned = pkgs.every(pipPinned);
    return { isInstall: true, global: false, pinned, mgr: 'pip' };
  }
  // cargo add/install — `--vers/--version` pins a SINGLE crate only (Codex GATE: `cargo add serde --vers 1.0.0
  // rand` laundered `rand`). So a version flag counts only when there's exactly one crate token; with multiple
  // crates each must carry its own `@exact` version, else unpinned (conservative).
  m = /\bcargo\s+(add|install)\b([^\n]*)/i.exec(s);
  if (m) {
    const rest = m[2] || '';
    const versFlagExact = /--vers(ion)?[=\s]+\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?(\s|$)/.test(rest);
    const pkgs = pkgTokens(rest, CARGO_VALUE_FLAGS); // --vers/--version skip their value
    const pinned = pkgs.length <= 1
      ? (versFlagExact || (pkgs.length === 1 && npmPinned(pkgs[0])))
      : pkgs.every(npmPinned); // multiple crates: a single --vers can't pin them all
    return { isInstall: true, global: /install/i.test(m[1]), pinned, mgr: 'cargo' };
  }
  // curl|wget piped to a shell = unauditable remote script = unpinned + global by nature
  if (/(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)\b/i.test(s)) return { isInstall: true, global: true, pinned: false, mgr: 'curl-pipe' };
  // brew / gem / go get / global npx = system-scope, treat as global; pinned only with an EXACT version token
  // (gem -v 1.2.3, go get pkg@v1.2.3, pkg@1.2.3) — a floating @latest/@v1/major-only stays unpinned.
  if (/\b(brew\s+install|gem\s+install|go\s+get|npx\s)/i.test(s)) {
    const pinned = /@v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?\b/.test(s) || /-v\s+\d+\.\d+\.\d+\b/.test(s);
    return { isInstall: true, global: true, pinned, mgr: 'other' };
  }
  return { isInstall: false };
}

const DESTRUCTIVE = /(rm\s+-rf?|rm\s+-r\b|\bdel\s+\/|remove-item|drop\s+table|truncate|git\s+reset\s+--hard|git\s+clean\s+-)/i;
const PUBLISH = /\b(npm|pnpm|yarn)\s+publish\b/i;
const SECRET = /(secret|private key|\.env\b|\.pem\b|\.key\b)/i;
// raw-internals dump (M3): a command whose OUTPUT would expose secrets/env/keys. Covers many readers
// (cat/type/xxd/od/hexdump/base64/strings/head/tail/...) of a .env / .pem / .key / ssh private key, many
// printers (echo/printf/print/Write-Output/Write-Host) of a $SECRET / ${SECRET} / $env:SECRET, `printenv`, a
// standalone `env`, and a bare PowerShell `$env:...SECRET` reference (Codex GATE: printf / $env: / xxd were
// slipping through). `env` matches ONLY as a standalone dump — NOT `env VAR=x cmd`, `npm run env`, or `env.ts`.
const SECRET_NAME = '(key|token|secret|password|passwd|credential)';
// readers cover both shells: Unix (cat/xxd/od/...), PowerShell (Get-Content/gc/Format-Hex/type), file processors
// (sed/awk) that print a file's contents (Codex GATE: gc/Get-Content/Format-Hex were slipping through).
const READERS = '(cat|bat|batcat|type|xxd|od|hexdump|strings|base64|nl|more|less|head|tail|sed|awk|grep|egrep|rg|ag|findstr|tee|diff|cmp|gc|get-content|format-hex|select-string)';
const PRINTERS = '(echo|printf|print|write-output|write-host)';
const SECRET_FILE = '(\\.env\\b|\\.(pem|key)\\b|id_rsa|id_ed25519|id_ecdsa|id_dsa|[\\\\/]\\.ssh[\\\\/])';
const RAW_INTERNALS = new RegExp([
  `\\b${READERS}\\b\\s+[^\\n|]*${SECRET_FILE}`,                          // reader of a secret file
  `<\\s*[^\\n|]*${SECRET_FILE}`,                                         // redirect FROM a secret file (tee < .env, $(<.env))
  `\\bdd\\s+[^\\n]*if=[^\\n]*${SECRET_FILE}`,                            // dd if=.env
  `\\bcertutil\\b[^\\n]*${SECRET_FILE}`,                                 // certutil -encode .env
  `\\[?io\\.file\\]?::read\\w*\\s*\\([^\\n]*${SECRET_FILE}`,             // [IO.File]::ReadAllText/ReadAllBytes(".env")
  `\\b(cp|copy|mv)\\s+[^\\n]*${SECRET_FILE}[^\\n]*(/dev/std|/dev/fd)`,   // cp .env /dev/stdout
  'printenv\\b',
  '(^|[;&|]\\s*)env\\s*($|[;&|])',
  `${PRINTERS}\\s+["']?\\$\\{?\\s*(env:)?[a-z0-9_]*${SECRET_NAME}`,      // echo/printf $SECRET / ${SECRET} / $env:SECRET
  `\\$env:\\w*${SECRET_NAME}`,                                           // bare PowerShell $env:SECRET
].join('|'), 'i');

// Pure decision: given an event, return the hookSpecificOutput.out object (or null = no gate). Exported so the
// tests exercise the real logic without spawning, and so it can't drift from what the hook actually emits.
// `supply` = the supply-chain result computed by the (async) main before this is called: { flags, decision }.
// Kept as an injected param so decide() stays PURE/offline — the network lives in main, the policy lives here.
export function decide(input = {}, profile = 'approval', supply = { flags: [], decision: 'allow' }) {
  const tool = String(input.tool_name || '');
  const ti = input.tool_input || {};
  const blob = JSON.stringify(ti).toLowerCase();
  const cmd = String(ti.command || '');

  const flags = [];
  const inst = classifyInstall(cmd || blob);
  const unpinnedInstall = inst.isInstall && (!inst.pinned || inst.global);
  if (inst.isInstall) {
    flags.push(unpinnedInstall
      ? 'install (UNPINNED or GLOBAL) → core/INSTALL.md: pin the version and prefer a project-local install (no -g / no curl|sh). Re-issue as e.g. "pkg@x.y.z".'
      : 'install → core/INSTALL.md: show plan → approve → pin → local.');
  }
  // supply-chain / slopsquatting flags (404 = hallucinated, new = low-trust, network error = unverified). The
  // decision is profile-aware already (computed in package-risk.mjs); a 'deny' only ever comes from strict.
  const supplyFlags = Array.isArray(supply && supply.flags) ? supply.flags : [];
  const supplyDeny = !!(supply && supply.decision === 'deny');
  for (const sf of supplyFlags) flags.push(`supply-chain → ${sf}`);
  const destructive = DESTRUCTIVE.test(cmd) || DESTRUCTIVE.test(blob);
  if (destructive) flags.push('destructive → confirm explicitly; nothing irreversible without approval.');
  // publish hygiene (audit): an `npm/pnpm/yarn publish` ships files to a public registry — verify the file list
  // first (no secrets/keys/source maps). Block under strict until checked; ask otherwise.
  const isPublish = PUBLISH.test(cmd) || PUBLISH.test(blob);
  if (isPublish) flags.push('publish → run `node scripts/publish-check.mjs` first: verify the published file list has no .env/keys/.npmrc/source-maps/internal paths before shipping to the registry.');
  if (tool === 'Bash' && /(curl |wget |https?:\/\/)/.test(blob)) flags.push('network/external → nb-security-gate: external requests need approval.');

  // refusal patterns (M3): Replace-All + raw-internals exposure. MultiEdit nests replace_all PER edit
  // (Codex GATE: a top-level-only check missed `edits:[{replace_all:true}]`), so check both shapes.
  const isReplaceAll = (tool === 'Edit' || tool === 'MultiEdit')
    && (ti.replace_all === true || (Array.isArray(ti.edits) && ti.edits.some((e) => e && e.replace_all === true)));
  if (isReplaceAll) flags.push('Replace-All / blind whole-file rewrite → refusal pattern (AGENTS §10): scope the edit; do not rewrite blindly.');
  // tool-agnostic: any tool that carries a shell `command` (Bash OR PowerShell) can dump internals.
  const isRawInternals = !!cmd && RAW_INTERNALS.test(cmd);
  if (isRawInternals) flags.push('raw internals → refusal pattern (AGENTS §10): dumping secrets/.env/keys to output exposes internals; redact / avoid.');

  if (!flags.length) return null;
  const reason = 'NB gate reminder:\n- ' + flags.join('\n- ');
  // Strict denies the genuinely dangerous shapes: destructive/secret, an unpinned/global install, a Replace-All,
  // a raw-internals dump, OR a supply-chain DENY (a 404/hallucinated package, or an unverifiable one — network
  // failure fails CLOSED under strict). (A pinned + local install still only asks — pinning is the whole point.)
  const denyUnderStrict = destructive || SECRET.test(blob) || unpinnedInstall || isReplaceAll || isRawInternals || supplyDeny || isPublish;
  const out = { hookEventName: 'PreToolUse' };
  if (profile === 'advisory') {
    out.additionalContext = reason; // guide only
  } else if (profile === 'strict' && denyUnderStrict) {
    out.permissionDecision = 'deny';
    out.permissionDecisionReason = reason + '\n(strict profile: destructive / secret / unpinned-or-global install / replace-all / raw-internals / 404-or-unverified package are blocked)';
  } else {
    out.permissionDecision = 'ask'; // approval default
    out.permissionDecisionReason = reason;
  }
  return out;
}

// Run as the actual hook only when invoked directly (not when imported by a test — importing must not read fd0).
// Async: the supply-chain gate does a live registry lookup before deciding. It fails OPEN on any error (no gate)
// EXCEPT that a network/lookup error on an install is downgraded by package-risk.mjs to deny/ask/warn per profile
// (supply-chain fails CLOSED under strict by design) — so a flaky network can't silently wave an install through.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    let input = {};
    try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* fail-open */ }
    const profile = (process.env.NB_HOOK_PROFILE || 'approval').toLowerCase();
    const cmd = String((input.tool_input || {}).command || '');
    // NB_HOOK_NO_NETWORK=1 skips the live registry lookup (offline / deterministic test runs). It only disables
    // the network ENHANCEMENT — pin/local, refusal, destructive, and every offline gate still enforce. Not a
    // security bypass: the hook is fail-open advisory; this just forces the network half off.
    const noNet = process.env.NB_HOOK_NO_NETWORK === '1';
    let supply = { flags: [], decision: 'allow' };
    if (cmd && !noNet) { try { supply = await assessInstallSupplyChain(cmd, profile); } catch { /* fail open: no supply gate */ } }
    const out = decide(input, profile, supply);
    if (out) process.stdout.write(JSON.stringify({ hookSpecificOutput: out }));
    process.exit(0);
  })();
}
