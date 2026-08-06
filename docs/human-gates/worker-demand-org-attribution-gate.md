# Human gate — worker board demand attribution: one row per demand, correct company

**Status:** `PENDING_OWNER_APPROVAL` — nothing in this repo applies it; merging the PR does NOT apply it.
**Migration:** `supabase/migrations/20260807130000_worker_demand_org_attribution_v1.sql`
**Rollback:** `supabase/rollbacks/20260807130000_worker_demand_org_attribution_v1.down.sql`
**Guard:** `apps/web/lib/guards/worker-demand-org-attribution.test.ts`
**Closes:** the multi-org demand duplication/misattribution on the worker board (observed live 2026-08-06).

---

## The bug, observed in production

`public.list_open_demand_for_workers()` (last recreated by `20260711330000`) resolves the company for each demand row through the **owner profile**:

```sql
join public.companies c
  on c.profile_id = cr.profile_id
 and c.verification_status = 'verified'
```

Pre-multi-org this was 1:1. Since the ownership-cap removal (`20260805170000`) a profile may own several verified companies, so the join fans out:

- **Duplication** — every demand row returns once per verified company of its owner.
- **Misattribution** — each duplicate carries a `company_name` of a company that does not own the demand. Observed live 2026-08-06: the `[QA-SYNTHETIC]` demand of org `9e4f4467…` / company `c2a43118…` also rendered attributed to "QA-SYNTHETIC Beta".

Both worsen linearly as real multi-org adoption grows: an owner with N verified companies multiplies every demand by N on the worker board.

## The change — one join, nothing else

Post-M-P0-6 (`20260806200000_org_demand_spine_v2`) each demand carries `organization_id`. The RPC is recreated with the company resolved through **the demand's own organization**, one row per demand by construction:

```sql
join lateral (
  select co.display_name, co.legal_name
    from public.companies co
   where co.verification_status = 'verified'
     and (
       (cr.organization_id is not null
         and co.id = (select o.legacy_company_id
                        from public.organizations o
                       where o.id = cr.organization_id))
       or
       (cr.organization_id is null
         and co.profile_id = cr.profile_id)
     )
   order by co.created_at asc, co.id asc
   limit 1
) c on true
```

- **Stamped rows** (post-M-P0-6): only the organization's bound company (`organizations.legacy_company_id`) can satisfy the verified gate. If that company is unverified, or the organization has no bound company, the row is **hidden** — fail-closed; visibility is never borrowed from another company of the same owner.
- **Pre-org rows** (`organization_id IS NULL`): the owner's **oldest** verified company (`order by created_at, id` — deterministic), which matches the only population the old join was actually correct for. A multi-company owner's unstamped rows show once instead of N times.
- Everything else — auth guard, worker check, 13-column signature, payload whitelisting through `demand_structured_v2_public`, status filter, ordering, `limit 100`, closed grants — is byte-identical to the `20260711330000` definition.

## Migration-safety findings to approve

Exactly two, both inherent to recreating this function:

1. `security-definer-function` — `list_open_demand_for_workers` (recreated, same as before)
2. `grant-or-revoke` — `revoke all from public / from anon; grant execute to authenticated` (the current hardened baseline, per `20260722160000`)

## Risk assessment

**Low. RPC replacement only — zero DML, no backfill, no policy change, no table change, no signature change.** The web client (`apps/web/lib/opportunities/load-worker-opportunities.ts`) calls the RPC by name with no arguments; the column list is unchanged, so no app deploy is coupled to the apply.

| | |
|---|---|
| Rows removed | Duplicate fan-out rows; stamped rows whose org's bound company is not verified (fail-closed — previously such a row could ride in on a *different* verified company of the same owner, which was exactly the misattribution). |
| Rows added | None. The result set is a subset of today's, deduplicated. |
| Attribution | Stamped rows: the owning organization's company, always. Pre-org rows: deterministic oldest verified company of the owner. |
| Blast radius | One function. No other object mentioned. |
| Performance | Lateral runs per returned row (≤100); `organizations` hit by PK, `companies` by `profile_id`/`id`. The old join did comparable work without the dedup. |
| Rollback | Restores the prior body verbatim (reintroduces the duplication — stated in the file). Not authorised for production without its own decision. |

## What is NOT covered / explicitly out of scope

- **Applying to production** — separate owner decision (this document's ask).
- `list_open_demand_for_agencies` — checked: it does **not** join `companies` (no attribution rendered), so it does not carry this bug.
- `contact_demand_owner_v1` and the rest of the M-P0-6 "untouched public surfaces" — unchanged.
- Any write path, RLS policy, or the M-P0-6 stamping model itself.

## Local DDL proof — run 2026-08-06, 28/28

`bash scripts/db-proof/worker-demand-org-attribution.sh` spins up a **throwaway** Postgres 15 container (`worker-demand-org-attribution-proof`, port 55437 — the shared local stack is untouched). The BEFORE state is installed from the **rollback file verbatim** (it restores the 20260711330000 profile-join body), so the production defect is reproduced from real SQL, never re-implemented. Every probe runs under `set local role authenticated` (or `anon`) with a session-GUC `auth.uid()` stub, never as the superuser.

| Phase | Result |
|---|---|
| BEFORE | The defect reproduces: 3 submitted demands render as **5** rows; the multi-org owner's stamped demand appears **twice**, attributed to **both** companies; the pre-org demand duplicates too; the demand of an **unverified** org company rides in on the owner's *other* verified company (the misattribution). |
| APPLY | Clean. `prosecdef = true`, `search_path=public` pinned. |
| AFTER | **One row per demand**: stamped demand once, attributed to its own organization's company; pre-org demand once, owner's oldest verified company; the unverified-org demand is **hidden** (fail-closed); `count(*) = count(distinct id)`. |
| Caller surface | Non-worker → empty result, not an error; no uid → `Not authenticated`; `anon` → `permission denied`; `has_function_privilege`: anon **false**, authenticated **true**; **zero rows mutated**. |
| ROLLBACK | Applies cleanly, fan-out returns (5 rows — exactly as the file warns), no data mutated. |
| RE-APPLY | Clean and idempotent — same 2-row matrix, anon still revoked. |

**Stated limits — not fabricated.** No PostgREST, no real JWT; `demand_structured_v2_public` is stubbed to `'{}'::jsonb` because the structured projection is pinned separately by `worker-demand-structured-exposure.test.ts`. What is measured is row count, attribution, the verified gate, the caller guard and the grants — the things this migration changes.

## The decision

Apply `20260807130000_worker_demand_org_attribution_v1.sql` to production — yes or no.

If **yes**, in the same session:

1. apply the migration;
2. record it in `docs/APPLIED_LEDGER.md`;
3. post-apply verification:
   - as a worker: the board returns **one** row per submitted demand — the live 2026-08-06 duplicate pair renders once, attributed to the owning company (`c2a43118…`), and "QA-SYNTHETIC Beta" no longer appears on it;
   - `select count(*), count(distinct id) from list_open_demand_for_workers()` returns equal counts (as the worker role);
   - `has_function_privilege('anon', 'public.list_open_demand_for_workers()', 'execute')` is **false**; `authenticated` is **true**.

If **no**, the worker board keeps multiplying every demand by the owner's verified-company count, attributed wrongly — and the effect grows with every additional multi-org adoption.
