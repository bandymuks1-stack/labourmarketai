# Staffing Operating Model v1 — Final Report (interim)

> Closeout of the Staffing Content & Operating Model v1 sprint as delivered so
> far. The **business logic + data backbone** of the operating model is built,
> tested, and merged; the **first public worker funnel** is live. The remaining
> slices are user-facing UI surfaces (forms, operator dashboard, AI-suggestion
> integration) + visual evidence. Governing line (unchanged):
> *Labourmarket.ai automates labour-agency operations but never uses AI as a
> legal, verification, or payment authority.* Source of truth:
> [`../product/staffing-operating-model-v1.md`](../product/staffing-operating-model-v1.md).

## 1. PR numbers + merge SHAs

| PR | Title | # | State | SHA |
|----|-------|---|-------|-----|
| 1 | operating-model source-of-truth doc | #383 | merged | `7fae800` |
| 2 | worker intake by profession + AI profile draft | #384 | merged | `49d784e` |
| 3 | foreign-worker funnel page `/work-abroad` | #388 | merged | `9c5fc2d` |
| 4+6 | company need model v2 + deterministic fit engine | #385 | merged | `609ff7f` |
| 9 | contract/payment readiness (payments off) | #386 | merged | `cfc87e9` |
| 11 | honest service/pricing model | #387 | merged | `4ced20f` |
| 12 | this report | — | this PR | — |

## 2. Worker intake

`lib/staffing/worker-intake.ts` — strict model: identity/contact, target
countries, profession (slugs aligned to the existing taxonomy +
`PROFESSION_DIRECTIONS`), experience, CV flags, `availableFrom`,
transport/accommodation/languages as real inputs, worker segment
(solo/brigade · employee/zzp/subcontractor/brigade/agency_supplied), contract
preference, documents (names only), comment. `draftWorkerProfileFromIntake`
(server) runs the `worker_profile` AI agent → a **suggestion** (disabled in prod
until a provider; mock in dev; runtime-off fabricates **no** draft).

## 3. Profession paths

`PROFESSION_DIRECTIONS` (17 starter trades) aligned to
`messages/[locale]/professions.json`: general_laborer, carpenter,
formwork_carpenter, rebar_worker (steel fixer), concrete_worker, mason
(bricklayer), plasterer, drywaller, painter, tiler, roofer, electrician, plumber,
welder, hvac_ventilation, mechanic_technician, warehouse_logistics. New slugs
follow the Lego slug-registry rule — no hardcoded UI enums.

## 4. Foreign-worker funnels

`/[locale]/work-abroad` — LIVE, SSG in **lt / en / ru** (the active locales; pl
is not an active locale today). Honest funnel: the chain (trade → AI draft →
country readiness → match → booking), what a worker may need, a link to the
per-country labour-market signal pages, and CTAs into onboarding / labour-market
/ for-workers. **No job/wage promise, no legal guarantee, no fake jobs.** The
existing per-country `/labour-market/[country]` pages remain the sourced
country-signal surfaces.

## 5. Company need / vacancy form status

`lib/staffing/company-need.ts` — strict vacancy model (company/contact,
country/city, profession, worker count, team shape, start/duration, optional
company-declared rate range, engagement model employment/subcontracting/
agency_supply, accommodation offer, transport, language requirements +
acceptsNonEnglish, required skills/certs/documents, urgency, description).
`draftVacancyFromNeed` (server) runs the `company_need` agent → a normalized
vacancy **suggestion** (no AI-invented pay; reviewed before publish). **The model
+ action are built; the company-facing FORM UI is a remaining slice.**

## 6. ZZP / brigade path status

The worker segments (`WORKER_ENGAGEMENT_TYPES`: employee, zzp_self_employed,
subcontractor, brigade, agency_supplied) and the company engagement models are
**modelled** in the intake + need schemas. **The dedicated ZZP/brigade UI path
(team fields, business/VAT, tools/insurance) is a remaining slice.**

## 7. Accommodation / transport / language fit

`lib/staffing/fit.ts` — a **deterministic** fit engine (NOT AI) computing
profession / accommodation / transport / language / start-date fit between a
worker intake and a company need. **Mismatches are never hidden** — each becomes a
blocker; missing data is `unknown`, never overstated as `fit`. The
`matching_explanation` AI agent explains this output; it never replaces it.

## 8. Candidate pool status

**Remaining slice.** The data (worker intake + readiness + fit) and the
`admin_risk` AI agent exist; the operator dashboard (filter by profession /
country / available-from / readiness / accommodation / language / team; shortlist)
is not yet built.

## 9. Match → booking path status

`fit.ts` + `booking_risk` + `matching_explanation` provide the logic; the booking
schema exists (owner-applied). **Wiring need → shortlist → booking into a
user-facing flow is a remaining slice.**

## 10. Contract / payment readiness status

`lib/staffing/contract-payment-readiness.ts` — deterministic checklist (fit /
documents / company_readiness / admin_review / payment) with **`paymentsLive` =
literal `false`**, payment always blocked, reusing the billing config state. Never
turns on live payments, never generates a final legal contract.

## 11. AI suggestion UI status

The AI agents (Internal LLM Agents v1) + the staffing draft actions
(`draftWorkerProfileFromIntake`, `draftVacancyFromNeed`) are wired and return
labelled suggestions (disabled/mock until the owner provides a provider). **The
React surfaces that render these suggestions in worker/company/admin with
"AI suggestion / review before saving / not verified" labels are a remaining
slice.** The funnel page already states AI prepares a draft but verifies nothing.

## 12. Pricing / service model status

`lib/staffing/service-model.ts` — worker free; company pilot/quote; agency quote.
Every paid tier is **"Pilot access / request a quote"** — no fabricated price
(`hasNoFakePrice()` invariant). A future owner-gated pricing slice fills real
amounts behind the billing test-mode foundation.

## 13. Tests / guards / build

Green every PR: typecheck + lint + build + ~3856 tests, including i18n
parity/debt and `public-no-fake-claims` for the funnel. The staffing logic is
pure + unit-tested; each AI draft is proven via the mock provider with no key or
network; runtime-off fabricates no draft.

## 14. Production route smoke

`/work-abroad` builds statically in lt/en/ru and deploys with the app. The
staffing libraries are server-side and inert in prod (AI runtime resolves to
`disabled` with no env). No new public route makes an external call.

## 15. Visual evidence

**Remaining.** Mobile + desktop screenshots (worker intake form, funnel, company
need form, candidate pool, match/booking, operator view, pricing) require a
running dev server and are captured in a follow-up visual-evidence slice.

## 16. What was NOT touched

No live Stripe / live keys; no DNS; no Vercel secrets; no destructive migration;
no fake jobs / testimonials; no work or wage promise; no legal guarantee; no AI
verification of documents/skills/legality; no AI auto-publish; no legacy/LABMA
terms; no competitor text/design/brand; private documents never exposed.

## 17. What still blocks real selling / live payments

1. **User-facing forms + dashboards** — worker intake form, company need form,
   ZZP/brigade path, operator candidate pool, match→booking flow, AI-suggestion
   surfaces (the models, actions, and agents are ready; the React layer is the
   remaining build).
2. **Visual evidence** — mobile/desktop screenshots.
3. **Owner-gated activation** — apply PR #379 AI audit migration (Supabase MCP);
   set the real LLM provider env (`AI_PROVIDER_MODE=live` + `AI_API_KEY`); Stripe
   test checkout env. **Live payments remain forbidden by design** — a deliberate,
   separate sprint that consciously evolves the no-live-payments guard.
4. **Confirmed pricing** — real amounts behind the billing test-mode foundation.
