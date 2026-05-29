# Decision — ops-role-assign-rpc-v1 (operations role write path)

**Date:** 2026-05-29 · **Branch:** `feat/ops-role-assign-rpc-v1` ·
**Follows:** migration `0030` applied to production (owner-gated, done).

## What this slice ships

The owner/admin-scoped **write path** for the operations bridge columns that
migration `0030` added but left unreachable. Two SECURITY DEFINER RPCs in
`supabase/migrations/0031_assign_operations_role_rpcs.sql`:

- `public.assign_company_worker_role(p_company_id, p_worker_id,
  p_operations_role, p_operations_title, p_journal_review_enabled)`
- `public.assign_agency_worker_role(p_agency_id, p_worker_id,
  p_operations_role, p_operations_title, p_journal_review_enabled)`

Each returns a text outcome: `assigned` · `cleared` · `not_owner` ·
`not_linked` · `invalid_role` · `review_not_allowed`.

Server-action wrappers `assignCompanyWorkerRole` / `assignAgencyWorkerRole`
(in `apps/web/lib/{company,agency}/*-workers.ts`) call the RPCs and degrade
gracefully (`needs-migration`) when 0031 is not yet applied. A pure validator
(`apps/web/lib/operations/assign-operations-role.ts`) mirrors the RPC rules
for fail-fast UI feedback; the RPC remains the real security boundary.

## Why these choices

- **Mirrors `invite_company_worker`** (migration 0027): SECURITY DEFINER +
  `set search_path = public` + internal `owns_company` / `owns_agency` OR
  `is_admin` re-validation. No worker can self-assign; no direct client
  `update`.
- **Conservative role set only** —
  `worker · foreman · project_manager · company_admin · agency_admin` — the
  exact set the 0030 CHECK and `role-capabilities.ts` already know. An
  out-of-set value is rejected (`invalid_role`).
- **Clearing is first-class**: a NULL/blank role wipes role + title and
  leaves review off (`cleared`).

## Journal review stays OFF — deferred by design

`journal_review_enabled` is **never** turned on by this RPC. The parameter
exists only so an enable attempt is **rejected explicitly**
(`review_not_allowed`) instead of silently honoured. Per
`docs/contracts/operations-role-assignment-v1.md` ("Label ≠ permission") and
`docs/contracts/employment-journal-bridge-contract-v1.md`, review rights may
never come from a stored label: they require the employment↔journal
**engagement-context bridge**, which does not exist yet. Storing
`operations_role = 'foreman' / 'project_manager'` therefore records intent
only — the capability map keeps those roles `not_enabled`, so no fake
foreman/PM active state is created.

**Gap recorded:** enabling review remains a separate future slice — a
dedicated owner-scoped RPC that records a real reviewer↔worker review scope
linked to the journal org model. Until then every write forces
`journal_review_enabled = false`.

## Audit trail

The contract allowed either an `audit_logs` row or an `updated_at` + actor
column. We use the **existing append-only `public.audit_logs`** table
(migration 0001): each successful write appends one row with the real actor
(`auth.uid()`), `action`, `entity`, and a JSON `payload`. The SECURITY
DEFINER function (owned by `postgres`) performs this insert; `audit_logs` is
append-only (no UPDATE/DELETE policy). The `set_updated_at` trigger on the
relationship tables also refreshes `updated_at` on every write. No silent
mutation, no new table.

## Capability map intentionally unchanged

`role-capabilities.ts` still reports `assignWorkerRoles = false` for every
role. This slice ships only the backend write half; assignment is **not yet
reachable by a user** (no owner UI). Per the constitution's "a preview is not
a completed feature", the capability becomes user-true only when the owner
role-select UI lands (the next slice). Flipping the flag now would overstate
what the product can do today.

## Safety

Additive only — two functions, no `DROP`/`RENAME`/backfill, no RLS policy
change, no table grant change (only `EXECUTE` on the two new functions,
revoked from `public`, granted to `authenticated`). No email/invitation/
outbound, no payment/marketplace, no fake data. Application to production is
**owner-gated** (agents never apply production migrations).

## Next recommended slice

Owner-only role-select + (still-disabled) review control on the worker rows,
wired to `assignCompanyWorkerRole` / `assignAgencyWorkerRole`. Review toggle
stays visibly "not enabled" until the engagement-context bridge slice ships.
