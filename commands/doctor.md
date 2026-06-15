---
description: Validate the NB installation — files, manifests, commands, skills, agents, scripts, settings, and .nb. Use to diagnose problems.
---

# /nb:doctor

**When:** when something seems off, or after changing NB files.

**NB does automatically:**
- runs `node scripts/doctor.mjs` (PASS / WARN / FAIL) and `node scripts/validate-manifests.mjs`
- reports actionable errors

**Your approval:** none (read-only).

**Produces:** a diagnostic report.
