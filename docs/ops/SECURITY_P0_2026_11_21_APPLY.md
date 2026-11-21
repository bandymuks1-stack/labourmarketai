# Security P0 (2026-11-21) — apply guide

Owner directive 2026-11-21. RED: owner channel only, via Supabase MCP
`apply_migration`, never `supabase db push`. Nothing here changes existing
rows, grants or memberships.

## Order

1. `20261121100000_signup_role_admin_guard_manager_consent_v1`
2. `20261121100100_journal_lineage_and_metrics_authorship_v1`

The two migrations are independent of each other. Each runs in one transaction.

## Before applying (read-only)

```sql
-- Who holds the admin role today (compare with the known operators).
select pr.profile_id, pr.added_at
  from public.profile_roles pr
 where pr.role = 'admin'
 order by pr.added_at;

-- Manager engagements without an active governance membership
-- (these stay as they are; the new rule applies to new grants only).
select ec.id, ec.organization_id, ec.profile_id, ec.created_at
  from public.engagement_contexts ec
 where ec.relationship_slug = 'manager' and ec.status = 'active'
   and not exists (select 1 from public.company_memberships m
                    where m.organization_id = ec.organization_id
                      and m.profile_id = ec.profile_id
                      and m.status = 'active'
                      and m.role in ('owner','admin','manager','external_manager'));

-- Journal rows whose correction_of points at another person's entry.
select c.id, c.worker_id, c.correction_of, o.worker_id as original_worker
  from public.journal_entries c
  join public.journal_entries o on o.id = c.correction_of
 where c.worker_id <> o.worker_id;

-- Metric rows a manager wrote under the worker's label cannot be told apart
-- after the fact; this lists metrics added after the entry was confirmed.
select m.id, m.entry_id, m.metric_slug, m.source, m.created_at
  from public.journal_entry_metrics m
  join public.journal_entry_confirmations jc on jc.entry_id = m.entry_id
 where m.created_at > jc.created_at;
```

Report any unexpected row to the owner. Do not change it.

## After applying (read-only verification)

```sql
select pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%when claimed in (''worker'', ''company'', ''agency'', ''customer'')%' as signup_allow_list;
select pg_get_functiondef('public.enforce_admin_grant_guard()'::regprocedure) like '%service_role%' as admin_guard;
select pg_get_functiondef('public.grant_org_manager(uuid,uuid,text)'::regprocedure) like '%not_a_governance_member%' as manager_consent;
select count(*) = 1 as lineage_trigger from pg_trigger
 where tgname = 'journal_entries_lineage_guard_v1' and not tgisinternal;
select pg_get_expr(polwithcheck, polrelid) like '%manager_corrected%' as metrics_policy
  from pg_policy where polname = 'journal_entry_metrics_write';
```

Every value must be `true`.

## Rollback

`supabase/rollbacks/20261121100000_signup_role_admin_guard_manager_consent_v1.down.sql`
and `supabase/rollbacks/20261121100100_journal_lineage_and_metrics_authorship_v1.down.sql`
restore the previous definitions verbatim.

## Proof

- `apps/web/tests/e2e/security-p0-isolated.spec.ts` (SEC-1…SEC-3) on the
  replayed local stack of `signup-isolated.yml`.
- `apps/web/lib/guards/security-p0-db.test.ts` pins the latest definitions.
