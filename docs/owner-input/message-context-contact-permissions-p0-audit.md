# Message context + contact permissions — P0 audit

> One coherent P0 audit of **who you are messaging**, **what the conversation is
> about**, and **where contact is allowed vs blocked**. Audit-first; **safe
> UI/context-only fixes** applied, everything needing schema/RLS documented as
> RED (owner-gated), never faked. **No DB/schema/migrations/RLS/Supabase/env/DNS/
> billing/payment/auth-core changes.** Scope held at audit + safe report per the
> owner priority update — **draft PR only, not marked ready**.

## Legend
🟢 GREEN real data/action shown · 🟡 YELLOW route exists, identity/context limited · 🔴 RED missing RLS-safe read / schema link / permission model (owner-gated).

---

## A. Message thread identity (`/dashboard/communication` + thread detail)

| Question | List | Detail | Verdict |
|---|---|---|---|
| Shows a conversation type (direct/support/team)? | yes (`kind` chip) | yes (`kind` chip) | 🟢 |
| Shows the **counterpart identity**? | honest-unknown for direct/team ("Recipient not specified"); known for support | **was missing → now shown** (same honest model) | 🟡→ honest; real name 🔴 |
| Shows **what it's about** (subject)? | yes — real `subject` (scouting threads carry the real demand title) | yes | 🟢 |
| Shows **who started it** (you vs other)? | **was absent → now shown** (real `created_by` vs viewer) | **was absent → now shown** | 🟢 (new, this PR) |
| Shows the **source** (booking/demand/CV/map/company/direct)? | no typed link in schema | no | 🔴 (schema) |
| Avoids fake names / fake read / fake delivered? | yes — honest-unknown copy; only real `last_read_at` ("I opened this") | yes — `byYou`/`byOther` from real `author_id`; no delivered/seen | 🟢 |

**Data available now vs blocked:**
- Available (RLS-safe, real): `conversations.kind`, `subject`, `created_by`, `updated_at`; per-viewer `conversation_participants.last_read_at`; per-message `author_id`.
- Blocked: a co-participant's **name** (a participant cannot read another participant's `profiles` row → needs an RLS-safe reader / SECURITY DEFINER) → **RED (RLS)**. A typed **source link** (`demand_id`/`offer_id`/`company_id`/`booking_id` on `conversations`) does not exist → **RED (schema)**.

**Classification:** counterpart real-name = 🔴 RED (RLS); typed source = 🔴 RED (schema); type + subject + who-started-it = 🟢 GREEN and now shown on **both** list and detail.

---

## B. Existing contact actions (inventory)

| From | Route / component | Real action? | Calls | Permission check | If not allowed |
|---|---|---|---|---|---|
| Worker profile → **their employer** | `profile/page.tsx` + `message-button.tsx` | yes | `openDirectConversationAction` → `getOrCreateDirectConversation` | existing employment relation (RLS) | button absent | 🟢 |
| Company → **roster worker** | `company-workers-section.tsx` + `message-button.tsx` | yes | direct conversation | linked roster (RLS) | absent | 🟢 |
| Demand **scouting** → shortlisted worker | `company/scouting/page.tsx` + `request-communication-button.tsx` | yes | `requestWorkerConversationAction` | `evaluateCommunicationRequest` (ownsDemand && shortlisted && canContact), default-closed | honest blocked reason (`not_owner`/`not_shortlisted`/`not_contactable`) | 🟢 |
| Admin / matching workbench | `admin/matching/page.tsx` | yes (admin) | start conversation from a suggestion | admin RLS | absent | 🟢 |
| **CV / player card** | `worker-player-card.tsx`, `journal`, `reports/evidence` | **none** | — | — | no CTA at all | 🟡 by design (no contact surface) |
| **Market map** marker/layer | `market-map-live/base.tsx` | **none** | — | — | no CTA (read-only, own signal only) | 🔴 (no cross-user geo + no permission model) |
| **Demand readback** row | `DemandRequestsReadback` | **none** | — | — | no CTA (matching via scouting) | 🔴 by design |
| **Arbitrary stranger** (browse any worker/company) | — | **none** | — | conversation RLS requires already-related participants | no CTA | 🔴 (needs contact-permission model) |

Confirmed (guarded): CV/player-card/map/journal/evidence carry **no** `MessageButton` / `RequestCommunicationButton` / direct-conversation action — **no fake/stranger contact**.

---

## C. Contact permission model (current boundary)

Who can contact whom **today** (in-app conversation only — no phone/email, no quota):

- **Already-related parties only.** The `conversations`/`conversation_participants` RLS requires participants to already be linked; there is no "message any stranger" path.
- **Worker ↔ their employer** — allowed (existing relation).
- **Company ↔ roster worker** — allowed (linked roster).
- **Demand scouting → shortlisted worker** — allowed, gated by `evaluateCommunicationRequest` (default-closed: must own the demand, the worker must be shortlisted, and the worker must be contactable).
- **Booking participants** — bookings are a separate `booking_requests` model; there is **no** booking↔conversation link in schema (surfaced honestly as a separate Žinutės link when a real pending count exists).
- **Admin** — may join/support threads (admin RLS).
- **From map / CV / general browse** — **no stranger contact**; no general per-marker permission bridge; no free-contact quota (explicitly forbidden to fabricate — see `docs/audits/contact-permission-quota-bridge-v1.md`).

**Boundary statement:** contact is correctly **permission-gated to already-related parties**, default-closed. Everything beyond that (stranger contact, map/CV contact, booking-thread relation, real counterpart name, typed source) is **RED / owner-gated**.

---

## D. Safe implementation scope applied (UI/context-only, no schema)

1. **Honest thread origin** — a real, RLS-safe signal derived only from
   `conversations.created_by` vs the viewer: "You started this conversation" /
   "Started by someone else". Never reveals *who* the other party is; rendered
   only when `created_by` is known. Added to **both** the list and the thread
   detail. (`lib/communication/conversation-display.ts` → `deriveOriginKey`.)
2. **Thread-detail parity** — the detail header previously showed only the
   `kind` chip; it now shows the same honest counterparty + scope + origin as
   the list, so a thread can never hide who/what it is.
3. **Honest missing-context preserved** — direct/team counterpart + scope stay
   the honest-unknown copy (muted/italic), never a guessed name.
4. **No new CTAs** — no contact button added anywhere; blocked points stay
   without a CTA (no fake "contact not available" button either).

---

## E. Specific surfaces — disposition

1. **Communication page** — 🟢 fixed (safe): clearer thread context (type +
   subject + honest counterpart/scope + **new** who-started-it). Booking/request
   conversations: no real `conversations`↔booking relation in schema, so not
   faked — bookings stay an honest separate link (real pending count only).
2. **CV / player card** — 🟡 confirmed: no contact action by design; **no fake
   CTA**. Real contact lives in the employment/scouting context.
3. **Map** — 🔴 confirmed: marker is read-only (own signal only); no permission
   model for cross-user contact → no stranger contact, no CTA.
4. **Demand / request** — 🔴 contact from a submitted demand happens via the
   gated **scouting** flow, not the readback; no direct demand→contact CTA added.
5. **Booking** — 🟢 honest: bookings have real data and a real Žinutės link when
   pending > 0; **no fake message thread** created for a booking.

---

## F. Guards / tests

- **New** `lib/guards/message-context-contact-honesty.test.ts`:
  origin derived only from real creator-vs-viewer (never an id/name leak);
  thread detail reaches list-parity (counterparty + scope + origin testids);
  CV/player-card/map/journal/evidence expose **no** contact CTA;
  the real contact action stays default-closed (`evaluateCommunicationRequest`);
  **no fake delivered/seen/read receipts** in the thread UI;
  origin copy present in lt/en/ru.
- **Existing, still green** `communication-card-clarity.test.ts` (who/what/context
  model + page wiring) — unchanged contract, extended model is backward-compatible.

---

## Flows that WORK today (real + permission-safe)
1. Worker → their employer (direct).
2. Company → roster worker (direct).
3. Company scouting → shortlisted worker (request, default-closed gate).
4. Admin → support/any thread (admin RLS).
5. Booking pending surfaced honestly under Žinutės (real count only).
6. Thread context: type + subject + honest counterpart/scope + who-started-it.

## Flows BLOCKED today (and why)
1. Real counterpart **name** in a thread — RLS: a participant cannot read a
   co-participant's profile. **RED (RLS).**
2. **Typed source** (demand/offer/company/booking/map link) on a conversation —
   no schema column. **RED (schema).**
3. **Stranger contact** from map / CV / browse — no contact-permission model.
   **RED (RLS + permission).**
4. **Booking ↔ conversation** relation — no link in schema. **RED (schema).**

## Proposed owner-gated plan (NOT implemented — needs approval)
> Documented only. No schema/RLS work started, per owner hold.
1. **Counterpart name:** a SECURITY DEFINER reader returning only display
   name/role for a verified co-participant (privacy-scoped, like
   `scout-safe-view`), or an additive RLS read policy.
2. **Typed source:** additive nullable `source_kind` + `source_id` columns on
   `conversations`, set by the existing create actions (scouting already knows
   the demand) — additive, reversible.
3. **Stranger contact:** a real contact-permission model + RLS before any
   map/CV contact CTA (and the quota rules already documented as forbidden-to-fake).
4. **Booking thread link:** optional `booking_id` on `conversations` if booking
   chat is desired.

Each is **owner-gated**; this slice ships **none** of it.
