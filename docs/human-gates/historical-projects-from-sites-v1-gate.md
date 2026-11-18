# HUMAN GATE — historical sites become completed Projects (HP-1)

Migration: `supabase/migrations/20261007130000_historical_projects_from_work_objects_v1.sql`
Rollback:  `supabase/rollbacks/20261007130000_historical_projects_from_work_objects_v1.down.sql`

State: `HISTORICAL_PROJECTS_FROM_SITES_V1_CODE_COMPLETE_PENDING_HUMAN_GATE` (NOT applied)

## Why

Decision 0020 (organization history exists before claim) and the MASTER rule
"a historical project/object becomes a Project". In production, 180 historical
`work_objects` (one organization, all with evidence records, 2,093 records
referencing them) have `project_id IS NULL`, so the project page's historical
work section (`readEvidenceForProject`, which resolves `work_objects.project_id`)
shows nothing. Design: `docs/design/historical-timesheet-import-v3.md` section 5.1.

## What the migration does (one transaction, idempotent, additive)

1. INSERT one `projects` row per work object that has at least one
   `organization_evidence_records` row and `project_id IS NULL`:
   `title` = object name; `company_id` = `organizations.legacy_company_id`;
   `organization_id` = the object's; `country`/`city` only when present on the
   object; `status` = `completed`; `historical_key` = `hp:v1:wo:<work_object_id>`;
   `created_session_id` = session of the object's earliest evidence record
   (`created_at`, `id`). No dates, responsible person, assignments, tasks or clients.
   `ON CONFLICT (organization_id, historical_key) WHERE historical_key IS NOT NULL DO NOTHING`.
2. UPDATE `work_objects.project_id` from `projects` joined on `historical_key`,
   only where `project_id IS NULL` (so a re-run also completes linking).

Deviation from the design: the design's key form is
`hp:v1:<customer_key>|<work_object_id>`. No customer is resolved for these
sites, so `hp:v1:wo:<id>` is used; the distinct prefix can never collide with a
later customer-keyed import. The design says status NULL unless a signed plan
says `completed`; the owner decision for this change is `completed`.

No policy, grant, function or column is changed. `projects` has only the
`set_updated_at` trigger; journal autolink is write-time via assignments, so
there are no journal/hours/counter side effects.

## Companion (GREEN) change

PR `fix/cc/projects-list-historical-separation-v1` makes the manager project
list read working and finished projects in separate queries so 180 completed
rows cannot evict working projects. Merge that first or together.

## Dry-run on production (read-only SELECTs, 2026-10-07, gorgitwvdzxbnaxhrsrw)

| Check | Result |
|---|---|
| work objects with evidence and project_id NULL | 180 |
| organizations | 1 |
| with `legacy_company_id` | 180 |
| title length 2..200 (min 4, max 160) | 180 |
| evidence session belongs to the same org (composite FK satisfiable) | 180 / 180 |
| distinct `historical_key`s | 180 |
| with city / with country | 2 / 0 |
| existing `hp:v1:wo:%` projects | 0 |
| rows the INSERT would create | 180 |

## Verification after apply

```sql
select count(*) from projects where historical_key like 'hp:v1:wo:%';           -- 180
select count(*) from work_objects where project_id is null
  and exists (select 1 from organization_evidence_records r where r.work_object_id = work_objects.id); -- 0
```

## Rollback

Unlinks the sites, then deletes the created projects only if no foreign key
anywhere references them (checked dynamically across every FK into `projects`);
otherwise it raises and changes nothing.

## Approval needed

Explicit owner approval to apply on production via Supabase MCP `apply_migration`
(never `db push`). The `-- @human-gate-approved` header is an acknowledgement
for migration-safety (data DML), not an approval.
