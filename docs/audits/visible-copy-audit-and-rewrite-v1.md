# Visible Copy — Audit & Rewrite v1

Goal: make all visible Labourmarket.ai copy read as **one coherent labour-market
platform**, not separate functions — and demote "work abroad" from the main
message to **one option** among local, regional and international work.

Active locales: **LT / EN / RU** (structured so the rest of Europe is easy to
add later — all user-facing copy stays in i18n, never hardcoded).

## 1. Places reviewed

Public: landing/home hero, SEO brand title/description, pricing, legal
(terms/privacy/cookies/marketplace-rules), for-workers/-companies/-agencies,
work-abroad, work-opportunities, vision, footer. Authenticated: dashboard /
"Mano erdvė" (IdentityActions), profile / Player Card, readiness, opportunities,
market map, company dashboard, communication / feedback loop, empty states,
buttons/cards/chips/labels.

## 2. Errors found

| Where | Problem |
|---|---|
| **`hero.headline`** (landing) | **"Darbas užsienyje ir darbuotojų paieška" / "Work abroad and hiring"** — framed the WHOLE platform as work-abroad + worker search. The single biggest mis-positioning. |
| `hero.subcopy` | Worker/employer only; no mention that work can be local, regional OR international; no project/service/needs/signals breadth. |
| `BRAND_SEO.description` | Led with "workers, companies and **agencies**"; no explicit local + international framing. |

Not errors (intentional, kept): the `/work-abroad` page and `workAbroad.*` copy —
working abroad stays **one real option**, just not the platform's essence. The
hero chip already said "General labour-market platform" (kept).

## 3. New terminology direction (unified)

- **Asmuo / person** — a physical person: can look for work, offer services, buy
  services, or manage their own work path.
- **Įmonė / company** — a legal entity: can look for people/teams/services/
  projects, or make offers. (Agency = a company activity type, not an identity.)
- **Poreikis / need** — a real need for work, a service, a team, a project or help.
- **Galimybė / opportunity** — a possible job, project, order or collaboration.
- **Rinkos žemėlapis / market map** — labour-market signals: where the needs,
  people, companies, readiness, document gaps and risks are.
- **Player Card / professional card** — a person's work identity: readiness,
  skills, documents, experience, confirmations, visibility.
- **Mano erdvė / command center** — the one control center, not another dashboard.

"Agency" and "buyer" are never presented as separate base human identities — the
model is **person / company**, with buying/selling/hiring/agency as **actions**.

## 4. Copy changed

- **Hero (LT/EN/RU)** rewritten:
  - headline → "Vietinės ir tarptautinės darbo galimybės" / "Local and
    international work opportunities" / "Местные и международные возможности
    работы".
  - accent → "vienoje aiškioje sistemoje." / "in one clear system." / "в одной
    понятной системе."
  - subcopy → people + companies; work / project / service needs; readiness;
    market signals; **"in your own city, another region, or abroad"** (abroad as
    one option). All three locales say the **same** thing.
- **SEO brand description (LT/EN/RU)** → general labour-market platform; people
  and companies; needs/readiness/skills/opportunities/signals; **locally and
  internationally**; cross-sector. (Title kept; still cross-sector.)

## 5. Guards added

- **`landing-not-abroad-only`** — hero headline must not lead with "work abroad";
  hero must carry balanced local + international framing; subcopy must address
  BOTH people and companies; SEO description carries local+international.
- Existing copy/honesty guards still pass and continue to lock the framing:
  `public-trust-positioning` (chip = general labour-market platform; no
  construction-only / intermediary / guarantee), `public-mechanism`,
  `public-seo-indexing` (cross-sector, no construction-first),
  `product-copy-forbidden-terms` (no "demo"), `i18n-lt-en-parity`,
  `user-facing-term-leak`, `no-external-names`.

## 6. Deliberately left for later European-language expansion

- All user-facing copy stays in `messages/{locale}.json` (no hardcoded UI text),
  so adding a new European language is a new `messages/<xx>.json` + locale-config
  flip — no component changes. LT is the source of meaning; EN/RU mirror it.
- The `/work-abroad` page stays as one option's deep-dive; future locales inherit
  the same coherent framing automatically via i18n.

## 7. Result

The public landing **no longer presents the project as "work abroad"** — it is a
general labour-market platform covering local, regional and international work for
both people and companies, with abroad as one option. No DB / schema / RLS / env /
secrets / Stripe / route-architecture changes.
