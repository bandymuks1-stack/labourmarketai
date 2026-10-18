-- ============================================================================
-- 20260928210000 — an agency placement reaches the worker with the need's role.
--
-- RED by rule (redefines a SECURITY DEFINER function). Part of the owner-
-- approved agency commercial chain (2026-09-28, placement lifecycle).
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- Production walk 2026-09-28: Alfa accepted Gama's candidate for
-- "[QA-SYNTHETIC] Betonuotojai Vilniuje" (role "Betonuotojas"); the worker
-- received "Darbo susitarimas" with no role and the note
-- "Agency candidate offer accepted" — an English system string shown as if
-- the client had written it. The direct booking path fixed the same blank
-- role in #1919 (the need's role). Here: the role is the need's own
-- (payload.role, else role_or_work_type, else title), and the note is ONLY
-- what the client actually wrote in its decision (null otherwise).
-- Everything else is byte-identical to production (read back 2026-09-28).
--
-- ROLLBACK: supabase/rollbacks/20260928210000_agency_placement_booking_role_v1.down.sql
-- ============================================================================

create or replace function public.respond_agency_candidate_offer_v1(p_offer_id uuid, p_decision text, p_note text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_offer   public.agency_candidate_offers%rowtype;
  v_booking uuid;
  v_role    text;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_decision not in ('accepted', 'declined') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  select * into v_offer from public.agency_candidate_offers where id = p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found' using errcode = '42501'; end if;

  -- The CLIENT company owner decides — never the agency, never a third party.
  if not public.owns_company(v_offer.client_company_id) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if v_offer.status <> 'offered' then
    raise exception 'offer_not_open' using errcode = 'P0004';
  end if;

  if p_decision = 'accepted' then
    -- WHAT the worker is offered is the need's own role.
    select left(coalesce(nullif(btrim(r.payload->>'role'), ''),
                         nullif(btrim(r.role_or_work_type), ''),
                         nullif(btrim(r.title), '')), 200)
      into v_role
      from public.customer_requests r where r.id = v_offer.request_id;
    -- The canonical booking, under the client's own rules (demand ownership,
    -- open-proposal and daily caps, readiness snapshot). The worker still
    -- accepts or declines it; only that acceptance creates an engagement.
    v_booking := public.propose_booking_request_v3(
      v_offer.request_id, v_offer.worker_id,
      null, null, null, v_role,
      v_note
    );
  end if;

  update public.agency_candidate_offers
     set status        = p_decision,
         decided_at    = now(),
         decided_by    = v_uid,
         decision_note = v_note,
         booking_id    = v_booking,
         updated_at    = now()
   where id = p_offer_id;

  return coalesce(v_booking, p_offer_id);
end;
$function$;

revoke all on function public.respond_agency_candidate_offer_v1(uuid, text, text) from public, anon;
grant execute on function public.respond_agency_candidate_offer_v1(uuid, text, text) to authenticated;
