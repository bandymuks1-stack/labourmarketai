# Employment ↔ Work-Journal Operations Bridge — Data Contract v1

**Base:** main `ebfb34e` · **Migration:** `supabase/migrations/0030_company_agency_worker_ops_bridge.sql`
(additive, **owner-gated apply**) · **Cycle:** employment-journal-ops-bridge.

## Why a migration is necessary

The operations audit
(`docs/audits/company-worker-foreman-operations-truth-v1.md`) proved the
employment link tables `public.company_workers` and `public.agency_workers`
carry **only** `(org_id, worker_id, status, created_at, updated_at)`. There is
nowhere to record:

- the operational role/title a relationship claims (worker / foreman / …), or
- whether work-journal **review** is enabled for that relationship.

So the employment ↔ journal bridge **cannot exist on the current schema**. Per
the owner's explicit authorisation, this cycle adds the smallest possible
**additive** columns. No bridge table was needed — columns on the existing
relationship tables are strictly smaller and sufficient.

## The fields (on `company_workers` AND `agency_workers`)

| Column | Type | Default | Meaning |
| --- | --- | --- | --- |
| `operations_role` | text, nullable, CHECK | NULL | The relationship's operational role. NULL = not assigned. |
| `operations_title` | text, nullable | NULL | Free-text title shown in UI (e.g. "Site lead"). |
| `journal_review_enabled` | boolean, NOT NULL | `false` | Whether journal review is enabled for this relationship. |
| `journal_review_scope` | text, nullable | NULL | Reserved scope hint for a future review model. |

Allowed `operations_role` values (conservative, map to
`apps/web/lib/operations/role-capabilities.ts`):
`worker` · `foreman` · `project_manager` · `company_admin` · `agency_admin`.

> Storing `operations_role = 'foreman'` does **not** grant any capability.
> foreman / project_manager stay `not_enabled` in the capability map until a
> later sprint wires real permissions + UI. The column is a label slot, not a
> permission.

## Contract answers

- **Who is this worker connected to?** the `company_workers` / `agency_workers`
  row (org_id ↔ worker_id).
- **What operational role/title does the relationship claim?** `operations_role`
  / `operations_title` (NULL until assigned).
- **Is journal review enabled for this relationship?** `journal_review_enabled`
  (default `false`).
- **Is foreman/PM coordination enabled?** No — capability map keeps it
  `not_enabled` regardless of any stored label.
- **What is safe to show in UI?** the relationship + role/title when set;
  otherwise the honest "operational role not assigned / review not enabled"
  message.

## Safety

Additive only: `add column if not exists`, no drops/renames, no backfill, no RLS
change (existing row policies cover new columns), no grant change (table grants
to `authenticated` already cover them). Safe default = not assigned / review
off. Apply to prod is **owner-gated**; app code reads the columns with a
graceful column-absent fallback (treat as not-enabled) until applied.
