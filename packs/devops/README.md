# DevOps Pack

**Unique close-proof:** a deploy/infra change is "done" only when the **pipeline is green and the change is
reversible** — proven by captured pipeline output. The Core **`deploy` category floor** (full) fires on
Dockerfile / CI / IaC changes independently and demands an acknowledgment; a production deploy needs approval.

`close_contract`: objective `pipeline` (full). Activates on Docker/CI/k8s/terraform/vercel paths and commands.

> Status: `scaffold` — contract designed, not yet exercised end-to-end.
