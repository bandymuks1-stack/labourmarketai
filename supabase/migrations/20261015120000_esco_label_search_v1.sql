-- 20261015120000 — ESCO typeahead uses its index: search_esco_labels_v1
--
-- WHY (production, 2026-10-15): the ESCO typeahead
-- (lib/taxonomy/esco-autocomplete.ts) filtered `label ILIKE 'q%'` ordered by
-- `label`. pg_stat_statements: mean 2.9 s, max 7.8 s (8 s timeout). Measured
-- as the `authenticated` role: 1,334–1,940 ms, ~30k buffers per keystroke on a
-- 408 MB table that does not fit the instance cache.
--
-- WHY NOT A COMPUTED FIELD (the first draft of this file, never applied): the
-- table's RLS policies (`is_active`, `is_admin()`) are a security barrier, so
-- the planner may not run a non-LEAKPROOF qual — `lower()`, LIKE, ILIKE — before
-- them. As `authenticated`, `lower(label) LIKE 'q%'` stayed a Filter after an
-- index scan on `locale` only: 1,940 ms, 38,363 rows removed. The 4.8 ms
-- measurement had been taken as a superuser, which bypasses RLS.
--
-- WHAT: one SECURITY DEFINER read that applies the SAME visibility the policy
-- applies (`is_active OR is_admin()`) and expresses the prefix as the
-- text_pattern_ops range `esco_labels_typeahead_idx (locale, lower(label))`
-- serves. Production dry run (rolled back), as `authenticated`: 0.26 ms,
-- 22 buffers; identical rows for lt/skill/plyt (2), en/skill/wel (107 matches,
-- same top 10), lt/skill/Dažy (17, same top 10).
--
-- Reference taxonomy only (ESCO labels, no personal data). EXECUTE for
-- `authenticated` only — exactly who the select policy admits; anon and
-- public get nothing (the table already refuses them).
--
-- @human-gate-approved  (acknowledgement only: PR is DRAFT + needs-human-gate; prod apply waits for the owner)
--
-- UNDO: supabase/rollbacks/20261015120000_esco_label_search_v1.down.sql

create or replace function public.search_esco_labels_v1(
  p_locale text,
  p_concept_type text,
  p_prefix text,
  p_limit integer default 10
)
returns table (concept_id uuid, concept_type text, label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p text := lower(coalesce(p_prefix, ''));
  v_hi text;
begin
  if char_length(v_p) < 2 then
    return;
  end if;
  -- Upper bound of the prefix range: the prefix with its last character
  -- incremented (UTF-8 byte order follows code points, the order
  -- text_pattern_ops compares in). starts_with() below keeps it exact.
  v_hi := left(v_p, -1) || chr(ascii(right(v_p, 1)) + 1);
  return query
    select e.concept_id, e.concept_type, e.label
      from public.esco_labels e
     where e.locale = p_locale::char(2)
       and e.concept_type = p_concept_type
       and lower(e.label) operator(pg_catalog.~>=~) v_p
       and lower(e.label) operator(pg_catalog.~<~) v_hi
       and starts_with(lower(e.label), v_p)
       -- The table's own select visibility (policies esco_labels_select +
       -- esco_labels_write), applied explicitly because DEFINER skips RLS.
       and (e.is_active or public.is_admin())
     order by lower(e.label), e.label
     limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

revoke all on function public.search_esco_labels_v1(text, text, text, integer) from public, anon;
grant execute on function public.search_esco_labels_v1(text, text, text, integer) to authenticated;

comment on function public.search_esco_labels_v1(text, text, text, integer) is
  'ESCO typeahead: prefix match on lower(label) served by esco_labels_typeahead_idx; same visibility as the esco_labels select policy (2026-10-15).';
