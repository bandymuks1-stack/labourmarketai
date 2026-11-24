-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration by the LEAD session after
-- review. Never `db push`.
-- Rollback:  supabase/rollbacks/20260817221000_procurement_v1.down.sql
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- GRANTs + new RLS-bearing tables + a trigger guard are RED-class; there is
-- no non-RED way to add a row-level-secured, RPC-only-writes domain module).
-- Annotation pre-approved by owner mandate 2026-08-17 (autonomous functional
-- completion train V2, §4 migration authority). SAFETY CLASS: RED — 3 new
-- tables, 10 new functions (9 commands + 1 visibility helper), 1 trigger
-- guard, EXECUTE grants. ZERO existing table, policy, grant, trigger or
-- function is modified or recreated. ZERO DML at apply time. Prod apply
-- stays manual by the LEAD session via Supabase MCP.
--
-- 20260817221000 — procurement (purchase inquiries) v1 (train J, financial
-- ops P2).
--
-- PROBLEM (full reality audit 2026-08-17, OPERATIONS): procurement is the
-- audit's MISSING row — "zero machinery". A site worker who needs materials
-- and a manager who compares supplier offers work entirely outside the
-- product; nothing records what was asked, what was offered, what was
-- chosen, or which invoice paid for it.
--
-- SOLUTION (smallest honest slice — a thin module on existing engines):
--   * procurement_inquiries — ONE bounded request row per need: what, how
--     much, estimated budget (integer cents), optional project/object link,
--     honest lifecycle draft → submitted → decided → ordered → closed
--     (cancelled from the live states). approval_status is an engine
--     MIRROR ONLY (the decision lives in the Workflow & Approval Engine,
--     context_entity_type='procurement', context id = inquiry id — nothing
--     re-implemented here, the app layer calls the engine's own start RPC).
--   * procurement_offers — manually recorded supplier offers (integer
--     cents, EUR), optionally pointing at a document-engine register row.
--     Comparison IS the offers list; decision = select_procurement_offer_v1
--     (records the chosen offer + optional order reference).
--   * procurement_events — append-only history, trigger-immutable like
--     workflow_transitions.
--   * finance link: an inquiry may point at the finance_records row (the
--     received invoice) that settled it — a POINTER, never money movement.
--   * 9 gated SECURITY DEFINER commands are the ONLY write paths (direct
--     insert/update/delete REVOKEd, no write policies).
--
-- AUTHORITY MODEL, STATED EXPLICITLY:
--   create/update/submit: any ACTIVE org member (belongs_to_organization —
--     BOTH membership truths; requesting materials is a worker act) — update
--     and submit additionally only by the requester or an org manager;
--   offers: the requester or an org manager (has_org_demand_access);
--   select offer / status transitions / finance link: org managers
--     (has_org_demand_access) or platform admin ONLY;
--   reads: the requester, org managers, platform admin. A plain member
--     never reads someone else's inquiry.
--
-- WHAT IS DELIBERATELY NOT ADDED (binding):
--   - NO supplier entity/registry (supplier is bounded manual text);
--   - NO outbound anything: no RFQ emails, no supplier contact, no ordering
--     API — the order_reference is a bounded manual note;
--   - NO money movement, NO payment provider, NO stock/inventory counts;
--   - NO auto-approve, NO thresholds, NO AI;
--   - NO new notification types (the engine's workflow types already cover
--     the approval flow);
--   - NO recreate of ANY existing object — every name below is NEW.
--
-- RLS DECISION, STATED EXPLICITLY:
--   anon:           NOTHING. No grant, no policy.
--   authenticated:  SELECT only, fail-closed —
--     procurement_inquiries: requester, org managers (has_org_demand_access
--       = ACTIVE owner/admin/manager/external_manager membership), or
--       platform admin;
--     procurement_offers / procurement_events: same audience via ONE definer
--       predicate (procurement_can_view_v1 — assets/workflow recursion-free
--       precedent).
--     Writes: NO insert/update/delete policy on any table and an explicit
--       REVOKE — the 9 gated commands are the only write paths.
--   service_role:   untouched default (no module-specific widening).
--
-- ROLLBACK: supabase/rollbacks/20260817221000_procurement_v1.down.sql drops
-- ONLY the 1 trigger, 10 new functions and 3 new tables (feature-created
-- rows live ONLY in those tables). No existing object was touched, so the
-- down file recreates nothing.
-- ============================================================================

begin;

-- ── 0. Safety assertions — the truths this module builds on must exist ──────
do $$
begin
  if to_regclass('public.organizations') is null then
    raise exception 'organizations missing — this environment predates the org spine';
  end if;
  if to_regclass('public.finance_records') is null then
    raise exception 'finance_records missing — apply 20260711230000 before this migration';
  end if;
  if to_regclass('public.org_documents') is null then
    raise exception 'org_documents missing — apply 20260817140000 before this migration';
  end if;
  if to_regclass('public.workflow_instances') is null then
    raise exception 'workflow_instances missing — apply 20260817130000 (workflow engine v1) before this migration';
  end if;
  if to_regclass('public.work_objects') is null then
    raise exception 'work_objects missing — apply 20260817150000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'has_org_demand_access'
  ) then
    raise exception 'has_org_demand_access missing — apply 20260806200000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'belongs_to_organization'
  ) then
    raise exception 'belongs_to_organization missing — apply 20260806120000 before this migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'finance_company_authority_v1'
  ) then
    raise exception 'finance_company_authority_v1 missing — apply 20260817123000 before this migration';
  end if;
end $$;

-- ── 1. Tables ───────────────────────────────────────────────────────────────

-- 1a. The purchase inquiry.
create table if not exists public.procurement_inquiries (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  requester_profile_id   uuid not null references public.profiles(id) on delete cascade,
  project_id             uuid references public.projects(id) on delete set null,
  object_id              uuid references public.work_objects(id) on delete set null,
  item_description       text not null check (
                           char_length(trim(item_description)) >= 3
                           and char_length(item_description) <= 2000
                         ),
  -- Bounded manual text ("40 bags", "120 m²") — units vary too much for a
  -- numeric contract to be honest in v1.
  quantity               text check (quantity is null or char_length(quantity) <= 80),
  estimated_budget_cents bigint check (
                           estimated_budget_cents is null
                           or (estimated_budget_cents >= 0
                               and estimated_budget_cents <= 100000000000)
                         ),
  status                 text not null default 'draft'
                           check (status in
                             ('draft','submitted','decided','ordered','closed','cancelled')),
  -- Engine MIRROR only — the decision lives in workflow_instances.
  approval_status        text check (approval_status is null
                                     or approval_status in ('pending','approved','rejected')),
  selected_offer_id      uuid,
  order_reference        text check (order_reference is null
                                     or char_length(order_reference) <= 120),
  finance_record_id      uuid references public.finance_records(id) on delete set null,
  created_by             uuid not null references public.profiles(id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint pi_decided_shape check (
    (status in ('draft','submitted','cancelled') and selected_offer_id is null)
    or status in ('decided','ordered','closed')
  )
);
create index if not exists pi_org_status_idx
  on public.procurement_inquiries (organization_id, status);
create index if not exists pi_requester_idx
  on public.procurement_inquiries (requester_profile_id, created_at desc);

comment on column public.procurement_inquiries.approval_status is
  'MIRROR of the Workflow & Approval Engine outcome (context procurement, context id = inquiry id). Written ONLY by submit_procurement_approval_v1 / sync_procurement_approval_v1 — never a decision of its own.';

-- 1b. Manually recorded supplier offers (comparison = this list).
create table if not exists public.procurement_offers (
  id              uuid primary key default gen_random_uuid(),
  inquiry_id      uuid not null references public.procurement_inquiries(id) on delete cascade,
  supplier_name   text not null check (
                    char_length(trim(supplier_name)) >= 2
                    and char_length(supplier_name) <= 160
                  ),
  amount_cents    bigint not null
                    check (amount_cents >= 0 and amount_cents <= 100000000000),
  currency        char(3) not null default 'EUR' check (currency in ('EUR')),
  note            text check (note is null or char_length(note) <= 500),
  org_document_id uuid references public.org_documents(id) on delete set null,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now()
);
create index if not exists po_inquiry_idx
  on public.procurement_offers (inquiry_id, created_at);

-- The chosen-offer pointer (FK added after both tables exist).
alter table public.procurement_inquiries
  add constraint pi_selected_offer_fk
  foreign key (selected_offer_id) references public.procurement_offers(id)
  on delete set null;

-- 1c. Append-only lifecycle history.
create table if not exists public.procurement_events (
  id               uuid primary key default gen_random_uuid(),
  inquiry_id       uuid not null references public.procurement_inquiries(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  action           text not null check (action in (
                     'created','updated','submitted','offer_added','offer_selected',
                     'ordered','closed','cancelled','approval_submitted',
                     'approval_approved','approval_rejected','approval_cleared',
                     'finance_linked','finance_unlinked')),
  note             text check (note is null or char_length(note) <= 500),
  created_at       timestamptz not null default now()
);
create index if not exists pe_inquiry_idx
  on public.procurement_events (inquiry_id, created_at);

comment on table public.procurement_events is
  'APPEND-ONLY procurement history. Rows are immutable (trigger-enforced for every role incl. service_role).';

-- ── 2. Immutability trigger guard ───────────────────────────────────────────
create or replace function public.procurement_events_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'procurement_events is append-only: % is not allowed', tg_op;
end;
$$;
drop trigger if exists procurement_events_append_only on public.procurement_events;
create trigger procurement_events_append_only
  before update or delete on public.procurement_events
  for each row execute function public.procurement_events_guard();

-- ── 3. Visibility helper (SECURITY DEFINER, recursion-free policies) ───────
create or replace function public.procurement_can_view_v1(p_inquiry_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.procurement_inquiries i
     where i.id = p_inquiry_id
       and (
         i.requester_profile_id = auth.uid()
         or public.has_org_demand_access(i.organization_id)
         or public.is_admin()
       )
  )
$$;
revoke all on function public.procurement_can_view_v1(uuid) from public;
revoke all on function public.procurement_can_view_v1(uuid) from anon;
grant execute on function public.procurement_can_view_v1(uuid) to authenticated;

-- ── 4. RLS — SELECT-only, fail-closed; writes stay RPC-only ────────────────
alter table public.procurement_inquiries enable row level security;
alter table public.procurement_offers enable row level security;
alter table public.procurement_events enable row level security;

revoke all on public.procurement_inquiries,
              public.procurement_offers,
              public.procurement_events
  from public;
revoke all on public.procurement_inquiries,
              public.procurement_offers,
              public.procurement_events
  from anon;
revoke all on public.procurement_inquiries,
              public.procurement_offers,
              public.procurement_events
  from authenticated;
grant select on public.procurement_inquiries,
                public.procurement_offers,
                public.procurement_events
  to authenticated;

drop policy if exists procurement_inquiries_select on public.procurement_inquiries;
create policy procurement_inquiries_select on public.procurement_inquiries
  for select to authenticated
  using (
    requester_profile_id = auth.uid()
    or public.has_org_demand_access(organization_id)
    or public.is_admin()
  );

drop policy if exists procurement_offers_select on public.procurement_offers;
create policy procurement_offers_select on public.procurement_offers
  for select to authenticated
  using (public.procurement_can_view_v1(inquiry_id));

drop policy if exists procurement_events_select on public.procurement_events;
create policy procurement_events_select on public.procurement_events
  for select to authenticated
  using (public.procurement_can_view_v1(inquiry_id));

-- No insert/update/delete policy anywhere: with the explicit REVOKE above,
-- the commands below are the ONLY write paths.

-- ── 5. Commands (SECURITY DEFINER, outcome-string contract) ────────────────

-- 5a. create_procurement_inquiry_v1 — any active org member files a need.
-- Returns the new inquiry id (uuid-as-text) on success; a short outcome
-- string otherwise (TS layer distinguishes by UUID shape).
create or replace function public.create_procurement_inquiry_v1(
  p_organization_id        text,
  p_item_description       text,
  p_quantity               text,
  p_estimated_budget_cents text,
  p_project_id             text,
  p_object_id              text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  v_org       uuid;
  v_desc      text := nullif(trim(coalesce(p_item_description, '')), '');
  v_qty       text := nullif(trim(coalesce(p_quantity, '')), '');
  v_bud_text  text := nullif(trim(coalesce(p_estimated_budget_cents, '')), '');
  v_budget    bigint;
  v_project   uuid;
  v_object    uuid;
  v_id        uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_org     := nullif(trim(coalesce(p_organization_id, '')), '')::uuid;
    v_project := nullif(trim(coalesce(p_project_id, '')), '')::uuid;
    v_object  := nullif(trim(coalesce(p_object_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_org is null then return 'invalid'; end if;
  if v_desc is null or char_length(v_desc) < 3 or char_length(v_desc) > 2000 then
    return 'invalid';
  end if;
  if v_qty is not null and char_length(v_qty) > 80 then
    return 'invalid';
  end if;
  if v_bud_text is not null then
    if v_bud_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
    v_budget := v_bud_text::bigint;
    if v_budget < 0 or v_budget > 100000000000 then return 'invalid'; end if;
  end if;

  -- Org boundary over BOTH membership truths. Merged with "org missing" —
  -- no oracle.
  if not (public.belongs_to_organization(v_org) or public.is_admin()) then
    return 'not_found';
  end if;

  -- Links are authorization-gated server-side, never trusted from the client.
  if v_project is not null and not public.can_manage_project(v_project) then
    return 'not_allowed';
  end if;
  -- The object must belong to THIS organization (existence and wrong-org
  -- answer the same — no oracle).
  if v_object is not null and not exists (
    select 1 from public.work_objects wo
     where wo.id = v_object and wo.organization_id = v_org
  ) then
    return 'not_allowed';
  end if;

  -- Abuse cap: open (draft/submitted) inquiries per requester.
  if (select count(*) from public.procurement_inquiries i
       where i.requester_profile_id = uid
         and i.status in ('draft','submitted')) >= 100 then
    return 'limit_reached';
  end if;

  insert into public.procurement_inquiries
    (organization_id, requester_profile_id, project_id, object_id,
     item_description, quantity, estimated_budget_cents, status, created_by)
  values
    (v_org, uid, v_project, v_object, v_desc, v_qty, v_budget, 'draft', uid)
  returning id into v_id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action)
  values (v_id, uid, 'created');

  return v_id::text;
end;
$$;
revoke all on function public.create_procurement_inquiry_v1(text, text, text, text, text, text) from public;
revoke all on function public.create_procurement_inquiry_v1(text, text, text, text, text, text) from anon;
grant execute on function public.create_procurement_inquiry_v1(text, text, text, text, text, text) to authenticated;

-- 5b. update_procurement_inquiry_v1 — bounded fields of a DRAFT, by the
-- requester or an org manager.
create or replace function public.update_procurement_inquiry_v1(
  p_inquiry_id             text,
  p_item_description       text,
  p_quantity               text,
  p_estimated_budget_cents text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_desc     text := nullif(trim(coalesce(p_item_description, '')), '');
  v_qty      text := nullif(trim(coalesce(p_quantity, '')), '');
  v_bud_text text := nullif(trim(coalesce(p_estimated_budget_cents, '')), '');
  v_budget   bigint;
  v_row      record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_desc is null or char_length(v_desc) < 3 or char_length(v_desc) > 2000 then
    return 'invalid';
  end if;
  if v_qty is not null and char_length(v_qty) > 80 then
    return 'invalid';
  end if;
  if v_bud_text is not null then
    if v_bud_text !~ '^[0-9]{1,12}$' then return 'invalid'; end if;
    v_budget := v_bud_text::bigint;
    if v_budget < 0 or v_budget > 100000000000 then return 'invalid'; end if;
  end if;

  select i.id, i.status, i.requester_profile_id, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  -- Merged: missing row and no authority answer the same — no oracle.
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'draft' then return 'not_editable'; end if;

  update public.procurement_inquiries
     set item_description = v_desc,
         quantity = v_qty,
         estimated_budget_cents = v_budget,
         updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action)
  values (v_row.id, uid, 'updated');

  return 'updated';
end;
$$;
revoke all on function public.update_procurement_inquiry_v1(text, text, text, text) from public;
revoke all on function public.update_procurement_inquiry_v1(text, text, text, text) from anon;
grant execute on function public.update_procurement_inquiry_v1(text, text, text, text) to authenticated;

-- 5c. submit_procurement_inquiry_v1 — draft → submitted (requester or org
-- manager). Approval, when the org has a procurement template, rides the
-- engine via the separate mirror commands — submitting alone never asks
-- anyone for anything.
create or replace function public.submit_procurement_inquiry_v1(
  p_inquiry_id text
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
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select i.id, i.status, i.requester_profile_id, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status = 'submitted' then return 'already_submitted'; end if;
  if v_row.status <> 'draft' then return 'not_editable'; end if;

  update public.procurement_inquiries
     set status = 'submitted', updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action)
  values (v_row.id, uid, 'submitted');

  return 'submitted';
end;
$$;
revoke all on function public.submit_procurement_inquiry_v1(text) from public;
revoke all on function public.submit_procurement_inquiry_v1(text) from anon;
grant execute on function public.submit_procurement_inquiry_v1(text) to authenticated;

-- 5d. add_procurement_offer_v1 — record a supplier offer manually (the
-- requester or an org manager; recording an offer contacts nobody).
create or replace function public.add_procurement_offer_v1(
  p_inquiry_id      text,
  p_supplier_name   text,
  p_amount_cents    text,
  p_note            text,
  p_org_document_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  v_id       uuid;
  v_supplier text := nullif(trim(coalesce(p_supplier_name, '')), '');
  v_amt_text text := nullif(trim(coalesce(p_amount_cents, '')), '');
  v_amount   bigint;
  v_note     text := nullif(trim(coalesce(p_note, '')), '');
  v_org_doc  uuid;
  v_row      record;
  v_offer    uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id      := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
    v_org_doc := nullif(trim(coalesce(p_org_document_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_supplier is null or char_length(v_supplier) < 2 or char_length(v_supplier) > 160 then
    return 'invalid';
  end if;
  if v_amt_text is null or v_amt_text !~ '^[0-9]{1,12}$' then
    return 'invalid';
  end if;
  v_amount := v_amt_text::bigint;
  if v_amount < 0 or v_amount > 100000000000 then return 'invalid'; end if;
  if v_note is not null and char_length(v_note) > 500 then return 'invalid'; end if;

  select i.id, i.status, i.requester_profile_id, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status not in ('draft','submitted') then return 'not_editable'; end if;

  if v_org_doc is not null and not public.can_read_org_document_v1(v_org_doc) then
    return 'not_allowed';
  end if;

  -- Abuse cap: a comparison list, not a data dump.
  if (select count(*) from public.procurement_offers o
       where o.inquiry_id = v_row.id) >= 20 then
    return 'limit_reached';
  end if;

  insert into public.procurement_offers
    (inquiry_id, supplier_name, amount_cents, currency, note, org_document_id, created_by)
  values
    (v_row.id, v_supplier, v_amount, 'EUR', v_note, v_org_doc, uid)
  returning id into v_offer;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action, note)
  values (v_row.id, uid, 'offer_added', v_supplier);

  return v_offer::text;
end;
$$;
revoke all on function public.add_procurement_offer_v1(text, text, text, text, text) from public;
revoke all on function public.add_procurement_offer_v1(text, text, text, text, text) from anon;
grant execute on function public.add_procurement_offer_v1(text, text, text, text, text) to authenticated;

-- 5e. select_procurement_offer_v1 — THE decision command: an org manager
-- picks one recorded offer (submitted → decided; optional order reference).
create or replace function public.select_procurement_offer_v1(
  p_inquiry_id      text,
  p_offer_id        text,
  p_order_reference text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_id    uuid;
  v_offer uuid;
  v_ref   text := nullif(trim(coalesce(p_order_reference, '')), '');
  v_row   record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id    := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
    v_offer := nullif(trim(coalesce(p_offer_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null or v_offer is null then return 'invalid'; end if;
  if v_ref is not null and char_length(v_ref) > 120 then return 'invalid'; end if;

  select i.id, i.status, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  -- Decision authority: org managers or platform admin ONLY (merged with
  -- missing — no oracle).
  if v_row.id is null
     or not (public.has_org_demand_access(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'submitted' then return 'not_submitted'; end if;

  if not exists (
    select 1 from public.procurement_offers o
     where o.id = v_offer and o.inquiry_id = v_row.id
  ) then
    return 'offer_not_found';
  end if;

  update public.procurement_inquiries
     set status = 'decided',
         selected_offer_id = v_offer,
         order_reference = v_ref,
         updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action, note)
  values (v_row.id, uid, 'offer_selected', v_ref);

  return 'decided';
end;
$$;
revoke all on function public.select_procurement_offer_v1(text, text, text) from public;
revoke all on function public.select_procurement_offer_v1(text, text, text) from anon;
grant execute on function public.select_procurement_offer_v1(text, text, text) to authenticated;

-- 5f. set_procurement_status_v1 — the remaining guarded transitions (org
-- managers; a requester may cancel their own draft/submitted inquiry):
--   draft|submitted → cancelled;  decided → ordered (order reference may be
--   recorded);  decided|ordered → closed.
create or replace function public.set_procurement_status_v1(
  p_inquiry_id      text,
  p_status          text,
  p_order_reference text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_id     uuid;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
  v_ref    text := nullif(trim(coalesce(p_order_reference, '')), '');
  v_row    record;
  v_manage boolean;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;
  if v_status is null or v_status not in ('cancelled','ordered','closed') then
    return 'invalid';
  end if;
  if v_ref is not null and char_length(v_ref) > 120 then return 'invalid'; end if;

  select i.id, i.status, i.requester_profile_id, i.organization_id, i.order_reference
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null then return 'not_found'; end if;

  v_manage := public.has_org_demand_access(v_row.organization_id) or public.is_admin();

  if v_status = 'cancelled' then
    -- Requester may cancel their own live inquiry; managers may cancel any.
    if not (v_manage or v_row.requester_profile_id = uid) then
      return 'not_found';  -- merged — no oracle
    end if;
    if v_row.status not in ('draft','submitted') then return 'not_editable'; end if;
  else
    if not v_manage then return 'not_found'; end if;
    if v_status = 'ordered' and v_row.status <> 'decided' then
      return 'not_editable';
    end if;
    if v_status = 'closed' and v_row.status not in ('decided','ordered') then
      return 'not_editable';
    end if;
  end if;

  update public.procurement_inquiries
     set status = v_status,
         order_reference = coalesce(v_ref, order_reference),
         updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action, note)
  values (v_row.id, uid,
          case v_status when 'cancelled' then 'cancelled'
                        when 'ordered' then 'ordered'
                        else 'closed' end,
          v_ref);

  return 'updated';
end;
$$;
revoke all on function public.set_procurement_status_v1(text, text, text) from public;
revoke all on function public.set_procurement_status_v1(text, text, text) from anon;
grant execute on function public.set_procurement_status_v1(text, text, text) to authenticated;

-- 5g. set_procurement_finance_record_v1 — point a decided/ordered/closed
-- inquiry at the finance_records row (received invoice) that settled it.
-- A POINTER between two registers the caller already has authority over —
-- never money movement. Empty id unlinks.
create or replace function public.set_procurement_finance_record_v1(
  p_inquiry_id        text,
  p_finance_record_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_fr  uuid;
  v_row record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
    v_fr := nullif(trim(coalesce(p_finance_record_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select i.id, i.status, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null
     or not (public.has_org_demand_access(v_row.organization_id) or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status not in ('decided','ordered','closed') then
    return 'not_editable';
  end if;

  if v_fr is not null then
    -- The caller must hold finance authority over the record they link
    -- (creator / admin / company authority — the fr_select truth).
    if not exists (
      select 1 from public.finance_records fr
       where fr.id = v_fr
         and (fr.created_by = uid
              or public.is_admin()
              or public.finance_company_authority_v1(fr.company_id))
    ) then
      return 'not_allowed';
    end if;
  end if;

  update public.procurement_inquiries
     set finance_record_id = v_fr,
         updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action)
  values (v_row.id, uid,
          case when v_fr is null then 'finance_unlinked' else 'finance_linked' end);

  return case when v_fr is null then 'unlinked' else 'linked' end;
end;
$$;
revoke all on function public.set_procurement_finance_record_v1(text, text) from public;
revoke all on function public.set_procurement_finance_record_v1(text, text) from anon;
grant execute on function public.set_procurement_finance_record_v1(text, text) to authenticated;

-- 5h. submit_procurement_approval_v1 — flip the engine MIRROR to pending
-- (the app layer starts the engine instance first; compensation on failure —
-- the timesheets pattern). Decides nothing, routes nothing.
create or replace function public.submit_procurement_approval_v1(
  p_inquiry_id text
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
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select i.id, i.status, i.approval_status, i.requester_profile_id, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.status <> 'submitted' then return 'not_submitted'; end if;
  if v_row.approval_status = 'pending' then return 'already_pending'; end if;
  if v_row.approval_status = 'approved' then return 'already_decided'; end if;

  update public.procurement_inquiries
     set approval_status = 'pending', updated_at = now()
   where id = v_row.id;

  insert into public.procurement_events (inquiry_id, actor_profile_id, action)
  values (v_row.id, uid, 'approval_submitted');

  return 'submitted';
end;
$$;
revoke all on function public.submit_procurement_approval_v1(text) from public;
revoke all on function public.submit_procurement_approval_v1(text) from anon;
grant execute on function public.submit_procurement_approval_v1(text) to authenticated;

-- 5i. sync_procurement_approval_v1 — copy the engine's TERMINAL outcome onto
-- the mirror (approved/rejected copied; withdrawn/cancelled clears; pending
-- and missing answer without writing). Never decides anything.
create or replace function public.sync_procurement_approval_v1(
  p_inquiry_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  v_id  uuid;
  v_row record;
  v_wf  record;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  begin
    v_id := nullif(trim(coalesce(p_inquiry_id, '')), '')::uuid;
  exception when invalid_text_representation then
    return 'invalid';
  end;
  if v_id is null then return 'invalid'; end if;

  select i.id, i.approval_status, i.requester_profile_id, i.organization_id
    into v_row
    from public.procurement_inquiries i
   where i.id = v_id
   for update;
  if v_row.id is null
     or not (v_row.requester_profile_id = uid
             or public.has_org_demand_access(v_row.organization_id)
             or public.is_admin()) then
    return 'not_found';
  end if;
  if v_row.approval_status is distinct from 'pending' then
    return 'not_pending';
  end if;

  select i.status into v_wf
    from public.workflow_instances i
   where i.context_entity_type = 'procurement'
     and i.context_entity_id = v_row.id
   order by i.created_at desc
   limit 1;
  if v_wf.status is null then return 'no_instance'; end if;
  if v_wf.status = 'pending' then return 'still_pending'; end if;

  if v_wf.status = 'approved' then
    update public.procurement_inquiries
       set approval_status = 'approved', updated_at = now()
     where id = v_row.id;
    insert into public.procurement_events (inquiry_id, actor_profile_id, action)
    values (v_row.id, uid, 'approval_approved');
    return 'approved';
  end if;

  if v_wf.status = 'rejected' then
    update public.procurement_inquiries
       set approval_status = 'rejected', updated_at = now()
     where id = v_row.id;
    insert into public.procurement_events (inquiry_id, actor_profile_id, action)
    values (v_row.id, uid, 'approval_rejected');
    return 'rejected';
  end if;

  update public.procurement_inquiries
     set approval_status = null, updated_at = now()
   where id = v_row.id;
  insert into public.procurement_events (inquiry_id, actor_profile_id, action, note)
  values (v_row.id, uid, 'approval_cleared', 'workflow ' || v_wf.status);
  return 'cleared';
end;
$$;
revoke all on function public.sync_procurement_approval_v1(text) from public;
revoke all on function public.sync_procurement_approval_v1(text) from anon;
grant execute on function public.sync_procurement_approval_v1(text) to authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260817221000_procurement_v1.down.sql
-- restores the prior state exactly (drops the 1 trigger, 10 new functions
-- and 3 new tables; feature-created rows live only in those tables).
