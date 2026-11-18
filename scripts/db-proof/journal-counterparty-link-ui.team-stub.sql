-- The team-assignment lane (feat/cc/team-assignment-canonical-v1, 20261003150600),
-- reduced to what the link predicate reads. team_member_at_v1 is the lane's body.
create table public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  team_org_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  work_object_id uuid, task_id uuid,
  status text not null default 'active' check (status in ('active','ended')),
  assigned_at timestamptz not null default now(), ended_at timestamptz,
  constraint team_assignments_lifecycle check ((status = 'active') = (ended_at is null)));
create or replace function public.team_member_at_v1(p_team uuid, p_profile uuid, p_at timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from public.engagement_contexts ec
     where ec.organization_id = p_team and ec.profile_id = p_profile
       and ec.relationship_slug = 'employee' and ec.created_at <= p_at
       and (ec.started_at is null or ec.started_at <= (p_at at time zone 'UTC')::date)
       and ((ec.status = 'active' and (ec.ended_at is null or ec.ended_at > (p_at at time zone 'UTC')::date))
         or (ec.status = 'ended' and ec.ended_at is not null and ec.ended_at > (p_at at time zone 'UTC')::date))
  ), false);
$$;
revoke all on function public.team_member_at_v1(uuid, uuid, timestamptz) from public, anon, authenticated;
