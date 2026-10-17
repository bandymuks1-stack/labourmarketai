-- 20261018100000_esco_labels_cold_locales_on_vps_v1
--
-- RED (needs-human-gate). Apply ONLY via Supabase MCP `apply_migration`, by hand, after the owner's
-- separate approval of the mass deletion AND after the VPS archive below is verified. Never `db push`.
--
-- Owner decision 2026-10-17 (docs/DECISIONS/0026-esco-cold-locales-archived-on-vps.md), amending the
-- 2026-08-13 directive "do not delete ESCO languages": the cold half of the ESCO label set (the 17
-- locales no product surface reads) now lives OUTSIDE Supabase — on the Agentai VPS, age-encrypted,
-- restorable row-for-row — because the Supabase Free project (500 MB) holds 1,103 MB and
-- esco_labels alone is 408 MB. No language is lost: the archive restores through
-- ops/vps/lm-archive-table.sh --restore (PostgREST upsert on the same unique key the importer uses).
--
-- PRECONDITION (checked by the person applying, not by SQL):
--   /root/lm-prod/backups/archive-esco-other-locales-<stamp>.jsonl.gz.age exists on the VPS,
--   `lm-archive-table.sh --verify` reports sha256 OK and the same row count as
--     select count(*) from public.esco_labels where locale not in (UI locales)   -- 585,863 on 2026-10-17
-- ARCHIVE-VERIFIED: <the person applying writes the archive file name here before applying>
--
-- Guard lib/guards/esco-dataset-is-preserved.test.ts allows this delete only in a migration that carries
-- the ARCHIVE-VERIFIED marker above and the decision reference.

begin;

-- B2 (esco-storage-optimization-plan v2, zero code references): the surrogate uuid primary key is
-- dropped; the 5-column unique constraint (the importer's upsert arbiter) stays and identifies a row.
alter table public.esco_labels drop constraint if exists esco_labels_pkey;

-- Option B: the 11 UI locales stay hot in Supabase (da de en et fi lt lv nl no pl sv; ESCO has no ru).
-- The other 17 locales are already archived on the VPS (see PRECONDITION) and are removed here.
delete from public.esco_labels
where locale not in ('da','de','en','et','fi','lt','lv','nl','no','pl','sv');

comment on table public.esco_labels is
  'ESCO labels, hot set = the 11 UI locales. The other 17 locales are archived on the VPS (age-encrypted JSONL, restorable via ops/vps/lm-archive-table.sh --restore). Decision 0026, 2026-10-17.';

commit;

-- AFTER commit, by hand, outside a transaction (owner-approved separately; locks the table ~1 min):
--   vacuum full public.esco_labels;
--   reindex table public.esco_labels;
-- Expected size afterwards: ~150 MB (rows 53 MB, unique 63 MB, typeahead 36 MB, concept 5 MB) from 408 MB.
