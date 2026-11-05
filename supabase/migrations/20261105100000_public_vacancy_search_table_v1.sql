-- @human-gate-approved
-- 20261105100000_public_vacancy_search_table_v1
--
-- NOT APPROVED FOR PRODUCTION. Owner 2026-11-05: J-13 may prepare this as a RED draft; no apply,
-- no production DB change and no RED deployment without separate permission.
--
-- RED by the migration-safety gate (SECURITY DEFINER trigger function, REVOKE).
--
-- WHY (SR-10): a job search must also find an ad by its public title. Reading the title in the
-- search itself cost three times the CPU (rejected by the owner), because every row was folded
-- on every search. This table holds the folded text ready to read, so a search compares it once
-- per row. It also ends the slow first search after an import: every row on a changed page needs
-- a heap visit until autovacuum has run, and a sequential scan of this table needs no such visit.
-- WHY NOT AN EXISTING STRUCTURE: no index can avoid the visibility check; #3069 proved a narrower
-- one still pays it after an import.
-- DERIVED DATA (doctrine section 6): `public_vacancies` stays the only source of truth. The
-- triggers below are the invalidation, in the same transaction as the write, so the copy cannot
-- be seen out of step. Rebuildable at any time from the source. No column of it is ever returned.
-- ACCESS: RLS on with no policy, no grant to anon, authenticated or service_role. Only the
-- SECURITY DEFINER search function and the trigger function reach it.
-- WHAT GOES IN: the public ad title and the occupation (owner 2026-11-05: searching public ad
-- titles is allowed, revealing non-public content is not). Nothing else: no description, no
-- employer, no contact, no place.
--
-- PRODUCTION APPLY PROCEDURE (after owner approval; never `supabase db push`).
--   1. Check no importer is running. `apply_migration` this file: the short lock for the
--      triggers, then the backfill, in one transaction. Reads are not blocked; writes wait.
--   2. Run scripts/db-proof/narrow-search-table-reconcile.sql. It must report 0 differences.
--   3. Only then apply 20261105100100_search_public_vacancy_previews_narrow_v6.
-- Rollback: supabase/rollbacks/20261105100000_public_vacancy_search_table_v1.down.sql, after the function rollback.

set local lock_timeout = '5s';

-- One fold for what is stored and for what is searched. Lower case in the database's own
-- collation, because lower() under "C" leaves Ä and Š as they are. ß is ss and a letter loses its
-- marks, as the page's catalogue match already treats them (foldForMatch), so lärare and larare,
-- Schweißer and Schweisser are one word. Every run of anything but a letter, a digit, + or #
-- becomes one space, so words can be told apart and a search term cannot carry a LIKE wildcard.
-- + and # stay so that C++ and C# stay themselves.
create or replace function public.public_vacancy_search_fold(p_text text)
returns text
language sql
immutable
parallel safe
set search_path to ''
as $function$
  select ' ' || pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.normalize(pg_catalog.replace(pg_catalog.lower(coalesce(p_text, '')), 'ß', 'ss'), 'NFD'), '[\u0300-\u036f]', '', 'g'), '[^[:alnum:]+#]+', ' ', 'g')) || ' '
$function$;

revoke all on function public.public_vacancy_search_fold(text) from public, anon, authenticated, service_role;

create table if not exists public.public_vacancy_search (
  id uuid primary key,
  search_text text collate "C" not null,
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
  'Derived copy of what the free-text job search reads, active ads only: public title and occupation, folded. Source of truth: public_vacancies. Kept in step by triggers in the same transaction; rebuildable. Never returned to a caller.';

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
  insert into public.public_vacancy_search as s (id, search_text, expires_at, published_at)
    values (new.id,
            public.public_vacancy_search_fold(coalesce(new.title_raw, '') || ' ' || coalesce(new.occupation_raw, '')),
            new.expires_at, new.published_at)
    on conflict (id) do update
      set search_text = excluded.search_text,
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
      old.title_raw is distinct from new.title_raw
      or old.occupation_raw is distinct from new.occupation_raw
      or old.expires_at is distinct from new.expires_at
      or old.published_at is distinct from new.published_at)))
  execute function public.public_vacancy_search_sync();

insert into public.public_vacancy_search (id, search_text, expires_at, published_at)
  select v.id,
         public.public_vacancy_search_fold(coalesce(v.title_raw, '') || ' ' || coalesce(v.occupation_raw, '')),
         v.expires_at, v.published_at
  from public.public_vacancies v
  where v.is_active
on conflict (id) do nothing;

analyze public.public_vacancy_search;

-- ROLLBACK
-- see supabase/rollbacks/20261105100000_public_vacancy_search_table_v1.down.sql
