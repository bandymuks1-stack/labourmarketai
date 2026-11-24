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

-- ===========================================================================
-- COUNTERPARTY SCENARIO (slice 1)
-- FREE   f1... freelancer / sole trader: owner of own org F, logs work on a client project
-- FREE2  f2... SECOND LOGIN controlled by FREE: manager of F, and ALSO manager of C (the shell)
-- CREP   c1... authorized representative (manager) of client org C
-- CREP2  c2... plain employee of C (no authority)
-- DREP   d1... manager of an unrelated org D
-- ===========================================================================
insert into public.organizations (id) values
  ('f0000000-0000-0000-0000-00000000000f'),   -- F  freelancer's own org
  ('c0000000-0000-0000-0000-0000000000c0'),   -- C  client
  ('d0000000-0000-0000-0000-0000000000d0');   -- D  unrelated
insert into public.profiles (id, active_role) values
  ('f1111111-1111-1111-1111-111111111111','worker'),
  ('f2222222-2222-2222-2222-222222222222','company'),
  ('c1111111-1111-1111-1111-111111111111','company'),
  ('c2222222-2222-2222-2222-222222222222','company'),
  ('d1111111-1111-1111-1111-111111111111','company');
insert into public.workers (id, profile_id) values
  ('aaaaf000-0000-0000-0000-000000000f01','f1111111-1111-1111-1111-111111111111');
insert into public.engagement_contexts (id, profile_id, organization_id, status, relationship_slug, journal_review_enabled) values
  ('ecf10000-0000-0000-0000-000000000001','f1111111-1111-1111-1111-111111111111','f0000000-0000-0000-0000-00000000000f','active','owner',false),
  ('ecf20000-0000-0000-0000-000000000002','f2222222-2222-2222-2222-222222222222','f0000000-0000-0000-0000-00000000000f','active','manager',false),
  ('ecf20000-0000-0000-0000-000000000003','f2222222-2222-2222-2222-222222222222','c0000000-0000-0000-0000-0000000000c0','active','manager',false),
  ('ecc10000-0000-0000-0000-000000000001','c1111111-1111-1111-1111-111111111111','c0000000-0000-0000-0000-0000000000c0','active','manager',false),
  ('ecc20000-0000-0000-0000-000000000002','c2222222-2222-2222-2222-222222222222','c0000000-0000-0000-0000-0000000000c0','active','employee',false),
  ('ecd10000-0000-0000-0000-000000000001','d1111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-0000000000d0','active','manager',false);
insert into public.projects (id, organization_id) values
  ('90000000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-0000000000c0'),  -- owned by client C
  ('90000000-0000-0000-0000-00000000000f','f0000000-0000-0000-0000-00000000000f'),  -- owned by freelancer's own org F
  ('90000000-0000-0000-0000-0000000000a0','aaaaaaaa-0000-0000-0000-00000000000a');  -- org A project, worker NOT assigned
insert into public.project_worker_assignments (project_id, worker_id, status) values
  ('90000000-0000-0000-0000-00000000000c','aaaaf000-0000-0000-0000-000000000f01','active'),
  ('90000000-0000-0000-0000-00000000000f','aaaaf000-0000-0000-0000-000000000f01','active');
-- entries of the freelancer (logged in their OWN org context F; explicit project attribution)
insert into public.journal_entries (id, worker_id, engagement_context_id, original_text, hash_self, project_id) values
  ('f1000000-0000-0000-0000-000000000001','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Installed fence section 1 for client.','hf1','90000000-0000-0000-0000-00000000000c'),
  ('f1000000-0000-0000-0000-000000000002','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Installed fence section 2 for client.','hf2','90000000-0000-0000-0000-00000000000c'),
  ('f1000000-0000-0000-0000-000000000003','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Fence section 3, first wording.','hf3','90000000-0000-0000-0000-00000000000c'),
  ('f1000000-0000-0000-0000-000000000004','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Unattributed work, no project.','hf4',null),
  ('f1000000-0000-0000-0000-000000000005','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Fence section 5 (revocation probe).','hf5','90000000-0000-0000-0000-00000000000c'),
  ('f1000000-0000-0000-0000-000000000006','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Fence section 6 (assignment-ended probe).','hf6','90000000-0000-0000-0000-00000000000c'),
  ('f1000000-0000-0000-0000-000000000007','aaaaf000-0000-0000-0000-000000000f01','ecf10000-0000-0000-0000-000000000001','Own-project work (shell probe).','hf7','90000000-0000-0000-0000-00000000000f');
