# GDPR erasure v2 — proposal (owner decision B, 2026-10-15)

**Status: PROPOSAL. Not a migration, not applied, not wired into the app.**

The owner chose option **B (redo)** for #856 / PR #2412 after the v1 review found
that most accounts could not be erased (66 blocking FKs), CASCADE deleted
employer-held records, and personal content survived in detached rows and
Storage. This folder is the redone design:

| File | What |
|---|---|
| `DESIGN.md` | The erasure model: per-relation classification of all 264 FKs onto a person (DELETE 67 / PSEUDONYMISE 163 / RETAIN-DETACHED 24 / BLOCK 10), JSON sweeps, Storage, step order, idempotency, audit without re-identification. |
| `LAWYER_QUESTIONS.md` | The 8 questions the RETAIN classes depend on. |
| `20261016090000_privacy_erasure_executor_v2.sql.proposed` | Draft migration (RED: SECURITY DEFINER, service_role-only grants, relaxes 99 NOT NULL + 8 CHECK constraints so an erased actor can be NULL). |
| `…down.sql.proposed` | Rollback; refuses once any erasure has executed. |
| `TEST_PLAN.md`, `test/` | Throwaway local PostgreSQL 16 run on a production-shaped stub schema: dry run, blockers, execute, idempotent replay, Storage gate, auth-last completion, drift guard, failure rollback, grants, rollback refusal — all passed (`test/test_output.txt`). |

**Erasure ≠ pseudonymisation.** DELETE removes the person's own content.
PSEUDONYMISE and RETAIN-DETACHED keep a row for another party's legal need with
the link NULL and identifiers scrubbed — that is pseudonymisation (Recital 26),
and the retained rows stay personal data until the lawyer confirms otherwise.

**Gates before any production use (in order):**
1. Lawyer answers `LAWYER_QUESTIONS.md` 1-4 (they decide the RETAIN classes).
2. Supabase branch rehearsal against the full schema (RLS, triggers, functions) — `TEST_PLAN.md` §3.
3. App changes: regenerated DB types + rendering of erased participants (99 columns become nullable).
4. The SQL moves to `supabase/migrations/` (replacing the unapplied v1
   `20261015150000_privacy_consent_erasure_detach_v1.sql`), RED draft +
   `needs-human-gate`, then an explicit owner apply approval.

Until then, erasure requests stay on the manual runbook.
