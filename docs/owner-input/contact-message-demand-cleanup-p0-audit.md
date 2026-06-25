# Contact / message / demand + duplicate-exits cleanup — P0 audit

> One coherent P0 audit of contact flows, message context, demand lifecycle, and
> duplicate exits/CTAs. **Audit-first.** Safe fixes only; everything needing
> schema/RLS or a product decision is documented, not faked or unilaterally
> removed. **No DB/schema/migrations/RLS/Supabase/env/DNS/billing/payment/
> auth-core changes.**

## Legend
🟢 GREEN works with a real route/action · 🟡 YELLOW route exists but UX/context limited · 🔴 RED missing backend/RLS/permission (owner-gated).

---

## A. Duplicate exits / competing actions (inventory)

Method: counted every visible entry point per concept across nav, dropdown,
dashboard cards, and the room pages. Most flagged duplicates are **guard-pinned
intentional decisions** (cross-identity reachability) or **context-appropriate**
(same destination from different surfaces) — so they are listed as
**owner-decision recommendations**, not removed unilaterally.

| Concept | Entry points | Verdict |
|---|---|---|
| **Logout** | `account-menu.tsx` (header, every page) + `account/page.tsx` (settings) | 🟢 OK — header + settings is the intended pair |
| **Account/settings** | `account-menu.tsx` + `IdentityActions` "Manage spaces" (`identity-manage-spaces`) + `CurrentSpaceHeader` `room-my-spaces-link` + each room page's `room-my-spaces-link` | 🟡 the dashboard overview reaches account via BOTH `CurrentSpaceHeader` mySpaces AND `IdentityActions` "Manage spaces" — a same-screen duplicate. **`identity-manage-spaces` is guard-pinned** (`dashboard-active-role-overview.test.ts:33`, deliberate "other identity reachable") → **owner-decision to remove** |
| **Profile** | `IdentityActions` profile card + `account-menu` Skills (`#candidate-skills`) + `account/page.tsx` edit-identity link | 🟡 3 ways; each is guard-pinned (canonical-paths-integrity requires account→profile; account-menu Skills is the only deep-link to skills) → **owner-decision** |
| **Mano CV / journal** | primary nav tab + bottom nav + `DashboardChainActions` | 🟢 OK — nav + one chain action, no same-screen dup |
| **Add / manage company** | `IdentityActions` create-CTA (no company) / company link (has company) + `RoleSwitcher` add + `Profile` managed-companies add | 🟡 company **creation** reachable 3 ways (dashboard identity, role switcher, profile). All context-distinct + guard-pinned → **owner-decision to pick one canonical "add company"** |
| **Market map / Žemėlapis** | primary nav tab + bottom nav + `IdentityActions` person card | 🟢 OK (nav + one card) |
| **Message / contact** | `profile` (→employer), `company-workers-section` (→roster worker), `scouting` (→shortlisted) | 🟢 OK — context-specific, no overlap |
| **Demand entry** | dashboard `DemandRequestButton` + role-page `DemandDraftForm` (company/agency/buyer) | 🟡 company/agency can start a demand from the dashboard hero AND the role page; both write the same `customer_requests` row → **owner-decision to pick one** |
| **Admin** | `RoleSwitcher` badge + `dashboard-tabs` (desktop) + `account-menu` (mobile) — **not** in bottom nav | 🟢 OK — intentional gated hierarchy, doesn't dominate mobile |
| **Manage spaces / role switch** | `RoleSwitcher` (header, real in-place switcher) + `IdentityActions` "Manage spaces" (→ account) | 🟡 "Manage spaces" label is misleading (navigates to account; the real switcher is the header `RoleSwitcher`) → **owner-decision** |

**No dead/old routes found** — every link resolves. No misleading dead tiles.

### Disposition (what changed in this PR)

| Duplicate / hidden exit | Disposition | File / component |
|---|---|---|
| Account dropdown **Skills** link (`/dashboard/profile#candidate-skills`) | **REMOVED** from dropdown — skills live on the Profile surface | `components/app/account-menu.tsx` |
| Account dropdown **Projects** link (`/dashboard/projects`) | **REMOVED** from dropdown — reachable from the company / project-operations context | `components/app/account-menu.tsx` |
| Account dropdown **Instructions** link (`/dashboard/instructions`) | **REMOVED** from dropdown — reachable from attention-instructions / ops board | `components/app/account-menu.tsx` |
| Account dropdown **Bookings** link (`/dashboard/bookings`) | **CONSOLIDATED → GREEN (implemented)** — removed from dropdown; **home = `Žinutės`**. A real `booking_requests` read model already exists (`listMyBookings`, migration `20260613100100`, RLS-scoped). Added `getPendingIncomingBookingCount()` (real count of incoming `status='proposed'`; **0 on any non-ok state** → no fake badge). Žinutės shows a compact booking link **only when count > 0**; the dashboard shows a next-action card **only when count > 0**. Not a primary nav item, not in the dropdown. | helper `lib/booking/booking-actions.ts`; `app/[locale]/dashboard/communication/page.tsx`; `app/[locale]/dashboard/page.tsx`; guard `booking-visibility-honest.test.ts` |
| Account dropdown = utility-only (Admin gated + Account + Logout) | **CONSOLIDATED** to the owner's required contents | `components/app/account-menu.tsx`; guard `feature-reachability.test.ts` updated |
| `feature-reachability` guard (pinned product links IN the dropdown) | **GUARD UPDATED** to the corrected logic (utility-only dropdown; product routes reachable from product context) | `lib/guards/feature-reachability.test.ts` |
| `IdentityActions` "Manage spaces" link (`identity-manage-spaces`) | **KEPT WITH REASON** — guard-pinned cross-identity reachability (`dashboard-active-role-overview.test.ts:33`); the dashboard also reaches account via `CurrentSpaceHeader`. Flagged for owner decision to remove (would need that guard updated). | — |
| `IdentityActions` dashboard tile **Market Map** (`/dashboard/market-map`) | **REMOVED** — top-nav duplicate; removed from `PERSON_ACTIONS` (was already absent from the dashboard `FOCUS_PERSON` subset). Map reached via the Žemėlapis top-nav tab. | `components/app/identity-actions.tsx`; guards `market-map-nav.test.ts` + `command-center.test.ts` + `no-duplicate-top-level-entries.test.ts` updated |
| `IdentityActions` dashboard tile **Communication** (`/dashboard/communication`) | **REMOVED** — top-nav duplicate; removed from `FOCUS_PERSON` + `PERSON_ACTIONS`. Unread is already surfaced on the Žinutės nav **badge** (real count), so no generic tile needed. A message dashboard card is allowed later **only** when tied to real action-needed data. | `components/app/identity-actions.tsx`; same guards updated |
| Dashboard person tiles after cleanup | **KEPT** — true next-actions only: **Profile · Find work · Readiness** (no top-nav duplicates) | `components/app/identity-actions.tsx` |
| Company **create** reachable 3 ways (identity create-CTA, role switcher, profile add) | **KEPT / owner-decision** — context-distinct, each guard-pinned; recommend one canonical "add company". | — |
| Demand **entry** 2 ways for company/agency (dashboard hero + role-page form) | **KEPT / owner-decision** — recommend one canonical demand entry. | — |

---

## B. Contact flows

| From | Real action? | Verdict |
|---|---|---|
| Worker profile → **their employer** | `MessageButton` → `openDirectConversationAction` → `getOrCreateDirectConversation` | 🟢 GREEN |
| Company → **linked roster worker** | `company-workers-section.tsx` `MessageButton` | 🟢 GREEN |
| Demand **scouting** → shortlisted worker | `RequestCommunicationButton` → `requestWorkerConversationAction` (gated: owns demand + shortlisted + contactable) | 🟢 GREEN |
| CV / player card | none (player-card redirects to Mano CV; CV is print/export) | 🟡 YELLOW — no contact surface here by design |
| Demand readback row | none (matching happens via scouting, not the readback) | 🔴 RED — by design |
| Market map marker/layer | none (read-only; only own signal) | 🔴 RED |
| **Arbitrary stranger** (any worker/company/person) | blocked by the conversation RLS (participants must already be related) | 🔴 RED — needs a contact-permission model |

Contact is correctly **permission-gated to already-related parties**; no fake
contact CTAs added. Stranger-contact from map/CV/browse is **RED** (RLS +
permission model — owner-gated).

---

## C. Messages context (`/dashboard/communication`)

- **Counterpart identity:** 🔴 **honest-unknown** in list + thread ("Pašnekovas nepatikslintas" / "Other") — the list/thread do not join `conversation_participants → profiles`. Showing the real co-participant name needs an RLS-safe read (a participant cannot currently read a co-participant's profile) → **RED (RLS)**.
- **Source/object context:** 🟢 the conversation **`subject` is already shown** as the thread title in both the list (`page.tsx:126`) and the thread header — and scouting threads set `subject` = the **real demand title** (`request-worker-conversation.ts:101`). So the "what it's about" IS surfaced when present. A typed link (demand_id / offer_id / company_id) does **not** exist in the `conversations` schema → richer object-context is **RED (schema)**.
- **No fake data:** 🟢 no fabricated names; no fake delivered/read receipts (only an honest per-participant `last_read_at` = "I opened this thread"). Empty state is honest ("no messages"). Guarded by `communication-card-clarity.test.ts`.

**Safe state:** already honest with real subject-context shown. The only gaps
(real counterpart name, typed object link) are RED.

---

## D. Demand / request lifecycle

| Action | State |
|---|---|
| Create draft | 🟢 `saveDemandDraft` (RPC) |
| Submit | 🟢 `submitDemandRequest` (RPC; status hard-pinned `submitted`) |
| View / read-back + honest status | 🟢 `listOwnCustomerRequests` → `DemandRequestsReadback` (real status enum; `manageHelp` copy) |
| Delete **draft** | 🟢 `deleteDemandDraft` (soft → `closed`; owner UPDATE allowed) |
| **Edit** submitted | 🔴 RED — no owner action/RPC (RLS blocks demoting `submitted`) |
| **Close / cancel** submitted | 🔴 RED — status promotion is **admin-only** |
| **Delete** submitted | 🔴 RED — DELETE policy is **admin-only** |
| Map/location relation | 🟢 signal-only (`addDemandLocation` hard-nulls lat/lng; honest "not on map yet") |

The read-back already shows honest status + a `manageHelp` line stating
self-serve edit/close is not available yet. No fake status changes added.

---

## E. Map relation (unchanged, confirmed)

🟢 One canonical map (`/dashboard/market-map`, single `MarketMapBase`);
`/dashboard/marketplace` redirects to it; person/company/needs are layers;
no fake coordinates; company with no location shows the incomplete layer; own
needs show off-map. (Locked by `mobile-map-workspace.test.ts`.)

---

## What this PR changes (safe)

- **Account dropdown is now utility-only** — removed the hidden product links
  (Skills, Projects, Instructions, Bookings) from the user-name menu; kept
  **Admin (gated) + Account + Logout** (`components/app/account-menu.tsx`). Skills
  stays on Profile; Projects + Instructions stay reachable from their product
  context; **Bookings** has no primary-IA home → documented RED (route valid,
  not surfaced) — no dead link.
- **Guard updated** `feature-reachability.test.ts` — rewritten to the corrected
  logic (dropdown utility-only; product routes reachable from product context),
  replacing the old assertions that pinned product links inside the dropdown.
- **New guard** `no-duplicate-top-level-entries.test.ts` (owner priority #5):
  locks the cleanup invariants so duplicate top-level entries can't silently
  return — compact primary nav, focused mobile bottom nav (core 4, no admin),
  admin only via gated secondary surfaces, one canonical map + marketplace
  redirect, single logout pair.
- **Top nav / bottom nav / account-as-settings / map-primary / profile↔CV /
  single-Žinutės** (owner points 1,2,5,6,7,8): re-verified already satisfied by
  PRs #497–#501 — no change needed.
- **Owner-decision items** (KEPT/RED above): `identity-manage-spaces`, the
  IdentityActions Market Map + Communication tiles, company-create paths, and
  demand-entry paths — each needs your approval before removing a guard-pinned
  path; recommendations recorded in the disposition table.

## RED — owner-gated gaps (not faked)

1. **Real counterpart identity** in messages — RLS-safe co-participant profile read (or a SECURITY DEFINER reader).
2. **Typed conversation context** (demand/offer/company/map link) — schema column on `conversations`.
3. **Demand edit / close / cancel / delete (submitted)** — owner-scoped RPC + RLS.
4. **Stranger contact** from map / CV / general browse — a contact-permission model (RLS).
5. **Duplicate-exit consolidations** (listed in §A) — each is a product decision needing your approval before removing a guard-pinned path.
