# Phase B3 — remaining FK indexes (person/actor + org/project) — closes Phase B

> **Type:** GREEN, additive. One migration
> `20260612210000_phase_b3_fk_indexes.sql` + paired
> `supabase/rollbacks/20260612210000_phase_b3_fk_indexes.down.sql`.
> **No prod apply in this PR. No RLS/grant/policy/data/UI/API change.**
> Source: remaining `unindexed_foreign_keys` (24 after B2), joined with a
> read-only table-size preflight.

## Phase B arc

| Phase | FKs indexed | advisor `unindexed_foreign_keys` |
|---|---|---|
| B1 (applied) | 15 active-path | 49 → 34 |
| B2 (applied) | 10 taxonomy/reference | 34 → 24 |
| **B3 (this PR)** | **24 person/actor + org/project** | **24 → 0 (expected after apply)** |

## Size preflight — every target table is small (no CONCURRENTLY needed)

The B2 apply paused on a 19 MB / 126k-row table (`esco_occupation_skills`).
For B3 the preflight was run FIRST: all 24 target tables are tiny, so plain
non-concurrent `CREATE INDEX` is safe for every one. **Nothing is deferred to
a concurrent-index PR.**

| Table | FK column | Index name | Size / est_rows | Written at runtime? | Decision |
|---|---|---|---|---|---|
| worker_skills | verified_by | idx_worker_skills_verified_by | 96 kB / 22 | manager verify (rare) | include |
| productivity_units | created_by_profile_id | idx_productivity_units_created_by_profile_id | 72 kB / 10 | rare | include |
| productivity_units | organization_id | idx_productivity_units_organization_id | 72 kB / 10 | rare | include |
| pilot_events | profile_id | idx_pilot_events_profile_id | 88 kB | telemetry writes (tiny) | include — small, build sub-ms |
| audit_logs | actor_id | idx_audit_logs_actor_id | 32 kB | sensitive-action writes (tiny) | include — small, build sub-ms |
| candidate_drafts | linked_profile_id | idx_candidate_drafts_linked_profile_id | 64 kB | owner writes (rare) | include |
| worker_documents | updated_by | idx_worker_documents_updated_by | 40 kB | rare | include |
| agencies | profile_id | idx_agencies_profile_id | 32 kB | rare | include |
| agency_workers | worker_id | idx_agency_workers_worker_id | 16 kB | rare | include |
| company_workers | worker_id | idx_company_workers_worker_id | 32 kB | rare | include |
| consents | profile_id | idx_consents_profile_id | 16 kB | signup (tiny) | include |
| job_demands | project_id | idx_job_demands_project_id | 16 kB | rare | include |
| language_feedback | user_id | idx_language_feedback_user_id | 32 kB | rare | include |
| leads | assigned_to | idx_leads_assigned_to | 16 kB | anon capture (tiny) | include |
| market_rate_averages | entered_by | idx_market_rate_averages_entered_by | 32 kB | rare | include |
| subscriptions | profile_id | idx_subscriptions_profile_id | 24 kB | rare | include |
| worker_document_events | actor_id | idx_worker_document_events_actor_id | 24 kB | rare | include |
| profession_templates | organization_id | idx_profession_templates_organization_id | 48 kB | rare | include |
| skill_icons | organization_id | idx_skill_icons_organization_id | 32 kB | rare | include |
| projects | company_id | idx_projects_company_id | 48 kB | rare | include |
| project_worker_operational_statuses | updated_by | idx_project_worker_operational_statuses_updated_by | 32 kB | rare | include |
| project_worker_operational_statuses | worker_id | idx_project_worker_operational_statuses_worker_id | 32 kB | rare | include |
| project_worker_readiness_items | updated_by | idx_project_worker_readiness_items_updated_by | 32 kB | rare | include |
| project_worker_readiness_items | worker_id | idx_project_worker_readiness_items_worker_id | 32 kB | rare | include |

**24 indexes, 0 deferred.** Even the runtime-written tables (`audit_logs`,
`pilot_events`, `leads`, `consents`) are ≤88 kB, so the plain-index build is
sub-millisecond and any write-block window is negligible — none meets the
"large AND actively-written" bar that would require `CREATE INDEX CONCURRENTLY`.

## After B3

Phase B (FK indexing) is **complete** once this is applied —
`unindexed_foreign_keys` expected 24 → 0. Remaining advisor items are NOT
Phase B:

- `unused_index` (will rise as new indexes register, then settle with traffic).
- `auth_rls_initplan` (71) and `multiple_permissive_policies` (147) — **Phase D**
  (RLS perf rewrites, RED / owner-gated).
- `anon_security_definer_function_executable` (15) — **Phase C** (RED / owner-gated).
- Auth dashboard config (OTP, leaked-password) — **Phase E** (owner dashboard).

Phases **C/D/E remain untouched** by this PR.
