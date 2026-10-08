-- Rollback for 20261008150000_project_invoice_lifecycle_v1.
-- REFUSES while any lifecycle data exists (rate terms, periods, lines, responses, issued lifecycle invoices):
-- those are financial history and must not be destroyed by a rollback. At zero rows it restores the exact
-- previous bodies of update_finance_record_v1/v2 and set_finance_record_status_v1, the previous fr_select
-- policy and the EUR-only currency CHECK.
begin;

do $$
begin
  if (select count(*) from public.project_rate_terms) > 0
     or (select count(*) from public.billing_periods) > 0
     or (select count(*) from public.finance_record_lines) > 0
     or (select count(*) from public.invoice_client_responses) > 0
     or exists (select 1 from public.finance_records where issuer_org_id is not null or billing_period_id is not null
                or issued_at is not null or invoice_kind <> 'invoice') then
    raise exception 'rollback refused: invoice lifecycle rows exist (financial history)';
  end if;
  if exists (select 1 from public.finance_records where currency <> 'EUR') then
    raise exception 'rollback refused: non-EUR finance records exist';
  end if;
end $$;

drop trigger if exists finance_records_issued_guard on public.finance_records;
drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select to authenticated
  using (created_by = auth.uid() or public.is_admin() or public.finance_company_authority_v1(company_id));

drop table if exists public.invoice_client_responses;
drop table if exists public.finance_record_line_sources;
drop table if exists public.finance_record_lines;
drop table if exists public.invoice_number_sequences;
drop table if exists public.organization_tax_presets;

alter table public.finance_records drop constraint if exists fr_credit_shape;
drop index if exists public.fr_one_live_invoice_per_period;
drop index if exists public.fr_issuer_number_uq;
drop index if exists public.fr_one_credit_per_invoice;
drop index if exists public.fr_issuer_idx;
drop index if exists public.fr_client_idx;
alter table public.finance_records
  drop column if exists issuer_org_id, drop column if exists client_org_id, drop column if exists billing_period_id,
  drop column if exists invoice_kind, drop column if exists supersedes_id, drop column if exists issued_at,
  drop column if exists issued_by, drop column if exists voided_at, drop column if exists voided_by,
  drop column if exists void_reason, drop column if exists customer_vat_id, drop column if exists customer_address,
  drop column if exists tax_rounding, drop column if exists net_total_cents, drop column if exists tax_total_cents,
  drop column if exists gross_total_cents, drop column if exists tax_breakdown;
drop table if exists public.billing_periods;
drop table if exists public.project_rate_terms;

alter table public.finance_records drop constraint if exists finance_records_currency_iso;
alter table public.finance_records add constraint finance_records_currency_check check (currency in ('EUR'));

-- previous bodies (verbatim from 20260817123000 / 20260817220000)
create or replace function public.update_finance_record_v1(p_record_id text, p_title text, p_counterparty text, p_amount_cents text, p_due_date text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_cp       text := nullif(trim(coalesce(p_counterparty, '')), '');
  v_amount   bigint;
  v_due      date;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_amt_text text := nullif(trim(coalesce(p_amount_cents, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_id is null then
    return 'invalid';
  end if;
  if v_title is null
     or char_length(v_title) < 3
     or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_cp is null
     or char_length(v_cp) < 2
     or char_length(v_cp) > 160 then
    return 'invalid';
  end if;
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then
    return 'invalid';
  end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then
    return 'invalid';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    return 'invalid';
  end if;
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;

  -- Bounded fields + updated_at only; type/status/links are immutable here
  -- (status has its own RPC; links are create-time only). Authorization is
  -- re-checked in the UPDATE's where clause; not-found and unauthorized give
  -- one answer — no existence leak. Org-bound since 20260817123000.
  update public.finance_records fr
     set title             = v_title,
         counterparty_name = v_cp,
         amount_cents      = v_amount,
         due_date          = v_due,
         note              = v_note,
         updated_at        = now()
   where fr.id = v_id
     and (
       fr.created_by = uid
       or public.is_admin()
       or public.finance_company_authority_v1(fr.company_id)
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

create or replace function public.update_finance_record_v2(
  p_record_id        text,
  p_title            text,
  p_counterparty     text,
  p_amount_cents     text,
  p_due_date         text,
  p_note             text,
  p_invoice_number   text,
  p_vat_amount_cents text,
  p_org_document_id  text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_cp       text := nullif(trim(coalesce(p_counterparty, '')), '');
  v_amount   bigint;
  v_due      date;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_amt_text text := nullif(trim(coalesce(p_amount_cents, '')), '');
  v_inv_no   text := nullif(trim(coalesce(p_invoice_number, '')), '');
  v_vat_text text := nullif(trim(coalesce(p_vat_amount_cents, '')), '');
  v_vat      bigint;
  v_org_doc  uuid := nullif(trim(coalesce(p_org_document_id, '')), '')::uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_id is null then
    return 'invalid';
  end if;
  if v_title is null
     or char_length(v_title) < 3
     or char_length(v_title) > 160 then
    return 'invalid';
  end if;
  if v_cp is null
     or char_length(v_cp) < 2
     or char_length(v_cp) > 160 then
    return 'invalid';
  end if;
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then
    return 'invalid';
  end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then
    return 'invalid';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    return 'invalid';
  end if;
  if v_inv_no is not null and char_length(v_inv_no) > 60 then
    return 'invalid';
  end if;
  if v_vat_text is not null then
    if v_vat_text !~ '^[0-9]{1,12}$' then
      return 'invalid';
    end if;
    v_vat := v_vat_text::bigint;
    if v_vat < 0 or v_vat > 100000000000 then
      return 'invalid';
    end if;
  end if;
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;
  if v_org_doc is not null and not public.can_read_org_document_v1(v_org_doc) then
    return 'not_allowed';
  end if;

  -- Bounded fields + updated_at only; type/status/links stay immutable here
  -- (v1 rule kept). Authorization re-checked in the where clause; not-found
  -- and unauthorized give one answer — no existence leak.
  update public.finance_records fr
     set title             = v_title,
         counterparty_name = v_cp,
         amount_cents      = v_amount,
         due_date          = v_due,
         note              = v_note,
         invoice_number    = v_inv_no,
         vat_amount_cents  = v_vat,
         org_document_id   = v_org_doc,
         updated_at        = now()
   where fr.id = v_id
     and (
       fr.created_by = uid
       or public.is_admin()
       or public.finance_company_authority_v1(fr.company_id)
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

create or replace function public.set_finance_record_status_v1(p_record_id text, p_status text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_id is null
     or v_status is null
     or v_status not in ('draft','issued','partially_paid','paid','cancelled') then
    return 'invalid';
  end if;

  -- ONE row; ONLY status + paid_at + updated_at ever change. paid_at is
  -- stamped exactly when the record becomes 'paid' and cleared otherwise
  -- (matching the fr_paid_shape CHECK). Org-bound since 20260817123000.
  update public.finance_records fr
     set status     = v_status,
         paid_at    = case when v_status = 'paid' then now() else null end,
         updated_at = now()
   where fr.id = v_id
     and (
       fr.created_by = uid
       or public.is_admin()
       or public.finance_company_authority_v1(fr.company_id)
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

drop function if exists public.add_project_rate_term_v1(uuid, text, text, bigint, text, text, text, date, date, uuid, text, uuid);
drop function if exists public.end_project_rate_term_v1(uuid, date);
drop function if exists public.save_org_tax_preset_v1(uuid, text, text, numeric, text, boolean);
drop function if exists public.create_billing_period_v1(uuid, date, date, uuid);
drop function if exists public.mark_billing_period_ready_v1(uuid, boolean);
drop function if exists public.billing_period_preview_v1(uuid);
drop function if exists public.create_invoice_draft_from_period_v1(uuid, text, uuid, text, text, date, text);
drop function if exists public.add_invoice_basis_line_v1(uuid, uuid, numeric, text);
drop function if exists public.set_invoice_line_tax_v1(uuid, text, numeric, text);
drop function if exists public.set_invoice_tax_v1(uuid, text, numeric, text, boolean);
drop function if exists public.update_invoice_draft_details_v1(uuid, text, uuid, text, text, date, text);
drop function if exists public.discard_invoice_draft_v1(uuid);
drop function if exists public.issue_invoice_v1(uuid, boolean);
drop function if exists public.void_or_credit_invoice_v1(uuid, text, text);
drop function if exists public.record_invoice_client_response_v1(uuid, text, text);
drop function if exists public.billing_period_changes_v1(uuid);
drop function if exists public._invoice_period_evidence_v1(uuid, uuid);
drop function if exists public._invoice_recompute_totals_v1(uuid);
drop function if exists public._invoice_line_tax_cents_v1(bigint, numeric);
drop function if exists public._invoice_tax_rate_v1(text, numeric);
drop function if exists public._invoice_audit_v1(text, text, uuid, jsonb);
drop function if exists public.invoice_can_read_v1(uuid);
drop function if exists public.invoice_issuer_side_v1(uuid);
drop function if exists public.invoice_client_reader_v1(uuid);
drop function if exists public.invoice_issuer_project_link_v1(uuid, uuid);
drop function if exists public.invoice_issuer_authority_v1(uuid);
drop function if exists public._invoice_safe_date_v1(text);
drop function if exists public.finance_records_issued_guard_v1();
drop function if exists public.invoice_child_frozen_guard_v1();
drop function if exists public.invoice_append_only_v1();
drop function if exists public.billing_periods_guard_v1();
drop function if exists public.project_rate_terms_guard_v1();

revoke all on function public.update_finance_record_v1(text, text, text, text, text, text) from public, anon;
grant execute on function public.update_finance_record_v1(text, text, text, text, text, text) to authenticated;
revoke all on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.set_finance_record_status_v1(text, text) from public, anon;
grant execute on function public.set_finance_record_status_v1(text, text) to authenticated;

commit;
