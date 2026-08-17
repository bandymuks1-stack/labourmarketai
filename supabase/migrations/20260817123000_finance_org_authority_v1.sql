-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply via Supabase MCP apply_migration by the lead session after review.
-- Never `db push`.
--
-- 20260817123000 — finance org-bound authority v1 (security train A, Fix C).
--
-- PROBLEM (full-reality-audit-2026-08-17: "creator-bound legacy authority on
-- finance_records"). Finance authority today is:
--
--   fr_select                       created_by = auth.uid() OR is_admin()
--                                   OR owns_company(company_id)
--   create/update/status RPC gates  same shape (owns_company for the link)
--
-- `owns_company(c)` is the LEGACY single-owner check — companies.profile_id =
-- auth.uid(). The multi-org membership model (organizations +
-- company_memberships, authority spine membership_actor_role_v1) is not
-- consulted at all, even though organizations carries a `legacy_company_id`
-- bridge to companies. Consequence: an organization's finance records are
-- readable/editable only by the record's creator and the one legacy owner
-- profile — an org ADMIN added through the canonical membership system has no
-- authority, and if the creator leaves, their personal-scope records and the
-- authority over company-linked ones they created follow them out the door.
--
-- THE CHANGE. One helper, used everywhere the company link grants authority:
--
--   finance_company_authority_v1(p_company_id) :=
--     owns_company(p_company_id)                     -- legacy owner, kept
--     OR exists org with legacy_company_id = p_company_id
--        where membership_actor_role_v1(auth.uid(), org) in ('owner','admin')
--
-- membership_actor_role_v1 is the canonical membership authority spine
-- (20260806120000_company_membership_commands_v1.sql): ACTIVE membership row
-- only — a revoked member's role is NULL and grants nothing. Finance is
-- deliberately restricted to 'owner' and 'admin' membership roles: money
-- data is NOT extended to 'manager'/'external_manager' (least privilege; the
-- demand/scheduling spines admit managers, the finance spine does not).
--
-- Applied to:
--   1. fr_select policy (also pinned `to authenticated`).
--   2. create_finance_record_v1 — the company-link authorization gate.
--   3. update_finance_record_v1 — the where-clause authority.
--   4. set_finance_record_status_v1 — the where-clause authority.
-- Function bodies otherwise byte-identical to the live definitions (captured
-- from production pg_get_functiondef on 2026-08-17).
--
-- INTENTIONALLY NOT CHANGED (documented, not "fixed"):
--   * `created_by = auth.uid()` stays: records with NO company link are
--     personal finance notes and remain creator-bound by design.
--   * The 2000-records-per-creator abuse cap stays creator-keyed.
--   * project-linked authority (can_manage_project) unchanged.
--
-- COMPATIBILITY. Strictly widening for company-linked records (legacy owner
-- keeps authority; org owners/admins via the membership spine gain it); no
-- existing caller loses access. RPC signatures unchanged.
--
-- @human-gate-approved — policy correction + org-authority extension of three
-- existing SECURITY DEFINER RPCs + one new STABLE SECURITY DEFINER boolean
-- helper (no schema change, no data change). Pre-approved by owner mandate
-- 2026-08-17 (autonomous functional completion train V2, §4 migration
-- authority); production apply stays with the lead session via Supabase MCP.
--
-- ROLLBACK: supabase/rollbacks/20260817123000_finance_org_authority_v1.down.sql
-- ============================================================================

begin;

-- ── 1. Company-authority helper (legacy owner OR org owner/admin) ──────────
create or replace function public.finance_company_authority_v1(p_company_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select p_company_id is not null and (
    public.owns_company(p_company_id)
    or exists (
      select 1 from public.organizations o
       where o.legacy_company_id = p_company_id
         and public.membership_actor_role_v1(auth.uid(), o.id) in ('owner','admin')
    )
  )
$$;

comment on function public.finance_company_authority_v1(uuid) is
  'Finance authority over a company link: legacy single owner (owns_company) OR owner/admin ACTIVE membership (membership_actor_role_v1) in an organization bridged via legacy_company_id. Managers deliberately excluded. NULL company grants nothing.';

revoke execute on function public.finance_company_authority_v1(uuid) from public;
revoke execute on function public.finance_company_authority_v1(uuid) from anon;
grant execute on function public.finance_company_authority_v1(uuid) to authenticated;

-- ── 2. SELECT policy ───────────────────────────────────────────────────────
drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.finance_company_authority_v1(company_id)
  );

-- ── 3. create_finance_record_v1: org-aware company-link gate ───────────────
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
  -- Org-bound since 20260817123000: legacy owner OR org owner/admin via the
  -- membership spine.
  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;
  if v_company is not null and not public.finance_company_authority_v1(v_company) then
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

-- ── 4. update_finance_record_v1: org-aware authority ───────────────────────
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

-- ── 5. set_finance_record_status_v1: org-aware authority ───────────────────
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

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — also in supabase/rollbacks/): restores the exact
-- live 2026-08-17 policy and function definitions and drops the helper. See
-- the .down.sql file.
-- ════════════════════════════════════════════════════════════════════════════
