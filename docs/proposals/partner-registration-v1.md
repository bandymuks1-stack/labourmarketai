# Partner registration v1: company claim, company groups, agencies and subcontractors

Status: PROPOSAL, 2026-11-10. Owner priority P1. Nothing here is applied. RED parts ship as draft PRs with
rollback files and guard tests, and are applied only after the owner approves the exact SQL.

Goal: bring real companies, employers and partners onto LabourMarket.ai through one free, clear,
mobile-friendly path that works across EU markets, built on what already exists. No second
organization, invitation, membership or e-mail proof system.

This repository is public. The security and permission analysis behind this proposal is kept outside
it, in the owner's private record (AGENTS.md, "Capability pre-flight"). This file holds the product
shape and status only.

Read with: `docs/OWNER_TARGET_ARCHITECTURE_V1.md`, `docs/PLATFORM_DOCTRINE.md`,
`docs/proposals/discovered-organization-model-v1.md` (the claim model this extends).

## 1. What exists and what changes (origin/main 4d46b458, production ledger read 2026-11-10)

| Function | Works | Partly | Missing | Change | Priority | Class |
|---|---|---|---|---|---|---|
| Operator creates a company with no owner (`ingest_discovered_organizations_v1`, MCP `company.ingest.preview/confirm`) | yes | operator door is MCP only | - | reuse | - | - |
| Duplicate check on ingest (`organization_identifiers`) | yes | - | - | reuse | - | - |
| Duplicate check on self-registration (`save_company_setup_v3`) | by name | - | strong-key check, audit row | a match on a strong key leads to "claim this company" | P1 | RED |
| One-time invitation, hashed token, expiry (`invitations`, `/[locale]/invite/[token]`) | yes | - | - | reuse | - | - |
| Invitation bound to the invited e-mail (`20261003151100`, applied) | yes | - | - | reuse | - | - |
| Proof of mailbox ownership (`20261003151000`: `session_email_verified_v1`, proof ledger, `lib/auth/verified-email-gate.ts`; applied) | yes | - | - | reuse at the claim door | - | - |
| Invitation follows organization authority (`20261021094000`, applied) | yes | - | - | reuse | - | - |
| Invitation "take over this company" | - | `invite_company` names no organization | a type that targets one company | `claim_organization` invitation | P1 | RED |
| Claim request and decision (`organization_claims`, `request_organization_claim_v1`, `decide_organization_claim_v1`) | yes | open to review | invitation-bound claim, representation statement, two-operator rule | owner decision 2026-11-10 | P1 | RED |
| Request from a representative without an invitation | - | - | a verification request that grants nothing by itself | owner decision 2026-11-10 | P1 | RED |
| LINK: owner, `claimed`, owner membership and engagement, audit | - | owner triggers fire on insert only | the link | link RPC that writes the membership and engagement itself | P1 | RED |
| "Unconfirmed" on the public profile (`/business/[slug]`) | - | - | label | from existing data where possible, 6 locales | P1 | GREEN if the data is already read |
| Several companies per person (`active_organization_id`, `context.switch`) | yes | - | - | reuse | - | - |
| Company roles (`organization_roles`) | yes | - | - | reuse for the registration choice | - | - |
| Agencies (`agency_client_connections`, `agency_candidate_offers`) | yes | candidate pools off (ORG-10) | candidate groups | shortlist or labels | P3 | GREEN first |
| Teams (`team` org type, `team_details`, `team_demand_offers`, `team_assignments`) | yes | - | link to a company; team profession | additive | P3 | RED |
| Company groups | - | - | everything | Slice 2 | P2 | RED |
| Onboarding choice | worker / company | - | group, agency, subcontractor | one screen mapped to existing roles | P2 | GREEN |
| `relationship_kind` / `relationship_slug` vocabularies | - | two lists | one list | out of scope | P4 | - |

## 2. Minimal solution

### Slice 1: operator-initiated claim

1. An operator adds the company through the existing ingest. No owner.
2. The operator sends a one-time, time-limited invitation to take over that one company, bound to one
   e-mail address.
3. The representative signs in or signs up with their own account and password, and proves the mailbox
   through the existing e-mail proof flow.
4. The representative states their role and that they may act for the company.
5. A second operator, not the one who sent the invitation, decides.
6. On approval the representative becomes the owner: owner, `claimed`, owner membership and engagement,
   audit, in one transaction. An operator never becomes the owner.
7. Until then the public profile shows "Unconfirmed: the company does not manage this profile yet".

A representative without an invitation can send a verification request. It grants nothing until an
operator decides.

Tests: unit, guard and database tests on a local database, and a local e2e walk, with synthetic data only
(`QA-SYNTHETIC`, `.invalid` / `.example` addresses).

### Slice 2: company groups (RED draft)

- A group is an organization linked to member companies (invited, active, left).
- A company joins only when its own owner accepts; leaving keeps history.
- A group sees no member's confidential data by default; access is an explicit, revocable, audited grant.
- UI to create a group, invite companies and manage group admins.

### Slice 3: plan and GREEN parts

- One registration choice: company, group, agency, subcontractor with teams; each maps to existing
  `organization_roles`, combinable, changeable later without data loss, always free.
- Team linked to a company (RED) and a team profession field.
- Agency candidate groups through the existing shortlist or labels.
- Workers are never duplicated.

## 3. Risks (status only)

| Risk | Status |
|---|---|
| Company takeover | handled by the Slice 1 rules above; detail in the private record |
| Duplicate companies | strong-key check in Slice 1 |
| Personal data in the public repo | synthetic data only; the first real case stays outside the repo |
| Invitation mail delivery | to be checked on a synthetic address before the first real handover |
