# EXTERNAL_JOB_SUPPLY_AUDIT_V1

Date: 2026-08-13. Basis: origin/main `8ef80460` (code), production DB read-only measurements (VERIFIED_DB), provider terms as recorded in repo docs.
State: FACTUAL AUDIT — no destructive action taken, none proposed for autonomous execution.

## CURRENT_MODEL

One table `public.public_vacancies` + `public.vacancy_import_cursors`
(migration `20260809160000_public_vacancy_persistence_v1.sql`, rollback present).
Pipeline: keyless GET-only adapter → JSON-lines stream parse → normalize/categorize/hash/dedup →
gate → chunked upsert (200-id existence reads / 500-row writes). Operator-run only
(server action or CLI with `--apply --i-understand-this-writes-production`); scheduled cadence
workflow merged INERT (#1144), CONFIGURATION_GATED. No DELETE path exists anywhere in code.

## CURRENT_ROW_COUNT (VERIFIED_DB 2026-08-13)

- 7092 rows total, 7088 active; provider only `arbetsformedlingen`
- max(last_seen_at) = 2026-08-13 06:13Z (fresh same-day; freshness decays without cadence)

## CURRENT_STORAGE_FOOTPRINT (VERIFIED_DB)

- `public_vacancies` TOTAL 37 MB — heap 7.3 MB, indexes 15 MB, TOAST rest
- `description_raw` ≈ 14 MB (avg 3150 chars/row) — the dominant column
- translation_* columns: 0 translated rows (translated text all NULL; no provider configured — €0 spend)
- **Context that reframes the concern:** whole DB = 500 MB, of which `esco_labels` = 408 MB
  (1,045,186 rows; heap 132 MB, **indexes 275 MB** — typeahead_idx 82 MB @ 162 scans,
  pkey 39 MB @ 1 scan vs the working unique index 144 MB @ >1M scans).
  External vacancies are NOT the storage problem; ESCO label indexes are.

## FIELDS_STORED vs FIELDS_ACTUALLY_USED

45 columns written. Load-bearing set (evidence = live consumer):

- REQUIRED_FOR_SEARCH: title_raw, description_raw (ILIKE + fulltext GIN; **never rendered** — no detail view exists), employer_name
- REQUIRED_FOR_MATCHING: skill_slugs, profession_slug, country, city, compensation_currency/max, required_languages, start_date
- REQUIRED_FOR_FILTER: country, profession_slug, is_active
- REQUIRED_FOR_DEDUP: provider_key, external_id, content_hash
- REQUIRED_FOR_FRESHNESS: lifecycle, published_at, expires_at, last_seen_at, is_active
- REQUIRED_FOR_REDIRECT: application_url
- REQUIRED_FOR_LEGAL_PROVENANCE: attribution_code (per-row redundant — constant per provider; guard-pinned), provider_key
- display-only: positions, compensation_min
- UNNECESSARY (written, zero readers): channel, source_language, employer_external_org_id,
  employer_homepage, region, lat, lng (matching distance check dead — radiusKm forced null),
  compensation_description, employment_form, working_time, captured_at, occupation_raw,
  occupation_concept_id, categorization_origin, all five translation_* columns,
  transform_version, request_ref, import_session_id (audit-only), first_seen_at, updated_at, id (surrogate)
- translation_status: RESOLVED (VERIFIED_DB) — all 7092 rows = 'unavailable', exactly as code implies; translated TEXT columns are the NULL ones. No reader exists either way.

## RAW/FULL PAYLOAD STATUS

No raw JSON payload is persisted. description_raw is stored full-text but used only for search
indexing and import-time categorization; the product renders card fields only. No images, no documents.

## SEARCH / MATCHING / LANDING / LMI DEPENDENCIES

- SEARCH: `searchPublicVacancies` (is_active + expiry window, ILIKE title/description, country/profession filters, order published_at desc)
- MATCHING: external ads converted via `buildNeedFromVacancy` into the SAME MatchNeed as native demand; same `matchWorkerToNeed` + comparator + MatchTierExplanation. SEK pay never fake-converted (gap `pay_not_comparable`)
- LANDING: **zero** landing/public dependencies. No hardcoded 7092 anywhere in code. anon has no grant (RLS revoked) — public counts impossible today
- LMI: **zero** — intelligence pipeline is Eurostat-only; no aggregation over public_vacancies exists

## SOURCE_TERMS (as recorded in repo; not re-verified externally)

- Provider-confirmed 2026-08-04: APIs free, keyless, no prior notification, data **CC0**; attribution *requested* by provider, REQUIRED by our product policy (registry comment + `docs/human-gates/arbetsformedlingen-activation-gate.md`)
- Republishing: recorded as permitted with truthful provenance (`docs/product/public-vacancy-source-pipeline-v1.md` §5)
- Withdrawal: "a removed ad must stop being findable the moment the publisher withdraws it" — IMPLEMENTED (soft-deactivate; RLS hides inactive from all but service_role)
- NOT recorded anywhere: retention/caching time limit, purge obligation, provider ToS URL/captured licence text; `public_vacancies` absent from `docs/legal/data-retention-matrix-v1.md`
- → indefinite retention of expired/withdrawn ad content is our policy gap, not a recorded provider requirement: **LEGAL_DECISION_REQUIRED** (retention period for inactive external ads; recommend adding a row to the retention matrix)

## MANDATORY_ATTRIBUTION

Rendered on every card and compact row ("Source: Arbetsförmedlingen (JobTech Development)…"), guard-pinned (`vacancy-source-boundary.test.ts`). COMPLIANT.

## CURRENT APPLY FLOW vs OWNER DECISION

Current: plain `<a>` "Open the original advertisement ↗" (`target=_blank`, noopener noreferrer nofollow), prose disclosure only, **no user-confirm step**.
Owner decision (§4, 2026-08-13): KANDIDATUOTI → inform "application continues on another portal" → USER CONFIRMS → redirect.
→ GAP: add a confirmation step. Also §3/§4: native and external render as two separate sections
with heading "Public job advertisements" — same engine/explanation already shared; the sectional
split + heading is a candidate for unification (no legal barrier recorded; CC0 + attribution
carried on-card). Provenance must stay.

## TARGET MINIMAL MODEL (design, not executed)

Keep: identity/dedup (provider_key, external_id, content_hash), search (title_raw, description_raw
OR a bounded search_text derivative), matching signals (skill_slugs, profession_slug, country, city,
compensation_currency/min/max, required_languages, start_date, positions), freshness/lifecycle
(lifecycle, is_active, published_at, expires_at, last_seen_at), redirect (application_url),
provenance (attribution_code or provider-level constant), employer_name.
Drop candidates (~20 columns, all zero-reader): channel, source_language, employer_external_org_id,
employer_homepage, region, lat/lng, compensation_description, employment_form, working_time,
captured_at, occupation_raw, occupation_concept_id, categorization_origin, translation_* (5),
transform_version, request_ref, updated_at. Keep import_session_id ONLY if audit provenance is
wanted (currently zero readers but cheap).

## ESTIMATED RESOURCE REDUCTION

Honest estimate: dropping the zero-reader columns saves LOW single-digit MB (most are small/NULL);
description_raw (14 MB) is REQUIRED_FOR_SEARCH and should stay while search is a product feature.
Real levers, in order: (1) esco_labels index review (~120+ MB potential; index changes = migration
RED category → OWNER_GATED), (2) inactive-ad retention policy (bounds future growth; currently
rows accumulate forever), (3) column pruning (small, cosmetic).
Conclusion: the external supply is NOT a material storage burden today; do not spend a destructive
migration on ~5 MB while esco_labels holds 408 MB.

## NON-DESTRUCTIVE CHANGES POSSIBLE NOW (safe, code-only)

1. External apply confirmation step (owner decision §4) — UI-only, i18n 5 locales.
2. Admin `readVacancySourceHealth` full-row fetch (~7k rows per admin render) → `count:"exact", head:true`.
3. Fix stale/contradictory records: `intelligence.sources.terms.arbetsformedlingen` copy ("Usage
   terms not reviewed yet… Nothing is fetched today" — false since 2026-08-09) in all 11 catalogs;
   `vacancy-read.ts` header ("table DOES NOT EXIST YET"); `product-readiness.test.ts:2010` comment
   ("open to anon" — contradicts migration).
4. Stop WRITING the always-NULL translation_* + dead columns in `toPublicVacancyRow` — NOT safe as
   code-only (columns are NOT NULL-free but schema unchanged is fine; however keeping writes is
   harmless) → defer to the pruning migration decision instead. NO ACTION now.

## MIGRATION_REQUIRED / DESTRUCTIVE_ACTION_REQUIRED

- Column pruning: DROP COLUMN migration — DESTRUCTIVE → **OWNER_GATED** (and low value; see above)
- Inactive-ad retention (rolling delete of withdrawn/expired rows): data DELETE → **OWNER_GATED + LEGAL_DECISION_REQUIRED** (retention matrix row missing)
- esco_labels index review: migration RED category → **OWNER_GATED**
- The 7092 rows: **DO NOT DELETE** (owner directive §8) — no action taken, none planned

## OWNER/LEGAL GATES SUMMARY

1. OWNER: approve/deny column-pruning migration design (recommendation: SKIP — negligible saving)
2. OWNER: esco_labels index review (recommendation: YES — biggest storage lever, needs RED migration gate)
3. LEGAL: retention period for inactive external ads + retention-matrix row for public_vacancies
4. OWNER (product): unify external/native sections into one list per ONE JOB MARKET doctrine
   (confirmation step ships regardless as UX safety; unification is a product-visual decision)
