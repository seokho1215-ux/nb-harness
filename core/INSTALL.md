# Install Safety (core)

> "The AI absorbs install complexity" is convenient — but for a beginner it's a **supply-chain risk** if the AI installs things silently (e.g. a stray `npm i -g whatever`). This flow is **core, not optional.**

## The flow (always)

1. **Show the plan first** — "I'll install: X, Y — here's why." The user sees it before anything runs.
2. **Install only after approval** — no silent install.
3. **Pin versions** — lockfile / checksum. No floating "latest".
4. **Prefer local over global** — project-local install first; avoid global unless unavoidable (and say so).

## Why

- A beginner can't audit a dependency tree. Silent global installs are exactly how a supply-chain compromise slips in.
- Pinning = reproducible, and a moving dependency can't swap under you between runs.
- This is a **separate axis** from the strength auto-judge (`AGENTS.md` §4): strength is decided automatically, but install **always shows-and-asks**. A beginner does not hand the AI a blank check on installs.

## Where this binds

Any module whose `nb-module.yaml` has a non-empty `install_deps` triggers this flow **before it runs**.

Relevant manifest fields (see `core/MANIFEST.md`):
- `install_deps` — what would be installed (name + pinned version + scope).
- `requires_approval` — gates execution behind explicit user consent.
- `permissions: [install]` — declares the module can install at all.
