-- AGREEMENT & RIGHTS ENGINE v1 — proof seed, part 2 (post-migration
-- fixtures, inserted as the superuser: register entries, file versions and
-- a PUBLISHED agreement workflow definition). Throwaway PG only.

-- Org register entries (the document engine's own RPC path is proven by
-- scripts/db-proof/document-file-layer.sh; here they are fixtures).
insert into public.org_documents (id, organization_id, document_type_slug, title, created_by) values
  ('d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'org_agreement_attachment', 'Service agreement text v1', '11111111-1111-4111-8111-111111111111'),
  ('d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'org_agreement_attachment', 'ORG_B foreign agreement text', '55555555-5555-4555-8555-555555555555')
on conflict do nothing;

insert into public.document_files
  (id, scope, org_document_id, version, storage_path, original_filename,
   mime_type, byte_size, content_sha256, uploaded_by) values
  ('f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0', 'organization',
   'd0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0', 1,
   'organization/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0/v1/agreement.pdf',
   'agreement.pdf', 'application/pdf', 1024,
   '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
   '11111111-1111-4111-8111-111111111111'),
  ('f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1', 'organization',
   'd1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1', 1,
   'organization/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1/v1/foreign.pdf',
   'foreign.pdf', 'application/pdf', 1024,
   'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
   '55555555-5555-4555-8555-555555555555')
on conflict do nothing;

-- A published one-step agreement-approval workflow for ORG_A (steps are
-- inserted BEFORE publish — the frozen-steps trigger forbids the reverse
-- order, which is exactly the engine's contract).
insert into public.workflow_definitions
  (id, organization_id, slug, name, context_entity_type, created_by) values
  ('e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'agreement_approval', 'Agreement approval', 'agreement', '11111111-1111-4111-8111-111111111111')
on conflict do nothing;

insert into public.workflow_definition_versions (id, definition_id, version, created_by) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 'e0e0e0e0-e0e0-4e0e-8e0e-e0e0e0e0e0e0', 1,
   '11111111-1111-4111-8111-111111111111')
on conflict do nothing;

insert into public.workflow_version_steps
  (version_id, step_order, name, approval_mode, approver_rule) values
  ('e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1', 1, 'Internal review', 'single',
   '{"kind":"org_role","roles":["owner","admin"]}'::jsonb)
on conflict do nothing;

update public.workflow_definition_versions
   set published_at = now()
 where id = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1'
   and published_at is null;
