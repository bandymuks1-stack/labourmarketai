-- @human-gate-approved
-- 20261001200100_search_public_vacancy_previews_plan_v3
--
-- RED by the migration-safety gate (rule g: SECURITY DEFINER replace). Same
-- signature, same RETURNS TABLE, same grants (CREATE OR REPLACE preserves
-- them), same anon allowlist entry, same projection and same row filter. ONLY
-- the plan shape of the body changes. Apply via Supabase MCP `apply_migration`
-- after review; never `supabase db push`. Needs 20261001090000 and 20261001200000 applied first.
--
-- MEASURED 2026-10-01 (anon role, parallel workers off): handyman 1,100 ms, baker first call 1,277 ms. Prototype of this body on production, with 20261001200000 applied: handyman 24 ms, baker 8, cleaner 19, caregiver 43, farm_worker 2, free text 185-352 ms, profession+text 9-246 ms.
-- ORIGINAL DEFECT (before the covering index, under role anon,
-- gorgitwvdzxbnaxhrsrw):
--   search_public_vacancy_previews_v1(null,'baker',20,0)   6,721 ms
--   search_public_vacancy_previews_v1('kepejas',null,20,0) 10,259 ms
--   anon statement_timeout is 3 s -> /lt/jobs?profession=baker answers
--   "board did not answer in time".
-- CAUSE: a `language sql` function is planned GENERIC (parameters unknown), so
--   `(p_slug is null or v.profession_slug = p_slug)` and the needle initplan
--   are opaque OR-predicates. Reproduced with PREPARE + force_generic_plan:
--   Bitmap Heap Scan over the whole live set, 48,266 rows removed by filter,
--   6,104 ms. A profession with few live ads can never satisfy LIMIT early on
--   the published_at walk, so it scans to the end.
-- FIX: plpgsql with one branch per filter combination (no dynamic SQL), each
--   branch a plain equality / ilike so the planner uses
--   public_vacancies_active_profession_published_idx (ordered, early stop) or
--   public_vacancies_active_published_cover_idx (index-only text match).
--   `#variable_conflict use_column` because OUT names equal column names.
--
-- Behaviour: identical results and order (published_at desc nulls last, id),
-- identical total_count semantics (unfiltered = singleton with live fallback,
-- filtered = exact live count), same limit/offset caps.
-- Rollback: supabase/rollbacks/20261001200100_search_public_vacancy_previews_plan_v3.down.sql
-- (the previous production body verbatim).

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
as $function$
#variable_conflict use_column
declare
  v_needle text := nullif(replace(replace(btrim(coalesce(p_query, '')), '%', '\%'), '_', '\_'), '');
  v_pattern text;
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
begin
  if v_needle is not null then
    v_pattern := '%' || v_needle || '%';
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
    -- Free text only: match over the covering index, join back for the page.
    select count(*) into v_total from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.occupation_raw ilike v_pattern;
    return query
      with hit as (
        select h.id, h.published_at
        from public.public_vacancies h
        where h.is_active and (h.expires_at is null or h.expires_at > now())
          and h.occupation_raw ilike v_pattern
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

  else
    -- Profession AND free text.
    select count(*) into v_total from public.public_vacancies v
      where v.is_active and (v.expires_at is null or v.expires_at > now())
        and v.profession_slug = p_profession_slug
        and v.occupation_raw ilike v_pattern;
    return query
      with hit as (
        select h.id, h.published_at
        from public.public_vacancies h
        where h.is_active and (h.expires_at is null or h.expires_at > now())
          and h.profession_slug = p_profession_slug
          and h.occupation_raw ilike v_pattern
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
end;
$function$;

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection. plpgsql with one branch per filter combination so each branch is planned with a usable index (a generic SQL-function plan walked the whole live set: 6.7 s for a rare profession, 10 s for an unmatched needle, vs the 3 s anon statement_timeout). total_count: singleton when unfiltered (<= 10 min stale), exact live count otherwise.';

-- ROLLBACK
-- see supabase/rollbacks/20261001200100_search_public_vacancy_previews_plan_v3.down.sql
-- (recreates the previous language-sql body verbatim)
