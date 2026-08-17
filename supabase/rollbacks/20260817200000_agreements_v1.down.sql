-- ROLLBACK for 20260817200000_agreements_v1.sql
-- Restores the prior state exactly: drops the 2 append-only triggers, their
-- 2 trigger functions, the visibility helper, the 8 SECURITY DEFINER
-- commands and the 3 NEW tables. Nothing existing was recreated by the up
-- migration, so nothing needs restoring verbatim.
--
-- REFUSES while real agreement rows exist: feature-created rows live ONLY
-- in agreements / agreement_amendments / agreement_events, and dropping a
-- populated register would silently destroy an organization's agreement
-- records. After real use the correct move is a FORWARD FIX or a separate
-- owner data decision, never this rollback.

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.agreements;
  if n > 0 then
    raise exception
      'agreements rollback refused: % real agreement row(s) exist — forward-fix instead',
      n;
  end if;
  select count(*) into n from public.agreement_amendments;
  if n > 0 then
    raise exception
      'agreements rollback refused: % amendment row(s) exist — forward-fix instead',
      n;
  end if;
  select count(*) into n from public.agreement_events;
  if n > 0 then
    raise exception
      'agreements rollback refused: % event row(s) exist — forward-fix instead',
      n;
  end if;
end $$;

drop function if exists public.attach_agreement_signature_evidence_v1(uuid, uuid);
drop function if exists public.attach_agreement_document_v1(uuid, uuid);
drop function if exists public.add_agreement_amendment_v1(uuid, text, text, text, text);
drop function if exists public.sync_agreement_approval_v1(uuid);
drop function if exists public.submit_agreement_for_approval_v1(uuid);
drop function if exists public.set_agreement_status_v1(uuid, text);
drop function if exists public.update_agreement_v1(uuid, text, text, text, text, text, text, text);
drop function if exists public.create_agreement_v1(uuid, text, text, text, text, text, text, text, text, text);

drop trigger if exists agreement_amendments_append_only on public.agreement_amendments;
drop trigger if exists agreement_events_append_only on public.agreement_events;
drop function if exists public.agreement_amendments_guard();
drop function if exists public.agreement_events_guard();

drop table if exists public.agreement_events;
drop table if exists public.agreement_amendments;

drop function if exists public.can_view_agreement_v1(uuid);

drop table if exists public.agreements;

commit;
