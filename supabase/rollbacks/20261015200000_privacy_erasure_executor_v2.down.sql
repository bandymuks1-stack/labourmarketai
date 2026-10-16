-- ROLLBACK for 20261015200000_privacy_erasure_executor_v2.sql
--
-- Removes the executor and the decision registry. Receipts and detached
-- consent rows are KEPT when any exist: a receipt is the proof that an erasure
-- happened, and a detached consent row cannot be re-attached without
-- re-identifying an erased person. With none present, everything reverts.

begin;

drop function if exists public.erase_user_account_v2(uuid, uuid, uuid, boolean);
drop table if exists public.privacy_erasure_treatments;

do $$
begin
  if exists (select 1 from public.privacy_erasure_receipts) then
    raise notice 'erasure receipts exist: privacy_erasure_receipts kept';
  else
    drop table public.privacy_erasure_receipts;
    drop function if exists public.privacy_erasure_receipts_guard();
  end if;

  if exists (select 1 from public.privacy_consent_events where user_id is null) then
    raise notice 'detached consent rows exist: columns kept';
  else
    alter table public.privacy_consent_events drop constraint if exists pce_subject_attached_or_detached;
    alter table public.privacy_consent_events alter column user_id set not null;
    alter table public.privacy_consent_events drop column if exists erased_subject_id;
    alter table public.privacy_consent_events drop column if exists erased_at;
  end if;
end;
$$;

commit;
