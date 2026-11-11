-- Rollback of 20261110190000_organization_claim_invitation_v1.
-- Refuses while any claim invitation or invitation-bound claim exists: dropping the columns or
-- narrowing the CHECKs would then lose or reject real rows. Restores the earlier grants as they were.
-- One transaction: a refusal leaves everything as it was.

begin;

do $$
begin
  if exists (select 1 from public.invitations where invitation_type = 'claim_organization')
     or exists (select 1 from public.organization_claims
                 where invitation_id is not null or representative_role is not null
                    or authority_confirmed_at is not null) then
    raise exception 'rollback refused: claim invitations or statements exist; resolve them first';
  end if;
end $$;

grant execute on function public.request_organization_claim_v1(uuid, text, text) to authenticated;
grant execute on function public.decide_organization_claim_v1(uuid, text, text, text) to authenticated;

drop function if exists public.decide_organization_claim_v2(uuid, text, text, text);
drop function if exists public.link_verified_organization_claim_v1(uuid, uuid);
drop function if exists public.submit_organization_verification_request_v1(uuid, text, text, boolean);
drop function if exists public.accept_claim_invitation_v1(text, text, boolean);
drop function if exists public.get_claim_invitation_preview_v1(text);
drop function if exists public.create_claim_invitation_v1(uuid, text, text, text);

drop function if exists public.claimant_is_operator_v1(uuid);
drop index if exists public.organization_claims_invitation_uq;
alter table public.organization_claims drop constraint if exists organization_claims_representative_role_chk;
alter table public.organization_claims
  drop column if exists authority_confirmed_at,
  drop column if exists representative_role,
  drop column if exists invitation_id;

drop trigger if exists claim_invitation_accept_guard on public.invitations;
drop function if exists public.claim_invitation_accept_guard_v1();

alter table public.invitations drop constraint if exists invitations_context_chk;
alter table public.invitations add constraint invitations_context_chk check (
     (invitation_type in ('join_organization','join_team','join_as_employee','collaborate_partner')
        and organization_id is not null)
  or (invitation_type = 'join_project' and project_id is not null)
  or (invitation_type = 'invite_to_demand' and target_request_id is not null)
  or (invitation_type in ('join_platform','invite_company')));

alter table public.invitations drop constraint if exists invitations_invitation_type_check;
alter table public.invitations add constraint invitations_invitation_type_check check (invitation_type in (
  'join_platform','join_organization','join_team','join_as_employee','collaborate_partner',
  'join_project','invite_company','invite_to_demand'));

commit;
