-- @human-gate-approved — owner approved PR #2613 (2026-10-21): a brigade whose only accepted offer is on a CLOSED need can be disbanded; every other refusal unchanged.
-- Conditions (owner, conditional approval): disbanding deletes no work history, hours, projects or Living CV data, leaves other organizations untouched and leaves no active rights; proven in a rolled-back production test on a brigade with real history. Scope: this SQL only.
-- ============================================================================
-- 20261021120000_team_disband_closed_need_offers_v1
--
-- SAFETY CLASS: RED (one SECURITY DEFINER body replaced). Draft PR +
-- needs-human-gate; the @human-gate-approved marker is added ONLY after the
-- owner approves this exact file. ZERO rows change at apply time.
--
-- DEFECT (found by the production brigade walk 2026-10-21). disband_team_v1
-- refuses with has_open_work while ANY team offer is 'offered' or 'accepted'.
-- An offer stays 'accepted' after the buyer CLOSES the need without handing
-- the brigade into a project, and nothing ever moves it on, so such a brigade
-- can never be disbanded: its leader is told "still has open work" and has
-- no way to end it.
--
-- CHANGE (the 20261021094000 body verbatim plus the marked condition): an
-- offer counts as open work only while its need (customer_requests) is not
-- 'closed'. Every other refusal is unchanged: an ACTIVE team assignment, an
-- offer on a need in any other state, a created team enquiry. Disbanding still
-- archives the brigade, ends member engagements and revokes pending
-- invitations exactly as before, and now also WITHDRAWS the brigade's
-- remaining open offers (all on closed needs; status 'withdrawn', rows kept),
-- so hand_off_team_demand_offer_v1 (it requires 'accepted') can never assign a
-- disbanded brigade later. The open offers are locked FOR UPDATE before the
-- check, which serialises disbanding with a concurrent hand-off (review of
-- #2613). The audit row counts the withdrawn offers.
--
-- PRIVILEGES: unchanged and re-stated — authenticated-only EXECUTE, revoked
-- from public and anon. The body reads customer_requests.status through the
-- offer's own request_id only and returns no need data to the caller.
-- ISOLATION: unchanged — only the brigade's owner (owner_profile_id = uid,
-- organization_type 'team') reaches the body.
--
-- Rollback: supabase/rollbacks/20261021120000_team_disband_closed_need_offers_v1.down.sql
-- ============================================================================

do $disband$
begin
  if to_regprocedure('public.disband_team_v1(uuid)') is not null then
    execute $ddl$
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
  v_invites int := 0;
  v_member_invites int := 0;
  v_offers  int := 0;
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

  -- CHANGED (20261021120000): serialise with hand_off_team_demand_offer_v1,
  -- which locks the offer row. The brigade's open offers are locked first, so
  -- a concurrent hand-off either finished before this check (its active
  -- assignment refuses below) or finds the offer withdrawn afterwards
  -- (offer_not_accepted).
  perform 1 from public.team_demand_offers d
    where d.team_org_id = p_team_id and d.status in ('offered', 'accepted')
    order by d.id
    for update;

  if exists (select 1 from public.team_assignments a
              where a.team_org_id = p_team_id and a.status = 'active')
     or exists (select 1 from public.team_demand_offers d
                  join public.customer_requests cr on cr.id = d.request_id
                 where d.team_org_id = p_team_id and d.status in ('offered', 'accepted')
                   -- CHANGED (20261021120000): an offer on a need its buyer has
                   -- CLOSED is no longer open work.
                   and cr.status <> 'closed')
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

    -- CHANGED (20261021120000): every open offer left here is on a need its
    -- buyer CLOSED (checked above). It is withdrawn with the brigade, so no
    -- later hand-off can assign a disbanded brigade. Rows are kept.
    update public.team_demand_offers
       set status = 'withdrawn'
     where team_org_id = p_team_id
       and status in ('offered', 'accepted');
    get diagnostics v_offers = row_count;

    -- An invitation into a disbanded brigade is dead: every pending link
    -- (any invitation type addressed to this organization) and every pending
    -- governance invitation is revoked. Rows are kept as history.
    update public.invitations
       set status = 'revoked', revoked_at = now()
     where organization_id = p_team_id
       and status = 'pending';
    get diagnostics v_invites = row_count;

    update public.company_memberships
       set status = 'revoked', revoked_at = now()
     where organization_id = p_team_id
       and status = 'invited';
    get diagnostics v_member_invites = row_count;

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
        'invitations_revoked', v_invites,
        'membership_invitations_revoked', v_member_invites,
        'closed_need_offers_withdrawn', v_offers,
        'result', 'disbanded'));
  exception when sqlstate 'P0001' then
    -- Subtransaction rolled back: every membership ended above is restored.
    return 'member_end_failed';
  end;

  return 'disbanded';
end $function$;
    $ddl$;
    execute 'revoke all on function public.disband_team_v1(uuid) from public';
    execute 'revoke all on function public.disband_team_v1(uuid) from anon';
    execute 'grant execute on function public.disband_team_v1(uuid) to authenticated';
  end if;
end $disband$;
