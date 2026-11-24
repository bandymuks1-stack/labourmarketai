# Phase B2 — additive FK indexes (taxonomy / reference)

> **Type:** GREEN, additive. One migration
> `20260612200000_phase_b2_fk_indexes.sql` + paired
> `supabase/rollbacks/20260612200000_phase_b2_fk_indexes.down.sql`.
> **No prod apply in this PR. No RLS/grant/policy/data/UI/API change.**
> Source: remaining `unindexed_foreign_keys` (34 after Phase B1), narrowed to
> the taxonomy/reference/lookup subset via a read-only `pg_constraint`/
> `pg_index` query.

## Why this subset

Phase B1 indexed 15 active-path FKs (chat/journal/engagement/requests/matches/
invitations), taking `unindexed_foreign_keys` 49 → 34. Phase B2 takes the FKs
whose **referenced** table is a slug registry or reference catalogue — these
columns are resolved on every taxonomy JOIN (skill/profession/unit/document-
type/plan/country lookups), so an index removes sequential scans on the hot
read paths and speeds parent-side integrity checks.

## Included in Phase B2 (10 indexes)

| Table | FK column | Index name | Why B2 (taxonomy/reference) |
|---|---|---|---|
| `worker_skills` | `skill_id` | `idx_worker_skills_skill_id` | → `skills` taxonomy |
| `worker_skills` | `current_pace_unit_slug` | `idx_worker_skills_current_pace_unit_slug` | → `productivity_units` taxonomy |
| `worker_professions` | `profession_id` | `idx_worker_professions_profession_id` | → `professions` taxonomy |
| `profession_skills` | `skill_id` | `idx_profession_skills_skill_id` | → `skills` taxonomy (join table) |
| `esco_occupation_skills` | `skill_id` | `idx_esco_occupation_skills_skill_id` | → `esco_skills` taxonomy (join table) |
| `worker_documents` | `document_type_slug` | `idx_worker_documents_document_type_slug` | → `document_types` taxonomy |
| `country_document_requirements` | `document_type_slug` | `idx_country_document_requirements_document_type_slug` | → `document_types` taxonomy |
| `productivity_units` | `base_unit_slug` | `idx_productivity_units_base_unit_slug` | → `productivity_units` self-ref (base-unit normalization) |
| `subscriptions` | `plan_id` | `idx_subscriptions_plan_id` | → `plans` reference table |
| `organizations` | `country` | `idx_organizations_country` | → `countries` reference table |

## Left for Phase B3 (remaining `unindexed_foreign_keys`)

The person/actor/ownership and org-scope FKs — not taxonomy/reference — remain
for B3 (a future narrow PR):

- **Person / actor / author refs:** `agencies.profile_id`,
  `agency_workers.worker_id`, `audit_logs.actor_id`,
  `candidate_drafts.linked_profile_id`, `company_workers.worker_id`,
  `consents.profile_id`, `language_feedback.user_id`, `leads.assigned_to`,
  `market_rate_averages.entered_by`, `pilot_events.profile_id`,
  `productivity_units.created_by_profile_id`, `subscriptions.profile_id`,
  `worker_document_events.actor_id`, `worker_documents.updated_by`,
  `worker_skills.verified_by`,
  `project_worker_operational_statuses.{updated_by,worker_id}`,
  `project_worker_readiness_items.{updated_by,worker_id}`.
- **Org-scope / project refs:** `job_demands.project_id`,
  `productivity_units.organization_id`, `profession_templates.organization_id`,
  `skill_icons.organization_id`, `projects.company_id`.

Phases **C/D/E are untouched** (anon DEFINER lockdown, RLS perf rewrites, auth
dashboard config / unused-index cleanup remain RED / owner-gated / dashboard
items).
