-- @human-gate-approved — owner approval "Apply batch 2026-09-03 A+B+C" (2026-09-03); APPLIED TO PROD via Supabase MCP after the final security review recorded in PR #1448
-- 20260903101000_agency_candidate_offer_decision_v1
--
-- ██ RED CLASS — human gate (migration-safety: CHECK widening via drop + re-add,
-- ██ SECURITY DEFINER functions, GRANT/REVOKE). Draft; owner-channel apply only.
--
-- AGENCY FIRST VALUE (FIRST REAL ECOSYSTEM USE, P0F) — the one missing link.
--
-- The real agency ↔ client bridge (20260723180000, issue #859) is keyed on
-- COMPANIES end to end: a staffing_agency company connects to a real client
-- company, the client shares a demand, the agency offers a worker from its own
-- company_workers roster. Production 2026-09-03: the client can accept or
-- decline the CONNECTION and can SEE offered candidates, but a candidate OFFER
-- has no decision — `status ∈ {offered, withdrawn}` only. The agency's
-- progress view (list_agency_offer_progress_v1) already infers a "review
-- stage" from any booking the client happens to create by hand; nothing
-- records that the client accepted or declined THIS candidate.
--
-- What this adds — the smallest complete placement step on the canonical
-- objects, no new domain:
--   1. offer.status gains 'accepted' | 'declined'; decided_at / decided_by /
--      decision_note / booking_id record the decision.
--   2. respond_agency_candidate_offer_v1(offer, decision, note): the CLIENT
--      company owner decides. 'accepted' proposes the canonical booking to the
--      worker through the existing, rate-limited propose_booking_request_v3
--      (the client already owns the demand, so its own rules apply); the
--      worker's acceptance then creates the engagement exactly as today
--      (respond_booking_request_v3 → company_worker_engagements). 'declined'
--      closes the offer. Either way the agency sees the outcome.
--   3. list_agency_offered_candidates_for_request_v2: the client's read now
--      carries offer_status + booking_id and includes decided offers, so the
--      surface can show history instead of only open offers. v1 is untouched.
--
-- Worker portability is unchanged: nothing here binds a worker to the agency;
-- the booking and engagement are between the CLIENT company and the worker.
--
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql
-- (guarded — refuses while any decided offer exists, so no decision is lost).

alter table public.agency_candidate_offers
  add column if not exists decided_at    timestamptz,
  add column if not exists decided_by    uuid references public.profiles(id) on delete set null,
  add column if not exists decision_note text,
  add column if not exists booking_id    uuid references public.booking_requests(id) on delete set null;

alter table public.agency_candidate_offers
  drop constraint if exists agency_candidate_offers_decision_note_check;
alter table public.agency_candidate_offers
  add constraint agency_candidate_offers_decision_note_check
  check (decision_note is null or char_length(decision_note) <= 500);

-- WIDENS the status vocabulary (drop + re-add of a CHECK — RED by envelope rule).
alter table public.agency_candidate_offers
  drop constraint if exists agency_candidate_offers_status_check;
alter table public.agency_candidate_offers
  add constraint agency_candidate_offers_status_check
  check (status in ('offered', 'withdrawn', 'accepted', 'declined'));

comment on column public.agency_candidate_offers.booking_id is
  'The canonical booking proposed to the worker when the client accepted this offer (respond_agency_candidate_offer_v1). NULL for open, withdrawn or declined offers.';

create or replace function public.respond_agency_candidate_offer_v1(
  p_offer_id uuid,
  p_decision text,
  p_note     text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.respond_agency_candidate_offer_v1(uuid, text, text) from public, anon;
grant execute on function public.respond_agency_candidate_offer_v1(uuid, text, text) to authenticated;

comment on function public.respond_agency_candidate_offer_v1(uuid, text, text) is
  'Client company owner accepts (→ canonical booking proposed to the worker) or declines an agency candidate offer. Returns the booking id on accept, the offer id on decline.';

-- Client read, v2: decided offers included, status + booking visible. v1 untouched.
create or replace function public.list_agency_offered_candidates_for_request_v2(p_request_id uuid)
returns table (
  offer_id     uuid,
  worker_id    uuid,
  agency_name  text,
  note         text,
  offer_status text,
  booking_id   uuid,
  decided_at   timestamptz,
  created_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.worker_id, coalesce(ac.display_name, ac.legal_name), o.note,
         o.status, o.booking_id, o.decided_at, o.created_at
    from public.agency_candidate_offers o
    join public.companies ac on ac.id = o.agency_company_id
   where o.request_id = p_request_id
     and o.status <> 'withdrawn'
     and exists (select 1 from public.customer_requests r
                  where r.id = o.request_id and r.profile_id = auth.uid())  -- caller owns the demand
   order by (o.status = 'offered') desc, o.created_at desc
   limit 100;
$$;

revoke execute on function public.list_agency_offered_candidates_for_request_v2(uuid) from public, anon;
grant execute on function public.list_agency_offered_candidates_for_request_v2(uuid) to authenticated;

-- ROLLBACK
-- (see supabase/rollbacks/20260903101000_agency_candidate_offer_decision_v1.down.sql — guarded)
-- drop function if exists public.list_agency_offered_candidates_for_request_v2(uuid);
-- drop function if exists public.respond_agency_candidate_offer_v1(uuid, text, text);
-- alter table public.agency_candidate_offers drop constraint if exists agency_candidate_offers_status_check;
-- alter table public.agency_candidate_offers add constraint agency_candidate_offers_status_check check (status in ('offered','withdrawn'));
-- alter table public.agency_candidate_offers drop column if exists booking_id, drop column if exists decision_note, drop column if exists decided_by, drop column if exists decided_at;
