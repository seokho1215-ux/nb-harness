---
description: Execute the planned task under self-check, install-safety, and security rules, recording evidence. Use after /nb:plan.
---

# /nb:work

**When:** after a plan exists and you've said GO.

**NB does automatically:**
- implements per the plan (one task per session, honoring the `02-module.md` contract)
- **loads the active packs' scoped skills** (see below) — pack skills are NOT auto-loaded; read only the active ones
- enforces self-check Gate B: runs `{VERIFY_CMD}` **through `nb-run` (the trusted execution path)** and **shows the output** (no "done" without evidence)
- enforces install-safety + security gates if triggered
- records evidence **+ an objective proof** into `.nb/` (see below)

**Active-pack skills (read before producing a pack's close-proof).** A pack's capability lives in
`packs/<pack>/skills/<skill>/SKILL.md` and applies ONLY when that pack is active — they are not loaded for every
task (that would blow the skill-description budget). List the ones to read for this task's active packs:

```
node scripts/pack-skills.mjs        # active packs = declared ∪ observed ∪ implied (same resolveActivation as /nb:close; add --pack <id> to union more)
```

Read each printed `SKILL.md` before generating that pack's proof. This is identical in Native and Generic mode —
you get real file paths to open, not a Claude-only auto-skill.

**Self-check runs through nb-run.** Don't call `{VERIFY_CMD}` directly — run it via the trusted execution path so the run is logged independently (`run_id` + `output_sha256`) and the proof `/nb:close` checks for is generated from the REAL run. This is the **same single path in Native (Claude) and Generic (any other AI) mode** — in Native the PostToolUse hook also logs the run, but only nb-run auto-writes the objective proof:

```
node scripts/nb-run.mjs --task <task-slug> --evidence --pack <active-pack> --proof <objective-proof-type> --cmd "{VERIFY_CMD}"
```

- `--cmd` takes the **whole** verify command as one quoted string (quoting is preserved verbatim). If `{VERIFY_CMD}` has inner quotes, escape them for your shell — bash: `--cmd "node -e \"require('./x')\""`; PowerShell: `--cmd 'node -e "require(''./x'')"'`.
- `--evidence` writes `.nb/evidence/<task>.md` + an artifact-ledger row.
- `--pack <p> --proof <type>` is **required whenever the active pack declares an `objective_proof`** — it auto-writes `.nb/proofs/<task>.<pack>.<type>.json` from the real run, bound to it by `run_id` + `output_sha256`. Without it, `/nb:close` blocks with "objective proof missing". Omit `--pack/--proof` only for packs with no objective-proof contract (e.g. docs-only).
- nb-run exits with the command's own code — **and exit 2 if it could not write the trusted records**, so a "verified" claim never survives a failed record-write.

**Your approval:** required before any install, destructive, or external action — those never auto-run.

**Produces:** code changes, `.nb/evidence/<task>.md`, `.nb/proofs/<task>.<pack>.<type>.json` (when the active pack has an objective proof), a `tool-events.jsonl` row bound to the run, and updated `.nb/state.json` (mode: `implement`).
