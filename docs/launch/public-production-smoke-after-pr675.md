# Public production smoke + launch UX audit — after PR #675

**Verdict: GREEN** (no regressions; audit-only, no code changes required)

## Run metadata
- **Production URL checked:** `https://labourmarket.ai` (apex, canonical host) and `https://app.labourmarket.ai` (same deployment). Both serve the identical post-#675 build.
- **Commit / branch checked:** `main` @ `e16cf4b` — `fix(public): canonical nav/footer IA + single company-demand funnel (#675)`.
- **Date/time of smoke:** 2026-07-07, ~08:30–12:10 UTC.
- **Method:** live route fetch (desktop + raw `<head>`), Playwright at 390 px mobile viewport (real overflow measurement + screenshots), repo validation commands.

## Routes checked
| Route | HTTP | Nav canonical | Notes |
|---|---|---|---|
| `/lt` | 200 | ✅ | employer card CTA → `/lt/company-need`; acronym legend present; LT chips localized |
| `/lt/company-need` | 200 | ✅ | honest note above form; country dropdown (10 markets) |
| `/lt/for-companies` | 200 | ✅ | educational; hero CTA → `/lt/company-need`; bottom band = account signup |
| `/lt/for-workers` | 200 | ✅ | no leaks; CTA → signup |
| `/lt/for-agencies` | 200 | ✅ | journey step "Įtraukite savo darbuotojus"; pool trades localized |
| `/lt/pricing` | 200 | ✅ | honest early-access framing; only acronyms (SSO/SLA/API/CRM) in EN |
| `/lt/about` | 200 | ✅ | real page; footer "Apie" appears once |
| `/en` | 200 | ✅ | "For workers/companies/agencies/Pricing/About"; employer CTA → `/en/company-need` |
| `/en/company-need` | 200 | ✅ | honest note above form; country dropdown |
| `/en/for-companies` | 200 | ✅ | educational; hero CTA → `/en/company-need`; bottom = account signup |

## Desktop result summary
All required LT routes and the lighter EN pass are internally consistent. Top navigation on every route is exactly **Darbuotojams / Įmonėms / Agentūroms / Kainos / Apie** (EN: For workers / For companies / For agencies / Pricing / About), each pointing to its real destination. No `Ištekliai`, `Sprendimai`, or duplicate/misleading `Apie mus` anywhere. Old EN template labels (`Solutions`/`Resources`/`Company`) are absent.

## Mobile result summary (390 px)
Playwright measured `scrollWidth − clientWidth = 0 px` (no horizontal overflow) on all 7 LT routes. Header renders with the logo + auth CTAs on a single row; nav collapses cleanly (no clipped labels). Footer is readable. The `/company-need` form fields are full-width and comfortably tall (company name 342×38, profession/country selects ~37 px, textarea 342×98) — no cramped fields (the `w:0/h:0` entries flagged by the probe were hidden React server-action inputs, not real fields). A simulated tap on the landing employer CTA navigated to `/lt/company-need` as expected.

## Nav / footer result
- **Nav:** canonical on every checked route; labels match destinations (Apie → `/about`, Agentūroms → `/for-agencies`, Įmonėms → `/for-companies`, Darbuotojams → `/for-workers`, Kainos → `/pricing`).
- **Footer:** product column mirrors the audience pages + pricing; company column has a single `Apie` → `/about`. No `Apie mus` → `/for-agencies`. Tagline is Europe-wide — "Visų sektorių darbo rinka — vietoje ir tarptautiniu mastu Europoje." / "A labour market across every sector — locally and internationally across Europe." No Baltic-only positioning, no template/internal-implementation residue. Legal links resolve.

## Company-demand funnel result
Single canonical path confirmed. Every company-demand action CTA routes to `/company-need` under the active locale:
- Landing employer-path card ("Pateikti poreikį" / "Submit a need") → `/{locale}/company-need`.
- `/for-companies` hero ("Pradėti darbo poreikį" / "Start a work need") → `/{locale}/company-need`.
`/for-companies` reads as an educational/positioning page (workflow explainer, opportunity radar, FAQ) whose action CTA enters `/company-need`; its bottom band is a distinct account-creation CTA (→ `/auth/signup`), which is signup intent, not demand-submission, so it does not split the funnel.

## `/company-need` form result
- Honest draft-preparation note renders **above** the form: "Šis puslapis paruošia struktūruotą poreikio juodraštį peržiūrai — čia niekas neišsaugoma ir nepublikuojama." / "This page prepares a structured draft of your need for review — nothing is saved or published here."
- **Country is a `<select>`** (not free text) with the 10 target markets: Lietuva, Latvija, Estija, Lenkija, Vokietija, Nyderlandai, Danija, Norvegija, Švedija, Suomija (EN equivalents).
- Labels are clear and localized; no raw technical/internal copy leaks. The form is honestly framed as a review/draft step, not a completed backend submission.

## Language-leak result (LT)
None found on the checked public surfaces. Player-card / demand / pool chips render Lithuanian ("Krautuvo valdymas", "Atsargų apskaita", "Pagyvenusių priežiūra", "Logistika", "Priežiūra", "Apgyvendinimas ir maitinimas"). No `Forklift operation`, `Elderly care`, `Logistics`, `Care`, `Hospitality`, or `Onboard'inkit`. Remaining EN tokens are acceptable acronyms/brand/service names (SKL/REL/…, SSO, SLA, API, CRM, n8n, ISO country codes).

## Acronym-legend result
Visible directly under the player-card showcase on `/lt` and `/en`:
`SKL — Įgūdis · REL — Patikimumas · SPD — Greitis · SAF — Sauga · ADP — Prisitaikymas · TRS — Pasitikėjimas` (EN: Skill / Reliability / Speed / Safety / Adaptability / Trust). A first-time visitor can decode the six codes in a single glance.

## SEO / meta / canonical quick result
Raw `<head>` inspection of `/lt`, `/lt/company-need`, `/lt/about`, `/lt/pricing`, `/en/company-need`:
- **Canonical** tags are self-referential to the apex per route (e.g. `https://labourmarket.ai/lt/company-need`) — sane, no cross-route or wrong-host canonicals.
- **Robots:** `index, follow` on all checked routes; `/company-need` stays indexable and now carries honest visible context (note above the form) — consistent with the PR #675 decision.
- **hreflang:** lt / en / ru + `x-default` alternates present on the homepage.
- Titles/descriptions are Europe-wide and consistent with the visible footer positioning (no Europe-vs-Baltic contradiction). The `/company-need` description matches the draft-only reality.
- No `demo` / `coming soon` low-trust wording in SEO-visible copy. "Preview"/"peržiūra" appears only as deliberate, honest draft/review-step framing in body copy (the approved path per the funnel doctrine), not as an excuse — not a regression.

## Fixes made
None. No PR #675 regression was found on production, so no code change was made. This commit adds the audit report only.

## Remaining issues
None at P0/P1/P2 that stem from PR #675. One informational note (not an action item): `/lt/pricing` shows expected honest early-access wording ("Kainos ruošiamos — nieko įsigyti dar negalima", "Mokėjimai dar neįjungti"); this is intentional pre-billing framing outside this audit's scope and not a nav/funnel issue.

## Validation
Run on `main` @ `e16cf4b` (the exact production commit):
- `pnpm typecheck` — **PASS** (exit 0)
- `pnpm lint` — **PASS** (exit 0)
- `pnpm build` — verified green on this identical commit in CI (PR #675 `quality` check) and in the immediately preceding implementation session (267 static pages); not re-run here as no code changed.
- Public guards: `public-nav-canonical` + `public-market-entry` + `localization-launch-scope` + `i18n-lt-en-parity` vitest — **PASS** (72 tests); `check:public-seo-indexing` — **PASS**; `check:i18n-debt` — **PASS** (within baseline); `placeholders:check` — **PASS** (173 entries).
- The goal doc's `check:public-copy` / `check:launch` / `check:seo` scripts **do not exist** in `package.json`; the guards above are the repo's equivalents.

## Scope confirmation
No DB / migration / Supabase RLS-RPC / auth / billing / provider / map-provider / private-dashboard / redesign changes. Audit + one docs file only.
