# Labour-Market Statistics — Source Registry (v1)

> **Binding rule.** No public-facing number on Labourmarket.ai may be shown
> without a cited source from this registry. Every published figure carries:
> **source · figure date · country / region · last checked**. No invented
> claims, ever. (Aligns with `PLATFORM_DOCTRINE.md` §7 — no fake data.)

This registry is the **allowed-source allowlist** for any labour-market
statistic, chart, or "market signal" that we ever surface publicly (homepage,
country pages, sector pages, reports). Until a figure is backed by one of these
sources with full provenance, it stays a **clearly-labelled placeholder** (the
homepage market sparklines are already rendered behind a visible `Placeholder`
marker — see `app/[locale]/(marketing)/page.tsx`).

## Allowed sources

| # | Source | What it provides | Geography | URL |
|---|--------|------------------|-----------|-----|
| 1 | **Eurostat — Labour market statistics** | Employment, unemployment, job vacancy rate, labour cost — official EU statistics | EU + EEA, by country | https://ec.europa.eu/eurostat/web/lfs |
| 2 | **EURES — Labour shortages & surpluses report** | Annual occupation-level shortage / surplus lists | EU/EEA member states | https://eures.europa.eu/labour-shortages-and-surpluses_en |
| 3 | **Cedefop — Skills Forecast / Skills-OVATE** | Medium-term skill demand forecasts, online vacancy analysis | EU, by country & sector | https://www.cedefop.europa.eu/en/tools/skills-forecast |
| 4 | **Eurofound** | Labour shortages, skills mismatch, job-quality indices | EU | https://www.eurofound.europa.eu/ |
| 5 | **OECD — Employment & Skills Outlook** | Employment outlook, skills outlook, skills-for-jobs database | OECD members | https://www.oecd.org/employment/ |
| 6 | **National statistics offices** | Authoritative country-level figures for country pages | Per country (e.g. LT: https://osp.stat.gov.lt, EE: https://www.stat.ee, LV: https://stat.gov.lv) | per office |

> National-office figures (row 6) are the **preferred source for a single
> country page**; EU-level sources (rows 1–5) are preferred for cross-country
> comparison so the methodology is consistent.

## Provenance rules (per published figure)

1. **Source** — must be one of the rows above (by name + URL).
2. **Figure date** — the reference period the number describes (e.g. "2025 Q3",
   "2024 annual"). Never publish a number whose period is unknown.
3. **Country / region** — the exact geography the number covers. Never imply
   EU-wide from a single-country figure, or vice-versa.
4. **Last checked** — the date we last verified the figure against the source.
   Homepage / page data must show a **"last updated"** stamp, or be marked as a
   placeholder.
5. **No derivation without disclosure** — any computed figure (ratio, index,
   our own aggregation) states the inputs and that it is derived.

## Refresh & honesty

- Figures are **refreshed on a stated cadence** or visibly marked stale.
- If a source revises a figure, we update the "last checked" stamp.
- A figure that cannot currently be sourced is **removed or shown as a
  labelled placeholder** — it is never left to read as a real platform metric.

## How to add a number to a public surface

1. Pick the figure + source row from the table above.
2. Record `source`, `figure date`, `country/region`, `last checked`.
3. Render it with a visible provenance line + "last updated" stamp.
4. If any of the four fields is missing → **do not publish**; keep the
   placeholder.

_Registry v1 — created for Recognition v1.1 + Whole Labour Market Correction.
Extend the table only with sources of comparable authority._
