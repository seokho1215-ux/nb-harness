# Release Pack

**Unique close-proof:** a release is "done" only when the **release gate is green and the notes cover what
actually changed** — proven by captured gate output plus a review covering `changelog-covers-changes`.

`close_contract`: objective `release-check` (full) + analytical `release-notes-cover-changes` (standard).
Activates on CHANGELOG/version paths and release/publish commands. Cutting a tag needs approval.

> Status: `scaffold` — contract designed, not yet exercised end-to-end.
