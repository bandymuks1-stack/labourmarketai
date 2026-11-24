-- Rollback for 20260716120000_contact_disclosure_requests_v1.sql
-- Guarded drop: refuses if real requests exist (owner must decide first).
-- audit_logs rows written by the RPCs are append-only history and stay.

do $$
begin
  if exists (select 1 from public.contact_disclosure_requests limit 1) then
    raise exception 'contact_disclosure_requests holds rows — refusing automatic rollback';
  end if;
end $$;

drop function if exists public.list_my_contact_disclosure_requests_v1();
drop function if exists public.expire_contact_disclosure_requests_v1();
drop function if exists public.withdraw_contact_disclosure_request_v1(uuid);
drop function if exists public.respond_contact_disclosure_request_v1(uuid, text);
drop function if exists public.propose_contact_disclosure_request_v1(uuid, uuid, uuid, jsonb, text);
drop function if exists public.contact_disclosure_log_change(uuid, uuid, text, text, text, text);

drop trigger if exists contact_disclosure_request_events_append_only
  on public.contact_disclosure_request_events;
drop function if exists public.contact_disclosure_events_block_mutation();

drop table if exists public.contact_disclosure_request_events;
drop table if exists public.contact_disclosure_requests;
