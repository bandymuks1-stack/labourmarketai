# Step 1 — Public Evidence Audit (every public claim + its source)

> Lists **every** labour-market statistic/claim rendered publicly by the Step 1
> evidence module, with its source, figure date, region and last-checked date.
> Source of truth: `apps/web/lib/labour-market/evidence.ts` (+ `sources.ts`).
> Enforced by `lib/guards/labour-market-evidence-provenance.test.ts` — no card
> can ship without full provenance.

**Honesty note.** Claims are written as **qualitative sourced statements**
(durable, true of the cited source's reporting) rather than precise numbers we
cannot verify live. `lastChecked = 2026-06-13` is the **compilation date from
published reporting, not a live fetch**. Re-verify against each source URL
before any external/marketing use (shown to users via the on-page disclaimer).

| # | Claim (id) | Type | Region | Source | Figure date | Last checked |
|---|-----------|------|--------|--------|-------------|--------------|
| 1 | Employment at record high (~75% age 20–64) — `employment-participation` | statistic (approx, methodNote) | EU | Eurostat — Labour Force Survey · https://ec.europa.eu/eurostat/web/lfs | 2024 annual | 2026-06-13 |
| 2 | Shortages span the whole labour market — `shortage-occupations` | shortage_signal | EU / EEA | EURES — Labour shortages & surpluses · https://eures.europa.eu/labour-shortages-and-surpluses_en | 2023–2024 report cycle | 2026-06-13 |
| 3 | Skills employers need are shifting — `future-skills` | forecast | EU | Cedefop — Skills Forecast / Skills-OVATE · https://www.cedefop.europa.eu/en/tools/skills-forecast | latest forecast cycle | 2026-06-13 |
| 4 | Shrinking working-age population — `demographic-pressure` | trend | EU | Eurostat — demographic statistics · https://ec.europa.eu/eurostat/web/lfs | 2024 demographic statistics | 2026-06-13 |
| 5 | Many vacancies hard to fill (skills mismatch) — `skills-mismatch` | skills_signal | EU | Eurofound — labour-market change · https://www.eurofound.europa.eu/en/topic/labour-market-change | recent reporting | 2026-06-13 |
| 6 | Cross-border mobility balances shortages — `labour-mobility` | trend | EU / EEA | EURES / European Labour Authority · https://eures.europa.eu/labour-shortages-and-surpluses_en | recent mobility reporting | 2026-06-13 |

## Allowed-source allowlist (`sources.ts`)

Eurostat · EURES (European Labour Authority) · Cedefop · Eurofound · OECD · ILO.
(OECD + ILO are registered as allowed sources for future cards; not yet cited by
an active item.)

## Only one figure carries a number

Item #1 shows an approximate magnitude (`~75% age 20–64`) and therefore carries
a `methodNote` (guard-enforced: a numeric value without a methodNote fails the
build). All other items are qualitative sourced statements with no hard number.

## What is NOT claimed

No platform metrics (no "X users / matches / hires"), no fake traction, no
"verified worker" community claims, no "AI already matched…", no guaranteed
outcomes. Enforced by `lib/guards/public-no-fake-claims.test.ts`.
