-- ============================================================================
-- 20261001100000 — the manager's decision on a staffing collision is audited.
--
-- RED by rule (new SECURITY DEFINER function writing audit_logs).
-- @human-gate-approved
-- Apply only via Supabase MCP apply_migration after owner approval.
--
-- WHY. The product detects a collision at assignment (CAL-7), explains it, and
-- (PR #2038) offers confirmed-free colleagues, swap and undo. The human
-- decision — kept / undone / swapped, by whom, why, when — was not recorded
-- anywhere. `audit_logs` is the existing append-only mechanism (admin-read,
-- written only by SECURITY DEFINER functions); this adds ONE narrow writer
-- to it. No new table, no change to assign_worker_to_project.
--
-- WHY A SEPARATE FUNCTION AND NOT A CHANGE TO assign_worker_to_project. The
-- decision happens AFTER the assignment (keep / undo / swap are later acts),
-- so the assign RPC cannot know it. Leaving that hot, already-redefined RPC
-- byte-identical keeps this change minimal and independently reversible.
--
-- AUTHORITY: the caller must manage THIS project (can_manage_project) or be
-- admin — the same gate the assignment itself used. Decision vocabulary is a
-- closed set. The reason is optional and length-bounded. Nothing is read back
-- to the caller; audit_logs RLS is unchanged (select/insert admin only).
--
-- ROLLBACK: supabase/rollbacks/20261001100000_assignment_decision_audit_v1.down.sql
-- ============================================================================

create or replace function public.record_assignment_decision(
  p_project_id text,
  p_worker_profile_id text,
  p_decision text,
  p_reason text default null
) returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  uid   uuid := auth.uid();
  pid   uuid := nullif(p_project_id, '')::uuid;
  w_pid uuid := nullif(p_worker_profile_id, '')::uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if pid is null or w_pid is null then
    raise exception 'Project and worker are required' using errcode = '22023';
  end if;
  if p_decision is null or p_decision not in ('kept', 'undone', 'swapped') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  if not (public.can_manage_project(pid) or public.is_admin()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload)
    values (uid, 'assignment_collision_decision', 'projects', pid,
            jsonb_build_object(
              'decision', p_decision,
              'worker_profile_id', w_pid,
              'reason', nullif(left(btrim(coalesce(p_reason, '')), 500), '')));
end;
$function$;

revoke all on function public.record_assignment_decision(text, text, text, text) from public, anon;
grant execute on function public.record_assignment_decision(text, text, text, text) to authenticated;
