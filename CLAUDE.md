# NB Harness — Claude Code entry

> Auto-loaded by Claude Code. **This file is for developing / contributing to NB itself.**
> To *use* NB in your own project, read [`README.md`](README.md) / [`AGENTS.md`](AGENTS.md).

## Verify after any change
```
node scripts/release-check.mjs
```
Keep it READY — it runs every validator/test plus a real install smoke.

## Principles
- NB is a **control layer** — `intent → workflow → execution → evidence → review → brief → done/blocked` — not an agent-count framework.
- **No vanity agents/skills.** Add depth only for control / state / evidence / lifecycle / extensibility.
- Conservative hooks; security is one module; keep `release-check` green.
- You can **dogfood NB here**: run `/nb:setup` and drive a task through to verify the real wiring.
