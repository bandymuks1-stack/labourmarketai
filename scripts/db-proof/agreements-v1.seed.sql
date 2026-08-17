-- AGREEMENT & RIGHTS ENGINE v1 — proof seed, part 1 (pre-migration actors).
-- Extends the document-file-layer seed with the caller classes the
-- agreements authority matrix additionally names. Fixed uuids so the shell
-- probes can address them. Throwaway PG only.
--
-- Doc-layer seed already provides (ORG_A aaaaaaaa-…, ORG_B bbbbbbbb-…):
--   OWNER    11111111-…  owner of ORG_A
--   ADMIN2   22222222-…  admin of ORG_A
--   MEMBER   33333333-…  plain member of ORG_A
--   MANAGER  44444444-…  manager of ORG_A
--   OUTSIDER 55555555-…  owner of ORG_B
--   WORKER   66666666-…  worker profile, worker row cccccccc-…
--   PLATFORM 77777777-…  platform admin (app.is_admin=true)

insert into public.profiles (id) values
  ('88888888-8888-4888-8888-888888888888'), -- ENG: engagement-truth member of ORG_A (no membership row)
  ('99999999-9999-4999-8999-999999999999'), -- REVOKED: former admin of ORG_A
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1')  -- NOONE: attacker, no org at all
on conflict do nothing;

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999', 'admin', 'revoked')
on conflict do nothing;

insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'active', 'worker')
on conflict do nothing;
