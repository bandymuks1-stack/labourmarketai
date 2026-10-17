-- 20261018090000_esco_labels_ui_locales_hash_unique_v1
--
-- RED (needs-human-gate): deletes reference rows and rebuilds an index on a production table.
-- Apply ONLY via Supabase MCP `apply_migration` after owner approval; never `supabase db push`.
-- Why (2026-10-17, Supabase Free quota, deadline 2026-10-20): esco_labels is 408 MB of a
-- 1,103 MB database — 132 MB of rows (1,045,186 labels in all 28 official ESCO languages,
-- widened on 2026-06-10) and 275 MB of indexes, 144 MB of which is the unique key that
-- carries the full label TEXT. The product serves 12 UI locales (da de en et fi lt lv nl no
-- pl ru sv; ESCO has no ru), so 585,863 rows in the other 17 locales are never read by any
-- product surface (`esco-lookup.ts`, `esco-autocomplete.ts` always filter on the viewer's
-- locale). They stay re-importable from the official ESCO v1.2.1 files (the importer and the
-- rule "ESCO is platform content, never user data" are unchanged).
--
-- Reversible: (1) the removed rows are archived on the VPS (ops/vps/lm-archive-table.sh
-- esco_labels "locale=not.in.(da,de,en,et,fi,lt,lv,nl,no,pl,sv)" esco-other-locales,
-- age-encrypted, verified) and re-importable; (2) the index change is pure DDL — the rollback
-- block recreates the original constraint.
--
-- Guard: the RED human gate itself — this file is applied by hand (apply_migration) only after
-- the archive is verified on the VPS; the migration-safety check keeps it out of auto-merge.

begin;

-- 1. Keep the UI locales only (ru is not an ESCO language; nothing to keep for it).
delete from public.esco_labels
where locale not in ('da','de','en','et','fi','lt','lv','nl','no','pl','sv');

-- 2. The unique key no longer carries the label text: md5(label) is 32 bytes whatever the label.
alter table public.esco_labels
  drop constraint if exists esco_labels_concept_type_concept_id_locale_label_label_type_key;
create unique index if not exists esco_labels_concept_locale_labelhash_type_key
  on public.esco_labels (concept_type, concept_id, locale, md5(label), label_type);

comment on index public.esco_labels_concept_locale_labelhash_type_key is
  'Uniqueness of (concept, locale, label, type) via md5(label): 2026-10-18 quota work replaced the 144 MB text-keyed constraint.';

commit;

-- 3. Space is returned only by a rewrite (run AFTER commit, outside a transaction; locks the table ~1 min):
--      vacuum full public.esco_labels;
--      reindex table public.esco_labels;

-- ROLLBACK (manual, reversible):
--   begin;
--   drop index if exists public.esco_labels_concept_locale_labelhash_type_key;
--   alter table public.esco_labels
--     add constraint esco_labels_concept_type_concept_id_locale_label_label_type_key
--     unique (concept_type, concept_id, locale, label, label_type);
--   commit;
--   -- then re-import the other 17 locales from the VPS archive or the official ESCO files
--   -- (scripts/esco import; the archive restores byte-identical rows).
