-- ROLLBACK of 20261018130000_external_profile_disclosure_v1
-- Restores the applied v2 state: the 7-field whitelist in both RPCs (bodies as applied before this
-- migration), the 7-category CHECK, the v2 consent pin, and removes the two new functions.
-- Consent events recorded under v3 stay in the append-only ledger; after the re-pin they no longer
-- count (has_employer_data_disclosure compares the version), so access closes — fail closed.
-- Links a worker marked 'employers' keep that saved value; with no reader it exposes nothing.
begin;

drop function if exists public.list_disclosed_external_profiles_v1(uuid, uuid, uuid);
drop function if exists public.set_external_profile_visibility_v1(uuid, text);

create or replace function public.grant_employer_data_disclosure(
  p_version text, p_hash text, p_locale text, p_source text,
  p_recipient_organization_id uuid, p_context_type text, p_context_id uuid, p_selected_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
  v_field text;
  v_count int;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.workers where profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_a_worker');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'employer_data_disclosure';
  if v_cur is null
    or v_cur.current_version is distinct from p_version
    or v_cur.current_text_hash is distinct from p_hash
  then
    return jsonb_build_object('ok', false, 'error', 'stale_consent_version');
  end if;
  if p_locale not in ('lt', 'en', 'ru', 'nl', 'de', 'pl') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_locale');
  end if;
  if coalesce(char_length(btrim(p_source)), 0) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'error', 'invalid_source');
  end if;
  if p_recipient_organization_id is null
    or not exists (select 1 from public.organizations o where o.id = p_recipient_organization_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_recipient_organization');
  end if;
  if p_context_type not in ('company_need', 'booking', 'service_request')
    or p_context_id is null
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_context');
  end if;
  if p_context_type = 'company_need'
    and not exists (select 1 from public.customer_requests r where r.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  if p_context_type = 'booking'
    and not exists (select 1 from public.booking_requests b where b.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  if p_context_type = 'service_request'
    and not exists (select 1 from public.service_offering_requests s where s.id = p_context_id)
  then
    return jsonb_build_object('ok', false, 'error', 'unknown_context');
  end if;
  if p_selected_fields is null or jsonb_typeof(p_selected_fields) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_selected_fields');
  end if;
  select count(*) into v_count from jsonb_array_elements_text(p_selected_fields);
  if v_count < 1 or v_count > 7
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_selected_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_selected_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_selected_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation')
    then
      return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'field', v_field);
    end if;
  end loop;
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source,
     recipient_organization_id, context_type, context_id, selected_fields)
  values
    (v_uid, 'employer_data_disclosure', 'granted', p_version, p_hash, p_locale, p_source,
     p_recipient_organization_id, p_context_type, p_context_id, p_selected_fields)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'status', 'granted', 'consent_event_id', v_id);
end;
$$;

create or replace function public.propose_contact_disclosure_request_v1(
  p_request_id uuid, p_worker_id uuid, p_organization_id uuid, p_requested_fields jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_field      text;
  v_count      int;
  v_open       int;
  v_day        int;
  v_live       public.contact_disclosure_requests%rowtype;
  v_id         uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (select 1 from public.customer_requests cr
                  where cr.id = p_request_id and cr.profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_your_demand');
  end if;

  if p_organization_id is null or not exists (
    select 1 from public.organizations o
     where o.id = p_organization_id
       and (o.owner_profile_id = v_uid or public.manages_organization(o.id))
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_your_organization');
  end if;

  if not exists (select 1 from public.workers w where w.id = p_worker_id)
     or not public.can_view_worker(p_worker_id) then
    return jsonb_build_object('ok', false, 'error', 'worker_not_visible');
  end if;

  if p_requested_fields is null or jsonb_typeof(p_requested_fields) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_fields');
  end if;
  select count(*) into v_count from jsonb_array_elements_text(p_requested_fields);
  if v_count < 1 or v_count > 7
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_requested_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_requested_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation')
    then
      return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'field', v_field);
    end if;
  end loop;

  if p_note is not null and char_length(p_note) > 500 then
    return jsonb_build_object('ok', false, 'error', 'note_too_long');
  end if;

  select * into v_live from public.contact_disclosure_requests
   where owner_id = v_uid and request_id = p_request_id
     and worker_id = p_worker_id and status = 'created'
   for update;
  if v_live.id is not null then
    if v_live.expires_at > now() then
      return jsonb_build_object('ok', true, 'status', 'created',
        'request_id', v_live.id, 'deduplicated', true);
    end if;
    update public.contact_disclosure_requests
       set status = 'expired', updated_at = now()
     where id = v_live.id;
    perform public.contact_disclosure_log_change(
      v_live.id, v_uid, 'expired', 'created', 'expired',
      'expire_contact_disclosure_request_lazy_v1');
  end if;

  if exists (select 1 from public.contact_disclosure_requests
              where owner_id = v_uid and request_id = p_request_id
                and worker_id = p_worker_id and status = 'accepted') then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  select count(*) into v_open from public.contact_disclosure_requests
   where owner_id = v_uid and status = 'created' and expires_at > now();
  if v_open >= 10 then
    return jsonb_build_object('ok', false, 'error', 'limit_reached');
  end if;
  select count(*) into v_day from public.contact_disclosure_requests
   where owner_id = v_uid and created_at > now() - interval '24 hours';
  if v_day >= 30 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.contact_disclosure_requests
      (owner_id, organization_id, request_id, worker_id, requested_fields, note)
    values (v_uid, p_organization_id, p_request_id, p_worker_id,
            p_requested_fields, nullif(trim(coalesce(p_note, '')), ''))
    returning id into v_id;

  perform public.contact_disclosure_log_change(
    v_id, v_uid, 'created', null, 'created',
    'propose_contact_disclosure_request_v1');

  return jsonb_build_object('ok', true, 'status', 'created', 'request_id', v_id);
end;
$$;

do $$
begin
  if exists (select 1 from public.personal_data_disclosures where cardinality(data_categories) > 7) then
    raise exception 'rollback refused: a disclosure row records 8 categories; keep the widened CHECK';
  end if;
end $$;
alter table public.personal_data_disclosures
  drop constraint if exists personal_data_disclosures_data_categories_check;
alter table public.personal_data_disclosures
  add constraint personal_data_disclosures_data_categories_check
  check (cardinality(data_categories) >= 1 and cardinality(data_categories) <= 7);

update public.privacy_consent_purposes
   set current_version   = '2026-07-11.v2',
       current_text_hash = '6f57d9167a6313220ba34ae46a1ca03357db0737d17f5985b3dd5f1e75b6fb81',
       updated_at        = now()
 where purpose = 'employer_data_disclosure'
   and current_version = '2026-10-18.v3';

commit;
