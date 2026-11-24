-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260711230000 — finance_records v1: manual operational finance records
-- (control-room capability programme PR I2; gap map §9; repo-safe consumer
-- layer already merged in PR I1 / #713 and degrading honestly until this is
-- applied).
--
-- PROBLEM: the platform has ZERO financial records — only Stripe TEST-mode
-- subscription plumbing that stores no amounts. Operators track invoices
-- and expenses outside the product. The merged /dashboard/finance surface
-- reads the contract below and currently shows the truthful "preparing"
-- state.
--
-- SOLUTION (smallest honest slice): ONE new table + THREE new gated write
-- RPCs. The consumer code on main already matches this contract exactly
-- (apps/web/lib/finance/* — guard-pinned in lib/guards/finance-records.test.ts):
--
--   1. finance_records — a bounded manual record: invoice_issued /
--      invoice_received / expense; title 3..160; counterparty as bounded
--      manual text (no contact entity exists yet); amount in integer cents
--      (bigint, 0..1e11), EUR-only; HONEST stored lifecycle draft / issued /
--      partially_paid / paid / cancelled — overdue is DERIVED app-side
--      from due_date + unpaid status and is deliberately NOT a stored
--      state (no cron, no stale flags); paid_at stamped only on 'paid'
--      (CHECK-enforced shape); optional project/company pointers.
--   2. RLS SELECT: creator, is_admin(), or the linked company's owner via
--      the EXISTING owns_company() helper. No anon path; unrelated callers
--      cannot learn a row exists.
--   3. create_finance_record_v1 / update_finance_record_v1 /
--      set_finance_record_status_v1 are the ONLY write paths (direct DML
--      REVOKEd, no write policies). SECURITY DEFINER, all re-check
--      authorization server-side, validate enums/bounds, verify project
--      (can_manage_project) and company (owns_company) links, and cap
--      records per creator.
--
-- NO MONEY MOVEMENT — BY CONSTRUCTION: manual bookkeeping-free records
-- only. No payment provider, no bank sync, no payout, no charge, no
-- outbound call of any kind exists in this migration or the consuming app
-- code (guard-pinned: no stripe/payment imports in the finance layer).
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO stored overdue status (derived app-side — see above);
--   - NO currency conversion, NO non-EUR currencies (single-value check);
--   - NO VAT/tax fields, NO accounting/compliance claims;
--   - NO attachment column — document relation reuses the existing
--     document axes in a later slice;
--   - NO recreate of ANY existing RPC/trigger/table — the table and all
--     three functions are NEW names (rollback-chain rule);
--   - NO change to any existing table, policy, grant, or constraint.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing table are RED-class). Ships as a
-- needs-human-gate DRAFT with the exact SQL; prod apply stays manual via
-- Supabase MCP after owner approval — never db push. Until applied, the
-- app degrades honestly: reads see 42P01 and /dashboard/finance shows the
-- "preparing" state; the CSV export answers 503 (nothing faked).
--
-- ROLLBACK: supabase/rollbacks/20260711230000_finance_records_v1.down.sql
-- restores the prior state exactly: drops ONLY the three NEW functions and
-- the one NEW table (feature-created rows live ONLY in that table). No
-- existing RPC was recreated, so the down file contains no create-function.
-- ============================================================================

begin;

-- ── 1. finance_records — manual operational finance rows ────────────────────
create table if not exists public.finance_records (
  id                uuid primary key default gen_random_uuid(),
  record_type       text not null
                      check (record_type in ('invoice_issued','invoice_received','expense')),
  title             text not null check (
                      char_length(trim(title)) >= 3
                      and char_length(title) <= 160
                    ),
  -- Manual counterparty text — no contact entity exists yet (gap map §5);
  -- bounded, never enriched, never synced anywhere.
  counterparty_name text not null check (
                      char_length(trim(counterparty_name)) >= 2
                      and char_length(counterparty_name) <= 160
                    ),
  -- Integer cents only (no floats anywhere in the chain).
  amount_cents      bigint not null
                      check (amount_cents >= 0 and amount_cents <= 100000000000),
  currency          char(3) not null default 'EUR' check (currency in ('EUR')),
  -- HONEST stored lifecycle. overdue is DERIVED app-side and must never
  -- become a stored state (guard-pinned).
  status            text not null default 'draft'
                      check (status in ('draft','issued','partially_paid','paid','cancelled')),
  due_date          date,
  paid_at           timestamptz,
  project_id        uuid references public.projects(id) on delete set null,
  company_id        uuid references public.companies(id) on delete set null,
  note              text check (char_length(note) <= 1000),
  created_by        uuid not null references public.profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint fr_paid_shape check (
    (status = 'paid' and paid_at is not null)
    or
    (status <> 'paid' and paid_at is null)
  )
);
create index if not exists fr_creator_status_idx
  on public.finance_records (created_by, status);
create index if not exists fr_company_idx
  on public.finance_records (company_id)
  where company_id is not null;
create index if not exists fr_project_idx
  on public.finance_records (project_id)
  where project_id is not null;

alter table public.finance_records enable row level security;

-- SELECT: creator, admin, or the linked company's owner. Finance rows are
-- sensitive — no broader read path exists.
drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or (company_id is not null and public.owns_company(company_id))
  );
-- No insert/update/delete policy: the three gated RPCs below are the ONLY
-- write paths (direct writes are REVOKEd further down).

-- ── 2. create_finance_record_v1 — the ONLY insert path ──────────────────────
create or replace function public.create_finance_record_v1(
  p_record_type  text,
  p_title        text,
  p_counterparty text,
  p_amount_cents text,
  p_status       text,
  p_due_date     text,
  p_project_id   text,
  p_company_id   text,
  p_note         text
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
  -- Digits-only integer-cents string (the app parses user input with pure
  -- integer math and sends cents — no floats cross this boundary).
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
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;

  -- Links are authorization-gated server-side, never trusted from the client.
  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;
  if v_company is not null and not public.owns_company(v_company) then
    return 'not_allowed';
  end if;

  -- Abuse cap: a manual finance list, not a data dump.
  if (select count(*) from public.finance_records fr
       where fr.created_by = uid) >= 2000 then
    return 'record_limit_reached';
  end if;

  insert into public.finance_records
    (record_type, title, counterparty_name, amount_cents, currency, status,
     due_date, paid_at, project_id, company_id, note, created_by)
  values
    (v_type, v_title, v_cp, v_amount, 'EUR', v_status,
     v_due,
     case when v_status = 'paid' then now() else null end,
     v_project, v_company, v_note, uid);

  return 'created';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) to authenticated;

-- ── 3. update_finance_record_v1 — the ONLY field-edit path ──────────────────
create or replace function public.update_finance_record_v1(
  p_record_id    text,
  p_title        text,
  p_counterparty text,
  p_amount_cents text,
  p_due_date     text,
  p_note         text
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
  -- one answer — no existence leak.
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
       or (fr.company_id is not null and public.owns_company(fr.company_id))
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation or datetime_field_overflow then
    return 'invalid';
end $$;

revoke all on function public.update_finance_record_v1(text, text, text, text, text, text) from public;
grant execute on function public.update_finance_record_v1(text, text, text, text, text, text) to authenticated;

-- ── 4. set_finance_record_status_v1 — the ONLY status-transition path ───────
create or replace function public.set_finance_record_status_v1(
  p_record_id text,
  p_status    text
) returns text
language plpgsql
security definer
set search_path = public
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
  -- (matching the fr_paid_shape CHECK).
  update public.finance_records fr
     set status     = v_status,
         paid_at    = case when v_status = 'paid' then now() else null end,
         updated_at = now()
   where fr.id = v_id
     and (
       fr.created_by = uid
       or public.is_admin()
       or (fr.company_id is not null and public.owns_company(fr.company_id))
     );

  if not found then
    return 'not_found';
  end if;

  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

revoke all on function public.set_finance_record_status_v1(text, text) from public;
grant execute on function public.set_finance_record_status_v1(text, text) to authenticated;

-- ── 5. Grants — SELECT only to authenticated; writes are RPC-only ───────────
grant select on public.finance_records to authenticated;
revoke insert, update, delete on public.finance_records from authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260711230000_finance_records_v1.down.sql
-- restores the prior state exactly (drops the three NEW functions and the
-- one NEW table; feature-created rows live only in that table).
