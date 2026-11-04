-- @human-gate-approved
-- 20261105100000_public_vacancy_search_table_v1
--
-- NOT APPROVED FOR PRODUCTION. Owner decision 2026-11-04: prepared as a separate RED
-- project, deployed only if #3069 misses the first-search limit after two real imports.
--
-- RED by the migration-safety gate (SECURITY DEFINER trigger function, REVOKE).
--
-- WHY: a first search right after an import is slow because every row on a changed page
-- needs a heap visit, until autovacuum has run. This table holds only what the free-text
-- search reads, for active ads, so a sequential scan of it costs the same number of pages
-- in every state and does not depend on the visibility map.
-- WHY NOT AN EXISTING STRUCTURE: no index can avoid the visibility check; #3069 proved a
-- narrower one still pays it after an import.
-- DERIVED DATA (doctrine section 6): `public_vacancies` stays the only source of truth.
-- The triggers below are the invalidation, in the same transaction as the write, so the
-- copy cannot be seen out of step. Rebuildable at any time from the source.
-- ACCESS: RLS on with no policy, no grant to anon, authenticated or service_role. Only the
-- SECURITY DEFINER search function and the trigger function reach it.
--
-- PRODUCTION APPLY PROCEDURE (after owner approval; never `supabase db push`).
--   1. Check no importer is running. `apply_migration` this file: the short lock for the
--      triggers, then the backfill, in one transaction.
--   2. Run scripts/db-proof/narrow-search-table-reconcile.sql. It must report 0 differences.
--   3. Only then apply 20261105100100_search_public_vacancy_previews_narrow_v6.
-- Rollback: supabase/rollbacks/20261105100000_public_vacancy_search_table_v1.down.sql, after the function rollback.

create table if not exists public.public_vacancy_search (
  id uuid primary key,
  occupation_raw text,
  expires_at timestamptz,
  published_at timestamptz
) with (
  fillfactor = 100,
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 200,
  autovacuum_vacuum_insert_scale_factor = 0,
  autovacuum_vacuum_insert_threshold = 200
);

comment on table public.public_vacancy_search is
  'Derived copy of what the free-text job search reads, active ads only. Source of truth: public_vacancies. Kept in step by triggers in the same transaction; rebuildable.';

alter table public.public_vacancy_search enable row level security;
revoke all on public.public_vacancy_search from public, anon, authenticated, service_role;

create or replace function public.public_vacancy_search_sync()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.public_vacancy_search s where s.id = old.id;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    delete from public.public_vacancy_search s where s.id = old.id;
  end if;
  if not new.is_active then
    delete from public.public_vacancy_search s where s.id = new.id;
    return null;
  end if;
  insert into public.public_vacancy_search as s (id, occupation_raw, expires_at, published_at)
    values (new.id, new.occupation_raw, new.expires_at, new.published_at)
    on conflict (id) do update
      set occupation_raw = excluded.occupation_raw,
          expires_at = excluded.expires_at,
          published_at = excluded.published_at;
  return null;
end;
$function$;

revoke all on function public.public_vacancy_search_sync() from public, anon, authenticated, service_role;

drop trigger if exists public_vacancy_search_sync_ins on public.public_vacancies;
create trigger public_vacancy_search_sync_ins
  after insert on public.public_vacancies
  for each row execute function public.public_vacancy_search_sync();

drop trigger if exists public_vacancy_search_sync_del on public.public_vacancies;
create trigger public_vacancy_search_sync_del
  after delete on public.public_vacancies
  for each row execute function public.public_vacancy_search_sync();

-- Only a change the search can see writes here: an importer's last_seen_at touch does not.
drop trigger if exists public_vacancy_search_sync_upd on public.public_vacancies;
create trigger public_vacancy_search_sync_upd
  after update on public.public_vacancies
  for each row
  when (
    old.id is distinct from new.id
    or old.is_active is distinct from new.is_active
    or (new.is_active and (
      old.occupation_raw is distinct from new.occupation_raw
      or old.expires_at is distinct from new.expires_at
      or old.published_at is distinct from new.published_at)))
  execute function public.public_vacancy_search_sync();

insert into public.public_vacancy_search (id, occupation_raw, expires_at, published_at)
  select v.id, v.occupation_raw, v.expires_at, v.published_at
  from public.public_vacancies v
  where v.is_active
on conflict (id) do nothing;

-- ROLLBACK
-- see supabase/rollbacks/20261105100000_public_vacancy_search_table_v1.down.sql
