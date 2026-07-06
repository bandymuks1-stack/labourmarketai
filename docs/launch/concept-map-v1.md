# LabourMarket.ai — In-app concept map v1 (audit PR7)

> Generated 2026-07-06 on top of `docs/launch/full-project-mobile-root-cause-audit-v1.md`
> (§9 concept collision table) and merged PRs #638–#641. Scope: the
> authenticated in-app product only — landing/public marketing pages are on
> hold by owner instruction and untouched. Every claim below was re-verified
> against `origin/main` @ 4f05bf8 before this PR edited anything.

## How to read this

Each concept is classified into exactly one action bucket:

- **KEEP** — canonical; do not rename, do not duplicate.
- **RENAME** — label/copy drift only; fixed in this PR where safe.
- **BRIDGE** — real product connection missing; needs its own PR (and
  sometimes an owner decision) — copy must not pretend the bridge exists.
- **LATER** — roadmap; keep honest "coming later" framing only.
- **REMOVE** — phantom concept with zero data model; purged from copy.

## 1. Canonical vocabulary (the one-line dictionary)

| Concept | LT | Data model | Meaning |
|---|---|---|---|
| Opportunity | Galimybė | `customer_requests` → `list_open_demand_for_workers` | Verified-company work demand a WORKER can act on |
| Service offering | Paslauga | `service_offerings` | A service a PROVIDER publishes |
| Service request | Paslaugos užklausa | `service_offering_requests` | A buyer→provider ask on a published offering |
| Accepted request | Priimta užklausa | `status='accepted'` on the request | The working engagement — **there is no separate "order" object** |
| Booking | Rezervacija | `booking_requests` | Scheduled engagement for a demand+worker pair |
| Journal | Darbo žurnalas | `journal_entries` | Evidence of completed work |
| Customer (role) | Užsakovas / klientas (RU: заказчик) | `profiles.active_role='customer'` | The buyer ROLE — legitimate vocabulary, not the phantom order |

## 2. Concept decisions

| # | Concept pair (audit §9) | Bucket | This PR | Notes / owner decision |
|---|---|---|---|---|
| 1 | Opportunity vs service request | KEEP both, distinct | — | Two real, separate models. Longer-term intake merge = owner decision (audit §17.2/§17.3). |
| 2 | Request vs **"order/užsakymas/заказ"** | **REMOVE (phantom)** | ✅ purged | Zero data model behind "order". 35 copy values rewritten across lt/en/ru to request/booking vocabulary. RU "заказчик" and LT "užsakovas" (= customer role) are explicitly KEPT. |
| 3 | Order vs reservation | BRIDGE | copy honesty only | Accepting a marketplace request creates NO booking. The "A confirmed order becomes a booking" claim was fake and is now "Plan work and bookings" (destination description). Whether accepted requests should create bookings = owner decision. |
| 4 | Reservation vs calendar | LATER | — | Bookings list is the surface; calendar explicitly future. Dead `worker_availability_preferences` schema noted for a future migration PR (needs owner gate). |
| 5 | Profile vs work card vs player card | BRIDGE (one readiness module) | — | Four parallel completeness engines remain; consolidation is a code refactor PR, not naming. Deferred — too wide for this PR. |
| 6 | CV vs journal vs skills | KEEP model, BRIDGE stores | — | Vocabulary is already honest; store consolidation is schema work (owner gate). |
| 7 | Journal evidence vs action | KEEP | — | Legacy `action`→`decision` backfill is a data migration (owner gate). |
| 8 | Map visibility vs work location | BRIDGE | — | Three location models; copy honesty was partially fixed in earlier PRs; cross-user read = product decision. |
| 9 | Company vs personal actions | BRIDGE | — | Gate checks role possession while header shows active workspace; needs owner decision §17.7. |
| 10 | Marketplace vs opportunities | KEEP both, distinct labels | verified | "Galimybės" = work for workers (demand side); "Turgus" = services catalogue (supply side). In-app labels verified consistent after #641; full naming merge/bridge = owner decision §17.2. |
| 11 | Messages vs transaction step | BRIDGE | — | `/dashboard/inbox` is already labeled "Darbų peržiūra" (review queue), not messages — verified, no rename needed. Conversation↔transaction FK = later PR. |
| 12 | Reports vs documents | KEEP labels | — | Honest "browser print" copy verified still in place. |

## 3. What this PR changed (exact scope)

1. **Phantom "order" purge** — every in-app catalog value that presented a
   nonexistent order object was rewritten to canonical request/booking
   vocabulary: 11 lt values, 12 en values, 12 ru values (keys listed in the
   guard). The customer ROLE words (užsakovas/заказчик) are untouched.
2. **Fake connection claim removed** — `marketplace.connections.calendarNote`
   claimed "A confirmed order becomes a booking"; no such bridge exists in
   code (verified: accepted rows render a Message CTA only,
   `components/app/marketplace-loop-section.tsx:297,387`). Copy now describes
   the real destination ("Plan work and bookings").
3. **Stale source comments** in `service-requests/page.tsx` rewritten (the
   comment itself claimed the fake bridge).
4. **Drift guard** — `lib/guards/concept-naming-drift.test.ts` bans the
   phantom vocabulary from in-app namespaces in all three served locales
   (lt `užsakym*`, en `order/orders/ordering`, ru `заказ*` except `заказчик*`)
   and pins the honest calendarNote so the fake bridge claim cannot return.

## 4. Explicitly NOT done here (stop-condition compliance)

- No marketplace↔opportunities loop merge or bridge (owner decision).
- No `customer_requests.approved` consumer (needs product decision on what
  approved unlocks — flagged in audit §10).
- No interest-`reviewed` worker-side surface (needs UX decision + possibly
  schema; `contacted` was bridged in #640).
- No per-card verdict consolidation on opportunities (UI-logic change —
  proposed as its own small PR after PR8's pattern work).
- No route renames (all routes stable; labels were already canonical).
- No landing/public marketing file touched.
