-- OWNER-RUN in the Supabase SQL editor, AFTER `prod-qa-invited-provision revoke-invited`.
-- Deletes the synthetic invited worker `qa.invited+act1@labourmarket.ai` and every row of
-- its walk. Touches NOTHING else. Any guard failure raises, the transaction aborts and the
-- final COMMIT becomes a ROLLBACK — nothing changes.
--
--   G1  exactly ONE auth user with that address AND app_metadata.qa_synthetic = true
--   G2  the only invitations deleted are addressed to it AND carry the synthetic reference
--       (QA-SYNTHETIC-invited-act1); no other invitation names the account
--   G3  afterwards: no auth user, profile, worker, role, journal row, acceptance or
--       synthetic invitation is left for it
-- Order matters: invitations FIRST (`invitations.accepted_by_profile_id` is NO ACTION and
-- would block the profile delete; its acceptances go by CASCADE), then the auth user
-- (profiles -> workers -> journal entries, roles, consents, engagements go by CASCADE).

begin;

do $$
declare
  c_email constant text := 'qa.invited+act1@labourmarket.ai';
  c_ref   constant text := 'QA-SYNTHETIC-invited-act1';
  v_uid uuid;
  v_n int;
  v_other int;
  v_inv int;
begin
  select count(*), min(id::text)::uuid into v_n, v_uid
    from auth.users
   where lower(email) = c_email and coalesce(raw_app_meta_data->>'qa_synthetic', '') = 'true';
  if v_n <> 1 then
    raise exception 'G1 ABORT: % synthetic accounts match (expected exactly 1)', v_n;
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

  delete from auth.users where id = v_uid;

  if exists (select 1 from auth.users where id = v_uid)
     or exists (select 1 from public.profiles where id = v_uid)
     or exists (select 1 from public.workers where profile_id = v_uid)
     or exists (select 1 from public.profile_roles where profile_id = v_uid)
     or exists (select 1 from public.invitation_acceptances where profile_id = v_uid)
     or exists (select 1 from public.invitations where external_reference = c_ref) then
    raise exception 'G3 ABORT: rows of the synthetic account survived';
  end if;

  raise notice 'PURGED synthetic invited worker id=% (invitations deleted=%)', left(v_uid::text, 8), v_inv;
end $$;

commit;
