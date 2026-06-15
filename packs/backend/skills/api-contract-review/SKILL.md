---
name: backend-api-contract-review
description: Diff the request/response contract for changed endpoints and confirm error paths do not leak internals.
---

# api-contract-review — backend pack skill

**Strengthens proof:** `contract-compliance` — the backend pack's close-proof this skill makes more accurate.
**When to read:** After an API change, before contract-compliance is claimed.
**Output / checkpoint:** a request/response contract diff; error-path responses showing no stack traces / internal detail leakage.

## How
- Diff each changed endpoint's request + response shape against the prior contract.
- Trigger the error paths; confirm responses carry no stack traces, SQL, or internal identifiers.
- Note any intentional contract break and why it is acceptable.

> Pack-scoped: this loads only when the **backend** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
