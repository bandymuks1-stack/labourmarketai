# ESCO_STORAGE_OPTIMIZATION_PLAN v2 (V10 §21-22 — supersedes v1's A1)

OWNER DIRECTIVE (V10, 2026-08-13): DO NOT delete ESCO languages. "Currently unused" ≠ "unneeded";
the platform direction is broader multilingual Europe. v1's A1 (prune 17 locales) is WITHDRAWN.
Optimization must preserve full 28-language capability.

## Facts (unchanged, VERIFIED_DB)
Measured sizes are kept in the owner's private record (note ref: sha256 f29ec6a9…2aaf). In order of size:
esco_labels is mostly indexes; the unique 5-col arbiter is the largest (required for re-import),
then typeahead_idx (query/index MISMATCH — `label ILIKE` cannot use the `lower(label)` expression;
only leading `locale` column helps; `concept_type` filtered on every call but absent from index),
surrogate uuid pkey (zero references, 1 lifetime scan), concept_idx (small, well-matched).
Tables never written at runtime (import script only) → index maintenance cost irrelevant.

## REVISED ACTIONS (all preserve every language; all RED migrations → OWNER_GATED)

### B1 — Replace typeahead index with one the query actually uses (biggest SAFE win)
New: btree (locale, concept_type, lower(label) text_pattern_ops) + switch searchEscoLabels to an
RPC issuing `lower(label) LIKE lower($q) || '%' ORDER BY lower(label) LIMIT 10`.
Effect: the old index goes, a slightly larger new one (3 cols, all rows) comes... NET ≈ neutral
on disk BUT the query becomes genuinely indexed (today: a full locale scan per keystroke).
Disk-lean variant B1b: PARTIAL index per §22.7 — index ONLY label_type='preferred' rows if the
typeahead query filters preferred (verify query semantics first; if typeahead should search all
label types, skip B1b). Preferred-only would cover ~1/4-1/3 of rows → a much smaller index, all 28
languages intact. RECOMMENDED: B1 + B1b evaluation at implementation time.

### B2 — Drop surrogate uuid pkey; promote the 5-col unique to PRIMARY KEY
Saves the pkey index, zero code references, all languages intact, reversible. UNCHANGED from v1 (was A3).

### B3 — Cold/hot split WITHOUT deletion (archival strategy, §22.11)
Move the 17 currently-unrequested locales' rows to `esco_labels_cold` (same schema, minimal
indexes: arbiter only). Hot table keeps 11 platform locales → hot indexes shrink ~56%;
capability preserved (a locale promotion = move rows back or UNION view; importer writes to the
right table by locale list). Estimated: a large net saving (cold rows keep the arbiter only, no
typeahead/pkey) with ZERO language loss. More moving parts than B1/B2 —
recommend ONLY if storage pressure becomes real (Supabase free tier cap is 500 MB —
owner should confirm plan headroom first).

### Order of value: B2 (trivial) → B1/B1b (performance + a possible saving) → B3 (only
if headroom pressure demands). 28 languages intact in every option.

## Explicitly rejected: any language dataset reduction (owner directive).


## v3 — 2026-10-17 owner decision: cold locales live on the VPS (decision 0026)

The directive "DO NOT delete ESCO languages" stands as a rule about the DATASET: all 28 languages
remain owned, restorable and readable. What changed is WHERE the cold half is stored while the
project is on the Supabase Free plan (500 MB allowance; the database was over it on 2026-10-17):

- Hot in Supabase: the 11 UI locales (da de en et fi lt lv nl no pl sv).
- Cold on the Agentai VPS: the other 17 locales (over half of the rows), age-encrypted gzip JSONL
  (`ops/vps/lm-archive-table.sh`), sha256 + decrypt-verified, restorable row-for-row with
  `--restore` (PostgREST upsert on the importer's unique key, idempotent) and readable in place
  with `--grep`. The official ESCO files remain a second restore source.
- B2 (drop the surrogate uuid pkey) is applied in the same RED migration
  (`20261018100000_esco_labels_cold_locales_on_vps_v1.sql`, paired `.down.sql`). B1/B1b stay open
  (performance, not storage). B3 as an in-Supabase cold TABLE was rejected for this plan: it keeps
  the bytes inside the quota.
- Expected: esco_labels shrinks to roughly a third after `vacuum full` + `reindex` (both owner-gated).
  Measured sizes: owner's private record (note ref: sha256 f29ec6a9…2aaf).
- The guard `esco-dataset-is-preserved.test.ts` allows exactly this migration (ARCHIVE-VERIFIED
  marker + decision reference) and still refuses any other delete.
