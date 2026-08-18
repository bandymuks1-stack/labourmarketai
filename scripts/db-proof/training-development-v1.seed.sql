-- ============================================================================
-- Seed for scripts/db-proof/training-development-v1.sh — runs as superuser
-- AFTER the three real migrations, so it may write the spine tables directly.
-- Every probe afterwards runs under `set local role authenticated|anon` with
-- a real app.uid, so RLS + grants genuinely decide the results.
-- ============================================================================

insert into public.profiles (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner@a.test'),
  ('22222222-2222-4222-8222-222222222222', 'admin@a.test'),
  ('33333333-3333-4333-8333-333333333333', 'member@a.test'),
  ('44444444-4444-4444-8444-444444444444', 'manager@a.test'),
  ('55555555-5555-4555-8555-555555555555', 'outsider@b.test'),
  ('77777777-7777-4777-8777-777777777777', 'platform@x.test'),
  ('99999999-9999-4999-8999-999999999999', 'revoked@a.test'),
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'noone@x.test')
on conflict (id) do nothing;

insert into public.companies (id) values
  ('c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0')
on conflict (id) do nothing;

insert into public.organizations (id, display_name, legacy_company_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Org A', 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Org B', null)
on conflict (id) do nothing;

insert into public.projects (id, company_id) values
  ('50505050-5050-4505-8505-505050505050', 'c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0')
on conflict (id) do nothing;

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner',   'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'admin',   'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'member',  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'manager', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', 'member',  'revoked'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555', 'owner',   'active');

-- The MEMBER is also a worker, with one journal entry (evidence source).
insert into public.workers (id, profile_id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333')
on conflict (id) do nothing;
insert into public.journal_entries (id, worker_id) values
  ('1e1e1e1e-1e1e-41e1-81e1-1e1e1e1e1e1e', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
on conflict (id) do nothing;

insert into public.skills (id, slug) values
  ('5c5c5c5c-5c5c-45c5-85c5-5c5c5c5c5c5c', 'scaffolding')
on conflict (id) do nothing;

-- Org register documents + file versions, one per organization.
insert into public.org_documents
  (id, organization_id, document_type_slug, title, status, created_by) values
  ('d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'org_instruction', 'Height work instruction', 'active', '11111111-1111-4111-8111-111111111111'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'org_instruction', 'Other org instruction', 'active', '55555555-5555-4555-8555-555555555555')
on conflict (id) do nothing;

insert into public.document_files
  (id, scope, org_document_id, version, storage_path, original_filename, mime_type,
   byte_size, content_sha256, uploaded_by) values
  ('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0', 'organization', 'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0',
   1, 'org/a/1.pdf', 'a.pdf', 'application/pdf', 1024,
   '0000000000000000000000000000000000000000000000000000000000000001',
   '11111111-1111-4111-8111-111111111111'),
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'organization', 'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1',
   1, 'org/b/1.pdf', 'b.pdf', 'application/pdf', 1024,
   '0000000000000000000000000000000000000000000000000000000000000002',
   '55555555-5555-4555-8555-555555555555')
on conflict (id) do nothing;

-- Two real work_tasks: one owned by the OWNER, one owned by the OUTSIDER.
insert into public.work_tasks (id, title, created_by) values
  ('7a5c7a5c-7a5c-47a5-87a5-7a5c7a5c7a5c', 'Follow up', '11111111-1111-4111-8111-111111111111'),
  ('7b5c7b5c-7b5c-47b5-87b5-7b5c7b5c7b5c', 'Foreign task', '55555555-5555-4555-8555-555555555555')
on conflict (id) do nothing;
