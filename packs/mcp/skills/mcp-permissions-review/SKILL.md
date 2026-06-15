---
name: mcp-mcp-permissions-review
description: Validate the MCP server connection and review the granted permissions/scopes for risk.
---

# mcp-permissions-review — mcp pack skill

**Strengthens proof:** `mcp-validate` — the mcp pack's close-proof this skill makes more accurate.
**When to read:** After wiring an MCP server, before close.
**Output / checkpoint:** connection/validation output and a review of the permissions/scopes granted, with risk notes.

## How
- Validate the server actually connects (capture the output).
- List the permissions/scopes granted; question any broad or write/destructive scope.
- Record the risk review — risky permissions are this pack's unique proof.

> Pack-scoped: this loads only when the **mcp** pack is active (declared ∪ observed ∪ implied). It does not
> ship in the flat core `skills/` set. See `scripts/pack-skills.mjs` for which active-pack skills to read.
