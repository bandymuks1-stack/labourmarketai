# Partner registration v1: company claim, company groups, agencies and subcontractors

Status: PROPOSAL, 2026-11-10. Owner priority P1. Nothing here is applied. RED parts ship as draft PRs with
rollback files and guard tests, and are applied only after the owner approves the exact SQL.

Goal: bring real companies, employers and partners onto LabourMarket.ai through one free, clear,
mobile-friendly path that works across EU markets, built on what already exists. No second
organization, invitation or membership system.

Read with: `docs/OWNER_TARGET_ARCHITECTURE_V1.md`, `docs/PLATFORM_DOCTRINE.md`,
`docs/proposals/discovered-organization-model-v1.md` (the claim model this extends).

## 1. What exists today (origin/main 4d46b458, production ledger read 2026-11-10)

| Function | Works | Partly | Missing | Change | Priority | Class |
|---|---|---|---|---|---|---|
| Operator creates a company with no owner (`ingest_discovered_organizations_v1`, MCP `company.ingest.preview/confirm`) | yes: `claim_state = 'discovered'`, `owner_profile_id` null, strong identifiers unique | operator door is MCP only, no web screen | - | none for Slice 1 | - | - |
| Duplicate check on ingest (`organization_identifiers`: registration code, VAT, web domain unique; name+country weak) | yes | - | - | none | - | - |
| Duplicate check on self-registration (`save_company_setup_v3`) | name only, per creator | - | no registration-code or VAT check, no audit row | route a match on a strong key to "claim this company" instead of creating a second one | P1 | RED |
| One-time invitation, 14 days, token hashed (`invitations`, `/[locale]/invite/[token]`) | yes | - | - | reuse | - | - |
| Invitation bound to the invited e-mail (`20261003151100`, applied 2026-10-06) | yes, at every token door | - | - | reuse | - | - |
| Signup prefilled from an addressed invitation (`get_invitation_signup_context_v1`, applied) | yes | - | - | reuse | - | - |
| Invitation dies with the organization or the inviter's authority (`20261021094000`, applied 2026-10-21) | yes | - | - | reuse | - | - |
| Invitation that says "take over THIS company" | - | `invite_company` exists, but it creates an account only and names no organization | an invitation type that targets one discovered organization | new type `claim_organization` | P1 | RED |
| Confirmed e-mail before a claim | - | - | accept paths read the session e-mail but not `email_confirmed_at`, and "Confirm e-mail" is off in production | claim acceptance requires a confirmed e-mail | P1 | RED |
| Claim request (`request_organization_claim_v1`) | yes, writes `claim_requested` + audit | callable by any signed-in user for any unclaimed company, not tied to an invitation | representation statement | invitation-bound claim with the representative's statement | P1 | RED |
| Claim decision (`decide_organization_claim_v1`) | yes: admin or ingest grant, never the claimant, evidence required | the operator who sent the invitation may also decide | - | decider must differ from the inviting operator | P1 | RED |
| LINK: owner set, `claimed`, owner membership, audit | - | membership seed trigger exists (`company_memberships_seed_org_owner`) | the RPC | `link_verified_organization_claim_v1` | P1 | RED |
| "Unconfirmed: the company does not manage this profile yet" on the public profile (`/business/[slug]`) | - | - | `claim_state` is shown nowhere | label from the existing read, 6 locales | P1 | GREEN if the page's read already carries `claim_state`, else one RED read change |
| Several companies per person (`active_organization_id`, `context.switch`) | yes | - | - | reuse | - | - |
| Company roles (`organization_roles`: employer, recruitment_partner, talent_provider, workforce_provider, contractor, subcontractor, …) | yes, additive, `add_organization_role_v1` | - | - | reuse for the registration choice | - | - |
| Agencies (`agency_client_connections`, `agency_candidate_offers`, placement chain) | yes | candidate pools off (ORG-10); only `demand_shortlist` | candidate groups | shortlist or labels, no new pool table | P3 | GREEN first |
| Teams (`team` org type, `team_details`, `team_demand_offers`, `team_assignments`) | yes, run by a person | - | link to a company; team profession | additive columns | P3 | RED |
| Company groups | - | - | everything | Slice 2 | P2 | RED |
| Onboarding choice | worker / company only | - | group, agency, subcontractor with teams | one screen mapped to existing roles | P2 | GREEN |
| `relationship_kind` / `relationship_slug` vocabularies | - | two lists | one list | out of scope here; noted | P4 | - |

## 2. Minimal solution

### Slice 1: operator-initiated claim (first real handover)

1. **Create (exists).** An operator with `marketplace_company_ingest` adds the company through
   `company.ingest.preview/confirm`. Strong identifiers stop a duplicate. No owner.
2. **Invite (RED).** `create_claim_invitation_v1(organization_id, email)`: operator only; the company
   must be `discovered` or `invited`; reuses `invitations` with `invitation_type = 'claim_organization'`,
   `organization_id` set, `invited_email` required, `max_uses = 1`, 14 days; sets `claim_state = 'invited'`;
   audit row. Delivery reuses the existing invitation mail path. Revoke and resend reuse the existing RPCs.
3. **Sign in or sign up (exists + RED check).** The representative uses their own account and password.
   The existing e-mail binding refuses another address. New: the claim door refuses an unconfirmed e-mail
   (`auth.users.email_confirmed_at` null) with an outcome that asks them to confirm it.
4. **Representation statement (RED).** On the invite page the representative states their role and that
   they may act for the company (one checkbox and one short text, 6 locales). Accepting writes an
   `organization_claims` row through the existing claim function's rules with method
   `existing_org_admin_invitation` and the invitation id as evidence: `claim_requested`, audit.
5. **Decide (RED change).** `decide_organization_claim_v1` gains one rule: the decider is neither the
   claimant (exists) nor the operator who created the invitation. Evidence stays required.
6. **Link (RED).** `link_verified_organization_claim_v1(claim_id)`: only from `representative_verified`;
   sets `owner_profile_id` to the claimant, never to an operator; `claim_state = 'claimed'`; the existing
   trigger seeds the owner membership; one audit row. Recommended: called inside the verify decision, so a
   verified claim cannot be left half-linked.
7. **Label (GREEN or small RED).** Until `claimed`, the public profile shows "Unconfirmed: the company
   does not manage this profile yet", in all 6 active locales.

**Tests:** unit and guard tests for each function; RLS and isolation tests on a local database:
another organization's data stays unreadable, an expired or reused token is refused, a wrong e-mail is
refused, an unconfirmed e-mail is refused, a claimant cannot decide, the inviting operator cannot decide,
the link never sets an operator as owner. A local e2e walk with synthetic data only
(`QA-SYNTHETIC`, `.invalid` / `.example` addresses).

### Slice 2: company groups (RED draft)

- A group is an `organizations` row (new type or role `group`) and one new table
  `organization_group_members(group_org_id, member_org_id, state invited/active/left, invited_by,
  accepted_by, timestamps)`.
- A company joins only when its own owner accepts. Either side can end membership; leaving keeps history.
- By default a group sees no member's confidential data. Access is an explicit grant row that the
  member can revoke, and every grant and use is audited.
- UI: create a group, invite companies, manage group admins.

### Slice 3: plan and GREEN parts

- One registration choice: company, group, agency, subcontractor with teams. Each maps to existing
  `organization_roles`, combinable, changeable later without losing data, always free.
- Team linked to a company (RED) and a team profession field.
- Agency candidate groups through the existing shortlist or labels, no new pool table.
- Workers are never duplicated: a person stays one profile across companies.

## 3. Risks

| Risk | Mitigation |
|---|---|
| Takeover by someone holding a forwarded link | e-mail binding (applied) + confirmed e-mail (new) + second-operator decision |
| "Confirm e-mail" is off in production | the claim door checks `email_confirmed_at` itself, whatever the global setting |
| `request_organization_claim_v1` lets anyone claim any unclaimed company | still needs an operator decision; owner decides whether to close it or keep self-service claims |
| One operator invites and approves the same claim | decider must differ from the inviter; a real handover needs two operator accounts |
| A duplicate company created by self-registration | strong-key check routes to claim |
| Personal data in the public repo | synthetic data only; the first real case stays outside the repo |
| Invitation mail not delivered | check the mail path on a synthetic address before the first real handover |
