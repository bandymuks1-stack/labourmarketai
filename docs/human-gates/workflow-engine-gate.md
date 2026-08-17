# Human gate — Workflow & Approval Engine v1

Status: **PENDING APPLY BY LEAD** (not applied to production).

## What this gate covers

Two migrations, applied IN ORDER, both via Supabase MCP `apply_migration`
(never `db push`):

1. `supabase/migrations/20260817120000_workflow_engine_v1.sql`
   — 7 new tables, 3 trigger guards, 4 helper functions, 8 SECURITY DEFINER
   commands, fail-closed SELECT-only RLS, RPC-only writes. Zero existing
   objects touched, zero DML at apply time.
2. `supabase/migrations/20260817121000_notification_events_v3_workflow_types.sql`
   — pure widening of the two `notification_events` CHECK constraints
   (4 workflow event types + the `workflow_instance` entity type).

Paired rollbacks:
- `supabase/rollbacks/20260817120000_workflow_engine_v1.down.sql`
- `supabase/rollbacks/20260817121000_notification_events_v3_workflow_types.down.sql`

## Authority

Owner mandate 2026-08-17 (autonomous functional completion train V2, §4
migration authority) pre-approves the `@human-gate-approved` annotation on
both files. The annotation states the ROUTE — the apply act itself belongs
to the LEAD session, which verifies CI green and applies to
`gorgitwvdzxbnaxhrsrw` manually.

## Safety class

RED by construction (new RLS-bearing tables + SECURITY DEFINER functions +
GRANT/REVOKE + triggers; constraint drop/re-add). There is no non-RED way
to ship a row-level-secured write engine.

Key invariants the reviewer can check in the files:

- Escalation (`mark_overdue_workflow_steps_v1`) never references the
  `decision` column — it flips step status to `escalated` and records a
  transition. NOTHING is ever approved automatically. No AI anywhere.
- `decide_workflow_step_v1` takes `for update` on the instance row
  (concurrency), fills a decision only `where decision is null`
  (fill-once, double-enforced by the `workflow_approvers_fill_once` trigger)
  and answers idempotently on repeats.
- `workflow_transitions` is append-only for EVERY role (trigger raises on
  UPDATE/DELETE).
- Authority: governance (authoring, cancel, escalation trigger) =
  `membership_actor_role_v1` over ACTIVE `company_memberships`; org
  boundary (requester, named approvers, delegates, reads) = BOTH membership
  truths via `belongs_to_organization` / explicit dual EXISTS checks.
- Anti-oracle outcomes: missing rows and unauthorized callers answer the
  same short outcome; delegation by email answers `invalid_delegate` for
  foreign, missing and non-member addresses alike.

## Until applied

The approvals area on `/dashboard/network` degrades honestly
(`needs-migration` → "not enabled yet"); the notification emitters stay
inert (`feature_unavailable`); nothing is faked.
