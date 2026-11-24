# ESCO_STORAGE_OPTIMIZATION_PLAN v2 (V10 §21-22 — supersedes v1's A1)

OWNER DIRECTIVE (V10, 2026-08-13): DO NOT delete ESCO languages. "Currently unused" ≠ "unneeded";
the platform direction is broader multilingual Europe. v1's A1 (prune 17 locales) is WITHDRAWN.
Optimization must preserve full 28-language capability.

## Facts (unchanged, VERIFIED_DB)
esco_labels 408 MB (heap 132, indexes 275): unique 5-col arbiter 144 MB (required for re-import),
typeahead_idx 82 MB (query/index MISMATCH — `label ILIKE` cannot use the `lower(label)` expression;
only leading `locale` column helps; `concept_type` filtered on every call but absent from index),
surrogate uuid pkey 39 MB (zero references, 1 lifetime scan), concept_idx 11 MB (well-matched).
Tables never written at runtime (import script only) → index maintenance cost irrelevant.

## REVISED ACTIONS (all preserve every language; all RED migrations → OWNER_GATED)

### B1 — Replace typeahead index with one the query actually uses (biggest SAFE win)
New: btree (locale, concept_type, lower(label) text_pattern_ops) + switch searchEscoLabels to an
RPC issuing `lower(label) LIKE lower($q) || '%' ORDER BY lower(label) LIMIT 10`.
Effect: -82 MB old index, +~90-100 MB new (3 cols, all rows)... NET ≈ neutral on disk BUT the
query becomes genuinely indexed (today: ~37k-row scan per keystroke per locale).
Disk-lean variant B1b: PARTIAL index per §22.7 — index ONLY label_type='preferred' rows if the
typeahead query filters preferred (verify query semantics first; if typeahead should search all
label types, skip B1b). Preferred-only would cover ~1/4-1/3 of rows → ~30-40 MB index, all 28
languages intact. RECOMMENDED: B1 + B1b evaluation at implementation time.

### B2 — Drop surrogate uuid pkey; promote the 5-col unique to PRIMARY KEY
-39 MB, zero code references, all languages intact, reversible. UNCHANGED from v1 (was A3).

### B3 — Cold/hot split WITHOUT deletion (archival strategy, §22.11)
Move the 17 currently-unrequested locales' rows to `esco_labels_cold` (same schema, minimal
indexes: arbiter only). Hot table keeps 11 platform locales → hot indexes shrink ~56%;
capability preserved (a locale promotion = move rows back or UNION view; importer writes to the
right table by locale list). Estimated: hot 408→~180 MB + cold ~60 MB (arbiter only, no
typeahead/pkey) ≈ NET -170 MB with ZERO language loss. More moving parts than B1/B2 —
recommend ONLY if storage pressure becomes real (DB is 500 MB; Supabase free tier cap —
owner should confirm plan headroom first).

### Order of value: B2 (trivial, -39 MB) → B1/B1b (performance + possible -40 MB) → B3 (only
if headroom pressure demands). Combined realistic: -80 to -210 MB, 28 languages intact.

## Explicitly rejected: any language dataset reduction (owner directive).
