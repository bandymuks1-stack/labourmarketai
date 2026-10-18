-- 20261018130000_external_profile_disclosure_v1
-- @human-gate-approved
--
-- RED (needs-human-gate): SECURITY DEFINER functions, GRANT, a consent-text re-pin, a CHECK widening.
-- Apply ONLY via Supabase MCP `apply_migration` after the owner's explicit approval, in the SAME
-- step as the production deploy of the app change (consent v3 registry). Never `db push`.
--
-- OWNER COMMAND 2026-10-18: "#2472 is temporary. Do not apply #2471 by itself. Prepare a unified
-- sharing feature inside the existing consent system (API, RLS, UI, consent versioning, revocation,
-- security tests)." This file SUPERSEDES the earlier single-RPC draft of #2471 (never applied).
--
-- WHAT THE FEATURE IS
--   A worker's external profile links (LinkedIn, GitHub, portfolio, ...) never reach an employer
--   through discovery. They can reach ONE organization, for ONE need, only when the worker:
--     1. marks the link "may be shared" (`visibility = 'employers'`, set_external_profile_visibility_v1);
--     2. accepts that organization's contact request; and
--     3. separately grants the per-organization disclosure with the `external_profiles` field
--        (grant_employer_data_disclosure, append-only consent ledger, consent text v3).
--   The organization then reads ONLY those links through list_disclosed_external_profiles_v1, which
--   re-checks the ledger on every read. Withdrawing the grant, marking the link private again or
--   disconnecting it removes access immediately — nothing is copied to the employer side.
--
-- WHAT DOES NOT CHANGE
--   - worker_external_profiles RLS stays owner/admin-only (no employer policy, no grant change).
--   - profile_discoverability (anonymous discovery) never reads this table.
--   - VIP or paid plans have no branch here: only the worker's own grant opens access.
--
-- EFFECT ON EXISTING GRANTS (production read 2026-10-18 before authoring): employer_data_disclosure
-- has 0 consent events and 0 contact requests, so the version bump invalidates nothing.
--
-- Rollback: supabase/rollbacks/20261018130000_external_profile_disclosure_v1.down.sql

begin;

-- 1. The worker's per-link choice: may this link be offered in a disclosure? (from #2471, unchanged)
create or replace function public.set_external_profile_visibility_v1(
  p_profile_id uuid,
  p_visibility text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_visibility is null or p_visibility not in ('private', 'employers') then
    raise exception 'Invalid visibility' using errcode = '22023';
  end if;

  update public.worker_external_profiles ep
     set visibility = p_visibility,
         updated_at = now()
    from public.workers w
   where ep.id = p_profile_id
     and ep.worker_id = w.id
     and w.profile_id = uid
     and ep.disconnected_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'External profile not found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;
revoke all on function public.set_external_profile_visibility_v1(uuid, text) from public;
revoke all on function public.set_external_profile_visibility_v1(uuid, text) from anon;
grant execute on function public.set_external_profile_visibility_v1(uuid, text) to authenticated;

-- 2. The consent ledger's closed field whitelist gains `external_profiles` (1..8 fields).
--    Body identical to the applied function except the whitelist and the count bound.
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
  if v_count < 1 or v_count > 8
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_selected_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_selected_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_selected_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation',
                       'external_profiles')
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

-- 3. The employer's ask uses the SAME closed whitelist (the shared contract keeps the two equal).
--    Body identical to the applied function except the whitelist and the count bound.
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
  if v_count < 1 or v_count > 8
    or v_count <> (select count(distinct t) from jsonb_array_elements_text(p_requested_fields) t)
  then
    return jsonb_build_object('ok', false, 'error', 'invalid_requested_fields');
  end if;
  for v_field in select t from jsonb_array_elements_text(p_requested_fields) t loop
    if v_field not in ('full_name', 'phone', 'email', 'cv_document',
                       'preferred_locations', 'availability_details', 'salary_expectation',
                       'external_profiles')
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

-- 4. The admin delivery ledger can record all eight categories (widening only; 0 rows today).
alter table public.personal_data_disclosures
  drop constraint if exists personal_data_disclosures_data_categories_check;
alter table public.personal_data_disclosures
  add constraint personal_data_disclosures_data_categories_check
  check (cardinality(data_categories) >= 1 and cardinality(data_categories) <= 8);

-- 5. Consent text v3 (the wording names the new field). Pins EXACTLY consentTextHash() of
--    EMPLOYER_DATA_DISCLOSURE_V1 @ 2026-10-18.v3 in apps/web/lib/privacy/consent-definitions.ts.
--    Guarded on the previous version so a re-run or an unexpected state changes nothing.
update public.privacy_consent_purposes
   set current_version   = '2026-10-18.v3',
       current_text_hash = '20a9156662998bd93797e9dfae811ac8acfbfeabb84eb68ecf135eb29130eefa',
       updated_at        = now()
 where purpose = 'employer_data_disclosure'
   and current_version = '2026-07-11.v2';

-- 6. The ONLY employer read of external profile links: re-checks the ledger on every read.
create or replace function public.list_disclosed_external_profiles_v1(
  p_worker_id uuid,
  p_organization_id uuid,
  p_request_id uuid
)
returns table (id uuid, platform text, url text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_profile uuid;
  v_latest public.privacy_consent_events;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_worker_id is null or p_organization_id is null or p_request_id is null then
    return;
  end if;
  -- The caller must act for the recipient organization named in the grant.
  if not exists (
    select 1 from public.organizations o
     where o.id = p_organization_id
       and (o.owner_profile_id = uid or public.manages_organization(o.id))
  ) then
    return;
  end if;
  select w.profile_id into v_profile from public.workers w where w.id = p_worker_id;
  if v_profile is null then
    return;
  end if;
  -- Latest-wins, exactly like has_employer_data_disclosure: a later withdrawal closes access.
  select e.* into v_latest
    from public.privacy_consent_events e
   where e.user_id = v_profile
     and e.purpose = 'employer_data_disclosure'
     and e.recipient_organization_id = p_organization_id
     and e.context_type = 'company_need'
     and e.context_id = p_request_id
   order by e.created_at desc, e.seq desc
   limit 1;
  if v_latest.id is null
     or v_latest.action <> 'granted'
     or v_latest.consent_text_version is distinct from
        (select p.current_version from public.privacy_consent_purposes p
          where p.purpose = 'employer_data_disclosure')
     or not (v_latest.selected_fields ? 'external_profiles')
  then
    return;
  end if;
  return query
    select ep.id, ep.platform, ep.url
      from public.worker_external_profiles ep
     where ep.worker_id = p_worker_id
       and ep.visibility = 'employers'
       and ep.disconnected_at is null
     order by ep.connected_at, ep.id;
end;
$$;
revoke all on function public.list_disclosed_external_profiles_v1(uuid, uuid, uuid) from public;
revoke all on function public.list_disclosed_external_profiles_v1(uuid, uuid, uuid) from anon;
grant execute on function public.list_disclosed_external_profiles_v1(uuid, uuid, uuid) to authenticated;

commit;
