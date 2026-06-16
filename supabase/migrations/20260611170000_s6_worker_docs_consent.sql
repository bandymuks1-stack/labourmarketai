-- ============================================================================
-- APPLIED 2026-06-16 via Supabase MCP apply_migration (owner-approved, version
-- s6_worker_docs_consent). Additive + reversible, no RLS widened. Verified:
-- workers.docs_aggregate_consent exists; set_docs_aggregate_consent +
-- agency_pool_docs_readiness exist; granted to authenticated, NOT to anon.
--
-- S6 — worker documents-readiness CONSENT switch (the S5 leftover):
-- a worker-level toggle that lets THEIR agency see document-readiness
-- AGGREGATES (category-level counts only — NEVER document contents, paths,
-- notes or types). Default OFF (doctrine §4 default-closed); flipping it is
-- the worker's own audited act.
--
--   workers.docs_aggregate_consent boolean not null default false  (additive)
--
--   public.set_docs_aggregate_consent(p_enabled) -> text
--     Worker-owned write (workers.profile_id = auth.uid()), audit-logged.
--     Outcomes: 'saved' | 'no_worker'.
--
--   public.agency_pool_docs_readiness() -> setof aggregate row
--     Caller gate: owns an agency. Returns ONE row per pool worker who
--     (a) is actively linked to the caller's agency (agency_workers) AND
--     (b) has docs_aggregate_consent = true — with COUNTS ONLY:
--     total / valid-now / expiring-soon (30 d) / expired-or-missing-date.
--     Consent off → the worker simply does not appear (no zero leak).
--     No RLS change anywhere; worker_documents stays owner-only.
--
-- §19: aggregates are facts, not a score; nothing here ranks anyone.
-- ROLLBACK at the bottom (column + functions; reversible).
-- ============================================================================

begin;

alter table public.workers
  add column if not exists docs_aggregate_consent boolean not null default false;

-- ── set_docs_aggregate_consent: the worker's own audited switch ────────────
create or replace function public.set_docs_aggregate_consent(
  p_enabled boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_worker uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select w.id into v_worker from public.workers w where w.profile_id = uid;
  if v_worker is null then
    return 'no_worker';
  end if;

  update public.workers
     set docs_aggregate_consent = coalesce(p_enabled, false)
   where id = v_worker;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
  values (uid, 'set_docs_aggregate_consent', 'workers', v_worker,
          jsonb_build_object('enabled', coalesce(p_enabled, false)));

  return 'saved';
end $$;

revoke all on function
  public.set_docs_aggregate_consent(boolean) from public;
grant execute on function
  public.set_docs_aggregate_consent(boolean) to authenticated;

-- ── agency_pool_docs_readiness: consent-gated CATEGORY aggregates ──────────
create or replace function public.agency_pool_docs_readiness()
returns table (
  worker_id     uuid,
  docs_total    int,
  docs_valid    int,
  docs_expiring int,
  docs_attention int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_agency uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select a.id into v_agency from public.agencies a where a.profile_id = uid;
  if v_agency is null then
    return; -- not an agency owner → empty, never an error surface
  end if;

  return query
  select w.id,
         count(d.id)::int,
         count(d.id) filter (
           where d.valid_until is not null and d.valid_until > now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is not null
             and d.valid_until > now()
             and d.valid_until <= now() + interval '30 days'
         )::int,
         count(d.id) filter (
           where d.valid_until is null or d.valid_until <= now()
         )::int
    from public.agency_workers aw
    join public.agencies a on a.id = aw.agency_id and a.id = v_agency
    join public.workers w on w.id = aw.worker_id
    left join public.worker_documents d on d.worker_id = w.id
   where w.docs_aggregate_consent is true
   group by w.id;
end $$;

revoke all on function
  public.agency_pool_docs_readiness() from public;
grant execute on function
  public.agency_pool_docs_readiness() to authenticated;

commit;

-- ROLLBACK (reverse SQL — reversible):
-- drop function if exists public.agency_pool_docs_readiness();
-- drop function if exists public.set_docs_aggregate_consent(boolean);
-- alter table public.workers drop column if exists docs_aggregate_consent;
