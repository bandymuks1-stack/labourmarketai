-- ============================================================================
-- 20260929090000 — a person's own work history keeps naming the organization
-- after the relationship ends.
--
-- RED by rule (new SECURITY DEFINER read). OWNER-APPROVED 2026-09-29
-- ("HISTORICAL ORGANIZATION IDENTITY READ — APPROVED", exact boundary).
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- WHY. Production walk 2026-09-28: after an agency placement's client
-- relationship ended (truthfully — status 'ended', row kept), the worker's
-- profile showed "(organizacija nerodoma)" and the journal lost
-- "Alfa · Bendradarbis": organizations_select admits a person only while
-- belongs_to_organization() — an ACTIVE relationship — holds.
--
-- WHAT. One read, nothing else:
--   my_historical_organization_names_v1(uuid[]) → (organization_id,
--   display_name, legal_name) for organizations the CALLER has their OWN
--   engagement_contexts row with (any status — the canonical record of the
--   person's work relationship). No other organization column, no members,
--   projects, contacts, activity, requirements, candidates, others' entries
--   or hours, no permission. organizations_select is NOT changed; the ended
--   membership is NOT restored; the name is NOT copied anywhere. At most 100
--   ids per call.
--
-- ROLLBACK: supabase/rollbacks/20260929090000_historical_organization_names_v1.down.sql
-- ============================================================================

create or replace function public.my_historical_organization_names_v1(p_org_ids uuid[])
returns table(organization_id uuid, display_name text, legal_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select o.id, o.display_name, o.legal_name
    from public.organizations o
   where o.id = any (p_org_ids[1:100])
     and exists (select 1 from public.engagement_contexts ec
                  where ec.organization_id = o.id
                    and ec.profile_id = auth.uid());
$function$;

revoke all on function public.my_historical_organization_names_v1(uuid[]) from public, anon;
grant execute on function public.my_historical_organization_names_v1(uuid[]) to authenticated;
