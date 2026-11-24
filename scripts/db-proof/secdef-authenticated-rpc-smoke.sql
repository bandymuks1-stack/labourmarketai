\set ON_ERROR_STOP on
-- ---- Phase 1: fixtures as postgres (local disposable DB only) ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values ('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','secdef-smoke-worker@example.test','x',
        now(),'{"provider":"email"}','{}',now(),now())
on conflict (id) do nothing;

-- ---- Phase 2: execute as the `authenticated` ROLE with JWT claims ------
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","email":"secdef-smoke-worker@example.test"}',
  true);

do $$
declare
  calls text[] := array[
    -- domain                          :: call
    'worker-profile-read   :: select * from public.owns_worker(gen_random_uuid())',
    'worker-profile-write  :: select * from public.save_worker_card(null::text,null::date,null::text,null::text[],null::int,null::int)',
    'cv-read               :: select * from public.list_open_demand_for_workers()',
    'cv-write              :: select * from public.save_self_declared_work_history_v1(null::text,null::text,null::date,null::date)',
    'journal-read          :: select * from public.reviewable_journal_entry_ids()',
    'journal-review        :: select * from public.review_journal_entry(gen_random_uuid(),''confirmed'',null)',
    'booking-propose       :: select * from public.propose_booking_request_v3(gen_random_uuid(),gen_random_uuid(),null::text,null::text,null::text,null::text,null::text)',
    'booking-respond       :: select * from public.respond_booking_request_v3(gen_random_uuid(),''accepted'',null,null)',
    'employer-demand-draft :: select * from public.save_demand_draft(null::text,null::text,null::jsonb,null::text)',
    'employer-team-enquiry :: select * from public.list_my_team_enquiries_v1()',
    'privacy-request       :: select * from public.submit_privacy_request_v1(''export'',null)',
    'privacy-consent-read  :: select * from public.current_profile_discoverability_consent()',
    'admin-rpc             :: select * from public.admin_privacy_readiness_counts()',
    'admin-helper          :: select * from public.is_admin()',
    'communication-contact :: select * from public.contact_demand_owner_v1(gen_random_uuid())',
    'communication-source  :: select * from public.conversation_source_context(array[gen_random_uuid()])',
    'agency-bridge-create  :: select * from public.create_agency_client_connection_v1(gen_random_uuid(),''a@b.test'')',
    'agency-bridge-list    :: select * from public.list_shared_requests_for_agency_v1()',
    'agency-offer-progress :: select * from public.list_agency_offer_progress_v1()',
    'helper-owns-company   :: select * from public.owns_company(gen_random_uuid())',
    'helper-is-employer    :: select * from public.is_employer()',
    'helper-manages-org    :: select * from public.manages_organization(gen_random_uuid())',
    'helper-can-access     :: select * from public.can_access_match(gen_random_uuid())',
    'helper-owns-agency    :: select * from public.owns_agency(gen_random_uuid())',
    'helper-profile-role   :: select * from public.profile_role()'
  ];
  item text; label text; stmt text; denied int := 0; ran int := 0;
begin
  foreach item in array calls loop
    label := btrim(split_part(item, '::', 1));
    stmt  := btrim(substr(item, position('::' in item) + 2));
    ran := ran + 1;
    begin
      execute stmt;
      raise notice 'EXEC_OK   % (no error)', label;
    exception
      when others then
        -- A MISSING EXECUTE GRANT is 42501 with the postgres-generated message
        -- 'permission denied for function <name>'. A 42501 raised by the
        -- function BODY is an application authz decision and proves the
        -- EXECUTE grant was already satisfied. Discriminate on the message.
        if sqlstate = '42501' and sqlerrm like 'permission denied for function%' then
          denied := denied + 1;
          raise notice 'DENIED_GRANT % <<< EXECUTE PRIVILEGE MISSING (%)', label, sqlerrm;
        else
          raise notice 'EXEC_OK   % (in-body error % / %, EXECUTE passed)', label, sqlstate, left(sqlerrm,48);
        end if;
    end;
  end loop;
  raise notice '--- SMOKE SUMMARY: % calls, % permission-denied ---', ran, denied;
  if denied > 0 then
    raise exception 'SMOKE FAILED: % RPC(s) denied by EXECUTE privilege', denied;
  end if;
end $$;
rollback;
