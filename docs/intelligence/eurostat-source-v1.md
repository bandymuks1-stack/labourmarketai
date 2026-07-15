# Eurostat Labour Intelligence Source v1

The first EXTERNAL, supranational intelligence source: official Eurostat
labour-market aggregates, connected as a deterministic, explainable,
reversible, privacy-safe read layer over the existing observation contract.

Eurostat publishes **periodic official statistics**, not live vacancies.
Nothing here is a job offer, a live vacancy count, employer-specific demand,
a LabourMarket.ai internal average, a salary offer, or a person-level fact.

## 1. Official access boundary

- **Only** the official European Commission / Eurostat dissemination API is
  used, over HTTPS, from the single hard-coded origin `https://ec.europa.eu`
  (`/eurostat/api/dissemination/statistics/1.0/data/<dataset>`).
- Format: **JSON-stat 2.0** (the API's sole format). No SDMX needed for v1.
- Authentication: none (the API is unauthenticated — no secret is stored).
- No HTML scraping, no third-party mirrors, no unofficial wrappers, no
  browser automation, no search snippets. The adapter builds every request
  from the pinned dataset contract — no caller-supplied endpoint or
  parameter, no generic proxy.
- Conservative application limits (Eurostat publishes no numeric rate limit;
  absence is not permission): sequential requests, ≥1.5 s spacing, ≤30
  req/h, 30 s timeout, 5 MB response cap, ≤2 bounded retries with backoff
  (4xx never retried). Large extractions (HTTP 413) are avoided by tight
  `geo` + `lastTimePeriod` filters.

Code: `apps/web/lib/eurostat-import/eurostat-adapter.ts` (server-only fetch),
`apps/web/lib/intelligence/eurostat-jsonstat.ts` (pure parser).

## 2. Legal / reuse basis

Eurostat data reuse is authorised for commercial and non-commercial purposes
**provided the source is acknowledged** — Commission Decision of 12 December
2011 (2011/833/EU) and the Eurostat copyright notice. Attribution used:
**"Source: Eurostat"** (i18n `intelligence.eurostat.attribution`), with no
implication of endorsement or partnership by Eurostat or the European
Commission, and no EU institutional logos.

Known EXCEPTION: commercial reuse is not granted for some **non-EU/EFTA
third-country** aggregates and third-party-rights content. This integration
avoids the exception entirely by an **EU/EFTA-only geography allowlist**
(`EUROSTAT_GEO_ALLOWLIST`) and by importing only Eurostat's own official
statistics (ESTAT), never third-party embedded content.

Reviewed against the live API + copyright notice on 2026-07-15; recorded in
`apps/web/lib/intelligence/eurostat-activation-facts.ts`.

## 3. Selected datasets (first slice — four, the owner max)

| Dataset code | Official title | Metric key | Unit | Freq | Pinned dims |
|---|---|---|---|---|---|
| `lfsi_emp_q` | Employment and labour force by sex and age — quarterly | `labour.employment_rate` | `pc_pop` (% pop 20–64) | Q | indic_em=EMP_LFS, s_adj=SA, sex=T, age=Y20-64, unit=PC_POP |
| `une_rt_m` | Unemployment by sex and age — monthly | `labour.unemployment_rate` | `pc_act` (% labour force) | M | s_adj=SA, age=TOTAL, sex=T, unit=PC_ACT |
| `ei_lmjv_q_r2` | Job vacancy rate — quarterly | `labour.job_vacancy_rate` | `pc_posts` (% of posts) | Q | s_adj=SA, nace_r2=B-S, sizeclas=TOTAL, indic=JVR |
| `lc_lci_r2_q` | Labour cost index by NACE Rev. 2 — nominal, quarterly | `labour.cost_index_yoy` | `pch_yoy` (% YoY) | Q | unit=PCH_SM, s_adj=CA, nace_r2=B-S, lcstruct=D1_D4_MD5 |

Dimension codes were pinned against live official API responses on
2026-07-15. Each dataset → exactly one metric key → exactly one unit
(`EUROSTAT_METRIC_EXPECTED_UNIT`); a contradictory unit fails closed in
observation validation (`metric_unit` check).

## 4. Geography policy (supranational source)

`EUROSTAT_GEO_ALLOWLIST` = EU/EA aggregates (`EU27_2020`, `EA20`) + 27 EU
members + 4 EFTA (`CH`, `IS`, `LI`, `NO`). Uses Eurostat's `EL` for Greece
(never ISO `GR`). Two-letter geos ride in `geo.country`; aggregates carry an
honest `null` country (their identity lives in `subject_id`). No national
statistics API is ever called; no Eurostat figure is labelled as
nationally-sourced.

## 5. Comparability & revisions

Comparison identity = metric + unit + geo + window + pinned dimensions
(seasonal adjustment, NACE, sizeclass, age, sex). The parser rejects the
whole response if any pinned dimension drifted from the query
(`dimension_drift`) — a value that does not mean what the metric means is
never imported. Revisions: a corrected Eurostat value with the same identity
and period but a new value produces a NEW observation with a new
`content_hash`; the old row is superseded via `valid_to` (append-preferred,
service-role update only). History is never overwritten. The existing
observation model represents this without a schema change.

## 6. Status flags (never silently discarded)

Confidential/suppressed markers (`c`, `:`, `n`) → the cell is **rejected**,
never zeroed. Disclosed flags (provisional `p`, estimated `e`, break `b`,
definition-differs `d`, forecast `f`, low-reliability `u`) → the value is
imported WITH the flag preserved in provenance. A missing value stays
missing — it is never converted to zero.

## 7. Metric architecture & import policy

Canonical vocabulary extended by four keys (`metric-keys.ts`), each
non-salary with a fixed unit binding. The eurostat import policy
(`EUROSTAT_METRIC_IMPORT_POLICY` / `EUROSTAT_ACTIVATION_FACTS.importPolicy`)
lists ONLY: the four dataset→metric mappings, four units, allowed
frequencies, EU/EFTA geographies, `maxPeriodsPerSeries=24`,
`maxAcceptedPerSession=5000`, `maxSessionsPerDay=1`. No wildcard, no prefix,
no "all datasets". A metric key alone is insufficient — the source's
recorded policy must permit it (fail-closed dual gate).

## 8. Provenance & evidence

Every accepted observation carries: the exact official request URL
(`source_url`), dataset code + label, the pinned dimension identity, the
resolved geo code + label, the official publication timestamp (`updated` →
`captured_at`, the idempotency anchor), the raw response sha256, and a
locally recomputed `content_hash`. Each import session records request
identity, dataset code, normalized dimensions, retrieval time, response
hash, parser version, record counts and status flags — reproducible without
an uncontrolled data lake, no secrets (none exist).

## 9. Activation gates (ten) — eurostat only

`source-activation.ts` evaluates the ten requirements against
`EUROSTAT_ACTIVATION_FACTS`:

| Gate | Evidence |
|---|---|
| owner_approval | This task's explicit owner authorization (2026-07-15) |
| technical_approval | Adapter + parser + live dry-run in the PR |
| legal_approval | `profile.legalStatus="confirmed"` at activation (2011/833/EU + attribution) |
| robots_check | `not_applicable` — official statistics API (documented exemption) |
| terms_review | Eurostat copyright notice reviewed 2026-07-15 |
| rate_limits | 30 req/h, 5 MB/fetch, 5000/session |
| import_policy | 4 metrics, EU/EFTA countries, `en`, 1 session/day |
| retention_policy | 400-day TTL, `mark_expired` |
| rollback_plan | `docs/intelligence/eurostat-source-v1.md#rollback-and-kill-switch` |
| kill_switch | Implemented + tested (`eurostat-kill-switch.ts`) |

With the SHIPPED profile (off/unconfirmed) `legal_approval` is honestly RED
and readiness is `false` — the facts do not self-activate. All ten green
only once the owner confirms legal status and flips the profile (below).

## 10. Activation (owner runtime action — NOT shipped on)

The code registry keeps eurostat `off`/`unconfirmed`/`importPolicy:null` so
the "all external sources off" safety guard
(`lib/guards/intelligence-boundary.test.ts`) stays green and the merge is a
reviewable, non-activating change. Activation is a deliberate follow-up:

1. Owner records the DB governance row (Supabase, owner-run):
   `update public.market_intelligence_sources set legal_status='confirmed',
   activation='on', owner_approved_at=now(),
   import_policy='{"metric_keys":["labour.employment_rate",
   "labour.unemployment_rate","labour.job_vacancy_rate",
   "labour.cost_index_yoy"]}'::jsonb where source_key='eurostat';`
2. Owner flips the code registry profile (`source-governance.ts`) to
   `legalStatus:"confirmed"`, `activation:"on"`,
   `importPolicy: EUROSTAT_METRIC_IMPORT_POLICY`, and updates the
   `intelligence-boundary` guard's external-off expectation to carve out
   eurostat while keeping every other external source pinned off. (Dual gate:
   both DB and code, or validation refuses.)
3. Owner sets Vercel env `EUROSTAT_SOURCE_ENABLED=on` (and leaves
   `EUROSTAT_KILL_SWITCH` unset). Deploy.
4. Owner runs one bounded import (below).

## 11. First bounded import (≤4 datasets, ≤24 periods, ≤5000 rows)

`runEurostatImport({ mode: "persist", ... })` — adapter → parser →
`validateObservationCandidate` (same pipeline as the sandbox) →
`buildImportSession`/`buildImportReport` → service-role writer. The writer
routes through `validateExternalImport` (refuses unless eurostat is
confirmed+on) and inserts idempotently on the unique `content_hash`. No
scheduler, no recurring job, no automatic second run, no full backfill.

## 12. Rollback and kill switch

- **Kill switch** (`eurostat-kill-switch.ts`): `EUROSTAT_KILL_SWITCH=on`
  (env, no redeploy) or `EUROSTAT_SOURCE_ENABLED` unset immediately stops new
  requests → new sessions → new writes, in that order. It never deletes
  evidence. Tested (`eurostat-kill-switch.test.ts`).
- **Rollback** (provenance-scoped): each session's `rollbackRef` is
  `eurostat-import-session:<id>`; observations written by a bad session are
  removed by `source_key='eurostat'` + that session's provenance, leaving
  unrelated observations intact. Do not auto-reactivate after a rollback.

## 13. Product surface

The intelligence hub renders four honest **unavailable** Eurostat context
cards (employment / unemployment / job-vacancy / labour-cost) with visible
"Source: Eurostat" attribution and each card's exact dataset code. Until
activation + import they say WHY (source not activated), WHAT is required
(owner activation), WHICH source is off (eurostat), and WHAT changes after —
never a placeholder number, never "coming soon". No matching or ranking
score uses Eurostat; no Eurostat value is blended with internal averages.

## 14. Honest limitations

- Aggregates only — no occupation/skill/employer-level precision beyond what
  a selected dataset genuinely supports.
- Country figures come from Eurostat (harmonised), not national methodology.
- Quarterly/monthly cadence — not real-time; freshness SLA per dataset.
- Until owner activation, zero observations exist and every card is
  unavailable (the dry-run proves the pipeline, persists nothing).
