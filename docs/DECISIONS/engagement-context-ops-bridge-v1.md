# Decision — engagement-context ops bridge v1

**Date:** 2026-05-29 · **Branch:** `feat/engagement-context-ops-bridge-v1` ·
**Follows:** PR #137 (RPCs + migration 0031, applied) and PR #139 (owner
role-select UI). **Builds on:** the work-journal ORG model (migration 0013).

## The gap

The work-journal review chain is **real on the journal ORG model**:
`organizations` + `engagement_contexts` + `manages_organization()` RLS
(migration 0013). A manager reviews a worker's entry when the entry's
`engagement_context.organization_id` is an org they manage. The **employment
link tables** (`company_workers` / `agency_workers`, + the 0030 bridge columns)
are **not connected** to that model — nothing provisions an
`engagement_context` from an employment relationship. The M1 backfill created
each worker a primary `employee` engagement with `organization_id = NULL`, so
no employment relationship has an org-scoped journal context.

## Decision — smallest safe bridge = a read-only readiness classifier

This slice ships **no migration and no write RPC**. Provisioning an
`engagement_context` for a worker on the owner's behalf is a sensitive write
(it creates real review capability and touches the journal-org RLS surface) and
is deliberately deferred to its own owner/migration-gated slice.

What ships instead is the **determination half**: a pure helper
`computeEngagementBridgeReadiness` (`apps/web/lib/operations/engagement-bridge.ts`)
that classifies whether a relationship can be connected to a journal engagement
context, and whether review could later be enabled — never from a label alone.

### States (priority order)

| State | Meaning |
| --- | --- |
| `relationship_not_found` | no `company_workers` / `agency_workers` row |
| `role_not_assigned` | `operations_role` null / blank / unknown |
| `not_enabled` | role is a not-enabled label (foreman / project_manager) — a label, not a permission |
| `not_allowed` | role is enabled but not reviewer-eligible (e.g. `worker`) |
| `missing_engagement_context` | reviewer-eligible role, but no `engagement_context` links the worker to the org yet — **connect first** |
| `review_not_enabled` | context linked + reviewer role, but `journal_review_enabled` is false — **ready for review setup** |
| `connected` | context linked + reviewer role + `journal_review_enabled` true |

`bridgeReady` is true only for `review_not_enabled` / `connected` (a real
context link + reviewer role). `reviewActive` is true only for `connected`.
Neither is ever true from a stored label.

### Not live yet

`EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE = false`: until the provisioning RPC ships,
no employment relationship has an org engagement link, so the UI passes
`engagementContextLinked: false` and every reviewer-eligible relationship
honestly reports `missing_engagement_context`.

## UI

The company/agency worker role-select control (`WorkerOperationsRoleForm`)
keeps the journal-review toggle **visibly disabled** and now shows the
**specific** blocker per relationship (e.g. "Work journal context is not
connected yet. Connect the worker relationship to a work journal context
first."). When the bridge is ready but review is off it would show "Ready for
review setup." — but it never claims review is active unless `reviewActive` is
true. No approve/reject control.

## Safety

No DB migration, no RLS/policy change, no write RPC, no fake data, no fake
review/approval, no AI/matching, no payment/marketplace/email/outbound, no
foreman/PM "works" claim. Pure helper + tests + honest UI copy only.

## Next recommended PR

The **provisioning RPC** (owner/admin-scoped, SECURITY DEFINER,
ownership-revalidated, audit-logged) that connects an enabled employment
relationship to a journal `engagement_context` — then `journal_review_enabled`
can be set for real (`missing_engagement_context` → `review_not_enabled` →
`connected`). Owner/migration-gated; flips `EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE`
and replaces the constant with a real per-row read.
