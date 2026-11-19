-- ROLLBACK of 20261018100000_esco_labels_cold_locales_on_vps_v1
-- Two parts: DDL here (reversible by SQL), DATA from the VPS archive (reversible by the restore tool).

begin;

-- 1. Surrogate primary key back (every row still carries its uuid `id`; the column was never dropped).
alter table public.esco_labels add constraint esco_labels_pkey primary key (id);

comment on table public.esco_labels is
  'ESCO labels in all 28 official languages (rollback of decision 0026 — cold locales restored from the VPS archive).';

commit;

-- 2. DATA: restore the 17 archived locales from the VPS, byte-identical rows (same ids, same labels):
--      sh /root/lm-prod/bin/lm-archive-table.sh --restore \
--        /root/lm-prod/backups/archive-esco-other-locales-<stamp>.jsonl.gz.age esco_labels \
--        concept_type,concept_id,locale,label,label_type
--    The restore upserts through PostgREST with `Prefer: resolution=merge-duplicates` on the unique key,
--    so it is idempotent and safe to repeat. Alternatively: scripts/esco/import-esco.mjs --apply with the
--    official ESCO v1.2.1 files re-imports every locale.
-- 3. Then by hand: vacuum analyze public.esco_labels;
