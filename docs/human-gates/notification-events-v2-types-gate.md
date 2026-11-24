# HUMAN GATE — notification event types v2 (`booking_withdrawn`, `engagement_ended`)

Migration: `supabase/migrations/20260813100000_notification_events_v2_types.sql`
Rollback:  `supabase/rollbacks/20260813100000_notification_events_v2_types.down.sql`
State: `APPLIED_TO_PRODUCTION` — owner conditionally approved in the V8
continuation directive (2026-08-13); every gate verified GREEN and applied the
same day via Supabase MCP `apply_migration`. Production ledger row: version
`20260813072402`, name `notification_events_v2_types`. Full record:
`docs/APPLIED_LEDGER.md` §2026-08-13 (decision A).

## What it changes
ONE check constraint on `public.notification_events`: the `event_type`
allowlist grows by `booking_withdrawn` and `engagement_ended`. No RLS, grant,
index, column or row changes. The v1 posture (anon nothing; recipient-only
read + read_at mark; service-role-only writer; dedupe UNIQUE) is untouched.

## Why
The V8 notification-loop matrix (docs/operations/notification-loop-matrix-2026-08-13.md)
answers "how does the other person find out?" for every critical transition.
Two answers were "they don't, durably": a withdrawn booking and an ended
engagement. Emitters ship code-side and stay inert until this constraint
admits their type names.

## What the owner is asked
> Apply `20260813100000_notification_events_v2_types` to production?
Approving authorizes exactly that one apply. Rollback restores the v1 list
(and honestly states any v2-typed rows must be removed first).
