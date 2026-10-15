-- ROLLBACK for 20261015150000_privacy_consent_erasure_detach_v1.sql
--
-- Removes the erasure RPC and restores the unconditional append-only trigger.
-- The column/constraint changes are reverted ONLY when no row was ever
-- detached: a detached row has no user_id and cannot be re-attached (that
-- would re-identify an erased person), so with detached rows present the
-- columns stay and only the code is rolled back.

begin;

drop function if exists public.erase_user_account_v1(uuid);

create or replace function public.privacy_ledger_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'privacy ledger is append-only: % on % is not allowed', tg_op, tg_table_name
    using errcode = 'raise_exception';
end;
$$;

do $$
begin
  if exists (select 1 from public.privacy_consent_events where user_id is null) then
    raise notice 'detached consent rows exist: columns kept, code rolled back';
  else
    alter table public.privacy_consent_events drop constraint if exists pce_subject_attached_or_detached;
    alter table public.privacy_consent_events alter column user_id set not null;
    alter table public.privacy_consent_events drop column if exists erased_subject_id;
    alter table public.privacy_consent_events drop column if exists erased_at;
  end if;
end;
$$;

commit;
