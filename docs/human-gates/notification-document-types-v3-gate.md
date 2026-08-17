# HUMAN GATE — notification event types v3 (document engine)

Migration: `supabase/migrations/20260817140100_notification_document_types_v3.sql`
Rollback:  `supabase/rollbacks/20260817140100_notification_document_types_v3.down.sql`
State: `PENDING APPLY BY LEAD` — pre-approved by owner mandate 2026-08-17
(autonomous functional completion train V2, §4 migration authority). Apply
via Supabase MCP `apply_migration` AFTER (or together with)
`20260817140000_document_file_layer_v1.sql`.

## What it changes
TWO check constraints on `public.notification_events`, both strictly
widened: `event_type` grows by `document_ack_assigned`,
`document_ack_completed`, `document_expiring`; `entity_type` grows by
`worker_document`, `org_document`, `document_acknowledgement`. The
re-added lists BUILD ON Train B's `20260817130100_notification_events_v3_
workflow_types.sql` — they are the UNION (9 v2 types + 4 workflow types +
3 document types; entities: the v2 three + `workflow_instance` + the three
document entities), so the apply order is 130000 → 130100 → 140000 →
140100. No RLS, grant, index, column or row changes — the v1 posture (anon
nothing; recipient-only read + read_at mark; service-role-only writer;
dedupe UNIQUE) is untouched.

## Why
The Document & Evidence Engine adds three durable facts a person must not
miss while offline: being asked to confirm a document version, that
confirmation arriving, and a document entering its 30-day expiry window
(the audit's "expiry PARTIAL: no reminder type" gap). Emitters ship
code-side and stay inert until this constraint admits their type names.

## What the lead applies
> `20260817140100_notification_document_types_v3` — exactly that one apply,
> after the file-layer migration. Rollback restores the v2 lists (and
> removes v3-typed rows first, stated honestly in the down file).
