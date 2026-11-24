# Cross-Sector Public Positioning v1

**Branch:** `fix/cross-sector-public-positioning-v1`
**Date:** 2026-06-15
**Relation to PR #410:** PR #410 ("Public SEO Indexing Foundation") fixed the
**technical** indexing (apex canonical, www→apex, robots, sitemap, hreflang).
This change fixes the **product positioning** the foundation accidentally
introduced: the SEO copy presented LabourMarket.ai as a **construction-first**
platform. This PR rebroadens it to a **cross-sector labour-market platform**.

**Out of scope (untouched):** DB migrations, auth, billing/payments, no fake
data. Construction is **kept** — only demoted from "the brand" to "one sector".

---

## 1. The problem

PR #410 shipped these brand SEO signals:

- Title (en): `LabourMarket.ai — Construction Workers, Teams and Employer Needs in Europe`
- Description (en): "…connects **construction and technical** workers, teams…"
- Page copy (workers/work-abroad): "**Construction and technical** workers…",
  "Work Abroad — **Construction** jobs across Europe".

This contradicted the owner-approved positioning already live elsewhere — the
landing hero chip reads **"General labour-market platform"** (PR #397) and the
product is internally **multi-sector** (`lib/structuring/sectors.ts`: 11 sectors,
`DEFAULT_SECTOR = "other"`, "construction is a normal row — deliberately not
first-and-special"). The SEO layer was the only construction-first regression.

## 2. Construction-first signals found

| Where | Signal |
|-------|--------|
| `lib/seo/metadata.ts` `BRAND_SEO` (en/lt/ru) | Title + description led with "Construction Workers" / "строители" / "statybos … darbuotojus" |
| `lib/seo/metadata.ts` `PAGE_SEO.workers` (en/lt/ru) | "Construction and technical workers…" |
| `lib/seo/metadata.ts` `PAGE_SEO.workAbroad` (en/lt/ru) | "Work Abroad — Construction jobs…" |
| `docs/audit/public-seo-indexing-foundation-v1.md` | documented the construction-first title |

Checked and found **already cross-sector** (no change needed): the landing hero
(`hero.chip = "General labour-market platform"`), all `pages.*` H1/subcopy, the
footer/header/common copy, and message copy where construction appears only as
**one option among many** (company types, role placeholders, estimate templates).
Components mentioning "construction" are idioms ("honest by construction") or a
single sector→icon mapping — not brand signals.

## 3. What changed (cross-sector direction)

**New brand SEO** (`lib/seo/metadata.ts` `BRAND_SEO`):

- **en:** `LabourMarket.ai — Workers, Employers, Skills and Work Opportunities in Europe`
- **lt:** `LabourMarket.ai — darbuotojai, darbdaviai, įgūdžiai ir darbo galimybės Europoje`
- **ru:** `LabourMarket.ai — работники, работодатели, навыки и возможности работы в Европе`

**New brand description** (en; lt/ru parallel):
> LabourMarket.ai helps workers, companies and agencies structure profiles,
> skills, work opportunities, workforce needs and next steps across sectors and
> countries.

**Page copy:** `workers` now reads "Workers across sectors — from logistics and
manufacturing to hospitality, care, construction and more…" (construction is one
example in a list). `workAbroad` → "Jobs across sectors in Europe" (no longer
construction-specific). The other pages were already sector-neutral.

**Sitemap** (`app/sitemap.ts`): no construction-specific route exists; core
cross-sector audience pages (`/for-workers`, `/for-companies`, `/for-agencies`,
`/labour-market`, `/company-need`, `/worker-intake`) bumped to priority `0.8`.

**Guard** (`lib/seo/seo-indexing-audit.ts` + `lib/guards/public-seo-indexing.test.ts`):
- new `CONSTRUCTION_FIRST_BRAND` rule — fails if a brand title line
  `"LabourMarket.ai — … construction/statyb/строит…"` (any active locale) appears.
- import-based vitest assertions — for every active locale, `BRAND_SEO.title` and
  `.description` must contain **no** construction signal, and the title must carry
  a cross-sector token (workers/employers/skills/opportunities/…).
- legacy `BANNED_BRAND` ("Labma — Construction OS") rules kept.

Construction is still **allowed** as one example among others in page-level copy.

## 4. New brand title/meta summary

LabourMarket.ai is positioned as a **whole-labour-market** platform: workers,
employers, companies and agencies; profiles/CVs, verified & self-declared skills,
work opportunities, workforce needs and cross-sector, cross-country matching in
Europe. No single sector (incl. construction) is the brand centre.

## 5. Validation (this branch, 2026-06-15)

- `pnpm -F web typecheck` → pass · `lint` → pass · `test` → pass · `build` → pass
- `pnpm -F web check:public-seo-indexing` → pass (incl. new cross-sector rules)

(Exact results recorded in the PR description / final report.)

## 6. Follow-ups (not in this PR)

- Optional dedicated public pages `/work-opportunities` and `/skills` (requested as
  sitemap priorities but not yet built) — add the routes first, then the sitemap
  entries, so the sitemap never lists a 404.
- Optional sector landing pages (e.g. `/sectors/construction`, `/sectors/logistics`)
  as *examples*, never as the brand core.
- Optional: `noindex` / canonical-only treatment for the marketing pages also
  served on `app.labourmarket.ai` (canonical→apex already consolidates them).
