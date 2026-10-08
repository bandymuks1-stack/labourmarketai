-- ============================================================================
-- DRAFT - needs-human-gate - DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20261008150000 - PROJECT-TO-INVOICE LIFECYCLE v1
--
-- OWNER CHAIN: client/org -> Project -> agreed commercial basis -> work reports
-- (Journal: hours, quantities, evidence) -> internal responsible-person
-- approval -> OPTIONAL client acceptance -> billable period -> invoice ->
-- durable history. LabourMarket does NOT process payment.
--
-- WHAT THIS ADDS (additive; finance_records stays THE invoice header):
--   project_rate_terms            agreed commercial basis (hours|quantity|milestone|fixed)
--   billing_periods               project period, locked by issue
--   finance_record_lines          invoice lines: basis, net, tax snapshot per line
--   finance_record_line_sources   per-line source evidence (journal entry, hash,
--                                 confirmation ids, evidence class, photos)
--   organization_tax_presets      PRE-FILL only. Never decides legal treatment.
--   invoice_number_sequences      gapless numbering per issuing org + series
--   invoice_client_responses      OPTIONAL client acceptance of an issued invoice
--   finance_records (+columns)    issuer/client org, period, kind, credit chain,
--                                 issue/void stamps, customer VAT id, tax totals
--
-- TAX IS COUNTRY-NEUTRAL DATA (owner decision): treatment is an explicit value
-- (standard | reduced | zero_rated | reverse_charge | exempt | outside_scope)
-- stored with the RATE and a NOTE as a SNAPSHOT on every line; zero_rated and
-- reverse_charge are different states. Nothing here knows any country's rate
-- or wording. The issuing user must set and confirm treatment per line; it is
-- never auto-selected at issue. Rounding: per line, half away from zero,
-- totals are sums of rounded lines (stored in tax_rounding).
--
-- EVIDENCE CLASSES stay distinct: a line is built ONLY from journal entries
-- whose latest INDEPENDENT employer review decision is 'approved'
-- (internal_confirmed). A counterparty (client) acceptance recorded through
-- the existing counterparty path upgrades the source row to client_accepted.
-- Internal confirmation is NEVER relabelled as client acceptance.
--
-- IMMUTABILITY: an issued invoice (amount, tax, lines, sources, number,
-- treatment) cannot change - enforced by triggers even against a privileged
-- writer. The two pre-existing write RPCs that allowed it
-- (update_finance_record_v1/v2, set_finance_record_status_v1) are REPLACED.
-- Corrections are explicit: void_or_credit_invoice_v1 (credit-note chain).
--
-- RLS DIFF (reviewer: read this): fr_select GAINS two read paths -
--   (a) issuer-org finance authority (owner/admin membership of issuer_org_id)
--   (b) client-org manager for NON-DRAFT rows with client_org_id = their org.
-- All new tables: RLS on, SELECT-only to authenticated, writes RPC-only, anon
-- and PUBLIC revoked.
--
-- ROLLBACK: supabase/rollbacks/20261008150000_project_invoice_lifecycle_v1.down.sql
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.finance_records') is null then
    raise exception 'finance_records missing - apply 20260711230000 first';
  end if;
  if to_regclass('public.work_counterparty_links') is null then
    raise exception 'work_counterparty_links missing - apply 20261003150500 first';
  end if;
  if to_regclass('public.journal_entry_metrics') is null
     or to_regclass('public.journal_entry_photos') is null then
    raise exception 'journal metric/photo tables missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'profile_manages_organization_v1') then
    raise exception 'profile_manages_organization_v1 missing - apply 20261003150500 first';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'membership_actor_role_v1') then
    raise exception 'membership_actor_role_v1 missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'can_manage_project') then
    raise exception 'can_manage_project missing';
  end if;
end $$;

-- ============================================================================
-- 0. Currency: relax the EUR-only CHECK additively (documented limitation).
--    ISO-4217 SHAPE only; existing 0 rows; create/update RPCs unchanged.
-- ============================================================================
alter table public.finance_records drop constraint if exists finance_records_currency_check;
alter table public.finance_records
  add constraint finance_records_currency_iso check (currency ~ '^[A-Z]{3}$');

-- ============================================================================
-- 1. Authority helpers (SECURITY DEFINER, pinned search_path)
-- ============================================================================
-- Issuer-side finance authority over one organization: platform admin, OR
-- ACTIVE owner/admin membership, OR the legacy-company finance authority.
-- Plain managers are deliberately excluded (same rule as the finance surface).
create or replace function public.invoice_issuer_authority_v1(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  -- coalesce: every operand may be NULL (no membership row); a NULL here must read as FALSE, never as "not refused"
  select coalesce(p_org is not null and auth.uid() is not null and (
    coalesce(public.is_admin(), false)
    or coalesce(public.membership_actor_role_v1(auth.uid(), p_org) in ('owner','admin'), false)
    or exists (select 1 from public.organizations o
                where o.id = p_org
                  and o.legacy_company_id is not null
                  and coalesce(public.finance_company_authority_v1(o.legacy_company_id), false))
  ), false)
$$;

-- The client organization's authorized representative (read + respond only).
create or replace function public.invoice_client_reader_v1(p_client_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(p_client_org is not null and auth.uid() is not null
     and public.profile_manages_organization_v1(auth.uid(), p_client_org), false)
$$;

-- May this ISSUER org invoice work on this PROJECT, and does the caller hold finance authority for it?
--   owner    : the project belongs to the issuer org and the caller manages the project
--   supplier : the project belongs to another org (the client) but the issuer has workers
--              ACTIVELY ASSIGNED to it through an active engagement in the issuer org (labour supply)
create or replace function public.invoice_issuer_project_link_v1(p_issuer uuid, p_project uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(p_issuer is not null and p_project is not null
     and public.invoice_issuer_authority_v1(p_issuer)
     and exists (
       select 1 from public.projects pr
        where pr.id = p_project
          and ( (pr.organization_id = p_issuer and public.can_manage_project(pr.id))
             or (pr.organization_id is distinct from p_issuer and exists (
                   select 1 from public.project_worker_assignments a
                     join public.workers w on w.id = a.worker_id
                     join public.engagement_contexts ec on ec.profile_id = w.profile_id
                    where a.project_id = pr.id and a.status = 'active'
                      and ec.organization_id = p_issuer and ec.status = 'active')) )), false)
$$;

create or replace function public._invoice_safe_date_v1(p text)
returns date
language plpgsql immutable
set search_path = public
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end $$;

-- ============================================================================
-- 2. project_rate_terms - the AGREED commercial basis
-- ============================================================================
create table public.project_rate_terms (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete restrict,
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  basis_type       text not null check (basis_type in ('hours','quantity','milestone','fixed')),
  -- hours => 'hours'; quantity => the output unit slug; milestone/fixed => null
  unit             text check (unit is null or char_length(unit) between 1 and 60),
  -- price per unit, or the agreed amount for milestone/fixed (minor units)
  rate_cents       bigint not null check (rate_cents >= 0 and rate_cents <= 100000000000),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  label            text check (label is null or char_length(label) between 1 and 160),
  -- informational only: NEVER auto-applied to entries (no silent role guess)
  role_label       text check (role_label is null or char_length(role_label) between 1 and 120),
  valid_from       date not null,
  valid_to         date,
  agreed_by        uuid not null references public.profiles(id),
  agreed_at        timestamptz not null default now(),
  org_document_id  uuid references public.org_documents(id) on delete set null,
  note             text check (note is null or char_length(note) <= 1000),
  created_at       timestamptz not null default now(),
  constraint prt_dates check (valid_to is null or valid_to >= valid_from),
  constraint prt_unit_shape check (
    (basis_type = 'hours'    and unit = 'hours')
    or (basis_type = 'quantity' and unit is not null and unit not in ('hours','minutes','days'))
    or (basis_type in ('milestone','fixed') and unit is null))
);
create index prt_project_idx on public.project_rate_terms (project_id, basis_type, valid_from);

create or replace function public.project_rate_terms_guard_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: rate terms are ended, never deleted' using errcode = '55000';
  end if;
  -- the agreed basis is immutable; only the END date may be written, once.
  if (new.id, new.project_id, new.organization_id, new.basis_type, new.unit, new.rate_cents,
      new.currency, new.label, new.role_label, new.valid_from, new.agreed_by, new.agreed_at,
      new.org_document_id, new.note)
     is distinct from
     (old.id, old.project_id, old.organization_id, old.basis_type, old.unit, old.rate_cents,
      old.currency, old.label, old.role_label, old.valid_from, old.agreed_by, old.agreed_at,
      old.org_document_id, old.note) then
    raise exception 'append_only: an agreed rate term is immutable - end it and add a new one'
      using errcode = '55000';
  end if;
  if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
    raise exception 'append_only: a rate term can be ended only once' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger project_rate_terms_guard
  before update or delete on public.project_rate_terms
  for each row execute function public.project_rate_terms_guard_v1();

-- ============================================================================
-- 3. billing_periods
-- ============================================================================
create table public.billing_periods (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_start    date not null,
  period_end      date not null,
  status          text not null default 'open' check (status in ('open','ready','invoiced')),
  locked_at       timestamptz,
  locked_by       uuid references public.profiles(id),
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  constraint bp_dates check (period_end >= period_start and period_end - period_start <= 400),
  constraint bp_lock_shape check ((status = 'invoiced') = (locked_at is not null))
);
create index bp_project_idx on public.billing_periods (project_id, period_start);

create or replace function public.billing_periods_guard_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'append_only: billing periods are never deleted' using errcode = '55000';
  end if;
  if (new.id, new.project_id, new.organization_id, new.period_start, new.period_end, new.created_by, new.created_at)
     is distinct from
     (old.id, old.project_id, old.organization_id, old.period_start, old.period_end, old.created_by, old.created_at) then
    raise exception 'period identity (project, dates) is immutable' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger billing_periods_guard
  before update or delete on public.billing_periods
  for each row execute function public.billing_periods_guard_v1();

-- ============================================================================
-- 4. finance_records additive columns (the canonical invoice HEADER)
-- ============================================================================
alter table public.finance_records
  add column if not exists issuer_org_id     uuid references public.organizations(id) on delete restrict,
  add column if not exists client_org_id     uuid references public.organizations(id) on delete restrict,
  add column if not exists billing_period_id uuid references public.billing_periods(id) on delete restrict,
  add column if not exists invoice_kind      text not null default 'invoice'
    check (invoice_kind in ('invoice','credit_note')),
  add column if not exists supersedes_id     uuid references public.finance_records(id) on delete restrict,
  add column if not exists issued_at         timestamptz,
  add column if not exists issued_by         uuid references public.profiles(id),
  add column if not exists voided_at         timestamptz,
  add column if not exists voided_by         uuid references public.profiles(id),
  add column if not exists void_reason       text check (void_reason is null or char_length(void_reason) <= 500),
  add column if not exists customer_vat_id   text check (customer_vat_id is null or char_length(customer_vat_id) <= 60),
  add column if not exists customer_address  text check (customer_address is null or char_length(customer_address) <= 400),
  add column if not exists tax_rounding      text not null default 'per_line' check (tax_rounding in ('per_line')),
  add column if not exists net_total_cents   bigint check (net_total_cents is null or net_total_cents >= 0),
  add column if not exists tax_total_cents   bigint check (tax_total_cents is null or tax_total_cents >= 0),
  add column if not exists gross_total_cents bigint check (gross_total_cents is null or gross_total_cents >= 0),
  add column if not exists tax_breakdown     jsonb;

alter table public.finance_records
  add constraint fr_credit_shape check (
    (invoice_kind = 'credit_note') = (supersedes_id is not null)
    and (invoice_kind = 'invoice' or record_type = 'invoice_issued'));

create unique index fr_one_live_invoice_per_period
  on public.finance_records (billing_period_id)
  where billing_period_id is not null and invoice_kind = 'invoice'
    and voided_at is null and status <> 'cancelled';
create unique index fr_issuer_number_uq
  on public.finance_records (issuer_org_id, invoice_kind, lower(invoice_number))
  where issuer_org_id is not null and invoice_number is not null and issued_at is not null;
create unique index fr_one_credit_per_invoice
  on public.finance_records (supersedes_id) where supersedes_id is not null;
create index fr_issuer_idx on public.finance_records (issuer_org_id) where issuer_org_id is not null;
create index fr_client_idx on public.finance_records (client_org_id) where client_org_id is not null;

-- ============================================================================
-- 5. organization_tax_presets (PRE-FILL only)
-- ============================================================================
create table public.organization_tax_presets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label           text not null check (char_length(trim(label)) between 1 and 80),
  treatment       text not null check (treatment in
                    ('standard','reduced','zero_rated','reverse_charge','exempt','outside_scope')),
  rate_percent    numeric(7,4) check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100)),
  note_text       text check (note_text is null or char_length(note_text) <= 500),
  active          boolean not null default true,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint otp_rate_shape check (
    (treatment in ('standard','reduced') and rate_percent is not null and rate_percent > 0)
    or (treatment not in ('standard','reduced') and (rate_percent is null or rate_percent = 0))),
  unique (organization_id, label)
);

-- ============================================================================
-- 6. invoice_number_sequences (gapless, row-locked)
-- ============================================================================
create table public.invoice_number_sequences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series          text not null check (series in ('invoice','credit_note')),
  prefix          text not null default '' check (char_length(prefix) <= 20),
  pad             int  not null default 4 check (pad between 1 and 12),
  next_number     bigint not null default 1 check (next_number >= 1),
  primary key (organization_id, series)
);

-- ============================================================================
-- 7. finance_record_lines + sources
-- ============================================================================
create table public.finance_record_lines (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.finance_records(id) on delete cascade,
  line_no          int  not null check (line_no >= 1),
  basis_type       text not null check (basis_type in ('hours','quantity','milestone','fixed')),
  description      text check (description is null or char_length(description) <= 300),
  rate_term_id     uuid references public.project_rate_terms(id) on delete restrict,
  unit             text,
  quantity         numeric(14,4) not null check (quantity >= 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  net_cents        bigint not null check (net_cents >= 0),
  currency         char(3) not null check (currency ~ '^[A-Z]{3}$'),
  -- EVIDENCE CLASS of the line's basis. 'client_accepted' is NEVER assigned
  -- from internal confirmation; mixed lines are internal_confirmed with the
  -- client-accepted share in qty_client_accepted.
  evidence_class      text not null check (evidence_class in ('internal_confirmed','client_accepted','agreed_basis')),
  qty_client_accepted numeric(14,4) not null default 0 check (qty_client_accepted >= 0),
  confirmed_by     uuid references public.profiles(id),
  confirmed_at     timestamptz,
  -- TAX SNAPSHOT: set explicitly by the issuing user, frozen at issue.
  tax_treatment    text check (tax_treatment is null or tax_treatment in
                     ('standard','reduced','zero_rated','reverse_charge','exempt','outside_scope')),
  tax_rate_percent numeric(7,4) check (tax_rate_percent is null or (tax_rate_percent >= 0 and tax_rate_percent <= 100)),
  tax_note         text check (tax_note is null or char_length(tax_note) <= 500),
  tax_cents        bigint check (tax_cents is null or tax_cents >= 0),
  gross_cents      bigint check (gross_cents is null or gross_cents >= 0),
  tax_set_by       uuid references public.profiles(id),
  tax_set_at       timestamptz,
  credits_line_id  uuid references public.finance_record_lines(id) on delete restrict,
  created_at       timestamptz not null default now(),
  unique (invoice_id, line_no),
  constraint frl_tax_shape check (
    tax_treatment is null
    or (tax_treatment in ('standard','reduced') and tax_rate_percent is not null and tax_rate_percent > 0)
    or (tax_treatment not in ('standard','reduced') and coalesce(tax_rate_percent, 0) = 0)),
  constraint frl_tax_complete check (
    (tax_treatment is null and tax_cents is null and gross_cents is null)
    or (tax_treatment is not null and tax_cents is not null and gross_cents is not null))
);
create index frl_term_idx on public.finance_record_lines (rate_term_id) where rate_term_id is not null;

create table public.finance_record_line_sources (
  id                       uuid primary key default gen_random_uuid(),
  line_id                  uuid not null references public.finance_record_lines(id) on delete cascade,
  invoice_id               uuid not null references public.finance_records(id) on delete cascade,
  journal_entry_id         uuid not null references public.journal_entries(id) on delete restrict,
  source_key               text not null,
  worker_id                uuid references public.workers(id) on delete restrict,
  work_day                 date not null,
  unit                     text,
  hours                    numeric(12,2),
  quantity                 numeric(14,4),
  evidence_class           text not null check (evidence_class in ('internal_confirmed','client_accepted')),
  internal_confirmation_id uuid not null,
  client_confirmation_id   uuid,
  entry_hash               text,
  photo_ids                uuid[] not null default '{}',
  created_at               timestamptz not null default now(),
  unique (invoice_id, journal_entry_id, source_key)
);
create index frls_entry_idx on public.finance_record_line_sources (journal_entry_id, source_key);
create index frls_line_idx  on public.finance_record_line_sources (line_id);

-- Frozen children: lines/sources may change ONLY while the parent is a draft.
create or replace function public.invoice_child_frozen_guard_v1()
returns trigger language plpgsql set search_path = public as $$
declare v_status text; v_inv uuid;
begin
  v_inv := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  select status into v_status from public.finance_records where id = v_inv;
  if found and v_status <> 'draft' then
    raise exception 'issued_invoice_is_immutable: % rows cannot change after issue', tg_table_name
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    raise exception 'line invoice is immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger finance_record_lines_frozen
  before insert or update or delete on public.finance_record_lines
  for each row execute function public.invoice_child_frozen_guard_v1();
create trigger finance_record_line_sources_frozen
  before insert or update or delete on public.finance_record_line_sources
  for each row execute function public.invoice_child_frozen_guard_v1();

-- ============================================================================
-- 8. invoice_client_responses (OPTIONAL client acceptance; append-only)
-- ============================================================================
create table public.invoice_client_responses (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.finance_records(id) on delete restrict,
  client_org_id   uuid not null references public.organizations(id),
  responded_by    uuid not null references public.profiles(id),
  decision        text not null check (decision in ('accepted','disputed','correction_requested')),
  note            text check (note is null or char_length(note) <= 1000),
  created_at      timestamptz not null default now(),
  constraint icr_note_required check (decision = 'accepted' or nullif(btrim(coalesce(note,'')), '') is not null)
);
create index icr_invoice_idx on public.invoice_client_responses (invoice_id, created_at desc);

create or replace function public.invoice_append_only_v1()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'append_only: % rows cannot be updated or deleted', tg_table_name using errcode = '55000';
end $$;
create trigger invoice_client_responses_append_only
  before update or delete on public.invoice_client_responses
  for each row execute function public.invoice_append_only_v1();

-- ============================================================================
-- 9. Frozen-header guard on finance_records (covers EVERY writer)
-- ============================================================================
create or replace function public.finance_records_issued_guard_v1()
returns trigger language plpgsql set search_path = public as $$
declare v_lifecycle boolean;
begin
  if tg_op = 'DELETE' then
    if old.record_type = 'invoice_issued' and old.status <> 'draft' then
      raise exception 'issued_invoice_is_immutable: an issued invoice cannot be deleted' using errcode = '55000';
    end if;
    return old;
  end if;
  if old.record_type <> 'invoice_issued' or old.status = 'draft' then
    return new;  -- non-issued behaviour unchanged (draft flows, expenses, received invoices)
  end if;
  v_lifecycle := old.issued_at is not null;
  if new.status = 'draft' then
    raise exception 'issued_invoice_is_immutable: an issued invoice cannot return to draft' using errcode = '55000';
  end if;
  if old.status = 'cancelled' then
    raise exception 'issued_invoice_is_immutable: a cancelled invoice is final' using errcode = '55000';
  end if;
  if new.status = 'cancelled' and v_lifecycle
     and not (old.voided_at is null and new.voided_at is not null) then
    raise exception 'issued_invoice_is_immutable: use void_or_credit_invoice_v1' using errcode = '55000';
  end if;
  if (new.id, new.record_type, new.title, new.counterparty_name, new.amount_cents, new.currency,
      new.vat_amount_cents, new.invoice_number, new.project_id, new.company_id, new.created_by,
      new.issuer_org_id, new.client_org_id, new.billing_period_id, new.invoice_kind, new.supersedes_id,
      new.issued_at, new.issued_by, new.customer_vat_id, new.customer_address, new.tax_rounding,
      new.net_total_cents, new.tax_total_cents, new.gross_total_cents, new.tax_breakdown)
     is distinct from
     (old.id, old.record_type, old.title, old.counterparty_name, old.amount_cents, old.currency,
      old.vat_amount_cents, old.invoice_number, old.project_id, old.company_id, old.created_by,
      old.issuer_org_id, old.client_org_id, old.billing_period_id, old.invoice_kind, old.supersedes_id,
      old.issued_at, old.issued_by, old.customer_vat_id, old.customer_address, old.tax_rounding,
      old.net_total_cents, old.tax_total_cents, old.gross_total_cents, old.tax_breakdown) then
    raise exception 'issued_invoice_is_immutable: amount, tax, parties and numbering are frozen after issue'
      using errcode = '55000';
  end if;
  if old.voided_at is not null
     and (new.voided_at is distinct from old.voided_at or new.void_reason is distinct from old.void_reason) then
    raise exception 'issued_invoice_is_immutable: void stamp is final' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger finance_records_issued_guard
  before update or delete on public.finance_records
  for each row execute function public.finance_records_issued_guard_v1();

-- ============================================================================
-- 10. RLS (SELECT only; writes RPC-only)
-- ============================================================================
alter table public.project_rate_terms          enable row level security;
alter table public.billing_periods             enable row level security;
alter table public.organization_tax_presets    enable row level security;
alter table public.invoice_number_sequences    enable row level security;
alter table public.finance_record_lines        enable row level security;
alter table public.finance_record_line_sources enable row level security;
alter table public.invoice_client_responses    enable row level security;

-- can the caller read this invoice HEADER row (same predicate as fr_select)
create or replace function public.invoice_can_read_v1(p_invoice_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.finance_records fr
    where fr.id = p_invoice_id
      and (fr.created_by = auth.uid() or public.is_admin()
           or public.finance_company_authority_v1(fr.company_id)
           or public.invoice_issuer_authority_v1(fr.issuer_org_id)
           or (fr.status <> 'draft' and public.invoice_client_reader_v1(fr.client_org_id))))
$$;
-- issuer side only (evidence internals are not shown to the client)
create or replace function public.invoice_issuer_side_v1(p_invoice_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.finance_records fr
    where fr.id = p_invoice_id
      and (fr.created_by = auth.uid() or public.is_admin()
           or public.finance_company_authority_v1(fr.company_id)
           or public.invoice_issuer_authority_v1(fr.issuer_org_id)))
$$;

drop policy if exists fr_select on public.finance_records;
create policy fr_select on public.finance_records
  for select to authenticated
  using (
    created_by = auth.uid()
    or public.is_admin()
    or public.finance_company_authority_v1(company_id)
    or public.invoice_issuer_authority_v1(issuer_org_id)
    or (status <> 'draft' and public.invoice_client_reader_v1(client_org_id))
  );

create policy prt_select on public.project_rate_terms for select to authenticated
  using (public.can_manage_project(project_id) or public.invoice_issuer_authority_v1(organization_id));
create policy bp_select on public.billing_periods for select to authenticated
  using (public.can_manage_project(project_id) or public.invoice_issuer_authority_v1(organization_id));
create policy otp_select on public.organization_tax_presets for select to authenticated
  using (public.invoice_issuer_authority_v1(organization_id));
create policy ins_select on public.invoice_number_sequences for select to authenticated
  using (public.invoice_issuer_authority_v1(organization_id));
create policy frl_select on public.finance_record_lines for select to authenticated
  using (public.invoice_can_read_v1(invoice_id));
create policy frls_select on public.finance_record_line_sources for select to authenticated
  using (public.invoice_issuer_side_v1(invoice_id));
create policy icr_select on public.invoice_client_responses for select to authenticated
  using (public.invoice_can_read_v1(invoice_id));

revoke all on table public.project_rate_terms, public.billing_periods, public.organization_tax_presets,
  public.invoice_number_sequences, public.finance_record_lines, public.finance_record_line_sources,
  public.invoice_client_responses from public, anon, authenticated;
grant select on table public.project_rate_terms, public.billing_periods, public.organization_tax_presets,
  public.invoice_number_sequences, public.finance_record_lines, public.finance_record_line_sources,
  public.invoice_client_responses to authenticated;

-- ============================================================================
-- 11. Tax validation + arithmetic (single definition; mirrored by the TS model)
-- ============================================================================
-- Returns the normalised rate for a treatment, or null when the pair is invalid.
create or replace function public._invoice_tax_rate_v1(p_treatment text, p_rate numeric)
returns numeric language sql immutable set search_path = public as $$
  select case
    when p_treatment in ('standard','reduced') then
      case when p_rate is not null and p_rate > 0 and p_rate <= 100 then round(p_rate, 4) end
    when p_treatment in ('zero_rated','reverse_charge','exempt','outside_scope') then
      case when coalesce(p_rate, 0) = 0 then 0::numeric end
    else null end
$$;

-- Per-line tax, half away from zero (numeric round()).
create or replace function public._invoice_line_tax_cents_v1(p_net bigint, p_rate numeric)
returns bigint language sql immutable set search_path = public as $$
  select round(p_net::numeric * p_rate / 100)::bigint
$$;

create or replace function public._invoice_recompute_totals_v1(p_invoice_id uuid)
returns void language plpgsql set search_path = public as $$
declare v_net bigint; v_unset int; v_tax bigint; v_breakdown jsonb;
begin
  select coalesce(sum(net_cents),0), count(*) filter (where tax_treatment is null),
         coalesce(sum(tax_cents),0)
    into v_net, v_unset, v_tax
    from public.finance_record_lines where invoice_id = p_invoice_id;
  if v_unset = 0 and exists (select 1 from public.finance_record_lines where invoice_id = p_invoice_id) then
    select jsonb_agg(jsonb_build_object(
             'treatment', g.tax_treatment, 'rate_percent', g.tax_rate_percent, 'note', g.tax_note,
             'net_cents', g.net, 'tax_cents', g.tax, 'gross_cents', g.gross, 'line_count', g.n)
           order by g.tax_treatment, g.tax_rate_percent, coalesce(g.tax_note,''))
      into v_breakdown
      from (select tax_treatment, tax_rate_percent, tax_note, sum(net_cents) net, sum(tax_cents) tax,
                   sum(gross_cents) gross, count(*) n
              from public.finance_record_lines where invoice_id = p_invoice_id
             group by tax_treatment, tax_rate_percent, tax_note) g;
    update public.finance_records
       set net_total_cents = v_net, tax_total_cents = v_tax, gross_total_cents = v_net + v_tax,
           tax_breakdown = v_breakdown, amount_cents = v_net + v_tax, vat_amount_cents = v_tax,
           updated_at = now()
     where id = p_invoice_id;
  else
    update public.finance_records
       set net_total_cents = v_net, tax_total_cents = null, gross_total_cents = null,
           tax_breakdown = null, amount_cents = v_net, vat_amount_cents = null, updated_at = now()
     where id = p_invoice_id;
  end if;
end $$;

-- ============================================================================
-- 12. Evidence derivation (INTERNAL; mirrors lib/journal/work-time.ts and
--     review-status.ts - see the parity notes in the PR)
-- ============================================================================
create or replace function public._invoice_period_evidence_v1(p_period_id uuid, p_exclude_invoice uuid default null)
returns table (
  entry_id uuid, worker_id uuid, work_day date, source_key text, line_kind text, unit text,
  hours numeric, quantity numeric, internal_confirmation_id uuid, client_confirmation_id uuid,
  client_state text, entry_hash text, photo_ids uuid[], eligibility text, billed_invoice_id uuid)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare v_project uuid; v_start date; v_end date; v_issuer uuid;
begin
  select bp.project_id, bp.period_start, bp.period_end, bp.organization_id into v_project, v_start, v_end, v_issuer
    from public.billing_periods bp where bp.id = p_period_id;
  if not found then return; end if;

  return query
  with live as (
    select je.id eid, je.worker_id wid, je.hash_self hs, je.created_at cat
      from public.journal_entries je
     where je.project_id = v_project and je.deleted_at is null and je.superseded_by is null
       -- only work done under the ISSUER's own engagement is the issuer's to bill
       and exists (select 1 from public.engagement_contexts ec
                    where ec.id = je.engagement_context_id and ec.organization_id = v_issuer)
       and not exists (select 1 from public.journal_entries c
                        where c.correction_of = je.id and c.deleted_at is null and c.superseded_by is null)
  ),
  ev as (
    select l.eid, l.wid, l.hs,
           coalesce((select public._invoice_safe_date_v1(m.value_text)
                       from public.journal_entry_metrics m
                      where m.entry_id = l.eid and m.metric_slug = 'work_date'
                        and public._invoice_safe_date_v1(m.value_text) is not null
                      order by m.created_at desc, m.id desc limit 1),
                    (l.cat at time zone 'utc')::date) as day,
           ic.id as ic_id, ic.dec as ic_dec, cc.id as cc_id, cc.dec as cc_dec
      from live l
      left join lateral (
        select c.id, d.dec
          from public.journal_entry_confirmations c
          cross join lateral (select coalesce(nullif(c.confirmation_scope ->> 'decision',''),
                 case c.confirmation_scope ->> 'action' when 'confirm' then 'approved'
                   when 'reject' then 'rejected' when 'request_changes' then 'changes_requested' end) as dec) d
         where c.entry_id = l.eid
           and coalesce(c.confirmation_scope #>> '{authority,basis}', 'employer') <> 'counterparty'
           and c.confirmer_id is distinct from (select w.profile_id from public.workers w where w.id = l.wid)
           and d.dec in ('approved','rejected','changes_requested')
         order by c.created_at desc, c.id desc limit 1) ic on true
      left join lateral (
        select c.id, d.dec
          from public.journal_entry_confirmations c
          cross join lateral (select coalesce(nullif(c.confirmation_scope ->> 'decision',''),
                 case c.confirmation_scope ->> 'action' when 'client_accept' then 'approved'
                   when 'client_dispute' then 'rejected'
                   when 'client_request_correction' then 'changes_requested' end) as dec) d
         where c.entry_id = l.eid
           and c.confirmation_scope #>> '{authority,basis}' = 'counterparty'
           and d.dec in ('approved','rejected','changes_requested')
         order by c.created_at desc, c.id desc limit 1) cc on true
  ),
  work as (
    -- A. per-fragment durations (first usable row per index wins)
    select e.eid, 'f' || fr.idx::text as skey, 'hours'::text as kind, 'hours'::text as unit,
           fr.h as h, null::numeric as q
      from ev e
      join lateral (
        select distinct on (m.value_text::int) m.value_text::int as idx,
               case m.unit_slug when 'hours' then round(m.value_numeric, 2)
                                else round(m.value_numeric / 60, 2) end as h
          from public.journal_entry_metrics m
         where m.entry_id = e.eid and m.metric_slug = 'fragment_time'
           and m.value_text ~ '^[1-9][0-9]{0,5}$' and m.value_numeric > 0
           and m.unit_slug in ('hours','minutes')
         order by m.value_text::int, m.created_at asc, m.id asc) fr on true
    union all
    -- B. entry-level duration (latest usable) only when there are no fragments
    select e.eid, 'e', 'hours', 'hours', x.h, null::numeric
      from ev e
      join lateral (
        select case m.unit_slug when 'hours' then round(m.value_numeric, 2)
                                else round(m.value_numeric / 60, 2) end as h
          from public.journal_entry_metrics m
         where m.entry_id = e.eid and m.metric_slug = 'quantity'
           and m.value_numeric > 0 and m.unit_slug in ('hours','minutes')
         order by m.created_at desc, m.id desc limit 1) x on true
     where not exists (select 1 from public.journal_entry_metrics f
                        where f.entry_id = e.eid and f.metric_slug = 'fragment_time'
                          and f.value_text ~ '^[1-9][0-9]{0,5}$' and f.value_numeric > 0
                          and f.unit_slug in ('hours','minutes'))
    union all
    -- C. OUTPUT quantity (non-time unit), latest per unit; never converted or summed across units
    select e.eid, 'q:' || o.unit_slug, 'quantity', o.unit_slug, null::numeric, o.value_numeric
      from ev e
      join lateral (
        select distinct on (m.unit_slug) m.unit_slug, m.value_numeric
          from public.journal_entry_metrics m
         where m.entry_id = e.eid and m.metric_slug = 'quantity'
           and m.value_numeric > 0 and m.unit_slug is not null
           and m.unit_slug not in ('hours','minutes','days')
         order by m.unit_slug, m.created_at desc, m.id desc) o on true
  )
  select e.eid, e.wid, e.day, w.skey, w.kind, w.unit, w.h, w.q, e.ic_id, e.cc_id,
         case e.cc_dec when 'approved' then 'accepted' when 'rejected' then 'disputed'
                       when 'changes_requested' then 'correction_requested' end,
         e.hs,
         coalesce((select array_agg(p.id order by p.created_at, p.id) from public.journal_entry_photos p
                    where p.entry_id = e.eid and p.upload_status = 'uploaded'), '{}'::uuid[]),
         case when e.ic_dec is distinct from 'approved' then 'not_confirmed'
              when e.cc_dec in ('rejected','changes_requested') then 'client_disputed'
              when b.invoice_id is not null then 'billed'
              else 'billable' end,
         b.invoice_id
    from ev e
    join work w on w.eid = e.eid
    left join lateral (
      select ls.invoice_id from public.finance_record_line_sources ls
        join public.finance_records f on f.id = ls.invoice_id
       where ls.journal_entry_id = e.eid and ls.source_key = w.skey
         and f.invoice_kind = 'invoice' and f.voided_at is null and f.status <> 'cancelled'
         and f.id is distinct from p_exclude_invoice
       limit 1) b on true
   where e.day between v_start and v_end;
end $$;

-- ============================================================================
-- 13. Commands
-- ============================================================================
create or replace function public._invoice_audit_v1(p_action text, p_entity text, p_id uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (auth.uid(), p_action, p_entity, p_id, p_payload);
end $$;

-- 13.1 rate terms --------------------------------------------------------
create or replace function public.add_project_rate_term_v1(
  p_project_id uuid, p_basis_type text, p_unit text, p_rate_cents bigint, p_currency text,
  p_label text, p_role_label text, p_valid_from date, p_valid_to date,
  p_org_document_id uuid default null, p_note text default null, p_issuer_org uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid(); v_org uuid; v_id uuid; v_unit text; v_cur text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select coalesce(p_issuer_org, organization_id) into v_org from public.projects where id = p_project_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_org is null then return jsonb_build_object('status','project_has_no_organization'); end if;
  if not public.invoice_issuer_project_link_v1(v_org, p_project_id) then
    return jsonb_build_object('status','not_found');
  end if;
  if p_basis_type not in ('hours','quantity','milestone','fixed')
     or p_rate_cents is null or p_rate_cents < 0 or p_valid_from is null
     or (p_valid_to is not null and p_valid_to < p_valid_from) then
    return jsonb_build_object('status','invalid');
  end if;
  v_cur := upper(btrim(coalesce(p_currency,'')));
  if v_cur !~ '^[A-Z]{3}$' then return jsonb_build_object('status','invalid'); end if;
  v_unit := case p_basis_type when 'hours' then 'hours' when 'quantity' then nullif(btrim(coalesce(p_unit,'')),'') else null end;
  if p_basis_type = 'quantity' and (v_unit is null or v_unit in ('hours','minutes','days')) then
    return jsonb_build_object('status','invalid');
  end if;
  if p_org_document_id is not null and not public.can_read_org_document_v1(p_org_document_id) then
    return jsonb_build_object('status','not_allowed');
  end if;
  -- an automatically-applied basis (hours/quantity) must not overlap another for the same unit
  if p_basis_type in ('hours','quantity') and exists (
       select 1 from public.project_rate_terms t
        where t.project_id = p_project_id and t.organization_id = v_org
          and t.basis_type = p_basis_type and t.unit is not distinct from v_unit
          and daterange(t.valid_from, coalesce(t.valid_to,'infinity'::date), '[]')
              && daterange(p_valid_from, coalesce(p_valid_to,'infinity'::date), '[]')) then
    return jsonb_build_object('status','overlapping_term');
  end if;
  insert into public.project_rate_terms (project_id, organization_id, basis_type, unit, rate_cents, currency,
      label, role_label, valid_from, valid_to, agreed_by, org_document_id, note)
  values (p_project_id, v_org, p_basis_type, v_unit, p_rate_cents, v_cur, nullif(btrim(coalesce(p_label,'')),''),
      nullif(btrim(coalesce(p_role_label,'')),''), p_valid_from, p_valid_to, uid, p_org_document_id,
      nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;
  perform public._invoice_audit_v1('add_project_rate_term','project_rate_terms', v_id,
    jsonb_build_object('project_id', p_project_id, 'basis_type', p_basis_type));
  return jsonb_build_object('status','created','id', v_id);
end $$;

create or replace function public.end_project_rate_term_v1(p_term_id uuid, p_valid_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); t record;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into t from public.project_rate_terms where id = p_term_id for update;
  if not found or not public.invoice_issuer_project_link_v1(t.organization_id, t.project_id) then
    return jsonb_build_object('status','not_found');
  end if;
  if t.valid_to is not null then return jsonb_build_object('status','already_ended'); end if;
  if p_valid_to is null or p_valid_to < t.valid_from then return jsonb_build_object('status','invalid'); end if;
  update public.project_rate_terms set valid_to = p_valid_to where id = p_term_id;
  return jsonb_build_object('status','ended');
end $$;

-- 13.2 tax presets (pre-fill only) -----------------------------------------
create or replace function public.save_org_tax_preset_v1(
  p_org_id uuid, p_label text, p_treatment text, p_rate_percent numeric, p_note_text text, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_rate numeric; v_id uuid; v_label text := btrim(coalesce(p_label,''));
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not public.invoice_issuer_authority_v1(p_org_id) then return jsonb_build_object('status','not_found'); end if;
  v_rate := public._invoice_tax_rate_v1(p_treatment, p_rate_percent);
  if v_rate is null or char_length(v_label) not between 1 and 80
     or char_length(coalesce(p_note_text,'')) > 500 then
    return jsonb_build_object('status','invalid');
  end if;
  insert into public.organization_tax_presets (organization_id, label, treatment, rate_percent, note_text, active, created_by)
  values (p_org_id, v_label, p_treatment, case when p_treatment in ('standard','reduced') then v_rate end,
          nullif(btrim(coalesce(p_note_text,'')),''), coalesce(p_active,true), uid)
  on conflict (organization_id, label) do update
     set treatment = excluded.treatment, rate_percent = excluded.rate_percent,
         note_text = excluded.note_text, active = excluded.active, updated_at = now()
  returning id into v_id;
  return jsonb_build_object('status','saved','id', v_id);
end $$;

-- 13.3 billing periods --------------------------------------------------------
create or replace function public.create_billing_period_v1(
  p_project_id uuid, p_start date, p_end date, p_issuer_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_org uuid; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select coalesce(p_issuer_org, organization_id) into v_org from public.projects where id = p_project_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  if v_org is null then return jsonb_build_object('status','project_has_no_organization'); end if;
  if not public.invoice_issuer_project_link_v1(v_org, p_project_id) then return jsonb_build_object('status','not_found'); end if;
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 400 then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text, 0));
  if exists (select 1 from public.billing_periods b where b.project_id = p_project_id and b.organization_id = v_org
              and daterange(b.period_start, b.period_end, '[]') && daterange(p_start, p_end, '[]')) then
    return jsonb_build_object('status','overlapping_period');
  end if;
  insert into public.billing_periods (project_id, organization_id, period_start, period_end, created_by)
  values (p_project_id, v_org, p_start, p_end, uid) returning id into v_id;
  return jsonb_build_object('status','created','id', v_id);
end $$;

create or replace function public.mark_billing_period_ready_v1(p_period_id uuid, p_ready boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); b record;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into b from public.billing_periods where id = p_period_id for update;
  if not found or not public.invoice_issuer_project_link_v1(b.organization_id, b.project_id) then
    return jsonb_build_object('status','not_found');
  end if;
  if b.status = 'invoiced' then return jsonb_build_object('status','period_locked'); end if;
  update public.billing_periods set status = case when p_ready then 'ready' else 'open' end where id = p_period_id;
  return jsonb_build_object('status','updated');
end $$;

-- 13.4 read-only evidence preview (what WOULD be billed, and why not) ----------
create or replace function public.billing_period_preview_v1(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_rows jsonb; v_terms jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into b from public.billing_periods where id = p_period_id;
  if not found or not (public.can_manage_project(b.project_id)
                        or public.invoice_issuer_project_link_v1(b.organization_id, b.project_id)) then
    return jsonb_build_object('status','not_found');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'entry_id', e.entry_id, 'work_day', e.work_day, 'source_key', e.source_key, 'kind', e.line_kind,
      'unit', e.unit, 'hours', e.hours, 'quantity', e.quantity, 'eligibility', e.eligibility,
      'client_state', e.client_state, 'evidence_class',
      case when e.client_state = 'accepted' then 'client_accepted' else 'internal_confirmed' end,
      'photo_count', coalesce(array_length(e.photo_ids,1),0), 'billed_invoice_id', e.billed_invoice_id,
      'term_id', (select t.id from public.project_rate_terms t
                   where t.project_id = b.project_id and t.organization_id = b.organization_id
                     and t.basis_type = e.line_kind and t.unit is not distinct from e.unit
                     and t.valid_from <= e.work_day and (t.valid_to is null or e.work_day <= t.valid_to)
                   limit 1))
      order by e.work_day, e.entry_id, e.source_key), '[]'::jsonb)
    into v_rows from public._invoice_period_evidence_v1(p_period_id) e;
  return jsonb_build_object('status','ok','period_id', p_period_id, 'rows', v_rows);
end $$;

-- 13.5 draft from period -----------------------------------------------------
create or replace function public.create_invoice_draft_from_period_v1(
  p_period_id uuid, p_customer_name text, p_client_org_id uuid default null,
  p_customer_vat_id text default null, p_customer_address text default null,
  p_due_date date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); b record; pr record; v_name text := btrim(coalesce(p_customer_name,''));
  v_inv uuid; v_currency text; v_n int := 0; g record; v_line uuid; v_unpriced jsonb; v_ambiguous int;
  v_company uuid; v_net bigint;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into b from public.billing_periods where id = p_period_id for update;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into pr from public.projects where id = b.project_id;
  if not public.invoice_issuer_project_link_v1(b.organization_id, b.project_id) then
    return jsonb_build_object('status','not_found');
  end if;
  if b.status = 'invoiced' then return jsonb_build_object('status','period_locked'); end if;
  if char_length(v_name) not between 2 and 160 or char_length(coalesce(p_note,'')) > 1000 then
    return jsonb_build_object('status','invalid');
  end if;
  if p_client_org_id is not null and (p_client_org_id = b.organization_id
       or not exists (select 1 from public.organizations o where o.id = p_client_org_id)) then
    return jsonb_build_object('status','invalid_client_org');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(b.project_id::text, 0));
  if exists (select 1 from public.finance_records f where f.billing_period_id = b.id
              and f.invoice_kind = 'invoice' and f.voided_at is null and f.status <> 'cancelled') then
    return jsonb_build_object('status','already_has_invoice');
  end if;

  create temp table _inv_pick on commit drop as
    select e.*, (select count(*) from public.project_rate_terms t
                  where t.project_id = b.project_id and t.organization_id = b.organization_id and t.basis_type = e.line_kind and t.unit is not distinct from e.unit
                    and t.valid_from <= e.work_day and (t.valid_to is null or e.work_day <= t.valid_to)) as term_n,
           (select t.id from public.project_rate_terms t
             where t.project_id = b.project_id and t.organization_id = b.organization_id and t.basis_type = e.line_kind and t.unit is not distinct from e.unit
               and t.valid_from <= e.work_day and (t.valid_to is null or e.work_day <= t.valid_to)
             order by t.valid_from desc limit 1) as term_id
      from public._invoice_period_evidence_v1(b.id) e
     where e.eligibility = 'billable';

  select count(*) into v_ambiguous from _inv_pick where term_n > 1;
  if v_ambiguous > 0 then
    drop table _inv_pick;
    return jsonb_build_object('status','ambiguous_rate_terms','rows', v_ambiguous);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('entry_id', entry_id, 'source_key', source_key,
           'work_day', work_day, 'unit', unit) order by work_day, entry_id), '[]'::jsonb)
    into v_unpriced from _inv_pick where term_n = 0;
  delete from _inv_pick where term_n = 0;
  if not exists (select 1 from _inv_pick) then
    drop table _inv_pick;
    return jsonb_build_object('status','nothing_billable','unpriced', v_unpriced);
  end if;
  select string_agg(distinct t.currency::text, ',') into v_currency
    from _inv_pick p join public.project_rate_terms t on t.id = p.term_id;
  if position(',' in v_currency) > 0 then
    drop table _inv_pick;
    return jsonb_build_object('status','mixed_currency');
  end if;

  select o.legacy_company_id into v_company from public.organizations o where o.id = b.organization_id;
  insert into public.finance_records (record_type, title, counterparty_name, amount_cents, currency, status,
      due_date, project_id, company_id, note, created_by, issuer_org_id, client_org_id, billing_period_id,
      customer_vat_id, customer_address, invoice_kind)
  values ('invoice_issued', 'Project invoice ' || b.period_start::text || ' - ' || b.period_end::text,
      v_name, 0, v_currency, 'draft', p_due_date, b.project_id, v_company, nullif(btrim(coalesce(p_note,'')),''),
      uid, b.organization_id, p_client_org_id, b.id,
      nullif(btrim(coalesce(p_customer_vat_id,'')),''), nullif(btrim(coalesce(p_customer_address,'')),''), 'invoice')
  returning id into v_inv;

  for g in
    select p.term_id, t.basis_type, t.unit, t.rate_cents, t.label,
           sum(coalesce(p.hours, p.quantity)) as qty,
           sum(case when p.client_state = 'accepted' then coalesce(p.hours, p.quantity) else 0 end) as qty_client
      from _inv_pick p join public.project_rate_terms t on t.id = p.term_id
     group by p.term_id, t.basis_type, t.unit, t.rate_cents, t.label
     order by t.basis_type, t.unit nulls first, p.term_id
  loop
    v_n := v_n + 1;
    v_net := round(g.qty * g.rate_cents)::bigint;
    insert into public.finance_record_lines (invoice_id, line_no, basis_type, description, rate_term_id, unit,
        quantity, unit_price_cents, net_cents, currency, evidence_class, qty_client_accepted, confirmed_by, confirmed_at)
    values (v_inv, v_n, g.basis_type, g.label, g.term_id, g.unit, g.qty, g.rate_cents, v_net, v_currency,
        'internal_confirmed', g.qty_client, null, null)
    returning id into v_line;
    insert into public.finance_record_line_sources (line_id, invoice_id, journal_entry_id, source_key, worker_id,
        work_day, unit, hours, quantity, evidence_class, internal_confirmation_id, client_confirmation_id,
        entry_hash, photo_ids)
    select v_line, v_inv, p.entry_id, p.source_key, p.worker_id, p.work_day, p.unit, p.hours, p.quantity,
           case when p.client_state = 'accepted' then 'client_accepted' else 'internal_confirmed' end,
           p.internal_confirmation_id, case when p.client_state = 'accepted' then p.client_confirmation_id end,
           p.entry_hash, p.photo_ids
      from _inv_pick p where p.term_id = g.term_id;
  end loop;
  drop table _inv_pick;

  perform public._invoice_recompute_totals_v1(v_inv);
  perform public._invoice_audit_v1('create_invoice_draft','finance_records', v_inv,
    jsonb_build_object('period_id', b.id, 'lines', v_n, 'unpriced', jsonb_array_length(v_unpriced)));
  return jsonb_build_object('status','created','invoice_id', v_inv, 'lines', v_n, 'unpriced', v_unpriced);
end $$;

-- 13.6 milestone / fixed basis line (the authorized representative confirms) ----
create or replace function public.add_invoice_basis_line_v1(
  p_invoice_id uuid, p_rate_term_id uuid, p_quantity numeric default 1, p_description text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f record; t record; v_no int; v_net bigint; v_qty numeric := coalesce(p_quantity,1);
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' or f.invoice_kind <> 'invoice' or f.billing_period_id is null then return jsonb_build_object('status','not_draft'); end if;
  select * into t from public.project_rate_terms where id = p_rate_term_id;
  if not found or t.project_id is distinct from f.project_id or t.basis_type not in ('milestone','fixed') then
    return jsonb_build_object('status','invalid_term');
  end if;
  if t.currency::text <> f.currency::text then return jsonb_build_object('status','mixed_currency'); end if;
  if v_qty <= 0 or v_qty > 1000000 or char_length(coalesce(p_description,'')) > 300 then return jsonb_build_object('status','invalid'); end if;
  if exists (select 1 from public.finance_record_lines l join public.finance_records x on x.id = l.invoice_id
              where l.rate_term_id = p_rate_term_id and x.invoice_kind = 'invoice'
                and x.voided_at is null and x.status <> 'cancelled' and x.id <> p_invoice_id)
     and t.basis_type = 'fixed' then
    return jsonb_build_object('status','already_billed');
  end if;
  select coalesce(max(line_no),0) + 1 into v_no from public.finance_record_lines where invoice_id = p_invoice_id;
  v_net := round(v_qty * t.rate_cents)::bigint;
  insert into public.finance_record_lines (invoice_id, line_no, basis_type, description, rate_term_id, unit,
      quantity, unit_price_cents, net_cents, currency, evidence_class, confirmed_by, confirmed_at)
  values (p_invoice_id, v_no, t.basis_type, coalesce(nullif(btrim(coalesce(p_description,'')),''), t.label), t.id,
      null, v_qty, t.rate_cents, v_net, f.currency, 'agreed_basis', uid, now());
  perform public._invoice_recompute_totals_v1(p_invoice_id);
  return jsonb_build_object('status','added','line_no', v_no);
end $$;

-- 13.7 tax: per line and per invoice (explicit; snapshot) ------------------------
create or replace function public.set_invoice_line_tax_v1(
  p_line_id uuid, p_treatment text, p_rate_percent numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); l record; f record; v_rate numeric; v_tax bigint;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into l from public.finance_record_lines where id = p_line_id;
  if not found then return jsonb_build_object('status','not_found'); end if;
  select * into f from public.finance_records where id = l.invoice_id for update;
  if not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' then return jsonb_build_object('status','issued_invoice_is_immutable'); end if;
  v_rate := public._invoice_tax_rate_v1(p_treatment, p_rate_percent);
  if v_rate is null or char_length(coalesce(p_note,'')) > 500 then return jsonb_build_object('status','invalid'); end if;
  v_tax := public._invoice_line_tax_cents_v1(l.net_cents, v_rate);
  update public.finance_record_lines
     set tax_treatment = p_treatment, tax_rate_percent = v_rate,
         tax_note = nullif(btrim(coalesce(p_note,'')),''), tax_cents = v_tax, gross_cents = l.net_cents + v_tax,
         tax_set_by = uid, tax_set_at = now()
   where id = p_line_id;
  perform public._invoice_recompute_totals_v1(l.invoice_id);
  return jsonb_build_object('status','updated','tax_cents', v_tax);
end $$;

create or replace function public.set_invoice_tax_v1(
  p_invoice_id uuid, p_treatment text, p_rate_percent numeric, p_note text default null,
  p_only_unset boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f record; v_rate numeric; n int := 0; l record; v_tax bigint;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' then return jsonb_build_object('status','issued_invoice_is_immutable'); end if;
  v_rate := public._invoice_tax_rate_v1(p_treatment, p_rate_percent);
  if v_rate is null or char_length(coalesce(p_note,'')) > 500 then return jsonb_build_object('status','invalid'); end if;
  for l in select * from public.finance_record_lines where invoice_id = p_invoice_id
            and (not coalesce(p_only_unset,true) or tax_treatment is null) loop
    v_tax := public._invoice_line_tax_cents_v1(l.net_cents, v_rate);
    update public.finance_record_lines
       set tax_treatment = p_treatment, tax_rate_percent = v_rate,
           tax_note = nullif(btrim(coalesce(p_note,'')),''), tax_cents = v_tax, gross_cents = l.net_cents + v_tax,
           tax_set_by = uid, tax_set_at = now()
     where id = l.id;
    n := n + 1;
  end loop;
  perform public._invoice_recompute_totals_v1(p_invoice_id);
  return jsonb_build_object('status','updated','lines', n);
end $$;

create or replace function public.update_invoice_draft_details_v1(
  p_invoice_id uuid, p_customer_name text, p_client_org_id uuid, p_customer_vat_id text,
  p_customer_address text, p_due_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; v_name text := btrim(coalesce(p_customer_name,''));
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' then return jsonb_build_object('status','issued_invoice_is_immutable'); end if;
  if char_length(v_name) not between 2 and 160 or char_length(coalesce(p_note,'')) > 1000 then return jsonb_build_object('status','invalid'); end if;
  if p_client_org_id is not null and (p_client_org_id = f.issuer_org_id
       or not exists (select 1 from public.organizations o where o.id = p_client_org_id)) then
    return jsonb_build_object('status','invalid_client_org');
  end if;
  update public.finance_records set counterparty_name = v_name, client_org_id = p_client_org_id,
         customer_vat_id = nullif(btrim(coalesce(p_customer_vat_id,'')),''),
         customer_address = nullif(btrim(coalesce(p_customer_address,'')),''),
         due_date = p_due_date, note = nullif(btrim(coalesce(p_note,'')),''), updated_at = now()
   where id = p_invoice_id;
  return jsonb_build_object('status','updated');
end $$;

create or replace function public.discard_invoice_draft_v1(p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' or f.billing_period_id is null then return jsonb_build_object('status','not_draft'); end if;
  delete from public.finance_records where id = p_invoice_id;  -- lines + sources cascade (draft only)
  return jsonb_build_object('status','discarded');
end $$;

-- 13.8 issue ------------------------------------------------------------------
create or replace function public.issue_invoice_v1(p_invoice_id uuid, p_tax_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); f record; b record; v_unset int; v_lines int; v_changed int; v_seq record; v_no bigint;
  v_number text;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if f.status <> 'draft' or f.invoice_kind <> 'invoice' or f.billing_period_id is null then return jsonb_build_object('status','not_draft'); end if;
  if p_tax_confirmed is distinct from true then return jsonb_build_object('status','tax_confirmation_required'); end if;
  select count(*), count(*) filter (where tax_treatment is null) into v_lines, v_unset
    from public.finance_record_lines where invoice_id = p_invoice_id;
  if v_lines = 0 then return jsonb_build_object('status','no_lines'); end if;
  if v_unset > 0 then return jsonb_build_object('status','tax_treatment_missing','lines', v_unset); end if;
  select * into b from public.billing_periods where id = f.billing_period_id for update;
  if b.status = 'invoiced' then return jsonb_build_object('status','period_locked'); end if;
  perform pg_advisory_xact_lock(hashtextextended(b.project_id::text, 0));
  -- every journal source must STILL be the same confirmed evidence it was at draft time
  select count(*) into v_changed from public.finance_record_line_sources s
   where s.invoice_id = p_invoice_id
     and not exists (select 1 from public._invoice_period_evidence_v1(b.id, p_invoice_id) e
                      where e.entry_id = s.journal_entry_id and e.source_key = s.source_key
                        and e.eligibility = 'billable'
                        and e.hours is not distinct from s.hours and e.quantity is not distinct from s.quantity);
  if v_changed > 0 then return jsonb_build_object('status','evidence_changed','sources', v_changed); end if;

  insert into public.invoice_number_sequences (organization_id, series) values (f.issuer_org_id, 'invoice')
    on conflict do nothing;
  select * into v_seq from public.invoice_number_sequences
   where organization_id = f.issuer_org_id and series = 'invoice' for update;
  v_no := v_seq.next_number;
  v_number := v_seq.prefix || lpad(v_no::text, v_seq.pad, '0');
  update public.invoice_number_sequences set next_number = v_no + 1
   where organization_id = f.issuer_org_id and series = 'invoice';

  perform public._invoice_recompute_totals_v1(p_invoice_id);
  update public.finance_records
     set status = 'issued', issued_at = now(), issued_by = uid, invoice_number = v_number, updated_at = now()
   where id = p_invoice_id;
  update public.billing_periods set status = 'invoiced', locked_at = now(), locked_by = uid where id = b.id;
  perform public._invoice_audit_v1('issue_invoice','finance_records', p_invoice_id,
    jsonb_build_object('number', v_number, 'period_id', b.id));
  return jsonb_build_object('status','issued','invoice_number', v_number);
end $$;

-- 13.9 void / credit -----------------------------------------------------------
create or replace function public.void_or_credit_invoice_v1(p_invoice_id uuid, p_mode text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); f record; v_seq record; v_no bigint; v_number text; v_cn uuid; v_reason text := btrim(coalesce(p_reason,''));
  l record; v_newline uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id for update;
  if not found or not public.invoice_issuer_authority_v1(f.issuer_org_id) then return jsonb_build_object('status','not_found'); end if;
  if exists (select 1 from public.finance_records c where c.supersedes_id = f.id) then return jsonb_build_object('status','already_credited'); end if;
  if f.invoice_kind <> 'invoice' or f.issued_at is null or f.voided_at is not null then return jsonb_build_object('status','not_issued_invoice'); end if;
  if p_mode not in ('void','credit_note') or char_length(v_reason) not between 3 and 500 then return jsonb_build_object('status','invalid'); end if;
  if p_mode = 'void' and f.status <> 'issued' then return jsonb_build_object('status','void_requires_unpaid'); end if;
  if f.status not in ('issued','partially_paid','paid') then return jsonb_build_object('status','invalid_state'); end if;
  if exists (select 1 from public.finance_records c where c.supersedes_id = f.id) then return jsonb_build_object('status','already_credited'); end if;

  insert into public.invoice_number_sequences (organization_id, series, prefix) values (f.issuer_org_id, 'credit_note', 'CN-')
    on conflict do nothing;
  select * into v_seq from public.invoice_number_sequences
   where organization_id = f.issuer_org_id and series = 'credit_note' for update;
  v_no := v_seq.next_number;
  v_number := v_seq.prefix || lpad(v_no::text, v_seq.pad, '0');
  update public.invoice_number_sequences set next_number = v_no + 1
   where organization_id = f.issuer_org_id and series = 'credit_note';

  -- credit note is built as a DRAFT so its lines can be copied, then issued in the same transaction
  insert into public.finance_records (record_type, title, counterparty_name, amount_cents, currency, status,
      project_id, company_id, created_by, issuer_org_id, client_org_id, billing_period_id, invoice_kind,
      supersedes_id, customer_vat_id, customer_address, tax_rounding, note)
  values ('invoice_issued', 'Credit note for ' || coalesce(f.invoice_number,'invoice'), f.counterparty_name, 0,
      f.currency, 'draft', f.project_id, f.company_id, uid, f.issuer_org_id, f.client_org_id, f.billing_period_id,
      'credit_note', f.id, f.customer_vat_id, f.customer_address, f.tax_rounding, v_reason)
  returning id into v_cn;
  for l in select * from public.finance_record_lines where invoice_id = f.id order by line_no loop
    insert into public.finance_record_lines (invoice_id, line_no, basis_type, description, rate_term_id, unit, quantity,
        unit_price_cents, net_cents, currency, evidence_class, qty_client_accepted, confirmed_by, confirmed_at,
        tax_treatment, tax_rate_percent, tax_note, tax_cents, gross_cents, tax_set_by, tax_set_at, credits_line_id)
    values (v_cn, l.line_no, l.basis_type, l.description, l.rate_term_id, l.unit, l.quantity, l.unit_price_cents,
        l.net_cents, l.currency, l.evidence_class, l.qty_client_accepted, l.confirmed_by, l.confirmed_at,
        l.tax_treatment, l.tax_rate_percent, l.tax_note, l.tax_cents, l.gross_cents, l.tax_set_by, l.tax_set_at, l.id);
  end loop;
  perform public._invoice_recompute_totals_v1(v_cn);
  update public.finance_records
     set status = 'issued', issued_at = now(), issued_by = uid, invoice_number = v_number, updated_at = now()
   where id = v_cn;

  if p_mode = 'void' then
    update public.finance_records
       set status = 'cancelled', voided_at = now(), voided_by = uid, void_reason = v_reason, updated_at = now()
     where id = f.id;
    -- release the period so a corrected invoice can be built; the voided invoice + credit note remain as history
    update public.billing_periods set status = 'open', locked_at = null, locked_by = null where id = f.billing_period_id;
  end if;
  perform public._invoice_audit_v1('void_or_credit_invoice','finance_records', f.id,
    jsonb_build_object('mode', p_mode, 'credit_note_id', v_cn));
  return jsonb_build_object('status', case p_mode when 'void' then 'voided' else 'credited' end,
                            'credit_note_id', v_cn, 'credit_note_number', v_number);
end $$;

-- 13.10 OPTIONAL client response ---------------------------------------------------
create or replace function public.record_invoice_client_response_v1(
  p_invoice_id uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f record; v_id uuid;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into f from public.finance_records where id = p_invoice_id;
  if not found or f.status = 'draft' or not public.invoice_client_reader_v1(f.client_org_id) then
    return jsonb_build_object('status','not_found');
  end if;
  if f.invoice_kind <> 'invoice' or f.voided_at is not null then return jsonb_build_object('status','not_respondable'); end if;
  -- the issuer's own people are not the client's representative
  if public.profile_is_member_of_organization_v1(uid, f.issuer_org_id) then return jsonb_build_object('status','not_allowed'); end if;
  if p_decision not in ('accepted','disputed','correction_requested')
     or (p_decision <> 'accepted' and nullif(btrim(coalesce(p_note,'')),'') is null)
     or char_length(coalesce(p_note,'')) > 1000 then
    return jsonb_build_object('status','invalid');
  end if;
  insert into public.invoice_client_responses (invoice_id, client_org_id, responded_by, decision, note)
  values (p_invoice_id, f.client_org_id, uid, p_decision, nullif(btrim(coalesce(p_note,'')),''))
  returning id into v_id;
  perform public._invoice_audit_v1('invoice_client_response','finance_records', p_invoice_id,
    jsonb_build_object('decision', p_decision));
  return jsonb_build_object('status','recorded','id', v_id);
end $$;

-- 13.11 changes since invoice (derived, never stale) ---------------------------------
create or replace function public.billing_period_changes_v1(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b record; v_inv uuid; v_changes jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select * into b from public.billing_periods where id = p_period_id;
  if not found or not (public.can_manage_project(b.project_id)
                        or public.invoice_issuer_project_link_v1(b.organization_id, b.project_id)) then
    return jsonb_build_object('status','not_found');
  end if;
  select f.id into v_inv from public.finance_records f
   where f.billing_period_id = b.id and f.invoice_kind = 'invoice' and f.voided_at is null and f.status <> 'cancelled'
     and f.issued_at is not null;
  if v_inv is null then return jsonb_build_object('status','no_issued_invoice','changes','[]'::jsonb); end if;
  select coalesce(jsonb_agg(x order by x ->> 'entry_id', x ->> 'source_key'), '[]'::jsonb) into v_changes from (
    -- new evidence confirmed after the lock (not on the invoice)
    select jsonb_build_object('kind','new_evidence','entry_id', e.entry_id, 'source_key', e.source_key,
             'hours', e.hours, 'quantity', e.quantity, 'work_day', e.work_day) as x
      from public._invoice_period_evidence_v1(b.id, v_inv) e
     where e.eligibility = 'billable'
       and not exists (select 1 from public.finance_record_line_sources s
                        where s.invoice_id = v_inv and s.journal_entry_id = e.entry_id and s.source_key = e.source_key)
    union all
    -- invoiced sources that are no longer the same confirmed evidence
    select jsonb_build_object('kind', case when e.entry_id is null then 'withdrawn'
                                           when e.eligibility <> 'billable' then 'no_longer_confirmed'
                                           else 'changed' end,
             'entry_id', s.journal_entry_id, 'source_key', s.source_key,
             'invoiced_hours', s.hours, 'invoiced_quantity', s.quantity,
             'current_hours', e.hours, 'current_quantity', e.quantity)
      from public.finance_record_line_sources s
      left join public._invoice_period_evidence_v1(b.id, v_inv) e
        on e.entry_id = s.journal_entry_id and e.source_key = s.source_key
     where s.invoice_id = v_inv
       and (e.entry_id is null or e.eligibility <> 'billable'
            or e.hours is distinct from s.hours or e.quantity is distinct from s.quantity)
  ) q;
  return jsonb_build_object('status','ok','invoice_id', v_inv, 'changes', v_changes);
end $$;

-- ============================================================================
-- 14. REPLACED write RPCs: an issued invoice cannot change silently
--     (bodies of v1/v2 otherwise IDENTICAL to production; guard added)
-- ============================================================================
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
  v_cur      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null then return 'invalid'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then return 'invalid'; end if;
  if v_cp is null or char_length(v_cp) < 2 or char_length(v_cp) > 160 then return 'invalid'; end if;
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then return 'invalid'; end if;
  if v_note is not null and char_length(v_note) > 1000 then return 'invalid'; end if;
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;

  select fr.record_type, fr.status, fr.title, fr.counterparty_name, fr.amount_cents, fr.billing_period_id
    into v_cur from public.finance_records fr
   where fr.id = v_id
     and (fr.created_by = uid or public.is_admin() or public.finance_company_authority_v1(fr.company_id)
          or public.invoice_issuer_authority_v1(fr.issuer_org_id))
   for update;
  if not found then return 'not_found'; end if;
  -- ISSUED INVOICE: parties, title and amount are frozen; only due date and note may change.
  if v_cur.record_type = 'invoice_issued' and v_cur.status <> 'draft'
     and (v_title is distinct from v_cur.title or v_cp is distinct from v_cur.counterparty_name
          or v_amount is distinct from v_cur.amount_cents) then
    return 'immutable_issued';
  end if;
  if v_cur.billing_period_id is not null and v_amount is distinct from v_cur.amount_cents then
    return 'computed_amount';
  end if;

  update public.finance_records fr
     set title = v_title, counterparty_name = v_cp, amount_cents = v_amount,
         due_date = v_due, note = v_note, updated_at = now()
   where fr.id = v_id;
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
  v_cur      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null then return 'invalid'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 160 then return 'invalid'; end if;
  if v_cp is null or char_length(v_cp) < 2 or char_length(v_cp) > 160 then return 'invalid'; end if;
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then return 'invalid'; end if;
  if v_note is not null and char_length(v_note) > 1000 then return 'invalid'; end if;
  if v_inv_no is not null and char_length(v_inv_no) > 60 then return 'invalid'; end if;
  if v_vat_text is not null then
    if v_vat_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
    v_vat := v_vat_text::bigint;
    if v_vat < 0 or v_vat > 100000000000 then return 'invalid'; end if;
  end if;
  if nullif(trim(coalesce(p_due_date, '')), '') is not null then
    v_due := trim(p_due_date)::date;
  end if;
  if v_org_doc is not null and not public.can_read_org_document_v1(v_org_doc) then
    return 'not_allowed';
  end if;

  select fr.record_type, fr.status, fr.title, fr.counterparty_name, fr.amount_cents, fr.vat_amount_cents,
         fr.invoice_number, fr.billing_period_id
    into v_cur from public.finance_records fr
   where fr.id = v_id
     and (fr.created_by = uid or public.is_admin() or public.finance_company_authority_v1(fr.company_id)
          or public.invoice_issuer_authority_v1(fr.issuer_org_id))
   for update;
  if not found then return 'not_found'; end if;
  -- ISSUED INVOICE: amount, VAT, parties, number and title are frozen; due date, note, document may change.
  if v_cur.record_type = 'invoice_issued' and v_cur.status <> 'draft'
     and (v_title is distinct from v_cur.title or v_cp is distinct from v_cur.counterparty_name
          or v_amount is distinct from v_cur.amount_cents
          or v_vat is distinct from v_cur.vat_amount_cents
          or v_inv_no is distinct from v_cur.invoice_number) then
    return 'immutable_issued';
  end if;
  -- a lifecycle draft's amount, VAT and number are computed/assigned by the lifecycle commands
  if v_cur.billing_period_id is not null
     and (v_amount is distinct from v_cur.amount_cents or v_vat is distinct from v_cur.vat_amount_cents
          or v_inv_no is distinct from v_cur.invoice_number) then
    return 'computed_amount';
  end if;

  update public.finance_records fr
     set title = v_title, counterparty_name = v_cp, amount_cents = v_amount, due_date = v_due, note = v_note,
         invoice_number = v_inv_no, vat_amount_cents = v_vat, org_document_id = v_org_doc, updated_at = now()
   where fr.id = v_id;
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
  v_cur    record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_id is null or v_status is null
     or v_status not in ('draft','issued','partially_paid','paid','cancelled') then
    return 'invalid';
  end if;

  select fr.record_type, fr.status, fr.issued_at, fr.billing_period_id, fr.invoice_kind
    into v_cur from public.finance_records fr
   where fr.id = v_id
     and (fr.created_by = uid or public.is_admin() or public.finance_company_authority_v1(fr.company_id)
          or public.invoice_issuer_authority_v1(fr.issuer_org_id))
   for update;
  if not found then return 'not_found'; end if;

  if v_cur.record_type = 'invoice_issued' then
    -- an issued invoice never goes back to draft; a cancelled one is final
    if v_cur.status <> 'draft' and v_status = 'draft' then return 'invalid_transition'; end if;
    if v_cur.status = 'cancelled' and v_status <> 'cancelled' then return 'invalid_transition'; end if;
    -- lifecycle invoices: issue / void go through their own commands
    if v_cur.billing_period_id is not null and v_cur.status = 'draft' and v_status <> 'draft' then
      return 'use_issue_invoice';
    end if;
    if v_cur.issued_at is not null and v_status = 'cancelled' then return 'use_void_or_credit'; end if;
    if v_cur.invoice_kind = 'credit_note' and v_status <> v_cur.status then return 'not_applicable'; end if;
  end if;

  update public.finance_records fr
     set status = v_status, paid_at = case when v_status = 'paid' then now() else null end, updated_at = now()
   where fr.id = v_id;
  return 'updated';
exception
  when invalid_text_representation then
    return 'invalid';
end $$;

-- ============================================================================
-- 15. Grants (explicit; anon + PUBLIC revoked on EVERY new function)
-- ============================================================================
-- INTERNAL helpers and trigger functions: no direct caller (definer-invoked or trigger-only).
revoke all on function public._invoice_audit_v1(text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public._invoice_line_tax_cents_v1(bigint, numeric) from public, anon, authenticated;
revoke all on function public._invoice_period_evidence_v1(uuid, uuid) from public, anon, authenticated;
revoke all on function public._invoice_recompute_totals_v1(uuid) from public, anon, authenticated;
revoke all on function public._invoice_safe_date_v1(text) from public, anon, authenticated;
revoke all on function public._invoice_tax_rate_v1(text, numeric) from public, anon, authenticated;
revoke all on function public.billing_periods_guard_v1() from public, anon, authenticated;
revoke all on function public.finance_records_issued_guard_v1() from public, anon, authenticated;
revoke all on function public.invoice_append_only_v1() from public, anon, authenticated;
revoke all on function public.invoice_child_frozen_guard_v1() from public, anon, authenticated;
revoke all on function public.project_rate_terms_guard_v1() from public, anon, authenticated;

-- USER-FACING commands and RLS predicates: authenticated only (anon + PUBLIC revoked).
revoke all on function public.add_invoice_basis_line_v1(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.add_invoice_basis_line_v1(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.add_project_rate_term_v1(uuid, text, text, bigint, text, text, text, date, date, uuid, text, uuid) from public, anon;
grant execute on function public.add_project_rate_term_v1(uuid, text, text, bigint, text, text, text, date, date, uuid, text, uuid) to authenticated;
revoke all on function public.billing_period_changes_v1(uuid) from public, anon;
grant execute on function public.billing_period_changes_v1(uuid) to authenticated;
revoke all on function public.billing_period_preview_v1(uuid) from public, anon;
grant execute on function public.billing_period_preview_v1(uuid) to authenticated;
revoke all on function public.create_billing_period_v1(uuid, date, date, uuid) from public, anon;
grant execute on function public.create_billing_period_v1(uuid, date, date, uuid) to authenticated;
revoke all on function public.create_invoice_draft_from_period_v1(uuid, text, uuid, text, text, date, text) from public, anon;
grant execute on function public.create_invoice_draft_from_period_v1(uuid, text, uuid, text, text, date, text) to authenticated;
revoke all on function public.discard_invoice_draft_v1(uuid) from public, anon;
grant execute on function public.discard_invoice_draft_v1(uuid) to authenticated;
revoke all on function public.end_project_rate_term_v1(uuid, date) from public, anon;
grant execute on function public.end_project_rate_term_v1(uuid, date) to authenticated;
revoke all on function public.invoice_can_read_v1(uuid) from public, anon;
grant execute on function public.invoice_can_read_v1(uuid) to authenticated;
revoke all on function public.invoice_client_reader_v1(uuid) from public, anon;
grant execute on function public.invoice_client_reader_v1(uuid) to authenticated;
revoke all on function public.invoice_issuer_authority_v1(uuid) from public, anon;
grant execute on function public.invoice_issuer_authority_v1(uuid) to authenticated;
revoke all on function public.invoice_issuer_project_link_v1(uuid, uuid) from public, anon;
grant execute on function public.invoice_issuer_project_link_v1(uuid, uuid) to authenticated;
revoke all on function public.invoice_issuer_side_v1(uuid) from public, anon;
grant execute on function public.invoice_issuer_side_v1(uuid) to authenticated;
revoke all on function public.issue_invoice_v1(uuid, boolean) from public, anon;
grant execute on function public.issue_invoice_v1(uuid, boolean) to authenticated;
revoke all on function public.mark_billing_period_ready_v1(uuid, boolean) from public, anon;
grant execute on function public.mark_billing_period_ready_v1(uuid, boolean) to authenticated;
revoke all on function public.record_invoice_client_response_v1(uuid, text, text) from public, anon;
grant execute on function public.record_invoice_client_response_v1(uuid, text, text) to authenticated;
revoke all on function public.save_org_tax_preset_v1(uuid, text, text, numeric, text, boolean) from public, anon;
grant execute on function public.save_org_tax_preset_v1(uuid, text, text, numeric, text, boolean) to authenticated;
revoke all on function public.set_finance_record_status_v1(text, text) from public, anon;
grant execute on function public.set_finance_record_status_v1(text, text) to authenticated;
revoke all on function public.set_invoice_line_tax_v1(uuid, text, numeric, text) from public, anon;
grant execute on function public.set_invoice_line_tax_v1(uuid, text, numeric, text) to authenticated;
revoke all on function public.set_invoice_tax_v1(uuid, text, numeric, text, boolean) from public, anon;
grant execute on function public.set_invoice_tax_v1(uuid, text, numeric, text, boolean) to authenticated;
revoke all on function public.update_finance_record_v1(text, text, text, text, text, text) from public, anon;
grant execute on function public.update_finance_record_v1(text, text, text, text, text, text) to authenticated;
revoke all on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_finance_record_v2(text, text, text, text, text, text, text, text, text) to authenticated;
revoke all on function public.update_invoice_draft_details_v1(uuid, text, uuid, text, text, date, text) from public, anon;
grant execute on function public.update_invoice_draft_details_v1(uuid, text, uuid, text, text, date, text) to authenticated;
revoke all on function public.void_or_credit_invoice_v1(uuid, text, text) from public, anon;
grant execute on function public.void_or_credit_invoice_v1(uuid, text, text) to authenticated;

commit;
