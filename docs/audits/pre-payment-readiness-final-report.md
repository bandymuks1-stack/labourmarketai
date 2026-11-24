# Pre-Payment Readiness Sprint — Final Report

> Closeout of the pre-payment readiness sprint (2026-06-13). The product is
> prepared so a **separate** Stripe sprint can start safely. **No payments were
> connected, no money is collected, no Stripe/checkout exists.** Companion docs:
> [`pre-payment-readiness-current-state.md`](./pre-payment-readiness-current-state.md)
> · [`../product/pre-payment-product-readiness.md`](../product/pre-payment-product-readiness.md)
> · [`../product/country-work-readiness-v1.md`](../product/country-work-readiness-v1.md)
> · [`../product/plan-boundary-and-stripe-blockers.md`](../product/plan-boundary-and-stripe-blockers.md).

## 1. What was actually implemented

A 10-PR sprint, seed+wire+extend+gate (not greenfield). Every code PR is GREEN
(typecheck + lint + build + full guard suite, ~3038 tests). The one schema PR is
RED (owner-applied).

- **Stage 0/1** — ground-truth audit + canonical product source of truth.
- **Stage 2** — additive schema: worker availability prefs, `booking_requests`
  (+ conflict-blocking accept), worker document verification axis, FI support.
- **Stage 3** — country work-readiness v1: a guarded TypeScript matrix (10
  countries × 4 scopes) with official EU sources + `needs_legal_review`.
- **Stage 4** — worker readiness ladder + a real, sourced per-country document
  checklist on the live documents page.
- **Stage 5** — company readiness summary from existing fields.
- **Stage 6** — calendar/booking loop: propose → accept/decline, conflict-safe.
- **Stage 7** — safe candidate readiness signals on discovery (no private docs).
- **Stage 8** — plan boundary + entitlements without Stripe + a no-live-payments
  guard.
- **Stage 9** — admin readiness control center.
- **Stage 10/11/12** — guards, i18n (en/lt/ru), and this report.

## 2. PR numbers + merge SHAs

| PR | Title | # | State | SHA |
|----|-------|---|-------|-----|
| 1 | audit + product source of truth | #357 | merged | `e602f11` |
| 2 | schema (availability/booking/doc-verif) | #358 | **RED draft — owner applies** | — |
| 3 | country readiness v1 + guards | #359 | merged | `4791919` |
| 4 | worker readiness UI | #360 | merged | `e36638d` |
| 5 | company readiness summary | #365 | merged | `ab0d6e9` |
| 6 | calendar/booking loop | #363 | merged | `e5aa07d` |
| 7 | discovery readiness signals | #362 | merged | `d3b4cc7` |
| 8 | plan boundary + entitlements | #361 | merged | `521db67` |
| 9 | admin readiness center | #364 | merged | `5766384` |
| 10 | final report (this) | — | this PR | — |

## 3. Production deploy status

Each merged PR auto-deploys to the Vercel production branch (`main` →
labourmarketai.vercel.app). All app-layer features (readiness ladder, country
checklist, booking UI, discovery signals, plan boundary, admin center, company
readiness) are **live in code**. Features that need the PR2 tables/RPCs render a
calm "not available yet" state until the owner applies the migration — no errors,
no fake data.

## 4. Which functions now work

- **Worker:** profile, availability (`available_from` + status; prefs after PR2),
  preferred countries, per-country document checklist (real + sourced), mark
  document status (live `upsert_worker_document`), see what's missing, overall
  readiness ladder. ✅
- **Company/agency:** create a worker need (live), company readiness summary,
  candidate readiness summaries in scouting, send a booking request (after PR2),
  shortlist. ✅
- **System:** worker + company readiness from real fields, missing-item lists,
  country requirement sourcing, fake-ready blocking, booking conflict detection
  (after PR2), feature gates without Stripe. ✅
- **Admin:** readiness blockers, document verification queue (after PR2),
  country-rules-needing-review (live), booking activity, payment status. ✅

## 5. Countries with country readiness v1

LT, LV, EE, PL, DE, NL, DK, NO, SE, FI — each across 4 scopes (worker_solo,
worker_posted, team_subcontracting, company_hiring). Every requirement carries an
official `sourceUrl` + `sourceTitle` + `lastReviewedAt` + `confidence`. The DB
`country_document_requirements` table stays the admin override surface.

## 6. Document types included

`cv`, `id_document`, `a1_certificate`, `employment_contract`,
`posted_worker_package`, `professional_certificate` (live), plus (in PR2)
`work_permit`, `residence_permit`, `tax_registration`,
`social_security_registration`, `posting_notification`, `health_safety_card`.

## 7. What is marked `needs_legal_review`

Everything country-specific beyond the official EU framework: exact national
notification portals, sector/construction cards, local tax/social-security
registration specifics, and subcontractor chain-liability. Each country surfaces
at least one explicit `needs_legal_review` pointer to its official national site
(via the European Labour Authority hub). The admin readiness center lists every
such item for confirmation. The EU-framework items (free movement, A1 document,
prior posting notification, host minimum conditions, company posting
registration) are `official`/`strong`.

## 8. Calendar / booking status

Inert state machine (`booking-state.ts`) is now **persisted + wired**:
`booking_requests` + append-only events + propose/respond/withdraw RPCs (PR2,
owner-applied) and a live UI (`/dashboard/bookings` + scouting propose button,
PR6). Worker-only accept; overlap-conflict block; immutable readiness snapshot;
contacts stay hidden. The migration is owner-gated; the UI degrades honestly
until applied. **Remaining:** worker unavailable-periods table + an auto-expiry
job (documented future work; not blocking).

## 9. Worker readiness status

Live. Pure §3.1 ladder (`not_enough_information → missing_documents →
needs_verification → almost_ready → ready_for_country`) from real fields only.
Never "ready" while a required document is missing/expired or pending
verification. Rendered on the documents page with sources + the legal disclaimer.

## 10. Company readiness status

Live. `incomplete → basic → hiring_ready` from existing company fields, with the
missing items listed. `verified` is admin-set only. **Remaining:** richer legal
fields (hiring model, insurance, countries of operation, legal representative)
need a future RED migration.

## 11. Admin control status

Live readiness control center (`/dashboard/admin/readiness`, `requireSuperadmin`):
blocker tiles, document verification queue (verify/reject via the audited admin
RPC — the only path to `verified`), country-rules-needing-review, booking
activity, payment status. Degrades honestly until PR2 is applied.

## 12. Feature gates / plan boundary status

Live and Stripe-free. `PAYMENTS_ENABLED = false`; 5 tiers (Free Worker, Worker
Plus, Company Pilot, Agency Pilot, Admin/Internal); paid tiers are
`payment_not_enabled` (manual pilot access); `gateFeature()` resolves
ok/payment_not_enabled/not_in_plan/over_limit. A `no-live-payments` guard fails
the build if Stripe/checkout ever appears.

## 13. Can the Stripe test-mode sprint start?

**Yes.** The plan boundary, feature map, and entitlement helpers exist; payments
are provably off; the gate is one flag flip from real enforcement. The Stripe
sprint's backlog is the blocker list below.

## 14. What still blocks real payments (Stripe-sprint backlog)

From [`plan-boundary-and-stripe-blockers.md`](../product/plan-boundary-and-stripe-blockers.md):
provider decision (Stripe vs Montonio); `subscriptions` write path + webhook;
checkout flow + route; entitlement enforcement (flip `PAYMENTS_ENABLED`);
pilot→paid migration; tax/invoicing; pricing finalisation; dunning lifecycle;
legal review of billing/refund terms; secrets in Vercel env only.

## 15. Tests / guards that passed

Full vitest guard suite green (~3038 tests). New guards this sprint:
- `country-readiness-provenance` — full sourcing, all scopes/countries, no
  guarantee wording;
- `no-legal-guarantee-copy` — bans legal-guarantee claims in EN+LT message copy;
- `no-live-payments` — `PAYMENTS_ENABLED` false, no Stripe/checkout;
- `booking-honesty` (replacing the retired `booking-inert`) — pure state machine,
  worker-only accept, conflict block, no PII column, readiness snapshot.
Existing honesty guards (pilot/pricing/fit-signal/forbidden-terms/CTA-honesty)
still hold; the dual migration baseline was bumped 76→79 for PR2.

## 16. What was NOT touched

No Stripe, no checkout, no money, no card collection; no DNS / Stripe keys / bank
/ production secrets; no billing-live env; no destructive migrations; no
RLS-loosening; no auth-core change; no fake `ready`/`verified` states; no
invented country requirements; no private documents exposed to a company without
consent.

## 17. What the owner should review on the live domain

1. **Apply PR2** (`#358`) via Supabase MCP `apply_migration` (3 migrations, in
   order) — this lights up availability prefs, booking, and document
   verification. Until then those surfaces show "not available yet".
2. `/{locale}/dashboard/documents?country=DE` — the worker per-country checklist
   with sources + readiness status.
3. `/{locale}/dashboard/company` — the company readiness summary.
4. `/{locale}/dashboard/company/scouting` — candidate readiness signals + the
   propose-booking button (after PR2).
5. `/{locale}/dashboard/bookings` — the worker booking inbox (after PR2).
6. `/{locale}/dashboard/admin/readiness` — the admin readiness center.
7. `/{locale}/pricing` — the honest pre-payment plan boundary.
8. Confirm the `needs_legal_review` country items in the admin center against the
   official national sites before relying on any country checklist.

### Minor follow-ups (non-blocking)
- Worker `unavailable_periods` table + booking auto-expiry.
- Company legal/billing extra fields (RED migration).
- Consent-gated company-facing document summary RPC (so a company can see
  ready/missing counts with the worker's consent).
- A worker nav link to `/dashboard/bookings` for discoverability.
