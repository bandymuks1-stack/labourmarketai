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

**No dead/old routes found** — every link resolves (re-confirmed; consistent with the PR #499 nav audit). No misleading dead tiles.

**Why nothing was force-removed:** every flagged duplicate is either (a) pinned
by a guard encoding a prior deliberate decision (e.g. `identity-manage-spaces`
for cross-identity reachability), or (b) a context-appropriate second surface.
Removing a user-reachable exit is a **product decision** — listed here for your
per-item approval rather than changed unilaterally.

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

- **No risky removals** — all flagged duplicate exits are guard-pinned
  intentional decisions or context-appropriate; removing a user exit is a
  product decision listed above for your per-item approval.
- **New guard** `no-duplicate-top-level-entries.test.ts` (owner priority #5):
  locks the cleanup invariants so duplicate top-level entries can't silently
  return — the compact primary nav set, the focused mobile bottom nav (core 4,
  no admin), admin reachable only via gated secondary surfaces, one canonical
  map + marketplace redirect, and the single intended logout pair.

## RED — owner-gated gaps (not faked)

1. **Real counterpart identity** in messages — RLS-safe co-participant profile read (or a SECURITY DEFINER reader).
2. **Typed conversation context** (demand/offer/company/map link) — schema column on `conversations`.
3. **Demand edit / close / cancel / delete (submitted)** — owner-scoped RPC + RLS.
4. **Stranger contact** from map / CV / general browse — a contact-permission model (RLS).
5. **Duplicate-exit consolidations** (listed in §A) — each is a product decision needing your approval before removing a guard-pinned path.
