# Self-Check — The Evidence Gate (core)

> The cheap gate that runs **before** the cross-family review (`AGENTS.md` §6).
> One principle, two directions: **no claim without evidence.**
> - Before you write code: open the docs. The Read call is the evidence.
> - Before you claim "done": run the checks and show the output. Green output is the evidence.
>
> Generalized from a coding-discipline skill proven in this harness's private ancestor
> ("open the SPEC" → "open the project docs / the design contract").

## When this applies

Any code that carries logic or risk:

- API / route handlers, server actions
- DB schema / migration / access-control rules
- auth / encryption / secret or key storage
- external API calls, payment, file delete/move, deploy
- anything on the **safety floor** (`AGENTS.md` §4)
- **and** whenever the user pushes: "quickly", "10 minutes", "just this one", "real fast"

Skip: UI-only edits (no logic), prose docs, type-only refactors, dependency-free pure functions.

## Gate A — Read before you write (input side)

Before writing the body of the code, open the relevant source of truth with the Read tool. **The Read call itself is the evidence — there is no other.**

Open, in priority:
1. The **design contract** — `02-module.md` (signatures, types, paths, schema for this feature).
2. The **project docs** (`{PROJECT_DOCS}`) if the project has them — security rules, dev conventions, product gating.
3. The **security gate** (`{SECURITY_GATE}`) when the diff touches auth / access-control / secrets / external calls.

If the project has no docs, the design contract (`02-module.md`) + the task file are the source of truth. Open them.

Order: open the file → read the relevant section → write the code. Never reorder.

## Gate B — Show before you claim (output side)

Before claiming a task is "done":
1. Run `{VERIFY_CMD}` (build / test / lint).
2. **Show the output.** Green output is the evidence.

No "it works" / "tests pass" without the output to show. A green claim with no output is the AI's most common lie. This is the *verification-before-completion* principle: the green light is not the proof — the output is.

## What does NOT count as checking

| Substitute | Why it fails |
|---|---|
| "It's in my memory / the summary" | Memory is a frozen hint; the source of truth evolves. |
| "I know this pattern / learned knowledge" | Learning isn't calibrated to *this* project's *this* version. |
| "I read the key section" (no Read call this turn) | No Read call this turn = you didn't open it. |
| "It's a demo / example / scenario" | The hand that writes the demo writes production. Same habit. |
| `// docs: ...` written, file not opened | Post-hoc citation. False authority. |
| "The contract (02-module) has it" | The contract can mis-transcribe the source. You haven't seen the source. |
| "Tests pass" (no output shown) | A claim is not evidence. The output is. |

## Citation Rule (kills post-hoc citation)

To cite a doc section in a code comment, **both** must hold:
1. You opened that file with the Read tool **this turn**.
2. You attach a **one-line excerpt** from the source right after the citation.

OK:
```
// {SECURITY_GATE} order — "1. rate limit -> 2. auth -> 3. validate input -> 4. authorize -> 5. business rules"
```
Violation:
```
// security gate applied
```
(No excerpt = no right to cite. Delete the citation or open the file.)

## Rationalization Table

| Excuse | Reality |
|---|---|
| "Memory has the rule, I read the key bit" | "I read it" is proven by the Read call. No call, no read. |
| "The summary / entry file was enough" | The entry file points at the source. Follow the pointer. |
| "It's a scenario / demo / it's fast" | The scenario's habit is production's habit. |
| "Small route, full read is overkill" | The first route sets the pattern. Small area, big precedent. |
| "I wrote the doc path in a comment, done" | A citation with no excerpt is false. |
| "Deadline / I'm in a hurry" | Pressure is the exact condition this rule exists for. No pressure = no need for the rule. |
| "I marked the choice, that's enough" | Marking a choice is not acting. Acting = the Read call (and the shown output). |
| "Access control is filtered by the platform, so cross-scope leaks are handled" | Platform row-level rules usually block cross-**user** only. Cross-scope (project/tenant) is your code's job — filter it explicitly. |
| "Citing `doc §X` is enough, the excerpt is too long" | No excerpt = paraphrase = false authority. Format is strict: `doc §X [line N] — "<source line>"`. |

## Red Flags — STOP, open the source / run the check

- About to write `// docs: ...` but didn't Read that file this turn.
- "I already know" / "it's in memory" → proceeding without opening the file.
- User says "quickly" / "10 min" / "just this one" / "real fast".
- Diff touches auth / access-control / secrets / external API / schema / the safety floor.
- "Just this once as an exception."
- A doc citation appears in the answer with no Read call behind it.
- Claiming "done" with no `{VERIFY_CMD}` output shown.

→ All of them: STOP. Open the source / run the check. Then proceed.

## Spirit vs Letter

Violating the letter (the Read call + the excerpt + the shown output) violates the spirit (safe, consistent code). The spirit is **calibrated reading and shown evidence** — not vibe-based confidence.

## Validation History (pattern, from this harness's ancestor)

- **RED:** under a pressure scenario, an agent wrote code without opening the docs → guessed a schema wrong (missed a NOT NULL constraint), duplicated an existing route, and got the security-gate order wrong.
- **GREEN:** same scenario with this gate active → the agent opened the docs (multiple Read calls), attached one-line excerpts, caught all three errors. No new excuse captured.
- **Baked-in lesson:** "the contract has it" and "I read the key section" are the two excuses that re-appear most; both are answered above.
