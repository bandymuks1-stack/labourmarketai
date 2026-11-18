-- =====================================================================
-- Verification harness for 20261018160000_worker_identity_split_v1.sql
--
-- Run it TWICE and keep BOTH results (privately — never paste the output into a public PR):
--   * BEFORE the apply — PART A proofs 1-6 must FAIL (the defect being reproduced);
--   * AFTER the apply  — ALL proofs must PASS.
--
-- PART A is ONE self-contained statement (runs through Supabase MCP `execute_sql`).
-- PART B needs a session-capable client (`psql -f`) and the APPLIED migration (it calls the new
-- predicate): it emulates every employer account inside a transaction that is ROLLED BACK, and reports
-- COUNTS only — never a name or an id.
--
-- The product rule it proves (owner, 2026-10-18): an employer may find, shortlist, make an offer to and
-- talk with a worker anonymously; the worker's identity reaches that organization only through a
-- working relationship or the worker's own per-organization permission. No plan changes that.
-- =====================================================================

-- ---------------------------------------------------------------- PART A
with
p1 as (select coalesce(bool_and(qual like '%caller_has_worker_relation_v1%'), false) ok
         from pg_policies where schemaname = 'public' and tablename = 'workers' and policyname = 'workers_select'),
p2 as (select coalesce((select pg_get_function_result(p.oid) !~* '(display_name|headline|\mbio\M|availability_note|profile_id|created_at|updated_at)'
                          from pg_proc p where p.pronamespace = 'public'::regnamespace
                           and p.proname = 'list_discoverable_worker_profiles_v1'), false) ok),
p3 as (select coalesce((select pg_get_functiondef(p.oid) ~ 'not in \(''scouting'', ''demand_interest''\)'
                               and pg_get_functiondef(p.oid) ~ 'caller_has_worker_relation_v1'
                               and position('''full_name''' in pg_get_functiondef(p.oid)) > 0
                          from pg_proc p where p.pronamespace = 'public'::regnamespace
                           and p.proname = 'conversation_counterpart_identities'), false) ok),
p4 as (select count(*) = 7 ok from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('caller_has_worker_relation_v1','list_discoverable_worker_profiles_v1',
                            'list_discoverable_worker_ids_v1','conversation_counterpart_identities',
                            'candidate_profile_for_contact_v1','my_direct_conversations_with_workers_v1',
                            'employer_disclosure_granted_v1')
          and not has_function_privilege('anon', p.oid, 'execute')
          and has_function_privilege('authenticated', p.oid, 'execute')),
p5 as (select coalesce((select pg_get_functiondef(p.oid) !~ 'worker_profile_discoverable'
                               and pg_get_functiondef(p.oid) ~ 'demand_shortlist'
                               and pg_get_functiondef(p.oid) ~ 'can_view_worker'
                          from pg_proc p where p.pronamespace = 'public'::regnamespace
                           and p.proname = 'candidate_profile_for_contact_v1'), false) ok),
p6 as (select coalesce((select pg_get_functiondef(p.oid) !~ 'worker_profile_discoverable|is_employer\(\)'
                          from pg_proc p where p.pronamespace = 'public'::regnamespace
                           and p.proname = 'caller_has_worker_relation_v1'), false) ok),
p7 as (select coalesce((select pg_get_functiondef(p.oid) ~ 'worker_profile_discoverable'
                          from pg_proc p where p.pronamespace = 'public'::regnamespace
                           and p.proname = 'can_view_worker'), false) ok)
select 'PROOF 1 workers_select needs a working relationship' proof, (select ok from p1) pass
union all select 'PROOF 2 discovery projection returns no identity / profile id / exact time', (select ok from p2)
union all select 'PROOF 3 candidate threads: the candidate is named by relationship or own grant only', (select ok from p3)
union all select 'PROOF 4 the 7 functions: authenticated yes, anon no', (select ok from p4)
union all select 'PROOF 5 the contact door needs the caller''s own demand, a shortlist / interest and visibility', (select ok from p5)
union all select 'PROOF 6 the relationship predicate has no discoverability branch', (select ok from p6)
union all select 'PROOF 7 can_view_worker itself is unchanged (still serves skills / professions)', (select ok from p7);

-- ---------------------------------------------------------------- PART B (psql -f; rolled back)
begin;
create temp table _proof(name text, value bigint) on commit drop;
create temp table _names(viewer uuid, conversation_id uuid, display_name text) on commit drop;
grant insert, select on _names to authenticated;
do $$
declare e record; x record; n bigint := 0; related_rows bigint := 0; unrelated_rows bigint := 0;
        anon_names bigint := 0; named bigint := 0; projected_identity bigint := 0;
begin
  for e in select p.id from public.profiles p
            where p.active_role in ('company','agency')
              and (exists (select 1 from public.engagement_contexts ec where ec.profile_id = p.id and ec.status = 'active'
                            and ec.relationship_slug in ('manager','owner','external_manager'))
                   or exists (select 1 from public.company_memberships m where m.profile_id = p.id and m.status = 'active'
                            and m.role in ('owner','admin','manager','external_manager'))) loop
    perform set_config('request.jwt.claims', json_build_object('sub', e.id, 'role', 'authenticated')::text, true);
    for x in select w.id, w.profile_id from public.workers w loop
      execute 'set local role authenticated';
      select count(*) into n from public.workers where id = x.id;
      execute 'reset role';
      if public.caller_has_worker_relation_v1(x.id) then
        related_rows := related_rows + n;
      else
        unrelated_rows := unrelated_rows + n;          -- PROOF B1: must stay 0
      end if;
    end loop;
    -- PROOF B2: the names this employer RECEIVES (collected under its own role) …
    execute 'set local role authenticated';
    insert into _names
      select e.id, i.conversation_id, i.display_name
        from public.conversation_counterpart_identities(
               array(select cp.conversation_id from public.conversation_participants cp where cp.profile_id = e.id)) i;
    execute 'reset role';
    -- … judged with full visibility: in a candidate thread, a candidate without relationship or grant.
    select count(*) filter (where n.display_name like 'Candidate %'), count(*) filter (where n.display_name not like 'Candidate %')
      into anon_names, named
      from _names n
      join public.conversations c on c.id = n.conversation_id
      join public.conversation_participants op on op.conversation_id = n.conversation_id and op.profile_id <> e.id
      join public.workers w on w.profile_id = op.profile_id
     where n.viewer = e.id
       and c.source_type in ('scouting', 'demand_interest')
       and (exists (select 1 from public.demand_interest_signals i where i.request_id = c.source_id and i.worker_id = w.id)
            or exists (select 1 from public.demand_shortlist s where s.request_id = c.source_id and s.worker_id = w.id))
       and not public.caller_has_worker_relation_v1(w.id)
       and not exists (select 1 from public.privacy_consent_events ev where ev.user_id = op.profile_id
                        and ev.purpose = 'employer_data_disclosure' and ev.selected_fields ? 'full_name');
    insert into _proof values ('B2 unrelated threads named without a grant (must be 0)', named),
                              ('B2 unrelated threads shown anonymously', anon_names);
  end loop;
  insert into _proof values ('B1 rows of UNRELATED workers visible to employers (must be 0)', unrelated_rows),
                            ('B1 rows of related workers visible (compare with the pre-apply baseline)', related_rows);
end $$;
select name, sum(value) from _proof group by name order by name;
rollback;
