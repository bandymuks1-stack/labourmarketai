-- ROLLBACK for 20261109140000_public_jobs_country_filter_v2.
-- Returns to the #3083 state exactly: the v6 search with four arguments, the #3083 sync
-- function and update trigger, the production refresh body (2026-11-09). Everything this
-- removes is derived (the per-country totals, the copied country, an index): no source
-- row is touched. An app build that passes p_country must be rolled back FIRST.

drop function if exists public.list_public_vacancy_countries_v1();

drop function if exists public.search_public_vacancy_previews_v1(text, text, integer, integer, text);

create function public.search_public_vacancy_previews_v1(
  p_query text default null,
  p_profession_slug text default null,
  p_limit integer default 20,
  p_offset integer default 0)
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
  v_folded text;
  v_match text;
  v_word text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
begin
  if v_needle is not null then
    -- The fold leaves no LIKE wildcard, so nothing here needs escaping.
    v_folded := btrim(public.public_vacancy_search_fold(v_needle));
    if v_folded = '' then
      return;
    end if;
    v_word := '% ' || v_folded || ' %';
    v_match := case when length(v_folded) <= 3 then '% ' || v_folded || '%' else '%' || v_folded || '%' end;
  end if;

  if p_profession_slug is null and v_needle is null then
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
    -- Free text only.
    -- One scan of the narrow copy answers the count AND the page (v6): the same pages in
    -- every state, because it needs no visibility check, and no folding, because it is stored.
    return query
      with match as materialized (
        select h.id, h.published_at,
               case when h.search_text like v_word then 1 else 0 end as rank
        from public.public_vacancy_search h
        where coalesce(h.expires_at, 'infinity'::timestamptz) > now()
          and h.search_text like v_match),
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
    -- Profession AND free text: the same text and the same rule, so a filter narrows a search
    -- and never changes what a word means.
    return query
      with match as materialized (
        select h.id, h.published_at,
               case when s.search_text like v_word then 1 else 0 end as rank
        from public.public_vacancies h
        join public.public_vacancy_search s on s.id = h.id
        where h.is_active and (h.expires_at is null or h.expires_at > now())
          and h.profession_slug = p_profession_slug
          and s.search_text like v_match),
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


revoke execute on function public.search_public_vacancy_previews_v1(text, text, integer, integer) from public;
grant execute on function public.search_public_vacancy_previews_v1(text, text, integer, integer) to anon, authenticated;

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection. plpgsql with one branch per filter combination so each branch is planned with a usable index. Free text matches the public title and the occupation through public_vacancy_search, a derived folded copy of active ads, whose scan answers the exact total and the page; neither the title nor the copy is returned. A term of up to three characters must start a word. total_count: singleton when unfiltered (<= 10 min stale), exact live count otherwise.';


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
end;
$function$;

revoke execute on function public.refresh_public_vacancy_supply_counts_v1() from public, anon, authenticated;
grant execute on function public.refresh_public_vacancy_supply_counts_v1() to service_role;

alter table public.public_vacancy_supply_counts drop column if exists active_by_country;

drop index if exists public.public_vacancies_active_country_board_idx;

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


alter table public.public_vacancy_search drop column if exists country;
