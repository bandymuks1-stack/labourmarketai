-- Rollback 20260928210000: restore respond_agency_candidate_offer_v1 exactly as
-- production had it (read back 2026-09-28: null role, fixed English note).
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
    -- The canonical booking, under the client's own rules (demand ownership,
    -- open-proposal and daily caps, readiness snapshot). The worker still
    -- accepts or declines it; only that acceptance creates an engagement.
    v_booking := public.propose_booking_request_v3(
      v_offer.request_id, v_offer.worker_id,
      null, null, null, null,
      coalesce(v_note, 'Agency candidate offer accepted')
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
