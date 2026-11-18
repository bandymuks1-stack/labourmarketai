-- @human-gate-approved
--
-- SAFETY CLASS: RED (new SECURITY DEFINER function + GRANT; replaces
-- create_team_v1). Draft PR + needs-human-gate; apply ONLY via Supabase MCP
-- apply_migration after the owner approves this exact file.
--
-- 20261014190000 — TEAM / BRIGADE DISBAND v1
--
-- WHY: owner directive 2026-10-14 §3.3 requires "brigadų išformavimas
-- išsaugant istoriją" (disband a brigade, keep its history). Nothing could do
-- it: no RPC, no action, no control. And create_team_v1 counts EVERY team the
-- owner ever made against its cap of 20, so an owner who outgrew 20 brigades
-- could never form another one (production: the QA owner hit exactly that,
-- and the brigade-formation walk has failed since).
--
-- REUSE, NOT A PARALLEL STRUCTURE:
--   * a disbanded brigade is an ARCHIVED organization — the canonical
--     `organizations.archived_at` / `archived_reason` columns that already
--     exist (lib/company/archived-organizations.ts). No new table, no flag.
--   * each member's membership ends through the canonical lifecycle writer
--     `end_engagement_lifecycle_v1` (→ end_org_membership_v1), so the ended
--     engagement, its reason and its lifecycle events are exactly what
--     ending one membership by hand writes. Rows are ENDED, never deleted.
--   * one audit_logs row, the same shape create_team_v1 writes.
--
-- WHAT IS KEPT (history): the organization row, every MEMBER engagement row
-- (status ended, ended_at, ended_reason 'other', note 'team_disbanded'), the
-- owner's own engagement (unchanged — see the loop), every
-- assignment, offer, enquiry, term, message and journal entry that names the
-- brigade. Nothing is deleted or rewritten.
--
-- REFUSED while the brigade still has open work (the owner closes it first,
-- with the controls that already exist): an ACTIVE team_assignment, an offer
-- that is 'offered' or 'accepted' (not yet handed off), or an enquiry still
-- 'created' (awaiting an answer). Returns 'has_open_work'.
--
-- OUTCOMES (text): 'disbanded' | 'already_disbanded' | 'not_found'
--   (not a team this caller owns — deliberately not distinguished) |
--   'has_open_work' | 'member_end_failed' (a member's membership could not be
--   ended; NOTHING is changed — the whole call is one subtransaction).
--
-- create_team_v1: identical body, except the cap of 20 counts only
-- brigades that are NOT archived.
--
-- UNDO: supabase/rollbacks/20261014190000_team_disband_v1.down.sql

create or replace function public.disband_team_v1(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid       uuid := auth.uid();
  v_team    public.organizations%rowtype;
  v_ec      record;
  v_out     text;
  v_members int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_team
    from public.organizations o
   where o.id = p_team_id
     and o.owner_profile_id = uid
     and o.organization_type = 'team';
  if not found then
    return 'not_found';
  end if;
  if v_team.archived_at is not null then
    return 'already_disbanded';
  end if;

  if exists (select 1 from public.team_assignments a
              where a.team_org_id = p_team_id and a.status = 'active')
     or exists (select 1 from public.team_demand_offers d
                 where d.team_org_id = p_team_id and d.status in ('offered', 'accepted'))
     or exists (select 1 from public.team_enquiries e
                 where e.team_org_id = p_team_id and e.status = 'created') then
    return 'has_open_work';
  end if;

  begin
    for v_ec in
      select ec.id
        from public.engagement_contexts ec
       where ec.organization_id = p_team_id
         and ec.status = 'active'
         -- The owner's own 'owner' engagement stays: end_org_membership_v1
         -- refuses the last owner by design, and an archived organization is
         -- already left out of every workspace read with its memberships kept
         -- as history (lib/company/archived-organizations.ts) — the same
         -- treatment the 2026-09-23 org consolidation gave archived orgs.
         and ec.profile_id is distinct from v_team.owner_profile_id
       order by ec.created_at
    loop
      v_out := public.end_engagement_lifecycle_v1(v_ec.id::text, 'other', 'team_disbanded');
      if v_out not in ('ended', 'already_ended') then
        raise exception 'member_end_failed:%', v_out using errcode = 'P0001';
      end if;
      v_members := v_members + 1;
    end loop;

    update public.organizations
       set archived_at = now(),
           archived_reason = 'team_disbanded'
     where id = p_team_id
       and archived_at is null;

    insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'disband_team_v1', 'organizations', p_team_id,
      jsonb_build_object(
        'organization_type', 'team',
        'members_ended', v_members,
        'result', 'disbanded'));
  exception when sqlstate 'P0001' then
    -- Subtransaction rolled back: every membership ended above is restored.
    return 'member_end_failed';
  end;

  return 'disbanded';
end $function$;

revoke all on function public.disband_team_v1(uuid) from public;
revoke all on function public.disband_team_v1(uuid) from anon;
grant execute on function public.disband_team_v1(uuid) to authenticated;

-- create_team_v1 — unchanged except: the cap counts ACTIVE brigades only.
create or replace function public.create_team_v1(p_team_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid          uuid := auth.uid();
  cleaned_name text := nullif(trim(coalesce(p_team_name, '')), '');
  v_new        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o
     where o.owner_profile_id = uid
       and o.organization_type <> 'team'
  ) and not public.is_admin() then
    return 'not_allowed';
  end if;

  if cleaned_name is null
     or char_length(cleaned_name) < 2
     or char_length(cleaned_name) > 80 then
    return 'invalid_team_name';
  end if;

  if (select count(*) from public.organizations o
       where o.owner_profile_id = uid
         and o.organization_type = 'team'
         and o.archived_at is null) >= 20 then
    return 'team_limit_reached';
  end if;

  insert into public.organizations
    (owner_profile_id, organization_type, display_name)
  values
    (uid, 'team', cleaned_name)
  returning id into v_new;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'create_team_v1', 'organizations', v_new,
    jsonb_build_object(
      'organization_type', 'team',
      'display_name', cleaned_name,
      'result', 'created'));

  return 'created';
end $function$;

-- A SECURITY DEFINER function never inherits a default EXECUTE grant
-- (lib/guards/secdef-local-reset-reproducibility.test.ts): the replaced
-- create_team_v1 states its grants explicitly — authenticated only.
revoke all on function public.create_team_v1(text) from public;
revoke all on function public.create_team_v1(text) from anon;
grant execute on function public.create_team_v1(text) to authenticated;
