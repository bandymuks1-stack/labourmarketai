-- @human-gate-approved
-- ============================================================================
-- D1 (owner decision 2026-09-30): a worker's OWN profile photo for the people
-- who have a REAL work relationship with that worker — and for nobody else.
--
-- WHO CAN READ A WORKER'S PHOTO
--   BEFORE  the worker only (storage policy "profile-avatars owner select";
--           profiles.avatar_url is readable by its owner; service_role holds
--           SELECT on profiles(id, active_role) only).
--   AFTER   the worker, and an authenticated caller who has an ACTIVE work
--           relationship with that worker, through exactly the relationship
--           branches `can_view_worker()` already defines:
--             · the caller's company has the worker ACTIVE in company_workers
--             · the caller's agency has the worker ACTIVE in agency_workers
--             · the worker has an ACTIVE engagement in an organization the
--               caller manages (manages_organization)
--             · the worker has an ACTIVE project assignment on a project the
--               caller can manage (can_manage_project)
--   DELIBERATELY NOT: the discovery branch of can_view_worker() (any employer
--           account + the worker's discoverability consent). The owner's D1
--           is a real relationship, "not a manager role alone" — so a
--           discoverable profile shows its initials, not its face, to someone
--           the worker has never worked with.
--
-- WHAT THIS ADDS: ONE read-only function that returns the avatar PATH (never
-- the image, never any other column) when the rule above holds and the path
-- lies inside the worker's own `<profile_id>/` folder; NULL otherwise. The
-- server then signs that one path for one hour. No table grant, no storage
-- policy, no RLS policy changes; nothing becomes public; anon cannot call it.
--
-- Rollback: supabase/rollbacks/20260930133500_worker_avatar_path_for_relations_v1.down.sql
-- ============================================================================

create or replace function public.worker_avatar_path_v1(p_worker_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.avatar_url
  from public.workers w
  join public.profiles p on p.id = w.profile_id
  where w.id = p_worker_id
    and p.avatar_url is not null
    and p.avatar_url like p.id::text || '/%'
    and (
      -- the worker themselves
      w.profile_id = auth.uid()
      -- a REAL, ACTIVE work relationship (the relationship branches of
      -- can_view_worker(); its discovery-consent branch is intentionally
      -- absent)
      or exists (
        select 1
        from public.company_workers cw
        join public.companies c on c.id = cw.company_id
        where cw.worker_id = w.id and cw.status = 'active' and c.profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.agency_workers aw
        join public.agencies a on a.id = aw.agency_id
        where aw.worker_id = w.id and aw.status = 'active' and a.profile_id = auth.uid()
      )
      or exists (
        select 1
        from public.engagement_contexts ec
        where ec.profile_id = w.profile_id
          and ec.status = 'active'
          and public.manages_organization(ec.organization_id)
      )
      or exists (
        select 1
        from public.project_worker_assignments pwa
        where pwa.worker_id = w.id
          and pwa.status = 'active'
          and pwa.ended_at is null
          and public.can_manage_project(pwa.project_id)
      )
    )
$$;

comment on function public.worker_avatar_path_v1(uuid) is
  'D1 (owner 2026-09-30): the storage PATH of a worker''s own profile photo, for the worker or a caller with an ACTIVE work relationship (company roster, agency roster, active engagement in a managed organization, active project assignment on a manageable project). Not for discovery-only viewers. Path must lie in the worker''s own folder. NULL otherwise. Read-only; returns no other column.';

revoke all on function public.worker_avatar_path_v1(uuid) from public;
revoke all on function public.worker_avatar_path_v1(uuid) from anon;
grant execute on function public.worker_avatar_path_v1(uuid) to authenticated;
