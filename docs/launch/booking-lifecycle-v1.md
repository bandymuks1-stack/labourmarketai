# Booking lifecycle v1 — status map and repairs

Status: implemented (quality-train PR C, 2026-07-06). Source of truth for
what each booking status means, who sees it, and what happens next.

## Context

- Table: `booking_requests` (migration `20260613100100`), statuses
  `proposed | accepted | declined | withdrawn | expired` (CHECK-pinned),
  all writes through SECURITY DEFINER RPCs
  (`propose_booking_request` / `respond_booking_request` /
  `withdraw_booking_request`), append-only `booking_request_events` log.
- Seen model: `booking_requests_seen` (applied to production 2026-07-06,
  ledger `docs/APPLIED_LEDGER.md`) — opening `/dashboard/bookings` is the
  read event; the notification spine's `booking-responses` signal counts
  responses after `seen_at`.
- The root-cause audit (flow #6) found: "after accept there is no calendar
  entry, journal link, or CTA. Accepted is a terminal dead-end."

## Lifecycle map (after PR C)

| Status | Proposer (company) sees | Worker sees | Next action (proposer) | Next action (worker) | Read/seen behavior |
|---|---|---|---|---|---|
| proposed | Outgoing row, status chip | Incoming row, Accept / Decline buttons | **Withdraw proposal** (new — the RPC existed with no UI) | Accept or Decline | pending count feeds bell + top slot |
| accepted | Outgoing row, success chip | Incoming row, success chip | **Send a message** (new — opens the conversation, grant `allowed_accepted_booking`) | **Send a message** (new — same action) | response counts via `booking_requests_seen`; visiting bookings clears |
| declined | Outgoing row, muted chip | Incoming row ("You declined") | **Find another worker** (new — links to scouting) | none needed (worker made the decision) | same |
| withdrawn | Outgoing row, muted chip | Incoming row, muted chip | none (proposer made the decision) | none needed | same |
| expired | — unreachable — | — unreachable — | — | — | — |

## Conversation grant

`openBookingConversationAction` (`lib/booking/booking-conversation.ts`) is
the exact twin of the accepted-service-request action: it re-verifies
server-side that the caller is the booking's owner or booked worker AND
that status is `accepted`, then passes the explicit
`allowed_accepted_booking` grant to `getOrCreateDirectConversation`. No
counterpart profile id reaches the client. Failure lands on the honest
`?notice=cannot_open` messages state.

## The `expired` status — honest handling decision

`expired` exists in the CHECK constraint and the pure state machine
(`lib/booking/booking-state.ts`) but **no scheduler, trigger or cron exists
anywhere in the repo**, so no row can ever reach it. Decision (per goal
rule "expired status either gets honest handling or is removed from active
UI if not fired"):

- KEEP it in the schema/state machine — removing it needs a production
  CHECK-constraint migration for zero user value.
- The UI makes **no expiry promise**: no countdown, no "expires in", no
  copy implying automatic lapse. The status label renders only if a row
  actually carries the status (currently impossible — honest degradation).
- If proposal expiry becomes a product need, it requires a scheduled task
  (pg_cron or an operator-run script) — that is its own PR with an owner
  decision, not an improvisation here.

## Deferred (not in this PR)

- Post-accept calendar/journal linkage (audit suggestion) — needs a
  product decision on what an accepted booking creates.
- Notification on booking events beyond the seen-model counts (push) —
  blocked on the push notification decision (§17).
- Marketplace accepted-request → propose-booking bridge — belongs to the
  marketplace↔opportunities bridge PR (quality-train PR D).

## Guards

`lib/guards/booking-lifecycle.test.ts` pins: accepted rows render the
message CTA in BOTH lists, outgoing proposed renders withdraw, outgoing
declined renders the scouting link, the conversation action requires
`accepted` + passes the explicit grant, the eligibility enumeration
carries `allowed_accepted_booking`, no expiry promise appears in booking
copy, and the three locales stay in parity for the new keys.
