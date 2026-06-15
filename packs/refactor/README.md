# Refactor Pack

**Unique close-proof:** a refactor is "done" only when **behavior is unchanged** — proven by the test suite
producing the same result before and after, plus a review covering `behavior-unchanged`.

`close_contract`: objective `tests-before` + `tests-after` (standard) + analytical `equivalence` (standard).
The before/after split makes equivalence machine-checkable rather than asserted.

> Status: `scaffold` — contract designed, not yet exercised end-to-end.
