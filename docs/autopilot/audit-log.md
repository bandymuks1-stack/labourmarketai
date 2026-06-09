# labourmarket.ai — Autopilot Audit Log

Append-only record of autonomous merges/deploys (policy §5 of
`labourmarket-ai-execution-policy-v1.md`). One row per autonomous merge:
`utc · slice · branch · commit · PR · risk · checks · merge commit · deploy · smoke`.

> Status note: the Telegram reporter is **not yet connected** (owner must supply
> a bot token + chat id, or authorise text-only status). Until then, statuses are
> emitted as text in-thread and this log is the durable record. YELLOW/RED slices
> are **not** auto-merged — they wait for owner review and so do not appear here.

| UTC | Slice | Branch | PR | Risk | Checks | Merge commit | Deploy | Smoke |
|-----|-------|--------|----|------|--------|--------------|--------|-------|
| 2026-06-09 | A — autopilot execution policy | `docs/cc/autopilot-execution-policy-v1` | #268 | GREEN (docs) | quality ✓ · migration-safety ✓ | `6883010` | Vercel auto (docs-only) | n/a (docs) |

## Held — awaiting owner review (NOT auto-merged)

| Slice | Branch | PR | Risk | Reason held |
|-------|--------|----|------|-------------|
| B — F4 worker→project assignment | `feat/cc/f4-worker-project-assignment-v1` | #269 (draft) | YELLOW | permission-logic migration + production RPC → owner security review before apply/merge; migration NOT applied to prod |

## Pending owner inputs (block further autonomous execution)
1. **Telegram channel** — token + chat id (or authorise text-only status). Plan
   rule: status can't be sent → STOP.
2. **F4 (#269) security review** — approve the migration + dual gate (project +
   caller-roster). On approval: apply via MCP → verify privileges → `db:types` →
   ready + merge → F5.
