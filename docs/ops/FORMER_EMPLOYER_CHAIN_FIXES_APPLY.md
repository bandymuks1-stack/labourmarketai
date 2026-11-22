# Former employer: chain fixes — apply, check, roll back

Migration `supabase/migrations/20261120190000_former_employer_chain_fixes_v1.sql`
(two defects found on #3474 after it was applied).
Rollback `supabase/rollbacks/20261120190000_former_employer_chain_fixes_v1.down.sql`.
The rule it repairs, and its own apply steps: `FORMER_EMPLOYER_LIMITED_ACCESS_APPLY.md`.

It replaces two SECURITY DEFINER functions of #3474 and nothing else:

- `journal_entries_ancestor_context_v1()` (P1): a row moves into an ended
  original's context only for a DIRECT correction of that context's record. An
  edit of a correction the person filed under another organization or in the
  personal journal stays where it was filed.
- `journal_entry_chain_root_at_v1(uuid)` (P2): the chain walk has no depth cap
  of 32 any more. It fails closed only on a real cycle or at a safety bound of
  10000 steps.

**RED.** Applied only with the owner's separate permission, through Supabase
MCP `apply_migration` with the file's exact content. Never `supabase db push`
or `prisma migrate deploy`: the repository's file names do not match the ledger
versions, so a push would re-run applied migrations.

Every query below is read-only, except the two `apply_migration` steps. Results
and counts are kept in the owner channel, never in this public repository.

## 0. Before anything

- The file applied is byte-identical to the reviewed one. Compare the `md5sum`
  of the file at the approved commit with the content passed to
  `apply_migration`.
- The target is the production project, confirmed by its project reference.
- #3474 (`20261118164500_former_employer_limited_access_v1`) is applied.

## 1. Pre-check (read-only)

```sql
-- 1a. #3474 is in the ledger; this migration is not.
select version, name from supabase_migrations.schema_migrations
 where name like '%former_employer_limited_access%'
    or name like '%former_employer_chain_fixes%'
 order by version;
-- Expect: exactly one row, #3474's.

-- 1b. Fingerprints of the two functions this migration replaces. KEEP THE
--     OUTPUT: the rollback must bring back exactly these values (section 4).
select p.oid::regprocedure::text as object, md5(pg_get_functiondef(p.oid)) as fingerprint,
       position('depth < 32' in pg_get_functiondef(p.oid)) > 0 as has_depth_cap
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('journal_entry_chain_root_at_v1', 'journal_entries_ancestor_context_v1')
 order by 1;
-- Expect: 2 rows; has_depth_cap = true on journal_entry_chain_root_at_v1.

-- 1c. P1 signature: a correction stored in an ENDED context whose superseded
--     predecessor sits in another context (the trigger moved it there).
select count(*) as moved_successors
  from public.journal_entries n
  join public.engagement_contexts ec on ec.id = n.engagement_context_id and ec.status = 'ended'
  join public.journal_entries p on p.superseded_by = n.id
 where n.correction_of is not null
   and p.engagement_context_id is distinct from n.engagement_context_id;
-- Expect: 0. Otherwise keep the number in the owner channel: this migration
-- changes no stored row (engagement_context_id cannot change after insert),
-- so what to do with such rows is a separate owner decision.

-- 1d. P2 signature: versions 32 or more edits from their first version in the
--     same context (the old walk dated them by a later version).
with recursive chain as (
  select e.id, e.engagement_context_id as ctx, 0 as len
    from public.journal_entries e
   where not exists (select 1 from public.journal_entries p where p.superseded_by = e.id)
  union all
  select n.id, c.ctx, c.len + 1
    from chain c
    join public.journal_entries p on p.id = c.id
    join public.journal_entries n on n.id = p.superseded_by
   where n.engagement_context_id is not distinct from c.ctx
     and c.len < 10000
)
select count(*) filter (where len >= 32) as long_chain_versions from chain;
-- Keep the number in the owner channel. Nothing is rewritten: after the apply
-- these versions are dated by their true original.

-- 1e. Data baseline (compared after apply and after a rollback).
select (select count(*) from public.journal_entries)             as entries,
       (select count(*) from public.journal_entry_confirmations) as confirmations,
       (select count(*) from public.engagement_contexts)         as engagements;
```

## 2. Apply

`apply_migration` with name `former_employer_chain_fixes_v1` and the exact
content of the migration file. It runs in one transaction (`begin` … `commit`):
a failure changes nothing.

## 3. Post-check (read-only)

```sql
-- 3a. The ledger has the new row.
select version, name from supabase_migrations.schema_migrations
 where name like '%former_employer_chain_fixes%';
-- Expect: 1 row.

-- 3b. Both functions are SECURITY DEFINER with the fixes in place.
select proname, prosecdef,
       position('depth < 32' in pg_get_functiondef(oid)) > 0       as has_depth_cap,
       position('is_cycle' in pg_get_functiondef(oid)) > 0         as cycle_safe,
       position('c.superseded_by is null' in pg_get_functiondef(oid)) > 0 as direct_only
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('journal_entry_chain_root_at_v1', 'journal_entries_ancestor_context_v1')
 order by proname;
-- Expect: journal_entries_ancestor_context_v1: prosecdef true, direct_only true;
--         journal_entry_chain_root_at_v1: prosecdef true, has_depth_cap false, cycle_safe true.

-- 3c. Nobody outside the definer may run them.
select f, r, has_function_privilege(r, f, 'execute') as can_execute
  from unnest(array['public.journal_entry_chain_root_at_v1(uuid)',
                    'public.journal_entries_ancestor_context_v1()']) f,
       unnest(array['anon', 'authenticated']) r
 order by f, r;
-- Expect: 4 rows, false on each.

-- 3d. The trigger still calls the replaced function and is enabled.
select tgname, tgenabled from pg_trigger
 where tgrelid = 'public.journal_entries'::regclass
   and tgname in ('journal_entries_ancestor_context_v1', 'journal_entries_successor_context_v1')
 order by tgname;
-- Expect: 2 rows, tgenabled = 'O'.

-- 3e. No data changed: run 1e again. Expect: the same numbers, apart from rows
--     people created in between.
```

The behaviour itself is proven on a throwaway database by
`apps/web/tests/e2e/former-employer-access-isolated.spec.ts`: FE-6 (an edit of
a correction filed elsewhere stays there; a direct correction still lands
under the ended employment) and FE-7 (a record edited 34 times after the end
stays retained). signup-isolated runs it on every change of this migration. No
production account is used to test it.

## 4. Rollback (only if needed)

`apply_migration` with name `former_employer_chain_fixes_v1_rollback` and the
exact content of the rollback file. One transaction. It restores both functions
exactly as #3474 defines them. It deletes and rewrites no row.

Post-check of the rollback (read-only):

```sql
-- 4a. Run 1b again. Expect: the same 2 fingerprints as before the apply.
-- 4b. Run 3d again. Expect: both triggers still in place and enabled.
-- 4c. Run 1e again. Expect: no row lost.
```

Rows stored while the fix was live stay as they are after a rollback: an edit
of a correction filed elsewhere stays where it was filed.
