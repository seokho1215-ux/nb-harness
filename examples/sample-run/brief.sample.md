# Brief — settings-name

**What changed:** Added a settings page where someone can save their display name.

**Verified:** I ran it — the build passes and 12 tests pass (saves, survives reload, handles long names).

**Intent check:** Matches what you asked — a display-name save, nothing extra (no avatars or auth changes, as agreed). No scope drift.

**Still worth your eye:** Very long names get trimmed silently — that's a taste call. (1 open risk)

**Ready to claim done?** The harness checklist is complete (score: READY). One thing's yours to decide: the silent trim — fine as-is, or do you want a visible limit?
