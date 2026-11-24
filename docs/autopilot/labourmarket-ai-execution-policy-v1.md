# labourmarket.ai — Autopilot Execution Policy (v1)

> Scope: **PROJECT: labourmarket.ai only.** Do not mix any other project,
> codebase, architecture, or the agantai control plane into this repo. This file
> codifies how an autonomous coding agent may merge/deploy here, and when it must
> stop. It is the controlling policy referenced by the 30+ step autopilot plan.

## 1. Risk classes

| Class | Examples | Autonomy |
|-------|----------|----------|
| **GREEN** | copy / honesty labels · UI empty states · tests & guards · non-destructive server logic · a simple safe assignment flow with full tests · docs | May merge + allow Vercel auto-deploy autonomously **after all checks pass + status sent** |
| **YELLOW** | additive migration · permission/RLS change · a production RPC · a new provider interface (no real private-data connection) | May open a PR; **must STOP before merge** for owner review |
| **RED** | external AI on private data · destructive DB · broad grants · billing/payment · real worker/private-message export · fake automation/understanding claims | **No merge/deploy.** Owner decision required |

## 2. Autonomous merge/deploy is allowed ONLY when ALL hold

1. PR is GREEN class (low/medium risk).
2. `typecheck`, `lint`, `test`, `build`, `migration-safety`, and all project
   guards are green.
3. No RLS weakening, no broad grants, no anon/PUBLIC execute, no destructive
   migration, no billing/payment, no external AI on private data.
4. No radical visual / brand / UX change that needs the owner's eyes.
5. A status update was sent for the milestone (see §4).
6. After deploy, a health/smoke check passes and a DEPLOY_OK/SMOKE_OK status is sent.

## 3. Hard STOP conditions (block merge/deploy)

- External AI connected to private data.
- Destructive migration / data deletion / RLS weakening / broad grants.
- Production smoke fails.
- Any security doubt.
- A radical visual decision is needed.
- A migration changes permission logic **and the tests do not cover the whole
  path** (incl. negative cases).
- **Status cannot be sent** (see §4) — the agent must STOP, never ship silently.

## 4. Status reporting

The agent emits a status for: **START, PLAN, RISK, PR_OPEN, MERGED,
DEPLOY_START, DEPLOY_OK / DEPLOY_FAILED, SMOKE_OK / SMOKE_FAILED, NEXT, STOP.**

Minimal status template:

```text
PROJECT: labourmarket.ai
STEP: <phase> / <slice>
STATUS: START | PLAN | RISK | PR_OPEN | MERGED | DEPLOY_OK | SMOKE_OK | STOP
BRANCH:
PR:
COMMIT:
RISK:
CHECKS:
NEXT:
```

> ⚠️ **Telegram channel — NOT YET CONNECTED for labourmarket.ai.** There is no
> bot token / chat id / notify script in this repo, and the owner's Telegram bot
> lives in the separate **agantai** project (must not be mixed in). Until a
> Telegram reporter is connected for this project (owner provides a bot token +
> chat id, or authorises reuse of the agantai bot with a chat id), **statuses are
> emitted as text in the agent's report**, and — per §3 — the agent **STOPS
> before any autonomous merge/deploy** rather than ship without a confirmable
> status channel. Connecting Telegram is the first owner action that unlocks the
> autonomous merge/deploy loop.

## 5. Autopilot audit log

Every autonomous merge/deploy is appended to `docs/autopilot/audit-log.md` with:
`utc · slice · branch · commit · PR · risk class · checks(✓/✗) · merge commit ·
deploy status · smoke status`. (Created on the first autonomous merge.)

## 6. Execution order (from the 30+ step plan)

A. Autopilot/Telegram layer (this doc) → B. **F4 worker→project assignment** →
C. **F5 project-scoped instructions** → D. real translation provider (only after
scope, only with explicit owner sign-off for private data) → E. adaptive skills →
F. worker-first avatar / player-card → G. company/agency calming (last).

## 7. Per-PR acceptance standard

branch · commit · PR link · changed files · what changed · what was deliberately
left untouched · test list · risk verdict · deploy verdict · screenshots (if UI) ·
status sent · next recommended PR.
