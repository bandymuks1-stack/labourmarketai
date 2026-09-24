-- ============================================================================
-- 20260924110000_historical_timesheet_m2_ordered_work
-- Historical timesheet import PR-4 = migration M2 of
-- docs/design/historical-timesheet-import-v3.md: §5.3 (ONE additive relation
-- for ordered-work steps), §14 row M2 and §15 row PR-4. Owner rules
-- 2026-09-23 (§1): timesheets only, no finance; an order relationship is not
-- an order document (decision B); additional ordered work is a separate step
-- (decision C).
--
-- CLASS: RED under .github/scripts/migration-safety.mjs — exactly why:
--   • a NEW table needs an explicit GRANT, because pg_default_acl holds 0 rows
--     for schema public on this project (design §2 "Grants", re-read 2026-09-24).
--     REVOKE … FROM public, anon and GRANT SELECT, INSERT … TO authenticated
--     are the privilege-surface change the gate flags as `grant-or-revoke`.
--   • nothing else is RED: no SECURITY DEFINER, no trigger, no ALTER / DROP
--     POLICY, no data UPDATE / DELETE, no dynamic SQL, no `(true)` predicate,
--     no `to anon`, no service-role path, no change to any existing object.
--   • the human gate is the control: this PR is a DRAFT with the label
--     needs-human-gate; the owner approves the exact SQL in the PR body, and
--     the lead applies it through Supabase MCP apply_migration (never db push).
-- @human-gate-approved: TIER owner-gated — finding acknowledged: grant-or-revoke
--   (a new table needs an explicit GRANT; public has no default privileges).
--   No definer, no trigger, no policy change elsewhere. The annotation lets the
--   static gate pass CI; it is an acknowledgement, not an approval — the owner
--   approves in the PR (design §15 row PR-4).
--
-- WHAT IT IS. One relation, project_ordered_work: one project holds its INITIAL
-- ordered work and, separately, each ADDITIONAL ordered work, each with its own
-- first-evidenced window at its own precision. It has NO order-detail and NO
-- money column (order date, order reference, contract number, price, quantity,
-- change-order reference are named by the projector as "not on record", §5.4).
--   • insert only: authenticated holds SELECT and INSERT; no UPDATE, DELETE or
--     TRUNCATE grant and no matching policy — the evidence family's pattern.
--   • a correction is a new row with supersedes_step_id; the old row stays.
--   • every FK is composite with organization_id (tenant-safe; the targets are
--     projects_org_scope, work_objects_org_scope, project_clients_project_scope
--     from M1 and the pre-existing *_org_scope keys on records and sessions).
--   • pow_select = manages_organization OR is_admin (the family's read rule).
--   • pow_insert = created_by is the caller AND G(organization_id) written out
--     (manages_organization minus external_manager, design §8) AND the session
--     is the org's own and supplied by the org AND the customer row is KEYED.
--   • idempotent: CREATE TABLE / INDEX IF NOT EXISTS; the policies are created
--     only when pg_policies does not hold them; REVOKE / GRANT are re-runnable.
--
-- DEPENDS ON: M1 (20260924100000, ledger 20260924021637, APPLIED) for the
-- composite FK targets on projects, work_objects and project_clients.
--
-- CHECKS (all read-only on production 2026-09-24, results in the PR body):
--   1. to_regclass('public.project_ordered_work') IS NULL (0 rows exist yet).
--   2. the five composite FK targets exist as UNIQUE constraints.
--   3. pg_default_acl has 0 rows for schema public (a GRANT is needed).
--   4. the rolled-back DO block docs/design/historical-timesheet-m2-m3-dryrun.sql
--      (it embeds the M2 body below byte-for-byte) — executed by the lead.
--
-- ROLLBACK: supabase/rollbacks/20260924110000_historical_timesheet_m2_ordered_work.down.sql
-- REFUSES while any row exists; otherwise drops the two policies, the two
-- indexes and the table (its grants go with it).
-- ============================================================================

begin;

-- M2 BODY BEGIN
-- ── M2a ── the ONE additive relation for ordered-work steps ────────────────
create table if not exists public.project_ordered_work (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  project_client_id uuid not null,
  work_object_id uuid,
  step_kind text not null check (step_kind in ('initial','additional')),
  -- the work kinds (scope keys, scope-key:v1) whose first evidence defines this step
  scope_keys text[] not null check (cardinality(scope_keys) between 1 and 50),
  scope_labels text[] not null check (cardinality(scope_labels) = cardinality(scope_keys)),
  first_evidenced_on date not null,
  first_evidenced_until date not null,
  first_evidenced_precision text not null check (first_evidenced_precision in ('day','week','month')),
  first_evidence_record_id uuid not null,
  evidence_basis text not null default 'organization_timesheet'
    check (evidence_basis = 'organization_timesheet'),
  detection jsonb not null,           -- {method:'ordered-work:v1', gapDays, lateStartDays, repeatGapDays, rule, decidedEventId?}
  review_state text not null check (review_state in ('auto','human_confirmed')),
  supersedes_step_id uuid references public.project_ordered_work(id) on delete restrict,
  step_fingerprint text not null check (char_length(step_fingerprint) between 16 and 128),
  created_session_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pow_window check (first_evidenced_until >= first_evidenced_on),
  constraint pow_project_fk foreign key (project_id, organization_id)
    references public.projects (id, organization_id),
  constraint pow_client_fk foreign key (project_client_id, project_id)
    references public.project_clients (id, project_id),
  constraint pow_object_fk foreign key (work_object_id, organization_id)
    references public.work_objects (id, organization_id) on delete set null (work_object_id),
  constraint pow_first_record_fk foreign key (first_evidence_record_id, organization_id)
    references public.organization_evidence_records (id, organization_id),
  constraint pow_session_fk foreign key (created_session_id, organization_id)
    references public.evidence_import_sessions (id, organization_id),
  constraint pow_once unique (organization_id, step_fingerprint)
);
create unique index if not exists pow_one_live_initial on public.project_ordered_work (project_id)
  where step_kind = 'initial' and supersedes_step_id is null;
create index if not exists pow_project_idx on public.project_ordered_work (organization_id, project_id, first_evidenced_on);

comment on table public.project_ordered_work is
  'Ordered-work STEPS of a historical project (design §5.3): the initial ordered work and each additional ordered work, with the first-evidenced window at its own precision. No order-detail and no money column — unknown order details are named by the projector as "not on record" (§5.4). Insert-only; a correction is a new row with supersedes_step_id.';
comment on column public.project_ordered_work.scope_keys is
  'The work kinds (scope-key:v1) whose first evidence defines this step; scope_labels holds the source spellings at the same positions.';
comment on column public.project_ordered_work.detection is
  'The deterministic rule trace (ordered-work:v1): method, the three thresholds, the rule that fired and, for a human decision, the decided import event id.';
comment on column public.project_ordered_work.step_fingerprint is
  'sha256(''ordered-work-step:v1|'' || org || ''|'' || project || ''|'' || kind || ''|'' || sorted scope keys || ''|'' || first_evidenced_on || ''|'' || precision); the idempotency key per organization (pow_once).';
comment on column public.project_ordered_work.supersedes_step_id is
  'A correction points at the step it replaces; the old row stays and is hidden in the views. Only a non-superseded initial step counts for pow_one_live_initial.';

-- ── M2b ── RLS and grants (the RED part: public has no default privileges) ─
alter table public.project_ordered_work enable row level security;
revoke all on public.project_ordered_work from public, anon;
grant select, insert on public.project_ordered_work to authenticated;   -- no update, no delete, no truncate

-- ── M2c ── policies (design §5.3, written out; no helper function is added) ─
do $hist_m_two_select$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_ordered_work'
                    and policyname = 'pow_select') then
    create policy pow_select on public.project_ordered_work for select to authenticated
      using (public.manages_organization(organization_id) or public.is_admin());
  end if;
end $hist_m_two_select$;

do $hist_m_two_insert$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename = 'project_ordered_work'
                    and policyname = 'pow_insert') then
    create policy pow_insert on public.project_ordered_work for insert to authenticated
      with check (
        created_by = auth.uid()
        and ( exists (select 1 from public.company_memberships m
                       where m.profile_id = auth.uid() and m.organization_id = project_ordered_work.organization_id
                         and m.status = 'active' and m.role in ('owner','admin','manager'))
           or exists (select 1 from public.engagement_contexts ec
                       where ec.profile_id = auth.uid() and ec.organization_id = project_ordered_work.organization_id
                         and ec.status = 'active' and ec.relationship_slug in ('owner','manager')) )
        and exists (select 1 from public.evidence_import_sessions s
                     where s.id = project_ordered_work.created_session_id
                       and s.organization_id = project_ordered_work.organization_id
                       and s.supplied_by_organization_id = project_ordered_work.organization_id)
        and exists (select 1 from public.project_clients pc
                     where pc.id = project_ordered_work.project_client_id
                       and pc.project_id = project_ordered_work.project_id
                       and pc.customer_key is not null)
      );
  end if;
end $hist_m_two_insert$;
-- M2 BODY END

commit;

-- ROLLBACK (down): supabase/rollbacks/20260924110000_historical_timesheet_m2_ordered_work.down.sql
-- Refuses while any project_ordered_work row exists; otherwise drops
-- pow_insert, pow_select, pow_project_idx, pow_one_live_initial and the table.
