# Human gate — Agreement & Rights Engine v1

Status: **PENDING APPLY BY LEAD** (not applied to production).

## What this gate covers

One migration, applied via Supabase MCP `apply_migration` (never `db push`):

1. `supabase/migrations/20260817200000_agreements_v1.sql`
   — 3 new tables (`agreements`, `agreement_amendments` append-only,
   `agreement_events` append-only), 2 trigger guards, 1 definer visibility
   helper (`can_view_agreement_v1`), 8 SECURITY DEFINER commands
   (`create_agreement_v1`, `update_agreement_v1`, `set_agreement_status_v1`,
   `submit_agreement_for_approval_v1`, `sync_agreement_approval_v1`,
   `add_agreement_amendment_v1`, `attach_agreement_document_v1`,
   `attach_agreement_signature_evidence_v1`), fail-closed SELECT-only RLS,
   RPC-only writes. Zero existing objects touched, zero DML at apply time.

Paired rollback:
- `supabase/rollbacks/20260817200000_agreements_v1.down.sql` (0-row guarded:
  refuses while real agreement rows exist).

## Apply order (hard dependencies, asserted in-file)

Apply AFTER both of:

1. `20260817130000_workflow_engine_v1.sql` (workflow_instances is read by
   the submit/sync mirror commands),
2. `20260817140000_document_file_layer_v1.sql` (org_documents /
   document_files FKs + the `org_owner_admin_v1` authority helper).

The migration's own `do $$` block refuses to apply when either is missing.

## Authority

Owner mandate 2026-08-17 (autonomous functional completion train V2, §4
migration authority) pre-approves the `@human-gate-approved` annotation.
The annotation states the ROUTE — the apply act itself belongs to the LEAD
session, which verifies CI green and applies to `gorgitwvdzxbnaxhrsrw`
manually.

## Safety class

RED by construction (new RLS-bearing tables + SECURITY DEFINER functions +
GRANT/REVOKE + triggers). There is no non-RED way to ship a
row-level-secured register.

Key invariants the reviewer can check in the file:

- **Legal doctrine**: no status value implies SIGNED / LEGAL / VALID /
  BINDING. The status vocabulary is record-keeping only; signature evidence
  is a separate `signature_status` pair whose only non-none value is
  `externally_signed_evidence_attached` — a file said to evidence a
  signature made OUTSIDE the platform. No e-signature flow, no provider.
- **Amendments are history, never edits**: `agreement_amendments` is
  append-only (trigger-enforced for every role incl. service_role), and no
  command rewrites the base row's `current_document_id` when amending.
- **Approval is the workflow engine's**: `submit_agreement_for_approval_v1`
  only flips the status mirror when a REAL pending `workflow_instances` row
  for this agreement exists; `sync_agreement_approval_v1` only converges
  the mirror onto the engine's terminal state. No approval logic is
  re-implemented.
- **The B2B `contracts` table is untouched** — it stays the legacy
  commercial register; consolidation is a later owner decision.
- **No notification constraint change**: `notification_events` has no
  'agreement' entity type and this migration does not widen it.

## Behavioural proof

`scripts/db-proof/agreements-v1.sh` — throwaway Postgres 15; runs the REAL
workflow-engine + document-file-layer migrations first (verbatim), then
this migration verbatim; measures the authority matrix (anon / owner /
admin / manager / member / responsible / engagement-truth / revoked /
wrong-org / attacker), the status machine, append-only enforcement,
cross-org attach rejection, the workflow submit→decide→sync round trip,
and rollback → re-apply.
