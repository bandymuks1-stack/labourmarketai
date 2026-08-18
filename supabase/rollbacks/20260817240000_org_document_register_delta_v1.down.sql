-- ROLLBACK for 20260817240000_org_document_register_delta_v1.sql
-- Restores the prior state exactly: drops the 4 NEW functions, restores the
-- org_document_events event_type check constraint to the train C list,
-- drops the 3 new indexes and the 5 additive columns.
--
-- `create_org_document_v1` and every other train C object were NOT touched
-- by the up migration, so nothing needs restoring verbatim here.
--
-- REFUSES while any added column holds real data: correspondence entries,
-- object filings, retention decisions and approval mirrors would be
-- silently destroyed by dropping the columns. After real use the correct
-- move is a FORWARD FIX or a separate owner data decision, never this
-- rollback. (retention_until / retention_note are train C columns and are
-- NOT dropped here; the retention writer is dropped, the recorded values
-- survive.)

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.org_documents
   where counterparty_name is not null
      or correspondence_date is not null
      or counterparty_reference is not null;
  if n > 0 then
    raise exception
      'org document register delta rollback refused: % correspondence row(s) exist — forward-fix instead',
      n;
  end if;
  select count(*) into n from public.org_documents where object_id is not null;
  if n > 0 then
    raise exception
      'org document register delta rollback refused: % document(s) filed against an object — forward-fix instead',
      n;
  end if;
  select count(*) into n from public.org_documents where approval_state is not null;
  if n > 0 then
    raise exception
      'org document register delta rollback refused: % approval mirror row(s) exist — forward-fix instead',
      n;
  end if;
  select count(*) into n from public.org_document_events
   where event_type in ('retention_set','approval_submitted','approval_synced');
  if n > 0 then
    raise exception
      'org document register delta rollback refused: % delta event row(s) exist — forward-fix instead',
      n;
  end if;
end $$;

drop function if exists public.sync_org_document_approval_v1(uuid);
drop function if exists public.submit_org_document_for_approval_v1(uuid);
drop function if exists public.set_org_document_retention_v1(uuid, text, text);
drop function if exists public.create_org_document_v2(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

-- Restore the train C event vocabulary verbatim (drop + re-add, narrowing
-- back is safe only because the 0-row guard above proved no delta event
-- row exists).
alter table public.org_document_events
  drop constraint org_document_events_event_type_check;
alter table public.org_document_events
  add constraint org_document_events_event_type_check
  check (event_type in
    ('created','file_uploaded','archived','revoked',
     'ack_assigned','acknowledged','downloaded'));

drop index if exists public.org_documents_retention_idx;
drop index if exists public.org_documents_object_idx;
drop index if exists public.org_documents_correspondence_idx;

alter table public.org_documents
  drop column if exists approval_state,
  drop column if exists object_id,
  drop column if exists counterparty_reference,
  drop column if exists correspondence_date,
  drop column if exists counterparty_name;

commit;
