-- Rollback for 20260713160000_agency_clients_v1.sql (agency client records).
-- Reverses everything the up migration added. Demands themselves are never
-- deleted — only the link column and the client records go away.

begin;

drop function if exists public.set_demand_agency_client_v1(uuid, uuid);
drop function if exists public.remove_agency_client_v1(uuid);
drop function if exists public.save_agency_client_v1(text, text, text, text, uuid);

drop index if exists public.idx_customer_requests_agency_client;
alter table public.customer_requests drop column if exists agency_client_id;

drop policy if exists agency_clients_select on public.agency_clients;
drop trigger if exists trg_agency_clients_updated_at on public.agency_clients;
drop index if exists public.idx_agency_clients_company;
drop table if exists public.agency_clients;

commit;
