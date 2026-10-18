-- @human-gate-approved
-- Rollback for 20260904120000_first_party_supply_representation_v1.sql
--
-- Reversible in full. The one thing this does NOT undo is the append-only
-- consent ledger: `privacy_consent_events` rows for
-- `partner_supply_representation` are immutable by trigger and are legal
-- evidence of what a person agreed to and when. Deleting them to make a
-- rollback tidy would destroy the record that proves the consent existed, so
-- the purpose row is removed only when nothing references it, and otherwise
-- left in place with its events intact.
--
-- Order matters: functions that reference the table go before the table.

drop function if exists public.first_party_supply_feed_v1();
drop function if exists public.first_party_supply_trades(uuid);
drop function if exists public.my_first_party_supply_declaration();
drop function if exists public.withdraw_my_first_party_supply_declaration();
drop function if exists public.reconfirm_my_first_party_supply_declaration(integer);
drop function if exists public.upsert_my_first_party_supply_declaration(
  text, date, text[], text[], text[], boolean, boolean, boolean, integer
);
drop function if exists public.current_partner_supply_representation_consent();
drop function if exists public.withdraw_partner_supply_representation_consent(text);
drop function if exists public.grant_partner_supply_representation_consent(text, text, text, text);
drop function if exists public.partner_supply_representation_authorised(uuid);
drop function if exists public.first_party_supply_freshness(timestamptz, timestamptz, timestamptz);

-- Zero-row assertion before the table drop: a declaration is a person's stated
-- consent scope, and dropping one that exists silently revokes something they
-- said. If any row is present the rollback STOPS and a human decides.
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.first_party_supply_declarations;
  if v_rows > 0 then
    raise exception
      'first_party_supply_declarations holds % row(s): refusing to drop. Withdraw them through withdraw_my_first_party_supply_declaration() and export the rows before re-running this rollback.',
      v_rows;
  end if;
end;
$$;

drop table if exists public.first_party_supply_declarations;

-- Remove the seeded purpose ONLY when no consent event references it. A
-- referenced purpose row stays: the ledger's foreign key is what makes the
-- historical events readable.
delete from public.privacy_consent_purposes p
where p.purpose = 'partner_supply_representation'
  and not exists (
    select 1 from public.privacy_consent_events e
    where e.purpose = 'partner_supply_representation'
  );

-- Recreate path: re-run
-- supabase/migrations/20260904120000_first_party_supply_representation_v1.sql
-- verbatim. It is idempotent (create table if not exists, create or replace
-- function, insert ... on conflict do nothing).
