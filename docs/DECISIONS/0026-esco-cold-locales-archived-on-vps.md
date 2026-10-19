# 0026 — ESCO cold locales are archived on the VPS, not deleted (2026-10-17)

**Status:** owner decision 2026-10-17 ("ESCO B variantas"). Amends, does not revoke, the
2026-08-13 directive restated 2026-09-07 ("DO NOT delete ESCO languages").

## Context

The production Supabase project is on the Free plan (500 MB database allowance, 1 GB log
ingestion). On 2026-10-17 the database held 1,103 MB; `esco_labels` alone was 408 MB
(1,045,186 labels in all 28 official ESCO v1.2.1 languages: 132 MB of rows, 275 MB of indexes).
The product reads labels only in its UI locales (`da de en et fi lt lv nl no pl sv`; `ru` is a
UI locale but ESCO has no Russian): every lookup pins the viewer's locale
(`lib/esco/esco-lookup.ts`). The other 17 locales (585,863 rows) are platform content that no
surface reads today. The quota deadline is 2026-10-20 and the budget rule is 0 € extra.

## Decision

1. The 17 non-UI locales are **archived on the Agentai VPS** as age-encrypted gzip JSONL
   (`ops/vps/lm-archive-table.sh esco_labels "locale=not.in.(…)" esco-other-locales`), verified
   by sha256 and a decrypt-and-count pass, under `/root/lm-prod/backups/` (700/600). The private
   key stays on the VPS (600) with an offline owner copy.
2. After the archive is verified, the rows are removed from Supabase by the RED migration
   `20261018100000_esco_labels_cold_locales_on_vps_v1.sql` (applied by hand, owner-gated, with the
   paired rollback). The surrogate uuid primary key is dropped at the same time (plan item B2).
3. **No language or capability disappears.** Restore is a documented, tested command
   (`lm-archive-table.sh --restore <archive> esco_labels concept_type,concept_id,locale,label,label_type`),
   idempotent through the importer's own unique key, and the official ESCO files re-import
   every locale. Reading the cold set without restoring is `lm-archive-table.sh --grep`.
4. Promoting a locale to the UI later = restore that locale (one command) + the usual i18n work.
   The platform direction "broader multilingual Europe" is unchanged; what changed is **where**
   the cold half is stored while the project is on the Free plan.

## Guard

`lib/guards/esco-dataset-is-preserved.test.ts` keeps forbidding `delete from esco_labels` in
migrations, with exactly one exception: a migration that carries the `ARCHIVE-VERIFIED:` marker
and references this decision. `docs/operations/esco-storage-optimization-plan.md` v3 records the
amendment.

## Reversibility

Rollback file recreates the primary key; the archive restores the rows byte-for-byte. Verified
on 2026-10-17 by restoring a sample of archived rows while they still existed in Supabase
(merge-duplicates upsert, zero changes) — the path works end to end before anything is removed.
