# NB Hooks (.claude/hooks)

Conservative automation. These hooks **guide and record** — they do not pretend to hard-enforce guarantees. They never block legitimate work; at most they surface a reminder or ask for confirmation.

| Hook | Event | What it does |
|------|-------|--------------|
| `user-prompt-submit.mjs` | UserPromptSubmit | detects risky language (quick/install/delete/security/sandbox) and adds a note recommending the matching NB skill/command |
| `pre-tool-use.mjs` | PreToolUse (Bash/Write/Edit) | flags install / destructive / network actions and asks for confirmation, pointing at `core/INSTALL.md` + the security gate |
| `post-tool-use.mjs` | PostToolUse (Bash/Write/Edit) | records tool outcomes into `.nb/logs`; failures into `.nb/evidence` (never silently ignored) |
| `stop.mjs` | Stop | if NB is mid-task (`state.json` mode ≠ idle) but no evidence/review/brief was recorded, nudges to complete closure (once) |
| `pre-compact.mjs` | PreCompact | writes a compact session summary (mode, decisions, evidence pointers, open risks) into `.nb/sessions` |

## Install
Merge `hooks.json` into your project's `.claude/settings.json` under `"hooks"` (the NB installer does this for you). Requires **Node.js**.

All hooks:
- read the Claude Code event JSON on **stdin**,
- are **no-ops if `.nb/` doesn't exist** (so they're inert in a non-NB project),
- exit 0 on anything unexpected (fail-open — a hook bug never stalls your session),
- write no secrets.
