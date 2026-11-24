# Step 2 — Evidence Verification & Hardening

> Every public evidence item was re-verified against its live official source on
> **2026-06-13**. Figures, `figureDate`, `region`, `value` and `methodNote` were
> tightened to the latest published numbers. Source of truth:
> `apps/web/lib/labour-market/evidence.ts` + `sources.ts`. Enforced by
> `lib/guards/labour-market-evidence-provenance.test.ts`.

## Verified evidence set (6 items)

| id | Figure (now precise where possible) | Source | figureDate | region | lastChecked |
|---|---|---|---|---|---|
| `employment-participation` | EU employment rate (20–64) **75.8%** in 2024, record since 2009 (>76% in 2025) | Eurostat LFS — [ddn-20250415-1](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20250415-1) | 2024 annual | EU | 2026-06-13 |
| `shortage-occupations` | Long-standing shortages: healthcare, construction, hospitality + engineering/IT; 2024 focus transport & storage (drivers) | EURES / ELA — [shortages 2024](https://www.ela.europa.eu/en/publications/labour-shortages-and-surpluses-europe-2024) | 2024 report (pub Jun 2025) | EU/EEA + NO/IS/CH | 2026-06-13 |
| `skills-mismatch` | **46%** of EU SMEs found it (very) hard to find right-skilled staff (~70% of those hiring) | European Commission — [Eurobarometer SME skills](https://single-market-economy.ec.europa.eu/news/eurobarometer-smes-and-skill-shortages-2024-03-14_en) | 2024 Eurobarometer | EU | 2026-06-13 |
| `digital-skills-demand` | ~9/10 jobs will need digital skills; only **55.6%** of EU adults have basic digital skills | Cedefop — [Digital skills ambitions](https://www.cedefop.europa.eu/en/publications/4218) | 2024 | EU | 2026-06-13 |
| `demographic-pressure` | **22 of 27** EU countries projected: working-age (20–64) decline by 2050; dependency ratio rising | Eurostat — [ddn-20251001-2](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20251001-2) | projections (2024 base) | EU | 2026-06-13 |
| `labour-mobility` | ~10.1M EU citizens work abroad; **1.83M** cross-border workers; movers' employment 78% vs 76% | European Commission — [Intra-EU Labour Mobility 2024](https://employment-social-affairs.ec.europa.eu/annual-report-intra-eu-labour-mobility-2024_en) | 2024 ed. (pub Feb 2025) | EU/EEA | 2026-06-13 |

## What changed vs Step 1

- **Numbers added where verifiable.** Step 1 was mostly qualitative. Four of six
  items now carry a precise `value` (75.8%, 46%, 55.6%, 22-of-27, 1.83M), each
  with a `methodNote` naming the report + reference period.
- **`lastChecked` is now a genuine verification date** (the source URLs were
  opened and the claims confirmed against current reporting), not a compilation
  date.
- **Per-item `sourceUrl`** added — each card links the EXACT report/news page for
  its figure, not just the source landing page (guard-enforced https).
- **New source registered:** European Commission (Eurobarometer + Intra-EU
  Mobility report) so the SME skills and mobility figures are precisely attributed.
- **Skills-mismatch card upgraded** from a qualitative Eurofound statement to the
  46% EC Eurobarometer figure (Eurofound stays registered as an allowed source).

## Localization (fix before merge)

Evidence card prose was English-only and rendered on every locale — a bug. Fixed:
all user-facing text (title, summary, figureDate, region, unit, methodNote,
source link label, disclaimer) now lives in `messages/{locale}/labour-market.json`
under `evidence.<id>.*` / `sourceLabel.*` / `evidenceDisclaimer`, and the card
renders by locale key. **lt + ru fully translated; en stays English.** The typed
`evidence.ts` keeps only locale-neutral provenance (numeric `value`, ISO
`lastChecked`, the real `sourceUrl`, `sourceId`, `claimType`). The real source
hrefs are unchanged. The 8 inactive locales carry `[EN]`-marked evidence content
(honest untranslated marker; these dir files are outside i18n-debt scope, so no
regression). Guards: `labour-market-evidence-i18n.test.ts` (every active locale
localized; LT/RU contain no English card phrases and differ from EN).

## Honesty caveats (still true)

- `lastChecked` reflects verification against **published reports**, not a live
  API. The on-page disclaimer tells users to open the source for the latest number.
- Evidence card titles/summaries remain **English-only** (authoritative source
  language); only the UI chrome is localized (en/lt/ru). Translating nuanced
  statistical statements risks accuracy — deferred deliberately.
- No LT/RU-specific national statistics were invented; country-level cards (LT/EE/LV
  statistics offices) are a future Step 3.

## Sample "Market intelligence" sparkline section

**Removed.** The demand/workers/competition sample sparklines + top-skills
placeholder were illustrative sample series; on a now source-backed page they read
as fake trendlines. The real `LabourMarketEvidence` module supersedes them. The
`market.*` i18n keys are kept for a future restore with REAL provenanced series.
Enforced by `lib/guards/public-evidence-integrity.test.ts` (no Sparkline without an
illustrative/provenance label; no hardcoded sample series).

## Construction diversification

Public sample personas were spread across sectors (logistics, care/health,
hospitality, retail, cleaning, IT, manufacturing, transport, customer service);
construction remains as **one** example (1 of 4 featured cards; a minority of the
draft board). Updated: `content/placeholders.ts` (ROLES, PROJ, featured player
cards, draft board, market-pulse hot skills, micro-activity feed, ticker, agency
pool, top-skills) + two construction-only message placeholders (company-name and
role-title) in en/lt/ru. Enforced by `public-evidence-integrity.test.ts` +
existing `product-readiness.test.ts`.
