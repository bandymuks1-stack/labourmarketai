# HUMAN GATE — organization demand spine v2 (M-P0-6, supersedes PR #1016)

State: `ORGANIZATION_DEMAND_SPINE_V2_MULTI_ORG_CODE_COMPLETE_PENDING_HUMAN_GATE`

Migration `20260806200000_org_demand_spine_v2.sql` ships **RED and UNAPPLIED**
— no `@human-gate-approved` marker exists and none may be added without a
recorded owner apply decision.

## Why v2 supersedes #1016 (v1)

v1 stamped from `resolve_caller_organization_id()` — a server-side
exactly-one-org GUESS. A real multi-org actor always stamped NULL, so v1
could never satisfy the doctrine ("actor with A and B can create separate
demand in either context"), which its own gate document recorded
(`…_ACTIVE_CONTEXT_V2_REQUIRED`). v2 is that required version:

| | v1 (#1016) | v2 (this package) |
|---|---|---|
| Stamp source | server guess (1 org or NULL) | validated active workspace, passed by the app, **re-verified server-side** against live membership |
| Multi-org actor | always NULL | stamps the SELECTED org (proof §1) |
| Downstream | 4 RPCs redefined byte-exact | v1 RPCs untouched — inheritance triggers carry the demand's org |
| Membership truth | `owner_profile_id` + engagements | `company_memberships` (§11 capability roles, `member` excluded) |
| Immutability | none | guard trigger (invoker rights): value→value never, NULL→value only via SECDEF stamp paths |
| Rollback | drops columns | **archives attribution first** (`demand_org_attribution_archive`) |

## What an owner approval would cover (found by CI, all visible)

`security-definer-function` (has_org_demand_access, inherit trigger fn, two
v2 entry RPCs), `grant-or-revoke`, `alter-drop-policy` (the three SELECT
policies re-created with ONE added membership leg), `create-trigger` (2 guard
+ 2 inherit… 3 guard triggers total), `data-dml` (the counted, unambiguous
single-org backfill + the stamp UPDATEs inside function bodies).

## Explicit decisions recorded

- **Marketplace/public reads are NOT widened**: `list_open_demand_for_workers`,
  `list_open_demand_for_agencies`, `contact_demand_owner_v1` untouched.
- **Personal stays personal**: NULL organization is legal and unchanged; the
  raw authenticated surface can never claim or rewrite attribution.
- **Booking inherits demand organization** by trigger — no parameter exists
  to forge.
- **Apply-time behaviour change**: the SELECT policies gain the membership
  leg at apply, so same-org governance colleagues (owner/admin/manager/
  external_manager — today only the creator backfill) can read each other's
  org-stamped chain from apply time. That is the intended §12 semantic.

## Proof

`scripts/db-proof/mp06-demand-spine-v2-proof.sql` — **14/14 PASS** against the
seeded local stack (applied + proven + rolled back in ONE transaction; output
`docs/audits/evidence/multi-org-m-p0-6/mp06-two-org-actor-proof-output.txt`):
two contexts → two stamps; forged org 42501; raw PATCH immutability (both
directions); personal stays NULL; shortlist/booking inherit (forged payload
ignored); unrelated actor 0 rows; member 0 rows; manager reads A but never B;
rollback archives then drops.

## Not authorized by this package

Production apply, production QA accounts, a second production company,
Stripe anything, #1016 apply (it is superseded and closed).
