// NB activation/floor engine (shared, dependency-free). Decides, at /nb:close time, which packs are
// actually in play and the minimum rigor — from OBSERVED signals, not the AI's say-so.
//
// Three Core-owned ideas (a firewall, not a checklist):
//   - active_packs = declared ∪ observed(pack rules) ∪ implied_by_category. The AI can ADD a pack,
//     never remove one; close RECOMPUTES rather than trusting state.
//   - the CATEGORY floor detector is Core and pack-independent (db/auth/secret/payment/deploy/delete/
//     network/mcp/install). It runs on the hook log AND on `git diff base..now` — the diff is the only
//     source for changes made outside NB's tools (e.g. a hand-edited migration).
//   - an unknown/high-impact change (something changed, but no pack and no category matched) escalates.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { loadEvents } from './proof.mjs';
import { langOf, detectExecSinks } from './exec-detect.mjs';
import { isWorkflowFile, scanWorkflowText } from './ci-workflow-scan.mjs';

const RANK = { light: 1, standard: 2, full: 3 };
const higher = (a, b) => (RANK[a] >= RANK[b] ? a : b);

// Packs a WORKFLOW choice forces into play regardless of what the detector observed (audit #20). Choosing
// `security-sensitive` is itself a declaration that the task touches the safety floor, so the security pack's
// proof is required at close even when no file/command matched the auth/secret/payment regexes.
export const WORKFLOW_FORCED_PACKS = { 'security-sensitive': ['security'] };

// Core risk categories — pack-independent. Each: which files/commands signal it, its floor, and the
// pack it implies (so a detected risk pulls that pack's proofs in even if the AI never declared it).
export const CATEGORIES = [
  { id: 'data',    floor: 'full',     pack: 'data',     files: /(migrat|schema|\.sql$|prisma|drizzle|supabase|seed|backup|\bdb\b)/i, cmds: /(migrat|db[ :]?push|prisma|drizzle|supabase|psql|mysql|mongo|seed|drop\s+table|truncate)/i },
  { id: 'auth',    floor: 'full',     pack: 'security', files: /(auth|session|cookie|jwt|oauth|\brls\b|policy|login|sign[-_]?(in|up))/i, cmds: /(auth|jwt|oauth)/i },
  { id: 'secret',  floor: 'full',     pack: 'security', files: /(\.env|secret|credential|\bkeys?\b|token|byok|\.pem$)/i, cmds: /((KEY|TOKEN|SECRET|PASSWORD)\s*=|vault|gpg)/ },
  { id: 'payment', floor: 'full',     pack: 'security', files: /(stripe|checkout|billing|subscription|payment|invoice)/i, cmds: /(stripe|checkout|billing)/i },
  { id: 'deploy',  floor: 'full',     pack: 'devops',   files: /(Dockerfile|docker-compose|\.github\/workflows|vercel|netlify|cloudflare|deploy|k8s|helm|terraform)/i, cmds: /(deploy|docker\s+(build|push)|vercel|netlify|wrangler|kubectl|terraform|helm)/i },
  { id: 'delete',  floor: 'full',     pack: null,       files: null, cmds: /(rm\s+-rf?|\bdrop\s+(table|database)\b|truncate|wipe|delete\s+from|\bdel\s+\/)/i },
  { id: 'network', floor: 'standard', pack: 'backend',  files: /(webhook|cors|proxy)/i, cmds: /(curl|wget|https?:\/\/)/i },
  { id: 'mcp',     floor: 'standard', pack: 'mcp',      files: /(mcp\.json|mcp[_-]?config|\.mcp\b)/i, cmds: /\bmcp\b/i },
  // supply-chain: a dependency manifest OR lockfile changed, or an install command ran. Floor standard + a
  // required decision at close ("these dependencies were vetted") — the firewall half of the slopsquatting gate
  // (the pre-tool-use hook does the live registry existence check; lib/package-risk.mjs). Lockfiles are included
  // because a resolved-deps change is the strongest "the dependency set actually changed" signal.
  { id: 'supply-chain', floor: 'standard', pack: null, files: /(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|Pipfile|poetry\.lock|Gemfile|go\.(mod|sum)|Cargo\.(toml|lock))/i, cmds: /(npm\s+i(nstall)?\b|npm\s+ci\b|pnpm\s+(add|install)|yarn\s+add|pip\s+install|cargo\s+(add|install)|go\s+get|gem\s+install)/i },
  // code-execution is CONTENT-driven (a dangerous sink inside a changed file), not path/command-driven — its
  // files/cmds are null so detectCategories never auto-adds it; resolveActivation adds it after scanContent().
  { id: 'code-execution', floor: 'full', pack: 'security', files: null, cmds: null },
  // ci-security is CONTENT-driven too (a dangerous GitHub Actions pattern in a changed workflow) — added by
  // resolveActivation after scanCIWorkflows(). A plain `.github/workflows` change already trips `deploy`
  // (devops); this raises it to a SECURITY review when an injection/over-permission pattern is present.
  { id: 'ci-security', floor: 'full', pack: 'security', files: null, cmds: null },
];

const anyMatch = (values, re) => !!re && values.some((v) => re.test(String(v)));
const matchesAny = (value, patterns = []) => patterns.some((p) => (p instanceof RegExp ? p.test(value) : String(value).includes(p)));

// Which Core categories do these changes trip? changes = { files:[], commands:[] }.
export function detectCategories(changes = {}) {
  const files = changes.files || [];
  const cmds = changes.commands || [];
  return CATEGORIES.filter((c) => anyMatch(files, c.files) || anyMatch(cmds, c.cmds)).map((c) => c.id);
}

// Minimum strength forced by the detected categories (full > standard > light).
export function floorStrength(categories = []) {
  let s = 'light';
  for (const id of categories) {
    const c = CATEGORIES.find((x) => x.id === id);
    if (c) s = higher(s, c.floor);
  }
  return s;
}

// Packs a category pulls in even if undeclared (data->data, auth/secret/payment->security, ...).
export function impliedPacks(categories = []) {
  return [...new Set(categories.map((id) => CATEGORIES.find((c) => c.id === id)?.pack).filter(Boolean))];
}

// Packs whose own activation_rules match the changes. packRules = { pack: { paths:[], commands:[] } }.
export function observedPacks(changes = {}, packRules = {}) {
  const files = changes.files || [];
  const cmds = changes.commands || [];
  return Object.keys(packRules).filter((pack) => {
    const r = packRules[pack] || {};
    return files.some((f) => matchesAny(f, r.paths)) || cmds.some((c) => matchesAny(c, r.commands));
  });
}

// Something changed, but nothing classified it -> high-impact unknown, must escalate.
export function unknownImpact(changes = {}, observed = [], categories = []) {
  const n = (changes.files || []).length + (changes.commands || []).length;
  return n > 0 && observed.length === 0 && categories.length === 0;
}

// `git diff --name-only base..` + `git status --porcelain --untracked-files=all` (catches untracked new files
// too, e.g. a new migration). `--untracked-files=all` is REQUIRED: the default folds an untracked dir into one
// "dir/" entry, so a new file like `src/auth/login.ts` would surface only as `src/` — defeating both the
// category-floor regexes and must_not_change matching. We need the individual file paths. Returns { files, ok };
// ok=false when git/base_ref are unavailable -> low confidence.
function gitChangedFiles(root, baseRef) {
  if (!root || !baseRef) return { files: [], ok: false };
  const run = (args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const diff = run(['diff', '--name-only', baseRef]);
  if (diff.error || diff.status !== 0) return { files: [], ok: false };
  const status = run(['status', '--porcelain', '--untracked-files=all']);
  const files = new Set(diff.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  if (!status.error && status.status === 0) {
    for (const ln of status.stdout.split(/\r?\n/)) {
      const p = ln.slice(3).trim(); // strip "XY " status prefix
      if (p) files.add(p);
    }
  }
  return { files: [...files], ok: true };
}

// Content scan (audit: dynamic-exec/unsafe-deserialization/command-execution detector). Reads each changed,
// language-recognized file and looks for a dangerous sink (CWE-94/78/502). Skips files NB has no patterns for,
// binary files, and files > 512KB (reported in `skipped`). A hit -> the `code-execution` risk category.
const MAX_SCAN_BYTES = 512 * 1024;
export function scanContent(root, files = []) {
  const hits = [];
  const skipped = [];
  if (!root) return { hits, skipped };
  for (const f of files) {
    if (!langOf(f)) continue; // only code files we have sink patterns for (docs/data/unknown -> no scan)
    const p = pathJoin(root, f);
    let st; try { st = statSync(p); } catch { continue; } // deleted/missing -> nothing to scan
    if (!st.isFile()) continue;
    if (st.size > MAX_SCAN_BYTES) { skipped.push({ file: f, reason: 'large' }); continue; }
    let buf; try { buf = readFileSync(p); } catch { continue; }
    if (buf.includes(0)) { skipped.push({ file: f, reason: 'binary' }); continue; } // NUL byte -> binary
    for (const h of detectExecSinks(buf.toString('utf8'), f)) hits.push({ file: f, ...h });
  }
  return { hits, skipped };
}

// CI-workflow scan: read each changed `.github/workflows/*.yml` and flag the documented compromise patterns
// (pull_request_target + untrusted head, write-all, secrets: inherit, unpinned action, run-script injection).
// A hit -> the `ci-security` risk category (full floor + security pack implied + a required acknowledgment).
export function scanCIWorkflows(root, files = []) {
  const hits = [];
  if (!root) return { hits };
  for (const f of files) {
    if (!isWorkflowFile(f)) continue;
    const p = pathJoin(root, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (!st.isFile() || st.size > MAX_SCAN_BYTES) continue;
    let txt; try { txt = readFileSync(p, 'utf8'); } catch { continue; }
    for (const h of scanWorkflowText(txt, f)) hits.push(h);
  }
  return { hits };
}

// The full resolution close.mjs consumes. state = { declared_packs, task_base_ref, ... }.
export function resolveActivation({ nbDir, root, state = {}, packRules = {} }) {
  const events = loadEvents(nbDir);
  const commands = events.filter((e) => e.cmd).map((e) => e.cmd);
  const logPaths = events.filter((e) => e.path).map((e) => e.path);
  const baseRef = state.task_base_ref || null;
  const git = gitChangedFiles(root, baseRef);
  const files = [...new Set([...logPaths, ...git.files])];
  const changes = { files, commands };

  const categories = detectCategories(changes);
  // Content scan: a dangerous dynamic-exec / deserialization / command sink in a changed file raises the
  // `code-execution` risk category -> security pack implied + full floor + a required acknowledgment, so close
  // stays NOT_READY until a security proof exists. Content-driven, so it's merged here (not in detectCategories).
  const execScan = scanContent(root, files);
  if (execScan.hits.length && !categories.includes('code-execution')) categories.push('code-execution');
  // CI-workflow scan: a dangerous GitHub Actions pattern in a changed workflow raises `ci-security` (full floor +
  // security pack implied + a required acknowledgment) — beyond the `deploy`/devops a plain workflow change gives.
  const ciScan = scanCIWorkflows(root, files);
  if (ciScan.hits.length && !categories.includes('ci-security')) categories.push('ci-security');
  const observed = observedPacks(changes, packRules);
  const declared = Array.isArray(state.declared_packs) ? state.declared_packs : [];
  const implied = impliedPacks(categories);
  // Workflow-forced packs (audit #20): choosing the `security-sensitive` workflow IS a declaration that this
  // task touches the safety floor, independent of whether any file/command matched the detector. So the
  // security pack is forced EXPLICIT (its security-report-check proof is required at close even when nothing
  // auto-detected), and the floor is raised to full to match the workflow's "strength: full, never lowered"
  // contract — this also pre-empts a hand-edited strength_level:light from dropping the proof below full.
  const forced = WORKFLOW_FORCED_PACKS[state.current_workflow] || [];
  // explicit = the AI/user declared it OR the pack's own rules matched OR the workflow forces it (in play on purpose).
  // implied = pulled in only by a Core category (leans on the floor, never CHECK-ERRORs uncontracted).
  const explicit = [...new Set([...declared, ...observed, ...forced])];
  const active = [...new Set([...explicit, ...implied])];

  let floor = floorStrength(categories);
  if (state.current_workflow === 'security-sensitive') floor = higher(floor, 'full');

  return {
    active_packs: active,
    explicit_packs: explicit,
    implied_packs: implied,
    forced_packs: forced,
    observed_categories: categories,
    floor_strength: floor,
    unknown_impact: unknownImpact(changes, observed, categories),
    baseline_confidence: (baseRef && git.ok) ? 'high' : 'low',
    changes,
    exec_scan: execScan,
    ci_scan: ciScan,
  };
}
