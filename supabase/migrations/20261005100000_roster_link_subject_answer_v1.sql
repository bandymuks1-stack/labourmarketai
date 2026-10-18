-- ============================================================================
-- @human-gate-approved
--
-- RISK ACKNOWLEDGEMENT, NOT AN APPROVAL. This file is RED by construction (a new
-- SECURITY DEFINER function that writes organization_people). The annotation
-- states the ROUTE (draft PR + needs-human-gate, owner-channel apply via
-- Supabase MCP apply_migration). NO OWNER APPROVAL EXISTS FOR THIS FILE YET.
--
-- 20261005100000 - the SUBJECT'S refusal / withdrawal of a roster link.
--
-- DEFECT (found by the integrated local QA, 2026-10-05, on a stack built from
-- zero): the policy organization_people_subject_decides has admitted
-- (link_proposed -> unlinked) "refuse" and (linked -> unlinked) "withdraw" since
-- 20260907114500, and the product writes both with
--   UPDATE organization_people SET link_state='unlinked', linked_profile_id=NULL ...
--   WHERE id = $1 AND linked_profile_id = auth.uid()
-- PostgreSQL applies the SELECT policy (organization_people_select:
-- manages_organization OR linked_profile_id = auth.uid() OR is_admin) to the NEW
-- row of an UPDATE whose WHERE / RETURNING reads columns. The refusal writes
-- linked_profile_id = NULL, so the person can no longer SEE the row they just
-- answered and the statement fails with 42501 "new row violates row-level
-- security policy" - with or without RETURNING. Accept works (the new row still
-- names the caller). Result: a person could never refuse an offer nor withdraw a
-- confirmed link through the product, although the wording of the consent
-- promises both. No policy can express "you may stop seeing a row you were just
-- allowed to change" without widening the SELECT policy to rows that name nobody
-- (which would let anyone enumerate the roster), so the answer goes through ONE
-- narrow SECURITY DEFINER door that re-derives the caller.
--
-- THE DOOR: respond_to_roster_link_v1(p_person_id, p_decision 'refuse'|'withdraw')
--   * the caller must be the row's linked profile (auth.uid()), else the row is
--     reported as 'not_found' - the same answer for "no such row", "not yours"
--     and "wrong state", so nothing is learnt about other people's rows;
--   * 'refuse' acts only on link_state = 'link_proposed', 'withdraw' only on
--     'linked' (neither may silently do the other's job);
--   * it writes EXACTLY what the product's patch wrote (unlinked, method /
--     profile / worker / linked_at cleared) and an audit row; it can never LINK
--     anyone (accepting stays the subject-policy UPDATE, which works);
--   * the existing triggers still run (consent guard: not a transition INTO
--     worker_confirmed; G-4 guard: end-user roles only, this runs as the owner).
--
-- ROLLBACK: supabase/rollbacks/20261005100000_roster_link_subject_answer_v1.down.sql
-- ============================================================================

begin;

create or replace function public.respond_to_roster_link_v1(
  p_person_id uuid,
  p_decision  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_state text;
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('refuse', 'withdraw') then
    raise exception 'decision must be refuse or withdraw' using errcode = '22023';
  end if;

  select op.link_state, op.organization_id
    into v_state, v_org
    from public.organization_people op
   where op.id = p_person_id
     and op.linked_profile_id = v_uid
   for update;

  if v_state is null
     or (p_decision = 'refuse'   and v_state <> 'link_proposed')
     or (p_decision = 'withdraw' and v_state <> 'linked') then
    return 'not_found';
  end if;

  update public.organization_people
     set link_state        = 'unlinked',
         link_method       = null,
         linked_profile_id = null,
         linked_worker_id  = null,
         linked_at         = null,
         updated_at        = now()
   where id = p_person_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (v_uid, 'roster_link_' || p_decision, 'organization_people', p_person_id,
          jsonb_build_object('organization_id', v_org, 'from_state', v_state));

  return 'unlinked';
end;
$$;

revoke all on function public.respond_to_roster_link_v1(uuid, text) from public, anon;
grant execute on function public.respond_to_roster_link_v1(uuid, text) to authenticated;

comment on function public.respond_to_roster_link_v1(uuid, text) is
  'The subject''s refusal of an offered roster link or withdrawal of a confirmed one. SECURITY DEFINER because the row stops naming the caller (the SELECT policy would reject the UPDATE''s new row). Never links anyone.';

commit;
