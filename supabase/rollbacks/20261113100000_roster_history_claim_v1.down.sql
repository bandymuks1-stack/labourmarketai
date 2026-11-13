-- ============================================================================
-- ROLLBACK for 20261113100000_roster_history_claim_v1.sql
--
-- REFUSES while any claim row exists: a claim is part of the record of who was
-- offered whose history, who came and who decided. Dropping the table would
-- delete that trail. To roll back deliberately, the rows must be dealt with
-- first, by the owner, as a separate decision.
--
-- It touches NO roster row and NO history record: a link made through a claim
-- and confirmed by the person is an ordinary confirmed roster link and stays
-- (it can be reversed by the person or, before this rollback, by the
-- organization). ONE transaction: when the guard refuses, nothing below runs.
-- Apply via Supabase MCP apply_migration, never `db push`.
-- ============================================================================

begin;

do $$
declare
  n bigint;
begin
  select count(*) into n from public.organization_person_history_claims;
  if n > 0 then
    raise exception
      'ROLLBACK REFUSED: % history claim(s) exist; dropping the table would delete the trail of who was offered, who redeemed and who decided.', n;
  end if;
end $$;

do $$
begin
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where table_name = 'organization_person_history_claims';
  end if;
end $$;

drop function if exists public.unlink_roster_person_v1(uuid, text);
drop function if exists public.revoke_roster_history_claim_v1(uuid);
drop function if exists public.decide_roster_history_claim_v1(uuid, text, text);
drop function if exists public.list_roster_history_claims_v1(uuid);
drop function if exists public.redeem_roster_history_claim_v1(text);
drop function if exists public.get_roster_history_claim_preview_v1(text);
drop function if exists public.create_roster_history_claim_v1(uuid, text);

drop policy if exists organization_person_history_claims_select on public.organization_person_history_claims;
drop index if exists public.organization_person_history_claims_one_live_uq;
drop table if exists public.organization_person_history_claims;

commit;
