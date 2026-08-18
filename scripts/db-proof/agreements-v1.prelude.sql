-- ============================================================================
-- AGREEMENT & RIGHTS ENGINE v1 — PROOF HARNESS PRELUDE (supplement).
--
-- Runs AFTER scripts/db-proof/document-file-layer.prelude.sql (which builds
-- profiles / workers / organizations / projects / company_memberships /
-- document_types / worker_documents / storage stubs and the auth.uid() /
-- is_admin() session-GUC stubs). This file adds ONLY what the REAL
-- workflow-engine migration additionally asserts, copied verbatim from the
-- real repo objects, so that
--   supabase/migrations/20260817130000_workflow_engine_v1.sql
--   supabase/migrations/20260817140000_document_file_layer_v1.sql
--   supabase/migrations/20260817200000_agreements_v1.sql
-- can all be executed VERBATIM against a throwaway Postgres 15.
--
--   * engagement_contexts shape -> the employment-context spine
--   * membership_actor_role_v1 + belongs_to_organization
--       -> 20260806120000_company_membership_commands_v1.sql (verbatim)
--
-- Throwaway only. Never point this at production or a shared local stack.
-- ============================================================================

create table if not exists public.engagement_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  status text not null default 'active',
  relationship_slug text not null default 'worker'
);
grant select on public.engagement_contexts to authenticated;

-- ── Real helpers, copied verbatim from 20260806120000 ───────────────────────
create or replace function public.membership_actor_role_v1(
  p_actor uuid, p_organization_id uuid
) returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.company_memberships
   where organization_id = p_organization_id
     and profile_id = p_actor
     and status = 'active'
   limit 1
$$;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from public;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from anon;
revoke all on function public.membership_actor_role_v1(uuid, uuid) from authenticated;

create or replace function public.belongs_to_organization(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.engagement_contexts ec
     where ec.profile_id = auth.uid()
       and ec.organization_id = org
       and ec.status = 'active'
  )
  or exists (
    select 1 from public.company_memberships m
     where m.profile_id = auth.uid()
       and m.organization_id = org
       and m.status = 'active'
  )
$$;
revoke all on function public.belongs_to_organization(uuid) from public;
revoke all on function public.belongs_to_organization(uuid) from anon;
grant execute on function public.belongs_to_organization(uuid) to authenticated;
