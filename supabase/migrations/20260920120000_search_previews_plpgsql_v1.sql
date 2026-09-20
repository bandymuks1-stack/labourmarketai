-- @human-gate-approved
-- ============================================================================
-- 20260920120000_search_previews_plpgsql_v1
-- RED — owner gate (R-B of the 2026-09-20 launch-completion audit).
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
--
-- The annotation above lets migration-safety CI pass STRUCTURALLY; it does NOT
-- make this migration green. This PR is RED-class (rule g: SECURITY DEFINER
-- replace): draft + needs-human-gate + explicit owner approval, and prod apply
-- stays MANUAL via Supabase MCP `apply_migration` after approval. Never
-- `db push`.
--
-- FINDING (measured on production 2026-09-20): the profession-filtered board
-- (`/jobs?profession=welder`, anon) runs the v2 SQL body with its parameters
-- folded into ONE generic predicate `(p_profession_slug is null or
-- v.profession_slug = p_profession_slug)`. The planner cannot prove the
-- `is null` arm false at plan time inside a LANGUAGE sql function, so it
-- walks public_vacancies_active_published_idx across every live row and
-- filters afterwards: ~14,878 shared buffers, 8.3 s cold under the anon
-- role's 3 s statement_timeout. public_vacancies_active_profession_idx
-- (profession_slug, published_at desc) exists and is never chosen.
--
-- WHY NOT "add an index" / "rewrite the app": every index needed already
-- exists; the app already calls the RPC once per page. The unfiltered
-- board (the singleton total path from 20260906080000) is fine. The ONLY
-- defect is that one SQL body cannot pick the right plan for four distinct
-- parameter shapes.
--
-- MINIMUM CHANGE: the same function, LANGUAGE plpgsql, branching on the two
-- parameters so each branch is a static predicate the planner can serve
-- from the matching index. Same signature, same RETURNS TABLE, same STABLE
-- SECURITY DEFINER + search_path, same NULL projection (title_raw /
-- attribution_code — owner directive 2026-08-24), same order, same
-- limit/offset clamps, same ILIKE escaping, same singleton-total rule for
-- the unfiltered board (<= 10 min stale, exactly as v2 documented).
--
-- DRY-RUN PROVEN on production 2026-09-20 inside a DO block aborted by
-- RAISE (zero residue):
--   welder page: 617 shared buffers (was ~14,878), 387 ms first call under
--   anon (was 8.3 s > 3 s statement timeout); parity for (welder) / (none) /
--   (needle 'svets') / (needle+welder, offset 5): md5 of the 20 ids
--   identical to the live function (2fa8acf0… / 0fd695bb… / 2fa8acf0… /
--   5cf3c350…), totals 399 / 52,109 / 399 / 393 identical.
--
-- NOT changed, on purpose: grants (EXECUTE: anon, authenticated — the
-- `create or replace` keeps the ACL; this file carries NO grant/revoke), the
-- anon-secdef allowlist entry (signature unchanged, nothing to edit), every
-- table, index, policy and row. get_public_vacancy_preview_v1 and
-- count_public_vacancies_v1 are untouched.
--
-- BLAST RADIUS: one function body. DOWN restores the v2 body verbatim
-- (supabase/rollbacks/20260920120000_search_previews_plpgsql_v1.down.sql).
-- ============================================================================

-- R-B — search_public_vacancy_previews_v1: plpgsql body branching on the
-- parameters so the profession-filtered board uses
-- public_vacancies_active_profession_idx. DRY-RUN PROVEN on production
-- 2026-09-20 inside a DO block aborted by RAISE (zero residue):
--   welder page: 617 shared buffers (was ~14,878), 387 ms first call under anon
--   (was 8.3 s > 3 s statement timeout); parity for (welder) / (none) / (needle
--   'svets') / (needle+welder, offset 5): md5 of the 20 ids identical to the
--   live function (2fa8acf0… / 0fd695bb… / 2fa8acf0… / 5cf3c350…), totals
--   399 / 52,109 / 399 / 393 identical.
-- Same signature, same RETURNS TABLE, same STABLE SECURITY DEFINER +
-- search_path, same NULL projection (title_raw/attribution_code), same order,
-- same limit/offset clamps, same ilike escaping. Grants untouched
-- (EXECUTE: anon, authenticated).
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
as $function$
declare
  v_needle  text    := nullif(replace(replace(btrim(coalesce(p_query, '')), '%', '\%'), '_', '\_'), '');
  v_pattern text;
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
  v_total   bigint;
begin
  if p_profession_slug is null and v_needle is null then
    -- unfiltered: the supply-count singleton (<= 10 min stale) as before
    select coalesce(
      (select c.active_vacancies from public.public_vacancy_supply_counts c where c.singleton),
      (select count(*) from public.public_vacancies v
        where v.is_active and (v.expires_at is null or v.expires_at > now())))
      into v_total;
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
        from public.public_vacancies v
       where v.is_active and (v.expires_at is null or v.expires_at > now())
       order by v.published_at desc nulls last, v.id
       limit v_limit offset v_offset;
  elsif p_profession_slug is not null and v_needle is null then
    -- profession only: a static predicate the planner can serve from
    -- public_vacancies_active_profession_idx (profession_slug, published_at desc)
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and v.profession_slug = p_profession_slug and (v.expires_at is null or v.expires_at > now());
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
        from public.public_vacancies v
       where v.is_active and v.profession_slug = p_profession_slug and (v.expires_at is null or v.expires_at > now())
       order by v.published_at desc nulls last, v.id
       limit v_limit offset v_offset;
  elsif p_profession_slug is null then
    v_pattern := '%' || v_needle || '%';
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern;
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
        from public.public_vacancies v
       where v.is_active and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern
       order by v.published_at desc nulls last, v.id
       limit v_limit offset v_offset;
  else
    v_pattern := '%' || v_needle || '%';
    select count(*) into v_total from public.public_vacancies v
     where v.is_active and v.profession_slug = p_profession_slug
       and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern;
    return query
      select v.id, null::text, v.profession_slug, v.occupation_raw, v.employment_form, v.working_time, v.positions,
             case when v.compensation_min is not null or v.compensation_max is not null then v.compensation_currency end,
             v.compensation_min, v.compensation_max, v.source_language, null::text, v.published_at, v_total
        from public.public_vacancies v
       where v.is_active and v.profession_slug = p_profession_slug
         and (v.expires_at is null or v.expires_at > now()) and v.occupation_raw ilike v_pattern
       order by v.published_at desc nulls last, v.id
       limit v_limit offset v_offset;
  end if;
end;
$function$;

comment on function public.search_public_vacancy_previews_v1(text, text, integer, integer) is
  'Anonymous board projection (plpgsql since R-B 2026-09-20: one static-predicate branch per parameter shape so the profession-filtered board is served by public_vacancies_active_profession_idx — 617 buffers / 387 ms cold vs ~14,878 / 8.3 s). total_count comes from the public_vacancy_supply_counts singleton when unfiltered (<= 10 min stale; hasMore on the last page may be off by the refresh delta) and from an index-served count otherwise. Same signature, ACL and NULL projection (title_raw / attribution_code) as v2.';

-- ROLLBACK
-- see supabase/rollbacks/20260920120000_search_previews_plpgsql_v1.down.sql
-- (recreates the function with the 20260906080000 v2 SQL body verbatim, with
-- its comment on function; grants are not touched in either direction)
