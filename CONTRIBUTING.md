# Contributing to NB Harness

NB is a small, conservative harness. Contributions are welcome — keep them sharp and minimal.

## Before opening a PR

Run the full check (all must pass — CI runs the same):

```bash
node scripts/doctor.mjs --source
node scripts/validate-manifests.mjs
node scripts/test-hooks.mjs
node scripts/release-check.mjs
```

## Principles to keep

- **Commands are the small human surface** — don't expose every internal skill/agent/module.
- **Hooks are conservative** — guide and record, never hard-enforce.
- **No vanity skills/agents** — add one only if it creates automatic intervention not already covered.
- **Security is one module**, not the whole product.
- **Hide complexity behind automation** — the user should face fewer decisions, not more buttons.

## Where things live

See the README "Architecture" section. The tool-neutral source of truth is `core/`, `agents/`, `modules/`, `presets/`; the `.claude/` wiring + the plugin manifest are the activation layer. Keep wrappers thin and pointing at the SOT.
