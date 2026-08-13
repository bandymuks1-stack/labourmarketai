# ESCO_STORAGE_OPTIMIZATION_PLAN (V9 §20)

Date: 2026-08-13. Basis: production DB measurements (VERIFIED_DB) + code audit @ ee3d159d.
STATE: PLAN ONLY. No production index/row change executed. Every action below is a RED
migration category → OWNER_GATED. Owner absent → nothing applied.

## MEASURED FACTS
- DB total 500 MB. esco_labels 408 MB = 82% (heap 132 MB, indexes 275 MB; 1,045,186 rows, 28 locales).
- Runtime queries only ever request locale ∈ {lt,en,nl,de,ru}; ru never matches (ESCO has no Russian).
- 585,863 rows (56.1%) sit in 17 locales no code path, route, catalog, or guard can ever request
  (ar bg cs el es fr ga hr hu is it mt pt ro sk sl uk + none needed for fi? fi IS kept — keep-set
  is the 11 catalog locales minus ru plus fi).
- esco_labels: no FK in/out; never written at runtime (import script only, manual, upsert-only);
  no guard asserts row/locale counts. service_role has NO delete grant (deliberate).
- Index truth: unique 5-col key 144 MB (the ON CONFLICT arbiter — REQUIRED for re-import);
  typeahead_idx 82 MB (query/index MISMATCH: query is `label ILIKE 'q%'`, index is
  `(locale, lower(label) text_pattern_ops)` — only the locale column ever helps; `concept_type`,
  filtered on every call, is absent from the index); surrogate uuid pkey 39 MB (1 lifetime scan,
  zero code references); concept_idx 11 MB (admin label resolution — fine as is).
- Stats window: since 2026-05-07 (3+ months) — usage numbers are trustworthy.
- IMPORTANT context: the 28-locale import was an EXPLICIT owner decision (2026-06-10, commit
  acdd4947): "recognize worker-entered skills in many European languages earlier." Pruning
  REVERSES that decision — it is the owner's call, not an engineering cleanup.

## ACTIONS (all OWNER_GATED; recommended order)

### A1 — Prune the 17 never-requested locales (biggest lever)
Saving: ~56% of heap+indexes ≈ ~230 MB after VACUUM/rebuild.
Change set (one migration + one code change, same PR):
  1. migration: DELETE FROM esco_labels WHERE locale IN (17 codes); then narrow the locale CHECK
     back to the 12 platform taxonomy codes minus ru (rollback file re-widens CHECK; data itself
     only restorable by re-import — the truly irreversible part);
  2. scripts/esco/import-esco.mjs LOCALES array narrowed identically (else next --apply re-inserts).
Regression risk: LOW technically (no consumer, no FK, no guard). STRATEGIC risk: reverses the
owner's early-recognition bet — if future recognition of e.g. Ukrainian/Polish-adjacent worker
input is planned, keep those locales. Alternative A1b: prune to a 17-keep set (add uk, cs?) —
owner chooses the keep list.

### A2 — Replace the typeahead index with one the query can use
Current: 82 MB, mismatch. Replacement: btree (locale, concept_type, lower(label) text_pattern_ops)
+ change searchEscoLabels to an RPC/raw path issuing lower(label) LIKE lower($q)||'%' ORDER BY
lower(label). Post-A1 size est. ~35-40 MB AND the query becomes genuinely indexed (today it
scans ~37k rows per locale per keystroke). Fully reversible. Also fixes UX latency headroom.

### A3 — Drop the surrogate uuid pkey; promote the 5-col unique to PRIMARY KEY
Saving: 39 MB pre-prune (~17 MB post-prune). Zero code references to esco_labels.id (verified).
Risk: LOW; PostgREST tooling needs A pk — the promoted natural key serves. Reversible.

### Combined estimate: 408 MB → ~120-140 MB (DB total ~500 → ~215-235 MB), while making the
only hot ESCO query faster. Execution order A1 → A3 → A2 (one maintenance window, rebuild once).

## NON-GATED TRUTH FIXES (safe now, code-only — shipped separately)
- lib/config/esco.ts:6-10 stale "esco_labels is empty / import not run" comment;
- components/app/esco-typeahead.tsx:14-15 stale "ships UNWIRED + flag-off";
- docs/product/esco-taxonomy-design.md:83-87 stale flag/state claims.

## WHAT THIS PLAN DOES NOT TOUCH
- esco_occupations/esco_skills/esco_occupation_skills (20+8 MB — small; occupation_skills has
  zero readers but is the ESCO relational core; revisit only if a real consumer never appears);
- the unique arbiter index (required);
- concept_idx (well-matched to the admin query);
- external vacancies (37 MB — separate audit concluded: not worth destructive action).
