\set ON_ERROR_STOP 1
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000000a1';
  v uuid := '00000000-0000-0000-0000-0000000000a2';
  n int; t text; j jsonb;
begin
  -- ERASURE of the person: profile + worker gone; auth user still there (server deletes it last)
  assert not exists (select 1 from public.profiles where id = u), 'profile still exists';
  assert not exists (select 1 from public.workers where profile_id = u), 'worker still exists';
  assert exists (select 1 from auth.users where id = u), 'auth user must NOT be deleted by SQL';
  -- E1 journal: confirmed A and its correction C retained detached; unconfirmed B deleted
  assert (select count(*) from public.journal_entries where id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d3') and worker_id is null) = 2, 'retained entries';
  assert not exists (select 1 from public.journal_entries where id = '00000000-0000-0000-0000-0000000000d2'), 'unconfirmed entry not deleted';
  assert (select count(*) from public.journal_entry_work_items where worker_id is null) = 1, 'work item of retained entry';
  assert not exists (select 1 from public.journal_entry_photos), 'photos must be deleted';
  -- confirmation the subject gave on V's entry survives, confirmer nulled; its context retained detached
  assert (select confirmer_id is null from public.journal_entry_confirmations where entry_id = '00000000-0000-0000-0000-0000000000d4'), 'confirmation given';
  assert (select count(*) from public.engagement_contexts where profile_id is null) = 2, 'retained contexts';
  -- E2 consent ledger: detached, one tombstone, month-coarse, never returned
  select count(distinct erased_subject_id), min(erased_at)::text into n, t from public.privacy_consent_events where user_id is null;
  assert n = 1, 'one tombstone';
  assert t = date_trunc('month', now())::text, 'erased_at must be month-coarse';
  select report into j from public.privacy_erasure_jobs where state = 'storage_pending';
  assert position((select erased_subject_id::text from public.privacy_consent_events where user_id is null limit 1) in j::text) = 0, 'tombstone leaked into job report';
  assert (select worker_user_id is null and metadata is null from public.personal_data_disclosures), 'disclosure detach';
  -- E4 requests: privacy row + org demand retained, personal demand deleted
  assert (select count(*) from public.customer_requests where profile_id is null) = 2, 'retained requests';
  assert not exists (select 1 from public.customer_requests where id = '00000000-0000-0000-0000-0000000000e3'), 'personal demand deleted';
  assert (select payload ? 'notes' from public.customer_requests where id = '00000000-0000-0000-0000-0000000000e1') = false, 'privacy payload notes scrubbed';
  assert (select storage_path like 'erased/%' and file_name = 'attachment.pdf' and profile_id is null from public.customer_request_attachments), 'org attachment moved + renamed';
  -- E3 booking / engagement
  assert (select worker_id is null and readiness_snapshot = '{}'::jsonb and owner_id = v from public.booking_requests), 'booking detach';
  assert (select worker_id is null and subject_key <> '00000000-0000-0000-0000-00000000cafe' from public.company_worker_engagements), 'subject_key re-minted';
  -- G6 messages
  assert not exists (select 1 from public.conversations where id = '00000000-0000-0000-0000-000000000102'), 'solo thread deleted';
  assert (select count(*) from public.conversation_messages where author_id is null and body = '' and translated_text is null) = 1, 'message redacted';
  assert (select count(*) from public.conversation_messages where author_id = v and body = 'their words') = 1, 'other party message intact';
  -- invitations
  assert (select status = 'revoked' and inviter_profile_id is null from public.invitations where id = '00000000-0000-0000-0000-000000000201'), 'pending invite revoked';
  assert exists (select 1 from public.invitation_acceptances where invitation_id = '00000000-0000-0000-0000-000000000202'), 'W acceptance must survive (G2)';
  assert (select accepted_by_profile_id is null and invited_email is null and invited_name is null from public.invitations where id = '00000000-0000-0000-0000-000000000203'), 'invite to subject scrubbed';
  assert (select invited_email like 'erased-%@erased.invalid' and status = 'cancelled' from public.company_worker_invitations), 'email-keyed invite';
  assert (select count(*) from public.leads) = 1 and not exists (select 1 from public.waitlist), 'leads/waitlist';
  -- G3 roster row
  assert (select link_state = 'unlinked' and display_name = 'Erased person' and source_note is null and linked_profile_id is null from public.organization_people), 'org people scrub';
  -- G3 logs
  assert (select count(*) from public.audit_logs where payload::text like '%0000000000a1%' or payload::text like '%0000000000b1%' or payload ? 'display_name') = 0, 'audit payload scrub';
  assert (select count(*) from public.audit_logs where updated_at = '2020-01-01') = 3, 'updated_at must not be bumped (timing fingerprint)';
  assert (select output_excerpt is null and request_context is null and profile_id is null from public.ai_runs), 'ai_runs scrub';
  assert (select profile_id is null and session_id is null and workspace_id is null and not (metadata ? 'request_context') and metadata ? 'tier' from public.usage_cost_events), 'usage scrub';
  assert (select count(*) from public.pilot_events) = 1, 'pilot session purge';
  assert (select entity_id <> u and not (metadata ? 'title') from public.notification_events where recipient_profile_id = v), 'others notification';
  assert not exists (select 1 from public.notification_events where recipient_profile_id = u), 'own notifications';
  -- G2 records created for others survive
  assert (select count(*) from public.work_objects where created_by is null) = 2, 'work_objects survive';
  assert (select count(*) from public.agreements where created_by is null) = 1, 'agreement survives';
  assert (select actor_id is null and not (after_state::text like '%0000000000a1%') from public.agreement_events), 'append-only event detached + scrubbed';
  assert (select worker_id is null and lines_snapshot::text not like '%0000000000b1%' from public.timesheets), 'timesheet retained detached';
  assert (select actor_profile_id is null from public.timesheet_events), 'timesheet event actor';
  assert (select approver_profile_id is null and decided_by is null and decision = 'approved' from public.workflow_instance_approvers), 'approver';
  -- G4 no-FK
  assert not exists (select 1 from public.worker_display_name_backfill_20260805), 'backfill row';
  -- storage ownership dropped on the retained org object
  assert (select owner_id is null from storage.objects where bucket_id = 'evidence-media'), 'disown';
  -- every guard trigger re-enabled
  assert not exists (select 1 from pg_trigger where not tgisinternal and tgenabled = 'D'), 'trigger left disabled';
  raise notice 'ALL POST-EXECUTE ASSERTIONS PASSED';
end $$;
