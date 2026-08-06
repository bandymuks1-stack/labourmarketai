# COMPANY MEMBERSHIPS V1 — M-P0-4 design + migration package

Owner directive 2026-08-05 ("OWNER DECISION — APPLY AND MERGE M-P0-2…" §14/§15).
State target: `COMPANY_MEMBERSHIPS_V1_CODE_COMPLETE_PENDING_HUMAN_GATE`.

**OWNER APPROVAL recorded 2026-08-05** ("OWNER DECISION — APPLY
COMPANY_MEMBERSHIPS V1 AND CONTINUE MULTI-ORG AUTHORITY TRAIN" §1): apply
the exact Slice 1 migration, merge PR #1023 after production verification,
normal Vercel deployment, then implement Slice 2 and M-P0-5. The
`@human-gate-approved` marker names exactly the verified findings
(security-definer-function, grant-or-revoke, create-trigger) plus the
backfill INSERT the decision covers explicitly. The approval does NOT
cover: PR #1016, production QA accounts, Stripe Live, real charges,
outreach, engagement-to-membership conversion, or application membership
writes before the reviewed Slice 2 RPCs exist. Executable SQL is
byte-identical to reviewed HEAD `cae1ff30` (git blob `a51710d3` preserved
through the rebase onto post-M-P0-3 main `596eab7a`).

**OWNER APPROVAL — SLICE 2 — recorded 2026-08-06** ("OWNER DECISION — CLOSE
MEMBERSHIP AUTHORITY, MERGE DURABLE WORKSPACE, CONTINUE M-P0-6/7/8" §1):
apply the exact Slice 2 migration `20260806120000_company_membership_commands_v1.sql`,
merge PR #1024 after production verification, normal Vercel deployment.
Approved reviewed HEAD `62303fb5c2487d29c82ab9c9cfbe3e50784dce13`; the PR
was already based on the latest main `0f716b8d` (post-#1023), so no rebase
was needed and the executable SQL is byte-identical to the reviewed package
(comment-stripped executable sha256
`c296ece209ff4b801254769a6d66d1f043f045b7070658c604a7cc4ba6d958dc`; full
file sha256 pre-marker `f11b6094b9efbc7a7ea69041be3e7a13d2f7dd9762addb8045e29507a7a24cee`;
rollback sha256 `0efd134bebd5d18b615944e98eb268c2bc9acbf9a422e72e4d4b81fb405dd7c9`).
The `@human-gate-approved` marker names exactly the four migration-safety
findings (security-definer-function, grant-or-revoke, alter-drop-policy,
data-dml) — the data-dml UPDATEs live inside the PL/pgSQL command bodies
only; apply-time business-row mutation must remain (and was verified) zero.
Approval is valid only while: executable semantics stay identical, all
seven membership RPC contracts stay unchanged, the recursive SELECT policy
is replaced by the reviewed non-recursive helper, no engagement becomes a
membership, no direct authenticated table write appears, and no unrelated
migration rides along. The approval does NOT cover: PR #1016 (superseded by
the M-P0-6 v2 package), production QA accounts, a second production
company, production invitations or role mutations against real identities,
Stripe Live, or real charges.

## 1. What membership IS (and is not)

Membership = **governance**: who may ACT FOR an organization (invite, assign
roles, provision engagements, review journals, create projects, edit the
company profile). It is NOT employment:

- membership creates NO engagement and ends NO engagement;
- membership creates NO project assignment and ends none;
- membership never alters the person's identity (no `profiles` /
  `profile_roles` writes);
- revoking membership in organization A does not affect organization B;
- permissions fail closed the moment a membership stops being `active`.

Today governance is proxied by `organizations.owner_profile_id` (creator) and
by ACTIVE `engagement_contexts` rows doing double duty (0013's
`manages_organization()` accepts `manager|owner|external_manager` slugs).
`company_memberships` becomes the single truth those checks migrate onto —
`save_company_setup_v3`'s creator guard widens to membership authority here
(its own comment says so), and M-P0-3's `requireEmployerCompany` chain swaps
its owner-only company check for a membership check in a later reviewed
slice.

## 2. Roles (derived from the existing doctrine — nothing invented)

| Role | Source of the semantics | v1 meaning |
|---|---|---|
| `owner` | `organizations.owner_profile_id`, engagement slug `owner` | Full governance incl. membership management; cannot silently disappear |
| `admin` | reserved (0031 operations-role vocabulary) | Full governance except revoking the last owner |
| `manager` | engagement slug `manager` (0013 authority set) | Operational governance (roster, journal review) |
| `external_manager` | engagement slug `external_manager` (0013) | Same as manager, external party — kept distinct because 0013 already distinguishes it |
| `member` | invitation base state | Belongs, no governance authority |

## 3. Schema (migration `20260806090000_company_memberships_v1.sql`)

Required fields per directive §14 — all present:
organization subject (`organization_id`), `profile_id`, `role`, `status`
(`invited|active|revoked`), `invited_by`, `accepted_at`, `revoked_at`,
`created_at`, `updated_at`, optional provenance (`source`, `reference_id`).

Invariants and how each is enforced:

| Invariant | Mechanism |
|---|---|
| One active canonical tuple per profile/organization | partial unique `company_memberships_live_key` on `(organization_id, profile_id) WHERE status IN ('invited','active')` |
| Many orgs per person / many members per org | no other uniqueness |
| Owner membership cannot silently disappear | `protect_last_owner` BEFORE UPDATE/DELETE trigger — revoking/demoting/deleting the LAST active owner raises `last_owner_membership` |
| Revoking A does not affect B | row-scoped writes only; no cascading logic |
| No engagement / project-assignment / identity side effects | the migration and table touch no other domain table; slice-2 RPCs are bound to the same rule by the guard test |
| Fail closed after revocation | RLS + every consumer keys on `status = 'active'`; revoked rows are history |
| Status/timestamp coherence | CHECK constraints (`active → accepted_at`, `revoked ↔ revoked_at`) |

## 4. Actor matrix

| Actor | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `anon` | nothing (no grant, no policy) | nothing |
| `authenticated` — self | own rows (any status) | **nothing** (no grant + no policy; writes are slice-2 SECURITY DEFINER RPCs) |
| `authenticated` — active member of org | that org's member list | nothing |
| `authenticated` — unrelated | nothing (fail-closed, no existence oracle) | nothing |
| `is_admin()` | everything | nothing (admin mutations also go through RPCs) |
| `service_role` | everything | everything (backfill/ops) |

## 5. Audit & revocation

- `created_at` / `updated_at` (shared `set_updated_at` trigger), `invited_by`,
  `accepted_at`, `revoked_at`, `source`, `reference_id` — every row explains
  where it came from and when it changed state.
- Revocation = `status → 'revoked'` + `revoked_at` (RPC, slice 2). Rows are
  never deleted in normal operation; the unique key ignores revoked history
  so re-inviting after revocation is possible.
- Owner survival: transferring ownership requires activating another owner
  membership FIRST; the trigger refuses the alternative ordering.

## 6. Backfill policy — historical-row classification (§15)

Production read-only audit 2026-08-05 (project `gorgitwvdzxbnaxhrsrw`):
`engagement_contexts` = 36 × `employee/active` + 10 × `owner/active`; nothing
else. `organizations` = 10 rows, all with `owner_profile_id`.

| Class | Rows (prod today) | Decision |
|---|---|---|
| Clear membership — `organizations.owner_profile_id` | 10 | backfill → `owner/active`, `source='backfill:organizations.owner_profile_id'` |
| Clear membership — ACTIVE `manager`/`external_manager` engagements | 0 (statement kept for local/preview truthfulness) | backfill → same role, `source='backfill:engagement_contexts'`, `reference_id` = engagement id |
| Employment/engagement only — `employee` engagements | 36 | **never migrated** |
| Ambiguous | 0 | none exist; if preflight finds any at apply time, STOP and reclassify |

Engagement rows are never mutated, deleted or re-parented by the backfill.

## 7. Production preflight (run read-only immediately before any apply)

1. `company_memberships` absent (`to_regclass` NULL);
2. `organizations` count + count with non-null `owner_profile_id` (expected
   10/10 as of 2026-08-05 — stop if materially different);
3. every `owner_profile_id` resolves to a `profiles` row;
4. `engagement_contexts` slug/status distribution — expected ONLY
   `employee/active` + `owner/active`; any `manager`/`external_manager` row
   changes the backfill row count and must be re-reviewed; any OTHER slug =
   ambiguous class = STOP;
5. no duplicate `(organization_id, owner_profile_id)` that would collide in
   the live-key index;
6. migration ledger tail (no timestamp collision with `20260806090000`);
7. `set_updated_at()` and `is_admin()` exist (the migration reuses both).

## 8. Migration-safety findings (actual, named — for the FUTURE gate)

Verified by running `.github/scripts/migration-safety.mjs` on this branch
(2026-08-05): **RED — 3 blocking findings**, exactly:

- `security-definer-function` — `company_memberships_protect_last_owner()`
  (SECURITY DEFINER so the trigger sees sibling rows regardless of caller
  RLS; pinned `search_path=public`);
- `grant-or-revoke` — SELECT to authenticated, ALL to service_role, anon
  revoked;
- `create-trigger` — `set_updated_at` + `protect_last_owner` install
  write-time behavior.

(The backfill INSERT…SELECT is not in the scanner's UPDATE/DELETE `data-dml`
class, but it IS row-creating DML and the owner decision must treat it as
such — 10 owner rows at today's production counts.)

These stay ERRORS (RED) until an owner apply decision adds the marker — the
package intentionally ships without it.

## 9. Browser fixture plan (for the slice-2 proof, same pattern as M-P0-3)

Extend `supabase/dev-fixtures-mp03.sql` actors:

- P owns A + B (existing) → backfill gives P `owner` memberships in A + B;
- P manages C (existing manager engagement) → backfill gives P `manager`
  membership in C;
- O owns C + D → `owner` memberships;
- W (worker, roster member of A) gains NO membership — employment stayed
  employment;
- proof: member lists per workspace; revoke P's C membership → C fail-closed
  everywhere M-P0-3 already proves; last-owner revocation on A refused with
  `last_owner_membership`; D invisible throughout; 1440 + 375.

## 10. Explicitly out of this package

Membership-mutating RPCs (invite/accept/revoke/role-change), consumer
migration of `manages_organization()` / `requireEmployerCompany` /
`save_company_setup_v3` onto membership authority, demand stamping v2
(M-P0-6), billing subjects (M-P0-7), analytics (M-P0-8). Each is its own
reviewed slice on top of this truth table.
