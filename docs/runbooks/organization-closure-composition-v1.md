# Runbook — an organization stops operating (composition v1, 2026-09-19)

> **Why this exists.** `organizations` carries **no lifecycle column** (no
> `status`, `archived_at`, `closed_at`); the only org-level switch is
> `public_profile_enabled`. Yet every object that hangs off an organization
> already has a canonical end state and an audited RPC to reach it. This
> runbook composes those existing ends into "this organization has stopped
> operating" **without a schema change**. It is a GREEN operational
> procedure; the durable, queryable, idempotent org state itself remains the
> RED packet R-8 (`organizations.archived_at` + read filters — the pattern
> already proven on `education_programs.archived_at`).
>
> Do not build a second lifecycle vocabulary. Reuse the statuses below.

## 0. What follows the organization down

| Object | End state | How (canonical) | Who |
|---|---|---|---|
| Open demand (`customer_requests`) | `closed` | owner of each row: close from `/dashboard/company/needs` (submitted → closed) | the creating profile (colleague close is R-15) |
| Projects | `completed` (or `paused` if work may resume) | `set_project_status_v1` from `/dashboard/projects/<id>/operations` | project manager |
| Assignments / engagements | `ended` | `end_org_membership_v1(engagement_id, reason)` — from People / project operations | org owner/admin |
| Roster links (`company_workers`, `agency_workers`) | `removed` | `end_roster_link_v1` — "Remove from the roster" on `/dashboard/company/people` (or the worker's own "I no longer work here") | org owner/admin or the worker |
| Governance memberships (`company_memberships`) | `revoked` | `membership_revoke_v1` / `membership_leave_v1` from `/dashboard/start` members panel | owner; **the last active owner cannot be revoked** (trigger) — that one membership remains, by design |
| Agency ↔ client links | `revoked` / `withdrawn` | agency real-client bridge actions | agency or client |
| Institution programmes / cohorts | `archived_at` set; members `left` | education programme actions | training provider |
| Marketplace listings / service offerings | `closed` / `paused` | listing actions | owner |
| Public business profile | `public_profile_enabled = false` | `set_business_public_profile_v1` from `/dashboard/company/settings` | owner |
| Evidence, confirmations, journal entries confirmed for this org | **kept, untouched** | — | history stays honest |
| Conversations | **kept** (no archived state exists); participants may leave | participant revocation | each participant |
| Billing / cost history | **kept** (statutory; `usage_cost_events` is immutable) | — | — |
| The `organizations` row itself | **kept** — 11 `ON DELETE NO ACTION` FKs make it undeletable, which is correct for history | — | — |

## 1. Order

1. Close open demand, then complete/pause projects (so matching and boards
   stop advertising the org).
2. End assignments and roster links (so no worker still "works here").
3. Flip the public profile off.
4. Revoke every governance membership except the last active owner.
5. Record the closure in the org's `description` (the only free-text field
   on the row) as `CLOSED <date> — <reason>` so a reader of the row sees it.

## 2. What this composition does NOT give you (the RED half)

- **No single fact.** "Org X is closed" is inferable only by scanning ~10
  tables; `organizations` SELECT and `search_organizations_directory_v1` still
  return the org, and the directory RPC does not filter `public_profile_enabled`.
- **No idempotence / no reopen guard.** The remaining owner can create a new
  demand tomorrow; nothing marks the org as non-operating.
- **No read filter** for boards, directories, invitations.

Minimal RED shape (prepared, NOT applied): `alter table public.organizations
add column archived_at timestamptz null;` + `.is("archived_at", null)` in the
directory RPC and the org-scoped readers, + an owner-only
`archive_organization_v1(p_org_id, p_reason)` SECURITY DEFINER that runs
steps 1–4 above transactionally and stamps the column. Rollback drops the
function and the column. Approval sentence: **"Apply R-8:
organizations.archived_at + archive_organization_v1, owner-only, with
rollback."**
