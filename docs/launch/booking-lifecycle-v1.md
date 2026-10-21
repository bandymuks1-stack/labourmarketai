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
| expired (once `booking-expiry-daily` is applied) | Outgoing row, muted chip | Incoming row, muted chip | **Find another worker** / propose again | none needed | same |

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
(`lib/booking/booking-state.ts`). Until 2026-10-21 no scheduler existed, so
only an admin calling `expire_stale_booking_requests_v1` could reach it.

**2026-10-21 (CAL-6, RED, owner-gated):** migration
`20261021130000_booking_expiry_system_schedule_v1` adds a system-only twin,
`expire_stale_booking_requests_system_v1` (EXECUTE revoked from every API
role; only the database owner can call it), and the pg_cron job
`booking-expiry-daily` (04:11 UTC). It expires exactly the rows the admin
function would: `proposed`, past the response deadline, or with no deadline
and 14 days since the latest proposal. The event names the lapsed proposer
with reason_note `system_expiry`. The page already renders the translated
`expired` chip.

- The UI still makes **no countdown promise**: no "expires in" copy.
- No server action writes `expired`; only the database does.

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

Expanded (booking lifecycle smoke guards, 2026-07-06): withdraw mounts
exactly once and only in the outgoing `proposed` branch (the worker's
incoming list has no withdraw affordance); accept/decline stays
worker-list-only; the full 75-combination from×to×actor transition
matrix is swept against exactly the documented table (default-closed);
no server action can write `expired` (literal absent + the respond
decision is type-narrowed to `accepted | declined`); booking migrations
install no pg_cron/scheduler except the reviewed `20261021130000` system expiry; every status renders a translated chip in
all three locales; the lt/en/ru `bookings` namespaces expose an
identical key set; and `countOwnerResponsesSince` gets behavioural edge
cases (withdrawn/expired never count, NaN timestamps ignored, seenAt tie
is not "new") in `lib/booking/booking-state.test.ts`.
