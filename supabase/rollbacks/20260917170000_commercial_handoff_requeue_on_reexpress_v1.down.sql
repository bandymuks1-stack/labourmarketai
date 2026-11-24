-- ROLLBACK of 20260917170000_commercial_handoff_requeue_on_reexpress_v1
-- Restores the create_commercial_handoff_v1 body exactly as 20260917160000
-- applied it (a closed handoff is returned as it is; no re-queue). Data is
-- untouched: a row re-queued by the forward fix simply stays queued.

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

  -- The caller's OWN, still-standing interest, on a PUBLIC vacancy (v1).
  -- Existence-oracle closure: a foreign or unknown signal id and a missing
  -- one look identical from outside (P0002), never a different error.
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
    -- Platform demands: the owner is already told in-product; a Nonstop
    -- approach to a platform customer is an open owner decision.
    raise exception 'Not a public vacancy interest' using errcode = 'P0002';
  end if;

  -- Idempotent: the signal already has its handoff → return it, created=false.
  select h.id, h.outreach_state, h.status into v_existing
    from public.commercial_handoffs h
   where h.interest_signal_id = v_sig.id;
  if v_existing.id is not null then
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;

  -- A LIVE vacancy with an IDENTIFIABLE employer.
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

  -- The recency floor of employer-outreach-policy.ts, from the publisher's
  -- OWN publication date. Under 30 full days → too new, no exceptions.
  if v_vac.published_at is null or v_vac.published_at > now() then
    raise exception 'Publication date unusable' using errcode = 'P0002';
  end if;
  v_state := case
    when v_vac.published_at > now() - interval '30 days' then 'ineligible_too_new'
    else 'eligible_for_human_review'
  end;

  -- Consent: only the shape the form produces is stored; anything else is
  -- recorded as NOT given. Never trusted as a free jsonb.
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

  insert into public.commercial_handoffs as h
    (interest_signal_id, worker_id, public_vacancy_id, employer_key,
     proposition_consent, outreach_state)
  values
    (v_sig.id, v_worker, v_vac.id, v_key, v_consent, v_state)
  on conflict (interest_signal_id) do nothing
  returning h.id, h.outreach_state, h.status into v_row;

  if v_row.id is null then
    -- Lost a race with an identical call: return the row that won.
    select h.id, h.outreach_state, h.status into v_existing
      from public.commercial_handoffs h where h.interest_signal_id = v_sig.id;
    return query select v_existing.id, false, v_existing.outreach_state, v_existing.status;
    return;
  end if;
  return query select v_row.id, true, v_row.outreach_state, v_row.status;
end;
$$;

revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from public;
revoke all on function public.create_commercial_handoff_v1(uuid, jsonb) from anon;
grant execute on function public.create_commercial_handoff_v1(uuid, jsonb) to authenticated;

commit;
