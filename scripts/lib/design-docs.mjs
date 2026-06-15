// NB design-docs check (pure, dependency-free) — the planner's 3-tier docs must actually EXIST before a task is
// implemented/closed (audit P-e/#9), and each task file must DECLARE its context budget (audit M2 — the 40%
// rule lives in the task doc; a script can't see live tokens, so the enforceable invariant is "every task
// declared a budget", not the runtime token count).
//
// Convention (agents/planner.md): docs live at <projectRoot>/pipeline/<feature>/ with
//   01-architecture.md · 02-module.md (the contract every implementer reads) · 03-tasks/NN.md (one per task,
//   each ending with a `## Context Budget` estimate). state.design_docs overrides the default dir.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, isAbsolute, resolve, relative } from 'node:path';

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The directory a task's design docs should live in: state.design_docs (project-relative or absolute), else the
// default `pipeline/<slug>`. Returned ABSOLUTE, resolved under projectRoot.
export function designDocsDir(projectRoot, slug, override) {
  const rel = override && String(override).trim() ? String(override).trim() : join('pipeline', slugify(slug) || 'task');
  return isAbsolute(rel) ? resolve(rel) : resolve(projectRoot || '.', rel);
}

// Is `target` inside `root` (same dir or a descendant)? Used to REFUSE a design_docs override that escapes the
// project (Codex GATE: an absolute/`../` override pointed validate-state at docs OUTSIDE the project).
function insideRoot(root, target) {
  const r = resolve(root || '.');
  const t = resolve(target);
  if (t === r) return true;
  const rel = relative(r, t);
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel);
}

// Check the 3-tier docs exist and each 03-tasks/*.md declares a context budget. Returns { ok, errors:[] }.
// Pure over the filesystem (reads only); no writes. A missing dir / tier / budget — or an override that escapes
// the project — is an error.
export function checkDesignDocs(projectRoot, slug, override) {
  const errors = [];
  const dir = designDocsDir(projectRoot, slug, override);
  // containment: design_docs must live INSIDE the project — never an absolute/`../` path to external docs.
  if (!insideRoot(projectRoot, dir)) {
    return { ok: false, errors: [`design_docs must be inside the project — "${override}" resolves outside ${resolve(projectRoot || '.')}`], dir };
  }
  if (!existsSync(dir)) return { ok: false, errors: [`design docs missing: ${rel(projectRoot, dir)} not found (planner must produce 01/02/03 before implement)`], dir };

  if (!existsSync(join(dir, '01-architecture.md'))) errors.push(`design docs: 01-architecture.md missing in ${rel(projectRoot, dir)}`);
  if (!existsSync(join(dir, '02-module.md'))) errors.push(`design docs: 02-module.md (the contract) missing in ${rel(projectRoot, dir)}`);

  const tasksDir = join(dir, '03-tasks');
  let taskFiles = [];
  if (!existsSync(tasksDir)) {
    errors.push(`design docs: 03-tasks/ missing in ${rel(projectRoot, dir)}`);
  } else {
    try { taskFiles = readdirSync(tasksDir).filter((f) => f.endsWith('.md')); } catch { /* unreadable */ }
    if (!taskFiles.length) errors.push(`design docs: 03-tasks/ has no task file (NN.md)`);
    for (const f of taskFiles) {
      let txt = '';
      try { txt = readFileSync(join(tasksDir, f), 'utf8'); } catch { errors.push(`design docs: 03-tasks/${f} unreadable`); continue; }
      // M2: the task must declare a context budget (the 40% rule) WITH an estimate — a `## Context Budget`
      // heading (or `context budget:` line) AND, in that section, a number / % / token / window (so an empty
      // heading isn't enough). The DECLARATION is what's enforced; the live token count is out of a script's reach.
      const m = /(^#{1,6}\s*context\s*budget\b|\bcontext\s*budget\s*:)/im.exec(txt);
      if (!m) {
        errors.push(`design docs: 03-tasks/${f} declares no "## Context Budget" (M2: each task must state its ≤40% budget)`);
      } else if (!/(\d|%|token|window)/i.test(txt.slice(m.index, m.index + 400))) {
        errors.push(`design docs: 03-tasks/${f} "Context Budget" has no estimate (a number / % / token / window) — an empty heading is not a budget`);
      }
    }
  }
  return { ok: errors.length === 0, errors, dir, taskCount: taskFiles.length };
}

function rel(root, p) {
  try { const r = String(p).startsWith(String(root)) ? String(p).slice(String(root).length).replace(/^[\\/]+/, '') : p; return r || p; } catch { return p; }
}

// Tiny helper so callers can check a dir is a real directory (not a file) without importing fs themselves.
export function isDir(p) { try { return statSync(p).isDirectory(); } catch { return false; } }
