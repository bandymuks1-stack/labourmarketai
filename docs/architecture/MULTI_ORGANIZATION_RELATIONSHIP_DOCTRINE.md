# MULTI-ORGANIZATION RELATIONSHIP DOCTRINE

Status: CANONICAL — binding on every audit, migration, RLS policy, RPC, UI,
analytics event, billing mapping and future implementation.
Created: 2026-08-05 (launch-critical completion train, session 2).
Owner directive: people and companies are free. A person is not owned by one
company. A company is not owned by one person.

This document is the single reference for how people, organizations,
engagements, projects, bookings, demand, billing and analytics relate. Any
slice that conflicts with it is wrong even if its tests pass.

---

## 1. Canonical entities

| Entity | Owned by | Canonical store (today) |
|---|---|---|
| Personal identity (profile, Player Card, skills, evidence, availability, mobility, salary expectations, personal calendar, personal workspace, work history) | The person | `profiles`, `workers`, `worker_skills`, journal tables |
| Organization | Itself (governed by its members) | `companies` + mirrored `organizations` (W9 two-spine) |
| Organization membership | Neither party — it is a permission edge | `organization_members` (durable multi-membership requires deferred `company_memberships_v1`) |
| Company↔worker engagement | The relationship itself | `company_worker_engagements` / `engagement_contexts` |
| Project | One organization | `projects` |
| Project assignment | The relationship itself | `project_assignments` |
| Booking | The proposed/accepted time commitment | booking v3 chain (`booking_requests`, …) |
| Demand | One organization | `customer_requests` → `demand_shortlist` → `booking_requests` (org spine = Stage B, PR #1016, owner-gated) |
| Experience | One eligible canonical interaction | `experience_records` (W6; no stars, no numeric score) |
| Billing subject | A person OR an organization | Stripe mapping tables (see §7) |

Membership ≠ employment. Engagement ≠ project membership. Project assignment
≠ organization membership. Each edge is stored, proven and ended separately.

## 2. Relationship cardinalities (required, guard these)

- profile ↔ organization membership: **many-to-many**
- profile ↔ company engagement: **many-to-many**
- profile ↔ project assignment: **many-to-many**
- organization ↔ project: one-to-many
- project ↔ worker: many-to-many through assignments
- organization ↔ demand: one-to-many
- demand ↔ candidates: one-to-many (many-to-many through canonical matching)
- organization ↔ billing customer/subscription: one-to-many over time
- profile ↔ personal billing customer/subscription: one-to-many over time
- profile ↔ active workspace: **one selected context at a time, many available**
- booking commitments across organizations: many-to-many through the person's
  single personal calendar

A uniqueness constraint is allowed only to deduplicate the *same* canonical
relationship (same membership tuple, same project assignment, same experience
for one eligible interaction, same explicitly-designed active subscription
identity). A uniqueness constraint that collapses a legitimate many-to-many
relationship is a doctrine violation, not a data-integrity feature.

## 3. Ownership versus permission

- The person owns their identity. No organization action may rewrite, rename,
  delete or transfer profile, Player Card, skills, evidence, availability,
  calendar or work history.
- Organization roles (owner / admin / manager / external manager / member)
  are **permissions inside that organization only**. They confer nothing in
  any other organization and nothing over the person's identity.
- A company owner is not the only valid organization actor; authority flows
  from membership role, not from `companies.profile_id`.
- `companies.profile_id` records who created/anchors the company. It is
  **not** an exclusive-authority pointer and must never be used to resolve
  "the user's company".

## 4. Active context (workspace) rules

- The workspace switcher (Personal / org A / org B / …) selects the context
  for the current action. It is **authoritative, not decorative**: server
  code must read the explicit selection, verify the caller's membership in
  the selected organization, and scope reads/writes/authority to it.
- The active context must never be inferred from account age, creation
  order, first-owned company, or most-recent organization.
- If no valid selection exists, **fail closed** and ask the person to select
  or create an organization. No silent fallback to another organization.
- Switching context never mutates stored membership, never ends engagements
  or assignments, never transfers entitlements, never rewrites identity.
- Current implementation truth (2026-08-05): selection is cookie-scoped
  (`profiles.active_organization_id` durable pointer is behind unapplied
  `20260714210000`); Stage B's zero-arg `resolve_caller_organization_id()`
  is a fail-closed single-org bridge (see §11). Both are acceptable ONLY as
  bridges; the final design requires explicit, session-authoritative,
  server-verified workspace selection.

## 5. Lifecycle separation

- Ending one engagement affects only that engagement row.
- Completing one project ends only that project's assignments.
- Removing one organization membership leaves every other membership,
  engagement, assignment, booking and experience intact.
- Leaving an organization never deletes identity data and never terminates
  relationships with other organizations.
- Historical rows are immutable to their original organization: demand,
  bookings, engagements and experiences keep the organization they were
  created under, even after membership changes.

## 6. Calendar and conflict rules

- The person has ONE calendar. Availability and double-booking checks must
  evaluate commitments across **all** organizations and contexts, not just
  the acting employer's.
- A conflicting booking from organization B is refused even when B cannot
  see A's private data — the conflict check runs on the person's whole
  calendar server-side (W12 three-layer protection), while cross-tenant
  detail disclosure stays forbidden.

## 7. Billing ownership (Stripe doctrine)

Two independent billing subject types:

- **Personal subscription** — belongs to a person (worker premium tools,
  personal AI allowance, profile enhancements).
- **Organization subscription** — belongs to exactly one organization
  (employer tools, seats, org AI allowance, CRM/projects/automation).

One person may simultaneously: hold a personal subscription, own billing for
org A, manage billing for org B, and belong to org C with no billing
authority. Therefore:

- Never map one Stripe customer blindly to all organizations of one profile.
- Required mapping fields: payer profile, billing subject type
  (`person`|`organization`), billing subject id, Stripe customer id,
  subscription id, plan key, provider status, entitlement subject.
- Checkout binds to the selected billing subject; webhook metadata and DB
  resolution must re-verify that subject server-side.
- Switching workspace never transfers entitlements. Cancelling org A affects
  neither the personal subscription nor org B/C.
- Re-subscribe collision handling and webhook replay idempotency are
  **per billing subject**, not per profile.

## 8. Analytics attribution

Every telemetry event must distinguish: actor profile, active
workspace/context, organization subject (when org-scoped), project,
engagement, booking, feature, billing subject.

- An actor moving between organizations must not merge company funnels.
- A Personal-context event carries no fabricated organization.
- Organization dashboards read only their own events; platform admin may
  aggregate without row-level PII leaks.
- Cost attribution follows the actual billed/active subject: personal AI
  cost is never charged to an arbitrary employer; org A's AI cost is never
  charged to the person's other organizations.

## 9. RLS expectations

- Org-scoped rows carry an explicit `organization_id` stamped server-side
  (SECDEF resolver or trigger) — never client-supplied, never forgeable.
- Read policies grant by membership in the row's organization (role-aware),
  not by `companies.profile_id`.
- Write policies verify the caller's membership/management in the claimed
  organization at write time.
- Personal rows (identity, calendar, journal) are governed by the person,
  with narrow, deliberate org read grants (e.g. engagement-scoped) only.
- Cross-tenant: org A must never read org B's private demand, projects,
  analytics or costs. Public company facts (legal name) must be an explicit,
  documented decision, not an RLS accident (§15 audit item).

## 10. Prohibited assumptions (never encode or preserve)

- one profile equals one company;
- first company owned by a profile is the active company;
- a worker has one employer;
- an organization has one manager;
- one engagement represents all work with that company;
- a project assignment proves organization membership;
- organization membership proves employment;
- engagement proves project membership;
- the most recently created organization is automatically authoritative;
- `.single()` / `.maybeSingle()` on membership-like queries where several
  rows are legitimate;
- Stripe customer ↔ profile 1:1 as the only mapping;
- analytics without organization/context attribution;
- unique constraints that collapse legitimate multi-membership.

## 11. Migration implications (state as of 2026-08-05)

- `companies.profile_id` is (conditionally) unique today → prod is capped at
  one anchored company per profile. This is a **known bridge limitation**,
  not doctrine. Removing it requires the membership spine
  (`company_memberships_v1`, deferred/owner-gated) and durable workspace
  pointer (`20260714210000`, deferred/owner-gated) first.
- Stage B (`20260805100000_org_demand_row_scope_v1`, PR #1016, owner-gated)
  adds the org spine to demand rows with a zero-arg fail-closed resolver.
  Honest classification:
  `ORGANIZATION_DEMAND_ROW_SCOPE_V1_SAFE_BACKFILL_BRIDGE_ACTIVE_CONTEXT_V2_REQUIRED`.
  It must NOT be described as complete multi-organization support. V2
  (explicit workspace-selected stamping) is required before real multi-org
  pilot users are onboarded.
- PR #1013 display-name repair: the person's name lives on the person and is
  independent of all organization memberships; changing employer never
  changes the name.
- Any future migration adding a uniqueness constraint on membership,
  engagement or assignment tables must justify it against §2.

## 12. Tests required for every future slice

Every slice touching org-scoped behavior must include (or reference a
guard that already pins):

1. a synthetic actor belonging to **at least two organizations** — a
   single-organization fixture is insufficient;
2. context switch A↔B changes reads/writes/authority accordingly;
3. no first-created-organization fallback (delete the selection → fail
   closed, not fall back);
4. cross-tenant negative test (org C sees nothing);
5. lifecycle independence (end A-edge, B-edge unaffected);
6. calendar conflict across organizations (B's conflicting booking refused,
   non-conflicting accepted);
7. billing/entitlement isolation per subject where billing is touched;
8. analytics attribution per context where telemetry is touched.

---

## Appendix A — audit findings register (2026-08-05)

The full per-finding register (M-P0-1 … M-P2-*, G10) lives in the launch
tracker (`docs/launch/LAUNCH_CRITICAL_COMPLETION_TRACKER.md`, session-2
section). Doctrine-relevant structural facts confirmed at audit time
(main `de38b3db` → `52c34584`):

- The repo holds TWO coexisting organization models: the correct
  many-to-many spine (`organizations` + `engagement_contexts` + workspace
  switcher + `resolveEmployerCompanyContext`, which explicitly bans
  first-owned-company fallbacks) on top of a legacy 1:1 layer
  (`companies_profile_id_key` UNIQUE, singleton `save_company_setup`,
  `getOwnCompany()` surfaces). The legacy layer structurally caps one
  anchored company per person and is the launch-critical work list.
- Workspace selection: httpOnly cookie, membership-validated,
  server-authoritative for migrated surfaces; durable pointer
  (`20260714210000`) deferred; upstream first-created-org fallback
  survives when no pointer exists (G10).
- Membership spine: `engagement_contexts` is a genuine many-to-many and
  already live; `company_memberships_v1` deferred → durable multi-org
  membership pointer not yet in prod.
- Demand org spine: absent on prod rows; Stage A app gates merged
  (#1017, `91b48a96`); Stage B row scope owner-gated (#1016 reworked to a
  membership-derived fail-closed resolver, `3906c76d`, NOT applied).
- Booking/calendar conflict logic is WORKER-scoped across all employers
  (EXCLUDE gist + advisory lock) — the most doctrine-correct area; §6 is
  already real at the DB level.
- Billing: person-mapped only; no organization billing subject exists —
  §7's model is prerequisite work for Stripe Live on org plans.
- Telemetry: `pilot_events` carries no organization dimension;
  `usage_cost_events` has the column with a null-stamping writer — §8 is
  not yet satisfiable end-to-end.
