# Slice 4 — Invitation / membership flow — RED / needs-human-gate

**Status:** RED. No code/UI shipped. This is an analysis + exact missing-backend
spec for owner review. No migration applied, no merge, no deploy.

## What already works (verified, real)

- **Pending invitations read-back:** `listMyPendingWorkerInvitations()` reads
  `company_worker_invitations` / `agency_worker_invitations` for the caller's
  email (RLS, 0025/0027). Rendered by `WorkerInvitationsCard` on the dashboard.
- **Accept → real link:** `accept_company_worker_invitation` /
  `accept_agency_worker_invitation` (SECURITY DEFINER, migration 0036) create a
  real `company_workers` / `agency_workers` row and mark the invitation
  `accepted`. Outcomes: `linked` / `already_linked` / `no_invitation` /
  `no_worker_profile`.
- **User is not lost after accept:** the action `revalidatePath("/", "layout")`
  and shows a real success/blocked message; the worker stays on the dashboard.
- **Clear blocked states:** every outcome (incl. `no_worker_profile`,
  `no_invitation`, `needs_migration`, `error`) renders a distinct, honest
  message — no fake success.

So 3 of the 4 DoD points are met today.

## The gap (DoD: "dashboard reflects membership")

There are **two membership models** in the schema:

| Concern | Legacy model | Canonical model |
|---|---|---|
| Org entity | `companies` / `agencies` (0001) | `organizations` (0013) |
| Worker link | `company_workers` / `agency_workers` (0027/0001) | `engagement_contexts` (relationship_slug = `employee`) |
| Created by | invitation accept RPC (0036) | `add_org_member` RPC (reroute `20260530140000`) |

`lib/operations/org-membership.ts` and the reroute migration state the canonical
membership is **`engagement_contexts`**, and to **never** use the legacy
`company_workers` / `agency_workers` tables for new logic. The worker's profile
surface (`engagement_contexts` → engagement cards) and the journal review chain
read the **canonical** model.

`lib/operations/engagement-bridge.ts` says it explicitly: *"nothing provisions an
`engagement_context` from an employment relationship."*

**Therefore:** when a worker accepts an invitation, a real `company_workers` row
is created, but **no `engagement_context` is provisioned**, so the membership is
**invisible** on every canonical worker surface. The membership is real but
unreflected.

## Why this is RED (not a GREEN read-back)

A GREEN band-aid would add a worker-side read of `company_workers` /
`agency_workers` (RLS allows `owns_worker` SELECT). That is **rejected**:

- it reinforces the deprecated legacy path the codebase is actively migrating
  off (reroute migration + "never company_workers" rule) — architectural drift;
- it reflects membership from a **different table** than every other canonical
  surface, so the dashboard would disagree with the profile/journal model;
- it does not make the accepted worker reviewable in the journal chain (which is
  gated on `engagement_contexts`), so it hides the missing backend.

Reflecting the accepted membership **canonically** requires provisioning an
`engagement_context` on accept — a **schema/RPC change** → RED per the train
policy ("RED if membership schema/RLS must change").

## Exact missing backend (owner applies via Supabase MCP after approval)

Extend both accept RPCs so that, after the legacy link is created, they also
provision the canonical employee engagement (mirroring `add_org_member` in the
reroute migration), e.g. for the company variant:

```sql
-- inside accept_company_worker_invitation, after the company_workers insert,
-- before 'return linked'. v_profile = the accepting worker's profile_id.

-- 1. resolve the canonical organization for this legacy company:
--    *** OWNER DECISION REQUIRED — see Open question below ***
select o.id into v_org
from public.organizations o
where o.<maps_to> = p_company_id;            -- mapping TBD

if v_org is not null then
  -- 2. idempotent provision (same shape as add_org_member):
  if not exists (
    select 1 from public.engagement_contexts
    where profile_id = v_profile and organization_id = v_org
      and relationship_slug = 'employee' and status = 'active'
  ) then
    insert into public.engagement_contexts
      (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
    values
      (v_profile, v_org, 'employee', 'active', false,
       encode(extensions.digest(
         v_profile::text || ':employee:' || v_org::text, 'sha256'), 'hex'));
  end if;
end if;
```

Same for `accept_agency_worker_invitation` (agency → organization).

Migration must: keep the change **additive + reversible**, follow §16 naming
(`YYYYMMDDHHMMSS_*.sql`), not widen any RLS (`engagement_contexts` SELECT
already allows the owner/manager and own-profile reads), and ship a rollback that
restores the prior RPC bodies. It must pass `migration-safety`.

## Open question (blocks the SQL — owner decision)

`companies` (0001) and `agencies` (0001) are **legacy** tables; `organizations`
(0013) is canonical. There is **no obvious `companies.organization_id` FK** in
the current schema (org convergence has been migrating other surfaces, e.g.
`projects.company_id → organization_id` in `20260530120100`). The owner must
confirm the canonical mapping before the RPC can resolve `v_org`:

1. Does a legacy `companies` row already correspond 1:1 to an `organizations`
   row (and via which column)?
2. Or should the invitation system itself be converged onto `organizations`
   (preferred long-term), making `company_worker_invitations` →
   `organization_worker_invitations`?

Option 2 is the clean canonical convergence but is a larger migration; Option 1
is a smaller bridge if a mapping exists.

## After the migration is applied (GREEN follow-up)

No further schema change needed — the **existing** profile engagement cards (and
a small worker "your organisations" read-back, if desired) will reflect the
membership canonically, and the worker becomes reviewable in the journal chain.
That follow-up is a GREEN UI slice.

## Safety

No migration applied. No production change. No merge. No deploy. Draft PR +
`needs-human-gate` only.
