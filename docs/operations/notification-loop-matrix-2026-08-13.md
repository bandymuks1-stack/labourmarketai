# Notification loop matrix — "how does the other person find out?" (2026-08-13)

Durable store: `notification_events` APPLIED to production 2026-08-13
(ledger `20260813065236`). Emitters fire server-side AFTER the domain write,
idempotent via `(recipient, dedupe_key)` UNIQUE; the bell merges durable rows
beside the derived spine; `markAllRead` persists. Events begin accumulating
with live traffic from the apply moment — no production row can be
manufactured to prove it (no synthetic data), so live-event evidence is
`NOT_ENOUGH_EVIDENCE` until real traffic produces one; the mechanism itself
is `VERIFIED_LOCAL` (112 tests) + `VERIFIED_DB` (table, RLS, grants).

| Transition | How the counterparty learns | State |
|---|---|---|
| booking proposed | durable `booking_proposed` → bell + href | WIRED (live from apply) |
| booking accepted | durable `booking_accepted` | WIRED |
| booking rejected | durable `booking_declined` | WIRED |
| booking cancelled/withdrawn | **no durable event** — row state only on next visit | **GAP → v2 draft, owner-gated** |
| engagement created | durable `engagement_created` | WIRED |
| engagement ended | **no durable event** (the F2 rider informs only the ACTOR) | **GAP → v2 draft, owner-gated** |
| absence requested | durable `absence_requested` | WIRED |
| absence approved | durable `absence_approved` | WIRED |
| absence rejected | durable `absence_rejected` | WIRED |
| relevant job match | derived spine `newJobMatches` count | DERIVED (appropriate: a match is a standing state, not a one-time event) |
| inquiry state change | inquiry surfaces + spine attention counts | DERIVED — acceptable for beta; durable candidate later |
| unread message | derived spine unread count | DERIVED (unread IS derived state — correct shape) |
| invitation | derived spine `pendingInvitations` | DERIVED (standing state) |
| task/action attention | derived spine `openTaskAttention` | DERIVED (standing state) |

Doctrine: durable events are for "this HAPPENED to you" (outcomes that vanish
from source rows); derived counts are for "N things need attention NOW".
A standing state that clears itself when acted on belongs to the spine; a
one-time outcome belongs to the durable store. The two GAP rows are one-time
outcomes and therefore belong durable — hence the v2 draft
(`20260813100000_notification_events_v2_types.sql`, owner-gated, UNAPPLIED).
