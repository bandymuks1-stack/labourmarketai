-- 20261027231000_list_invitations_for_me_source_slug_v1
-- @human-gate-approved (owner, 2026-10-28, in chat: "šią konkrečią migraciją leidžiu vykdyti ir PR sujungti" — #2846 only, after re-checking SQL, grants, RLS, rights, rollback and numbering)
--
-- RED tier: CREATE OR REPLACE of a SECURITY DEFINER function. Owner approval
-- required before it is applied. Signature, return type, grants, filters,
-- ordering and limit are IDENTICAL to production (read 2026-10-27); the ONLY
-- change is one more key in each item: `external_source_slug`.
--
-- WHY: onboarding finds an invited person's pending `join_platform` invitation
-- even when they arrived without the link (#2845). It may skip the role
-- question only for a PARTNER referral of a worker
-- (`invitationImpliesWorkerContext` needs the source), and this read did not
-- say where a referral came from. The slug is a partner identifier
-- (`nonstop`), not personal data; the caller already sees the invitation.
--
-- ROLLBACK: re-apply the previous body (the same function without the
-- `external_source_slug` key) — supabase/rollbacks/20261027231000_list_invitations_for_me_source_slug_v1.down.sql

create or replace function public.list_invitations_for_me_v1()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_items jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_email = '' then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;
  if not public.session_email_verified_v1() then
    return jsonb_build_object('items', '[]'::jsonb, 'email_unverified', true);
  end if;
  select coalesce(jsonb_agg(item order by item ->> 'created_at' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
        'id', i.id,
        'invitation_type', i.invitation_type,
        'personal_message', i.personal_message,
        'proposed_role', i.proposed_role,
        'created_at', i.created_at,
        'expires_at', i.expires_at,
        'relationship_slug', i.relationship_slug,
        'external_source_slug', i.external_source_slug,
        'organization_name', (select coalesce(o.display_name, o.legal_name)
                                from public.organizations o
                               where o.id = i.organization_id),
        'project_title', (select p.title from public.projects p
                           where p.id = i.project_id),
        'inviter_name', (select pr.full_name from public.profiles pr
                          where pr.id = i.inviter_profile_id)
      ) as item
      from public.invitations i
      where lower(i.invited_email) = v_email
        and i.status = 'pending'
        and i.expires_at > now()
      order by i.created_at desc
      limit 50
    ) sub;
  return jsonb_build_object('items', v_items);
end $function$;

-- Grants exactly as production holds them (postgres + authenticated), stated explicitly
-- so a fresh environment never inherits a default anon EXECUTE.
revoke all on function public.list_invitations_for_me_v1() from public, anon;
grant execute on function public.list_invitations_for_me_v1() to authenticated;
