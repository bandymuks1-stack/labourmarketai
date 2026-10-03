-- Seed for the EVID-2 self-review proof. Two orgs; every journal-review gate on.
-- 1111 WORKER   plain worker in org A
-- 2222 MGR      manager of org A
-- 3333 OWNERW   owner of org A AND a worker who logs their own work (the defect case)
-- 4444 MGR2     second manager of org A (the legitimate "other authorized party")
-- 5555 OUT      manager of org B (wrong org)
-- 6666 ADMIN    platform admin (also a worker who logs own work)
-- 7777 STRANGER holds no engagement anywhere
insert into public.organizations (id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'), ('bbbbbbbb-0000-0000-0000-00000000000b');
insert into public.profiles (id, active_role) values
  ('11111111-1111-1111-1111-111111111111','worker'),
  ('22222222-2222-2222-2222-222222222222','company'),
  ('33333333-3333-3333-3333-333333333333','company'),
  ('44444444-4444-4444-4444-444444444444','company'),
  ('55555555-5555-5555-5555-555555555555','company'),
  ('66666666-6666-6666-6666-666666666666','admin'),
  ('77777777-7777-7777-7777-777777777777','worker');
insert into public.workers (id, profile_id) values
  ('aaaa1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111'),
  ('aaaa3333-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333'),
  ('aaaa6666-0000-0000-0000-000000000006','66666666-6666-6666-6666-666666666666'),
  ('aaaa0000-0000-0000-0000-000000000009', null);   -- worker with NO profile (agency-managed)
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, journal_review_enabled) values
  ('ecec1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','aaaaaaaa-0000-0000-0000-00000000000a','active','employee',true),
  ('ecec2222-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','aaaaaaaa-0000-0000-0000-00000000000a','active','manager',true),
  ('ecec3333-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','aaaaaaaa-0000-0000-0000-00000000000a','active','owner',true),
  ('ecec4444-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','aaaaaaaa-0000-0000-0000-00000000000a','active','manager',true),
  ('ecec5555-0000-0000-0000-000000000005','55555555-5555-5555-5555-555555555555','bbbbbbbb-0000-0000-0000-00000000000b','active','manager',true),
  ('ecec6666-0000-0000-0000-000000000006','66666666-6666-6666-6666-666666666666','aaaaaaaa-0000-0000-0000-00000000000a','active','manager',true);
insert into public.skills (id, slug) values
  ('5c111111-0000-0000-0000-000000000001','weld'),
  ('5c222222-0000-0000-0000-000000000002','plaster'),
  ('5c333333-0000-0000-0000-000000000003','tile');
-- worker 1111 declares weld; OWNERW declares plaster + tile; ADMIN-worker declares weld
insert into public.worker_skills (worker_id, skill_id, verified, source, confidence_bin) values
  ('aaaa1111-0000-0000-0000-000000000001','5c111111-0000-0000-0000-000000000001',false,'self_declared','yellow'),
  ('aaaa3333-0000-0000-0000-000000000003','5c222222-0000-0000-0000-000000000002',false,'self_declared','yellow'),
  ('aaaa3333-0000-0000-0000-000000000003','5c333333-0000-0000-0000-000000000003',false,'self_declared','yellow'),
  ('aaaa6666-0000-0000-0000-000000000006','5c111111-0000-0000-0000-000000000001',false,'self_declared','yellow');
-- entries (all against the org A engagement of their author)
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self) values
  ('e1000000-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','ecec1111-0000-0000-0000-000000000001','Welded frame.','h1'),
  ('e3000000-0000-0000-0000-000000000001','aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','Owner plastered wall A.','h3a'),
  ('e3000000-0000-0000-0000-000000000002','aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','Owner plastered wall B.','h3b'),
  ('e3000000-0000-0000-0000-000000000003','aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','Owner plastered wall C.','h3c'),
  ('e3000000-0000-0000-0000-000000000004','aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','Owner tiled floor (pre-existing self-confirmation).','h3d'),
  ('e3000000-0000-0000-0000-000000000005','aaaa3333-0000-0000-0000-000000000003','ecec3333-0000-0000-0000-000000000003','Owner tiled bath (auto-confirm probe).','h3e'),
  ('e6000000-0000-0000-0000-000000000001','aaaa6666-0000-0000-0000-000000000006','ecec6666-0000-0000-0000-000000000006','Admin-worker welded.','h6'),
  ('e9000000-0000-0000-0000-000000000001','aaaa0000-0000-0000-0000-000000000009','ecec1111-0000-0000-0000-000000000001','Agency-managed worker, no profile.','h9');
-- PRE-EXISTING HISTORY (written under the old rules): one honest confirmation by
-- another manager, one SELF-confirmation by the owner (must survive untouched).
insert into public.journal_entry_confirmations (id, entry_id, confirmer_id, confirmer_engagement_context_id, confirmer_role, confirmation_scope) values
  ('c0000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','ecec2222-0000-0000-0000-000000000002','manager','{"action":"confirm","decision":"approved"}'),
  ('c0000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000004','33333333-3333-3333-3333-333333333333','ecec3333-0000-0000-0000-000000000003','owner','{"action":"confirm","decision":"approved"}');
-- learning auto-confirm probe: policy on, a pending item on the OWNERW entry
insert into public.learning_signals (id, confidence_score) values ('1e000000-0000-0000-0000-000000000001', 95);
insert into public.learning_policy_settings (id, organization_id, policy_kind, enabled, scope, rule, enabled_by) values
  ('9a000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','auto_confirm_journal_skill',true,
   '{"all_org_workers":true}','{"min_confidence":80}','22222222-2222-2222-2222-222222222222');
insert into public.learning_review_queue (id, subject_worker_id, subject_skill_id, organization_id, journal_entry_id, signal_id, status, suggestion_kind) values
  ('a1000000-0000-0000-0000-000000000001','aaaa3333-0000-0000-0000-000000000003','5c333333-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','e3000000-0000-0000-0000-000000000005','1e000000-0000-0000-0000-000000000001','pending','confirm_skill'),
  ('a1000000-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001','5c111111-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','e1000000-0000-0000-0000-000000000001','1e000000-0000-0000-0000-000000000001','pending','confirm_skill');
-- journal_entries insert policy (production) so self-declared submission can be proven
create policy journal_entries_insert on public.journal_entries for insert
  with check ((owns_worker(worker_id) AND (visibility_scope = 'closed'::text)));
grant insert on public.journal_entries to authenticated;
grant select on public.worker_skills to authenticated;
