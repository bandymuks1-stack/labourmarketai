-- ============================================================================
-- ROLLBACK for 20260817220000_finance_invoice_upgrades_v1.sql
--
-- Restores the prior state exactly: drops ONLY the 4 new functions, the new
-- partial index and the 4 new additive nullable columns. The v1 RPCs
-- (create/update/set_finance_record_status_v1) were never touched by the up
-- migration, so nothing is recreated here. Data note: dropping the columns
-- discards any invoice_number / vat_amount_cents / org_document_id /
-- approval_status values entered while the up migration was live — that IS
-- the rollback semantics of an additive-column slice, stated honestly.
-- ============================================================================

begin;

drop function if exists public.sync_finance_record_approval_v1(text);
drop function if exists public.submit_finance_record_approval_v1(text);
drop function if exists public.update_finance_record_v2(text, text, text, text, text, text, text, text, text);
drop function if exists public.create_finance_record_v2(text, text, text, text, text, text, text, text, text, text, text, text);

drop index if exists public.fr_invoice_number_idx;

alter table public.finance_records drop column if exists approval_status;
alter table public.finance_records drop column if exists org_document_id;
alter table public.finance_records drop column if exists vat_amount_cents;
alter table public.finance_records drop column if exists invoice_number;

commit;
