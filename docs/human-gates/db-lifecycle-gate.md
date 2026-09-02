# Gates G-3 … G-6 — database lifecycle (OWNER_GATE)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train B2). **Register:** [`FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3.
**Nothing here has been executed.** The three migrations ship in a DRAFT `needs-human-gate` PR; each creates
machinery (or one reversible DDL) and applies no data change on its own. Numbers are production measurements
of 2026-09-02 (`docs/audits/p0-p1-auth-onboarding-latency-db-audit-2026-09-02.md` §F–J and re-measured here).

| Gate | Migration | What it does when applied | What it does NOT do | Reclaim | Reversal |
|---|---|---|---|---|---|
| **G-3** unused indexes | `20260902160100_public_vacancies_unused_indexes_v1.sql` | asserts both indexes still have 0 scans, then `DROP INDEX` `public_vacancies_fulltext_idx` (79 MB) + `public_vacancies_skill_slugs_idx` (1.5 MB) | touches no data | ≈ 80 MB now, ≈ −15 MB/week growth | `.down.sql` recreates both verbatim |
| **G-4** vacancy retention | `20260902160000_public_vacancy_retention_v1.sql` | creates `public_vacancy_retention_run_v1(p_grace, p_strip_text, p_dry_run)` — service-role only, **dry run by default**, not scheduled | deactivates / strips nothing until called with `p_dry_run := false` | stage 1: 0 bytes (flag only); stage 2: ≈ 87 MB text today at grace 0 | stage 1 reversible (statement in `.down.sql`); stage 2 irreversible (source does not re-serve expired ads) |
| **G-5** ESCO locale scope | `20260902160200_esco_labels_locale_scope_v1.sql` | creates `esco_labels_prune_locales_v1(p_keep, p_dry_run)` — service-role only, dry run by default, refuses a keep-list without `en` | deletes nothing until called with `p_dry_run := false` | ≈ 575 k rows / ≈ 235 MB after VACUUM | re-import: `node scripts/esco/import-esco.mjs --locales …` (idempotent) |
| **G-6** plan | — | decision only | — | — | — |

## Dry-run facts (2026-09-02)

- Vacancies: 70,767 flagged active; **25,635 past `expires_at`** (grace 0) ≈ 87 MB text; **0** past `expires_at` + 30 d
  (stream is 3½ weeks old — the first rows cross that line mid-September). All read paths already exclude expired
  ads (Train B1, #1420) — this gate is about storage and honest state, not about what users see.
- ESCO: 28 locales stored; product uses 12 (`lt en ru da de et fi lv nl no pl sv`). Outside scope: es 53 k, mt 52 k,
  ro 48 k, bg 41 k, el 39 k, sl 39 k, fr 37 k, hr 36 k, hu 35 k, it 34 k, cs 33 k, sk 33 k, pt 30 k, is 21 k, ga 19 k,
  ar 18 k, uk 17 k rows.
- Unused indexes: `public_vacancies_fulltext_idx` 79 MB / 0 scans; `public_vacancies_skill_slugs_idx` 1.5 MB / 0 scans
  (since 2026-08-09). `esco_labels_concept_type_concept_id_locale_label_label_type_key` (144 MB) is USED (1.0 M scans) — not a candidate.

## Owner decisions (each independent)

1. **G-3:** approve apply of the index-drop migration (reversible DDL). Yes/No.
2. **G-4:** approve apply of the retention function, and choose the run policy:
   grace (30 d recommended), stage 1 only or stage 1 + 2 (text strip, irreversible), manual runs or a later schedule.
3. **G-5:** approve apply of the prune function, and confirm the keep-list (12 locales above; add any locale the
   product must recognise before launch — Georgian is not in ESCO).
4. **G-6:** Free-with-cleanup vs Pro (recommendation in `docs/operations/capacity-thresholds-v1.md` §4: Pro regardless,
   for PITR + custom auth domain; the cleanups remain worth doing).

## Execution once approved (agent)

Apply via Supabase MCP `apply_migration` in ledger order after CI is green; run the dry run first, record the
returned counts in the register; run the real call only for the approved stages; re-measure `pg_database_size`
and `pg_stat_user_indexes`; VACUUM (autovacuum reclaims heap; `pg_repack`/`VACUUM FULL` needs a lock window and a
separate decision). Record before/after in the register §4.
