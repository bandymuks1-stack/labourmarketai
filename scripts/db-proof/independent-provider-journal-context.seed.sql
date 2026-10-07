-- Seed for independent-provider-journal-context.sh (runs AFTER the two team seeds).
-- A CLIENT organisation with a project and a representative; independent providers
-- (personal engagement context, organization NULL) with and without a PERSON
-- assignment; an employee of the client (employer flow); an owner of an own workspace.
alter table public.engagement_contexts add column if not exists journal_review_enabled boolean not null default false;
alter table public.engagement_contexts add column if not exists is_primary boolean not null default false;

insert into public.profiles (id, active_role, full_name) values
  ('c1000000-0000-0000-0000-000000000001','company','Client Rep'),
  ('c1000000-0000-0000-0000-000000000002','worker','Independent One'),
  ('c1000000-0000-0000-0000-000000000003','worker','Independent Unassigned'),
  ('c1000000-0000-0000-0000-000000000004','worker','Independent Ended'),
  ('c1000000-0000-0000-0000-000000000005','worker','Sole Trader Owner'),
  ('c1000000-0000-0000-0000-000000000006','worker','Client Employee'),
  ('c1000000-0000-0000-0000-000000000007','company','Other Client Rep');
insert into public.organizations (id, organization_type, display_name, legal_name) values
  ('c0000000-0000-0000-0000-0000000000c1','company','Client Org', 'Client Org'),
  ('c0000000-0000-0000-0000-0000000000c2','company','Other Client Org', 'Other Client Org'),
  ('c0000000-0000-0000-0000-0000000000d1','company','Sole Trader Workspace','Sole Trader Workspace');
insert into public.companies (id, owner_profile_id) values
  ('c0c00000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001'),
  ('c0c00000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000007');
insert into public.projects (id, company_id, organization_id, title) values
  ('c9000000-0000-0000-0000-0000000000c1','c0c00000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','Client Hall'),
  ('c9000000-0000-0000-0000-0000000000c2','c0c00000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-0000000000c2','Other Client Yard');
insert into public.workers (id, profile_id) values
  ('c2000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002'),
  ('c2000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003'),
  ('c2000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000004'),
  ('c2000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000005'),
  ('c2000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000006');
-- the client rep manages the client organisation (and owns its company); other rep manages the other client
insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug, created_at, journal_review_enabled) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','active','owner','2026-01-01',true),
  ('c1000000-0000-0000-0000-000000000007','c0000000-0000-0000-0000-0000000000c2','active','owner','2026-01-01',true),
  -- independent providers: PERSONAL context, no organisation (the real production shape)
  ('c1000000-0000-0000-0000-000000000002',null,'active','freelancer','2026-02-01',false),
  ('c1000000-0000-0000-0000-000000000003',null,'active','freelancer','2026-02-01',false),
  ('c1000000-0000-0000-0000-000000000004',null,'active','freelancer','2026-02-01',false),
  ('c1000000-0000-0000-0000-000000000005',null,'active','freelancer','2026-02-01',false),
  -- the sole trader also owns a workspace of their own
  ('c1000000-0000-0000-0000-000000000005','c0000000-0000-0000-0000-0000000000d1','active','owner','2026-02-01',false),
  -- an employee of the client: org-scoped, review-enabled (employer flow)
  ('c1000000-0000-0000-0000-000000000006','c0000000-0000-0000-0000-0000000000c1','active','employee','2026-02-01',true),
  ('c1000000-0000-0000-0000-000000000006',null,'active','employee','2026-02-01',false);
insert into public.project_worker_assignments (project_id, worker_id, status) values
  ('c9000000-0000-0000-0000-0000000000c1','c2000000-0000-0000-0000-000000000002','active'),
  ('c9000000-0000-0000-0000-0000000000c1','c2000000-0000-0000-0000-000000000004','ended'),
  ('c9000000-0000-0000-0000-0000000000c1','c2000000-0000-0000-0000-000000000005','active'),
  ('c9000000-0000-0000-0000-0000000000c1','c2000000-0000-0000-0000-000000000006','active');
grant insert on public.journal_entries to authenticated;
