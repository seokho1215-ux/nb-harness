# Git/PR Pack

**Unique close-proof:** the PR is where "done" is claimed — so it's "done" only when the **description matches
the diff** — proven by a review covering `description-matches-diff`. This is the highest-frequency firewall
checkpoint, deliberately kept its own pack rather than buried in release.

`close_contract`: analytical `pr-covers-diff` (standard). Activates on `git push` / `gh pr` commands.

> Status: `scaffold` — contract designed, not yet exercised end-to-end.
