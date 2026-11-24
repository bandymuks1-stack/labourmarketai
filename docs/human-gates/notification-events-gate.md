# HUMAN GATE — durable notification events (`notification_events`)

Migration: `supabase/migrations/20260810070000_notification_events_v1.sql`
Rollback:  `supabase/rollbacks/20260810070000_notification_events_v1.down.sql`
State: `APPLIED_TO_PRODUCTION` — owner approved in the V8 continuation directive
(2026-08-13) conditional on all safety gates GREEN; every gate re-verified GREEN
that day and the migration applied via Supabase MCP `apply_migration`.
Production ledger row: version `20260813065236`, name `notification_events_v1`
(apply-time-as-version drift, match on name). Full apply record:
`docs/APPLIED_LEDGER.md` §2026-08-13.

## Problem, measured (2026-08-10)

Production has NO notification storage. The bell derives 9 counts at render
time (`lib/notifications/spine-signals.ts`); nothing is durable, `markAllRead`
is a client setState reverted by the next hydration, and outcome events
(absence approved/rejected, booking answered, engagement created) vanish the
moment their source rows change state. A worker who was offline when their
absence was rejected never learns it happened.

## What the migration adds — exactly one table

`notification_events`: append-only per-recipient event rows
(booking_proposed/accepted/declined, absence_requested/approved/rejected,
engagement_created), with:

- `(recipient_profile_id, dedupe_key)` UNIQUE — idempotent emitters;
- bounded `metadata` (≤ 2 KB, adapter-allowlisted to `country`/`roleSlug`/`startDate` — never free text);
- RLS: **anon nothing**; **authenticated** SELECT own + UPDATE of the
  `read_at` COLUMN only (column-level grant), own rows only; **service_role**
  is the only writer. INSERT is deliberately NOT granted to authenticated —
  users cannot fabricate events.

RED by construction (new table + RLS + GRANT/REVOKE). Rollback drops the
table; every reader/writer degrades to `feature_unavailable` and the product
renders exactly the pre-migration bell.

## What is already wired in code (inert until applied)

- Emitters fire AFTER the domain RPC succeeds, fire-and-forget:
  booking propose/respond (`lib/booking/booking-actions.ts`), absence
  request/review (`lib/leave/absences-actions.ts`), engagement creation
  (v3 accept). Recipients are resolved from the stored rows
  (`lib/notifications/event-emitters.ts` — recipient decisions stated there).
- The bell merges durable rows (no `href` ⇒ the existing mark-all-read
  control appears) beside the derived spine (`spine-stream.tsx`).
- `markAllRead` now PERSISTS via `markAllNotificationEventsReadAction`
  (caller's own client; RLS + column grant scope it to own read markers).
- Localized type labels exist in all 11 locales
  (`auth.notifications.types.event_*`).

## What the owner is being asked

> Apply `20260810070000_notification_events_v1` to production (via Supabase
> MCP `apply_migration`), so notification events become durable and
> mark-all-read persists?

Approving this gate authorizes exactly that one apply. It does NOT authorize
any sending channel (email/push/Telegram), any scheduler, or any further
migration.

## Checksums this gate binds to

**State the normalization or the check cannot be run.** Both files are stored
CRLF in this repo, and the two hashes originally recorded here were computed
under DIFFERENT conventions — the migration as-is (CRLF), the rollback
LF-normalized. Verified 2026-08-11: **both files are intact**, but anyone
checking them consistently one way saw a false mismatch on the other file, and
a false "the rollback drifted" is exactly the kind of scare that gets a
baseline regenerated for no reason. Every hash below is therefore given under
both conventions, and the command that produces it is written out.

| Artefact | LF-normalized (`tr -d '\r' \| sha256sum`) | As-is / CRLF (`sha256sum`) |
|---|---|---|
| `20260810070000_notification_events_v1.sql` | `c71a3b18c8ab959ef9dfc284f20ad4c30ac556145f63064ba67a24b72f1c3658` | `d738eac3a5520423b5504b992a17a35281e4fb5b2f1bcd48ac33a88d893648ee` |
| `20260810070000_notification_events_v1.down.sql` | `d62307659ad6f1b61f20a18847fd34e078d85ebc7ac9fa95308a5412a7408452` | `adb07a88da876aaa9b2ae9a1419a6270dacbd945b16e786f4a4fb0de12758fe2` |

Comment-stripped executable body of the migration (`--` comment lines removed,
which is what actually runs) — the same value under either convention:
`2391723f5f32f5c6485e987281eedfad3a72edd8a16e28fdeb845fc5195c1a51`

```bash
# verify before applying — run from the repo root
M=supabase/migrations/20260810070000_notification_events_v1.sql
R=supabase/rollbacks/20260810070000_notification_events_v1.down.sql
tr -d '\r' < "$M" | sha256sum          # expect c71a3b18…
tr -d '\r' < "$R" | sha256sum          # expect d6230765…
tr -d '\r' < "$M" | grep -v '^\s*--' | sha256sum   # expect 2391723f…
```

The two originally-recorded values are kept above rather than replaced, so a
reader holding the old gate text can still match what they have.

## Re-verified against `main` (2026-08-11, PUBLIC BETA TRAIN V5_1 §5)

Re-derived at `main` `b9639968`, read-only, nothing applied:

- **Production still has ZERO notification tables** —
  `select count(*) from information_schema.tables where table_schema='public'
  and table_name like '%notification%'` returns `0`. The migration remains
  UNAPPLIED; every claim in this gate about "what production does today"
  still holds.
- **The emitters are wired, not just written.** `emitBookingNotification`,
  `emitAbsenceNotification` and `emitEngagementCreatedNotification` are called
  from the real domain actions — `lib/booking/booking-actions.ts` (propose,
  accept, decline, engagement creation) and `lib/leave/absences-actions.ts`
  (request, review). They are fire-and-forget AFTER the domain RPC succeeds,
  so an emit failure cannot fail a booking or an absence.
- **Both artefacts are byte-intact** at the checksums above.

Nothing in this re-verification changes the decision being asked. It is still
one apply, and it is still the owner's.
