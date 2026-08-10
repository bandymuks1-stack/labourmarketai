# HUMAN GATE — durable notification events (`notification_events`)

Migration: `supabase/migrations/20260810070000_notification_events_v1.sql`
Rollback:  `supabase/rollbacks/20260810070000_notification_events_v1.down.sql`
State: `AWAITING_OWNER_DECISION` — ships UNAPPLIED; nothing in production changes until applied.

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

- migration sha256: `d738eac3a5520423b5504b992a17a35281e4fb5b2f1bcd48ac33a88d893648ee`
- rollback sha256: `d62307659ad6f1b61f20a18847fd34e078d85ebc7ac9fa95308a5412a7408452`
- migration sha256 (comment-stripped executable): `2391723f5f32f5c6485e987281eedfad3a72edd8a16e28fdeb845fc5195c1a51`
