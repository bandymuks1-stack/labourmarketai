-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711250000 — worker_languages v1 (marketplace precision programme,
-- decision pack MP-1; gap map docs/launch/marketplace-precision-booking-gap-map-v1.md §2).
--
-- PROBLEM: the platform has NO worker languages store anywhere — verified in
-- the programme's source-first audit. `profiles.locale` is the UI locale;
-- `candidate_drafts.language` is a manager-entered draft note. Language is a
-- HARD matching criterion in the deterministic matching contract (a demand's
-- required language + CEFR level can block eligibility), so the worker side
-- must be able to state real language facts or matching stays permanently
-- "insufficient data" for every language-gated demand.
--
-- SOLUTION (smallest honest slice): ONE table + TWO gated write RPCs.
--
--   1. worker_languages — one row per (worker, language): closed 11-language
--      set (the platform's canonical locale set — same closed vocabulary the
--      structured demand v2 requirements use), closed level enum
--      A1..C2 + native. Self-declared; NO verified flag exists here (language
--      verification is out of scope — nothing may render these as verified).
--   2. RLS SELECT mirrors worker_skills EXACTLY: public.can_view_worker(worker_id)
--      — owner, admin, consented employer, or active-relationship exception.
--      Fail-closed: no consent + no relationship = invisible.
--   3. save_worker_language_v1 / remove_worker_language_v1 are the ONLY write
--      paths (no insert/update/delete policies; direct writes REVOKEd).
--      SECURITY DEFINER, search_path pinned, auth.uid() bound, closed-set
--      re-validation server-side.
--
-- ABUSE BOUNDS: unique (worker_id, lang) + the closed 11-value lang set caps
-- rows at 11 per worker by construction. No free text anywhere.
--
-- COMPATIBILITY / BACKFILL: none required — new table, no existing readers
-- (the consumer layer lands repo-safe and degrades honestly via 42P01 until
-- this is applied). No existing rows are touched.
--
-- ROLLBACK: paired supabase/rollbacks/20260711250000_worker_languages_v1.down.sql
-- drops the two functions and the table only.
--
-- POST-APPLY VERIFICATION:
--   select save_worker_language_v1('en','B1');          -- as a worker: returns row id
--   select * from worker_languages;                     -- as that worker: 1 row
--   select * from worker_languages;                     -- as an employer WITHOUT consent: 0 rows
--   select remove_worker_language_v1('en');             -- as the worker: true
--   + APPLIED_LEDGER.md row (repo file | ledger version | applied UTC | approver | summary).
--
-- @human-gate-approved — TIER: owner-gated (new table + SECURITY DEFINER
-- functions + grants = RED-class by the migration-safety classifier; this
-- annotation only downgrades the CI finding to a notice — the OWNER still
-- applies manually).
-- ============================================================================

begin;

create table if not exists public.worker_languages (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  lang       text not null
    check (lang in ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')),
  level      text not null
    check (level in ('A1','A2','B1','B2','C1','C2','native')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worker_id, lang)
);

create index if not exists worker_languages_worker_idx
  on public.worker_languages (worker_id);

alter table public.worker_languages enable row level security;

-- SELECT mirrors worker_skills_select exactly (privacy consent v1): owner,
-- admin, consented employer, or active-relationship exception — fail-closed.
drop policy if exists worker_languages_select on public.worker_languages;
create policy worker_languages_select
  on public.worker_languages for select
  using (public.can_view_worker(worker_id));

-- No insert/update/delete policies — writes are RPC-only.

create or replace function public.save_worker_language_v1(
  p_lang  text,
  p_level text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  row_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_lang is null or p_lang not in
       ('en','lt','lv','et','nl','de','da','no','sv','pl','ru') then
    raise exception 'Invalid language' using errcode = '22023';
  end if;
  if p_level is null or p_level not in
       ('A1','A2','B1','B2','C1','C2','native') then
    raise exception 'Invalid level' using errcode = '22023';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  insert into public.worker_languages as wl (worker_id, lang, level)
  values (w_id, p_lang, p_level)
  on conflict (worker_id, lang)
  do update set level = excluded.level, updated_at = now()
  returning wl.id into row_id;

  return row_id;
end;
$$;

create or replace function public.remove_worker_language_v1(
  p_lang text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid  uuid := auth.uid();
  w_id uuid;
  removed integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select w.id into w_id from public.workers w where w.profile_id = uid;
  if w_id is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  delete from public.worker_languages
   where worker_id = w_id and lang = p_lang;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- Reads via RLS SELECT; writes ONLY via the two RPCs.
grant select on public.worker_languages to authenticated;
revoke insert, update, delete on public.worker_languages from authenticated;

revoke all on function public.save_worker_language_v1(text, text) from public;
grant execute on function public.save_worker_language_v1(text, text) to authenticated;
revoke all on function public.remove_worker_language_v1(text) from public;
grant execute on function public.remove_worker_language_v1(text) to authenticated;

commit;
