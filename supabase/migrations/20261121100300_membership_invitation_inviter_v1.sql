-- @human-gate-approved
-- 20261121100300 — the person invited to an organization's governance (owner,
-- admin, manager, external manager, member) sees WHO invited them and WHEN
-- (owner P0 security directive 2026-11-21: an invitation shows who invited,
-- the purpose and the role). RED: one new SECURITY DEFINER read + grants.
--
-- membership_my_invitations_v2() is v1 plus the inviter's name and the time
-- of the invitation, for the caller's OWN invited rows only (profile_id =
-- auth.uid(), status 'invited'). v1 is kept unchanged; the app reads v2 and
-- falls back to v1 while v2 is not applied.
--
-- No rows change. Rollback: supabase/rollbacks/20261121100300_membership_invitation_inviter_v1.down.sql

begin;

create or replace function public.membership_my_invitations_v2()
returns table (
  membership_id uuid,
  organization_id uuid,
  organization_name text,
  member_role text,
  inviter_name text,
  invited_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select m.id, m.organization_id,
         coalesce(nullif(trim(o.display_name), ''),
                  nullif(trim(o.legal_name), ''), ''),
         m.role,
         nullif(trim(p.full_name), ''),
         m.created_at
    from public.company_memberships m
    join public.organizations o on o.id = m.organization_id
    left join public.profiles p on p.id = m.invited_by
   where m.profile_id = auth.uid()
     and m.status = 'invited'
   order by m.created_at
$$;
revoke all on function public.membership_my_invitations_v2() from public;
revoke all on function public.membership_my_invitations_v2() from anon;
grant execute on function public.membership_my_invitations_v2() to authenticated;

commit;
