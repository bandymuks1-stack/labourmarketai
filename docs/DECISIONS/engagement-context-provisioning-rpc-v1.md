# Decision — engagement-context provisioning RPC v1

**Date:** 2026-05-29 · **Branch:** `feat/engagement-context-provisioning-rpc-v1`
· **Follows:** PR #141 (`127cce2`, bridge readiness classifier). **Plan:**
`docs/goals/labourmarketai-engagement-context-provisioning-rpc-v1.md`.

## What is the existing journal ORG model?

Migration 0013: `organizations` (mirrors companies/agencies via
`legacy_company_id` / `legacy_agency_id`), `engagement_contexts`
(`profile_id` → `organization_id` + `relationship_slug`), and
`manages_organization(org)` (true when the caller has an active
`engagement_context` for that org with slug `manager` / `owner` /
`external_manager`). A manager reviews a worker's entry when the entry's
`engagement_context.organization_id` is an org they manage
(`journal_entries_select` RLS, 0013).

## What data must exist to connect an employment relationship?

An active `engagement_context` with `profile_id` = the relationship's worker
profile and `organization_id` = the org that mirrors the company/agency. The
M1 backfill created each worker only a primary `employee` context with
`organization_id = NULL` — so this org-scoped link is the missing piece.

## Which table/columns identify the worker relationship?

`public.company_workers (company_id, worker_id, operations_role, …)` /
`public.agency_workers (agency_id, worker_id, operations_role, …)`. The worker
profile is `workers.profile_id`; the org is `organizations.legacy_company_id`
= `company_id` (or `legacy_agency_id` = `agency_id`).

## How is owner/admin permission re-validated?

Inside the SECURITY DEFINER RPC: `owns_company(p_company_id)` /
`owns_agency(p_agency_id)` OR `is_admin()` — the same gate as the relationship
write policy. No worker can self-provision.

## What does the RPC create or connect?

`provision_company_worker_engagement_context` /
`provision_agency_worker_engagement_context` (migration 0032) insert ONE
active `employee` `engagement_context` for the worker's profile linked to the
mirrored organization (idempotent — an existing active link returns
`already_connected`). Every successful create appends an `audit_logs` row.

## What must NOT be created?

No organization, worker, project, journal entry, or confirmation; no backfill;
no fake data. `relationship_slug = 'employee'` (NOT manager/owner) so the
worker gains no management rights. The RPC never sets
`journal_review_enabled = true` and approves/rejects nothing.

## When is bridge-ready true? When is review active true?

`bridgeReady` (per `computeEngagementBridgeReadiness`) is true only when a real
`engagement_context` links the worker to the org AND the role is
reviewer-eligible (`company_admin` / `agency_admin`). `reviewActive` is true
only when bridge-ready AND `journal_review_enabled = true`. This RPC produces
the bridge link only; it leaves review OFF, so the best state it can reach is
`review_not_enabled` ("Ready for review setup") — never `connected`/active.

## What remains deferred?

1. A per-row read that detects the new link so the UI flips
   `missing_engagement_context` → `review_not_enabled`
   (`EMPLOYMENT_ENGAGEMENT_BRIDGE_LIVE` stays false until then; the helper
   already supports it).
2. The owner-only provisioning button/UI that calls these wrappers.
3. `feat/journal-review-enable-toggle-v1` — enabling
   `journal_review_enabled` once a relationship is genuinely bridge-ready.

Until (1)/(2) land, the RPC + wrappers exist and are owner-runnable, but the
UI honestly keeps showing `missing_engagement_context`.

## Safety

Additive: two functions only, no DROP/RENAME/backfill, no RLS/table-grant
change (only EXECUTE on the two functions, revoked from public, granted to
authenticated), audit-logged, idempotent, no fake data, review stays off.
Application to prod is **owner-gated** (agents never apply prod migrations).
