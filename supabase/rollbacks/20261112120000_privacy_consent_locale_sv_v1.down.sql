-- Rollback of 20261112120000_privacy_consent_locale_sv_v1. Restores the three pre-sv hashes and the
-- six-locale allowlist, everything else byte-identical. Consent events recorded with locale 'sv' are
-- evidence and are NOT touched; they keep their own version and hash.
--
-- SAFE ORDER: roll the APP back first (remove `sv` from CONSENT_LOCALES), then run this file. Between
-- the two steps a new grant is refused as stale, never recorded against the wrong text. Running this
-- file while the app still carries `sv` refuses every new grant in every language until the app follows.

begin;

update public.privacy_consent_purposes
   set current_text_hash = 'd4145ac3d118b17e5bc3bd68c3f2737ff0c872e08a38df034464213aad534549',
       updated_at = now()
 where purpose = 'profile_discoverability'
   and current_version = '2026-07-11.v2'
   and current_text_hash = 'aed377c0113d0649c587a517ae63adea0c91354dbb0484f290a634710ffc46f9';

update public.privacy_consent_purposes
   set current_text_hash = '6f57d9167a6313220ba34ae46a1ca03357db0737d17f5985b3dd5f1e75b6fb81',
       updated_at = now()
 where purpose = 'employer_data_disclosure'
   and current_version = '2026-07-11.v2'
   and current_text_hash = 'eed33d481b7cb620087d8e34448651d8cfa0651d5e77515e51491c02c63ac0e0';

update public.privacy_consent_purposes
   set current_text_hash = '28b2a552ae56b5e0f260896664a9f5f7a5a918fe536e613c62c0028ac267db7f',
       updated_at = now()
 where purpose = 'partner_supply_representation'
   and current_version = '2026-09-04.v1'
   and current_text_hash = 'f5d40f6757f6e71c3c7712a214ef3f2465f7dc27d319c33b7a2fad1bdacf3262';

do $$
begin
  -- Fail closed: every pin must have moved, or the whole file rolls back.
  if (select count(*) from public.privacy_consent_purposes where
        (purpose = 'profile_discoverability' and current_text_hash = 'd4145ac3d118b17e5bc3bd68c3f2737ff0c872e08a38df034464213aad534549')
     or (purpose = 'employer_data_disclosure' and current_text_hash = '6f57d9167a6313220ba34ae46a1ca03357db0737d17f5985b3dd5f1e75b6fb81')
     or (purpose = 'partner_supply_representation' and current_text_hash = '28b2a552ae56b5e0f260896664a9f5f7a5a918fe536e613c62c0028ac267db7f')) <> 3 then
    raise exception 'consent re-pin: expected 3 pins at the new hashes';
  end if;
end $$;

create or replace function public.grant_profile_discoverability_consent(p_version text, p_hash text, p_locale text, p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'profile_discoverability';
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
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'profile_discoverability', 'granted', p_version, p_hash, p_locale, p_source);
  return jsonb_build_object('ok', true, 'status', 'granted');
end;
$function$;

create or replace function public.grant_partner_supply_representation_consent(p_version text, p_hash text, p_locale text, p_source text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_cur public.privacy_consent_purposes;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select * into v_cur from public.privacy_consent_purposes
    where purpose = 'partner_supply_representation';
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
  insert into public.privacy_consent_events
    (user_id, purpose, action, consent_text_version, consent_text_hash, locale, source)
  values
    (v_uid, 'partner_supply_representation', 'granted', p_version, p_hash, p_locale, p_source);
  return jsonb_build_object('ok', true, 'status', 'granted');
end;
$function$;

create or replace function public.grant_employer_data_disclosure(p_version text, p_hash text, p_locale text, p_source text, p_recipient_organization_id uuid, p_context_type text, p_context_id uuid, p_selected_fields jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
$function$;

-- Grants re-asserted byte-for-byte with 20260711130000 (authenticated only; PUBLIC and anon
-- explicitly revoked) so the SECDEF hygiene guard sees the closure on this file too.
revoke all on function public.grant_profile_discoverability_consent(text, text, text, text) from public;
revoke all on function public.grant_profile_discoverability_consent(text, text, text, text) from anon;
grant execute on function public.grant_profile_discoverability_consent(text, text, text, text) to authenticated;

revoke all on function public.grant_partner_supply_representation_consent(text, text, text, text) from public;
revoke all on function public.grant_partner_supply_representation_consent(text, text, text, text) from anon;
grant execute on function public.grant_partner_supply_representation_consent(text, text, text, text) to authenticated;

revoke all on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) from public;
revoke all on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) from anon;
grant execute on function public.grant_employer_data_disclosure(text, text, text, text, uuid, text, uuid, jsonb) to authenticated;

commit;
