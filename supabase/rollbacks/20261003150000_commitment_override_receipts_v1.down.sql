-- Rollback 20261003150000: remove the override receipt writer and table.
-- GUARDED: refuses while any receipt exists - a receipt is evidence of a real
-- decision and must never be dropped silently. Archive first, then re-run.
do $$
begin
  if to_regclass('public.commitment_override_receipts') is not null
     and exists (select 1 from public.commitment_override_receipts) then
    raise exception 'commitment_override_receipts holds receipts; refusing to drop evidence';
  end if;
end $$;

drop function if exists public.record_commitment_override_v1(uuid, uuid, jsonb, text);
drop table if exists public.commitment_override_receipts;
drop function if exists public.commitment_override_receipts_immutable_v1();
drop function if exists public.commitment_override_receipts_no_truncate_v1();
