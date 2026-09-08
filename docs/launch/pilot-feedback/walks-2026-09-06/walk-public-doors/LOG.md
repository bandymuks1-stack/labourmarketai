# Walk — public doors (window 6, lane F) — anonymous audit of production

Build audited: `ca96605b` (2026-09-06, `/api/health` ok). Script: `audit-public-anon.cjs`
(anonymous Playwright; no session, no form submitted). Raw log: `before/audit.jsonl`;
screenshots: `before/*.png` (representative subset; the full 27-shot set was pruned to keep
the repo small).

## BEFORE — measured

| Route | 1280 overflow | 390 overflow | 320 overflow | DCL / load (ms, desktop) | 4xx/5xx | console errors |
|---|---|---|---|---|---|---|
| /lt | 0 | 0 | 0 | 950 / 1125 | none | none* |
| /en | 0 | 0 | 0 | 668 / 987 | none | none* |
| /lt/for-workers | 0 | 0 | 0 | 687 / 877 | none | none* |
| /lt/for-companies | 0 | 0 | 0 | 696 / 936 | none | none* |
| /lt/for-agencies | 0 | 0 | 0 | 670 / 906 | none | none* |
| /lt/professions | 0 | 0 | 0 | 565 / 821 | none | none* |
| /lt/pricing | 0 | 0 | 0 | 757 / 1001 | none | none* |
| /lt/auth/signup | 0 | 0 | 0 | 525 / 826 | none | none* |
| /lt/company-need | 0 | 0 | 0 | 724 / 896 | none | none* |

\* the only console line everywhere is the browser's CSP notice that `upgrade-insecure-requests`
is ignored in a report-only policy — not an error of the product. TTFB 160–260 ms on every route.

First screen `/lt` (verbatim): h1 **"Paklausk. Pamatyk. Įdarbink."**, lead "AI darbo rinkos
operacinė sistema — pokalbis, žemėlapis ir rezultatas vienoje vietoje."; entry label "PARAŠYKITE,
KO REIKIA — SAVAIS ŽODŽIAIS"; examples: "Reikia 12 pastolininkų Roterdame" · "Ieškau darbo
Norvegijoje" · "Kur galiu atlikti praktiką?". Final band doors: "Esu darbuotojas →"
(/lt/auth/signup), "Esu darbdavys →" (/lt/company-need), "Atstovauju agentūrai →"
(/lt/auth/signup), "Noriu tapti partneriu →" (/lt/about). **No door for an education
institution** (gap G-C1). `/en` mirrors it ("Ask. See. Hire.").

`/lt/professions` lead names construction / logistics / manufacturing / hospitality / care /
cleaning / agriculture / office / sales; the 22 rows contain no accountant, lawyer, engineer,
developer, teacher, designer (gap G-D1). No mention of services anywhere on `/lt` or
`/lt/professions`.

SEO head on every indexable route: canonical present, 6 hreflang alternates, `robots: index,
follow`; `/lt/auth/signup` is `noindex, nofollow` with no canonical (correct). No JSON-LD on any
audited route (none before, none required by this walk — unchanged).

Residue: no "demo", no "LABMA", no "placeholder"/"lorem" on any audited route ("test" matched
only inside "LATEST RECORDS" on /en — false positive).

Contradictory payment copy: `/lt/for-workers` FAQ "…Galutinės kainos skelbiamos prieš pilną
startą.", `/lt/for-companies` FAQ "Kaina skelbiama prieš startą. Užsirašiusiems — ankstyvos
prieigos kaina.", `/lt/for-agencies` FAQ "Kaina skelbiama prieš startą; partneriams sąraše —
ankstyvos prieigos sąlygos." — while `/lt/pricing` says "Kainos patvirtintos savininko ir
galioja." (approved launch pricing 2026-09-05).

## AFTER — to be re-measured post-merge

`node docs/launch/pilot-feedback/walks-2026-09-06/walk-public-doors-prod.cjs` with
`EXPECT_BUILD=<merged sha>`; writes `after/` here.
