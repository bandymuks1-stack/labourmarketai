-- ============================================================================
-- 20260930120000 — a project can be marked a DUPLICATE of its canonical twin.
--
-- RED by rule (column + CHECKs on an existing table, a SECURITY DEFINER
-- function + GRANT, one data write). OWNER-APPROVED 2026-09-30:
--   "eaa9ea10 palikti canonical projektu. dd7274e9 dabar neuždaryti kaip
--    completed/closed, nes tai klaidingai reikštų realų projekto lifecycle
--    įvykį. Įdiegti minimalų additive archive/duplicate mechanizmą.
--    dd7274e9 pažymėti duplicate, canonical_project_id = eaa9ea10, išsaugant
--    visą istoriją ir auditą. Nieko fiziškai netrinti."
-- Apply only via Supabase MCP apply_migration.
-- @human-gate-approved
--
-- WHY A SEPARATE AXIS. `status` (draft/live/paused/completed) is the WORK
-- lifecycle; "this row is a mistaken second copy" is a fact about the RECORD,
-- not about work. Completing or closing a duplicate would write a lifecycle
-- event that never happened. So: `record_state` ('active' | 'duplicate') +
-- `canonical_project_id`, orthogonal to `status`. Nothing is deleted; every
-- reference to the duplicate (its client row, its audit) stays.
--
-- ROLLBACK: supabase/rollbacks/20260930120000_project_duplicate_marker_v1.down.sql
-- ============================================================================

alter table public.projects
  add column if not exists record_state text not null default 'active';
alter table public.projects
  add constraint projects_record_state_check check (record_state in ('active', 'duplicate'));
alter table public.projects
  add column if not exists canonical_project_id uuid references public.projects(id);
alter table public.projects
  add constraint projects_duplicate_names_canonical
  check ((record_state = 'duplicate') = (canonical_project_id is not null));
alter table public.projects
  add constraint projects_not_own_canonical
  check (canonical_project_id is null or canonical_project_id <> id);

-- THE one write for the marker. Authority: the database's own
-- `can_manage_project` on BOTH projects, or a platform admin. The two must
-- belong to the same organization; the canonical must itself be active; a
-- reason is required; before/after goes to audit_logs.
create or replace function public.mark_project_duplicate_v1(
  p_project_id   uuid,
  p_canonical_id uuid,
  p_reason       text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  d   public.projects;
  c   public.projects;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_project_id is null or p_canonical_id is null or p_project_id = p_canonical_id then
    raise exception 'Two different projects are required' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) not between 3 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if not ((public.can_manage_project(p_project_id) and public.can_manage_project(p_canonical_id))
          or public.is_admin()) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  select * into d from public.projects where id = p_project_id for update;
  select * into c from public.projects where id = p_canonical_id;
  if d.id is null or c.id is null then return jsonb_build_object('outcome', 'not_found'); end if;
  if d.organization_id is distinct from c.organization_id then
    return jsonb_build_object('outcome', 'different_organization');
  end if;
  if c.record_state <> 'active' then return jsonb_build_object('outcome', 'canonical_not_active'); end if;
  if d.record_state = 'duplicate' then
    return jsonb_build_object('outcome', 'already_duplicate', 'canonical_project_id', d.canonical_project_id);
  end if;
  update public.projects
     set record_state = 'duplicate', canonical_project_id = p_canonical_id, updated_at = now()
   where id = p_project_id;
  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'mark_project_duplicate_v1', 'project', p_project_id,
          jsonb_build_object('before', jsonb_build_object('record_state', d.record_state, 'status', d.status),
                             'after', jsonb_build_object('record_state', 'duplicate', 'canonical_project_id', p_canonical_id),
                             'reason', left(p_reason, 500)), now());
  return jsonb_build_object('outcome', 'marked', 'project_id', p_project_id, 'canonical_project_id', p_canonical_id);
end;
$function$;

revoke all on function public.mark_project_duplicate_v1(uuid, uuid, text) from public, anon;
grant execute on function public.mark_project_duplicate_v1(uuid, uuid, text) to authenticated;

-- ── The owner's decision, applied once, with its own audit row ─────────────
-- Guarded: runs only if both rows exist in the same organization, the
-- duplicate carries no assignment and no journal entry, and it is unmarked.
do $$
declare
  v_dup  constant uuid := 'dd7274e9-0364-4bf9-aa38-32dd24522def';
  v_can  constant uuid := 'eaa9ea10-57a6-4d70-aee3-564f311b203b';
begin
  if exists (select 1 from public.projects d join public.projects c on c.id = v_can
              where d.id = v_dup and d.organization_id = c.organization_id and d.record_state = 'active')
     and not exists (select 1 from public.project_worker_assignments where project_id = v_dup)
     and not exists (select 1 from public.journal_entries where project_id = v_dup) then
    update public.projects set record_state = 'duplicate', canonical_project_id = v_can, updated_at = now()
     where id = v_dup;
    insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
    values (null, 'mark_project_duplicate_v1', 'project', v_dup,
            jsonb_build_object('before', jsonb_build_object('record_state', 'active', 'status', 'draft'),
                               'after', jsonb_build_object('record_state', 'duplicate', 'canonical_project_id', v_can),
                               'reason', 'Owner decision 2026-09-30: same organization, title (PASVINTINIAI), city and client (CONTURUS), created 62 min apart; no assignments or journal. Canonical = eaa9ea10.'),
            now());
  end if;
end $$;
