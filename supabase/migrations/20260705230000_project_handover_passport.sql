-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260705230000 — job/project handover passport shell (product-tree
-- branch 19, train §8.8).
--
-- PROBLEM (reality-map 2026-07-05 §branch 19, YELLOW): bookings are GREEN
-- (booking_requests lifecycle, 20260613100100) but there is NO handover
-- passport — a manager cannot record the living handover facts of a real
-- project (notes, declared status history) anywhere. The map's minimum PR:
-- "passport shell reusing the existing projects surface; additive migration
-- for passport records" on /dashboard/projects/[id]/operations.
--
-- SOLUTION (smallest honest slice): ONE new append-only table +
-- ONE new gated write RPC on the EXISTING project spine:
--
--   1. project_handover_entries — append-only passport entries for a project
--      the caller manages. entry_type 'note' (free-text handover fact) or
--      'status' (declared handover stage). Status values are HONEST stages:
--      preparation / in_progress / handover_declared / closed.
--      'handover_declared' is deliberately named as a DECLARATION by the
--      manager — never a platform-verified or certified completion
--      (§8.8 "no fake completion"; defect/warranty fields are deliberately
--      NOT added — they would not be honest without an evidence model).
--   2. RLS SELECT is MANAGER-ONLY: can_manage_project(project_id) (EXISTING
--      helper, 20260601091000) or is_admin(). Free-text entry bodies never
--      cross to any other user class — no worker-side policy, no anon, no
--      cross-user read path (six-point privacy gate).
--   3. add_project_handover_entry_v1 — the ONLY write path (direct
--      insert/update/delete REVOKEd, no write policies). SECURITY DEFINER,
--      re-checks can_manage_project on the server, validates the enum,
--      bounds body length, caps entries per project. INSERT-only body:
--      the table IS the history — nothing is ever updated or deleted.
--
-- WHAT IS DELIBERATELY NOT ADDED:
--   - NO new booking system, NO new project system (bookings + projects +
--     assignments + readiness checklist stay the EXISTING spine untouched);
--   - NO photo storage (no honest storage path in this slice — the shell
--     says so instead of faking it);
--   - NO checklist duplication — the per-worker readiness checklist
--     (project_worker_readiness_items, 20260609180000) already lives on the
--     same operations page and stays the single checklist;
--   - NO defect/warranty fields (not honest without an evidence model);
--   - NO recreate of ANY existing RPC/trigger/table — the table and the
--     function are NEW names (rollback-chain rule: nothing to restore
--     verbatim);
--   - NO change to any existing table, policy, grant, or constraint.
--
-- @human-gate-approved — TIER: owner-gated (SECURITY DEFINER function +
-- GRANT + new RLS-bearing table are RED-class). Ships as a needs-human-gate
-- DRAFT with the exact SQL; prod apply stays manual via Supabase MCP after
-- owner approval — never db push. Until applied, the app degrades honestly:
-- the read probe sees 42P01 and the operations page shows the passport
-- shell's "not yet available" state (nothing faked, no fake entries).
--
-- ROLLBACK: supabase/rollbacks/20260705230000_project_handover_passport.down.sql
-- restores the prior state exactly: drops ONLY the one NEW function and the
-- one NEW table (feature-created rows live ONLY in that table, so dropping
-- it removes only feature-created rows). No existing RPC was recreated, so
-- no RPC body needs restoring and the down file contains no create-function.
-- ============================================================================

begin;

-- ── 1. project_handover_entries — append-only passport records ─────────────
create table if not exists public.project_handover_entries (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  entry_type   text not null check (entry_type in ('note','status')),
  status_value text check (status_value in
                 ('preparation','in_progress','handover_declared','closed')),
  body         text check (body is null or char_length(body) <= 1000),
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now(),
  -- Shape: a status entry carries a status_value (optional note); a note
  -- entry carries a non-empty body and no status_value.
  constraint phe_entry_shape check (
    (entry_type = 'status' and status_value is not null)
    or
    (entry_type = 'note' and status_value is null
      and body is not null and char_length(trim(body)) > 0)
  )
);
create index if not exists phe_project_created_idx
  on public.project_handover_entries (project_id, created_at desc);

alter table public.project_handover_entries enable row level security;

-- SELECT: MANAGER-ONLY (+ admin). Free-text passport bodies stay inside the
-- managing side of the project — no worker-side read, no cross-user path.
drop policy if exists phe_select on public.project_handover_entries;
create policy phe_select on public.project_handover_entries
  for select to authenticated
  using (public.can_manage_project(project_id) or public.is_admin());
-- No insert/update/delete policy: the gated RPC below is the ONLY write path
-- (direct writes are REVOKEd further down). Append-only by construction.

-- ── 2. add_project_handover_entry_v1 — the ONLY write path ─────────────────
create or replace function public.add_project_handover_entry_v1(
  p_project_id   text,
  p_entry_type   text,
  p_status_value text,
  p_body         text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  pid     uuid := nullif(p_project_id, '')::uuid;
  v_type  text := nullif(trim(coalesce(p_entry_type, '')), '');
  v_stat  text := nullif(trim(coalesce(p_status_value, '')), '');
  v_body  text := nullif(trim(coalesce(p_body, '')), '');
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null then
    return 'invalid_entry';
  end if;

  -- Server-side gate: only a manager of THIS project (or admin) writes.
  if not (public.can_manage_project(pid) or public.is_admin()) then
    return 'not_allowed';
  end if;

  -- Honest shape validation (mirrors the table constraint).
  if v_type = 'status' then
    if v_stat is null or v_stat not in
         ('preparation','in_progress','handover_declared','closed') then
      return 'invalid_entry';
    end if;
  elsif v_type = 'note' then
    if v_body is null then
      return 'invalid_entry';
    end if;
    v_stat := null;
  else
    return 'invalid_entry';
  end if;

  if v_body is not null and char_length(v_body) > 1000 then
    return 'invalid_entry';
  end if;

  -- Abuse cap: a passport is a record, not a chat — bound row minting.
  if (select count(*) from public.project_handover_entries e
       where e.project_id = pid) >= 500 then
    return 'entry_limit_reached';
  end if;

  -- INSERT-only: the passport is append-only history. Nothing here (or
  -- anywhere) updates or deletes an entry.
  insert into public.project_handover_entries
    (project_id, entry_type, status_value, body, created_by)
  values
    (pid, v_type, v_stat, v_body, uid);

  return 'created';
end $$;

revoke all on function public.add_project_handover_entry_v1(text, text, text, text) from public;
grant execute on function public.add_project_handover_entry_v1(text, text, text, text) to authenticated;

-- ── 3. Grants — SELECT only to authenticated; writes are RPC-only ──────────
grant select on public.project_handover_entries to authenticated;
revoke insert, update, delete on public.project_handover_entries from authenticated;

commit;

-- ROLLBACK (down): supabase/rollbacks/20260705230000_project_handover_passport.down.sql
-- restores the prior state exactly (drops the one NEW function and the one
-- NEW table; feature-created rows live only in that table).
