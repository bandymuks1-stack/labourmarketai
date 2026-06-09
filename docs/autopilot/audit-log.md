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
| 2026-06-09 | A — autopilot audit log (step 8) | `docs/cc/autopilot-audit-log` | #270 | GREEN (docs) | quality ✓ · migration-safety ✓ | `558f8f5` | Vercel auto (docs-only) | n/a (docs) |
| 2026-06-09 | B — F4 worker→project assignment | `feat/cc/f4-worker-project-assignment-v1` | #269 | YELLOW→approved | typecheck ✓ · lint ✓ · test 2378 ✓ · build ✓ · migration-safety ✓ · quality ✓ | `a76a588` | Vercel auto | root 200 · /lt→sign-in 200 ✓ |
| 2026-06-09 | C — F5 project-scoped instructions | `feat/cc/f5-project-scoped-instructions-v1` | #272 | additive perm → approved | typecheck ✓ · lint ✓ · test 2385 ✓ · build ✓ · migration-safety ✓ GREEN · quality ✓ | `35ee118` | Vercel auto | root 200 · /lt→auth 307 ✓ |
| 2026-06-09 | D — translation safe service layer | `feat/cc/translation-safe-service-layer-v1` | #273 | GREEN (code+docs) | typecheck ✓ · lint ✓ · test 2394 ✓ · build ✓ · migration-safety ✓ · quality ✓ | `67cbc5b` | Vercel auto | root 200 ✓ |
| 2026-06-09 | E — adaptive skill discovery | `feat/cc/adaptive-skill-discovery-v1` | #274 | GREEN (code+docs) | typecheck ✓ · lint ✓ · test 2402 ✓ · build ✓ · migration-safety ✓ · quality ✓ | `2998744` | Vercel auto | root 200 ✓ |
| 2026-06-09 | F — worker player-card | `feat/cc/worker-player-card-v1` | #275 | GREEN (UI) | typecheck ✓ · lint ✓ · test 2414 ✓ · build ✓ · migration-safety ✓ · quality ✓ | `30b87ad` | Vercel auto | root 200 ✓ |

**F4 migration `20260609120000` applied to prod** (owner-approved 2026-06-09):
3 SECURITY DEFINER fns (`assign_worker_to_project`, `end_worker_project_assignment`,
`caller_manages_worker`), all `search_path=public`, EXECUTE authenticated-only
(anon/public=false); direct insert/update/delete on `project_worker_assignments`
revoked from `authenticated` (RPC-only writes); PWA RLS unchanged; 0 rows (no fake
data). Dual gate (`can_manage_project` AND `caller_manages_worker`).

## Status channel
`TELEGRAM_STATUS: unavailable_fallback_to_text` — `AGENTAI_TELEGRAM_*` not present
in this environment (not harvested, not faked); statuses emitted as text + this log.

## Next (in order)
F5 project-scoped instruction gate → real translation provider (safe service
layer, no private-data external AI without separate approval) → adaptive skill
discovery → worker-first avatar/player-card + My Work Space → company calming (last).
