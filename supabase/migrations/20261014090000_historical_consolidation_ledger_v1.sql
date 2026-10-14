-- @human-gate-approved
--
-- SAFETY CLASS: RED (new table + RLS + GRANT SELECT to authenticated + a
-- SECURITY DEFINER function). Draft PR + needs-human-gate; apply ONLY via
-- Supabase MCP apply_migration after explicit owner approval.
--
-- 20261014090000 — the HISTORICAL CONSOLIDATION LEDGER.
--
-- WHY: an imported history turns messy object cells into project rows; one
-- object (W22.073) became 40 rows. Owner decision 2026-10-14: consolidate by
-- the whole of the evidence, and turn EVERY mismatch into a recorded fact —
-- original text, normalized name, canonical project, mismatch types, the
-- signals that linked it, certainty, conflicts, the decision, when and by
-- which rule version, and how to undo it. The merge itself reuses the
-- existing marker (projects.record_state / canonical_project_id,
-- 20260930120000); this table is the reasoning the marker never stored.
-- audit_logs keeps the before/after too, but it is admin-only to read, so
-- the organization could not see why its history looks the way it does.
--
-- WHY NOT audit_logs ALONE: not readable by the organization (admin-only),
-- unstructured payload, no "kept separate because …" rows.
--
-- ACCESS: RLS on. SELECT for whoever may manage the project row (the existing
-- can_manage_project) and platform admins. No INSERT / UPDATE / DELETE for
-- any client role: rows are written by the consolidation package migration
-- and by revert_historical_consolidation_v1 only.
--
-- REVERSIBLE: revert_historical_consolidation_v1(decision, reason) returns
-- the row to active (only if it still points at that canonical), stamps the
-- decision reverted, and writes audit_logs. Records are never touched by
-- either direction.
-- ADDITIVE: one table, two indexes, one policy, one function. Idempotent.
-- ROLLBACK: supabase/rollbacks/20261014090000_historical_consolidation_ledger_v1.down.sql

begin;

create table if not exists public.historical_consolidation_decisions (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- The imported project row the decision is about.
  project_id            uuid not null references public.projects(id) on delete cascade,
  -- The project it now counts toward; NULL when kept separate.
  canonical_project_id  uuid references public.projects(id) on delete set null,
  -- 1. the imported text, as imported (the row's object cells).
  original_text         text not null,
  -- 2. the normalized object name the rule derived.
  normalized_name       text not null,
  -- 4. mismatch types found on this row (see the CHECK).
  mismatch_types        text[] not null default '{}',
  -- 5. which signals linked it (codes, address key, shared people, periods).
  signals               jsonb not null default '{}'::jsonb,
  -- 6. unambiguous / probable / none (kept separate).
  certainty             text not null,
  -- 7. contradicting evidence, if any.
  conflicts             jsonb not null default '[]'::jsonb,
  -- 8. merged / canonical / kept_separate.
  decision              text not null,
  -- 9. when and by which rule version; decided_by NULL = the reviewed package.
  rule_version          text not null,
  decided_at            timestamptz not null default now(),
  decided_by            uuid references public.profiles(id) on delete set null,
  -- 10. undo: set by revert_historical_consolidation_v1.
  reverted_at           timestamptz,
  reverted_by           uuid references public.profiles(id) on delete set null,
  revert_reason         text,
  constraint hcd_certainty_chk check (certainty in ('unambiguous', 'probable', 'none')),
  constraint hcd_decision_chk check (decision in ('merged', 'canonical', 'kept_separate')),
  constraint hcd_merge_shape_chk check ((decision = 'merged') = (canonical_project_id is not null and canonical_project_id <> project_id)),
  constraint hcd_types_chk check (mismatch_types <@ array[
    'address_spelling_variant', 'code_spelling_variant', 'name_mixed_with_work_description',
    'object_split_into_projects', 'multiple_objects_in_row', 'no_object', 'no_house_number',
    'period_mismatch', 'possible_duplicate_records', 'ambiguous_person', 'conflicting_project_data',
    'possible_same_object'
  ]::text[]),
  constraint hcd_text_chk check (char_length(original_text) <= 4000 and char_length(normalized_name) <= 400),
  constraint hcd_revert_reason_chk check (revert_reason is null or char_length(revert_reason) between 3 and 500)
);

comment on table public.historical_consolidation_decisions is
  'One row per imported project row: why it was merged into a canonical project or kept separate (original text, normalized name, mismatch types, signals, certainty, conflicts, rule version), and its undo. Records are never changed by a decision.';

create unique index if not exists hcd_one_live_decision_per_rule
  on public.historical_consolidation_decisions (project_id, rule_version);
create index if not exists hcd_org_idx
  on public.historical_consolidation_decisions (organization_id, decision);

alter table public.historical_consolidation_decisions enable row level security;

drop policy if exists hcd_select_managers on public.historical_consolidation_decisions;
create policy hcd_select_managers on public.historical_consolidation_decisions
  for select to authenticated
  using (public.can_manage_project(project_id) or public.is_admin());

revoke all on table public.historical_consolidation_decisions from public;
revoke all on table public.historical_consolidation_decisions from anon;
revoke all on table public.historical_consolidation_decisions from authenticated;
grant select on table public.historical_consolidation_decisions to authenticated;

create or replace function public.revert_historical_consolidation_v1(
  p_decision_id uuid,
  p_reason      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  d   public.historical_consolidation_decisions;
begin
  if uid is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) not between 3 and 500 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into d from public.historical_consolidation_decisions where id = p_decision_id for update;
  if d.id is null then return jsonb_build_object('outcome', 'not_found'); end if;
  if not ((public.can_manage_project(d.project_id)
           and (d.canonical_project_id is null or public.can_manage_project(d.canonical_project_id)))
          or public.is_admin()) then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if d.decision <> 'merged' then return jsonb_build_object('outcome', 'not_a_merge'); end if;
  if d.reverted_at is not null then return jsonb_build_object('outcome', 'already_reverted'); end if;

  update public.projects
     set record_state = 'active', canonical_project_id = null, updated_at = now()
   where id = d.project_id
     and record_state = 'duplicate'
     and canonical_project_id = d.canonical_project_id;

  update public.historical_consolidation_decisions
     set reverted_at = now(), reverted_by = uid, revert_reason = left(btrim(p_reason), 500)
   where id = d.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, payload, occurred_at)
  values (uid, 'revert_historical_consolidation_v1', 'project', d.project_id,
          jsonb_build_object('decision_id', d.id,
                             'before', jsonb_build_object('record_state', 'duplicate', 'canonical_project_id', d.canonical_project_id),
                             'after', jsonb_build_object('record_state', 'active', 'canonical_project_id', null),
                             'reason', left(btrim(p_reason), 500)),
          now());
  return jsonb_build_object('outcome', 'reverted', 'project_id', d.project_id);
end;
$function$;

revoke all on function public.revert_historical_consolidation_v1(uuid, text) from public, anon;
grant execute on function public.revert_historical_consolidation_v1(uuid, text) to authenticated;

commit;
