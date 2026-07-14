-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714161000 — self-declared work history write path v1 (Full CV System
-- slice, Sprint v2 §2 "import work history … always confirm").
--
-- PROBLEM: engagement_contexts is the CANONICAL work-history table (the
-- profile and the Verified CV both render it), but every existing creation
-- path is relationship-anchored — invitations, org membership triggers, the
-- personal-engagement trigger. `authenticated` holds SELECT only (0013), so a
-- worker importing their CV has NO way to record a past employer at all: the
-- confirmed work-history proposal from CV import has nowhere canonical to go,
-- and creating a parallel table would violate the single-truth rule.
--
-- SOLUTION (smallest honest slice): TWO gated RPCs writing the EXISTING
-- canonical table — no new table, no duplicate truth source.
--
--   1. save_self_declared_work_history_v1 — inserts ONE self-declared
--      engagement row for the CALLER: organization_id NULL always (no
--      fabricated organizations — orgs stay real identities created by their
--      owners), closed worker relationship set, bounded free-text title (the
--      employer + role exactly as the worker states them — rendered by the
--      existing title-fallback path), optional dates, status derived from
--      ended_at. Idempotent on (profile, title, dates). Cap: 60 org-less rows
--      per profile. Self-declared history is EXACTLY as trustworthy as the
--      history the profile already renders — "self-stated, never externally
--      verified" (verified-cv.ts contract) — so no honesty rule changes.
--   2. remove_self_declared_work_history_v1 — deletes ONLY the caller's own
--      organization-less, non-primary rows (the trigger-provisioned primary
--      personal engagement powers the journal composer and is refused).
--      A row referenced by journal entries returns 'in_use' (FK restrict) —
--      history with real records is never silently destroyed.
--
-- RLS is unchanged; writes stay RPC-only (no table grants added).
--
-- ROLLBACK: paired supabase/rollbacks/20260714161000_self_declared_work_history_v1.down.sql
-- drops the two functions only (self-declared rows already created are data
-- the worker entered — the down file leaves them in place, same convention as
-- 20260702140000).
--
-- POST-APPLY VERIFICATION:
--   select save_self_declared_work_history_v1('UAB Statyba — mūrininkas',
--     'employee', '2019-03-01', '2022-10-01');       -- as a worker: uuid
--   select save_self_declared_work_history_v1(...same...); -- same uuid (idempotent)
--   select remove_self_declared_work_history_v1(<id>);      -- 'removed'
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER functions +
-- grants = RED-class by the migration-safety classifier; the OWNER applies
-- manually).
-- ============================================================================

begin;

create or replace function public.save_self_declared_work_history_v1(
  p_title             text,
  p_relationship_slug text,
  p_started_at        date default null,
  p_ended_at          date default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_title  text := btrim(coalesce(p_title, ''));
  v_status text;
  v_id     uuid;
  v_count  int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Invalid title' using errcode = '22023';
  end if;
  -- Closed worker relationship set (subset of relationship_types; the FK
  -- would also enforce existence, this enforces the WORKER subset).
  if p_relationship_slug is null or p_relationship_slug not in
       ('employee','freelancer','consultant','collaborator') then
    raise exception 'Invalid relationship' using errcode = '22023';
  end if;
  if p_started_at is not null and p_ended_at is not null
     and p_ended_at < p_started_at then
    raise exception 'Invalid date range' using errcode = '22023';
  end if;

  -- Idempotent: an identical self-declared row already exists → return it.
  select ec.id into v_id
  from public.engagement_contexts ec
  where ec.profile_id = uid
    and ec.organization_id is null
    and lower(coalesce(ec.title, '')) = lower(v_title)
    and ec.relationship_slug = p_relationship_slug
    and ec.started_at is not distinct from p_started_at
    and ec.ended_at   is not distinct from p_ended_at
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Abuse bound: at most 60 organization-less rows per profile (includes the
  -- trigger-provisioned personal engagement).
  select count(*) into v_count
  from public.engagement_contexts ec
  where ec.profile_id = uid and ec.organization_id is null;
  if v_count >= 60 then
    raise exception 'Too many self-declared entries' using errcode = '54000';
  end if;

  v_status := case when p_ended_at is not null then 'ended' else 'active' end;

  insert into public.engagement_contexts
    (profile_id, organization_id, relationship_slug, status, is_primary,
     title, started_at, ended_at, hash_self)
  values
    (uid, null, p_relationship_slug, v_status, false,
     v_title, p_started_at, p_ended_at,
     encode(extensions.digest(
       uid::text || ':' || p_relationship_slug || ':' || v_title || ':'
         || coalesce(p_started_at::text, '') || ':' || coalesce(p_ended_at::text, ''),
       'sha256'), 'hex'))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remove_self_declared_work_history_v1(
  p_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  removed int;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  begin
    delete from public.engagement_contexts ec
     where ec.id = p_id
       and ec.profile_id = uid
       and ec.organization_id is null
       and ec.is_primary = false;
    get diagnostics removed = row_count;
  exception when foreign_key_violation then
    -- Journal entries (FK restrict) reference this engagement — history with
    -- real records is never silently destroyed.
    return 'in_use';
  end;

  return case when removed > 0 then 'removed' else 'not_found' end;
end;
$$;

revoke all on function
  public.save_self_declared_work_history_v1(text, text, date, date) from public;
grant execute on function
  public.save_self_declared_work_history_v1(text, text, date, date) to authenticated;
revoke all on function
  public.remove_self_declared_work_history_v1(uuid) from public;
grant execute on function
  public.remove_self_declared_work_history_v1(uuid) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714161000_self_declared_work_history_v1.down.sql):
--   drop function if exists public.save_self_declared_work_history_v1(text, text, date, date);
--   drop function if exists public.remove_self_declared_work_history_v1(uuid);
--   -- Self-declared rows the worker already confirmed stay in place (their
--   -- data, same convention as 20260702140000's down note).
-- ════════════════════════════════════════════════════════════════════════════
