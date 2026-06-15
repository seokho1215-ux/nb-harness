# Trigger Proof — NB actually intervenes

NB isn't a doc bundle; it fires on situations. Examples of automatic intervention:

## Pressure language
You: "just quickly add this, skip the checks"
→ UserPromptSubmit hook adds: *"pressure language → nb-self-check still applies; the strength floor cannot be lowered."*
→ self-check still requires shown `VERIFY_CMD` output.

## Install attempt
NB is about to run `npm install left-pad`
→ PreToolUse hook → **ask**: *"install → core/INSTALL.md: show plan → approve → pin → local."*
→ you approve (or not) before it runs.

## Destructive command
`rm -rf build/`
→ PreToolUse → **ask**: *"destructive → confirm explicitly; nothing irreversible without approval."*

## Mid-task with nothing recorded
You try to finish while mode is `implement` and no evidence exists
→ Stop hook nudges: *"no self-check evidence / no review / no brief — complete closure first."*

## Verify it yourself
```bash
echo '{"prompt":"just quickly npm install x and delete old files"}' | node .claude/hooks/user-prompt-submit.mjs
```
You'll see the recommendation JSON. That's the harness intervening — not a document you have to remember to read.
