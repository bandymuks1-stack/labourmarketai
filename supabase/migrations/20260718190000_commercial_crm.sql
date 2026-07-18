-- @human-gate-approved
-- Wagon 10 — Commercial CRM (proposals + contracts).
--
-- Additive, default-closed, owner-scoped. Two new tables that consolidate the
-- commercial lifecycle over the EXISTING canonical facts (customer_requests =
-- the demand/need; projects = the placement). Invoices and payments are NOT
-- duplicated here — they stay in the canonical finance ledger (read via
-- lib/finance). This module signs nothing and makes no signing claim: a
-- contract holds only a document REFERENCE + a status.
--
-- RED class (SECURITY DEFINER RPCs + GRANTs). Applied under owner standing
-- authorization. Rollback: supabase/rollbacks/20260718190000_commercial_crm.down.sql

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  customer_request_id uuid references public.customer_requests(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  number text,
  title text not null,
  amount_cents bigint not null default 0 check (amount_cents >= 0 and amount_cents <= 100000000000),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  validity_until date,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','withdrawn')),
  scope text,
  exclusions text,
  rejection_reason text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proposals_title_len check (char_length(title) between 1 and 200),
  constraint proposals_text_len check (
    (scope is null or char_length(scope) <= 2000)
    and (exclusions is null or char_length(exclusions) <= 2000)
    and (rejection_reason is null or char_length(rejection_reason) <= 1000)
    and (number is null or char_length(number) <= 60)
  )
);
create index if not exists proposals_owner_idx on public.proposals (owner_id, status);
create index if not exists proposals_demand_idx on public.proposals (customer_request_id);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  proposal_id uuid references public.proposals(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  customer_request_id uuid references public.customer_requests(id) on delete set null,
  number text,
  title text not null,
  parties text,
  value_cents bigint not null default 0 check (value_cents >= 0 and value_cents <= 100000000000),
  currency char(3) not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'draft'
    check (status in ('draft','active','completed','cancelled')),
  signed_document_ref text,
  start_date date,
  end_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_title_len check (char_length(title) between 1 and 200),
  constraint contracts_text_len check (
    (parties is null or char_length(parties) <= 500)
    and (signed_document_ref is null or char_length(signed_document_ref) <= 500)
    and (note is null or char_length(note) <= 1000)
    and (number is null or char_length(number) <= 60)
  ),
  constraint contracts_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index if not exists contracts_owner_idx on public.contracts (owner_id, status);

alter table public.proposals enable row level security;
alter table public.contracts enable row level security;

-- Owner-scoped SELECT (a commercial record is private to its owner + admin).
-- No cross-table subquery → no recursion. Writes RPC-only.
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals
  for select using (owner_id = auth.uid() or public.is_admin());

drop policy if exists contracts_select on public.contracts;
create policy contracts_select on public.contracts
  for select using (owner_id = auth.uid() or public.is_admin());

grant select on public.proposals to authenticated;
grant select on public.contracts to authenticated;

-- ── Proposal RPCs (owner-gated) ─────────────────────────────────────────────
create or replace function public.create_proposal_v1(
  p_title text,
  p_amount_cents bigint default 0,
  p_customer_request_id uuid default null,
  p_project_id uuid default null,
  p_number text default null,
  p_validity_until date default null,
  p_scope text default null,
  p_exclusions text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_title is null or char_length(trim(p_title)) = 0 then raise exception 'title required'; end if;
  if p_amount_cents is null or p_amount_cents < 0 or p_amount_cents > 100000000000 then raise exception 'invalid amount'; end if;
  insert into public.proposals (owner_id, customer_request_id, project_id, number, title, amount_cents,
                                validity_until, scope, exclusions)
  values (auth.uid(), p_customer_request_id, p_project_id, nullif(left(coalesce(p_number,''),60),''),
          left(trim(p_title),200), p_amount_cents, p_validity_until,
          nullif(left(coalesce(p_scope,''),2000),''), nullif(left(coalesce(p_exclusions,''),2000),''))
  returning id into v_id; return v_id;
end; $$;

create or replace function public.set_proposal_status_v1(
  p_proposal_id uuid, p_status text, p_rejection_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.proposals where id = p_proposal_id;
  if v_owner is null then raise exception 'proposal not found'; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','sent','accepted','rejected','withdrawn') then raise exception 'invalid status'; end if;
  update public.proposals set
    status = p_status,
    sent_at = case when p_status = 'sent' and sent_at is null then now() else sent_at end,
    accepted_at = case when p_status = 'accepted' then now() when p_status in ('draft','sent') then null else accepted_at end,
    rejection_reason = case when p_status = 'rejected' then nullif(left(coalesce(p_rejection_reason,''),1000),'') else null end,
    updated_at = now()
  where id = p_proposal_id;
end; $$;

create or replace function public.delete_proposal_v1(p_proposal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.proposals where id = p_proposal_id;
  if v_owner is null then return; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  delete from public.proposals where id = p_proposal_id;
end; $$;

-- ── Contract RPCs (owner-gated) ─────────────────────────────────────────────
create or replace function public.create_contract_v1(
  p_title text,
  p_value_cents bigint default 0,
  p_proposal_id uuid default null,
  p_project_id uuid default null,
  p_customer_request_id uuid default null,
  p_number text default null,
  p_parties text default null,
  p_signed_document_ref text default null,
  p_start_date date default null,
  p_end_date date default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_title is null or char_length(trim(p_title)) = 0 then raise exception 'title required'; end if;
  if p_value_cents is null or p_value_cents < 0 or p_value_cents > 100000000000 then raise exception 'invalid value'; end if;
  if p_end_date is not null and p_start_date is not null and p_end_date < p_start_date then raise exception 'invalid dates'; end if;
  insert into public.contracts (owner_id, proposal_id, project_id, customer_request_id, number, title, parties,
                                value_cents, signed_document_ref, start_date, end_date)
  values (auth.uid(), p_proposal_id, p_project_id, p_customer_request_id, nullif(left(coalesce(p_number,''),60),''),
          left(trim(p_title),200), nullif(left(coalesce(p_parties,''),500),''), p_value_cents,
          nullif(left(coalesce(p_signed_document_ref,''),500),''), p_start_date, p_end_date)
  returning id into v_id; return v_id;
end; $$;

create or replace function public.set_contract_status_v1(p_contract_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.contracts where id = p_contract_id;
  if v_owner is null then raise exception 'contract not found'; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  if p_status not in ('draft','active','completed','cancelled') then raise exception 'invalid status'; end if;
  update public.contracts set status = p_status, updated_at = now() where id = p_contract_id;
end; $$;

create or replace function public.delete_contract_v1(p_contract_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.contracts where id = p_contract_id;
  if v_owner is null then return; end if;
  if v_owner <> auth.uid() then raise exception 'not authorized'; end if;
  delete from public.contracts where id = p_contract_id;
end; $$;

grant execute on function public.create_proposal_v1(text, bigint, uuid, uuid, text, date, text, text) to authenticated;
grant execute on function public.set_proposal_status_v1(uuid, text, text) to authenticated;
grant execute on function public.delete_proposal_v1(uuid) to authenticated;
grant execute on function public.create_contract_v1(text, bigint, uuid, uuid, uuid, text, text, text, date, date) to authenticated;
grant execute on function public.set_contract_status_v1(uuid, text) to authenticated;
grant execute on function public.delete_contract_v1(uuid) to authenticated;

-- ROLLBACK: see supabase/rollbacks/20260718190000_commercial_crm.down.sql
