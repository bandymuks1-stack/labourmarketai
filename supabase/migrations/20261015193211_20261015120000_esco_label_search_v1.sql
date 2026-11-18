-- ============================================================================
-- MIGRATION ALREADY APPLIED IN PRODUCTION — NEVER MANUALLY RE-APPLY.
--
-- Production ledger version : 20261015193211
-- Production ledger name    : 20261015120000_esco_label_search_v1
-- Restored to repo          : 2026-11-01, for migration-history parity only. The live
--                             migration-parity gate (quality) found this ledger row with
--                             no repository file; the owner approved restoring the six
--                             such rows byte-exact (option 2, 2026-11-01).
-- Source of truth           : supabase_migrations.schema_migrations.statements of the row
--                             above, read 2026-11-01. Later-edited branch copies were NOT
--                             used as a source.
-- Parity proof              : everything after the marker line below is BYTE-EXACT to
--                             production's stored statements (2237 bytes).
--                             md5 = 5e8361897248d8704cd2a3817592b030
--                             Verify: drop every line up to and including the marker line,
--                             then md5sum the remainder (no trailing newline).
-- ROLLBACK                  : supabase/rollbacks/20261015193211_20261015120000_esco_label_search_v1.down.sql — RECONSTRUCTED after the
--                             production apply; the ledger stored no rollback. Local
--                             development resets and repo governance only.
--
-- @human-gate-approved
-- HUMAN GATE SCOPE: restoration of HISTORICAL, ALREADY-PRODUCTION-APPLIED SQL only
-- (owner decision 2026-11-01, option 2; RED draft PR, owner approves the merge).
-- migration-safety findings expected for this file: grant-or-revoke, security-definer function.
-- This annotation grants NO right to apply, re-apply or change anything in production.
-- ============================================================================
-- >>> PRODUCTION STATEMENTS BELOW (byte-exact; do not edit) <<<
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
  v_p text;
  v_hi text;
begin
  -- Input validation: anything outside the typeahead's own contract answers
  -- nothing (never an error, never a widened read). A 3-letter locale would
  -- otherwise be silently truncated by the char(2) cast.
  if p_locale is null or char_length(p_locale) <> 2 then
    return;
  end if;
  if p_concept_type is null or p_concept_type not in ('occupation', 'skill') then
    return;
  end if;
  v_p := lower(coalesce(p_prefix, ''));
  if char_length(v_p) < 2 or char_length(v_p) > 100 then
    return;
  end if;
  -- Upper bound of the prefix range for text_pattern_ops (byte order): the
  -- prefix followed by U+10FFFF, the highest code point. Every label that
  -- starts with the prefix sorts below it (bar one followed by U+10FFFF
  -- itself, which no ESCO label contains); starts_with() keeps it exact.
  v_hi := v_p || chr(1114111);
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
     order by lower(e.label), e.label, e.concept_id
     limit least(greatest(coalesce(p_limit, 10), 1), 20);
end;
$$;

revoke all on function public.search_esco_labels_v1(text, text, text, integer) from public, anon;
grant execute on function public.search_esco_labels_v1(text, text, text, integer) to authenticated;

comment on function public.search_esco_labels_v1(text, text, text, integer) is
  'ESCO typeahead: prefix match on lower(label) served by esco_labels_typeahead_idx; same visibility as the esco_labels select policy (2026-10-15).';