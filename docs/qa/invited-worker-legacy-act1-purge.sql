-- LEGACY, ONE-OFF (owner D-4 result 2026-11-02): the first synthetic invited worker used the
-- plus address `qa.invited+act1@`, which the QA mailbox does not accept (550 user unknown), so it
-- can never pass the mailbox proof. It never reached the journal. This deletes exactly that
-- account and its one synthetic referral; the walk now uses `qa.invited@labourmarket.ai`.
-- Run once, then docs/qa/invited-worker-orphans.sql. Same guards as invited-worker-purge.sql.
-- OWNER-RUN in the Supabase SQL editor.
-- FALLBACK ONLY (2026-11-01): once the walk has recorded a Work Journal entry this script
-- aborts — journal entries are append-only evidence that only the sanctioned erasure path
-- may delete (journal_entries_evidence_guard_v1). The walk's own I-6 step requests and
-- confirms the account deletion so the system erasure runner removes the account; run this
-- script only for an account that never reached the journal. After the erasure runner,
-- docs/qa/invited-worker-invitation-cleanup.sql removes the one synthetic invitation that
-- erasure deliberately keeps (pseudonymised); then the orphans check.
-- Deletes the synthetic invited worker `qa.invited+act1@labourmarket.ai` and every row of
-- its walk. Touches NOTHING else. Any guard failure raises, the transaction aborts and the
-- final COMMIT becomes a ROLLBACK — nothing changes.
--
--   G1  exactly ONE auth user with that address AND app_metadata.qa_synthetic = true
--   G2  the only invitations deleted are addressed to it AND carry the synthetic reference
--       (QA-SYNTHETIC-invited-act1); no other invitation names the account
--   G3  afterwards: no auth user, profile, worker, role, journal row, acceptance or
--       synthetic invitation is left for it
--   G0  SCOPE (owner condition 2026-11-02: STOP if the scope differs): before anything is
--       deleted, every row that references the account, its profile or its worker through a
--       foreign key is counted. The whole set must be EXACTLY: 1 auth identity, 1 profile,
--       1 worker, 1 engagement context, 2 pilot events, and no row in any other table;
--       plus 1 synthetic invitation, 0 roles, 0 journal entries, 0 acceptances.
--       Measured read-only 2026-11-02. Anything else aborts and changes nothing.
-- Order matters: invitations FIRST (`invitations.accepted_by_profile_id` is NO ACTION and
-- would block the profile delete; its acceptances go by CASCADE), then the auth user
-- (profiles -> workers -> journal entries, roles, consents, engagements go by CASCADE).
-- `pilot_events.profile_id` is NO ACTION: the account's 2 analytics events (sign-in and
-- onboarding started, from the 2026-11-01 walk) are deleted by profile id before the account.

begin;

do $$
declare
  c_email constant text := 'qa.invited+act1@labourmarket.ai';
  c_ref   constant text := 'QA-SYNTHETIC-invited-act1';
  v_uid uuid;
  v_n int;
  v_other int;
  v_inv int;
  v_wid uuid;
  v_ev int;
  r record;
  v_cnt bigint;
  v_scope text := '';
begin
  select count(*), min(id::text)::uuid into v_n, v_uid
    from auth.users
   where lower(email) = c_email and coalesce(raw_app_meta_data->>'qa_synthetic', '') = 'true';
  if v_n <> 1 then
    raise exception 'G1 ABORT: % synthetic accounts match (expected exactly 1)', v_n;
  end if;

  -- G0: the exact dependency set, from the catalog (no table is assumed).
  select id into v_wid from public.workers where profile_id = v_uid;
  for r in
    select c.conrelid::regclass::text as tbl, a.attname as col, c.confrelid::regclass::text as ref
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
       and c.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass, 'public.workers'::regclass)
     order by 1, 2
  loop
    if r.ref = 'public.workers' and v_wid is null then continue; end if;
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col)
       into v_cnt using case when r.ref = 'public.workers' then v_wid else v_uid end;
    if v_cnt > 0 then v_scope := v_scope || format('%s.%s=%s;', r.tbl, r.col, v_cnt); end if;
  end loop;
  if v_scope <> 'auth.identities.user_id=1;engagement_contexts.profile_id=1;pilot_events.profile_id=2;profiles.id=1;workers.profile_id=1;' then
    raise exception 'G0 ABORT: dependency scope differs from the approved one: %', v_scope;
  end if;
  if (select count(*) from public.invitations where external_reference = c_ref) <> 1
     or exists (select 1 from public.profile_roles where profile_id = v_uid)
     or exists (select 1 from public.invitation_acceptances where profile_id = v_uid) then
    raise exception 'G0 ABORT: invitation / role / acceptance scope differs from the approved one';
  end if;

  select count(*) into v_other from public.invitations
   where (accepted_by_profile_id = v_uid or lower(invited_email) = c_email)
     and coalesce(external_reference, '') <> c_ref;
  if v_other > 0 then
    raise exception 'G2 ABORT: % non-synthetic invitation(s) name this account', v_other;
  end if;

  delete from public.invitations
   where lower(invited_email) = c_email and external_reference = c_ref;
  get diagnostics v_inv = row_count;

  delete from public.pilot_events where profile_id = v_uid;
  get diagnostics v_ev = row_count;

  delete from auth.users where id = v_uid;

  if exists (select 1 from auth.users where id = v_uid)
     or exists (select 1 from public.profiles where id = v_uid)
     or exists (select 1 from public.workers where profile_id = v_uid)
     or exists (select 1 from public.profile_roles where profile_id = v_uid)
     or exists (select 1 from public.invitation_acceptances where profile_id = v_uid)
     or exists (select 1 from public.engagement_contexts where profile_id = v_uid)
     or exists (select 1 from public.pilot_events where profile_id = v_uid)
     or exists (select 1 from auth.identities where user_id = v_uid)
     or exists (select 1 from public.invitations where external_reference = c_ref) then
    raise exception 'G3 ABORT: rows of the synthetic account survived';
  end if;

  raise notice 'PURGED synthetic invited worker id=% (invitations=%, pilot events=%)', left(v_uid::text, 8), v_inv, v_ev;
end $$;

commit;
