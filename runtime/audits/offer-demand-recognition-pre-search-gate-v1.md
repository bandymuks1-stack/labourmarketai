# Offer–Demand recognition → pre-search gate (audit v1)

**Date:** 2026-06-29 · **PR:** #561 (amend, branch `feat/cc/offer-demand-recognition-v1`)
· **Rule:** no DB/RLS/RPC/schema; no merge; no deploy without owner approval.

Owner intent: the recognizer must not be a hidden lab route. It becomes the
pre-search / pre-request gate — ask the right questions, recognize known, show
missing + risks + readiness, then hand off to the EXISTING real surface with up to
3 working next actions. No second marketplace, no duplicate demand form.

## 1. Existing routes where users act today
- Look for work (worker): `/dashboard/opportunities` (work search/opportunities),
  supported by `/dashboard/profile` (Player Card / CV source) + `/dashboard/journal`
  (work proof). Also `/dashboard/search`.
- Look for workers (company/agency): demand intake `DemandRequestButton` on
  `/dashboard` (company view) + `/dashboard/company` (company hub, `DemandDraftForm`),
  `/dashboard/talent`, `/dashboard/candidates`.
- Offer services: `/dashboard/services` (`ServiceOfferingsSection`).
- Create / request projects & service providers: `/dashboard/service-requests`
  (marketplace request loop), `/dashboard/buyer` (`BuyerRequestsSection`),
  `/dashboard/projects` (project contexts).
- View market / map / results: `/dashboard/market-map` (the market home tab),
  `/dashboard/marketplace` (hub; map-first redirect per memory).

## 2. Existing components in those flows
`DemandRequestButton`, `DemandDraftForm`, `BuyerRequestsSection`,
`ServiceOfferingsSection`, `MarketplaceLoopSection`, `ProjectContextCreateForm`,
`MarketMapShell` / `MarketMapBase`, `MyZone`, `WorkCard`, opportunities page.

## 3. Existing demand/request forms (do NOT add a third)
- `DemandRequestButton` → `submitDemandRequestAction` → `customer_requests` (immediate).
- `DemandDraftForm` → `demand_drafts` (private). `BuyerRequestsSection` → `customer_requests`.
This PR adds NO new write path — it only recognizes + links into these.

## 4. Where PR #561 added the recognizer
`/dashboard/market/recognize` + `components/app/market/offer-demand-recognizer.tsx`
+ pure `lib/market/recognition/*`. Currently: demand intents use a generic
`/dashboard` next action; supply intents show a static hand-off card (no
recognition). It is reachable ONLY by direct URL.

## 5. What is still isolated (to fix in this amend)
- The route has no entry point from the real market flow.
- Demand next action is the generic `/dashboard` (goal forbids this).
- need_work / offer_services don't recognize anything — they just link out.
- Only one set of fields; intents don't ask intent-specific questions.

## 6. Chosen connection points
- **Entry point:** a "Pasakyk, ko ieškai / ką siūlai" pre-search card at the top of
  the market home `/dashboard/market-map` (the market area, a primary nav tab — one
  low-risk additive Link, no IA/guard change), opening `/dashboard/market/recognize`.
- **Recognizer:** all four intents run the recognition layer (intent-specific field
  subset) and show recognized / missing / risks / readiness + ≤3 next actions.

## 7. Exact handoff target per intent (no generic /dashboard)
- `need_work` → `/dashboard/profile` (complete Player Card) · `/dashboard/journal`
  (add work proof) · `/dashboard/opportunities` (continue to work search).
- `need_workers` → `/dashboard/company` (complete hiring details / continue to the
  demand surface). Match preview is NOT shown as a user action (live pool not wired —
  internal note only, never a dead-end button).
- `offer_services` → `/dashboard/services` (complete service profile) ·
  `/dashboard/journal` (add proof).
- `have_project` → `/dashboard/service-requests` (complete details / continue to the
  project & service-request surface).

## 8. Is a new route still needed?
No new route. `/dashboard/market/recognize` (added in #561) stays as the single
recognition step; this amend only connects it and fixes the hand-offs.

## 9. No duplicate demand path
Confirmed: the recognizer persists nothing and submits nothing — it links into the
EXISTING `DemandRequestButton` / `DemandDraftForm` / services / service-requests
surfaces. No third demand form, no fake persistence, no fake live matching.

## 10. DB/RLS/RPC follow-up (owner-approval-gated, NOT in this PR)
Persisting the recognized card + pre-search answers; wiring `explainTopMatches` to a
live RLS-scoped worker pool (need_workers "review matches"); private-message
delivery; weekly-digest aggregation. (Same §D items as the v1 audit.)

## Allowed slice now
Connect the recognizer (entry card + intent-specific recognition + exact handoffs +
≤3 actions + LT/EN/RU "preparation step" copy + tests). No DB. One PR. No merge/deploy.
