-- @human-gate-approved
-- Owner authorization: consent-and-disclosure goal command (2026-07-11) —
-- follow-up correctness fix found by the production rollback self-test.
--
-- privacy_consent_event_ordering_fix_v1
-- =====================================
-- PROBLEM: "current consent state = newest ledger row" ordered by
-- (created_at desc, id desc). Within one transaction now() is frozen, and
-- gen_random_uuid() ids are unordered — a grant + withdraw at the same
-- timestamp resolved NON-deterministically (a withdrawal could lose the
-- tie-break and leave the profile visible). Exactly the Phase 14
-- "race between withdrawal and transfer" class.
--
-- FIX: monotonic insertion-order column `seq` (bigint identity) + every
-- current-state reader orders by (created_at desc, seq desc). Withdrawal
-- now ALWAYS wins over any same-instant grant. Additive; 0 rows existed
-- when applied (ledger ships empty), so no backfill semantics involved.
--
-- Rollback: supabase/rollbacks/20260711150000_privacy_consent_event_ordering_fix_v1.down.sql

alter table public.privacy_consent_events
  add column if not exists seq bigint generated always as identity;

create index if not exists privacy_consent_events_user_purpose_seq_idx
  on public.privacy_consent_events (user_id, purpose, seq desc);

create or replace function public.worker_profile_discoverable(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_profile
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.seq desc
    limit 1
  ), false)
$$;

create or replace function public.current_profile_discoverability_consent()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'status', case
        when e.action = 'granted' and e.consent_text_version = p.current_version then 'granted'
        when e.action = 'granted' then 'granted_stale_version'
        else 'withdrawn'
      end,
      'decidedAt', e.created_at,
      'version', e.consent_text_version,
      'locale', e.locale,
      'currentVersion', p.current_version
    )
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = auth.uid()
      and e.purpose = 'profile_discoverability'
    order by e.created_at desc, e.seq desc
    limit 1
  ), jsonb_build_object('status', 'not_set'))
$$;

create or replace function public.has_employer_data_disclosure(
  p_worker_profile uuid,
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select e.action = 'granted' and e.consent_text_version = p.current_version
    from public.privacy_consent_events e
    join public.privacy_consent_purposes p on p.purpose = e.purpose
    where e.user_id = p_worker_profile
      and e.purpose = 'employer_data_disclosure'
      and e.recipient_organization_id = p_recipient_organization_id
      and e.context_type = p_context_type
      and e.context_id = p_context_id
    order by e.created_at desc, e.seq desc
    limit 1
  ), false)
$$;

create or replace function public.my_privacy_consent_history()
returns setof public.privacy_consent_events
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.privacy_consent_events
  where user_id = auth.uid()
  order by created_at desc, seq desc
$$;

create or replace function public.record_personal_data_disclosure(
  p_worker_profile uuid,
  p_recipient_organization_id uuid,
  p_context_type text,
  p_context_id uuid,
  p_data_categories text[],
  p_document_ids uuid[],
  p_delivery_method text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_grant public.privacy_consent_events;
  v_cat text;
  v_id uuid;
begin
  if v_uid is null or not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  if not public.has_employer_data_disclosure(
    p_worker_profile, p_recipient_organization_id, p_context_type, p_context_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'DISCLOSURE_AUTHORIZATION_REQUIRED');
  end if;
  select e.* into v_grant
  from public.privacy_consent_events e
  where e.user_id = p_worker_profile
    and e.purpose = 'employer_data_disclosure'
    and e.action = 'granted'
    and e.recipient_organization_id = p_recipient_organization_id
    and e.context_type = p_context_type
    and e.context_id = p_context_id
  order by e.created_at desc, e.seq desc
  limit 1;
  if v_grant is null then
    return jsonb_build_object('ok', false, 'error', 'DISCLOSURE_AUTHORIZATION_REQUIRED');
  end if;
  if p_data_categories is null or cardinality(p_data_categories) < 1 then
    return jsonb_build_object('ok', false, 'error', 'empty_payload');
  end if;
  foreach v_cat in array p_data_categories loop
    if not exists (
      select 1 from jsonb_array_elements_text(v_grant.selected_fields) f where f = v_cat
    ) then
      return jsonb_build_object('ok', false, 'error', 'PAYLOAD_WIDER_THAN_CONSENT', 'category', v_cat);
    end if;
  end loop;
  insert into public.personal_data_disclosures
    (worker_user_id, recipient_organization_id, context_type, context_id,
     consent_event_id, data_categories, document_ids, disclosed_by, delivery_method)
  values
    (p_worker_profile, p_recipient_organization_id, p_context_type, p_context_id,
     v_grant.id, p_data_categories, p_document_ids, v_uid, p_delivery_method)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'disclosure_id', v_id);
end;
$$;

create or replace function public.admin_privacy_readiness_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int;
  v_discoverable int;
  v_withdrawn int;
  v_stale int;
  v_awaiting int;
  v_active_disclosure_permissions int;
  v_completed_disclosures int;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_authorized');
  end if;
  select count(*) into v_total from public.workers w where w.profile_id is not null;
  select count(*) into v_discoverable
    from public.workers w
    where w.profile_id is not null and public.worker_profile_discoverable(w.profile_id);
  select count(*) into v_withdrawn
    from public.workers w
    where w.profile_id is not null and exists (
      select 1 from (
        select e.action
        from public.privacy_consent_events e
        where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
        order by e.created_at desc, e.seq desc
        limit 1
      ) latest where latest.action = 'withdrawn'
    );
  select count(*) into v_stale
    from public.workers w
    where w.profile_id is not null
      and not public.worker_profile_discoverable(w.profile_id)
      and exists (
        select 1 from (
          select e.action, e.consent_text_version
          from public.privacy_consent_events e
          where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
          order by e.created_at desc, e.seq desc
          limit 1
        ) latest
        join public.privacy_consent_purposes p on p.purpose = 'profile_discoverability'
        where latest.action = 'granted' and latest.consent_text_version <> p.current_version
      );
  v_awaiting := v_total - v_discoverable - v_withdrawn - v_stale;
  select count(*) into v_active_disclosure_permissions
    from (
      select distinct on (e.user_id, e.recipient_organization_id, e.context_type, e.context_id)
        e.action, e.consent_text_version
      from public.privacy_consent_events e
      where e.purpose = 'employer_data_disclosure'
      order by e.user_id, e.recipient_organization_id, e.context_type, e.context_id,
        e.created_at desc, e.seq desc
    ) latest
    join public.privacy_consent_purposes p on p.purpose = 'employer_data_disclosure'
    where latest.action = 'granted' and latest.consent_text_version = p.current_version;
  select count(*) into v_completed_disclosures from public.personal_data_disclosures;
  return jsonb_build_object(
    'ok', true,
    'workersTotal', v_total,
    'discoverable', v_discoverable,
    'withdrawn', v_withdrawn,
    'staleVersion', v_stale,
    'awaitingChoice', v_awaiting,
    'activeDisclosurePermissions', v_active_disclosure_permissions,
    'completedDisclosures', v_completed_disclosures
  );
end;
$$;

create or replace function public.admin_list_worker_privacy_states()
returns table (profile_id uuid, discoverability text)
language sql
stable
security definer
set search_path = public
as $$
  select w.profile_id,
    case
      when public.worker_profile_discoverable(w.profile_id) then 'granted'
      when exists (
        select 1 from (
          select e.action from public.privacy_consent_events e
          where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
          order by e.created_at desc, e.seq desc limit 1
        ) latest where latest.action = 'withdrawn'
      ) then 'withdrawn'
      when exists (
        select 1 from public.privacy_consent_events e
        where e.user_id = w.profile_id and e.purpose = 'profile_discoverability'
      ) then 'granted_stale_version'
      else 'not_set'
    end
  from public.workers w
  where w.profile_id is not null
    and public.is_admin()
$$;
