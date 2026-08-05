# Owner gate — Org Demand Spine Stage B: `org_demand_row_scope_v1`

**Migration:** `supabase/migrations/20260805100000_org_demand_row_scope_v1.sql`
**Rollback:** `supabase/rollbacks/20260805100000_org_demand_row_scope_v1.down.sql`
**Status:** AUTHORED, **NOT APPLIED**. Ships RED under the migration-safety
classifier **by design** — this file carries no gate-approval annotation and
never will until you, the owner, decide. Apply ONLY via Supabase MCP
`apply_migration` after reading this document. Never `db push`.

## What it changes (one sentence)

Every row of the demand chain — `customer_requests` → `demand_shortlist` →
`booking_requests` — gains a server-stamped `organization_id`, so demand
belongs to the **active organization** rather than only to the individual
profile that happened to type it in.

## Why (doctrine)

Org Demand Spine: every employer demand belongs to the active organization;
authority is derived server-side; org scope flows
demand → matching → shortlist → contact → booking; no second org model. The
`profile_id` / `owner_id` legs **stay** during the transition — this package
is strictly additive to them.

## Exactly what the migration does

1. **Columns** — adds nullable
   `organization_id uuid references public.organizations(id)` to all three
   tables, plus partial indexes. Nullable and additive: no existing write
   path can break, applied or not.
2. **Backfill** — stamps existing rows through the bridge
   `profile_id`/`owner_id` → `companies.profile_id` →
   `organizations.legacy_company_id`, but ONLY where the bridge resolves to
   exactly one organization; anything else stays NULL. `RAISE NOTICE` prints
   before/after counts so the apply transcript is self-auditing.
3. **Reads (RLS)** — extends the three SELECT policies with one additive leg:
   `or (organization_id is not null and (belongs_to_organization(...) or
   manages_organization(...)))`. Every pre-existing leg is kept verbatim.
   **No INSERT/UPDATE/DELETE policy is touched in v1** — reads gain org scope
   first; writes stay profile-derived.
4. **Writes (stamping)** — the four demand-chain RPCs
   (`save_customer_request`, `save_demand_draft`, `submit_demand_request`,
   `propose_booking_request`) are redefined byte-exact except that each
   INSERT now stamps `organization_id` from the caller's bridge via a new
   zero-argument `resolve_caller_organization_id()`. **No RPC accepts an
   organization id from the client.** `propose_booking_request_v3` is a pure
   rate-limit wrapper delegating to v1, so both call paths stamp.
5. **`demand_shortlist` special case** — it has no write RPC (the app writes
   it by direct owner-scoped upsert in `apps/web/lib/scouting/scouting.ts`),
   so a `BEFORE INSERT OR UPDATE` trigger stamps it instead: authenticated
   inserts are ALWAYS server-derived (client values overwritten), a stamped
   row's organization is immutable, and no-JWT maintenance contexts pass
   through untouched.

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

- SECURITY DEFINER function (re)definitions (4 redefined + 2 new).
- GRANT / REVOKE statements (re-stated pairs, incl. explicit anon revokes per
  the post-20260722160000 hygiene rule).
- RLS policy change: drop + recreate of three SELECT policies (additive legs
  only, but a policy change is a policy change).
- DML at apply time: the backfill UPDATEs (17 + 1 + 0 rows).
- New trigger on `demand_shortlist`.

## What changes for users after apply

Members and managers of an organization can **read** the org's demand rows,
shortlist rows and booking rows (previously only the creating profile and
admin could). Nobody outside the organization gains anything. Writes are
unchanged for users; the database just starts recording which organization
each new row belongs to.

## Apply order

1. Apply `20260805100000_org_demand_row_scope_v1.sql` via MCP
   `apply_migration` (single transaction; backfill included).
2. Read the `RAISE NOTICE` lines in the apply output — expect
   `customer_requests AFTER backfill: 17 of 17 rows stamped` and
   `demand_shortlist AFTER backfill: 1 of 1 rows stamped` (booking: 0 of 0).
3. Record the row in `docs/APPLIED_LEDGER.md` (owner process — this package
   deliberately does not touch the ledger).
4. No deploy needed: no app code changed; the app's existing queries are
   unaffected (the column is invisible to them until a later slice reads it).

## Rollback story

`20260805100000_org_demand_row_scope_v1.down.sql` is safe at any time:

- restores the three SELECT policies to their original text **first** (so
  the column drops are not blocked by dependent policies);
- restores the four RPC bodies byte-exact to their owning migrations
  (0028 / 20260530150000 / 20260613100100), **keeping** the explicit anon
  revokes — rolling back the org spine never widens anon reach;
- drops the trigger, trigger function and bridge resolver;
- drops the indexes and columns last. The org stamp is the only data lost,
  and it is fully re-derivable via the same bridge join.

## The single owner decision

**Apply `20260805100000_org_demand_row_scope_v1.sql` to production — yes or
not yet?** Everything else (ledger row, later write-side v2, app surfaces
that read org scope) follows from that one decision and stays gated until it
is made.
