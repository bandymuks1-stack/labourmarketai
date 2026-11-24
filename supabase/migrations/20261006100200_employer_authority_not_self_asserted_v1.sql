-- @human-gate-approved
-- ============================================================================
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. RED by construction (CREATE OR REPLACE
-- of a SECURITY DEFINER authorization predicate used by can_view_worker).
-- Route: draft PR + needs-human-gate, owner-channel apply via Supabase MCP
-- apply_migration. NO OWNER APPROVAL EXISTS YET. Must not be applied to
-- production; CI must not auto-merge it.
--
-- 20261006100200 - EMPLOYER AUTHORITY IS HELD, NOT ASSERTED
--
-- THE DEFECT (audit 2026-10-06, finding F-4; reproduced on the repo's replayed
-- schema). public.is_employer() was
--     coalesce((select active_role from profiles where id = auth.uid())
--              in ('company','agency'), false)
-- and profiles.active_role is a column every user may write about themselves
-- (profiles_update: id = auth.uid(); authenticated holds UPDATE on active_role;
-- the only guard, enforce_admin_grant_guard, blocks 'admin'). So any account
-- could switch itself to 'company' with one PostgREST call and be treated as an
-- employer by can_view_worker's DISCOVERY branch:
--     is_employer() AND worker_profile_discoverable(<profile>)
-- (the consent predicate still applies - a worker who has not granted
-- profile_discoverability stays invisible - but "employer" must not be a thing a
-- user can claim by editing their own row).
--
-- INTENT RECOVERED. ADR 0012 made `active_role` "which workspace the user is
-- looking at" and kept the RLS helpers gating on it as a deliberate
-- simplification ("minimal RLS rewrite"). The repo then recorded the follow-up
-- as an owner-gated item in docs/audits/evidence/premium-rebuild/w4-baseline.md
-- and w4-acceptance.md: "is_employer() org-membership gate (RLS migration)".
-- The application already resolves every employer surface through ONE
-- membership-validated chain (lib/company/employer-company-context.ts: active
-- workspace -> organization -> company), so the database predicate must demand
-- the same thing: the caller must actually manage an organization.
--
-- WHAT CHANGES
--   * is_employer(): active_role in ('company','agency') AND the caller holds an
--     ACTIVE management relationship with some organization - exactly the two
--     sources manages_organization() already trusts (engagement_contexts
--     relationship_slug in manager/owner/external_manager, or company_memberships
--     role in owner/admin/manager/external_manager). No new vocabulary, no new
--     table. The function keeps its signature, SECURITY DEFINER and
--     search_path, and stays NULL-safe (auth.uid() null -> false).
--
-- WHAT DOES NOT CHANGE
--   * Worker discovery still ALSO requires the worker's consent
--     (worker_profile_discoverable) - unchanged.
--   * Every other can_view_worker branch (own, admin, roster, engagement,
--     assigned project) - unchanged.
--   * Switching workspaces, adding roles, onboarding - unchanged (active_role is
--     still the workspace pointer; it simply no longer ALONE confers employer
--     authority).
--
-- HONEST LIMITS
--   * Creating an organization remains a self-service registration act by
--     product design, so "employer" now means "holds an organization", not
--     "has been verified". Whether discovery should additionally require a
--     VERIFIED company (companies.verification_status, admin_set_company_
--     verification) is a product/owner decision, deliberately not made here.
--   * A legacy employer whose management relationship exists ONLY in a legacy
--     roster table and not in engagement_contexts/company_memberships would lose
--     the DISCOVERY branch (their roster branches are unaffected). Read-only
--     check for the owner before applying:
--       select p.id from public.profiles p
--        where p.active_role in ('company','agency')
--          and not exists (select 1 from public.engagement_contexts ec
--                           where ec.profile_id = p.id and ec.status = 'active'
--                             and ec.relationship_slug in ('manager','owner','external_manager'))
--          and not exists (select 1 from public.company_memberships m
--                           where m.profile_id = p.id and m.status = 'active'
--                             and m.role in ('owner','admin','manager','external_manager'));
--
-- ROLLBACK: supabase/rollbacks/20261006100200_employer_authority_not_self_asserted_v1.down.sql
-- ============================================================================

begin;

create or replace function public.is_employer()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      (select p.active_role from public.profiles p where p.id = auth.uid())
        in ('company', 'agency')
      and (
        exists (
          select 1 from public.engagement_contexts ec
           where ec.profile_id = auth.uid()
             and ec.status = 'active'
             and ec.relationship_slug in ('manager', 'owner', 'external_manager')
        )
        or exists (
          select 1 from public.company_memberships m
           where m.profile_id = auth.uid()
             and m.status = 'active'
             and m.role in ('owner', 'admin', 'manager', 'external_manager')
        )
      )
    ),
    false
  )
$$;

-- Grants unchanged (anon none; authenticated + service_role execute). Stated
-- explicitly because the secdef reproducibility guard requires every redefined
-- SECURITY DEFINER function to name anon, and CREATE OR REPLACE would otherwise
-- rely on the previous ACL surviving.
revoke all on function public.is_employer() from public, anon;
grant execute on function public.is_employer() to authenticated, service_role;

commit;
