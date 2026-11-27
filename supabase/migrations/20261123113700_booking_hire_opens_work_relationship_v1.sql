-- 20261123113700_booking_hire_opens_work_relationship_v1
--
-- RED tier (needs-human-gate). NOT applied to any shared database. Production
-- apply only via Supabase MCP apply_migration after the owner approves THIS
-- migration by name.
--
-- WHY (owner addendum 2026-11-23, HIRE-5): a fact recorded once is used
-- everywhere it relates. An accepted booking (a direct hire) is recorded only
-- in the booking ledger, company_worker_engagements. The journal, the
-- employer's review, the Living CV and the person's one professional history
-- read engagement_contexts, so a direct hire reached none of them: the worker
-- could record a day only as personal work, and the company appeared nowhere
-- in their history.
--
-- OWNER DECISION NEEDED (the one choice this file makes for the owner):
-- 20260928220000 left a direct booking without a relationship on purpose ("no
-- relationship type is inferred from the acquisition channel"). This
-- migration opens one, typed 'collaborator' — the type a placement already
-- uses (work together, journal reviewable) — and NEVER 'employee': a booking
-- does not prove employment. If the owner wants another type, it is the one
-- literal below (v_slug).
--
-- WHAT (additive; no existing function, policy, grant or row is changed)
--   1. No new table (the employment model stays engagement_contexts, freeze
--      register §3): which relationship a hire OPENED is read back from the
--      audit row the opening writes.
--   2. An INSERT / status UPDATE trigger on company_worker_engagements: for an ACTIVE
--      hire it resolves the hiring organization exactly like the booking
--      accept does (the booking's need organization, else the company's one
--      bound organization) and REUSES any active relationship of the person
--      with it; otherwise it opens ONE 'collaborator' relationship from the
--      hire's start. Re-acceptance opens a new interval from today (or the future
--      hire start), preserving the former ended interval. A trigger, not another copy of booking-accept
--      bodies (the same reason as 20261114100000).
--   3. An AFTER UPDATE trigger: when the hire ends, the relationship it
--      OPENED ends with it (never one it only reused).
--   Journal review stays OFF per relationship until the company switches it
--   on (set_engagement_journal_review), as for a placement.
--
-- NOT DONE: no back-fill of hires accepted before this migration — that
-- changes existing rows and is a separate owner decision.
--
-- Rollback: supabase/rollbacks/20261123113700_booking_hire_opens_work_relationship_v1.down.sql
-- Apply via Supabase MCP apply_migration only.

begin;

-- 2) A hire opens (or reuses) the work relationship.
create or replace function public.booking_hire_open_relationship_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug    constant text := 'collaborator';
  v_profile uuid;
  v_org     uuid;
  v_ctx     uuid;
  v_opened  boolean := false;
  v_actual_slug text;
  v_start date;
begin
  if new.status <> 'active' or new.worker_id is null then
    return null;
  end if;
  -- Agency offers keep their existing placement-owned opening/end lifecycle.
  if exists (select 1 from public.agency_candidate_offers
              where booking_id = new.source_booking_id) then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'active' then return null; end if;
    v_start := greatest(new.started_at::date, current_date);
  else
    v_start := new.started_at::date;
  end if;
  select w.profile_id into v_profile from public.workers w where w.id = new.worker_id;
  if v_profile is null then
    return null;
  end if;
  -- The hiring organization, as the booking accept resolves the company: the
  -- booking's need organization first (when it is this company's), else the
  -- company's ONE bound organization. Nothing found = nothing opened.
  select cr.organization_id into v_org
    from public.booking_requests b
    join public.customer_requests cr on cr.id = b.request_id
    join public.organizations o on o.id = cr.organization_id and o.legacy_company_id = new.company_id
   where b.id = new.source_booking_id;
  if v_org is null then
    select o.id into v_org from public.organizations o where o.legacy_company_id = new.company_id;
    if (select count(*) from public.organizations o where o.legacy_company_id = new.company_id) <> 1 then
      v_org := null;
    end if;
  end if;
  if v_org is null then
    return null;
  end if;

  select id, relationship_slug into v_ctx, v_actual_slug from public.engagement_contexts
   where profile_id = v_profile and organization_id = v_org and status = 'active'
   order by created_at limit 1;
  if v_ctx is null then
    insert into public.engagement_contexts
        (profile_id, organization_id, relationship_slug, status, started_at, is_primary, hash_self)
      values (v_profile, v_org, v_slug, 'active', v_start, false,
              encode(extensions.digest(v_profile::text || ':' || v_slug || ':' || v_org::text || ':' || new.id::text, 'sha256'), 'hex'))
    returning id, relationship_slug into v_ctx, v_actual_slug;
    v_opened := true;
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (new.created_by, case when v_opened then 'booking_hire_relationship_opened' else 'booking_hire_relationship_reused' end,
            'engagement_contexts', v_ctx,
            jsonb_build_object('organization_id', v_org, 'company_worker_engagement_id', new.id,
                               'booking_id', new.source_booking_id, 'relationship_slug', v_actual_slug));
  return null;
end;
$$;
revoke all on function public.booking_hire_open_relationship_v1() from public, anon, authenticated;

-- 3) The hire ends: the relationship it OPENED ends with it.
create or replace function public.booking_hire_close_relationship_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ctx uuid;
  v_before_stage text;
begin
  if old.status <> 'active' or new.status = 'active' then
    return null;
  end if;
  -- Only a still-open interval THIS hire created, never one it reused.
  -- Re-acceptance keeps the former ended interval and has its own new audit row.
  select a.entity_id, coalesce(e.lifecycle_stage, 'active') into v_ctx, v_before_stage
    from public.audit_logs a
    join public.engagement_contexts e on e.id = a.entity_id and e.status <> 'ended'
   where a.action = 'booking_hire_relationship_opened'
     and a.entity = 'engagement_contexts'
     and a.payload->>'company_worker_engagement_id' = new.id::text
   order by a.created_at desc, a.id desc
   limit 1 for update of e;
  if v_ctx is null then
    return null;
  end if;
  update public.engagement_contexts
     set status = 'ended', ended_at = coalesce(ended_at, new.ended_at, now()),
         journal_review_enabled = false, is_primary = false,
         lifecycle_stage = 'ended', ended_reason = coalesce(ended_reason, 'contract_end'),
         updated_at = now()
   where id = v_ctx and status <> 'ended';
  if not found then return null; end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (new.ended_by, 'booking_hire_relationship_ended', 'engagement_contexts', v_ctx,
            jsonb_build_object('company_worker_engagement_id', new.id));
  insert into public.engagement_lifecycle_events
    (engagement_context_id, actor_profile_id, action, before_stage, after_stage, metadata)
    values (v_ctx, new.ended_by, 'engagement_ended', v_before_stage, 'ended',
            jsonb_build_object('reason', 'contract_end', 'source', 'booking_hire_ended',
                               'company_worker_engagement_id', new.id));
  return null;
end;
$$;
revoke all on function public.booking_hire_close_relationship_v1() from public, anon, authenticated;

drop trigger if exists booking_hire_opens_relationship on public.company_worker_engagements;
create trigger booking_hire_opens_relationship
  after insert or update of status on public.company_worker_engagements
  for each row execute function public.booking_hire_open_relationship_v1();
drop trigger if exists booking_hire_closes_relationship on public.company_worker_engagements;
create trigger booking_hire_closes_relationship
  after update of status on public.company_worker_engagements
  for each row execute function public.booking_hire_close_relationship_v1();

commit;
