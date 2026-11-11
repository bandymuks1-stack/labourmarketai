-- Rollback of 20261110190000_organization_claim_invitation_v1.
--
-- OWNER RULE (2026-11-11): a rollback never reopens request_organization_claim_v1 or
-- decide_organization_claim_v1. Both stay closed to every client role whatever happens here.
--
-- Two outcomes, one transaction:
--   * no claim invitation or invitation-bound claim exists: everything this migration added is removed
--     and mirror_company_to_org is restored byte for byte;
--   * such rows exist: PAUSE. Every new client door is closed (company takeover temporarily
--     unavailable), the rows and columns stay, nothing is narrowed and no data is lost. A later forward
--     fix reopens the doors.

begin;

revoke execute on function public.request_organization_claim_v1(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.decide_organization_claim_v1(uuid, text, text, text) from public, anon, authenticated;

do $$
declare
  v_rows boolean := exists (select 1 from public.invitations where invitation_type = 'claim_organization')
                 or exists (select 1 from public.organization_claims
                             where invitation_id is not null or representative_role is not null
                                or authority_confirmed_at is not null);
begin
  if v_rows then
    revoke execute on function public.create_claim_invitation_v1(uuid, text, text, text) from public, anon, authenticated;
    revoke execute on function public.get_claim_invitation_preview_v1(text) from public, anon, authenticated;
    revoke execute on function public.accept_claim_invitation_v1(text, text, boolean) from public, anon, authenticated;
    revoke execute on function public.submit_organization_verification_request_v1(uuid, text, text, boolean) from public, anon, authenticated;
    revoke execute on function public.decide_organization_claim_v2(uuid, text, text, text) from public, anon, authenticated;
    raise notice 'company takeover paused: claim rows exist, every claim door is closed, no data changed';
    return;
  end if;

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
end $$;

-- mirror_company_to_org as production held it before this migration (read 2026-11-11). Restoring it
-- is safe in both outcomes: without the flag the guard never fires.
create or replace function public.mirror_company_to_org()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (tg_op = 'INSERT') then
    insert into public.organizations
      (owner_profile_id, organization_type, legal_name, display_name, country,
       vat_number, website, description, trust_score, legacy_company_id)
    values
      (new.profile_id, 'company', new.legal_name, new.display_name, new.country,
       new.vat_number, new.website, new.description, new.trust_score, new.id);
  elsif (tg_op = 'UPDATE') then
    update public.organizations set
      owner_profile_id = case when new.profile_id is distinct from old.profile_id
                              then new.profile_id else owner_profile_id end,
      legal_name = new.legal_name,
      display_name = new.display_name, country = new.country,
      vat_number = new.vat_number, website = new.website,
      description = new.description, trust_score = new.trust_score,
      updated_at = now()
    where legacy_company_id = new.id;
  end if;
  return new;
end $function$;

-- A trigger function: no client role calls it (production ACL is postgres only).
revoke execute on function public.mirror_company_to_org() from public, anon, authenticated;

commit;
