# Human gate — Org document register delta v1 (correspondence, object link, retention)

Status: **PENDING APPLY BY LEAD** (not applied to production).

## What this gate covers

One migration, applied via Supabase MCP `apply_migration` (never `db push`):

1. `supabase/migrations/20260817240000_org_document_register_delta_v1.sql`
   — FIVE additive NULLABLE columns on the existing `org_documents`
   register (`counterparty_name`, `correspondence_date`,
   `counterparty_reference`, `object_id` → `work_objects`,
   `approval_state`), three partial indexes, ONE widening drop + re-add of
   the `org_document_events` event_type CHECK (+`retention_set`,
   +`approval_submitted`, +`approval_synced`), and FOUR new SECURITY
   DEFINER commands:
   - `create_org_document_v2` — train C's `create_org_document_v1` contract
     plus the four new fields and the two retention fields, with same-org
     validation for `object_id`;
   - `set_org_document_retention_v1` — the FIRST writer for the train C
     `retention_until` / `retention_note` columns;
   - `submit_org_document_for_approval_v1` — flips the approval MIRROR only
     when a real pending `workflow_instances` row exists;
   - `sync_org_document_approval_v1` — idempotent read-repair from the
     engine's terminal truth.

   Zero existing functions recreated (`create_org_document_v1` is untouched),
   zero policies added/dropped/widened, zero DML at apply time.

Paired rollback:
- `supabase/rollbacks/20260817240000_org_document_register_delta_v1.down.sql`
  (0-row guarded: refuses while any added column or delta event row holds
  real data).

## Apply order (hard dependencies, asserted in-file)

Apply AFTER all three of:

1. `20260817130000_workflow_engine_v1.sql` (`workflow_instances` is READ by
   the submit/sync mirror commands),
2. `20260817140000_document_file_layer_v1.sql` (`org_documents`,
   `org_document_events`, `org_owner_admin_v1`, `can_read_org_document_v1`),
3. `20260817150000_work_objects_v1.sql` (`work_objects`, the `object_id` FK).

The migration's own `do $$` block refuses to apply when any is missing.

## Engine decision (why `generic_request`)

The approval mirror rides the EXISTING Workflow & Approval Engine with
`context_entity_type = 'generic_request'`. The engine's context vocabulary
is NOT widened by this migration — it is the engine owner's schema.

- `document_ack` was rejected: it names the version-bound READ CONFIRMATION
  act (`document_acknowledgements`), not approval of a register entry, and
  reusing it would collide on the engine's
  `workflow_instances_active_context_uq` unique index the moment one
  document needs both an acknowledgement workflow and an approval workflow.
- `management_decision` was rejected as a guess at another module's
  semantics.
- `generic_request` is the vocabulary's own honest default.

## What this migration deliberately does NOT do

- NO retention auto-deletion, NO purge job, NO destructive scheduled work.
  Retention is record-keeping metadata; deletion stays owner-gated and
  happens outside the product.
- NO `correspondence_direction` column (derivable from the type slug) and NO
  `our_reference` column (`external_ref` already is the organization's own
  reference) — doctrine: never store derivable or duplicated data twice.
- NO new engine context type, NO new table, NO new route, NO tsvector /
  search extension (register search is a bounded, sanitized ILIKE over
  metadata columns only — never inside file contents).

## Behavioural proof

`scripts/db-proof/org-document-register-delta.sh` — **87/87 passing** on a
throwaway Postgres 15. It applies `20260817130000`, `20260817140000`,
`20260817150000`, this migration and its rollback **verbatim**, and every
probe runs under `set local role authenticated` (or `anon`), never as the
superuser, so RLS and grants genuinely decide:

- authority matrix on all four commands (anon / owner / admin / manager /
  member / wrong-org / platform admin);
- `object_id` same-organization validation (a wrong-org or unknown object
  answers `invalid` and no row is created);
- correspondence facts refused on non-correspondence types, accepted on the
  two correspondence types, and direction recoverable from the slug alone —
  neither `correspondence_direction` nor `our_reference` exists as a column;
- retention recorded, re-recorded and cleared, the document still present
  after a **passed** retention date, and every direct table write refused;
- the approval mirror: refused without a pending instance, `submitted` only
  after the engine's own `start_workflow_instance_v1`, `repaired_approved`
  after an engine approval and `repaired_returned` after an engine
  rejection, with sync idempotent in both directions;
- `create_org_document_v1` still callable and unchanged beside v2;
- rollback → re-apply at 0 delta rows, and rollback **refusal** once a delta
  column holds real data.

## Authority

Owner mandate 2026-08-17 (autonomous functional completion train V2, §4
migration authority) pre-approves the `@human-gate-approved` annotation.
The annotation states the ROUTE — the apply act itself belongs to the LEAD
session, which verifies CI green and applies to `gorgitwvdzxbnaxhrsrw`
manually.

## Consumer behaviour before apply

`apps/web/lib/documents/*` feature-detects 42P01 / 42703 / 42883 /
PGRST202 / PGRST205 and degrades honestly: the register renders exactly as
it does today, the delta filters and the correspondence / retention /
approval controls do not render, and `createOrgDocumentAction` falls back to
`create_org_document_v1` ONLY when no v2-only field was supplied — a
supplied correspondence, object or retention value is never silently
dropped, the action answers `needs_migration` instead.
