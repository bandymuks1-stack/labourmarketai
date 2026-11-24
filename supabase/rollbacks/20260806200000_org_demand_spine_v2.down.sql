-- ROLLBACK for 20260806200000_org_demand_spine_v2.sql
--
-- ARCHIVE, NEVER DESTROY (owner directive 2026-08-06 §12): once real
-- multi-org writes exist, organization attribution is business history.
-- This rollback copies every stamped attribution into
-- `demand_org_attribution_archive` BEFORE dropping the columns, so a
-- re-apply (or an audit) can recover it. It then removes the v2 surface:
-- policies revert to their pre-v2 definitions, triggers/functions/columns
-- are dropped.

-- 1. Archive every attribution (idempotent table, append-only rows).
create table if not exists public.demand_org_attribution_archive (
  id             uuid primary key default gen_random_uuid(),
  source_table   text not null,
  source_row_id  uuid not null,
  organization_id uuid not null,
  archived_at    timestamptz not null default now()
);
alter table public.demand_org_attribution_archive enable row level security;
-- no policies: admin/service access only, fail-closed.

insert into public.demand_org_attribution_archive (source_table, source_row_id, organization_id)
select 'customer_requests', id, organization_id
  from public.customer_requests where organization_id is not null;
insert into public.demand_org_attribution_archive (source_table, source_row_id, organization_id)
select 'demand_shortlist', id, organization_id
  from public.demand_shortlist where organization_id is not null;
insert into public.demand_org_attribution_archive (source_table, source_row_id, organization_id)
select 'booking_requests', id, organization_id
  from public.booking_requests where organization_id is not null;

-- 2. Restore the pre-v2 SELECT policies verbatim.
drop policy if exists customer_requests_select on public.customer_requests;
create policy customer_requests_select on public.customer_requests
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists demand_shortlist_select on public.demand_shortlist;
create policy demand_shortlist_select on public.demand_shortlist
  for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

drop policy if exists booking_requests_select on public.booking_requests;
create policy booking_requests_select on public.booking_requests
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.workers w
       where w.id = booking_requests.worker_id and w.profile_id = auth.uid()
    )
    or public.is_admin()
  );

-- 3. Drop v2 surface.
drop trigger if exists customer_requests_org_guard on public.customer_requests;
drop trigger if exists demand_shortlist_org_guard on public.demand_shortlist;
drop trigger if exists booking_requests_org_guard on public.booking_requests;
drop trigger if exists demand_shortlist_org_inherit on public.demand_shortlist;
drop trigger if exists booking_requests_org_inherit on public.booking_requests;
drop function if exists public.demand_org_attribution_guard();
drop function if exists public.demand_chain_inherit_organization();
drop function if exists public.save_demand_draft_v2(text, text, jsonb, text, uuid);
drop function if exists public.submit_demand_request_v2(text, text, text, jsonb, text, uuid);
drop function if exists public.has_org_demand_access(uuid);

drop index if exists public.customer_requests_organization_idx;
drop index if exists public.demand_shortlist_organization_idx;
drop index if exists public.booking_requests_organization_idx;
alter table public.customer_requests drop column if exists organization_id;
alter table public.demand_shortlist drop column if exists organization_id;
alter table public.booking_requests drop column if exists organization_id;
