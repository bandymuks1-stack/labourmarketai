# Runbook — apply `worker_opportunity_seen` v1 (OWNER-GATED)

> **Nothing in Stage B applied this.** The application layer works correctly
> both before and after the apply, so this is a decision the owner takes when
> they want the "new matching jobs" signal to become real — not a prerequisite
> for anything already shipped.

- **Migration:** `supabase/migrations/20260714170000_worker_opportunity_seen_v1.sql`
- **Paired rollback:** `supabase/rollbacks/20260714170000_worker_opportunity_seen_v1.down.sql`
- **Canonical consumer:** `apps/web/lib/marketplace/worker-opportunities.ts`
  (repository: `apps/web/lib/opportunities/seen.ts`)
- **Owner decision behind it:** `docs/owner-decisions/work-journal-conversation-architecture-v1.md`
  §18 — Worker Opportunity Seen = `BUILD NOW`

## Production state (read-only check, 2026-07-25, `gorgitwvdzxbnaxhrsrw`)

| Object | Present |
|---|---|
| `worker_opportunity_seen` (table) | **no** |
| `mark_worker_opportunities_seen_v1(uuid[])` | **no** |
| `demand_interest_seen` (table) | no — separate owner decision, out of scope |
| `list_open_demand_for_workers()` (board RPC) | yes |
| `worker_saved_opportunities` | yes |
| `demand_interest_signals` | yes |

Re-verify before applying:

```sql
select to_regclass('public.worker_opportunity_seen') as t,
       to_regprocedure('public.mark_worker_opportunities_seen_v1(uuid[])') as f;
```

## The migration already matches the Stage B contract

Checked line by line against `lib/marketplace/worker-opportunities-contract.ts`
— **no change to the migration is required**:

| Contract expectation | Migration |
|---|---|
| write returns the number of rows recorded | `returns integer`, `get diagnostics inserted = row_count` |
| ≤ 100 ids per call (`MAX_SHOWN_IDS_PER_CALL`) | `if array_length(...) > 100 then raise ... 22023` |
| repeat report is a no-op, first-seen preserved | `on conflict (profile_id, customer_request_id) do nothing` |
| RPC-only write path | `revoke insert, update, delete ... from authenticated` |
| `EXECUTE` not reachable by `anon` | `revoke all ... from public` then `grant execute ... to authenticated` |
| the demand owner never learns who saw | RLS `SELECT`: owning profile or `is_admin()` only |
| no demand facts copied | row is `(profile_id, customer_request_id, seen_at)` |

Two error paths the adapter classifies as **unexpected** on purpose (documented
in `lib/opportunities/seen.ts`): `42501` (body's not-authenticated guard, or a
missing `EXECUTE` grant) and `22023` (bound drift). Neither may masquerade as
"the migration is not applied yet".

## Apply steps (owner performs)

1. Confirm the two objects are still absent (query above).
2. Apply via Supabase MCP `apply_migration` — **never** `supabase db push`
   (repo filenames and ledger versions differ; see `docs/APPLIED_LEDGER.md`).
3. Post-apply verification, read-only:

```sql
select to_regclass('public.worker_opportunity_seen') as t,
       to_regprocedure('public.mark_worker_opportunities_seen_v1(uuid[])') as f;

select grantee, privilege_type
  from information_schema.role_table_grants
 where table_name = 'worker_opportunity_seen';

select r.rolname, has_function_privilege(r.rolname,
         'public.mark_worker_opportunities_seen_v1(uuid[])', 'EXECUTE') as can_execute
  from pg_roles r
 where r.rolname in ('anon', 'authenticated');
```

Expected: table + function present; `authenticated` has `SELECT` only on the
table; `authenticated` can execute, **`anon` cannot**.

4. Record the apply in `docs/APPLIED_LEDGER.md`.

## What changes for the product after the apply

- `seenAvailable` flips to `true`; the "new matching jobs" spine count starts
  reflecting genuinely unseen matches instead of staying at 0.
- The "Nauja" chip stops falling back to the 7-day `created_at` window alone.
- **No application code change is needed.** All four surfaces already report
  what they rendered through the canonical use case; the only difference is
  that `markOpportunitiesShown` starts returning
  `{ available: true, persisted: true }` instead of
  `{ available: false, persisted: false, reason: "feature_unavailable" }`.

## Rollback

Apply the paired `.down.sql`. The application layer returns to the honest
`feature_unavailable` degradation with no code change.
