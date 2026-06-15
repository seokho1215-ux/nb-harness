---
name: install-safety
description: NB install safety. Use whenever installing dependencies, CLIs, packages, or running install/setup scripts (npm/pip/brew/cargo install, npx, "curl | sh", global installs, etc.). Never silent-install — show the plan, get approval, pin versions, prefer local over global.
---

# nb-install-safety — Claude Code wrapper

> Thin wrapper. The full rule is `core/INSTALL.md` (tool-agnostic SOT).
> **Your first action MUST be `Read` on `core/INSTALL.md`**, then follow the flow:
>
> 1. Show the plan first ("I'll install X, Y — why").
> 2. Install only after the user approves. No silent install.
> 3. Pin versions (lockfile / checksum).
> 4. Prefer local over global.

This is a separate axis from strength auto-judge — installs **always** show-and-ask. A beginner does not hand the AI a blank check on installs.
