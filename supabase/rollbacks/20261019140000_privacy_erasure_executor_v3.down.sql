-- ROLLBACK for 20261019140000_privacy_erasure_executor_v3.sql
--
-- Reverses the executor, the token table, both registries and the sentinel.
-- EVIDENCE IS NEVER DESTROYED: receipts, severed rows and pseudonymised ledger
-- rows are kept. If any erasure has run (a receipt exists, or any row points
-- at the sentinel), the whole rollback is refused in its single transaction
-- and nothing changes: the executor code may then only be removed by a
-- reviewed follow-up that leaves receipts and the sentinel in place.
-- Idempotent on a clean database.

begin;

drop function if exists public.privacy_erasure_notice_result_v1(uuid, boolean, text, text);
drop function if exists public.privacy_erasure_notices_due_v1(int);
drop function if exists public.privacy_erasure_notice_release_v1(uuid);
drop function if exists public.privacy_erasure_notice_hold_v1(uuid, text);
drop function if exists public.privacy_erasure_mark_v1(uuid, text, text);
drop function if exists public.privacy_erasure_due_v1(int);
drop function if exists public.privacy_confirm_account_deletion_v1();
drop function if exists public.erase_user_account_v3(uuid, text, uuid);
drop function if exists public.privacy_erasure_authorize_v3(uuid, uuid, jsonb, interval);
drop function if exists public.privacy_erasure_state_fingerprint_v3(uuid);
drop function if exists public.privacy_erasure_plan_v3(uuid, jsonb);
drop function if exists public.privacy_erasure_storage_scan_v3(uuid, uuid);

drop table if exists public.privacy_erasure_authorizations_v3;
drop table if exists public.privacy_erasure_value_rules_v3;
drop table if exists public.privacy_erasure_registry_v3;

do $$
declare
  v_receipts bigint;
  v_refs bigint := 0;
  v_n bigint;
  r record;
begin
  select count(*) into v_receipts from public.privacy_erasure_receipts_v3;
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col,
           case c.confrelid when 'public.profiles'::regclass then public.privacy_erasure_sentinel_profile_id()
                            else public.privacy_erasure_sentinel_worker_id() end as sentinel
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'public.workers'::regclass)
       and c.conrelid not in ('public.workers'::regclass)
  loop
    execute format('select count(*) from %s where %I = $1', r.tbl, r.col) into v_n using r.sentinel;
    v_refs := v_refs + v_n;
  end loop;

  if v_receipts > 0 or v_refs > 0 then
    raise exception 'rollback refused (single transaction, nothing changed): % receipt(s) and % severed row(s) reference the sentinel; evidence is kept. Remove the executor with a reviewed follow-up that leaves receipts and the sentinel in place.', v_receipts, v_refs;
  end if;

  -- clean database: no erasure ran, so no notice or confirmation is evidence of one
  drop table if exists public.privacy_erasure_notices_v1;
  drop table if exists public.privacy_erasure_confirmations_v1;
  -- clean database: remove receipts, the sentinel worker/profile/auth user
  drop trigger if exists privacy_erasure_receipts_v3_append_only on public.privacy_erasure_receipts_v3;
  drop table if exists public.privacy_erasure_receipts_v3;
  drop function if exists public.privacy_erasure_receipts_v3_guard();
  delete from public.workers where id = public.privacy_erasure_sentinel_worker_id();
  delete from public.profiles where id = public.privacy_erasure_sentinel_profile_id();
  delete from auth.users where id = public.privacy_erasure_sentinel_profile_id();
end $$;

-- ledger detach columns: dropped only when no row was ever detached
do $$
begin
  if (select count(*) from public.privacy_consent_events where erased_subject_id is not null) = 0 then
    alter table public.privacy_consent_events drop constraint if exists pce_subject_attached_or_detached;
    alter table public.privacy_consent_events alter column user_id set not null;
    alter table public.privacy_consent_events drop column if exists erased_subject_id;
    alter table public.privacy_consent_events drop column if exists erased_at;
  end if;
  if (select count(*) from public.personal_data_disclosures where erased_subject_id is not null) = 0 then
    alter table public.personal_data_disclosures drop constraint if exists pdd_subject_attached_or_detached;
    alter table public.personal_data_disclosures alter column worker_user_id set not null;
    alter table public.personal_data_disclosures drop column if exists erased_subject_id;
    alter table public.personal_data_disclosures drop column if exists erased_at;
  end if;
end $$;

drop function if exists public.privacy_erasure_is_sentinel(uuid);
drop function if exists public.privacy_erasure_sentinel_worker_id();
drop function if exists public.privacy_erasure_sentinel_profile_id();

commit;
