# Pricing candidate — V8 directive, 2026-08-13 (DRAFT, OWNER-GATED)

State: `DRAFT_PRICING`. Nothing here is purchasable, published, or promised.
`PAYMENTS_ENABLED` stays `false`; `PRICING_READINESS_STATE` stays
`draft_pricing`; the public /pricing page keeps its honest "prices are being
prepared" copy until the owner confirms numbers. This document records the
candidate structure the owner supplied in the V8 train directive so the
billing groundwork has one canonical reference.

Confidentiality rule (V8 §13): this file carries ONLY candidate public
prices and allowances. No cost model, no margin math, no provider economics —
those stay server/private and are validated separately (§14) before any
activation.

## Worker plans (candidate)

| | FREE €0 | AI PLUS €19.99/mo | CAREER+ €29.99/mo |
|---|---|---|---|
| Positioning | Work | Improve | Advance |
| Job search / applications / journal / base CV+PDF / base matching | unlimited | unlimited | unlimited |
| AI Journal enrichment | ~3/mo | ~8/mo | ~15/mo |
| AI/ESCO enrichment | ~2 | ~5 | ~10 |
| Advanced match explanation | ~2 | ~5 | ~10 |
| AI CV optimization | ~1 | ~3 | ~5 |
| CV tailoring | — | ~2 | ~4 |
| Career analysis | — | ~1 | ~2 |
| Document analysis | — | ~1 | ~2 |

Extra usage via LMC. FREE must stay really useful (no fake-free).

## Employer / organization plans (candidate)

Primary sell is DAILY OPERATING VALUE (§4); recruitment quotas are secondary
usage controls. Headline is never "N searches".

| | FREE €0 | START €49 | GROWTH €149 | SCALE/AGENCY €399 |
|---|---|---|---|---|
| Positioning | Explore | Run daily work | Understand & plan | Optimize operations |
| Team members | 1 | 2 | ~5 | ~10 |
| Daily OS | basic overview | journal reports, day/week/month planning, calendar, availability, absences, stages, capacity | + advanced progress, workload, staffing & inquiry calc, forecast, alerts, AI manager summaries, pipeline, multi-project, limited simulation/automation | + multi-team, workforce & organization simulation, automation, advanced intelligence, agency/multi-client |
| Active inquiries | 1 | ~3 | ~7 | ~15 |
| Candidate searches /mo | ~5 | ~12 | ~25 | ~50 |
| Full profile opens | ~3 | ~8 | ~15 | ~30 |
| Contact reveals | 0 | ~2 | ~5 | ~10 |
| Advanced matches | ~2 | ~6 | ~15 | ~30 |
| AI shortlists | — | ~2 | ~5 | ~10 |
| Suitability analyses | — | ~3 | ~8 | ~15 |
| AI job generation | ~1 | — | — | — |

Recruitment value funnel stays canonical (§11):
SEARCH → PREVIEW → FULL PROFILE → AI ANALYSIS → CONTACT → BOOKING →
ENGAGEMENT. Preview never burns full-profile allowance. Payment never
overrides consent.

## LMC (candidate)

`1 LMC = €1 internal platform credit value`. Not cash, not redeemable.
Top-ups: 10 / 25 / 50 / 100 / 250 LMC = €10 / €25 / €50 / €100 / €250.

| Action | LMC |
|---|---|
| +10 employer searches | 1 |
| +5 full profiles | 1 |
| Contact reveal | 2 |
| +5 advanced matching | 2 |
| +5 suitability | 3 |
| Shortlist (bounded set) | ~2 |
| +5 worker AI journal enrichment | ~1 |
| CV optimization / CV tailoring / career analysis / document analysis | ~1 each |
| 5 AI job generations | ~2 |
| Bounded translation | by size |
| Job Boost 7d | 5 |
| Priority/Featured 7d | 10 |

## What blocks activation (all must be GREEN before any Stripe work — §54)

Internal cost validation under conservative heavy-legitimate-usage (PRIVATE),
billing catalogue + entitlements + usage metering + LMC ledger, idempotency,
refund/cancel/renewal/VAT/invoice semantics, grace periods, up/downgrade,
allowance semantics, LMC expiration/refund policy, abuse controls, Stripe
TEST-mode proof, pricing page + Terms + Pricing Terms + LMC Terms, analytics,
mobile, negative controls. Then `PAYMENT_ACTIVATION = OWNER_GATED`.

## OWNER GATE

> Confirm (or amend) these candidate numbers for public display, and approve
> flipping `PRICING_READINESS_STATE` to `owner_confirmed` when the §54 list
> is green. Until then the public pricing page stays exactly as it is.

Existing code anchors: `apps/web/lib/billing/plans.ts` (PAYMENTS_ENABLED=false,
pre-payment catalogue), `apps/web/lib/billing/readiness.ts`
(PRICING_READINESS_STATE, enforcement-seam mapping, claim ledger),
`apps/web/lib/guards/no-live-payments.test.ts`, `billing-readiness.test.ts`.
Any new plan/allowance lands THROUGH those seams — no second architecture.
