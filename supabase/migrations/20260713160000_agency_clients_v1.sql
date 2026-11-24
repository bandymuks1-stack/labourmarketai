-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY
-- @human-gate-approved — owner approved MERGING this draft (PR #748 order,
-- 2026-07-13); application to production stays a separate owner gate.
-- Prepared under the canonical-user-journey P5 goal (2026-07-13, agency
-- client management inside the company workspace). Migration prepared FULLY
-- but NOT applied — production apply happens ONLY after explicit owner OK,
-- via Supabase MCP `apply_migration`. Never `db push`.
-- ============================================================================
--
-- agency_clients v1 — staffing-agency client records + demand→client link
-- (canonical journey P5, audit §7 "Agency journey does not exist").
--
-- ██ HUMAN GATE — DO NOT APPLY WITHOUT EXPLICIT OWNER OK ██
-- Status: DRAFT / DEFERRED. Committed for review only. The consumer UI
-- (staffing-agency "Klientai" panel on /dashboard/company) detects the
-- missing table/RPCs (42P01 / PGRST205 / 42883 / PGRST202) and shows an
-- honest "prepared, owner activation pending" state until this is applied.
--
-- WHY REUSE WAS NOT POSSIBLE (investigated 2026-07-13):
--   public.customers (0026) is a SELF-owned buyer identity — `unique
--   (profile_id)` caps it at ONE row per profile and owns_customer() checks
--   `profile_id = auth.uid()`, i.e. the row IS the caller, not a record the
--   caller owns. An agency needs MANY client records owned by ONE agency —
--   the ownership direction is inverted and the unique constraint is
--   load-bearing (save_customer_setup upserts ON CONFLICT (profile_id)).
--   customer_requests.customer_id is auto-resolved to the caller's own
--   customers row inside save_customer_request and is not writable to any
--   other value; save_demand_draft / submit_demand_request never write it.
--   Relaxing 0026's unique constraint would be a destructive semantic change
--   to the live buyer flow — hence this ADDITIVE side table instead.
--
-- WHAT THIS IS NOT: not a third identity, not an agency dashboard, not a
-- parallel candidate model, not a parallel demand model. A client row is a
-- private CRM record owned by the agency's canonical company profile; the
-- demand link is ONE nullable FK column on the EXISTING canonical demand
-- table (customer_requests). Candidates/pipeline stay on the existing
-- demand_shortlist / scouting path, reached per demand.
--
-- MODEL:
--   public.agency_clients — one row per client the agency represents:
--     company_id     the agency's canonical companies row (Direction A:
--                    an agency IS a company with company_type='staffing_agency')
--     name           required, 2..160
--     contact_name / contact_email / note — optional, bounded
--   public.customer_requests.agency_client_id — ADDITIVE nullable FK
--     linking an existing demand to a client. ON DELETE SET NULL: removing
--     a client never deletes a demand.
--   Row cap 200 clients/company enforced in the write RPC.
--
-- SECURITY (fail-closed):
--   RLS SELECT: owns_company(company_id) OR is_admin(). Private surface —
--   no public/worker/anon read. Clients are never discoverable.
--   Writes: RPC-only (save_agency_client_v1 / remove_agency_client_v1 /
--   set_demand_agency_client_v1; SECURITY DEFINER, owner-checked server-side,
--   pinned search_path). Table grant to authenticated: SELECT only.
--   No outbound action of any kind — these are records, not messages.
--
-- Rollback: supabase/rollbacks/20260713160000_agency_clients_v1.down.sql
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Table ─────────────────────────────────────────────────────────────
create table if not exists public.agency_clients (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 160),
  contact_name   text check (contact_name is null or char_length(contact_name) <= 120),
  contact_email  text check (contact_email is null
                    or (char_length(contact_email) <= 200 and position('@' in contact_email) > 1)),
  note           text check (note is null or char_length(note) <= 500),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_agency_clients_company
  on public.agency_clients(company_id);

drop trigger if exists trg_agency_clients_updated_at on public.agency_clients;
create trigger trg_agency_clients_updated_at
  before update on public.agency_clients
  for each row execute function public.set_updated_at();

-- ── 2. Demand → client link (ADDITIVE column on the canonical demand) ────
alter table public.customer_requests
  add column if not exists agency_client_id uuid
  references public.agency_clients(id) on delete set null;

create index if not exists idx_customer_requests_agency_client
  on public.customer_requests(agency_client_id);

-- ── 3. RLS (fail-closed) ─────────────────────────────────────────────────
alter table public.agency_clients enable row level security;

drop policy if exists agency_clients_select on public.agency_clients;
create policy agency_clients_select on public.agency_clients for select
  using (public.owns_company(company_id) or public.is_admin());

-- NO insert/update/delete policies — writes go through the RPCs below only.

grant select on public.agency_clients to authenticated;

-- ── 4. Write RPCs (owner-gated, SECURITY DEFINER) ────────────────────────
create or replace function public.save_agency_client_v1(
  p_name          text,
  p_contact_name  text default null,
  p_contact_email text default null,
  p_note          text default null,
  p_client_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_count int;
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_contact_name text := nullif(btrim(coalesce(p_contact_name, '')), '');
  v_contact_email text := nullif(btrim(coalesce(p_contact_email, '')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select c.id into v_company_id
  from public.companies c
  where c.profile_id = auth.uid();
  if v_company_id is null then
    raise exception 'not_company_owner' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 160 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_contact_name is not null and char_length(v_contact_name) > 120 then
    raise exception 'invalid_contact_name' using errcode = '22023';
  end if;
  if v_contact_email is not null
     and (char_length(v_contact_email) > 200 or position('@' in v_contact_email) <= 1) then
    raise exception 'invalid_contact_email' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;

  if p_client_id is not null then
    update public.agency_clients set
      name          = v_name,
      contact_name  = v_contact_name,
      contact_email = v_contact_email,
      note          = v_note,
      updated_at    = now()
    where id = p_client_id and company_id = v_company_id
    returning id into v_id;
    if v_id is null then
      raise exception 'client_not_found' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  select count(*) into v_count
  from public.agency_clients
  where company_id = v_company_id;
  if v_count >= 200 then
    raise exception 'client_cap_reached' using errcode = 'P0001';
  end if;

  insert into public.agency_clients
    (company_id, name, contact_name, contact_email, note, created_by)
  values
    (v_company_id, v_name, v_contact_name, v_contact_email, v_note, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_agency_client_v1(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int;
begin
  -- FK is ON DELETE SET NULL: linked demands survive, only the link clears.
  delete from public.agency_clients ac
  using public.companies c
  where ac.id = p_id
    and c.id = ac.company_id
    and c.profile_id = auth.uid();
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.set_demand_agency_client_v1(
  p_request_id uuid,
  p_client_id  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The target client (when set) must belong to the CALLER's own company.
  if p_client_id is not null and not exists (
    select 1
    from public.agency_clients ac
    join public.companies c on c.id = ac.company_id
    where ac.id = p_client_id and c.profile_id = v_uid
  ) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;

  -- The demand must be the CALLER's own row on the canonical demand table.
  update public.customer_requests
     set agency_client_id = p_client_id,
         updated_at = now()
   where id = p_request_id
     and profile_id = v_uid;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.save_agency_client_v1(text, text, text, text, uuid) from public;
revoke all on function public.save_agency_client_v1(text, text, text, text, uuid) from anon;
grant execute on function public.save_agency_client_v1(text, text, text, text, uuid) to authenticated;

revoke all on function public.remove_agency_client_v1(uuid) from public;
revoke all on function public.remove_agency_client_v1(uuid) from anon;
grant execute on function public.remove_agency_client_v1(uuid) to authenticated;

revoke all on function public.set_demand_agency_client_v1(uuid, uuid) from public;
revoke all on function public.set_demand_agency_client_v1(uuid, uuid) from anon;
grant execute on function public.set_demand_agency_client_v1(uuid, uuid) to authenticated;
