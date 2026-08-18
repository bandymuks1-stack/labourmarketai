-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session after
-- review. Never `db push`.
-- Rollback:  supabase/rollbacks/20260817220000_finance_invoice_upgrades_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs are RED-class; there is no non-RED way to add gated write commands).
-- Annotation pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority). SAFETY CLASS: RED — 4 new
-- ADDITIVE nullable columns on finance_records, 1 new partial index, 4 new
-- SECURITY DEFINER functions (create/update v2 + approval submit/sync
-- mirror), EXECUTE grants. ZERO existing table/policy/grant/function is
-- modified, recreated or dropped — the v1 RPCs stay untouched and keep
-- working (rollback-chain rule: a changed contract is a NEW _v2 name).
-- ZERO DML at apply time. Prod apply stays manual by the LEAD session.
--
-- 20260817220000 — finance invoice/expense upgrades v1 (train J, financial
-- ops P2).
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS): invoices are "FULL
-- register / PARTIAL handling — no attachments/OCR/routing". Expense and
-- invoice rows cannot carry an invoice number or a VAT amount, cannot point
-- at the receipt/invoice document, warn about nothing on duplicate entry,
-- and have no approval path at all.
--
-- SOLUTION (thin, additive, finance_records STAYS canonical):
--   * 4 additive nullable columns: invoice_number (bounded), vat_amount_cents
--     (bigint, integer-cents discipline), org_document_id (FK org_documents —
--     the DOCUMENT ENGINE's register row; the file itself lives in
--     document_files behind that register and is uploaded through the
--     engine's own paths — nothing re-implemented here), approval_status
--     (engine MIRROR — see below).
--   * create_finance_record_v2 / update_finance_record_v2 — the v1 contract
--     plus the new fields. v2 CREATE adds DUPLICATE DETECTION, warn-not-
--     block: an invoice_received whose (counterparty, invoice_number) pair
--     already exists in the same scope (same company link, or the caller's
--     own unlinked records) is STILL CREATED and the RPC answers
--     'created_possible_duplicate' so the UI can say so honestly.
--   * submit_finance_record_approval_v1 / sync_finance_record_approval_v1 —
--     the timesheets-pattern engine seam: the app layer starts an instance
--     through the EXISTING Workflow & Approval Engine's own start RPC
--     (context_entity_type 'expense' or 'invoice', context_entity_id =
--     record id); submit only flips the MIRROR to 'pending'; sync only
--     COPIES the engine's terminal outcome. Neither command decides
--     anything. NO thresholds, NO auto-routing, nothing hardcoded.
--
-- DUPLICATE-DETECTION SEMANTICS, STATED EXPLICITLY:
--   * only record_type='invoice_received' AND a non-null invoice_number
--     participate (issued invoices are the caller's own numbering; expenses
--     have no invoice number contract);
--   * match = same record_type + case-insensitive invoice_number + case-
--     insensitive counterparty_name + same scope (company_id equal when the
--     new record is company-linked; otherwise the caller's OWN unlinked
--     records only — never another creator's private rows);
--   * cancelled rows do not count as duplicates;
--   * outcome is a WARNING ('created_possible_duplicate'), never a block —
--     recurring monthly invoices legitimately repeat numbers across periods.
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO OCR, NO AI, NO bank sync, NO payment provider — records only;
--   - NO stored 'overdue' state (stays DERIVED app-side, guard-pinned);
--   - NO new currencies (EUR single-value check untouched);
--   - NO accounting/ERP claims — the CSV export stays an honest record dump;
--   - NO recreate of the three v1 RPCs (they keep their exact behaviour);
--   - NO trip linkage here (20260817222000_business_trips_v1 adds trip_id).
--
-- RLS DECISION, STATED EXPLICITLY: UNCHANGED. The existing fr_select policy
-- (creator / admin / finance_company_authority_v1) already covers the new
-- columns — a column is not a row. Writes stay RPC-only (the existing
-- revoke insert/update/delete stands; the new commands are SECURITY DEFINER
-- with their own server-side authority re-checks). anon: still nothing.
--
-- ROLLBACK: supabase/rollbacks/20260817220000_finance_invoice_upgrades_v1.down.sql
-- drops ONLY the 4 new functions, the new index and the 4 new columns.
-- No existing object was touched, so the down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this slice builds on must exist ──────
do $$
begin
  if to_regclass('public.finance_records') is null then
    raise exception 'finance_records missing — apply 20260711230000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'finance_company_authority_v1'
  ) then
    raise exception 'finance_company_authority_v1 missing — apply 20260817123000 before this migration';
  end if;
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000 (document file layer v1) before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'can_read_org_document_v1'
  ) then
    raise exception 'can_read_org_document_v1 missing — apply 20260817140000 before this migration';
  end if;
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000 (workflow engine v1) before this migration';
  end if;
end $$;

-- ── 1. Additive nullable columns (every existing row stays valid) ──────────
alter table public.finance_records
  add column if not exists invoice_number text
    check (invoice_number is null
           or (char_length(trim(invoice_number)) >= 1
               and char_length(invoice_number) <= 60));

alter table public.finance_records
  add column if not exists vat_amount_cents bigint
    check (vat_amount_cents is null
           or (vat_amount_cents >= 0 and vat_amount_cents <= 100000000000));

alter table public.finance_records
  add column if not exists org_document_id uuid
    references public.org_documents(id) on delete set null;

-- Engine MIRROR only — the decision itself lives in workflow_instances.
alter table public.finance_records
  add column if not exists approval_status text
    check (approval_status is null
           or approval_status in ('pending','approved','rejected'));

create index if not exists fr_invoice_number_idx
  on public.finance_records (lower(invoice_number))
  where invoice_number is not null;

comment on column public.finance_records.approval_status is
  'MIRROR of the Workflow & Approval Engine outcome (context expense/invoice, context id = record id). Written ONLY by submit_finance_record_approval_v1 / sync_finance_record_approval_v1 — never a decision of its own.';
comment on column public.finance_records.org_document_id is
  'Receipt/invoice document: the DOCUMENT ENGINE org_documents register row. The file itself is a document_files version behind that register; upload happens through the document engine''s own paths.';

-- ── 2. create_finance_record_v2 — v1 contract + invoice fields + duplicate
--       warning. v1 stays untouched and keeps working. ──────────────────────
create or replace function public.create_finance_record_v2(
  p_record_type      text,
  p_title            text,
  p_counterparty     text,
  p_amount_cents     text,
  p_status           text,
  p_due_date         text,
  p_project_id       text,
  p_company_id       text,
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
  v_type     text := nullif(trim(coalesce(p_record_type, '')), '');
  v_title    text := nullif(trim(coalesce(p_title, '')), '');
  v_cp       text := nullif(trim(coalesce(p_counterparty, '')), '');
  v_amount   bigint;
  v_status   text := coalesce(nullif(trim(coalesce(p_status, '')), ''), 'draft');
  v_due      date;
  v_project  uuid := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
  v_company  uuid := nullif(trim(coalesce(p_company_id, '')), '')::uuid;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_amt_text text := nullif(trim(coalesce(p_amount_cents, '')), '');
  v_inv_no   text := nullif(trim(coalesce(p_invoice_number, '')), '');
  v_vat_text text := nullif(trim(coalesce(p_vat_amount_cents, '')), '');
  v_vat      bigint;
  v_org_doc  uuid := nullif(trim(coalesce(p_org_document_id, '')), '')::uuid;
  v_dup      boolean := false;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if v_type is null
     or v_type not in ('invoice_issued','invoice_received','expense') then
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
  -- Digits-only integer-cents strings (no floats cross this boundary).
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then
    return 'invalid';
  end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then
    return 'invalid';
  end if;
  if v_status not in ('draft','issued','partially_paid','paid','cancelled') then
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

  -- Links are authorization-gated server-side, never trusted from the client.
  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;
  if v_company is not null and not public.finance_company_authority_v1(v_company) then
    return 'not_allowed';
  end if;
  -- Missing document and unreadable document answer the same — no oracle.
  if v_org_doc is not null and not public.can_read_org_document_v1(v_org_doc) then
    return 'not_allowed';
  end if;

  -- Abuse cap: a manual finance list, not a data dump (v1 rule kept).
  if (select count(*) from public.finance_records fr
       where fr.created_by = uid) >= 2000 then
    return 'record_limit_reached';
  end if;

  -- Duplicate detection — WARN, NEVER BLOCK (semantics in the header).
  if v_type = 'invoice_received' and v_inv_no is not null then
    select exists (
      select 1 from public.finance_records fr
       where fr.record_type = 'invoice_received'
         and fr.invoice_number is not null
         and lower(fr.invoice_number) = lower(v_inv_no)
         and lower(fr.counterparty_name) = lower(v_cp)
         and fr.status <> 'cancelled'
         and (
           (v_company is not null and fr.company_id = v_company)
           or (v_company is null and fr.company_id is null and fr.created_by = uid)
         )
    ) into v_dup;
  end if;

  insert into public.finance_records
    (record_type, title, counterparty_name, amount_cents, currency, status,
     due_date, paid_at, project_id, company_id, note,
     invoice_number, vat_amount_cents, org_document_id, created_by)
  values
    (v_type, v_title, v_cp, v_amount, 'EUR', v_status,
     v_due,
     case when v_status = 'paid' then now() else null end,
     v_project, v_company, v_note,
     v_inv_no, v_vat, v_org_doc, uid);

  if v_dup then
    return 'created_possible_duplicate';
  end if;
  return 'created';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.create_finance_record_v2(text, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_finance_record_v2(text, text, text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_finance_record_v2(text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 3. update_finance_record_v2 — v1 field-edit contract + invoice fields ──
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

revoke all on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 4. submit_finance_record_approval_v1 — flip the MIRROR to pending.
--       The engine instance itself is started by the app layer through the
--       engine's own start RPC (context 'expense'/'invoice', context id =
--       record id) BEFORE this is called; on failure here the app withdraws
--       the instance again (timesheets compensation pattern). This command
--       decides nothing and routes nothing. ─────────────────────────────────
create or replace function public.submit_finance_record_approval_v1(
  p_record_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select fr.id, fr.status, fr.approval_status, fr.company_id, fr.created_by
    into v_row
    from public.finance_records fr
   where fr.id = v_id
   for update;
  -- Merged: missing row and no authority answer the same — no oracle.
  if v_row.id is null
     or not (v_row.created_by = uid
             or public.is_admin()
             or public.finance_company_authority_v1(v_row.company_id)) then
    return 'not_found';
  end if;
  if v_row.status = 'cancelled' then return 'not_allowed'; end if;
  if v_row.approval_status = 'pending' then return 'already_pending'; end if;
  if v_row.approval_status = 'approved' then return 'already_decided'; end if;
  -- null or 'rejected' → a (re)submission is allowed.

  update public.finance_records
     set approval_status = 'pending',
         updated_at = now()
   where id = v_row.id;

  return 'submitted';
end;
$$;
revoke all on function public.submit_finance_record_approval_v1(text) from public;
revoke all on function public.submit_finance_record_approval_v1(text) from anon;
grant execute on function public.submit_finance_record_approval_v1(text) to authenticated;

-- ── 5. sync_finance_record_approval_v1 — copy the engine's TERMINAL outcome
--       onto the mirror. NEVER decides anything:
--         engine approved            -> approval_status 'approved'
--         engine rejected            -> approval_status 'rejected'
--         engine withdrawn/cancelled -> mirror CLEARED (null; resubmittable)
--         engine still pending       -> 'still_pending' (no write)
--         no engine instance         -> 'no_instance'   (no write)
--       Callable by anyone with view authority over the record. ─────────────
create or replace function public.sync_finance_record_approval_v1(
  p_record_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
  v_ctx text;
  v_wf  record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_record_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select fr.id, fr.record_type, fr.approval_status, fr.company_id, fr.created_by
    into v_row
    from public.finance_records fr
   where fr.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.created_by = uid
             or public.is_admin()
             or public.finance_company_authority_v1(v_row.company_id)) then
    return 'not_found';
  end if;
  if v_row.approval_status is distinct from 'pending' then
    return 'not_pending';
  end if;

  v_ctx := case when v_row.record_type = 'expense' then 'expense' else 'invoice' end;

  select i.status into v_wf
    from public.workflow_instances i
   where i.context_entity_type = v_ctx
     and i.context_entity_id = v_row.id
   order by i.created_at desc
   limit 1;
  if v_wf.status is null then return 'no_instance'; end if;
  if v_wf.status = 'pending' then return 'still_pending'; end if;

  if v_wf.status = 'approved' then
    update public.finance_records
       set approval_status = 'approved', updated_at = now()
     where id = v_row.id;
    return 'approved';
  end if;

  if v_wf.status = 'rejected' then
    update public.finance_records
       set approval_status = 'rejected', updated_at = now()
     where id = v_row.id;
    return 'rejected';
  end if;

  -- withdrawn / cancelled — the request went away; the mirror clears
  -- (never silently approved).
  update public.finance_records
     set approval_status = null, updated_at = now()
   where id = v_row.id;
  return 'cleared';
end;
$$;
revoke all on function public.sync_finance_record_approval_v1(text) from public;
revoke all on function public.sync_finance_record_approval_v1(text) from anon;
grant execute on function public.sync_finance_record_approval_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817220000_finance_invoice_upgrades_v1.down.sql
-- restores the prior state exactly (drops the 4 new functions, the new index
-- and the 4 new additive columns; the v1 RPCs were never touched).
