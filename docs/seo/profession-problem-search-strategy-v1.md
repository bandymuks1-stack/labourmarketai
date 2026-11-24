# Profession + Problem Search Strategy v1

**Branch:** `fix/profession-problem-seo-strategy-v1`
**Date:** 2026-06-15
**Relation to prior work:**
- PR #410 — technical SEO indexing foundation (apex canonical, www→apex, robots, sitemap).
- PR #411 — cross-sector positioning (brand stopped being construction-first).
- **This** — corrects an over-correction: cross-sector must **not** mean hiding
  professions. The platform must explicitly name professions, sectors and the real
  labour-market problems people search for.

## Principle

1. **The brand is broad.** The global title/description stay cross-sector
   (`LabourMarket.ai — Workers, Employers, Skills and Work Opportunities in Europe`).
   No single profession or sector is the whole brand.
2. **Professions are NOT hidden.** Construction workers, welders, drivers, warehouse,
   production, cleaning, hospitality, care, agriculture, admin, sales — all named.
3. **Construction is kept** as one important sector among many, never erased.
4. **SEO follows real search demand.** Every concrete profession and labour-market
   pain is treated as a query people type into Google / AI. A LabourMarket.ai page
   should: **name the problem → say who it hurts and why → show how LabourMarket.ai
   structures the solution → CTA into a real flow** (worker profile/CV, employer need,
   agency candidate/need flow). No fabricated numbers, clients or matches.

## What ships in this PR (minimal safe foundation)

Content source of truth: `lib/seo/profession-problem-content.ts` (pure, lt/en/ru) —
`SEO_PROFESSIONS` (22 professions across 9 sectors), `SEO_ACTORS` (teams,
subcontractors, agencies, employers), `SEO_PROBLEMS` (11 problems framed as search
questions, each with pain + how-we-help + audience).

New public, indexable pages (in sitemap, apex canonical + hreflang):

- **`/professions`** — the coverage hub: every named profession + sector tag, the
  market actors, and the real questions LabourMarket.ai answers. States plainly that
  construction is one sector among many.
- **`/work-opportunities`** — worker-facing: find work across sectors; profile/CV →
  skills → real needs; worker-side problem questions.
- **`/skills`** — verified vs self-declared skills (never mixed); skill-proof problems.

SEO metadata (`lib/seo/metadata.ts` `PAGE_SEO`) added for all three (lt/en/ru).

## Professions named (search coverage)

Construction workers, finishers, bricklayers, roofers, concrete workers, electricians,
plumbers (construction); welders, production operators, mechanics, technicians
(manufacturing); drivers, warehouse workers (transport & logistics); cleaners
(cleaning & facilities); hotel staff, cooks (hospitality & food); care workers
(care & health); agricultural & seasonal workers (agriculture); admin staff
(office & admin); sales / customer service (retail & sales); general / helper
workers (other). Plus actors: teams/brigades, subcontractors, staffing agencies,
companies hiring workers.

## Labour-market problems covered (as search questions)

We need workers fast · we need welders/drivers/specific trades · workers with
accommodation · foreign workers for a company · how to verify a worker's skills ·
worker has no CV · employer doesn't know real experience · how to find a reliable
team/brigade · how a worker can show what they can do · how a company can describe a
workforce need fast.

## Guard logic (updated)

`lib/seo/seo-indexing-audit.ts` + `lib/guards/public-seo-indexing.test.ts`:

- **Does NOT** ban the word construction / statyba / строит across the project — it
  is allowed in page copy, sitemap and docs as one example among many.
- **Bans only** the global brand title narrowing to a single sector
  (`CONSTRUCTION_FIRST_BRAND`) + the legacy "Labma — Construction OS".
- **Requires breadth (positive check):** `SEO_PROFESSIONS` ≥ 15 professions across
  ≥ 5 sectors, must include construction AND ≥ 4 non-construction sectors;
  `SEO_PROBLEMS` ≥ 8 with both worker- and employer-facing entries.

## Follow-up plan (NOT in this PR — avoids shipping empty pages)

Build the route first, add real problem→solution→CTA copy, then add to the sitemap:

- **Per-profession pages:** `/professions/construction-workers`, `/professions/welders`,
  `/professions/drivers`, `/professions/warehouse-workers`, `/professions/production-workers`,
  `/professions/cleaners`, `/professions/cooks`, `/professions/care-workers`, …
- **Per-sector pages:** `/sectors`, `/sectors/construction`, `/sectors/logistics`,
  `/sectors/manufacturing`, `/sectors/hospitality`, `/sectors/agriculture`, …
- **Per-problem pages:** `/problems`, `/problems/need-workers-fast`,
  `/problems/worker-without-cv`, `/problems/verify-skills`, `/problems/find-team`,
  `/problems/work-abroad`, `/problems/accommodation-for-workers`.

Each should reuse `lib/seo/profession-problem-content.ts` data and the same copy
principle. None should claim fake traction. Per-profession / per-sector / per-problem
pages enter the sitemap only once they exist with real content.
