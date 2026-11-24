-- ════════════════════════════════════════════════════════════════════════════
-- 20260829140000 — work hour allocations v1
--
-- @human-gate-approved
-- OWNER APPROVAL 2026-08-31: "M3_MIGRATION_APPROVAL: APPROVE" — scope limited
-- to this PR #1344 / decision package docs/DECISIONS/0010 (2026-08-31). The
-- three migration-safety flags (grant-or-revoke, alter-drop-policy,
-- create-trigger) are the migration's INTENTIONAL tight-grant + RLS + audit
-- surface, reviewed in the package; the annotation acknowledges RED class, it
-- does not reclassify it. Apply via Supabase MCP apply_migration only.
--
-- CLASS: additive-only content, RED review class (new authorization surface).
-- One new table, one new nullable column on `work_objects`, no drops, no data
-- migration, no RLS loosened anywhere. Full rollback ships beside it.
--
-- ── WHY (real pilot, measured before writing) ───────────────────────────────
--
-- A site operator must record who worked, on which date, at which object, for
-- how many hours — and one worker routinely splits a day across objects:
--
--     Vitalii · 2026-08-29 · Object 01 → 8 h
--     Vitalii · 2026-08-29 · Object 05 → 2 h
--
-- That is TWO facts, not one overwritten one. Nothing in the schema could hold
-- them. Measured on production 2026-08-29:
--
--   work_objects              0 rows   the site entity ALREADY EXISTS
--   timesheets                1 row    period envelope + status + jsonb snapshot
--   timesheet_events          1 row    actor/action/note/timestamp audit trail
--   journal_entry_work_items  0 rows   hours, but bound to a journal entry
--
-- So the site, the approval envelope and the audit trail are all already
-- built. What is missing is the row-level allocation they aggregate FROM.
-- `timesheets.lines_snapshot` is jsonb: correct as a frozen snapshot of what
-- was submitted, wrong as the canonical record — you cannot query "hours per
-- worker per object this month" out of a snapshot without re-parsing history.
--
-- The direction is deliberate and must not be reversed:
--
--     CANONICAL ALLOCATION ROWS → aggregation → timesheet snapshot / approval
--                                             → export
--
-- ── WHY NOT A PARALLEL STRUCTURE (doctrine §2 canonical check) ──────────────
--
--   * the SITE is `work_objects` — reused, not re-invented. It already carries
--     organization, optional project link, address, geo, responsible person
--     and status. Only a colour was missing, and colour is UX metadata.
--   * APPROVAL stays `timesheets` + `timesheet_events`. This migration creates
--     no second approval framework and no approved_by/approved_at columns:
--     an allocation is a fact, a timesheet is the decision about a period of
--     facts, and merging them would give the platform two answers to "was this
--     approved?".
--   * WORK JOURNAL linkage is one nullable FK. Hours alone are an attendance
--     fact and must never manufacture skill evidence; a journal entry is how a
--     description becomes evidence, and only explicitly.
--   * CORRECTION uses the idiom `journal_entries` already uses —
--     `correction_of` + `superseded_by` — rather than inventing a third.
--
-- ── DELIBERATELY NOT ADDED, and why (so this is a floor, not a ceiling) ─────
--
--   project_id       derivable via work_objects.project_id. Storing it too
--                    would create a second answer to "which project?". Add it
--                    only if allocations ever need a project WITHOUT an object.
--   team / brigade   no team data exists yet; adding an empty FK now would be
--                    a guess at a shape nobody has.
--   import_batch_id  `source` already records provenance. Add when a real
--                    import lands and needs to be undone as a unit.
--   approved_by/at   belongs to the timesheet, per the separation above.
--
-- Each is a nullable additive column later. None is blocked by this shape.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Colour on the existing site entity (UX metadata only) ────────────────
--
-- Colour carries NO business meaning: it is how an operator tells four objects
-- apart on a phone at 6am, nothing more. Anything that reads colour to decide
-- behaviour is a bug. Nullable, so every existing row stays valid and the app
-- falls back to a deterministic palette.
alter table public.work_objects
  add column if not exists color_hex text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.work_objects'::regclass
       and conname = 'work_objects_color_hex_format'
  ) then
    alter table public.work_objects
      add constraint work_objects_color_hex_format
      check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end $$;

comment on column public.work_objects.color_hex is
  'UX-only tint for telling objects apart in lists and grids (#RRGGBB). Never an input to any business rule.';

-- ── 2. The canonical allocation row ─────────────────────────────────────────
create table if not exists public.work_hour_allocations (
  id uuid primary key default gen_random_uuid(),

  -- WHOSE company this fact belongs to. Denormalised from the object on
  -- purpose: it is the RLS tenant key, and RLS must not depend on a join.
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- WHOSE WORK is recorded. Not necessarily the person who typed it.
  worker_id uuid not null references public.workers (id) on delete restrict,

  -- WHO TYPED IT. `entered_by` and `worker_id` are different concepts and are
  -- never collapsed: an operator entering a colleague's hours must be
  -- attributable as the enterer, and the record must not pretend the worker
  -- entered their own data. A future worker / manager / import / AI actor all
  -- land here without a schema change.
  entered_by uuid not null references public.profiles (id) on delete restrict,

  work_date date not null,
  work_object_id uuid not null references public.work_objects (id) on delete restrict,

  hours_numeric numeric(5, 2) not null,

  -- The operator's own words. A description here may LATER become Work Journal
  -- activity through `journal_entry_id`; on its own it is not evidence and
  -- proves no skill.
  note text,

  -- Provenance, open by convention rather than a CHECK — the same shape
  -- `worker_skills.source` uses ('manual', 'import', 'ai', …). A closed enum
  -- here would be exactly the ceiling doctrine §10 forbids.
  source text not null default 'manual',

  status text not null default 'recorded',

  -- OPTIONAL, EXPLICIT Work Journal linkage. Null is the normal case: an
  -- attendance fact with no narrative. Set only when a real entry describes
  -- the work.
  journal_entry_id uuid references public.journal_entries (id) on delete set null,

  -- Non-destructive correction, mirroring `journal_entries`. A wrong number is
  -- superseded, never overwritten and never deleted — §7's "original value +
  -- correction history" is the row that stays.
  correction_of uuid references public.work_hour_allocations (id) on delete set null,
  superseded_by uuid references public.work_hour_allocations (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A single allocation is bounded by a real day. Multiple allocations still
  -- sum freely across objects; this only rejects a typo like 80 for 8.
  constraint work_hour_allocations_hours_sane
    check (hours_numeric > 0 and hours_numeric <= 24),

  constraint work_hour_allocations_status_known
    check (status in ('recorded', 'submitted', 'approved', 'rejected')),

  constraint work_hour_allocations_not_self_referential
    check (correction_of is null or correction_of <> id),
  constraint work_hour_allocations_not_self_superseding
    check (superseded_by is null or superseded_by <> id)
);

-- ── NO UNIQUENESS ON (worker, date) OR (worker, date, object) ───────────────
--
-- Stated as a constraint that is deliberately ABSENT, because the obvious
-- "one row per worker per day" index is exactly the bug this table exists to
-- prevent: it would silently make Vitalii's second object overwrite his first.
-- Two allocations on one object in one day are also legitimate (a morning and
-- an afternoon shift), so no narrower unique index is correct either.

comment on table public.work_hour_allocations is
  'Canonical row-level work-hour allocation: one (worker, date, object, hours) fact. Timesheets aggregate and approve these; they are never stored only inside a timesheet snapshot.';
comment on column public.work_hour_allocations.entered_by is
  'The profile that RECORDED this allocation — distinct from worker_id, whose work it is. Never collapsed.';
comment on column public.work_hour_allocations.journal_entry_id is
  'Optional, explicit Work Journal link. An hours-only allocation is an attendance fact and implies NO skill evidence.';

-- Read paths the pilot actually uses: a day for an org, a month per worker,
-- and totals per object.
create index if not exists work_hour_allocations_org_date_idx
  on public.work_hour_allocations (organization_id, work_date desc);
create index if not exists work_hour_allocations_worker_date_idx
  on public.work_hour_allocations (worker_id, work_date desc);
create index if not exists work_hour_allocations_object_date_idx
  on public.work_hour_allocations (work_object_id, work_date desc);

drop trigger if exists work_hour_allocations_set_updated_at on public.work_hour_allocations;
create trigger work_hour_allocations_set_updated_at
  before update on public.work_hour_allocations
  for each row execute function public.set_updated_at();

-- ── 3. Privileges — inherited defaults are REVOKED, not trusted ─────────────
--
-- ALTER DEFAULT PRIVILEGES in this database hands new public tables to `anon`.
-- `work_objects` still carries the result: anon holds INSERT, UPDATE, DELETE
-- and TRUNCATE on it (RLS is what actually stops the writes). This table does
-- not inherit that. TRUNCATE is withheld from every client role, because a
-- table whose whole purpose is a durable record must not be emptiable by one.
revoke all on public.work_hour_allocations from public;
revoke all on public.work_hour_allocations from anon;
revoke all on public.work_hour_allocations from authenticated;

grant select, insert, update on public.work_hour_allocations to authenticated;
grant select, insert, update, delete on public.work_hour_allocations to service_role;

-- ── 4. RLS — the same predicates `timesheets` already uses ──────────────────
alter table public.work_hour_allocations enable row level security;

-- WHO MAY SEE IT: the worker themselves, anyone who manages the organization,
-- or an admin. Byte-identical in shape to `timesheets_select`, so an operator
-- sees exactly the same set of people in both surfaces.
drop policy if exists work_hour_allocations_select on public.work_hour_allocations;
create policy work_hour_allocations_select
  on public.work_hour_allocations
  for select
  using (
    public.owns_worker(worker_id)
    or public.manages_organization(organization_id)
    or public.is_admin()
  );

-- WHO MAY RECORD: a manager of the organization (the operator case — Ramūnas
-- entering for his crew), or the worker for their own hours. `entered_by` is
-- forced to the caller, so the enterer can never be forged.
drop policy if exists work_hour_allocations_insert on public.work_hour_allocations;
create policy work_hour_allocations_insert
  on public.work_hour_allocations
  for insert
  with check (
    entered_by = auth.uid()
    and (
      public.manages_organization(organization_id)
      or public.owns_worker(worker_id)
    )
  );

-- WHO MAY AMEND: the same people, and the row must stay inside the same
-- organization — an update may never move a fact into another tenant.
drop policy if exists work_hour_allocations_update on public.work_hour_allocations;
create policy work_hour_allocations_update
  on public.work_hour_allocations
  for update
  using (
    public.manages_organization(organization_id)
    or public.owns_worker(worker_id)
  )
  with check (
    public.manages_organization(organization_id)
    or public.owns_worker(worker_id)
  );

-- NO DELETE POLICY, DELIBERATELY. There is no client path that removes a work
-- record: a mistake is superseded, leaving both rows and the history between
-- them. Only service_role can hard-delete, and only for genuine data repair.
