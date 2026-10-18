-- @human-gate-approved
--
-- FORWARD CORRECTION to 20260917120000 (applied to production 2026-09-17 as
-- ledger 20260917080303). PREPARED, NOT APPLIED — owner gate.
--
-- THE DEFECT, found by the post-apply production proof: `get_invitation_
-- preview_v2` reads `role_text` from `customer_requests`, and that column
-- does not exist — `role_text` is the WORKER BOARD RPC's projection name;
-- the table's column is `role_or_work_type`. PL/pgSQL resolves the column
-- lazily, so the function was created without error and would fail at
-- runtime (42703) for every `invite_to_demand` invitation, turning the
-- person's landing into the generic load error. Every other branch of the
-- function is unaffected and was exercised.
--
-- THE CORRECTION is ONE identifier. The applied migration file is not
-- edited (it is history); this file re-creates the function with the same
-- body and the right column. Same SECURITY DEFINER, same search_path, same
-- grants (restated, because they are the floor).
--
-- Rollback: supabase/rollbacks/20260917130000_invitation_preview_demand_column_fix_v1.down.sql
-- (drops the function; the app then serves the invitation page through
-- get_invitation_preview_v1, which it already falls back to).

begin;

create or replace function public.get_invitation_preview_v2(
  p_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_row public.invitations%rowtype;
  v_org_name text;
  v_project_title text;
  v_inviter_name text;
  v_status text;
  v_demand_role text;
  v_demand_country text;
  v_demand_org uuid;
  v_my_decision text;
  v_my_review jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.invitations
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  v_status := case
    when v_row.status = 'pending' and v_row.expires_at <= now() then 'expired'
    else v_row.status
  end;

  select coalesce(display_name, legal_name) into v_org_name
    from public.organizations where id = v_row.organization_id;
  select title into v_project_title
    from public.projects where id = v_row.project_id;
  select coalesce(full_name, 'LabourMarket.ai') into v_inviter_name
    from public.profiles where id = v_row.inviter_profile_id;
  if v_row.target_request_id is not null then
    -- CORRECTED: the table's column is role_or_work_type (role_text is the
    -- worker-board RPC's projection name and does not exist here).
    select role_or_work_type, country, organization_id
      into v_demand_role, v_demand_country, v_demand_org
      from public.customer_requests where id = v_row.target_request_id;
    if v_org_name is null and v_demand_org is not null then
      select coalesce(display_name, legal_name) into v_org_name
        from public.organizations where id = v_demand_org;
    end if;
  end if;
  select decision, context_review into v_my_decision, v_my_review
    from public.invitation_acceptances
   where invitation_id = v_row.id and profile_id = uid;

  return jsonb_build_object(
    'outcome', 'ok',
    'invitation_id', v_row.id,
    'invitation_type', v_row.invitation_type,
    'status', v_status,
    'invited_email', v_row.invited_email,
    'invited_name', v_row.invited_name,
    'proposed_role', v_row.proposed_role,
    'personal_message', v_row.personal_message,
    'expires_at', v_row.expires_at,
    'organization_name', v_org_name,
    'project_title', v_project_title,
    'inviter_name', case when v_row.inviter_profile_id is null then null else v_inviter_name end,
    'relationship_slug', v_row.relationship_slug,
    'max_uses', v_row.max_uses,
    'use_count', v_row.use_count,
    'campaign_label', v_row.campaign_label,
    'demand_role_text', v_demand_role,
    'demand_country', v_demand_country,
    'external_source_slug', v_row.external_source_slug,
    'my_decision', v_my_decision,
    'has_declared_context', v_row.declared_context is not null,
    'declared_context', case when v_my_decision = 'accepted' then v_row.declared_context else null end,
    'context_review', case when v_my_decision = 'accepted' then coalesce(v_my_review, '{}'::jsonb) else null end
  );
end $$;

revoke all on function public.get_invitation_preview_v2(text) from public, anon;
grant execute on function public.get_invitation_preview_v2(text) to authenticated;

commit;

-- ROLLBACK: supabase/rollbacks/20260917130000_invitation_preview_demand_column_fix_v1.down.sql
--   drop function if exists public.get_invitation_preview_v2(text);
