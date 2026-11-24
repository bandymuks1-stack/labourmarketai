# Worker Opportunities v1 — approved-route enablement (OWNER-GATED)

## Status

The worker opportunities board (`/dashboard/opportunities`) is **default-closed**:
it shows a worker an open employer need **only** when that need arrives through an
**approved supply route**. The code-level gate is live (PR for Worker
Opportunities v1) — `isApprovedRouteRow()` in
`apps/web/lib/opportunities/opportunity-fit.ts`.

Today the worker-visibility RPC `list_open_demand_for_workers()`
(`20260614120000_worker_demand_visibility.sql`) returns every `status='submitted'`
need with **no approval signal**, so the gate currently lets **nothing** through
and the worker sees the honest *"No approved opportunities yet"* state. Raw,
unreviewed employer needs are **never** shown to a worker.

## What is needed to actually surface approved opportunities (migration)

This requires a **DB migration** — owner-gated, **not applied by the agent**.
Two pieces:

1. **An approval / route model.** A way to mark a need (or its owning company /
   partner) as an approved supply route. Minimal shape — one of:
   - reuse `companies.verification_status = 'verified'` as the approved signal
     (cheapest), joining `customer_requests` → owning company; **or**
   - a dedicated `customer_requests.route_status text` column with the closed set
     `not_reviewed | documents_requested | limited_access | risk_flagged |
     blocked | approved_direct_partner | trusted_partner |
     works_through_approved_route | our_operating_company_approved`
     (default `not_reviewed`), set only by an admin/operator RPC.

2. **Update `list_open_demand_for_workers()`** (the worker RPC) to:
   - return only needs whose route is approved (the worker-visible set above);
   - add two safe columns the gate/board already read:
     - `route_status text` (so `isApprovedRouteRow` passes), **or**
       `approved_route boolean`;
     - `company_name text` — the **approved** company/partner display name
       (safe to show because it is approved). Never expose an unapproved
       employer's identity, and never the free-text `need_summary` / `notes` /
       contacts.

### Example RPC projection (sketch — for owner review, NOT applied)

```sql
-- inside list_open_demand_for_workers(), replacing the SELECT:
select cr.id,
       cr.role_or_work_type,
       cr.country,
       cr.team_size,
       cr.start_period,
       <accommodation whitelist as today>,
       c.legal_name                          as company_name,   -- approved only
       'approved_direct_partner'::text       as route_status,   -- derived
       cr.created_at
  from public.customer_requests cr
  join public.companies c on c.profile_id = cr.profile_id
 where cr.status = 'submitted'
   and c.verification_status = 'verified'    -- the approval gate
 order by cr.created_at desc
 limit 100;
```

(RED class — `SECURITY DEFINER` + grant; hand off as a draft PR + `needs-human-gate`,
apply via Supabase MCP after owner review, never `db push`. Ships with a
`supabase/rollbacks/*.down.sql`.)

## Guarantee until then

- No raw / unapproved employer need is ever worker-visible.
- No free text (`need_summary` / `payload.role` / `notes`) or contact data is
  read by the worker board loader.
- Admin/operator surfaces (e.g. `/dashboard/admin/need-structuring`) keep full
  visibility of raw needs for review.
