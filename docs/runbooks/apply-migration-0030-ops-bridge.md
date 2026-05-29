# Runbook — Apply migration 0030 (employment↔journal ops bridge)

**Audience:** owner / DI. **Status:** migration committed at
`supabase/migrations/0030_company_agency_worker_ops_bridge.sql`, **NOT yet
applied to production**. Agents never apply production migrations — this
runbook lets you apply it yourself, safely. **If unsure, do not run it; the
app is fully safe without it.**

## What it does (additive only)

Adds four columns to **both** `public.company_workers` and
`public.agency_workers`:

| Column | Type | Default |
| --- | --- | --- |
| `operations_role` | text, nullable, CHECK (worker/foreman/project_manager/company_admin/agency_admin) | NULL |
| `operations_title` | text, nullable | NULL |
| `journal_review_enabled` | boolean NOT NULL | `false` |
| `journal_review_scope` | text, nullable | NULL |

## Why it is additive / safe

- `add column if not exists` — idempotent, re-runnable.
- No `DROP`, no `RENAME`, no data backfill, no `UPDATE`.
- No RLS policy change, no grant change — new columns inherit the existing
  `company_workers` / `agency_workers` row policies + `authenticated` grants.
- Safe default: every existing row becomes `operations_role = NULL`,
  `journal_review_enabled = false` → "not assigned / review off" (the honest
  current state). No relationship is auto-granted anything.

## What it does NOT do

- Does not enable foreman / project-manager (capability map still gates them
  `not_enabled`).
- Does not connect journal review to employment by itself (you must set
  `journal_review_enabled = true` per relationship later, via a future safe UI).
- Does not touch auth, payment, marketplace, storage, or any other table.

## Pre-apply checklist

1. Confirm you are targeting the correct project: ref `gorgitwvdzxbnaxhrsrw`
   (labourmarket.ai, eu-west-1).
2. Take/confirm a recent DB backup (Supabase keeps automatic backups; verify).
3. Read the migration file end-to-end.
4. Low-traffic window preferred (the `ALTER`s are fast, metadata-only — no
   table rewrite — but good practice).

## Apply options

- **Option A (recommended): Supabase SQL Editor.** Paste the contents of
  `0030_company_agency_worker_ops_bridge.sql` and run. Idempotent.
- **Option B: Supabase CLI**, from a machine where the CLI is linked to this
  project: `supabase db push`. (Note: `pnpm -F web check:db-validation-readiness`
  on the dev machine FAILs by design when the CLI is linked to prod — that
  guard exists to stop accidental agent runs; it is not a migration error.)

## Post-apply verification (read-only)

```sql
-- columns now present on both tables
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('company_workers','agency_workers')
  and column_name in ('operations_role','operations_title',
                      'journal_review_enabled','journal_review_scope')
order by table_name, column_name;

-- every existing row defaulted safely (review off, role unset)
select count(*) filter (where journal_review_enabled) as review_on,
       count(*) filter (where operations_role is not null) as role_set,
       count(*) as total
from public.company_workers;
```

Expect `review_on = 0`, `role_set = 0` immediately after apply.

## Rollback / recovery

The migration is additive, so rollback is rarely needed. If you must remove
the columns (no data depends on them yet):

```sql
alter table public.company_workers drop column if exists operations_role,
  drop column if exists operations_title,
  drop column if exists journal_review_enabled,
  drop column if exists journal_review_scope;
-- repeat for public.agency_workers
```

Only do this if no app feature has started relying on the columns.

## App behaviour before vs after

- **Before apply:** the app reads these columns with a 42703 (undefined
  column) fallback, so every worker row shows "operations role not assigned /
  review not enabled". Nothing breaks.
- **After apply:** same display (all NULL/false) **until** roles are assigned
  and `journal_review_enabled` is set per relationship through a future safe
  UI. No behaviour changes automatically on apply alone.

## Owner warning

Applying this migration alone changes nothing visible — it only creates empty
columns. It is safe. **Do not run it if you are unsure**; the product is fully
functional without it, and this runbook can wait.
