# Authenticated product — IA compactness + marketplace identity model v2

> Follow-up to PR #496 (which removed some technical duplicates but left the
> product too long / too modular). This change makes the authenticated product
> **visibly shorter, simpler and more consistent**, with **no schema changes**
> and **no fake functionality**.

## 1. Owner corrections addressed

| # | Correction | Status in this PR |
|---|------------|-------------------|
| 1 | Top nav too modular | ✅ Compact role-aware nav: **Mano erdvė · Marketplace · Žinutės · Nustatymai** (+ **Admin** only for admins). Map / Profile / Mano CV / company / offers demoted to sub-surfaces. |
| 2 | Dashboard = long warehouse | ✅ Removed the 8-tile `MyWorkView` grid. Command center now = identity header + one next action (`WorkCard`) + compact identity links + invitations. |
| 3 | No page-local quick nav | ✅ New sticky `PageQuickNav` jump bar on long pages (Mano CV, Profile) with only the relevant anchors. |
| 4 | Profile = CV/work-history warehouse | ✅ Profile reframed to person identity: avatar, managed companies (real owned orgs, by name), individual-activity framing, skills. Work-history capability surface collapsed + linked to Mano CV (not duplicated open). |
| 5 | Mano CV too long, readiness repeated | ✅ Quick-nav anchors added; the duplicate readiness panel collapsed into a disclosure (readiness shown once on the player card). |
| 6 | Company context shows person, not company; no multi-company | ✅ Multi-company list/select/add built on the **existing** `organizations` + `engagement_contexts` schema. Company page already shows company identity (legal/display name), not the username. Hub + Profile list owned companies by name and offer "add company". Supports 2/3/50 companies (real rows). |
| 7 | Individual activity / self-employed | ✅ Framed under the person identity (Profile + Marketplace hub), not a top-level menu item. |
| 8 | Marketplace must support offers, not only jobs | ⚠️ UI model fixed honestly via the Marketplace hub; **supply-side offers have no data model** → honest "preparing" state + deferred migration plan (§5). No fake listings. |
| 9 | Store/shop part of Marketplace | ⚠️ Shop/services/rentals/real-estate shown as ONE honest "preparing" hub section; no separate nav item; no fake products. Deferred schema (§5). |
| 10 | Calendar attached to identities/offers | ⚠️ Not in global nav. No calendar-slot schema → deferred plan (§5). No fake slots. |
| 11 | Intrusive floating "Pranešti apie tekstą" | ✅ Reduced from an always-on wide pill to a small, low-opacity icon-only button. |
| 12 | No fake functionality | ✅ Every datum is read from existing tables; missing data models render honest "preparing" states. |

## 2. What was removed / collapsed after PR #496

- **Removed** the worker dashboard `MyWorkView` 8-tile grid (Profile, CV, Skills,
  Evidence, Availability, Journal, Work Needs, World Map as separate tiles).
- **Removed** Map, Profilis and Mano CV as global nav tabs (now sub-surfaces).
- **Collapsed** the Mano CV second readiness panel (`WorkerReadinessPanel`) into a
  disclosure — readiness is shown once prominently on the player card.
- **Collapsed** the Profile work-history capability surface into a disclosure with
  a link to Mano CV (work records are not duplicated open on Profile).
- **Reduced** the floating language-feedback pill to a small icon button.

Nothing that backed a real, reachable surface was deleted — only de-bloated.
Map / Profile / Mano CV stay **active** and reachable (catalogue flips only).

## 3. Route map — global nav vs local sub-surfaces

**Global top nav (compact, role-aware):**

| Tab | Route | Notes |
|-----|-------|-------|
| Mano erdvė | `/dashboard` | command center |
| Marketplace | `/dashboard/marketplace` | NEW compact hub |
| Žinutės | `/dashboard/communication` | messages (unread badge) |
| Nustatymai | `/dashboard/account` | settings only |
| Admin | `/dashboard/admin` | **only if `isAdmin`** |

**Sub-surfaces (reachable, NOT global tabs):**

- `/dashboard/market-map` — from Marketplace hub + person identity actions
- `/dashboard/opportunities`, `/dashboard/search` — from Marketplace hub
- `/dashboard/profile` — person identity; from Nustatymai + Mano erdvė + Marketplace (individual activity)
- `/dashboard/journal` — Mano CV; from Mano erdvė + Profile (work-records link)
- `/dashboard/company` + `/dashboard/start/company` — company channel + add; from Marketplace hub + Profile (managed companies)

**Marketplace hub sections** (`/dashboard/marketplace`):
1. Žemėlapis → market-map *(live)*
2. Darbai / poreikiai / galimybės → opportunities *(live)*
3. Įmonių / asmenų pasiūlymai *(preparing — no supply-side schema)*
4. Parduotuvė / paslaugos / nuoma / NT *(preparing — no schema)*
5. Individuali veikla → profile *(live, person-linked)*
6. Įmonės kanalai → owned companies by name + add *(live, real rows)*

## 4. Honest "preparing" states (no fake data)

The hub's offers (3) and shop/rentals/real-estate (4) sections render a labelled
"Ruošiama / Preparing / Готовится" badge with a plain explanation that the data
model does not exist yet. No fake listings, companies, products, rentals,
calendar slots, matching or map signals are shown anywhere.

## 5. Deferred, owner-gated schema migration plan (NOT applied here)

These require new tables and an **owner-gated** migration. **No migration is
included in this PR.** Per `docs/PLATFORM_DOCTRINE.md` §17 there is exactly ONE
structured *demand* model (`customer_requests`); a *supply/offer* side is a NEW
concept and a **doctrine conflict** that needs explicit owner / Chat-Claude
sign-off before any schema is written.

### 5.1 Supply-side offers (corrections #8, #9)
- **New:** `offers` (id, owner_profile_id, organization_id NULL, kind slug
  [`service`|`product`|`rental`|`accommodation`|`property`|`team_availability`],
  title, `original_text`, `original_language` per §2, price/currency NULL,
  status [`draft`|`active`|`closed`], visibility default-closed per §4,
  `prev_hash`/`content_hash` if it becomes author-content evidence).
- **New (taxonomy, §10):** `offer_kinds` slug registry + per-locale JSON.
- **Doctrine conflict (§17):** offers are a supply concept distinct from
  `customer_requests` (demand). Decide: extend `customer_requests` with a
  supply `kind`, or a dedicated `offers` table + RPC. **Owner decision required.**

### 5.2 Shop / products (correction #9)
- Covered by `offers` with `kind='product'`; no separate e-commerce/inventory
  table unless real fulfilment is added (payments remain off-platform / inert).

### 5.3 Calendar / availability slots (correction #10)
- **New:** `availability_slots` (id, owner_profile_id, organization_id NULL,
  offer_id NULL, subject_kind [`person`|`company`|`team`|`accommodation`|
  `service`], starts_at, ends_at, status [`open`|`held`|`booked`], server-side
  timestamps). Today only `workers.availability_status/available_from` +
  `worker_availability_preferences` + `booking_requests` (proposals) exist — no
  published slots.

### 5.4 Active-company context (correction #6, optional)
- The hub/profile list companies and link each channel (stateless, honest). A
  persisted "active company" selection would need `profiles.active_organization_id`
  (additive, nullable FK). Deferred — the list/launcher works without it.

### 5.5 Organization positions (§5.4 doctrine, pre-existing gap)
- `organization_positions` is described in doctrine §5.4 but not yet schematized.
  Out of scope here; noted for the same owner-gated batch.

All of the above are **RED-class** (new tables / new RPCs / possible
SECURITY DEFINER) and must go through the human gate, not auto-merge.

## 6. Verification

- `pnpm -F web typecheck` — clean.
- `pnpm -F web lint` — clean.
- `pnpm -F web build` — succeeds (the `/dashboard/marketplace` route builds).
- `pnpm -F web test` — full guard suite green, incl. the new
  `compact-nav-marketplace-ia` guard that locks the compact nav + honest hub.
- Authenticated browser smoke is run by the owner locally (Google login); the
  capture script is `apps/web/scripts/capture-ia-proof.mjs`.
