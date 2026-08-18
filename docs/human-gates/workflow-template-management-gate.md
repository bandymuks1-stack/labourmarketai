# Human gate — Workflow template management v1 (default pack + versioning)

Status: **PENDING APPLY BY LEAD** (not applied to production).

## What this gate covers

One migration, applied via Supabase MCP `apply_migration` (never `db push`):

1. `supabase/migrations/20260818120000_workflow_template_management_v1.sql`
   — 3 new SECURITY DEFINER commands, 3 EXECUTE grants, 6 revokes.
   **Zero** new tables, columns, policies or triggers; **zero** existing
   objects modified or recreated; **zero** DML at apply time.

Paired rollback:
- `supabase/rollbacks/20260818120000_workflow_template_management_v1.down.sql`

**Apply AFTER** `20260817130000_workflow_engine_v1` — the dependency is
asserted in-file (§0 raises if the engine tables or
`publish_workflow_version_v1` are missing).

## Why this exists

The engine shipped with three gaps that make it unusable for a real
organization:

1. Nine engine consumers (timesheets, employee requests, agreements,
   procurement, business trips, expenses, invoices, management decisions,
   org document approval) all require an ACTIVE definition with a PUBLISHED
   version before a submission can start. Production holds **zero**
   definitions, so all nine fail closed.
2. There is no command to create a new **version** of an existing
   definition, and a published version's steps are frozen by trigger — so a
   template could never be changed after publication.
3. There is no command to activate/deactivate a definition.

## The three commands

| command | authority | effect |
|---|---|---|
| `create_workflow_definition_version_v1(text, jsonb)` | org owner/admin (`membership_actor_role_v1`) | version max+1 as a DRAFT on an EXISTING definition; returns the new version id (uuid-as-text) |
| `set_workflow_definition_active_v1(text, text)` | org owner/admin | flips `is_active`; touches the definition row and nothing else |
| `install_default_workflow_pack_v1(text)` | org owner/admin | idempotent one-click install of the 8-template default pack; returns `{outcome, installed[], skipped[]}` |

## The default pack

| slug | context | deadline_hours |
|---|---|---|
| `timesheet_default` | timesheet | 168 |
| `employee_request_default` | generic_request | 168 |
| `agreement_default` | agreement | 336 |
| `procurement_default` | procurement | 168 |
| `business_trip_default` | business_trip | 168 |
| `expense_default` | expense | 168 |
| `invoice_default` | invoice | 168 |
| `management_decision_default` | management_decision | 336 |

Every step: `approval_mode` `single`, `approver_rule`
`{"kind":"org_role","roles":["owner","admin"]}`, `escalation_rule`
`{"action":"mark_escalated","notify_roles":["owner","admin"]}`.

## Authority

Owner mandate 2026-08-17 (autonomous functional completion train V2, §4
migration authority) pre-approves the `@human-gate-approved` annotation on
this file. The annotation states the ROUTE — the apply act itself belongs to
the LEAD session, which verifies CI green and applies to
`gorgitwvdzxbnaxhrsrw` manually.

## Safety class

RED by construction (SECURITY DEFINER functions + GRANTs). There is no
non-RED way to add a gated write path.

Key invariants the reviewer can check in the file:

- **The installer constructs its own steps.** `p_organization_id` is the ONLY
  parameter. The pack is a literal jsonb inside the function body, so this
  command cannot be used to inject an arbitrary approver rule, deadline or
  escalation action.
- **Escalation never approves.** The only escalation action written anywhere
  is `mark_escalated` — the engine's closed vocabulary, unwidened.
- **Exactly one `generic_request` template is seeded.** Employee requests
  resolve by slug (`employee_request_default` fallback); org document
  approval resolves by context with an unordered `.find()`. A second seeded
  `generic_request` definition would make document approval route
  non-deterministically. The installer's per-context skip rule preserves this.
- **Running instances are immune, by construction.** `start_workflow_instance_v1`
  snapshots the steps into `workflow_instance_steps` and resolves the
  approver slots into `workflow_instance_approvers` at start. None of the
  three commands reads or writes either table, so publishing a new version
  or deactivating a definition affects NEW instances only.
- **Anti-oracle outcomes.** "definition missing" and "caller has no
  authority" answer the same `not_found`; "org missing" and "no authority"
  answer the same `not_authorized`.
- **Validation before writes.** `create_workflow_definition_version_v1`
  validates every step of `p_steps` in full before the first insert, with the
  same closed vocabulary `create_workflow_definition_v1` enforces.
- **Concurrency.** Version authoring takes `for update` on the definition row
  so `max(version)+1` cannot race into a unique violation.
- **Rollback deletes no row.** Dropping the three commands leaves every
  definition, version, step, instance and transition exactly as it is —
  deleting them would destroy approval history.

## Why `org_role[owner,admin]` and not `requester_manager`

`requester_manager` resolves to every active managing membership MINUS the
requester. Production holds 13 organizations; 12 are single-person (one
active `owner`, nothing else) and one has a `manager`. Under
`requester_manager` those 12 would resolve to **zero** approvers and
`start_workflow_instance_v1` would refuse every submission with
`no_approvers`. `org_role[owner,admin]` resolves for all 13 today.

**Honest consequence, surfaced in the UI as well as here:** in a
single-person organization the owner approves their own submissions, and the
audit trail records that truthfully (requester and approver are the same
profile id). Such an organization should add a second owner/admin and publish
a new version once it grows — which is exactly what
`create_workflow_definition_version_v1` + `publish_workflow_version_v1` are
for.

## Behavioural proof

`bash scripts/db-proof/workflow-template-management-v1.sh` — **86 passed, 0
failed** (2026-08-18). Throwaway Postgres 15, applies the engine and this
migration verbatim, then measures:
install idempotency (second run is all-skips), version creation + publish
(new instances use the new version, a RUNNING instance keeps its snapshot),
activate/deactivate (running instance untouched), the authority matrix (anon
/ plain member / manager-but-not-owner / owner / admin / wrong-org / revoked
member), escalation-vocabulary rejection, the cross-tenant negative (an
approver of org A cannot decide an instance of org B), and rollback →
re-apply.

## Until applied

The workflow templates panel on `/dashboard/network#approvals` degrades
honestly (42883 / PGRST202 / 42P01 → "prepared, not enabled yet"); nothing is
faked and no control pretends to have saved.
