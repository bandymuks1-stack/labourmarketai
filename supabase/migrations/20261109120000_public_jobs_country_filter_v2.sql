-- @human-gate-approved
-- 20261109120000_public_jobs_country_filter_v2
--
-- NOT APPROVED FOR PRODUCTION. RED by the migration-safety gate (a SECURITY DEFINER
-- function dropped and recreated with one more argument, a definer body replaced).
-- DRAFT PR + `needs-human-gate`; applied by the owner channel via Supabase MCP
-- `apply_migration` only, never `supabase db push`.
--
-- ORDER: AFTER #3083 (20261105100000 public_vacancy_search, 20261105100100 v6 body).
-- This file starts from the v6 body verbatim and adds one optional filter. Applied
-- without #3083 it fails on the first statement (no public_vacancy_search), atomically.
-- Supersedes the 2026-10-08 draft #2209, which added a second search function, a
-- second count table and could not combine a country with a word or a profession.
--
-- WHY (owner 2026-11-09). `/jobs?country=NO` must really show Norway only, never every
-- country under a URL that says Norway. Live supply today: SE (Arbetsförmedlingen) and
-- NO (NAV).
--
-- WHAT.
--  1. public_vacancy_search.country: the ad's ISO alpha-2 country, kept by the same
--     sync trigger, so a word + country search is the same narrow scan with one more
--     predicate.
--  2. public_vacancies_active_country_board_idx: the board cover index with country in
--     front. A country board page, and a country + profession page and count, are
--     index-only and stop early in the board's own order. Additive.
--  3. public_vacancy_supply_counts.active_by_country: per-country totals, refreshed by
--     the same 10-minute job. The singleton statement stays verbatim; the per-country
--     count is a second, index-only statement on the index from 2. The country board
--     never counts live, so it holds after an import exactly as the unfiltered board does.
--  4. search_public_vacancy_previews_v1(p_query, p_profession_slug, p_limit, p_offset,
--     p_country default null): THE one search, one more optional argument. A call
--     without p_country is the v6 body unchanged. A country that is not two letters
--     finds nothing (never everything).
--  5. count_public_vacancies_v1() is untouched; list_public_vacancy_countries_v1()
--     returns the countries with live ads and their maintained totals, for a visible
--     choice on the board. Constant cost, no public_vacancies read.
--
-- ANON BOUNDARY: the country is exposed only as the filter value and the facet, which
-- the board already shows per card as the ad's source. No new column is returned.
-- Rollback: supabase/rollbacks/20261109120000_public_jobs_country_filter_v2.down.sql

-- 1. The narrow copy carries the country.
alter table public.public_vacancy_search add column if not exists country text collate "C";

update public.public_vacancy_search s
   set country = v.country
  from public.public_vacancies v
 where v.id = s.id
   and s.country is distinct from v.country;

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
  insert into public.public_vacancy_search as s (id, search_text, expires_at, published_at, country)
    values (new.id,
            public.public_vacancy_search_fold(coalesce(new.title_raw, '') || ' ' || coalesce(new.occupation_raw, '')),
            new.expires_at, new.published_at, new.country)
    on conflict (id) do update
      set search_text = excluded.search_text,
          expires_at = excluded.expires_at,
          published_at = excluded.published_at,
          country = excluded.country;
  return null;
end;
$function$;

revoke all on function public.public_vacancy_search_sync() from public, anon, authenticated, service_role;

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
      or old.published_at is distinct from new.published_at
      or old.country is distinct from new.country)))
  execute function public.public_vacancy_search_sync();

-- 2. Country board cover index (the board cover index with country in front).
-- @plan-cache-proof: n/a a new index for a filter that does not exist before this migration; its plans are proven on a throwaway PG16 cluster (PR evidence) and must be re-read with EXPLAIN right after apply
create index if not exists public_vacancies_active_country_board_idx
  on public.public_vacancies (country, published_at desc nulls last, id)
  include (expires_at, profession_slug, occupation_raw, employment_form, working_time,
           positions, compensation_currency, compensation_min, compensation_max, source_language)
  where is_active;

-- 3. Per-country totals, refreshed by the same 10-minute job.
alter table public.public_vacancy_supply_counts
  add column if not exists active_by_country jsonb not null default '{}'::jsonb;

create or replace function public.refresh_public_vacancy_supply_counts_v1()
returns void
language plpgsql
security definer
set search_path to 'public'
set work_mem to '64MB'
as $function$
begin
  -- Only the scheduler (postgres) or the service role may trigger the aggregate.
  if session_user <> 'postgres' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- The singleton, verbatim: the same statement the cron has always run.
  insert into public.public_vacancy_supply_counts
    (singleton, active_vacancies, distinct_employers, last_refreshed_at, computed_at)
  select true,
         count(*)::bigint,
         count(distinct v.employer_name)::bigint,
         max(v.last_seen_at),
         now()
    from public.public_vacancies v
   where v.is_active
     and (v.expires_at is null or v.expires_at > now())
  on conflict (singleton) do update
     set active_vacancies   = excluded.active_vacancies,
         distinct_employers = excluded.distinct_employers,
         last_refreshed_at  = excluded.last_refreshed_at,
         computed_at        = excluded.computed_at;

  -- Per country: a separate count on the country index (index-only, no sort, no heap
  -- read on an all-visible table). Folding it into the scan above was measured on
  -- production as far slower: a sort by country on top of the heap scan.
  update public.public_vacancy_supply_counts c
     set active_by_country = coalesce((
           select jsonb_object_agg(z.country, z.n)
             from (select v.country, count(*)::bigint as n
                     from public.public_vacancies v
                    where v.is_active
                      and (v.expires_at is null or v.expires_at > now())
                      and v.country ~ '^[A-Z]{2}$'
                    group by v.country) z), '{}'::jsonb)
   where c.singleton;
end;
$function$;

revoke execute on function public.refresh_public_vacancy_supply_counts_v1() from public, anon, authenticated;
grant execute on function public.refresh_public_vacancy_supply_counts_v1() to service_role;

-- 4. The one search, one more optional argument.
drop function if exists public.search_public_vacancy_previews_v1(text, text, integer, integer);

create function public.search_public_vacancy_previews_v1(
  p_query text default null,
  p_profession_slug text default null,
  p_limit integer default 20,
  p_offset integer default 0,
  p_country text default null)
returns table(
  id uuid,
  title_raw text,
  profession_slug text,
  occupation_raw text,
  employment_form text,
  working_time text,
  positions integer,
  compensation_currency text,
  compensation_min numeric,
  compensation_max numeric,
  source_language text,
  attribution_code text,
  published_at timestamp with time zone,
  total_count bigint)
language plpgsql
stable security definer
set search_path to 'public'
set max_parallel_workers_per_gather to 0
set work_mem to '16MB'
as $function$
#variable_conflict use_column
declare
  v_needle text := nullif(btrim(coalesce(p_query, '')), '');
  v_country text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  v_folded text;
  v_match text;
  v_word text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
begin
  -- A country that is not a code finds nothing: never "every country".
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    return;
  end if;

  if v_needle is not null then
    -- The fold leaves no LIKE wildcard, so nothing here needs escaping.
    v_folded := btrim(public.public_vacancy_search_fold(v_needle));
    if v_folded = '' then
      return;
    end if;
    v_word := '% ' || v_folded || ' %';
    v_match := case when length(v_folded) <= 3 then '% ' || v_folded || '%' else '%' || v_folded || '%' end;
  end if;

  if v_country is not null and v_needle is null then
    -- Country board, optionally with a profession: one index (country first), in the
    -- board's own order. The total is the maintained per-country row when there is no
    -- profession; with one, it is counted on the same index (index-only).
    if p_profession_slug is null then
      v_total := coalesce(
        (select (c.active_by_country ->> v_country)::bigint
           from public.public_vacancy_supply_counts c where c.singleton),
        0);
    else
      select count(*) into v_total from public.public_vacancies v
        where v.is_active and (v.expires_at is null or v.expires_at > now())
          and v.country = v_country
          and v.profession_slug = p_profession_slug;
    end if;
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
             v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null
                  then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language,
             null::text, v.published_at, v_total
      from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.country = v_country
        and (p_profession_slug is null or v.profession_slug = p_profession_slug)
      order by v.published_at desc nulls last, v.id
      limit v_limit offset v_offset;

  elsif p_profession_slug is null and v_needle is null then
    -- Unfiltered board: total from the cron singleton, live count as fallback.
    v_total := coalesce(
      (select c.active_vacancies from public.public_vacancy_supply_counts c where c.singleton),
      (select count(*) from public.public_vacancies v
        where v.is_active and (v.expires_at is null or v.expires_at > now())));
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
             v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null
                  then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language,
             null::text, v.published_at, v_total
      from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
      order by v.published_at desc nulls last, v.id
      limit v_limit offset v_offset;

  elsif v_needle is null then
    -- Profession only.
    select count(*) into v_total from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.profession_slug = p_profession_slug;
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
             v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null
                  then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language,
             null::text, v.published_at, v_total
      from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.profession_slug = p_profession_slug
      order by v.published_at desc nulls last, v.id
      limit v_limit offset v_offset;

  elsif p_profession_slug is null then
    -- Free text, optionally in one country: the same narrow scan, one more predicate.
    return query
      with match as materialized (
        select h.id, h.published_at,
               case when h.search_text like v_word then 1 else 0 end as rank
        from public.public_vacancy_search h
        where coalesce(h.expires_at, 'infinity'::timestamptz) > now()
          and h.search_text like v_match
          and (v_country is null or h.country = v_country)),
      total as (select count(*) as n from match),
      hit as (
        select m.id, m.published_at, m.rank
        from match m
        order by m.rank desc, m.published_at desc nulls last, m.id
        limit v_limit offset v_offset)
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
             v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null
                  then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language,
             null::text, v.published_at, (select t.n from total t)
      from hit
      join public.public_vacancies v on v.id = hit.id
      order by hit.rank desc, hit.published_at desc nulls last, hit.id;

  else
    -- Profession AND free text, optionally in one country.
    return query
      with match as materialized (
        select h.id, h.published_at,
               case when s.search_text like v_word then 1 else 0 end as rank
        from public.public_vacancies h
        join public.public_vacancy_search s on s.id = h.id
        where h.is_active and (h.expires_at is null or h.expires_at > now())
          and h.profession_slug = p_profession_slug
          and s.search_text like v_match
          and (v_country is null or s.country = v_country)),
      total as (select count(*) as n from match),
      hit as (
        select m.id, m.published_at, m.rank
        from match m
        order by m.rank desc, m.published_at desc nulls last, m.id
        limit v_limit offset v_offset)
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
             v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null
                  then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language,
             null::text, v.published_at, (select t.n from total t)
      from hit
      join public.public_vacancies v on v.id = hit.id
      order by hit.rank desc, hit.published_at desc nulls last, hit.id;
  end if;
end;
$function$;

revoke execute on function public.search_public_vacancy_previews_v1(text, text, integer, integer, text) from public;
grant execute on function public.search_public_vacancy_previews_v1(p_query text, p_profession_slug text, p_limit integer, p_offset integer, p_country text) to anon, authenticated;

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer, text) is
  'Anonymous board projection. plpgsql with one branch per filter combination so each branch is planned with a usable index. Free text matches the public title and the occupation through public_vacancy_search. p_country (ISO alpha-2, optional) restricts every branch to one country; a value that is not a code returns no rows. total_count: singleton (or its per-country entry) when there is no profession and no text (<= 10 min stale), exact live count otherwise.';

-- 5. The countries a reader can choose, with their maintained totals.
create or replace function public.list_public_vacancy_countries_v1()
returns table (country text, active_vacancies bigint)
language sql
stable security definer
set search_path to 'public'
as $function$
  select e.key, e.value::bigint
    from public.public_vacancy_supply_counts c,
         jsonb_each_text(c.active_by_country) e
   where c.singleton
     and e.key ~ '^[A-Z]{2}$'
     and e.value::bigint > 0
   order by e.value::bigint desc, e.key;
$function$;

revoke execute on function public.list_public_vacancy_countries_v1() from public;
grant execute on function public.list_public_vacancy_countries_v1() to anon, authenticated;

comment on function public.list_public_vacancy_countries_v1() is
  'The countries with live public ads and their maintained totals (<= 10 min stale), for the board''s visible country choice. Reads only the singleton row.';

select public.refresh_public_vacancy_supply_counts_v1();

-- ROLLBACK
-- see supabase/rollbacks/20261109120000_public_jobs_country_filter_v2.down.sql
