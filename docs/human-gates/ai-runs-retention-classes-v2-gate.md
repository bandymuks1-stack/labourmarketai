# HUMAN GATE — ai_runs retention classes v2

State: `CODE_COMPLETE_PENDING_HUMAN_GATE` (RED: SECURITY DEFINER replace, GRANTs, trigger). NOT applied.

Migration: `supabase/migrations/20261003150800_ai_runs_retention_classes_v2.sql`
Rollback:  `supabase/rollbacks/20261003150800_ai_runs_retention_classes_v2.down.sql`
Proof:     `scripts/db-proof/ai-runs-retention-classes.sh` (scratch PostgreSQL 16, 30 probes PASS, real migrations verbatim)
Guard:     `apps/web/lib/guards/ai-runs-retention-classes-v2.test.ts`
Supersedes: #1266 (`20260824170000`, unmerged draft) — same intent, redesigned against live production.

## Four classes, four treatments

| Class | Columns | Treatment |
|---|---|---|
| ai_content | output_excerpt | null after 90 d (already applied) |
| subject_linkage | profile_id | null after 90 d (NEW) |
| security_audit | id, created_at, task_type, provider, model_alias, model_id, tier, route_reason, locale, input_source, data_categories_sent, request_context, blocked_reason, fallback_*, escalation_applied, cost and token columns, latency_ms | kept |
| evidence_provenance | prompt_version, schema_validation, confidence, human_review_state | kept |

## Live truth (production, 2026-10-04, read-only)

- Already applied, not redone: audit_v1, retention_redaction_v1 (x2), retention_schedule_v1; cron `ai-runs-retention-daily` active.
- 355 rows, 28 Aug to 2 Oct; none past 90 d; 57 sweeps redacted 0; 191 hold an excerpt, 0 hold a profile_id, 355 hold request_context.
- request_context is a closed 7-value surface vocabulary, not a person: #1266 nulled it, v2 keeps it (audit metadata).
- No table references ai_runs (no FK, no ai_run_id column): evidence, journal and draft proposals cannot be broken by redaction. AI output only ever PROPOSES; nothing here promotes it to a verified fact.

## What changes if applied

1. `ai_runs_retention_policy()` registry (immutable, no table).
2. `redact_expired_ai_run_content()` replaced in place: also nulls profile_id. Same grants, same 90-day floor, sweep + cron untouched.
3. BEFORE UPDATE trigger: retained classes immutable; the two redactable columns may only move to NULL (FK ON DELETE SET NULL still works).
4. `ai_runs_delink_subject(uuid)`: service_role-only erasure/objection path (no 90-day wait). Not yet called by any app code: the deletion executor is owner-run; wiring it is a follow-up.
5. `privacy_export_ai_runs_subject_v1()`: authenticated, auth.uid()-derived, metadata only. `ai_runs` moves from WITHHELD to EXPORTED (rpc); until applied the export lists it as `unavailable`, never as empty.

Not blocked, deliberately: DELETE and TRUNCATE on ai_runs (a separate decision).
Rollback cannot resurrect an already-nulled profile_id.
