# Answer Engine — Translation QA & Freshness Policy v1

**Status:** Binding for the multilingual answer engine. **Date:** 2026-07-18.

## Fully-active locales
Every canonical question must be answered in **all fully-active public locales**:
**lt, en, ru, nl, de** (`activeLocales`; `defaultLocale = lt`, `x-default → lt`).
The 6 inactive locales (lv, et, da, no, sv, pl) are **not** part of the answer
engine and must never be indexed or entered in the sitemap.

## Translation QA model (per-locale `translationStatusByLocale`)
`TRANSLATION_PENDING → MACHINE_DRAFT → LOCAL_REVIEW_REQUIRED → HUMAN_APPROVED`.

- **No raw machine translation is published.** A locale answer reaches
  `READY_FOR_INDEX` only at `HUMAN_APPROVED` (or a Tier-appropriate reviewed
  state) for that locale.
- **Never leave an English answer under another locale.** A locale page renders
  only when that locale's body is real and reviewed; otherwise the locale is
  `noindex` and absent from the sitemap.
- **No partial-locale indexing, no two languages on one page, no locale-key
  leakage** into visible text.
- **Country-specific legal rules are localized per country context**, never
  transferred from one country to another (see the high-risk policy).
- Localization keeps the value in a per-locale map (TS/JSON outside
  `messages/*.json`), so it never touches the i18n-debt ratchet or the 11-file
  parity matrix.

## Freshness policy (`freshnessClass`)
- `evergreen` — product-usage / conceptual answers; review ≥ every 12 months.
- `slow` — professions, learning, mobility framing; review ≥ every 6 months.
- `volatile` — salaries, taxes, country legal/document rules, market data; review
  ≥ every 3 months, and re-verify sources before each publish.
- A page past its review window flips to `STALE` and is de-indexed until
  re-reviewed. `lastReviewedAt` is shown on every published answer.

## Indexing gate (restated)
Indexable ONLY when `contentStatus ∈ {READY_FOR_INDEX, PUBLISHED}` AND the
locale's `indexingStatusByLocale ∈ {READY_FOR_INDEX, PUBLISHED}`. Wave 0 ships
everything at `TRANSLATION_PENDING` / `NOT_READY` — nothing is indexable.
