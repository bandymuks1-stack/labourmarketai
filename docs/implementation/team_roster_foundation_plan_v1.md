# Team / roster foundation — implementation plan v1

Converts `docs/vision/company-as-sports-team-model-v1.md` + `docs/audit/team-management-gap-audit-v1.md` into a sequenced roadmap. The vocabulary doc + audit are doc-only; this plan + the small empty-state card shipped in PR B are the first concrete deliverables.

## What ships in PR B

- **`TeamRosterEmptyState`** server component, mounted on company dashboard as **"Komandos branduolys"** and on agency dashboard as **"Kandidatų rezervas"**. Empty by design — no fake members, no fake stats. Frames the future model in honest copy.
- This planning doc.

## Five-phase plan

### P1 — Empty-state cards (ships in PR B)

Read-only card under each workspace's existing pilot disclaimer + Tier-1 warning. Tells the operator what the roster will hold once members exist + when invitations land.

### P2 — `team_memberships` schema

New migration `00XX_team_memberships.sql`. Additive only.

```sql
create table if not exists public.team_memberships (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,  -- (FK once organization_profiles ships)
  worker_id         uuid not null references public.workers(id) on delete cascade,
  -- Role within the team — plain text mapped from professions taxonomy.
  team_role         text,
  -- Sports-team statuses (vocabulary doc § "lineup / bench").
  status            text not null default 'preparing'
                    check (status in ('preparing','active','bench','inactive','left')),
  joined_at         timestamptz not null default now(),
  left_at           timestamptz,
  -- Notes / tags the team manager keeps for context (NOT visible to the
  -- worker by default; visibility rules ship with the manager-confirmation
  -- backbone in PR #18).
  manager_notes     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

RLS:
- SELECT — team manager (representative_id of the organisation) OR the worker themselves OR admin.
- INSERT — team manager OR admin (worker doesn't add themselves; team picks them).
- UPDATE — team manager OR admin (status / notes); worker updates only their own `status='left'`.
- No DELETE policy — append-only (`left_at` is the soft-removal signal).

Grants only to `authenticated`.

### P3 — Availability

Per-worker availability calendar (lightweight: weekly availability windows, not a full ICS). Lives in a sibling table `worker_availability_windows`. Used by both the worker (to communicate "available next week") and the team manager (to see who's free).

Schema deferred until a real worker explicitly asks for it. v1 model: workers note availability in their journal entries (free text), team managers parse it manually.

### P4 — Assignments / projects

Connect `team_memberships` → `projects` (table already exists) via an `assignment` join. Each assignment ties a worker to a project for a window. Journal entries already FK to `engagement_contexts.id`; this layer makes "which worker is on which project this week" queryable.

Deferred until P2 + P3 exist + the journal-side `journal_entry_metrics.work_direction` data has shape.

### P5 — Scout / recommendation layer

The agency's primary product surface. Lets an agency propose moves between teams (transfers) + recommend workers to companies. NOT public marketplace; NOT auto-matching. Owner-mediated handoff first; algorithmic suggestions much later.

Out of scope for everything in v1-v2.

## What this PR explicitly does NOT ship

- Any schema (no `team_memberships` migration in this PR).
- Any roster API or admin surface.
- Any availability calendar.
- Any "compatibility score" or matching UI.
- Any public roster page.

The empty-state card is the smallest honest surface. It sets the vocabulary without faking content.

## Refs

- `docs/vision/company-as-sports-team-model-v1.md` (vocabulary)
- `docs/audit/team-management-gap-audit-v1.md` (gap analysis)
- `apps/web/components/app/team-roster-empty-state.tsx` (shipping in PR B)
- `apps/web/app/[locale]/dashboard/{company,agency}/page.tsx` (mount points)
