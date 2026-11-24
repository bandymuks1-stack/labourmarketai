-- Durable workspace pointer v2 — proof seed (re-runnable: wipes and reseeds).
--
-- Actor matrix mirrors PRODUCTION's real membership shapes (measured
-- 2026-08-17): the owner mirror pair, the CM-only manager with NO
-- engagement_contexts counterpart, org-bound EC employees without CM rows.

delete from public.engagement_contexts;
delete from public.company_memberships;
delete from public.organizations;
delete from public.profiles;

insert into public.profiles (id) values
  ('10000000-0000-4000-8000-000000000001'), -- P_OWNER    owns ORG_A (older) + ORG_B (newer)
  ('10000000-0000-4000-8000-000000000002'), -- P_CM_MGR   CM manager ACTIVE in ORG_A, NO EC (the prod case)
  ('10000000-0000-4000-8000-000000000003'), -- P_CM_MEM   CM member  ACTIVE in ORG_A, NO EC
  ('10000000-0000-4000-8000-000000000004'), -- P_EC_EMP   EC employee ACTIVE in ORG_A, NO CM
  ('10000000-0000-4000-8000-000000000005'), -- P_EC_MGR   EC manager  ACTIVE in ORG_A, NO CM
  ('10000000-0000-4000-8000-000000000006'), -- P_REVOKED  CM revoked + EC ended in ORG_A
  ('10000000-0000-4000-8000-000000000007'); -- P_OTHER    owns only ORG_C — the wrong-org control for ORG_A

insert into public.organizations (id, owner_profile_id, created_at) values
  ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'), -- ORG_A (oldest owned)
  ('b0000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-000000000001', '2026-06-01T00:00:00Z'), -- ORG_B (newer owned)
  ('c0000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-000000000007', '2026-03-01T00:00:00Z'); -- ORG_C (unrelated control; owned by P_OTHER)

insert into public.company_memberships (organization_id, profile_id, role, status) values
  ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000002', 'manager', 'active'),
  ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000003', 'member',  'active'),
  ('a0000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-000000000006', 'manager', 'revoked');

insert into public.engagement_contexts (profile_id, organization_id, status, relationship_slug) values
  ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-00000000000a', 'active', 'employee'),
  ('10000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000a', 'active', 'manager'),
  ('10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000a', 'ended',  'employee');
