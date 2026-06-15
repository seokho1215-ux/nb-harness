#!/usr/bin/env node
// NB package-risk-check — manual/dogfood CLI for the supply-chain gate (lib/package-risk.mjs). Given an install
// command, it does the LIVE registry existence check the pre-tool-use hook does and prints the verdict. Handy to
// vet a package before installing, or to see why the hook flagged one. Dependency-free (uses global fetch).
//   node scripts/package-risk-check.mjs --cmd "npm i left-pad react@18.2.0"
//   node scripts/package-risk-check.mjs --cmd "pip install requests" --profile strict
// Exit: 0 allow/warn · 1 ask (needs a decision) · 2 deny (404/unverified under strict).
import { assessInstallSupplyChain, extractInstallPackages } from './lib/package-risk.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const cmd = flag('--cmd');
const profile = (flag('--profile') || 'approval').toLowerCase();
if (!cmd) { console.error('usage: node scripts/package-risk-check.mjs --cmd "<install command>" [--profile approval|strict|advisory]'); process.exit(2); }

const pkgs = extractInstallPackages(cmd);
if (!pkgs.length) { console.log('No registry packages to check (lockfile-only install, non-install command, or only local/URL specs).'); process.exit(0); }

console.log(`Checking ${pkgs.length} package(s) against the registry: ${pkgs.map((p) => `${p.name}(${p.ecosystem})`).join(', ')}`);
const res = await assessInstallSupplyChain(cmd, profile);
for (const p of res.packages) {
  const tag = p.verdict === 'ok' ? 'OK' : p.verdict.toUpperCase();
  console.log(`  [${tag}] ${p.name} (${p.ecosystem})${typeof p.ageDays === 'number' ? ` — ${p.ageDays}d old` : ''}`);
}
for (const f of res.flags) console.log(`  ! ${f}`);
console.log(`\nVerdict: ${res.decision.toUpperCase()}${res.needsDecision ? ' (record a .nb/decisions/<task>.supply-chain.md to proceed)' : ''}`);
process.exit(res.decision === 'deny' ? 2 : res.decision === 'ask' ? 1 : 0);
