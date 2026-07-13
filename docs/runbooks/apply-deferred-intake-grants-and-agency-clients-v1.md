# Runbook — owner-gated apply: intake service grants + agency clients v1

**Status:** OWNER GATE — nothing in this runbook has been executed by an agent.
**Project ref:** `gorgitwvdzxbnaxhrsrw` (production).
**Apply method:** Supabase MCP `apply_migration` ONLY. Never `supabase db push`.
**Order:** apply Migration A first (restores a broken production surface), then Migration B (activates a new one). They are independent — B does not depend on A.

Agents never apply production migrations. This document is the exact sequence
for the owner (or an owner-authorized session) to run, with verification and
rollback for each step.

---

## Migration A — `20260713190000_company_need_intake_service_grants`

**File:** `supabase/migrations/20260713190000_company_need_intake_service_grants.sql`
**Rollback:** `supabase/rollbacks/20260713190000_company_need_intake_service_grants.down.sql`
**Ledger state:** Deferred (committed, NOT applied) — `docs/APPLIED_LEDGER.md`.

**What it fixes:** `company_need_public_intakes` (created by 20260707120000)
carries RLS with no policies by design, but was created without any grant to
`service_role`. In production today the Public Intake Owner Queue
(`/dashboard/admin/company-need-intakes`) and the public-intake claim bridge
both get `permission denied`. The fix is two additive grants; anon and
authenticated keep zero grants and zero policies (deny-all unchanged).

### A.1 Pre-apply checklist

1. Confirm you are on project `gorgitwvdzxbnaxhrsrw` (not a branch DB).
2. Confirm a recent backup / PITR window exists in the Supabase dashboard.
3. Read the migration file end-to-end — it must contain ONLY:
   - `grant select on public.company_need_public_intakes to service_role;`
   - `grant update (status) on public.company_need_public_intakes to service_role;`
4. Capture pre-state (read-only):

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'company_need_public_intakes'
order by grantee, privilege_type;
```

Expected pre-state: only `postgres` rows; NO `service_role`, NO `anon`,
NO `authenticated`.

### A.2 Apply

Via Supabase MCP:

```
apply_migration(
  name: "company_need_intake_service_grants",
  query: <full contents of supabase/migrations/20260713190000_company_need_intake_service_grants.sql>
)
```

### A.3 Post-apply structural verification (read-only)

Re-run the A.1 grants query. Expected post-state adds exactly:

| grantee | privilege_type |
|---|---|
| service_role | SELECT |
| service_role | UPDATE (column-scoped to `status`; verify via `information_schema.column_privileges`) |

```sql
select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'company_need_public_intakes'
  and grantee = 'service_role';
```

Expected: UPDATE on the `status` column only. Confirm `anon` and
`authenticated` still have zero rows in both queries.

### A.4 Service-role read/update smoke (real, then reverted)

Run as service role (MCP `execute_sql` runs with service privileges):

```sql
-- 1. READ smoke — was "permission denied" before the fix:
select id, status, created_at
from public.company_need_public_intakes
order by created_at desc
limit 5;
```

```sql
-- 2. UPDATE smoke on one real row, immediately reverted.
--    Uses the known proof intake b3e0352c… if still present; otherwise
--    substitute any row id from step 1 and its current status.
begin;
update public.company_need_public_intakes
   set status = 'contacted'
 where id = '<row-id-from-step-1>';
-- verify the write landed:
select id, status from public.company_need_public_intakes
 where id = '<row-id-from-step-1>';
rollback;  -- zero residue
```

```sql
-- 3. Confirm zero residue:
select id, status from public.company_need_public_intakes
 where id = '<row-id-from-step-1>';
```

### A.5 Product smoke (browser)

1. Sign in as superadmin → `/dashboard/admin/company-need-intakes`.
   Expected: the queue lists intake rows (no `needs-migration` / error state).
2. Optional claim-bridge check: sign in as a company whose email matches an
   intake's `contact_email` → the claim card appears on `/dashboard/company`.

### A.6 Ledger

Move the `20260713190000` row from "Deferred" into the applied table in
`docs/APPLIED_LEDGER.md` with the apply date.

### A.7 Rollback (only if needed)

```
apply_migration(
  name: "company_need_intake_service_grants_rollback",
  query: <contents of supabase/rollbacks/20260713190000_company_need_intake_service_grants.down.sql>
)
```

This restores the pre-fix state (queue and claim bridge return to their
honest error/empty states). No data is touched either way.

---

## Migration B — `20260713160000_agency_clients_v1`

**File:** `supabase/migrations/20260713160000_agency_clients_v1.sql`
**Rollback:** `supabase/rollbacks/20260713160000_agency_clients_v1.down.sql`
**Ledger state:** Deferred (committed, NOT applied).

**What it adds (all additive):** `public.agency_clients` (client records owned
by a staffing agency's canonical company row), one nullable FK
`customer_requests.agency_client_id` (ON DELETE SET NULL), fail-closed RLS
(SELECT = `owns_company(company_id) or is_admin()`, no write policies), and
three SECURITY DEFINER write RPCs (`save_agency_client_v1`,
`remove_agency_client_v1`, `set_demand_agency_client_v1`) granted to
`authenticated` only. The "Klientai" panel on `/dashboard/company` currently
shows the honest "prepared, owner activation pending" state and starts working
as soon as this is applied.

### B.1 Pre-apply checklist

1. Migration A applied and verified (recommended order, not a dependency).
2. Read the migration file end-to-end; confirm: no drops, no data rewrites,
   only `create table if not exists` / `add column if not exists` /
   policies / RPCs / grants.
3. Capture pre-state (read-only):

```sql
select to_regclass('public.agency_clients') as table_exists;
select column_name from information_schema.columns
 where table_schema='public' and table_name='customer_requests'
   and column_name='agency_client_id';
```

Expected pre-state: both empty/null.

### B.2 Apply

```
apply_migration(
  name: "agency_clients_v1",
  query: <full contents of supabase/migrations/20260713160000_agency_clients_v1.sql>
)
```

### B.3 Post-apply RLS + grants verification (read-only)

```sql
-- RLS enabled and exactly one SELECT policy:
select relrowsecurity from pg_class where oid = 'public.agency_clients'::regclass;
select polname, polcmd from pg_policy
 where polrelid = 'public.agency_clients'::regclass;
-- Expected: relrowsecurity = true; one row: agency_clients_select, 'r'.

-- Table grants: authenticated SELECT only, nothing for anon:
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name='agency_clients'
  and grantee in ('anon','authenticated');
-- Expected: exactly one row — authenticated / SELECT.

-- RPCs exist and anon cannot execute:
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_can_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('save_agency_client_v1','remove_agency_client_v1','set_demand_agency_client_v1');
-- Expected: 3 rows, anon_can_exec = false, auth_can_exec = true.
```

### B.4 Functional smoke (rolled-back write simulation)

```sql
begin;
-- impersonate nothing — service role bypasses RLS, so test the FK mechanics
-- only; the RPC owner checks are covered by unit tests + the browser smoke.
insert into public.agency_clients (company_id, name)
select id, 'SMOKE — delete me'
from public.companies
where company_type = 'staffing_agency'
limit 1
returning id;

-- link check: FK accepts the new id on a customer_requests row owned by the
-- same profile (read one, set, verify, all inside the transaction) — or skip
-- if no suitable row exists.

rollback;  -- zero residue
select count(*) from public.agency_clients where name like 'SMOKE %';  -- expect 0
```

### B.5 Product smoke (browser)

1. Sign in as a `staffing_agency` company → `/dashboard/company`.
   Expected: "Klientai" panel switches from "prepared, owner activation
   pending" to the live client form.
2. Create a client, link it to an existing demand via the demand's client
   select, unlink, delete the client. Expected: demand survives client
   deletion (FK is SET NULL).
3. Sign in as a non-agency company: no Klientai panel, and
   `agency_clients` is not readable (RLS scoped to owner).

### B.6 Ledger

Move the `20260713160000` row from "Deferred" into the applied table in
`docs/APPLIED_LEDGER.md` with the apply date.

### B.7 Rollback (only if needed)

```
apply_migration(
  name: "agency_clients_v1_rollback",
  query: <contents of supabase/rollbacks/20260713160000_agency_clients_v1.down.sql>
)
```

Drops the RPCs, the FK column, and the table. Demands are never deleted —
only client records and links go away. NOTE: rollback deletes any real
client rows created after apply; export them first if any exist:

```sql
select * from public.agency_clients;  -- expect only rows you accept losing
```

---

## Owner decision summary

| # | Action | Risk | Reversible |
|---|---|---|---|
| 1 | Apply Migration A (2 grants) | Minimal — additive grants, no data | Yes — paired revoke |
| 2 | Apply Migration B (table + FK + RPCs) | Low — additive, fail-closed RLS | Yes — paired down migration |
| 3 | Proof-data cleanup | See `docs/launch/canonical-journey-proof-data-cleanup-v1.md` | Deletion is permanent — separate gate |
