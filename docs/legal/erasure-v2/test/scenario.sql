-- Erasure v2 scenario on the stub schema. Subject U; colleague/manager V;
-- invitee W; X = a last owner (blocked case). All ids synthetic.
\set ON_ERROR_STOP 1
\set U '''00000000-0000-0000-0000-0000000000a1'''
\set V '''00000000-0000-0000-0000-0000000000a2'''
\set W '''00000000-0000-0000-0000-0000000000a3'''
\set X '''00000000-0000-0000-0000-0000000000a4'''
\set ORG '''00000000-0000-0000-0000-00000000f001'''

insert into auth.users values (:U, 'subject@example.test'), (:V, 'v@example.test'), (:W, 'w@example.test'), (:X, 'x@example.test');
insert into public.profiles (id, email, full_name) values (:U, 'subject@example.test', 'Subject'), (:V, 'v@example.test', 'V'), (:W, 'w@example.test', 'W'), (:X, 'x@example.test', 'X');
insert into public.workers (id, profile_id, display_name) values ('00000000-0000-0000-0000-0000000000b1', :U, 'Subject'), ('00000000-0000-0000-0000-0000000000b2', :V, 'V');

insert into public.company_memberships (organization_id, profile_id, role, status) values (:ORG, :V, 'owner', 'active'), (:ORG, :U, 'member', 'active');
insert into public.engagement_contexts (id, profile_id, organization_id, status) values
  ('00000000-0000-0000-0000-0000000000c1', :U, :ORG, 'ended'),
  ('00000000-0000-0000-0000-0000000000c2', :U, null, 'active'),
  ('00000000-0000-0000-0000-0000000000c3', :V, :ORG, 'active');
-- jeA confirmed by V; jeB unconfirmed; jeC corrects jeA (kept by closure); jeV is V's, confirmed by U
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'A'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', 'B'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3', 'V');
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, correction_of) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2', 'C', '00000000-0000-0000-0000-0000000000d1');
insert into public.journal_entry_confirmations (entry_id, confirmer_id, confirmer_engagement_context_id) values
  ('00000000-0000-0000-0000-0000000000d1', :V, '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-0000000000d4', :U, '00000000-0000-0000-0000-0000000000c1');
insert into public.journal_entry_work_items (worker_id, journal_entry_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d2');
insert into public.journal_entry_photos (profile_id, entry_id, storage_path) values (:U, '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1/d2/p1/x.jpg');
insert into public.work_hour_allocations (entered_by, worker_id, journal_entry_id) values (:U, '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1');

insert into public.privacy_consent_events (user_id) values (:U), (:U), (:V);
insert into public.personal_data_disclosures (worker_user_id, disclosed_by, metadata) values (:U, :V, '{"k":1}');

insert into public.customer_requests (id, profile_id, payload, status, organization_id) values
  ('00000000-0000-0000-0000-0000000000e1', :U, '{"source":"privacy_self_service","privacy_request_type":"account_deletion","notes":"please delete"}', 'approved', null),
  ('00000000-0000-0000-0000-0000000000e2', :U, '{"title":"crew"}', 'submitted', :ORG),
  ('00000000-0000-0000-0000-0000000000e3', :U, '{}', 'draft', null);
insert into public.customer_request_attachments (request_id, profile_id, storage_path, file_name) values
  ('00000000-0000-0000-0000-0000000000e2', :U, '00000000-0000-0000-0000-0000000000a1/e2/b.pdf', 'Subject_CV.pdf'),
  ('00000000-0000-0000-0000-0000000000e3', :U, '00000000-0000-0000-0000-0000000000a1/e3/a.pdf', 'a.pdf');
insert into public.booking_requests (id, owner_id, request_id, worker_id, status, readiness_snapshot) values
  ('00000000-0000-0000-0000-0000000000e9', :V, '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'accepted', '{"name":"Subject"}');
insert into public.company_worker_engagements (worker_id, source_booking_id, status, subject_key) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e9', 'ended', '00000000-0000-0000-0000-00000000cafe');

insert into public.conversations (id, created_by) values ('00000000-0000-0000-0000-000000000101', :U), ('00000000-0000-0000-0000-000000000102', :U);
insert into public.conversation_participants (conversation_id, profile_id) values
  ('00000000-0000-0000-0000-000000000101', :U), ('00000000-0000-0000-0000-000000000101', :V), ('00000000-0000-0000-0000-000000000102', :U);
insert into public.conversation_messages (conversation_id, author_id, body, translated_text) values
  ('00000000-0000-0000-0000-000000000101', :U, 'my words', 'mano zodziai'),
  ('00000000-0000-0000-0000-000000000101', :V, 'their words', null),
  ('00000000-0000-0000-0000-000000000102', :U, 'note to self', null);

insert into public.invitations (id, inviter_profile_id, status, invited_email) values
  ('00000000-0000-0000-0000-000000000201', :U, 'pending', 'someone@example.test'),
  ('00000000-0000-0000-0000-000000000202', :U, 'accepted', 'w@example.test'),
  ('00000000-0000-0000-0000-000000000203', :V, 'accepted', 'subject@example.test');
update public.invitations set accepted_by_profile_id = :W where id = '00000000-0000-0000-0000-000000000202';
update public.invitations set accepted_by_profile_id = :U, invited_name = 'Subject' where id = '00000000-0000-0000-0000-000000000203';
insert into public.invitation_acceptances (profile_id, invitation_id) values (:W, '00000000-0000-0000-0000-000000000202'), (:U, '00000000-0000-0000-0000-000000000203');
insert into public.company_worker_invitations (inviter_profile_id, invited_email, status) values (:V, 'Subject@Example.test', 'pending');
insert into public.leads (email) values ('subject@example.test'), ('other@example.test');
insert into public.waitlist (email) values ('subject@example.test');

insert into public.organization_people (linked_profile_id, linked_worker_id, link_state, link_method, display_name, normalized_name, source_note, created_by)
  values (:U, '00000000-0000-0000-0000-0000000000b1', 'linked', 'worker_confirmed', 'Subject Person', 'subject person', 'payroll 2019', :V);
insert into public.audit_logs (actor_id, entity_id, payload, updated_at) values
  (:U, null, '{"display_name":"Subject","worker_id":"00000000-0000-0000-0000-0000000000b1","role":"member"}', '2020-01-01'),
  (:V, null, '{"before":{"profile_id":"00000000-0000-0000-0000-0000000000a1","role":"member"}}', '2020-01-01'),
  (:V, null, '{"unrelated":true}', '2020-01-01');
insert into public.notification_events (recipient_profile_id, entity_id, metadata) values
  (:V, '00000000-0000-0000-0000-0000000000a1', '{"title":"Subject confirmed","focus":"x"}'), (:U, gen_random_uuid(), '{}');
insert into public.ai_runs (profile_id, output_excerpt, request_context) values (:U, 'excerpt', 'ctx');
insert into public.usage_cost_events (profile_id, session_id, workspace_id, metadata) values (:U, 'sess', '00000000-0000-0000-0000-0000000000a1', '{"request_context":"x","tier":"t"}');
insert into public.pilot_events (profile_id, session_id) values (:U, 's1');
insert into public.pilot_events (profile_id, session_id) values (null, 's1'), (null, 's2');
insert into public.work_objects (created_by) values (:U), (:U);
insert into public.timesheets (id, created_by, worker_id, status, lines_snapshot) values
  ('00000000-0000-0000-0000-000000000301', :V, '00000000-0000-0000-0000-0000000000b1', 'approved', '[{"worker":"00000000-0000-0000-0000-0000000000b1","h":8}]');
insert into public.timesheet_events (timesheet_id, actor_profile_id) values ('00000000-0000-0000-0000-000000000301', :U);
insert into public.agreements (id, created_by) values ('00000000-0000-0000-0000-000000000401', :U);
insert into public.agreement_events (agreement_id, actor_id, after_state) values ('00000000-0000-0000-0000-000000000401', :U, '{"responsible":"00000000-0000-0000-0000-0000000000a1"}');
insert into public.workflow_instance_approvers (approver_profile_id, decided_by, decision, decided_at) values (:U, :U, 'approved', now());
insert into public.worker_skills (worker_id) values ('00000000-0000-0000-0000-0000000000b1');
insert into public.worker_display_name_backfill_20260805 values (:U, 'Subject');

insert into storage.objects (bucket_id, name, owner_id) values
  ('profile-avatars', '00000000-0000-0000-0000-0000000000a1/avatar-1.png', '00000000-0000-0000-0000-0000000000a1'),
  ('journal-entry-photos', '00000000-0000-0000-0000-0000000000a1/d2/p1/x.jpg', '00000000-0000-0000-0000-0000000000a1'),
  ('customer-request-attachments', '00000000-0000-0000-0000-0000000000a1/e2/b.pdf', '00000000-0000-0000-0000-0000000000a1'),
  ('customer-request-attachments', '00000000-0000-0000-0000-0000000000a1/e3/a.pdf', '00000000-0000-0000-0000-0000000000a1'),
  ('evidence-media', 'org/00000000-0000-0000-0000-00000000f001/p.jpg', '00000000-0000-0000-0000-0000000000a1'),
  ('profile-avatars', '00000000-0000-0000-0000-0000000000a2/avatar.png', '00000000-0000-0000-0000-0000000000a2');

-- X: last active owner of another org (blocked case)
insert into public.company_memberships (organization_id, profile_id, role, status) values ('00000000-0000-0000-0000-00000000f002', :X, 'owner', 'active');
insert into public.customer_requests (profile_id, payload, status) values (:X, '{"source":"privacy_self_service","privacy_request_type":"account_deletion"}', 'approved');
