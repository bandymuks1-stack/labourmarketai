# Value Train 2 — resumable checkpoint (2026-08-23)

**Base at train start:** merged main `0caf0895` (Train 1, PR #1236).
**Branch (fixed for this train):** `claude/labourmarket-audit-consolidate-dbqwzt`
(restarted from fresh `origin/main` after every merged wagon).
**Production target (verified):** Supabase `gorgitwvdzxbnaxhrsrw` (labourmarket.ai, eu-west-1).

## Completed / merged

| Wagon | PR | Merge SHA | What changed |
|---|---|---|---|
| A — AI activation readiness | #1237 | `e7b098d4` | Model-aware thinking (haiku alias no longer 400s), canonical `claude-haiku-4-5` id, structured-output schema propagated to all adapters, `truncated` request-attributed (chain stops — no paid re-disclosure), chain fallback never ships a foreign vendor's model id, per-client throttles on all three public marketing AI actions + guard. NO provider activated. |
| B1 — weekly intelligence read model | #1238 | `86c2cfdc` | Pure codes-only weekly view model on canonical reads (`journalReportWindow`, `getWorkerJobRecommendations`, §19 basis carried whole). Honesty rules tested: unavailable ≠ zero, unknowable omitted, factual inactivity coding. |
| B2 — weekly digest carrier | #1239 | `bf383492` | `weekly_digest` event/entity type (v6 widening, canonical GREEN idiom), read-time materializer in `event-emitters.ts` (no new service-role caller), pointer-only row (§19(d)), copy in 11 locales (real translations), 3 baselines 235→236. |

**APPLIED TO PROD: notification_events_v6_weekly_digest** (rollback:
`supabase/rollbacks/20260823150500_notification_events_v6_weekly_digest.down.sql`)
— post-apply MCP read verified both CHECK constraints include `weekly_digest`.

## Production evidence gathered (read-only, 2026-08-23)

`ai_runs` 0 · `usage_cost_events` 0 (AI DORMANT confirmed) ·
`notification_events` 2 rows pre-train · profiles 36 · journal_entries 36 ·
active `public_vacancies` 43,817 · `document_files` 0 · `customer_requests` 17.

## In flight

Wagon B3 (this PR): `notification_preferences_v1` DRAFT migration + rollback
(RED by route — grants; ships UNAPPLIED; deliberately not
human-gate-annotated), owner decisions package v2 (D7–D9), this checkpoint.
CI `migration-safety` red on this PR is **by design**; it waits for the owner.

## Open owner gates

Train 1: D1 (CI ledger grant) · D2 (employer-count registry identity, RED
SQL drafted in the package) · D3 (search index option A/B) · D4 (draft-queue
per-file verdicts) · D5 (/jobs throttle waiver) · D6 (AI activation route).
Train 2: D7 (email channel + preferences apply) · D8 (gemini costClass) ·
D9 (Telegram env secrets). TELEGRAM_STATUS = UNAVAILABLE this environment.

## Next highest-value seams (in priority order, per the train's bias)

1. **After D6:** one harmless E2E AI proof (one `ai_runs` row,
   `schema_validation='passed'` + paired cost event) → AI_RUNTIME =
   CAPABILITY_PROVEN/VERIFIED_PRODUCTION.
2. **After D7:** email dispatch wagon (reuse `lib/email/transactional.ts`,
   invitation delivery-ledger pattern, GH-Actions kill-switched cron) —
   closes the loop for absent workers.
3. **Wagon C seed:** `document_files` chain is entirely unexercised (0 rows)
   — small representative historical-import proof per acceptance §27.
4. **D2 → Market Pulse (Wagon E):** canonical employer count unblocks the
   public aggregate surface.
5. `worker_opportunity_seen` apply (D4 "APPLY" recommendation) unlocks the
   honest "new since last week" digest signal (currently omitted by design).

## Status labels (hard completion rules)

AI_RUNTIME = IMPLEMENTED_NOT_PROVEN (activation-ready; owner-gated).
WEEKLY_DIGEST_IN_APP = SHIPPED (merged + deployed + prod constraint
verified; first real rows require real worker visits — REAL_USER_DATA not
yet claimed). NOTIFICATION_EMAIL = MISSING (gated, D7).
