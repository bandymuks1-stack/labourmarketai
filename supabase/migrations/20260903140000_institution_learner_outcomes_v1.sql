-- @human-gate-approved — owner approval "Apply batch 2026-09-03 A+B+C" (2026-09-03); APPLIED TO PROD via Supabase MCP after the final security review recorded in PR #1456
-- 20260903140000_institution_learner_outcomes_v1
--
-- ██ RED CLASS — human gate (migration-safety: SECURITY DEFINER + GRANT/REVOKE).
-- ██ Draft; owner-channel apply only.
--
-- INSTITUTION OUTCOME VISIBILITY, LEAST PRIVILEGE (owner direction 2026-09-03,
-- priority 5: "institutions must not gain inappropriate access to private
-- worker/student data").
--
-- The learner-visibility least-privilege ruling (2026-08-27, applied) is
-- kept whole: an institution never reads a learner's journal, skills, CV,
-- profile, interest signals, bookings or engagements. What it may learn is
-- whether its programme LEADS SOMEWHERE — as AGGREGATES over the learners
-- that accepted its invitation:
--
--   learners_connected        active `student` contexts on the organisation
--   active_last_30d           learners with ≥ 1 own journal entry in 30 days
--   with_interest_signals     learners who expressed interest in ≥ 1 demand
--   with_accepted_bookings    learners with ≥ 1 accepted booking
--   with_active_engagements   learners with ≥ 1 active engagement (placement)
--
-- SMALL-COHORT SUPPRESSION: with fewer than 5 connected learners every
-- activity/outcome count is returned NULL and `suppressed = true`, so a count
-- can never identify one person. No id, name, employer or request ever leaves
-- the function. Caller must manage the organisation AND the organisation must
-- hold the training_provider capability.
--
-- Reversible: see the ROLLBACK block and supabase/rollbacks/<same name>.down.sql.

create or replace function public.institution_learner_outcomes_v1(p_organization_id uuid)
returns table (
  learners_connected      integer,
  active_last_30d         integer,
  with_interest_signals   integer,
  with_accepted_bookings  integer,
  with_active_engagements integer,
  suppressed              boolean,
  computed_at             timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_n     integer;
  v_act   integer;
  v_int   integer;
  v_book  integer;
  v_eng   integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.manages_organization(p_organization_id) then
    raise exception 'not_manager' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_roles r
    where r.organization_id = p_organization_id and r.role_slug = 'training_provider'
  ) then
    raise exception 'not_education_institution' using errcode = '42501';
  end if;

  -- The learner set: everyone with an ACTIVE student context on this
  -- organisation (the row an accepted invitation creates). Never materialised
  -- outside this statement; never returned.
  select count(*),
         count(*) filter (where exists (
           select 1 from public.journal_entries je
            where je.worker_id = l.worker_id and je.deleted_at is null
              and je.created_at >= now() - interval '30 days')),
         count(*) filter (where exists (
           select 1 from public.demand_interest_signals s where s.worker_id = l.worker_id)),
         count(*) filter (where exists (
           select 1 from public.booking_requests b
            where b.worker_id = l.worker_id and b.status = 'accepted')),
         count(*) filter (where exists (
           select 1 from public.company_worker_engagements e
            where e.worker_id = l.worker_id and e.status = 'active'))
    into v_n, v_act, v_int, v_book, v_eng
    from (
      select ec.profile_id, w.id as worker_id
        from public.engagement_contexts ec
        left join public.workers w on w.profile_id = ec.profile_id
       where ec.organization_id = p_organization_id
         and ec.relationship_slug = 'student'
         and ec.status = 'active'
       group by ec.profile_id, w.id
    ) l;

  if v_n < 5 then
    return query select v_n, null::integer, null::integer, null::integer, null::integer, true, now();
    return;
  end if;

  return query select v_n, v_act, v_int, v_book, v_eng, false, now();
end;
$$;

revoke execute on function public.institution_learner_outcomes_v1(uuid) from public, anon;
grant execute on function public.institution_learner_outcomes_v1(uuid) to authenticated;

comment on function public.institution_learner_outcomes_v1(uuid) is
  'Aggregate outcomes over an institution''s connected learners (counts only, suppressed below 5 learners). Caller must manage the organisation and it must hold training_provider. Never returns a learner row.';

-- ROLLBACK
-- drop function if exists public.institution_learner_outcomes_v1(uuid);
