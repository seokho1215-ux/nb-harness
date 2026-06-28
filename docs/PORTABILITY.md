# Portability — Core, Packs, Adapters

> **NB is a portable AI work harness, not a Claude Code plugin.** Claude Code is the recommended
> *adapter*, not the product. The control layer runs anywhere; the adapter just wires it to a tool.

NB's value is not a specific tool. It is that **any AI work stays attached to intent, evidence, review,
state, and human judgment**. That promise has to survive any one tool disappearing — so NB is built in
three layers, and only the outermost one is tool-specific.

---

## The three layers

```
        ┌─────────────────────────────────────────────────────────────┐
        │  Adapters  — wire the Core to an execution environment         │
        │              Claude Code · Codex · Generic Markdown            │
        ├─────────────────────────────────────────────────────────────┤
        │  Packs     — NB Native domain capability modules               │
        │              product · frontend · testing · …  (optional)      │
        ├─────────────────────────────────────────────────────────────┤
        │  Core      — tool-agnostic control rules (the portable part)   │
        │  intent_lock · evidence_ledger · review_gate · harness_score · │
        │  human_brief · state_machine · self_check · install_safety · … │
        └─────────────────────────────────────────────────────────────┘
```

### Core — tool-agnostic control rules
The portable part. A set of rules and a state/artifact model that do not name any AI tool:
intent lock, evidence ledger, review gate, harness score, human brief, state machine, self-check,
install safety, and the rest (see [`PACKS.md`](PACKS.md) for the full list). Core is plain Markdown +
small dependency-free Node scripts (`status`, `harness-score`, `doctor`, validators). **It assumes no
specific AI tool.** You can run Core's discipline by hand in any AI app.

**Model tier is portable too.** NB does not force a vendor model — it derives a tool-agnostic tier per lane
(`fast`/`balanced`/`strong`/`strongest` + family `single`/`cross-family`/`two-family`) from the task's
strength/workflow/preset and persists it as `state.model_policy` (`scripts/model-policy.mjs`). Your adapter maps
the tier to whatever models you actually have. The user only intervenes to **lower** a tier (a `model-degrade`
decision); raising is free.

**Honest scope:** `model_policy` is a *recorded requirement*, not runtime control. `/nb:close` blocks when the
**recorded** policy is below the derived floor without a `model-degrade` decision — it does **not** observe or
enforce which model actually executed (that is the adapter's job; the agent `model:` frontmatter is static and
does not read `model_policy`). So NB makes "this task needs a strong/cross-family tier" explicit and gates the
*record*; it cannot by itself stop a tool from running the work on a weaker model.

### Packs — NB Native capability modules
Optional domain expansions (product, frontend, testing, …). Packs ride Core and obey its rules; they
add domain agents/skills/workflows. **Packs are NB Native** — they assume the full NB harness around
them (workflows, state, validators), so they are a Native-mode feature, not a generic-mode one. Full
contract: [`PACKS.md`](PACKS.md).

### Adapters — connect Core to an execution environment
An adapter is the wiring that lets a specific tool *run* the Core rules. NB ships and recommends a few,
but the list is open:

| Adapter | What it provides | Status |
|---|---|---|
| **Claude Code** | `/nb:*` commands, subagents, hooks, statusline — Core driven automatically | recommended native adapter |
| **Codex** | cross-family reviewer (`codex exec`, read-only) for the Review Gate | recommended for heterogeneous review |
| **Generic Markdown** | the Core rules as fill-in templates you drive by hand in *any* AI app | always available |

**Claude Code is an adapter, not the product.** If it disappeared, Core and the Generic adapter would
still work. Codex is the recommended *reviewer* for cross-family review; with only one family, the
review gate degrades honestly (split by perspective) rather than failing.

---

## Two ways to run NB

### Native mode (Claude adapter)
Run Core inside the full NB harness with the Claude Code adapter: `/nb:setup`, `/nb:plan`, `/nb:work`,
`/nb:review`, `/nb:grill`, hooks, statusline, presets, packs, and state — all driven for you. This is
the high-ceiling path. Cross-family review uses Codex when available. Install: see the README.

### Generic / Overlay mode (any AI app)
Use Core's discipline next to **whatever AI tool you already use** — ChatGPT, Gemini, Cursor, a local
model, or Claude without the plugin. There are no `/nb:*` commands here; you drive the five Core steps
by hand using the templates in [`../examples/overlay-mode/`](../examples/overlay-mode/).

> **Be honest about what this is.** Generic / Overlay mode is a **portable discipline mode**, not full
> automation. NB doesn't judge strength, route agents, or fire hooks for you here. What it gives you is
> the *structure* — the same intent → evidence → review → brief → score loop — so AI work stays
> traceable and hard to overclaim, in any tool.
>
> **Close-proof paths in Generic mode.** Generic mode supports the core-five close path, the analytical path
> (marked `manual (Generic mode) — not machine-verified, strength: low`, never hidden), AND — via **`nb run`**
> — machine-verified **objective** proofs. `nb run -- <cmd>` is the **Generic-mode trusted execution path**:
> it runs the command and writes the tool-event log + a proof bound to that run by `run_id` + `output_sha256`.
> It is **not** an automatic observer like the Claude hook (it only records when you run *through* it), so its
> *coverage* is weaker — but a proof can only PASS `/nb:close` when produced through this path, so a passable
> objective proof has the same tamper-evident trust ceiling as a hook proof (and is in fact bound *tighter*,
> to the exact run). Honest line: **Generic mode = fully portable discipline + manual/analytical attestation +
> objective proofs through `nb run`; the Claude hook adds automatic, no-effort coverage on top.**

#### The generic checklist (no `/nb:*` needed)
Do these five in order; each maps to a Core rule and produces a plain Markdown artifact you keep:

1. **Intent Lock** — before any work, write down the intent, the definition of done, and the non-goals.
   → `intent-lock.<task>.md`. *Gate: don't start until this is written.*
2. **Evidence Ledger** — after the work, paste the **real** verify output (build/test/lint), not a
   claim. → `evidence.<task>.md`. *Gate: "done" needs shown output.*
3. **Review Gate** — have a second pass review the change against the intent (ideally a different model
   family for cross-family review; at minimum a fresh, separate pass). → `review.<task>.md`.
   *Gate: unresolved blocking findings stop "done".*
4. **Human Brief** — write a plain-language brief: what changed, what's verified, what's risky.
   → `brief.<task>.md`. *Gate: if you can't explain it plainly, it isn't done.*
5. **Harness Score** — confirm all four artifacts exist and match this task. Record them in
   `state.json` and run `node scripts/harness-score.mjs` for the READY / NOT READY signal.

If any step can't be produced, the work isn't done — **if it cannot be recorded, reviewed, and briefed,
it does not belong in NB**, in any mode.

---

## What makes Core portable (and what doesn't travel)

| Travels everywhere (Core) | Native-mode only |
|---|---|
| the five-step discipline + gates | `/nb:*` commands (Claude adapter) |
| `.nb/` state + artifact model | hooks (detect / record), statusline |
| `harness-score` / `status` / `doctor` scripts | automatic strength judgment & agent routing |
| the Markdown templates | Packs (NB Native) |
| `/nb:close` core-five + manual/analytical + objective proofs (objective via `nb run`) | the Claude hook's **automatic** tool-event logging (no-effort coverage; `nb run` is the manual Generic equivalent) |

The further down the stack, the more portable. Build on Core, lean on a Pack when a domain needs it,
and treat the tool as a swappable adapter.

## See also
- [`../examples/overlay-mode/`](../examples/overlay-mode/) — the generic templates + a worked checklist.
- [`PACKS.md`](PACKS.md) — Core vs Pack boundary, Overlay vs Native, pack contract.
- [`EXTENDING.md`](EXTENDING.md) — the six shapes (Core / workflow / skill / agent / module / pack).
