-- @human-gate-approved
--
-- COMMERCIAL HANDOFF: A RE-RAISED HAND RE-QUEUES AN UNSENT HANDOFF (forward fix v1)
-- RED (SECURITY DEFINER replace), PREPARED, NOT APPLIED — owner gate. Forward
-- correction to 20260917160000 (applied 2026-09-17, ledger 20260917145229),
-- which is never rewritten.
--
-- DEFECT (found on the production-data walk of #1760, 2026-09-17): withdrawing
-- an interest closes its handoff (trigger, correct). Expressing interest AGAIN
-- in the same vacancy re-uses the same signal row (UNIQUE worker+vacancy) and
-- `create_commercial_handoff_v1` then returns the EXISTING handoff — which is
-- `closed` — as created=false. The dispatcher only reads `queued` rows, so a
-- worker who changed their mind back would never reach Nonstop, while the
-- board said "Nonstop was informed".
--
-- FIX: when the existing handoff is `closed` AND was never delivered
-- (`delivered_at is null`), the SAME row is re-queued: status → queued,
-- closed_at → null, and the consent, employer key and outreach floor are
-- recomputed from the CURRENT click and the CURRENT vacancy row. A handoff
-- that was already delivered stays as it is (Nonstop already holds it; the
-- withdrawal/re-raise sequence is Nonstop's to reflect — documented follow-up).
-- Every other gate is byte-for-byte the applied function.
--
-- ROLLBACK: supabase/rollbacks/20260917170000_commercial_handoff_requeue_on_reexpress_v1.down.sql
-- (restores the 20260917160000 body).

begin;

create or replace function public.create_commercial_handoff_v1(
  p_signal_id           uuid,
  p_proposition_consent jsonb default '{}'::jsonb
) returns table (handoff_id uuid, created boolean, outreach_state text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_worker   uuid;
  v_sig      record;
  v_vac      record;
  v_key      text;
  v_state    text;
  v_consent  jsonb;
  v_existing record;
  v_row      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    raise exception 'No worker profile' using errcode = 'P0002';
  end if;

  select s.id, s.worker_id, s.status, s.public_vacancy_id, s.request_id
    into v_sig
    from public.demand_interest_signals s
   where s.id = p_signal_id
     and s.worker_id = v_worker;
  if v_sig.id is null then
    raise exception 'Interest not found' using errcode = 'P0002';
  end if;
  if v_sig.status is distinct from 'interested' then
    raise exception 'Interest not active' using errcode = 'P0002';
  end if;
  if v_sig.public_vacancy_id is null then
    raise exception 'Not a public vacancy interest' using errcode = 'P0002';
  end if;

  select h.id, h.outreach_state, h.status, h.delivered_at into v_existing
    from public.commercial_handoffs h
   where h.interest_signal_id = v_sig.id;
  -- Unchanged: a live (queued / delivered / acknowledged) handoff, or a closed
  -- one that WAS delivered, is returned as it is.
  if v_existing.id is not null
     and not (v_existing.status = 'closed' and v_existing.delivered_at is null) then
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;

  select pv.id, pv.provider_key, pv.employer_name, pv.employer_external_org_id,
         pv.employer_homepage, pv.published_at
    into v_vac
    from public.public_vacancies pv
   where pv.id = v_sig.public_vacancy_id
     and pv.is_active
     and (pv.expires_at is null or pv.expires_at > now());
  if v_vac.id is null then
    raise exception 'Vacancy not open' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_vac.employer_name, '')), '') is null then
    raise exception 'Employer not identifiable' using errcode = 'P0002';
  end if;
  if nullif(trim(coalesce(v_vac.employer_external_org_id, '')), '') is not null then
    v_key := v_vac.provider_key || ':org:' || trim(v_vac.employer_external_org_id);
  elsif nullif(trim(coalesce(v_vac.employer_homepage, '')), '') is not null then
    v_key := v_vac.provider_key || ':host:' || lower(trim(v_vac.employer_homepage));
  else
    raise exception 'Employer not identifiable' using errcode = 'P0002';
  end if;

  if v_vac.published_at is null or v_vac.published_at > now() then
    raise exception 'Publication date unusable' using errcode = 'P0002';
  end if;
  v_state := case
    when v_vac.published_at > now() - interval '30 days' then 'ineligible_too_new'
    else 'eligible_for_human_review'
  end;

  if jsonb_typeof(p_proposition_consent) = 'object'
     and (p_proposition_consent ->> 'given') = 'true'
     and (p_proposition_consent ->> 'version') = 'employer-proposition-v1'
  then
    v_consent := jsonb_build_object(
      'given', true,
      'version', 'employer-proposition-v1',
      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  else
    v_consent := jsonb_build_object('given', false);
  end if;

  -- THE FIX: a closed, never-delivered handoff is re-queued in place with the
  -- facts of THIS click — the hand was lowered and raised again before
  -- anything left the platform.
  if v_existing.id is not null then
    update public.commercial_handoffs h
       set status = 'queued',
           closed_at = null,
           proposition_consent = v_consent,
           outreach_state = v_state,
           employer_key = v_key
     where h.id = v_existing.id
       and h.status = 'closed'
       and h.delivered_at is null;
    return query select v_existing.id, false, v_state, 'queued'::text;
    return;
  end if;

  insert into public.commercial_handoffs as h
    (interest_signal_id, worker_id, public_vacancy_id, employer_key,
     proposition_consent, outreach_state)
  values
    (v_sig.id, v_worker, v_vac.id, v_key, v_consent, v_state)
  on conflict (interest_signal_id) do nothing
  returning h.id, h.outreach_state, h.status into v_row;

  if v_row.id is null then
    select h.id, h.outreach_state, h.status into v_existing
      from public.commercial_handoffs h where h.interest_signal_id = v_sig.id;
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;
  return query select v_row.id, true, v_row.outreach_state, v_row.status;
end;
$$;

-- CREATE OR REPLACE keeps the function's ACL; restated so the closure is
-- explicit and reviewable (secdef-local-reset guard).
revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from public;
revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from anon;
grant execute on function public.create_commercial_handoff_v1(uuid, jsonb) to authenticated;

commit;
