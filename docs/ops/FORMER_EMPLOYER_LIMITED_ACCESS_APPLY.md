# Former employer: limited access — apply, check, roll back

Migration `supabase/migrations/20261118164500_former_employer_limited_access_v1.sql`
(PR #3474, owner decision 2026-11-17 option A, its conditions 2026-11-18).
Rollback `supabase/rollbacks/20261118164500_former_employer_limited_access_v1.down.sql`.

**RED.** Applied only with the owner's separate permission, through Supabase
MCP `apply_migration` with the file's exact content. Never `supabase db push`
or `prisma migrate deploy`: the repository's file names do not match the ledger
versions, so a push would re-run applied migrations.

Every query below is read-only, except the two `apply_migration` steps. Counts
are kept in the owner channel, never in this public repository.

## 0. Before anything

- The file applied is byte-identical to the reviewed one. Compare the `md5sum`
  of the file at the approved commit with the content passed to
  `apply_migration`.
- The target is the production project, confirmed by its project reference.
- #3421 (`20261115120000_journal_learning_access_follows_link_v1`) is applied.
  This migration is written on its definitions and goes after it.

## 1. Pre-check (read-only)

```sql
-- 1a. #3421 is in the ledger; this migration is not.
select version, name from supabase_migrations.schema_migrations
 where name like '%journal_learning_access_follows_link%'
    or name like '%former_employer_limited_access%'
 order by version;
-- Expect: exactly one row, #3421's. No former_employer_limited_access row.

-- 1b. None of the objects this migration adds exists yet.
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('journal_entry_chain_root_at_v1', 'org_retains_journal_entry_v1',
                   'journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1');
select tgname from pg_trigger
 where tgrelid = 'public.journal_entries'::regclass
   and tgname in ('journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1');
-- Expect: 0 rows from each.

-- 1c. Fingerprints of what the migration replaces. KEEP THE OUTPUT: the
--     rollback must bring back exactly these values (section 4).
select 'fn:' || p.oid::regprocedure::text as object, md5(pg_get_functiondef(p.oid)) as fingerprint
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('can_read_journal_entry_v1', 'journal_entry_review_authority_v1',
                     'set_engagement_journal_review', 'reviewable_journal_entry_ids')
union all
select 'policy:' || tablename || '.' || policyname,
       md5(coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || cmd || '|' || array_to_string(roles, ','))
  from pg_policies
 where schemaname = 'public'
   and (tablename, policyname) in (('journal_entries', 'journal_entries_select'),
                                   ('journal_entry_work_items', 'journal_entry_work_items_update'),
                                   ('journal_entry_metrics', 'journal_entry_metrics_write'),
                                   ('journal_entry_confirmations', 'journal_entry_confirmations_insert'))
 order by 1;
-- Expect: 8 rows. Keep them.

-- 1d. Every ended relationship has an end date (an ended row without one
--     would show its organization nothing).
select count(*) as ended_without_date
  from public.engagement_contexts where status = 'ended' and ended_at is null;
-- Expect: 0. Otherwise STOP and bring the rows to the owner.

-- 1e. Data baseline (compared after apply and after a rollback).
select (select count(*) from public.journal_entries)                as entries,
       (select count(*) from public.journal_entry_confirmations)    as confirmations,
       (select count(*) from public.journal_entry_metrics)          as metrics,
       (select count(*) from public.journal_entry_work_items)       as work_items,
       (select count(*) from public.engagement_contexts)            as engagements;
```

## 2. Apply

`apply_migration` with name `former_employer_limited_access_v1` and the exact
content of the migration file. It runs in one transaction (`begin` … `commit`):
a failure changes nothing.

## 3. Post-check (read-only)

```sql
-- 3a. The ledger has the new row.
select version, name from supabase_migrations.schema_migrations
 where name like '%former_employer_limited_access%';
-- Expect: 1 row.

-- 3b. The four new functions exist and are SECURITY DEFINER.
select proname, prosecdef from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('journal_entry_chain_root_at_v1', 'org_retains_journal_entry_v1',
                   'journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1')
 order by proname;
-- Expect: 4 rows, prosecdef = true on each.

-- 3c. Who may run them: only org_retains_journal_entry_v1 is open to signed-in users.
select f, r, has_function_privilege(r, f, 'execute') as can_execute
  from unnest(array['public.journal_entry_chain_root_at_v1(uuid)', 'public.org_retains_journal_entry_v1(uuid)',
                    'public.journal_entries_ancestor_context_v1()', 'public.journal_entries_successor_context_v1()']) f,
       unnest(array['anon', 'authenticated']) r
 order by f, r;
-- Expect: true ONLY for org_retains_journal_entry_v1 / authenticated; false for the other 7.

-- 3d. The two triggers are in place and enabled.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.journal_entries'::regclass
   and tgname in ('journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1')
 order by tgname;
-- Expect: 2 rows, tgenabled = 'O'.

-- 3e. The read rule is live.
select position('org_retains_journal_entry_v1' in qual) > 0 as read_rule_live
  from pg_policies where schemaname = 'public' and tablename = 'journal_entries' and policyname = 'journal_entries_select';
select position('org_retains_journal_entry_v1' in pg_get_functiondef('public.can_read_journal_entry_v1(uuid)'::regprocedure)) > 0
       as mirror_live;
-- Expect: true, true.

-- 3f. Writes need a running relationship.
select tablename, policyname,
       position('''active''' in coalesce(qual, '') || coalesce(with_check, '')) > 0 as needs_running
  from pg_policies
 where schemaname = 'public'
   and (tablename, policyname) in (('journal_entry_work_items', 'journal_entry_work_items_update'),
                                   ('journal_entry_metrics', 'journal_entry_metrics_write'),
                                   ('journal_entry_confirmations', 'journal_entry_confirmations_insert'));
-- Expect: 3 rows, true on each.

-- 3g. No data changed: run 1e again. Expect: the same five numbers, apart
--     from rows people created in between (compare entries by created_at if
--     the platform was in use during the apply).
```

The behaviour itself (what a former employer reads, what it can no longer
change, corrections that stay in the employment's context) is proven on a
throwaway database by `apps/web/tests/e2e/former-employer-access-isolated.spec.ts`
(FE-0 to FE-5), which signup-isolated runs on every change of this migration.
No production account is used to test it.

## 4. Rollback (only if needed)

`apply_migration` with name `former_employer_limited_access_v1_rollback` and the
exact content of the rollback file. One transaction. It restores every replaced
policy and function as it was after #3421, then drops the two triggers, their
functions and the two read helpers. It deletes and rewrites no row.

Post-check of the rollback (read-only):

```sql
-- 4a. Nothing the migration added is left.
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('journal_entry_chain_root_at_v1', 'org_retains_journal_entry_v1',
                   'journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1');
select tgname from pg_trigger
 where tgrelid = 'public.journal_entries'::regclass
   and tgname in ('journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1');
-- Expect: 0 rows from each.

-- 4b. Run 1c again. Expect: the same 8 fingerprints as before the apply.

-- 4c. Run 1e again. Expect: no row lost.
```

Entries created while the migration was live stay as they are after a
rollback: a correction kept in its employment's context stays there, and the
former employer's reads go back to #3421's rule.

Follow-up fixes to two of these functions (direct corrections only, cycle-safe
chain root): `FORMER_EMPLOYER_CHAIN_FIXES_APPLY.md`.
