-- @human-gate-approved
-- 20261105100100_search_public_vacancy_previews_narrow_v6
--
-- NOT APPROVED FOR PRODUCTION: see 20261105100000_public_vacancy_search_table_v1.
-- RED by the migration-safety gate (SECURITY DEFINER replace). Same signature, RETURNS TABLE,
-- grants, anon allowlist entry, projection and row filter; title_raw and attribution_code are
-- still returned as NULL. ONLY the two branches with free text change, and both read the same
-- folded text from public_vacancy_search. Apply only after the reconcile script reports 0.
--
-- RULE (SR-10): a search finds an ad by its public title or its occupation. A term of up to three
-- characters must start a word, so `ok` does not find Kock; a longer one may sit anywhere in a
-- word, so `snickare` finds Byggsnickare. A whole-word match comes first, then the newest. A term
-- with nothing searchable in it (`-`, `%`) finds nothing. Case, marks and ß/ss do not matter.
-- PROOF: scripts/db-proof/search-title-oracle.sql, scripts/db-proof/search-title-cases.sql.
-- Rollback: supabase/rollbacks/20261105100100_search_public_vacancy_previews_narrow_v6.down.sql (the v5 body verbatim).

create or replace function public.search_public_vacancy_previews_v1(
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

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection. plpgsql with one branch per filter combination so each branch is planned with a usable index. Free text matches the public title and the occupation through public_vacancy_search, a derived folded copy of active ads, whose scan answers the exact total and the page; neither the title nor the copy is returned. A term of up to three characters must start a word. total_count: singleton when unfiltered (<= 10 min stale), exact live count otherwise.';

-- ROLLBACK
-- see supabase/rollbacks/20261105100100_search_public_vacancy_previews_narrow_v6.down.sql
