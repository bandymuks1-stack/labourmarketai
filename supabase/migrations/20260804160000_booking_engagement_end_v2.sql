-- ============================================================================
-- OWNER-GATED. NOT APPLIED. No `-- @human-gate-approved` marker is present and
-- none may be self-added. Apply ONLY via Supabase MCP `apply_migration` after a
-- SEPARATE owner decision. Never `db push`.
--
-- 20260804160000 — booking engagement end v2 (§7.1: close
-- BOOKING_ENGAGEMENT_END_ACTION_UNREACHABLE).
--
-- ─── THE GAP ────────────────────────────────────────────────────────────────
-- `end_company_worker_engagement_v1` has been applied in production since
-- 20260723120000 and has ZERO client callers. The only references anywhere are
-- a guard test, the generated types, its own migration and that migration's
-- rollback. The capability exists and no person can reach it.
--
-- ─── WHY A NEW FUNCTION AND NOT A REPLACEMENT ───────────────────────────────
-- v1 returns `boolean`, and `false` means FOUR different things: the row does
-- not exist, you may not act on it, it is not active, and no row was updated.
-- A UI built on that cannot tell "you may not do this" from "it was already
-- ended", so it must either say something vague or GUESS — the fake-control
-- class this product forbids. The return type therefore has to change.
--
-- PostgreSQL cannot change a function's return type with CREATE OR REPLACE, so
-- replacing v1 in place would require DROP FUNCTION. That was rejected:
-- `end_company_worker_engagement_v1(uuid)` is an object OWNED by the applied
-- migration 20260723120000, and that migration's paired rollback drops it. A
-- new migration that drops and recreates it entangles the two rollbacks — after
-- this one applied, running 20260723120000's rollback would drop a function
-- this migration defined. Additive v2 keeps every rollback owning exactly what
-- its own migration created.
--
-- v1 is DEPRECATED by this migration. It is left in place, still granted, and
-- still owned by 20260723120000. There is no competing API in practice: v1 has
-- no callers, and a guard pins that no application code may acquire one.
--
-- REMOVAL CONDITION for v1 (a LATER, separate, owner-gated migration — not this
-- one): v1 may be dropped once (a) this migration is applied in production,
-- (b) at least one release calling only v2 has shipped, and (c) a catalog read
-- confirms v1 has no dependent object. Until all three hold, dropping v1 would
-- remove a working capability to tidy a name.
--
-- ─── WHAT THIS MIGRATION DOES NOT DO ────────────────────────────────────────
--   * NO `audit_logs` write. The engagement ROW is the approved audit record
--     (20260723120000: "No delete — the row IS the audit record"), carrying
--     ended_at, ended_by and the pseudonymized `subject_key` that survives a
--     worker erasure. A second audit trail would be a competing history.
--   * NO delete, ever. Ending is a status change.
--   * NO second engagement-history table.
--   * NO project inference and NO broad (company_id, worker_id) update — the
--     row is addressed by PRIMARY KEY and by nothing else.
--   * NO experience record (W6), NO reputation write, NO organization
--     membership change, NO project completion, NO billing or payment effect.
--   * NO table, column, index, policy, RLS or grant change on any existing
--     object. The only privilege statements below concern the NEW function.
--
-- ─── OUTCOME VOCABULARY ─────────────────────────────────────────────────────
--   ended        — this call moved active → ended
--   already_ended— it was already ended (NOT a failure, NOT a second write)
--   not_found    — the row does not exist, OR the caller may not act on it
--   conflict     — it changed underneath us despite the row lock (race)
--   error        — reserved for the app layer; this function never returns it
--
-- ANTI-ORACLE: `not_found` deliberately covers BOTH "no such row" and "not
-- your row". A distinct `not_authorized` would confirm the row exists to
-- someone who may not see it — the same choice `set_project_status_v1` made.
-- `already_ended` is separated from refusal because that distinction is what
-- the UI needs and it leaks nothing: only a caller who MAY act on the row ever
-- reaches it.
--
-- AUTHORITY is unchanged from v1 and is derived SERVER-SIDE from the
-- authenticated actor: the owning company (`owns_company`) or the engagement's
-- OWN worker. The client supplies an engagement id and nothing else — never a
-- company, never a worker, never a role.
--
-- ROLLBACK: supabase/rollbacks/20260804160000_booking_engagement_end_v2.down.sql
-- Drops ONLY this function. No data is touched, so the rollback is safe at any
-- time — v1 remains and every engagement row is untouched by either direction.
--
-- ROLLBACK (in-file, for the migration-safety checker):
--   drop function if exists public.end_company_worker_engagement_v2(uuid);
-- ============================================================================

create or replace function public.end_company_worker_engagement_v2(
  p_engagement_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid       uuid := auth.uid();
  e         public.company_worker_engagements%rowtype;
  may_end   boolean;
  v_side    text;
begin
  -- No session is answered exactly like an invisible row: this function never
  -- distinguishes "who are you" from "no such row" to an unauthenticated caller.
  if uid is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- ROW LOCK BEFORE THE DECISION. Two ends racing must serialise here, so the
  -- second one observes 'ended' and reports already_ended rather than issuing a
  -- second write or overwriting the first one's ended_at.
  select * into e
    from public.company_worker_engagements
   where id = p_engagement_id
     for update;

  if e.id is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- AUTHORITY — the same predicate v1 enforces, re-derived from the actor.
  -- `worker_id is not null` matters: a GDPR-detached row (worker erased) must
  -- grant nothing to anybody through the worker branch.
  select public.owns_company(e.company_id)
      or exists (
           select 1 from public.workers w
            where w.id = e.worker_id
              and e.worker_id is not null
              and w.profile_id = uid
         )
    into may_end;

  -- ANTI-ORACLE: refusal is indistinguishable from absence.
  if not may_end then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  -- Which side is acting. Derived from the row, never from the client. Only a
  -- caller who already passed the authority gate can see this.
  v_side := case
              when public.owns_company(e.company_id) then 'company'
              else 'worker'
            end;

  if e.status = 'ended' then
    -- Idempotent: no write, no second timestamp, the ORIGINAL ended_at.
    return jsonb_build_object(
      'outcome', 'already_ended',
      'engagement_id', e.id,
      'ended_at', e.ended_at,
      'actor_side', v_side
    );
  end if;

  update public.company_worker_engagements
     -- coalesce, not now(): an existing timestamp is never overwritten, even
     -- though an 'active' row should not carry one.
     set status   = 'ended',
         ended_at = coalesce(ended_at, now()),
         ended_by = uid
   where id = e.id
     and status = 'active';

  if not found then
    -- Defensive: the lock should make this unreachable. It is reported as a
    -- conflict rather than swallowed, because a silent success here would be a
    -- claim we cannot support.
    return jsonb_build_object('outcome', 'conflict', 'engagement_id', e.id);
  end if;

  select * into e
    from public.company_worker_engagements
   where id = p_engagement_id;

  return jsonb_build_object(
    'outcome', 'ended',
    'engagement_id', e.id,
    'ended_at', e.ended_at,
    'actor_side', v_side
  );
end;
$$;

-- Least privilege, mirroring 20260723120000 and 20260802160000: PUBLIC and anon
-- hold nothing; `authenticated` gets exactly EXECUTE. No service_role grant.
revoke all on function public.end_company_worker_engagement_v2(uuid) from public;
revoke all on function public.end_company_worker_engagement_v2(uuid) from anon;
grant execute on function public.end_company_worker_engagement_v2(uuid) to authenticated;

comment on function public.end_company_worker_engagement_v2(uuid) is
  'Ends one company-worker engagement, addressed by primary key. Returns a '
  'tagged jsonb outcome (ended | already_ended | not_found | conflict). '
  'Authority: owning company or the engagement''s own worker, derived '
  'server-side. not_found covers refusal as well as absence (anti-oracle). '
  'Supersedes end_company_worker_engagement_v1, whose bare boolean could not '
  'distinguish already-ended from refusal.';
