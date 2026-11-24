-- DOWN for 20260806230000_experience_author_subject_v1.sql
--
-- Restores the experience domain to its 20260802120000 (v1) shape:
--   1. submit_experience_record body back to the v1 text (verbatim);
--   2. the author-side columns, constraints and indexes removed.
--
-- DATA WARNING: dropping author_side / author_organization_id discards the
-- author-side classification of every row that has one. In production this
-- is currently impossible to trigger destructively (0 experience rows on
-- 2026-08-06), but once real org-authored rows exist this rollback loses
-- recorded attribution and needs its own owner decision.

-- ── 1. submit_experience_record back to v1 (verbatim body) ──────────────────

create or replace function public.submit_experience_record(
  p_subject_type text,
  p_subject_id uuid,
  p_interaction_kind text,
  p_interaction_id uuid,
  p_sentiment text,
  p_body text,
  p_dimensions jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_author uuid := auth.uid();
  v_ok boolean := false;
  v_subject_profile uuid;
  v_subject_org uuid;
  v_existing uuid;
  v_id uuid;
  v_worker_profile uuid;
  v_dim jsonb;
begin
  if v_author is null then return jsonb_build_object('ok', false, 'code', 'not_authenticated'); end if;
  if p_sentiment not in ('positive','negative') then
    return jsonb_build_object('ok', false, 'code', 'invalid_sentiment');
  end if;
  if p_body is null or char_length(trim(p_body)) < 1 or char_length(p_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_body');
  end if;
  if p_subject_type = 'worker' then
    v_subject_profile := p_subject_id;
  elsif p_subject_type = 'organization' then
    v_subject_org := p_subject_id;
  else
    return jsonb_build_object('ok', false, 'code', 'invalid_subject');
  end if;
  if v_subject_profile is not distinct from v_author then
    return jsonb_build_object('ok', false, 'code', 'self_review');
  end if;
  -- optional dimension chips: every key must be a contract dimension with a
  -- contract outcome — never a number.
  if p_dimensions is not null then
    for v_dim in select jsonb_array_elements(p_dimensions) loop
      if not (v_dim ? 'dimension') or not (v_dim ? 'outcome')
        or v_dim->>'dimension' not in
          ('punctuality_reliability','communication','work_quality','condition_accuracy',
           'compensation_accuracy','accommodation_accuracy','transport_accuracy')
        or v_dim->>'outcome' not in ('as_agreed','minor_issues','not_as_agreed') then
        return jsonb_build_object('ok', false, 'code', 'invalid_dimensions');
      end if;
    end loop;
  end if;

  -- ELIGIBILITY: the author and the subject must be the two REAL parties of a
  -- COMPLETED canonical interaction (contract isInteractionCompleted).
  if p_interaction_kind = 'accepted_booking' then
    select true into v_ok
    from public.booking_requests b
    join public.workers w on w.id = b.worker_id
    where b.id = p_interaction_id
      and b.status = 'accepted'
      and b.start_date is not null and b.start_date <= current_date
      and ((b.owner_id = v_author and w.profile_id = v_subject_profile)
        or (w.profile_id = v_author and b.owner_id = v_subject_profile));
  elsif p_interaction_kind = 'completed_engagement' then
    select true into v_ok
    from public.engagement_contexts ec
    where ec.id = p_interaction_id
      and (ec.status = 'ended' or ec.ended_at is not null)
      and (
        -- worker authors about the org, or an org manager authors about the worker
        (ec.profile_id = v_author and v_subject_org is not null
          and ec.organization_id = v_subject_org)
        or (v_subject_profile is not null and ec.profile_id = v_subject_profile
          and ec.organization_id is not null
          and public.manages_organization(ec.organization_id))
      );
  elsif p_interaction_kind = 'concluded_service_request' then
    select true into v_ok
    from public.service_offering_requests s
    where s.id = p_interaction_id
      and s.status = 'accepted'
      and ((s.buyer_id = v_author and s.provider_id = v_subject_profile)
        or (s.provider_id = v_author and s.buyer_id = v_subject_profile));
  else
    return jsonb_build_object('ok', false, 'code', 'unknown_interaction_kind');
  end if;

  if v_ok is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'not_eligible');
  end if;

  -- idempotent duplicate: the same author+subject+interaction returns the
  -- existing record, never a second vote.
  select id into v_existing from public.experience_records
  where author_profile_id = v_author
    and interaction_kind = p_interaction_kind
    and interaction_id = p_interaction_id
    and (subject_profile_id is not distinct from v_subject_profile)
    and (subject_organization_id is not distinct from v_subject_org);
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'duplicate_for_interaction', 'id', v_existing);
  end if;

  insert into public.experience_records
    (author_profile_id, subject_type, subject_profile_id, subject_organization_id,
     interaction_kind, interaction_id, sentiment, body, dimensions)
  values
    (v_author, p_subject_type, v_subject_profile, v_subject_org,
     p_interaction_kind, p_interaction_id, p_sentiment, trim(p_body), p_dimensions)
  returning id into v_id;
  perform public.experience_audit('experience_record', v_id, 'experience_submitted',
    null, 'submitted', null);
  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'submitted');
end;
$$;

revoke execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.submit_experience_record(text, uuid, text, uuid, text, text, jsonb)
  to authenticated;

-- ── 2. Author-side model removal ────────────────────────────────────────────

drop index if exists public.experience_records_one_org_author_per_interaction;
drop index if exists public.experience_records_author_org_idx;

alter table public.experience_records
  drop constraint if exists experience_records_author_side_shape;
alter table public.experience_records
  drop constraint if exists experience_records_org_no_self_review;

alter table public.experience_records
  drop column if exists author_organization_id;
alter table public.experience_records
  drop column if exists author_side;
