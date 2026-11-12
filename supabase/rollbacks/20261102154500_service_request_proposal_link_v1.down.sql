-- Rollback for 20261102154500_service_request_proposal_link_v1
-- Drops the provider's door, the index, then the link column. The column drop
-- refuses while any proposal carries a link: a linked offer is a business
-- record and is never erased by a rollback (unlink deliberately first).
-- Apply via Supabase MCP apply_migration.

begin;

drop function if exists public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date);

drop index if exists public.proposals_one_open_per_service_request;
drop index if exists public.proposals_service_offering_request_idx;

do $$
declare v_linked boolean := false;
begin
  -- Re-runnable: once the column is gone there is nothing left to protect.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'proposals'
                and column_name = 'service_offering_request_id') then
    execute 'select exists (select 1 from public.proposals where service_offering_request_id is not null)'
      into v_linked;
  end if;
  if v_linked then
    raise exception 'proposals still linked to service requests; refusing to drop the link column';
  end if;
end $$;

alter table public.proposals drop column if exists service_offering_request_id;

commit;
