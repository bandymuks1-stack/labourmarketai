# Organization Demand Spine — Track 3 package

Status: `PREFLIGHT_COMPLETE_IMPLEMENTATION_STAGED` (2026-08-05, audited at main `5be4baf6`)

## Preflight verdict: PARTIAL

What is DONE and verified safe:
- ONE canonical, server-derived, membership-validated, fail-closed employer
  resolver (`lib/company/employer-company-context.ts` on top of
  `lib/company/active-organization.ts`), guard-pinned by
  `employer-organization-context.test.ts` (7-file spine, no profile-only
  company fallback).
- NO demand path accepts a client-supplied organization/company/profile id —
  authority is always `auth.uid()` server-side.
- No service-role client in any demand read path. `organizations_select` is
  membership-scoped (W9 slice 2 applied).

What is MISSING (row scope):
| Gap | Fact |
|---|---|
| G1 | `customer_requests` has NO `organization_id` (0028 + all ALTERs checked). Blocking, needs migration. |
| G2 | `demand_shortlist.owner_id` = profile (20260612220000). |
| G3 | `booking_requests.owner_id` = profile; `propose_booking_request` authorizes on `customer_requests.profile_id = uid`. |
| G4 | ZERO RLS policies in the demand chain reference `organizations` / `manages_organization()` / `belongs_to_organization()`. Isolation today = profile-identity isolation. |
| G5 | 10+ employer read paths have NO workspace gate at all: `demand-drafts.ts` list/read, `buyer/customer-requests.ts`, `canonical-demand.ts` (market map), `intelligence-read.ts:453` (analytics), chat-workspace draft leg (`company-executors.ts` → `save_demand_draft`), `contact-interested-worker.ts` (one of two contact paths), `opportunities/interest.ts`, `demand-location.ts`, `agency/clients.ts`, prefill in `demand-request.ts`. |
| G6 | `privacy/contact-disclosure-actions.ts:83-101` uses a SECOND divergent resolver ("first owned org by created_at") ignoring the active workspace — the only place an org id IS persisted on a demand-adjacent row, and it can persist the wrong one. |
| G7 | Co-manager collaboration structurally absent: org you manage-but-don't-own → `company-not-owned` → manager sees zero demand. |
| G8 | Durable org pointer `profiles.active_organization_id` (20260714210000) UNAPPLIED in prod; live pointer is the httpOnly cookie only. |
| G9 | `mark_agency_can_offer` (applied) allows a cross-tenant append onto another tenant's demand payload, authorized from the `agencies` spine. |
| G10 | First-created-org inference SURVIVES upstream of Stage A: `resolveActiveWorkspaceId` (`apps/web/lib/company/organization-switch.ts`) falls back to `organizationIds[0]` — owned orgs ordered `created_at asc` — whenever no cookie/DB pointer exists (every fresh session before the first switch). Stage A (#1017, merged `91b48a96`) deleted only the LOCAL duplicate resolver in contact-disclosure; this upstream fallback remains. V2: default to Personal / an explicit workspace chooser instead of inferring. |

Load-bearing fragility: the surface gate holds only because
`companies.profile_id` is (conditionally!) unique — the constraint was added
`if no duplicates existed at apply time` (20260604120000).

## Doctrine (required end state)

Every employer demand belongs to the active organization; authority derived
server-side; same org scope flows demand → matching → shortlist → contact →
booking → engagement → analytics. No second org model. No silent fallback to
profile ownership when organization context exists.

## Implementation plan — two stages

### Stage A — app-layer, ZERO migration (branch `feat/org-demand-scope-app-gates-v1`)
1. Add the canonical workspace gate (`requireEmployerCompany` /
   `resolveEmployerCompanyContext`) to every G5 path (fail-closed, same
   10-reason contract). The two contact paths converge on one gated doctrine.
2. G6: delete the divergent `resolveOwnOrganizationId` and derive the
   organization from the active workspace resolver; refuse (fail-closed) when
   the workspace has no organization.
3. Guard test extension: widen the spine list so every demand-chain caller is
   pinned to the single resolver.
Start condition: AFTER `feat/w14-pilot-analytics-slice-v1` lands or is
parked (both branches touch the same staffing/contact/booking action files —
one active modifying branch per contested file).

### Stage B — schema package, OWNER-GATED migration (branch `feat/org-demand-spine-schema-v1`)
One migration (NOT applied by the train; rollback + checksums + actor matrix
+ production preflight required):
1. `customer_requests.organization_id uuid null references organizations(id)`
   (+ same for `demand_shortlist`, `booking_requests`).
2. Backfill: `profile_id → companies(profile_id) → organizations.legacy_company_id`
   (the 0013 mirror guarantees an org exists per company). Rows with no
   resolvable org stay NULL and are classified in the preflight count.
3. RLS additive change: `or (organization_id is not null and
   (public.belongs_to_organization(organization_id) or manages_organization(...)))`
   on SELECT for the three tables — widening to co-managers (G7) without
   removing the profile_id leg (transition safety).
4. RPC changes: `submit_demand_request` / `save_demand_draft` /
   `propose_booking_request` stamp `organization_id` server-side from the
   validated workspace; never from client input.
5. Anti-cross-tenant guards + actor-matrix tests (owner / co-manager /
   unrelated org / worker / anon).
6. `profiles.active_organization_id` (G8) rides the same owner gate —
   decision needed on whether to fold 20260714210000 in or keep separate.
G9 (`mark_agency_can_offer`) is flagged for a separate owner decision — it is
an intentional agency feature with an audited append; the question is whether
the agencies spine remains authorized post-org-spine.

Code-stage verdict target:
`ORGANIZATION_DEMAND_SPINE_CODE_COMPLETE_PENDING_HUMAN_GATE`
