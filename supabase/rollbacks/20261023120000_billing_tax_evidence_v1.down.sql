-- DOWN for 20261023120000_billing_tax_evidence_v1.sql
-- Tax evidence is an accounting record: the rollback REFUSES while the table
-- holds rows (archive them first — nothing is dropped silently). Apply ONLY via
-- Supabase MCP apply_migration after human approval; never `db push`.
-- Switch BILLING_STRIPE_TAX_ENABLED off before applying (the webhook then
-- writes nothing here).
begin;
do $$
declare n bigint;
begin
  if to_regclass('public.billing_tax_evidence') is not null then
    execute 'select count(*) from public.billing_tax_evidence' into n;
    if n > 0 then
      raise exception 'ROLLBACK REFUSED: billing_tax_evidence holds % row(s) - archive them first', n;
    end if;
  end if;
  if to_regclass('public.privacy_erasure_registry_v3') is not null then
    delete from public.privacy_erasure_registry_v3
     where schema_name = 'public' and table_name = 'billing_tax_evidence'
       and column_name in ('owner_id', 'reviewed_by');
  end if;
end $$;
drop policy if exists billing_tax_evidence_select on public.billing_tax_evidence;
drop index if exists public.billing_tax_evidence_customer_idx;
drop index if exists public.billing_tax_evidence_org_idx;
drop index if exists public.billing_tax_evidence_review_idx;
drop index if exists public.billing_tax_evidence_object_uidx;
drop table if exists public.billing_tax_evidence;
commit;
