# Owner gate — Org Demand Spine Stage B: `org_demand_row_scope_v1`

**Migration:** `supabase/migrations/20260805100000_org_demand_row_scope_v1.sql`
**Rollback:** `supabase/rollbacks/20260805100000_org_demand_row_scope_v1.down.sql`
**Status:** AUTHORED, **NOT APPLIED**. Ships RED under the migration-safety
classifier **by design** — this file carries no gate-approval annotation and
never will until you, the owner, decide. Apply ONLY via Supabase MCP
`apply_migration` after reading this document. Never `db push`.

**Honest classification:**
`ORGANIZATION_DEMAND_ROW_SCOPE_V1_SAFE_BACKFILL_BRIDGE_ACTIVE_CONTEXT_V2_REQUIRED`
This is a safe, fail-closed bridge — NOT complete multi-organization
support. A caller with exactly one actable organization stamps correctly;
a multi-organization caller stamps NULL until V2 (explicit
workspace-selected stamping, after `20260714210000`) replaces one function
body. Do not onboard real multi-organization pilot users on v1 stamping.

## What it changes (one sentence)

Every row of the demand chain — `customer_requests` → `demand_shortlist` →
`booking_requests` — gains a server-stamped `organization_id`, so demand
belongs to the **organization** rather than only to the individual
profile that happened to type it in.

## Why (doctrine)

Multi-organization doctrine
(`docs/architecture/MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md`): every
employer demand belongs to one organization; authority is derived
server-side from membership; org scope flows
demand → matching → shortlist → contact → booking; no second org model. The
`profile_id` / `owner_id` legs **stay** during the transition — this package
is strictly additive to them.

## Exactly what the migration does

1. **Columns** — adds nullable
   `organization_id uuid references public.organizations(id)` to all three
   tables, plus partial indexes. Nullable and additive: no existing write
   path can break, applied or not.
2. **Backfill** — stamps existing rows through the legacy bridge
   `profile_id`/`owner_id` → `companies.profile_id` →
   `organizations.legacy_company_id`, but ONLY where the bridge resolves to
   exactly one organization; anything else stays NULL. `RAISE NOTICE` prints
   before/after counts so the apply transcript is self-auditing. (The
   backfill deliberately uses the legacy bridge although the go-forward
   resolver does not: every pre-existing row was created through a
   company-owner surface, so the mirrored company org is the historically
   correct attribution for those rows.)
3. **Reads (RLS)** — extends the three SELECT policies with one additive leg:
   `or (organization_id is not null and (belongs_to_organization(...) or
   manages_organization(...)))`. Every pre-existing leg is kept verbatim.
   **No INSERT/UPDATE/DELETE policy is touched in v1.**
4. **Writes (stamping)** — the four demand-chain RPCs
   (`save_customer_request`, `save_demand_draft`, `submit_demand_request`,
   `propose_booking_request`) are redefined byte-exact except that each
   INSERT now stamps `organization_id` server-side via a new zero-argument
   `resolve_caller_organization_id()`. **The resolver is
   MEMBERSHIP-derived**: organizations the caller owns
   (`organizations.owner_profile_id`) plus organizations they actively
   manage (`engagement_contexts` owner/manager/external_manager) —
   exactly one → that one; zero or several → NULL (fail-closed, never a
   guess, and never the banned `companies.profile_id` legacy fallback).
   **No RPC accepts an organization id from the client.**
   `propose_booking_request_v3` is a pure rate-limit wrapper delegating to
   v1, so both call paths stamp.
5. **Stamping triggers on BOTH direct-DML-reachable tables** —
   `demand_shortlist` (owner-scoped upsert in
   `apps/web/lib/scouting/scouting.ts`, no RPC) and `customer_requests`
   (0028 grants table-level `update` to authenticated with a profile-only
   `WITH CHECK`, so without a trigger the new column would be
   **client-forgeable via a raw PostgREST PATCH** — settable, movable or
   clearable into any organization's demand view). Each `BEFORE INSERT OR
   UPDATE` trigger enforces: authenticated writes are ALWAYS
   server-derived (client values overwritten); a stamped row's organization
   is immutable; only the row's own person can cause a stamp (an admin
   editing someone else's row never stamps it from the admin's membership);
   no-JWT maintenance contexts pass through untouched.

## Verified production facts (read-only check, 2026-08-05)

| Table | Rows | Bridge-resolvable | Ambiguous |
|---|---|---|---|
| `customer_requests` | 17 | **17 (100%)** | 0 |
| `demand_shortlist` | 1 | **1 (100%)** | 0 |
| `booking_requests` | 0 | — | 0 |

100% backfill coverage, zero ambiguous rows: after apply, every existing
demand-chain row will carry its organization. The defensive NULL path in the
backfill exists for safety, not because any row needs it today.

## RED classes involved (why this is owner-gated)

- SECURITY DEFINER function (re)definitions (4 redefined + 3 new).
- GRANT / REVOKE statements (re-stated pairs, incl. explicit anon revokes per
  the post-20260722160000 hygiene rule).
- RLS policy change: drop + recreate of three SELECT policies (additive legs
  only, but a policy change is a policy change).
- DML at apply time: the backfill UPDATEs (17 + 1 + 0 rows).
- New triggers on `demand_shortlist` AND `customer_requests`.

## What changes for users after apply — READ THIS, it is not a no-op

1. Members and managers of an organization can **read** the org's demand,
   shortlist and booking rows (previously only the creating profile and
   admin could). Nobody outside the organization gains anything.
2. **One existing surface changes behaviour on apply.**
   `apps/web/lib/demand/canonical-demand.ts` reads `customer_requests` with
   NO owner filter — its result set is defined by RLS alone. Today RLS
   returns only the caller's own rows; after apply it ALSO returns rows of
   organizations the caller belongs to, so the market-map demand view will
   show colleagues' demand as well. That is the intended direction of the
   org spine, but it happens AT APPLY TIME, not "in a later slice". The
   earlier draft of this document claimed existing queries were unaffected —
   that claim was false and is withdrawn.
3. Writes are unchanged for users; the database starts recording which
   organization each new row belongs to, and refuses (NULL) rather than
   guesses when the caller's organization is ambiguous.

## How this behaves for multi-organization callers (the honest limits)

- One actable organization (today's typical company owner, or an invited
  manager of exactly one org): stamps correctly. Invited managers are an
  IMPROVEMENT over the earlier draft, which returned NULL for them.
- A company owner who also owns team organizations (`create_team_v1` is
  live in prod), or any caller with several actable organizations: stamps
  **NULL** — fail-closed. Their rows stay personal (author-readable via the
  `profile_id` leg) until V2 stamps from the explicitly selected workspace.
  The earlier draft stamped these callers' rows with the company org even
  while they were acting as a team — wrong-by-assertion; this version is
  wrong-by-absence, which is recoverable (see heal note below).
- Heal path: an unstamped row is re-stamped when its OWN person next
  updates it and their membership is unambiguous at that time (trigger
  heal branch). V2 will stamp from the selected workspace and can heal the
  remainder.

## Fourteen answers the owner asked for (§9 of the continuation command)

1. **How is the active organization selected?** In the app: the workspace
   switcher (httpOnly cookie `lm_active_workspace` + membership-validated
   switch action). In THIS migration's DB stamping: it is NOT selected —
   the DB cannot see the cookie, so v1 stamps only the unambiguous case.
2. **How is the selection transmitted?** Cookie (httpOnly, server-set,
   membership-validated on every read). Durable cross-device pointer
   `profiles.active_organization_id` arrives with deferred `20260714210000`.
   V2 stamping becomes possible only after that.
3. **Can the client forge organization_id?** No. RPCs take no org
   parameter; both direct-DML tables carry BEFORE triggers that overwrite
   any client-supplied value for authenticated callers; `booking_requests`
   has no direct write grant at all.
4. **How does the server prove membership in the claimed organization?**
   Stamping: the resolver derives the org FROM membership (owned or
   actively managed), so there is no claim to verify. Reads: RLS legs call
   `belongs_to_organization` / `manages_organization` (engagement_contexts,
   status='active').
5. **What happens when a user belongs to two organizations?** Stamping:
   NULL (fail-closed). Reads: they see both organizations' org-stamped rows
   (they are genuinely members of both).
6. **Can one user create demand for A, then switch and create demand for
   B?** Not on v1 — both would stamp NULL (the DB cannot see the switch).
   This is exactly what V2 adds. Do not run a multi-org pilot on v1.
7. **Are historical rows immutable to their original organization?** Yes
   for authenticated callers: both triggers freeze a non-NULL stamp;
   booking re-proposal heals NULL but never moves a set stamp.
8. **Can demand be transferred between organizations?** Not by any
   authenticated path. Service-role/SQL maintenance can (deliberate
   escape hatch for owner-directed corrections).
9. **How are admin/service-role writes handled?** No-JWT contexts pass
   triggers untouched (value trusted). An authenticated ADMIN editing
   another person's row can never stamp it from the admin's own
   membership (trigger owner-check).
10. **Are write-side RLS and RPCs aligned?** Write POLICIES are unchanged
    in v1 (profile-derived); write EFFECTS are org-safe because stamping
    is trigger/RPC-enforced. Full org-aware write policies are a V2+
    decision.
11. **Does booking inherit the demand organization?** Not structurally in
    v1 — both stamp from the same caller resolver, so they agree whenever
    stamping happens; a V2 follow-up should stamp booking rows FROM the
    demand row's org to make inheritance structural.
12. **Does engagement remain company↔worker (not exclusive employment)?**
    Untouched by this migration. `company_worker_engagements` keeps
    one-active-engagement-per-PAIR (a worker may hold active engagements
    with many companies).
13. **Do analytics preserve organization attribution?** Not yet —
    `pilot_events` has no org column (tracked as a launch-audit P1);
    `usage_cost_events` has the column, writer currently stamps NULL.
    Both are follow-ups outside this migration.
14. **Does rollback preserve multi-organization data?** Yes for v1 data
    (stamps re-derivable; orgs/memberships untouched). The rollback's
    safety claim EXPIRES with V2 — the down file now says so and must be
    superseded then (archive, not drop).

## Apply order

1. Apply `20260805100000_org_demand_row_scope_v1.sql` via MCP
   `apply_migration` (single transaction; backfill included).
2. Read the `RAISE NOTICE` lines in the apply output — expect
   `customer_requests AFTER backfill: 17 of 17 rows stamped` and
   `demand_shortlist AFTER backfill: 1 of 1 rows stamped` (booking: 0 of 0).
3. Record the row in `docs/APPLIED_LEDGER.md` (owner process — this package
   deliberately does not touch the ledger).
4. **A deploy is not REQUIRED for safety, but note §"What changes for
   users" item 2**: the market-map demand view widens at apply time via
   RLS. If you do not want that yet, do not apply yet.

## Rollback story

`20260805100000_org_demand_row_scope_v1.down.sql` is safe while v1
stamping rules hold:

- restores the three SELECT policies to their original text **first** (so
  the column drops are not blocked by dependent policies);
- restores the four RPC bodies byte-exact to their owning migrations
  (0028 / 20260530150000 / 20260613100100), **keeping** the explicit anon
  revokes — rolling back the org spine never widens anon reach;
- drops both triggers, their functions and the resolver;
- drops the indexes and columns last. The org stamp is the only data lost,
  and under v1 rules it is re-derivable.
- ⚠ The down file must be SUPERSEDED once V2 workspace-selected stamping
  is live — from then on the stamp carries the person's explicit choice
  and a column drop would destroy it (the down file carries the same
  warning).

## The single owner decision

**Apply `20260805100000_org_demand_row_scope_v1.sql` to production — yes or
not yet?** Everything else (ledger row, ACTIVE_CONTEXT_V2 write-side
stamping, app surfaces that read org scope) follows from that one decision
and stays gated until it is made.
