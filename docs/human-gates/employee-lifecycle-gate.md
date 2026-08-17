# HUMAN GATE — Employee Lifecycle v1 (EC-canonical)

Migration: `supabase/migrations/20260817190000_employee_lifecycle_v1.sql`
Rollback:  `supabase/rollbacks/20260817190000_employee_lifecycle_v1.down.sql`
State: `PENDING APPLY BY LEAD` — pre-approved by owner mandate 2026-08-17
(autonomous functional completion train V2, §4 migration authority). The
train LEAD session applies it to production via Supabase MCP
`apply_migration` after CI is green; never `db push`, never auto-apply.

## What it changes
1. FOUR additive NULLABLE columns on the CANONICAL employment record
   `engagement_contexts` (lead decision, duplication-consolidation plan
   v1): `lifecycle_stage` (onboarding / active / probation /
   change_pending / offboarding / ended), `probation_until`,
   `ended_reason` (closed vocabulary), `ended_note` (≤500). NO backfill
   DML — a NULL stage reads as 'active' (or 'ended' once the engagement
   status says so) through one COALESCE rule shared by SQL and TS.
2. NEW append-only, trigger-immutable `engagement_lifecycle_events`
   history (action / before / after / actor / note; immutable for every
   role including service_role).
3. NEW onboarding tables: `onboarding_templates` +
   `onboarding_template_items` (org-scoped authoring; kinds task /
   document_ack / asset_issue / training_note / custom) and
   `onboarding_runs` + `onboarding_run_items` (template snapshot bound to
   ONE engagement; one open run per engagement; items link by REFERENCE to
   real `work_tasks` / `document_acknowledgements` / `asset_assignments`
   rows and the links are VERIFIED at completion, never trusted).
4. NEW offboarding tables: `offboarding_runs` + `offboarding_run_items` —
   the checklist is GENERATED from asset reality (one required
   asset_return item per OPEN assignment of the worker on this org's
   assets; completable only when the assets engine really reads
   'returned') plus access-removal and final-evidence confirm items.
5. THREE SECURITY DEFINER visibility helpers + TWELVE SECURITY DEFINER
   commands — the ONLY write paths (all direct writes REVOKEd, zero write
   policies; anon holds nothing). Org-managing authority is the sanctioned
   dual-arm `manages_organization`; workers may self-confirm only the
   honest item kinds or items assigned to them.
6. `end_engagement_lifecycle_v1` wraps — never forks — the APPLIED
   canonical `end_org_membership_v1`: its authority ladder, last-owner
   protection and audit_logs row remain the single ending truth; this RPC
   adds reason/type/note capture, refuses while an offboarding checklist
   is open, and stamps the lifecycle columns + history on success.

## What it deliberately does NOT do
- No probation review workflow (stage + date only), no position/salary
  change machinery (change_pending stage + note only) — later trains.
- No notification-constraint touch, no scheduler, no external sending.
- No change to company_worker_engagements, rosters, invitations,
  memberships, document-engine or workflow-engine internals, task or
  timesheet files (sibling trains own those).

## Why
Full-reality audit 2026-08-17 (EMPLOYEE LIFECYCLE): onboarding PARTIAL
(project checklists only), offboarding MISSING, probation DEAD,
termination PARTIAL (status flip, no reason/type/note), changes MISSING,
and no lifecycle history anywhere.

## Proof
- Static gate: migration-safety GREEN `[human-gated]` (RED content is the
  structurally unavoidable RLS-engine class; marker cites the mandate).
- Behavioural: `scripts/db-proof/employee-lifecycle.sh` — **85/85** on a
  throwaway Postgres 15, executing migration + rollback VERBATIM:
  authority matrix (owner / manager / worker self / other worker /
  wrong-org owner / attacker / platform admin / anon / direct writes),
  stage-transition legality, checklist completion gating, reference-link
  verification incl. wrong-worker and wrong-org scoping, asset-return
  gating, end-wrap incl. last_owner + idempotent repeat, ledger
  immutability (even superuser), rollback → clean re-apply, ended
  memberships STAY ended after rollback.

## What the lead applies
> `20260817190000_employee_lifecycle_v1` (this file only — no
> notification widening rides with this train).
Prerequisites already in production: `end_org_membership_v1`
(20260802160000), dual-arm `manages_organization` (20260806180000),
assets engine (20260718170000), document engine (20260817140000 pair,
applied per its own gate).
