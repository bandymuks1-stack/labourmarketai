-- Rollback for 20260915120000_commitment_override_receipts_v1.sql
--
-- READ BEFORE APPLYING. A receipt is EVIDENCE that a manager knowingly
-- accepted a calendar clash for a real person. Dropping the table destroys
-- that evidence for both parties. The drop is therefore guarded: it refuses
-- while any receipt exists, and a deliberate teardown must first decide,
-- and record elsewhere, that losing those receipts is acceptable.
--
-- ONE TRANSACTION, load-bearing (see the saved-searches rollback for the
-- measured reason: an unwrapped guard prints its refusal and the drops run
-- anyway).
begin;

do $$
declare n integer;
begin
  if to_regclass('public.commitment_override_receipts') is not null then
    select count(*) into n from public.commitment_override_receipts;
    if n > 0 then
      raise exception
        'commitment_override_receipts still holds % receipt(s) — this is evidence; decide deliberately before rolling back', n;
    end if;
  end if;
end $$;

drop function if exists public.record_commitment_override_v1(uuid, uuid, jsonb, text);
drop trigger if exists commitment_override_receipts_immutable on public.commitment_override_receipts;
drop function if exists public.commitment_override_receipts_immutable();
drop policy if exists commitment_override_receipts_select on public.commitment_override_receipts;
drop index if exists public.commitment_override_receipts_project_worker_idx;
drop index if exists public.commitment_override_receipts_worker_idx;
drop table if exists public.commitment_override_receipts;

commit;
