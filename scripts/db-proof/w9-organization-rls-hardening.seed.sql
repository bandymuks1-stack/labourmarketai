-- ============================================================================
-- W9 Slice 2 proof harness — SEED.
--
-- Six actors and three organizations, chosen so that every arm of the new
-- `organizations_select` policy (owner / active member / admin) and every arm
-- it deliberately does NOT have (published, ended member, stranger, anon) is
-- separately observable.
--
-- Runs as superuser (RLS bypassed) — this is fixture setup, not a probe.
-- Idempotent: the runner re-seeds between phases.
-- ============================================================================

truncate table public.audit_logs, public.engagement_contexts restart identity cascade;
delete from public.organizations;
delete from public.companies;
delete from public.profiles;

-- ── Profiles ────────────────────────────────────────────────────────────────
insert into public.profiles(id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),  -- A_OWNER   owns ORG_A
  ('bbbbbbbb-0000-4000-8000-000000000002'),  -- B_OWNER   owns ORG_B and ORG_P
  ('cccccccc-0000-4000-8000-000000000003'),  -- EMPLOYEE  active employee of ORG_A
  ('dddddddd-0000-4000-8000-000000000004'),  -- MANAGER   active manager of ORG_A
  ('eeeeeeee-0000-4000-8000-000000000005'),  -- EX_MEMBER ended member of ORG_A
  ('ffffffff-0000-4000-8000-000000000006');  -- STRANGER  no relation to anything

-- ── Organizations ───────────────────────────────────────────────────────────
-- Every private field is populated ON PURPOSE: the leak probes assert that a
-- stranger cannot read these values, which is only meaningful if they exist.
insert into public.organizations
  (id, owner_profile_id, organization_type, legal_name, display_name, country,
   vat_number, public_contact_email, public_contact_phone, public_profile_enabled)
values
  ('01010101-0000-4000-8000-00000000000a',
   'aaaaaaaa-0000-4000-8000-000000000001', 'company',
   'Org A Legal BV', 'Org A', 'NL',
   'NL000000001B01', 'a-private@example.invalid', '+31000000001', false),
  ('02020202-0000-4000-8000-00000000000b',
   'bbbbbbbb-0000-4000-8000-000000000002', 'company',
   'Org B Legal BV', 'Org B', 'NL',
   'NL000000002B01', 'b-private@example.invalid', '+31000000002', false),
  -- ORG_P is PUBLISHED. It must still not be readable ROW-WISE by a stranger:
  -- publication is served by the allowlisted SECURITY DEFINER readers from
  -- 20260719120000, never by a row policy arm.
  ('03030303-0000-4000-8000-00000000000c',
   'bbbbbbbb-0000-4000-8000-000000000002', 'company',
   'Org P Legal BV', 'Org P Published', 'NL',
   'NL000000003B01', 'p-private@example.invalid', '+31000000003', true);

-- ── Engagements ─────────────────────────────────────────────────────────────
insert into public.engagement_contexts
  (id, profile_id, organization_id, relationship_slug, status, hash_self)
values
  -- owner engagement for A (mirrors ensure_org_owner_engagement)
  ('11110000-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', '01010101-0000-4000-8000-00000000000a',
   'owner', 'active', 'h-owner-a'),
  -- ACTIVE employee of ORG_A — membership without authority
  ('22220000-0000-4000-8000-000000000002',
   'cccccccc-0000-4000-8000-000000000003', '01010101-0000-4000-8000-00000000000a',
   'employee', 'active', 'h-emp-a'),
  -- ACTIVE manager of ORG_A — membership WITH authority
  ('33330000-0000-4000-8000-000000000003',
   'dddddddd-0000-4000-8000-000000000004', '01010101-0000-4000-8000-00000000000a',
   'manager', 'active', 'h-mgr-a'),
  -- ENDED member of ORG_A — W9 slice 1 terminal state
  ('44440000-0000-4000-8000-000000000004',
   'eeeeeeee-0000-4000-8000-000000000005', '01010101-0000-4000-8000-00000000000a',
   'employee', 'ended', 'h-ex-a'),
  -- owner engagement for B
  ('55550000-0000-4000-8000-000000000005',
   'bbbbbbbb-0000-4000-8000-000000000002', '02020202-0000-4000-8000-00000000000b',
   'owner', 'active', 'h-owner-b');
