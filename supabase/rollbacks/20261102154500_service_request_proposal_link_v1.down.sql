-- Rollback for 20261102154500_service_request_proposal_link_v1
-- Drops the provider's door, the index, then the link column. The column drop
-- refuses while any proposal carries a link: a linked offer is a business
-- record and is never erased by a rollback (unlink deliberately first).
-- Apply via Supabase MCP apply_migration.

begin;

drop function if exists public.create_proposal_from_service_request_v1(uuid, text, bigint, text, text, date);

drop index if exists public.proposals_service_offering_request_idx;

do $$
begin
  if exists (select 1 from public.proposals where service_offering_request_id is not null) then
    raise exception 'proposals still linked to service requests; refusing to drop the link column';
  end if;
end $$;

alter table public.proposals drop column if exists service_offering_request_id;

commit;
