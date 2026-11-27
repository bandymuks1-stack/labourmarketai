-- OWNER-RUN in the Supabase SQL editor, AFTER a `prod-qa-walk` run with spec=need-intake
-- (function register 4.8). Deletes the synthetic public need(s) that walk stored. The walk's
-- own clean-up step can only set them to `rejected`: service_role holds SELECT and
-- UPDATE (status) on public.company_need_public_intakes and no DELETE, by design.
-- Touches NOTHING else. Any guard failure raises, the transaction aborts and the final
-- COMMIT becomes a ROLLBACK — nothing changes.
--
--   G1  every row with the walk's address shape (qa.synthetic.need.<run>.<attempt>@example.invalid)
--       is marked QA-SYNTHETIC in its company name AND its description
--   G2  every such row is already `rejected` (the walk's clean-up step ran)
--   G3  at most 5 rows are deleted (one per walk; more means something else wrote them)
--   G4  afterwards no row with that address shape is left
-- The table has no child rows and no trigger (migration 20260707120000).

begin;

do $$
declare
  c_shape constant text := '^qa\.synthetic\.need\.[a-z0-9]+\.[a-z0-9]+@example\.invalid$';
  v_all int;
  v_bad int;
  v_del int;
begin
  select count(*) into v_all from public.company_need_public_intakes where lower(contact_email) ~ c_shape;

  select count(*) into v_bad from public.company_need_public_intakes
   where lower(contact_email) ~ c_shape
     and (company_name not like 'QA-SYNTHETIC%' or description not like 'QA-SYNTHETIC%');
  if v_bad > 0 then
    raise exception 'G1 ABORT: % row(s) with the synthetic address are not marked QA-SYNTHETIC', v_bad;
  end if;

  select count(*) into v_bad from public.company_need_public_intakes
   where lower(contact_email) ~ c_shape and status <> 'rejected';
  if v_bad > 0 then
    raise exception 'G2 ABORT: % synthetic row(s) are not rejected yet', v_bad;
  end if;

  if v_all > 5 then
    raise exception 'G3 ABORT: % synthetic rows match (expected at most 5)', v_all;
  end if;

  delete from public.company_need_public_intakes where lower(contact_email) ~ c_shape;
  get diagnostics v_del = row_count;

  if exists (select 1 from public.company_need_public_intakes where lower(contact_email) ~ c_shape) then
    raise exception 'G4 ABORT: a synthetic need survived';
  end if;

  raise notice 'DELETED % synthetic public need(s)', v_del;
end $$;

commit;
