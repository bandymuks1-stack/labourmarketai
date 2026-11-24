-- Rollback for 20260817123000_finance_org_authority_v1.sql
-- Restores the exact live 2026-08-17 (pre-migration) policy and function
-- definitions captured from production before the change, then drops the
-- helper. Manual apply via Supabase MCP only.

begin;

-- ── Policy: back to creator / admin / legacy company owner ─────────────────
drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or (company_id is not null and public.owns_company(company_id))
  );

-- ── create_finance_record_v1: original owns_company gate ───────────────────
create or replace function public.create_finance_record_v1(p_record_type text, p_title text, p_counterparty text, p_amount_cents text, p_status text, p_due_date text, p_project_id text, p_company_id text, p_note text)
returns text
language plpgsql
security definer
set search_path to 'public'
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

  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;
  if v_company is not null and not public.owns_company(v_company) then
    return 'not_allowed';
  end if;

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

-- ── update_finance_record_v1: original owns_company authority ──────────────
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

-- ── set_finance_record_status_v1: original owns_company authority ──────────
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

-- ── Helper removal (nothing references it after the restores above) ────────
drop function if exists public.finance_company_authority_v1(uuid);


-- Re-state grants for every REDEFINED SECURITY DEFINER function above:
-- `create or replace` preserves live grants in production, but a fresh local
-- reset replays this file into default privileges (PUBLIC EXECUTE). The
-- secdef-local-reset-reproducibility guard requires file-local revokes.
revoke all on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.create_finance_record_v1(text, text, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.update_finance_record_v1(text, text, text, text, text, text) from public;
revoke all on function public.update_finance_record_v1(text, text, text, text, text, text) from anon;
grant execute on function public.update_finance_record_v1(text, text, text, text, text, text) to authenticated;
revoke all on function public.set_finance_record_status_v1(text, text) from public;
revoke all on function public.set_finance_record_status_v1(text, text) from anon;
grant execute on function public.set_finance_record_status_v1(text, text) to authenticated;

commit;
