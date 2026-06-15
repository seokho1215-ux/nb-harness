# Review — <task>

> Step 3 of 5. Maps to Core rule `review_gate`.
> Have a SECOND, separate pass review the change against the locked intent. Best: a different model
> family (cross-family review catches blind spots one family shares). Minimum: a fresh, separate pass —
> not the same context that wrote the code.

## Reviewer
<which model / family / person did the review>

## Verdict
<PASS / PASS with notes / CHANGES REQUIRED>

## Checked against intent
- [ ] does the change match the locked intent + definition of done?
- [ ] were any non-goals violated?
- [ ] were any "must not change" items touched?
- [ ] is the evidence real and sufficient?

## Findings
- <finding — severity — blocking? yes/no>

> Gate: any unresolved BLOCKING finding stops "done".
