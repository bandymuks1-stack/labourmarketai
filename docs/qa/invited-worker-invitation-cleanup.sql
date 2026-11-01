-- OWNER-RUN in the Supabase SQL editor, AFTER the erasure runner has removed the synthetic
-- invited worker (the walk's I-6 / clean-up requested and confirmed it).
-- Erasure keeps an invitation addressed to an erased person (address pseudonymised,
-- accepted_by_profile_id nulled) so the inviter keeps the fact that an invitation existed.
-- For the ONE synthetic partner referral that fact is test data: this deletes exactly that
-- row and touches NOTHING else. Any guard failure raises and the transaction rolls back.
--
--   G1  the synthetic account no longer exists (erasure finished)
--   G2  exactly ONE invitation carries the synthetic reference, it is a join_platform
--       invitation, nobody holds it (accepted_by_profile_id is null) and its address is
--       no longer the synthetic one (erasure pseudonymised it)
--   G3  afterwards no invitation carries the synthetic reference
-- Then run docs/qa/invited-worker-orphans.sql: every count must be 0.

begin;

do $$
declare
  c_email constant text := 'qa.invited+act1@labourmarket.ai';
  c_ref   constant text := 'QA-SYNTHETIC-invited-act1';
  v_n int;
begin
  if exists (select 1 from auth.users where lower(email) = c_email) then
    raise exception 'G1 ABORT: the synthetic account still exists — wait for the erasure runner';
  end if;

  select count(*) into v_n from public.invitations
   where external_reference = c_ref
     and invitation_type = 'join_platform'
     and accepted_by_profile_id is null
     and lower(coalesce(invited_email, '')) <> c_email;
  if v_n <> 1 or (select count(*) from public.invitations where external_reference = c_ref) <> 1 then
    raise exception 'G2 ABORT: expected exactly one erased synthetic invitation, found % matching', v_n;
  end if;

  delete from public.invitations where external_reference = c_ref;

  if exists (select 1 from public.invitations where external_reference = c_ref) then
    raise exception 'G3 ABORT: the synthetic invitation survived';
  end if;
  raise notice 'synthetic invitation removed';
end $$;

commit;
