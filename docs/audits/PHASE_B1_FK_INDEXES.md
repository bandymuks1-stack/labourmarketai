# Phase B1 — additive FK indexes (active paths)

> **Type:** GREEN, additive. One migration
> `20260612190000_phase_b1_fk_indexes.sql` + paired
> `supabase/rollbacks/20260612190000_phase_b1_fk_indexes.down.sql`.
> **No prod apply in this PR. No RLS/grant/policy/data/UI/API change.**
> Source: 2026-06-12 advisor `unindexed_foreign_keys` (INFO ×49), narrowed to
> the active-path subset via a read-only `pg_constraint`/`pg_index` query.

## Why FK indexes

A foreign-key column with no covering index makes every JOIN / reverse lookup
on that column a sequential scan, and turns parent-side `ON UPDATE/DELETE`
integrity checks into O(n) scans. Indexing the FK column is a standard,
behavior-preserving read/write-path optimization.

## Included in Phase B1 (15 indexes)

| Table | FK column | Index name | Why B1 (active path) |
|---|---|---|---|
| `conversation_messages` | `project_id` | `idx_conversation_messages_project_id` | chat — project-scoped message lookups |
| `conversation_participants` | `added_by` | `idx_conversation_participants_added_by` | chat — who added a participant |
| `conversation_participants` | `revoked_by` | `idx_conversation_participants_revoked_by` | chat — revocation audit joins (§4.3) |
| `journal_entries` | `profession_id` | `idx_journal_entries_profession_id` | journal — entries by profession (skill spine) |
| `journal_entries` | `superseded_by` | `idx_journal_entries_superseded_by` | journal — correction/supersede chain |
| `journal_entry_confirmations` | `confirmer_engagement_context_id` | `idx_journal_entry_confirmations_confirmer_ctx` | journal — manager confirmation joins |
| `journal_entry_metrics` | `unit_slug` | `idx_journal_entry_metrics_unit_slug` | journal — metric→unit resolution |
| `engagement_contexts` | `country_code` | `idx_engagement_contexts_country_code` | engagement — country reference join |
| `engagement_contexts` | `relationship_slug` | `idx_engagement_contexts_relationship_slug` | engagement — relationship-type join |
| `customer_requests` | `customer_id` | `idx_customer_requests_customer_id` | demand — requests by customer (§17) |
| `matches` | `job_demand_id` | `idx_matches_job_demand_id` | matching — matches by demand |
| `match_actions` | `actor_id` | `idx_match_actions_actor_id` | matching — actions by actor |
| `match_actions` | `match_id` | `idx_match_actions_match_id` | matching — actions by match |
| `agency_worker_invitations` | `inviter_profile_id` | `idx_agency_worker_invitations_inviter_profile_id` | invitations — by inviter |
| `company_worker_invitations` | `inviter_profile_id` | `idx_company_worker_invitations_inviter_profile_id` | invitations — by inviter |

Identifier note: the `journal_entry_confirmations` index is named
`…_confirmer_ctx` (not the full `…_confirmer_engagement_context_id`) to stay
under Postgres's 63-byte identifier limit; up and down scripts use the same
shortened name.

## Left for Phase B2 / B3 (remaining `unindexed_foreign_keys`)

The advisor flagged ~49 unindexed FKs total; B1 takes 15 active-path ones. The
rest are deferred, grouped for later narrow PRs:

- **B2 — taxonomy / reference tables:** `esco_occupation_skills`,
  `esco_occupations`, `esco_skills`, `country_document_requirements`,
  `profession_skills`, `productivity_units`, etc. (large reference catalogues,
  lower write/JOIN pressure).
- **B3 — secondary / ops tables:** `audit_logs`, `consents`, `leads`,
  `pilot_events`, `subscriptions`, `candidate_drafts`, `market_rate_averages`,
  `worker_document_events`, and the remaining org/agency/company FKs.

Phases **C/D/E are untouched** (anon DEFINER lockdown, RLS perf rewrites, auth
dashboard config / unused-index cleanup remain RED/owner-gated/dashboard items).
