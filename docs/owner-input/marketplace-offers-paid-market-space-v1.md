# Marketplace Offers + Paid Market Space v1 — product plan

> Owner-facing plan. **This document is planning only.** Nothing here is built
> in PR #498. It defines the monetization logic, the schema/RLS/billing work
> required later (owner-gated), and the relationship between the map and the
> commercial layer, so the next steps are unambiguous.

## 0. What PR #498 actually is (and is not)

- PR #498 makes **Žemėlapis the primary visual market surface** and compresses
  inner pages. It is **UI/IA only**.
- **PR #498 does NOT make the Marketplace ready for real product trading.** There
  are **no** sellers, listings, prices, carts, checkout, payouts, or commission.
  The supply-side surfaces (offers / shop / rentals) appear only as honest
  **disabled "preparing" legend layers** on the map — no fake data.
- Real product trading requires a **separate schema + UI + billing**
  implementation, described below, behind the owner gate. Nothing in this plan
  is implemented or applied yet.

## 1. Core decision

- **Žemėlapis = the primary visual market surface.** The map is where the market
  is seen; over time it gains richer layers.
- **Marketplace = the commercial layer around/on the map.** It is **not yet** a
  real shop/trading system. v1 monetizes **market space, publishing, visibility,
  and direct contact/request** — NOT transactions.

## 2. Monetization logic (v1)

1. **Paid market space** — a person/company can open a market space cheaply:
   - basic profile/contact page,
   - basic map visibility,
   - incoming contact/request option,
   - **draft** offers (unpublished).
   - Proposed price: **10 € + VAT / month**.
2. **Offers are paid only when PUBLISHED (live):**
   - **draft offers = free** (compose, save, edit — no charge),
   - **live published offers = paid** — we charge for an **active published
     offer**, never for the technical upload/storage.

### Proposed pricing structure

| Plan | Price (excl. VAT) | Includes |
|------|-------------------|----------|
| **Basic** | **10 € + VAT / mo** | contact/market space + basic map visibility |
| **Seller** | **29 € + VAT / mo** | contact space + up to **5** active offers |
| **Business** | **79 € + VAT / mo** | contact space + up to **20** active offers + stronger map visibility |
| **Extra active offer** | **3–5 € + VAT / mo** | one additional active published offer |
| Highlighted map visibility / category priority | later add-on | visual priority on the map (post-v1) |

All prices are proposals for owner approval; none are shown in the product yet.

### Offer types to support (planning)

product · service · team/brigade availability · tools/equipment rental ·
accommodation/housing · real estate · work/project offer.

(These map 1:1 to the disabled "future layer" chips already shown on the map
page: companies, teams/brigades, services, rentals, shops/offers, etc.)

## 3. Map-layer relationship

- Each **offer type is a future map LAYER**, not a separate hub page. Publishing
  a live offer should make it visible on the map (within the seller's plan
  visibility), filterable by the map's layer legend.
- The map legend's **"future layers"** (disabled today) become **enabled
  filters** once the offer schema + publishing exist.
- **Map visibility is a paid dimension** (Basic = basic; Business = stronger;
  highlighted = add-on) — but visibility never fabricates signals: only real,
  owner-published, paid-active offers appear.

## 4. Required later implementation (owner-gated, NOT in PR #498)

All of the following is **RED-class** (new tables / RLS / billing) and must go
through the human gate — never auto-merge, never applied without owner approval.
Extends, does not duplicate, the existing canonical structures
(`organizations`, `engagement_contexts`, `customer_requests`) per
`docs/PLATFORM_DOCTRINE.md` §5.5 / §17. See also the deferred schema notes in
[`ia-compactness-marketplace-v2.md`](ia-compactness-marketplace-v2.md) §5.

### 4.1 Schema (proposed)
- **`market_spaces`** — one paid market space per owner (profile or
  organization): `id`, `owner_profile_id`, `organization_id` (nullable),
  `plan` slug (`basic`|`seller`|`business`), `status`
  (`inactive`|`active`|`past_due`|`canceled`), `active_until`, timestamps.
- **`offers`** — `id`, `market_space_id` (FK), `owner_profile_id`,
  `organization_id` (nullable), `offer_type` slug
  (`product`|`service`|`team_availability`|`tool_rental`|`accommodation`|
  `real_estate`|`work_project`), `title`, `original_text`, `original_language`
  (§2), optional `price_amount`/`price_currency`, `status`
  (`draft`|`published`|`paused`|`archived`), `published_at`, default-closed
  `visibility` (§4), `prev_hash`/`content_hash` (append-only evidence, §3).
- **`offer_kinds`** + **`market_space_plans`** — slug registries + per-locale
  JSON labels (§10 Lego); plan limits (`max_active_offers`, visibility tier)
  live as data, not hardcoded enums.
- **`availability_slots`** (shared with the calendar plan) for team/rental/
  accommodation/service availability — `subject_kind`, `starts_at`, `ends_at`,
  `status`.

### 4.2 RLS (proposed)
- `market_spaces` / `offers`: owner-scoped CRUD via the owner's profile /
  org-management grant; **public SELECT only for `status='published'` AND a
  currently `active` market space** (so an unpaid/lapsed space hides its live
  offers automatically). Draft offers are never publicly visible.
- All writes through **SECURITY DEFINER RPCs** (`open_market_space`,
  `save_offer_draft`, `publish_offer`, `unpublish_offer`) — never direct table
  writes; `publish_offer` enforces the plan's active-offer limit server-side.
- Migration is **additive/widening**, ships a paired
  `supabase/rollbacks/<name>.down.sql`, bumps the dual baseline, and passes
  `migration-safety` — but still opens **draft + `needs-human-gate`** because it
  introduces new tables + RLS + SECURITY DEFINER.

### 4.3 Billing (proposed, separate + later)
- Subscription billing (monthly plan + extra-offer add-ons + VAT) is a
  **separate implementation after owner approval**. Today payments are inert
  (the account page shows the honest "payment readiness" note; no pay-now, no
  paid unlock). A lapsed/`past_due` space simply hides its published offers via
  RLS — no enforcement code fakes a charge.

## 5. Important v1 rule

**Do not build full checkout / cart / platform payments / commission yet.**
Marketplace v1 monetizes **market space, publishing, visibility, and direct
contact/request** only. Checkout, escrow, payouts, and commission come **later,
only after explicit owner approval**.

## 6. Safe now vs owner-gated later

| Safe now (this PR / UI-only) | Owner-gated later (RED) |
|------------------------------|--------------------------|
| Map is the primary surface; offer types shown as **disabled** legend layers | `market_spaces` / `offers` / slot tables + RLS + RPCs |
| Honest "preparing" copy, no prices shown | Subscription billing + VAT + plan limits |
| Contact/request via existing canonical paths | Public SELECT of live offers gated by active paid space |
| No sellers, no listings, no transactions | Map visibility tiers / highlighted add-on |

## 7. Status

- **Behavior change in PR #498 from this doc: NONE.** This is a planning
  document only. No schema, no RLS, no billing, no fake data.
- Next step is a **separate, owner-gated** PR implementing §4 after the owner
  approves the pricing + model above.
