# Security Pack

**Unique close-proof:** a change to a risk surface (auth / secrets / payments) is "done" only when a real
**cross-family red/blue review covered that surface with no blocking findings** — not when it merely compiles.

The Security Pack is an *objective-artifact* pack that **delegates the review itself to the existing
`modules/security` red/blue process**; its `close_contract` then requires:

- **analytical `red-blue-covered`** (full) — a hash-bound cross-family review whose `covers_claims` resolve
  `attack-surface-reviewed` and `no-blocking-findings` (each finding either fixed or accepted via a decision).

This rides on, and does not replace, the **Core category floor**: `auth` / `secret` / `payment` detections
fire at full strength on the change itself (even if the Security Pack was never declared), each demanding a
decision acknowledgment. So a backend task that quietly touches `auth/session.ts` is floored regardless. The
pack adds the *review-coverage* proof on top of that floor.

> Honest scope: this is **provenance-bound, not correctness-proven** — NB verifies a genuine red/blue review
> ran and covered the surface, not that the code is unexploitable. `review_gate: cross_family_plus_human`
> stacks a human sign-off for security-relevant work.
>
> Status: `experimental` — the close_contract ships and runs through `/nb:close`; the declared skills/workflow
> are not yet implemented.
