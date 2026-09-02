-- ============================================================================
-- 20260902160200 — esco_labels_locale_scope_v1
--
-- FINAL COMPLETION Train B2 (2026-09-02). OWNER GATE G-5 — RED by policy:
-- creates the machinery to PRUNE esco_labels to the locales the product can
-- use, and applies NOTHING by itself. Every run is a service-role-only call
-- whose default is a DRY RUN. Ships as a DRAFT + needs-human-gate PR.
--
-- ----------------------------------------------------------------------------
-- WHY (measured on production, 2026-09-02)
-- ----------------------------------------------------------------------------
--   esco_labels: 1,034,730 rows, 427 MB = 54 % of the database (139 MB heap,
--   289 MB of indexes — the unique key includes the label text). 28 locales
--   are stored. The product routes 5 locales (lt en ru nl de) and recognises
--   text in 12 (lt en ru + da de et fi lv nl no pl sv); the autocomplete reads
--   by locale + prefix. Rows for the other 16 locales are never read by any
--   code path (LANGUAGE_MATRIX.md) — they are ESCO release data, re-importable
--   at any time with scripts/esco/import-esco.mjs.
--
--   Dry run 2026-09-02 for keep = {lt,en,ru,da,de,et,fi,lv,nl,no,pl,sv}:
--     rows outside scope ≈ 575,000 of 1,034,730; ≈ 235 MB heap+index reclaimed
--     after VACUUM (the audit's option 4).
--
-- ----------------------------------------------------------------------------
-- WHAT THE FUNCTION DOES
-- ----------------------------------------------------------------------------
--   esco_labels_prune_locales_v1(p_keep text[], p_dry_run boolean default true)
--   → one row per locale that would be (or was) removed, with its row count.
--   With p_dry_run = false it DELETES those rows. It refuses to run when
--   p_keep is empty or does not contain 'en' (the ESCO pivot language every
--   importer joins on) — a guard against a typo wiping the table.
--
--   Reversal = re-import: `node scripts/esco/import-esco.mjs --locales <list>`
--   restores any locale from the ESCO release files (the importer is
--   idempotent on the unique key). Nothing user-generated lives in this table.
--
-- NOT SCHEDULED. No cron, no trigger.
--
-- Least privilege: EXECUTE revoked from public/anon/authenticated; granted to
-- service_role only. SECURITY DEFINER with a pinned search_path.
--
-- ROLLBACK: supabase/rollbacks/20260902160200_esco_labels_locale_scope_v1.down.sql
-- ============================================================================

create or replace function public.esco_labels_prune_locales_v1(
  p_keep    text[],
  p_dry_run boolean default true
)
returns table (locale text, rows bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total bigint := 0;
begin
  if p_keep is null or cardinality(p_keep) = 0 or not ('en' = any(p_keep)) then
    raise exception 'esco_labels_prune_locales_v1: p_keep must be a non-empty locale list containing ''en''';
  end if;

  if not p_dry_run then
    delete from public.esco_labels l
     where not (l.locale = any(p_keep));
    get diagnostics v_total = row_count;
    raise log 'esco_labels_prune_locales_v1: DELETED % rows outside keep=%', v_total, p_keep;
    -- After a real run the per-locale breakdown is gone; report the total
    -- under a single synthetic row so the caller still sees what happened.
    return query select '(deleted)'::text, v_total;
    return;
  end if;

  raise log 'esco_labels_prune_locales_v1: dry run, keep=%', p_keep;
  return query
    select l.locale, count(*)::bigint
      from public.esco_labels l
     where not (l.locale = any(p_keep))
     group by l.locale
     order by count(*) desc;
end;
$$;

revoke all on function public.esco_labels_prune_locales_v1(text[], boolean) from public;
revoke all on function public.esco_labels_prune_locales_v1(text[], boolean) from anon;
revoke all on function public.esco_labels_prune_locales_v1(text[], boolean) from authenticated;
grant execute on function public.esco_labels_prune_locales_v1(text[], boolean) to service_role;

comment on function public.esco_labels_prune_locales_v1(text[], boolean) is
  'Prunes esco_labels to a locale allowlist (dry run by default). Re-importable from the ESCO release via scripts/esco/import-esco.mjs. Service-role only; never scheduled by this migration. Owner gate G-5 (FINAL COMPLETION register).';

-- ROLLBACK
--   drop function if exists public.esco_labels_prune_locales_v1(text[], boolean);
--   -- data reversal after a real run: node scripts/esco/import-esco.mjs --locales <removed locales>
