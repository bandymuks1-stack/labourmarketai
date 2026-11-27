-- @human-gate-approved
-- ROLLBACK: restore the exact preceding preview functions; no row or grant changes.
-- Refuse to overwrite a later function revision.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.get_public_vacancy_preview_v1(uuid)'::regprocedure)) <> 'e199f39031f377642ddc85c8e4c8bd7a'
    OR md5(pg_get_functiondef('public.search_public_vacancy_previews_v1(text,text,integer,integer)'::regprocedure)) <> 'f43b4c015df6b16adaa4b71edc39b20c' THEN
    RAISE EXCEPTION 'Public vacancy preview definition changed; review required';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_public_vacancy_preview_v1(p_id uuid)
 RETURNS TABLE(id uuid, title_raw text, profession_slug text, occupation_raw text, employment_form text, working_time text, positions integer, compensation_currency text, compensation_min numeric, compensation_max numeric, source_language text, attribution_code text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    v.id,
    null::text as title_raw,
    v.profession_slug,
    v.occupation_raw,
    v.employment_form,
    v.working_time,
    v.positions,
    case when v.compensation_min is not null or v.compensation_max is not null
         then v.compensation_currency end,
    v.compensation_min,
    v.compensation_max,
    v.source_language,
    null::text as attribution_code,
    v.published_at
  from public.public_vacancies v
  where v.id = p_id
    and v.is_active
    and (v.expires_at is null or v.expires_at > now());
$function$;

CREATE OR REPLACE FUNCTION public.search_public_vacancy_previews_v1(p_query text DEFAULT NULL::text, p_profession_slug text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title_raw text, profession_slug text, occupation_raw text, employment_form text, working_time text, positions integer, compensation_currency text, compensation_min numeric, compensation_max numeric, source_language text, attribution_code text, published_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET max_parallel_workers_per_gather TO '0'
 SET work_mem TO '16MB'
AS $function$
#variable_conflict use_column
declare
  v_needle text := nullif(btrim(coalesce(p_query, '')), '');
  v_folded text;
  v_match text;
  v_word text;
  v_raw text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
begin
  if v_needle is not null then
    -- The fold leaves no LIKE wildcard, so nothing here needs escaping.
    v_folded := btrim(public.public_vacancy_search_fold(v_needle));
    if v_folded = '' then
      -- Nothing for the fold to keep (`-`, `/`): v5's own predicate on the occupation, its own
      -- escaping, so a symbol finds exactly what v5 finds (owner 2026-11-09: keep v5's recall).
      v_raw := '%' || lower(replace(replace(v_needle, '%', '\%'), '_', '\_')) || '%';
    end if;
    v_word := '% ' || v_folded || ' %';
    -- Every term matches anywhere in a word, as v5 did (owner 2026-11-09): `ok` still finds Kock.
    v_match := '%' || v_folded || '%';
  end if;

  -- A symbol-only term: v5's two free-text branches verbatim, on v_raw.
  if v_raw is not null then
    if p_profession_slug is null then
      return query
        with match as materialized (
          select h.id, h.published_at
          from public.public_vacancies h
          where h.is_active and coalesce(h.expires_at, 'infinity'::timestamptz) > now()
            and lower(h.occupation_raw) collate "C" like v_raw),
        total as (select count(*) as n from match),
        hit as (
          select m.id, m.published_at
          from match m
          order by m.published_at desc nulls last, m.id
          limit v_limit offset v_offset)
        select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
               v.working_time, v.positions,
               case when v.compensation_min is not null or v.compensation_max is not null
                    then v.compensation_currency end,
               v.compensation_min, v.compensation_max, v.source_language,
               null::text, v.published_at, (select t.n from total t)
        from hit
        join public.public_vacancies v on v.id = hit.id
        order by hit.published_at desc nulls last, hit.id;
    else
      select count(*) into v_total from public.public_vacancies v
        where v.is_active and (v.expires_at is null or v.expires_at > now())
          and v.profession_slug = p_profession_slug
          and lower(v.occupation_raw) collate "C" like v_raw;
      return query
        with hit as (
          select h.id, h.published_at
          from public.public_vacancies h
          where h.is_active and (h.expires_at is null or h.expires_at > now())
            and h.profession_slug = p_profession_slug
            and lower(h.occupation_raw) collate "C" like v_raw
          order by h.published_at desc nulls last, h.id
          limit v_limit offset v_offset)
        select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form,
               v.working_time, v.positions,
               case when v.compensation_min is not null or v.compensation_max is not null
                    then v.compensation_currency end,
               v.compensation_min, v.compensation_max, v.source_language,
               null::text, v.published_at, v_total
        from hit
        join public.public_vacancies v on v.id = hit.id
        order by hit.published_at desc nulls last, hit.id;
    end if;
    return;
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
