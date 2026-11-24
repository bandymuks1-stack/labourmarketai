# Onboarding channels policy — v1

> **Status:** Binding. Codifies the owner clarification of 2026-05-28
> after Stage 2 (PR #95). Companion to
> `docs/policies/account-and-role-model-v1.md` and to
> `docs/PRODUCT_CONSTITUTION.md` §1 (non-locking role / intention).

## 1. Non-negotiable principle — self-entry is the default

**Any human must be able to sign up to labourmarket.ai and start using
the system personally without an invitation.** Sign-up at
`/auth/signup` is open to anyone; no invitation token is required to
register, complete onboarding, or reach `/dashboard`.

The product is NOT invite-only. It must never be designed, gated, or
described as invite-only.

## 2. Invitations are an ADDITIONAL channel, not the only channel

Invitations exist (and may be added) as a parallel onboarding path
for joining a company, agency, team, buyer organisation, or any
future organisation type. They never replace or block the self-entry
path; they sit beside it.

When an onboarding screen offers an invitation flow, the same screen
must also offer the self-start path with equal prominence. A user
who arrived with a token may accept it; a user who arrived without
one may still register and use the product personally.

## 3. The two channels converge on one model

| | Self-entry | Invitation |
|---|---|---|
| Entry point | `/auth/signup` (open) | `/auth/signup?invite=<token>` or `/invite/<token>` (when invitations ship) |
| Token required? | No | Yes |
| Profile created? | Yes — one `public.profiles` row | Yes — one `public.profiles` row (same shape) |
| Role added? | Via `add_role` (`profile_roles` upsert) at user request | Via `add_role` (`profile_roles` upsert) on invitation acceptance |
| Final shape on disk | Identical: one profile + one or more `profile_roles` rows + role-specific entity rows | Identical |

**Both channels write to the same tables.** There is no parallel
"invitation-only" data model. Designing one is forbidden.

## 4. Persons, companies, agencies, buyers, teams — invitation scope

When the invitation channel ships, it must support invitations to
join (in any combination):

- a personal worker workspace as a manager / confirmer;
- a company as a representative;
- an agency as a representative;
- a buyer / client organisation as a representative;
- a team / brigade within an organisation.

Each invitation targets a specific role in a specific organisation
(or, for personal workspaces, a specific profile). Acceptance writes
one `profile_roles` row (plus, for organisation-level invitations, a
membership / engagement row in the relevant table).

For each of those targets, the equivalent self-start path must
remain open: a person can create their own worker / company / agency
/ buyer / team without being invited.

## 5. Schema notes (informative, not a migration request)

The invitation channel is not implemented yet. When it ships:

- A new `public.invitations` table is fine (suggested shape:
  `token + inviter_profile_id + target_role + target_organisation_id +
  invited_email + status + created_at + accepted_at + expires_at`).
- Acceptance flow upserts into `public.profile_roles` with the same
  shape `add_role` already produces, so self-entry and invitation
  converge on identical row state.
- RLS on `invitations`: invitee may read invitations addressed to
  their email; inviter may read invitations they sent; admin may
  read all. No public listing.
- No fake / sample / "demo invitation" rows. The placeholder /
  signal-class rules from `docs/DEMO_TO_REAL_DATA_POLICY.md` apply.

## 6. What this policy forbids

- Designing the product as invite-only at any layer (UI, routing,
  RLS, or marketing copy).
- Gating `/auth/signup` behind an invitation token.
- Surfacing an invitation flow without also surfacing the
  self-start path on the same screen.
- Building a parallel data model for invited users (the invitation
  channel converges on the same `profiles` / `profile_roles` /
  entity rows the self-entry channel produces).
- Marketing copy that implies "you must be invited" or "invitation
  required to join".

## 7. See also

- `docs/policies/account-and-role-model-v1.md` — three-layer account
  model (personal account + worker profile + organisation profiles)
- `docs/policies/organization-profile-creation-policy-v1.md` —
  Tier 1 / Tier 2 organisation rules
- `docs/PRODUCT_CONSTITUTION.md` §1 — non-locking role / intention
- `docs/PLATFORM_DOCTRINE.md` §5 — personhood, roles, engagements
- `docs/policies/feature-definition-of-done-v1.md` — DoD for
  shipping the invitation channel later
- `docs/policies/constitution-compliance-checklist-v1.md` —
  per-PR check that includes self-entry parity
