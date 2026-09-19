-- @human-gate-approved
-- ============================================================================
-- 20260919120000_add_org_member_requires_consented_roster_v1
-- RED — owner gate (R-16 of the 2026-09-19 completion window, HIGH).
-- NOT APPLIED. Same class as R-1, one table over.
--
-- Finding (proven live 2026-09-19, rolled back): as the real owner of a real
-- company, `add_org_member(<own org>, <isolated E2E worker with NO roster row,
-- NO invitation>)` returned `added` and an ACTIVE `employee`
-- `engagement_contexts` row for that person existed — no invitation, no
-- acceptance, no consent. `forged_employee_context_rows = 1`.
--
-- Why that matters: `relationship_types.employee.grants_worker_visibility =
-- true`, so the forged context satisfies the membership branch of
-- `can_view_worker` — the person's private worker row becomes readable by
-- the organization's managers WITHOUT discoverability consent. The context
-- also appears in the person's own context picker as a claim ("employee of
-- X") they never made, feeds roster-link candidacy, and is the row the
-- journal-review toggle acts on. The 2026-09-18 subject-consent trigger
-- protects `organization_people` only; R-1 (20260919100000) protects the
-- roster tables only. `add_org_member` is a SECURITY DEFINER RPC granted to
-- `authenticated`, so neither reaches it.
--
-- The UI never offers this: the members panel's "addable" list is derived
-- from the ACTIVE ROSTER (`company_workers` / `agency_workers`), which since
-- R-1 can only be written by the worker's own acceptance. The RPC, called
-- directly through PostgREST, does not apply that rule. This migration makes
-- the RPC apply it.
--
-- MINIMUM CHANGE: `add_org_member` refuses (`not_linked`) unless the worker
-- already stands in a consent-backed relationship with THIS organization —
-- an ACTIVE roster row on the organization's legacy company or agency. No
-- new table, no policy change, no grant change, no row change. Every
-- legitimate caller (the members panel) passes exactly the workers it
-- already lists.
--
-- What must FAIL after apply (the hostile contract, pinned by
-- apps/web/lib/guards/red-add-org-member-consent.test.ts):
--   • owner / manager calls add_org_member for a worker with no active
--     roster row on this organization → 'not_linked', zero rows
--   • therefore no forged context can unlock can_view_worker, the context
--     picker or the review toggle
-- What must keep PASSING:
--   invitation → the WORKER accepts (roster row exists) → owner calls
--   add_org_member → 'added' → set_engagement_journal_review by the owner.
--
-- Reversible: the DOWN file restores the 20260824130000 body verbatim.
-- ============================================================================

begin;

create or replace function public.add_org_member(p_org_id uuid, p_worker_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); v_profile uuid; v_owner uuid; v_existing uuid; v_new uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select owner_profile_id into v_owner from public.organizations where id = p_org_id;
  if not found then return 'org_not_found'; end if;
  if not (public.is_admin() or (v_owner is not null and v_owner = uid) or public.manages_organization(p_org_id)) then return 'not_authorized'; end if;
  select profile_id into v_profile from public.workers where id = p_worker_id;
  if v_profile is null then return 'worker_not_found'; end if;

  -- R-16: a membership may only be minted for a person who ALREADY stands in
  -- a consent-backed relationship with this organization — an active roster
  -- row on its legacy company or agency. Since 20260919100000 those rows can
  -- only come into being through the worker's own acceptance, so this is the
  -- worker's consent, carried forward. Nobody (admin included) may mint the
  -- relationship for them.
  if not exists (
    select 1
      from public.organizations o
      left join public.company_workers cw
        on cw.company_id = o.legacy_company_id
       and cw.worker_id = p_worker_id
       and cw.status = 'active'
      left join public.agency_workers aw
        on aw.agency_id = o.legacy_agency_id
       and aw.worker_id = p_worker_id
       and aw.status = 'active'
     where o.id = p_org_id
       and (cw.worker_id is not null or aw.worker_id is not null)
  ) then
    return 'not_linked';
  end if;

  select id into v_existing from public.engagement_contexts
   where profile_id = v_profile and organization_id = p_org_id and relationship_slug = 'employee' and status = 'active' limit 1;
  if v_existing is not null then return 'already_member'; end if;
  insert into public.engagement_contexts (profile_id, organization_id, relationship_slug, status, is_primary, hash_self)
  values (v_profile, p_org_id, 'employee', 'active', false,
     encode(extensions.digest(v_profile::text || ':employee:' || p_org_id::text, 'sha256'), 'hex'))
  returning id into v_new;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'add_org_member', 'engagement_contexts', v_new,
    jsonb_build_object('organization_id', p_org_id, 'worker_id', p_worker_id, 'profile_id', v_profile, 'relationship_slug', 'employee', 'result', 'added'));
  return 'added';
end $function$;

-- Privilege floor restated (create or replace keeps the ACL; a clean reset
-- must land on the same floor).
revoke execute on function public.add_org_member(uuid, uuid) from public, anon;
grant execute on function public.add_org_member(uuid, uuid) to authenticated;

commit;
