# TASKS

Persistent backlog for work that outlives a single PR. PR-specific handoffs
live in `docs/handoffs/`.

## Universal Architecture Sequence (PR #9 → #13)

- [x] **PR #10 (old greenfield spec)** — **SUPERSEDED** by the PR #14 gap analysis (`docs/handoffs/TASK-PR10-GAP-ANALYSIS.md`). The universal data model already shipped in PR #12 (`0013_work_journal_m1.sql`: 12 tables, RLS on all); the old spec targeted a non-existent Prisma schema and is not executed.
- [ ] **PR #10b** — Journal security-hardening delta (`0014`) — **spec-only authored** (`docs/handoffs/TASK-PR10B-0014-HARDENING-SPEC.md`); write-path decision encoded (worker self-INSERT direct under strict RLS; trust/exposure changes via SECURITY DEFINER RPC writing `audit_logs`). *Pending implementation review.* **Implementation automerge = NO until the SQL/RLS/RPC/audit diff is reviewed.*
- [ ] **PR #11** — Universal Work Journal UI + API — *blocked by: PR #10b*. Owns the entry↔skill-link table (does **not** exist yet → not created in `0014`) + PR #10b §5.8 compensating controls **#3/#4**. Controls **#1,#2,#5,#6,#7** stay in PR #10b/`0014`.
- [ ] **PR #12** — Living CV Hub + entry-level confirmation — *blocked by: PR #11*
- [ ] **PR #13** — Dashboard redesign (living OS feel) — *blocked by: PR #12*

Strategic compass: `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`

### Proposed future doctrine work (NOT formalized in PR #9)

These emerged from the PR #9 security/architecture review. They are recorded as
proposed doctrine candidates only — **not** formalized as new doctrine sections
(§15/§16) in PR #9, which stays strictly docs-only architecture alignment. The
underlying requirements are already enforced via existing doctrine (§3.1, §3.4,
§4, §7) and are baked into the PR #10–#12 skeletons.

- [ ] **Proposed: "DB-First Security" doctrine** — RLS default-deny on every
  author-content table; all confirmation/evidence/history writes via
  `SECURITY DEFINER` RPCs with server-side authorization; no direct client
  writes. (Currently grounded in §3.1 + §4.)
- [ ] **Proposed: "Audit-on-Trust-Event" doctrine** — every confirmation /
  rejection / verification transactionally writes link-state + append-only
  history + immutable `audit_log` (actor, target, payload, server timestamp).
  (Currently grounded in §3.4.)

## Backlog (post-PR-#8)

### Item A — `worker_skills.source` → slug + JSON label layer
- **Current:** Postgres CHECK with slug values `self_declared` / `work_journal` / `manager_confirmed` (migration `0010`). No TS enum, no per-locale JSON labels.
- **Trigger to upgrade:** any UI surface that exposes the raw `source` value directly to a viewer.
- **Status:** internal-only today — feeds aggregated, future user-facing signals (skill confidence indicator / productivity metric), which are a separate design (`TASK-SKILL-CONFIDENCE-DESIGN`, not yet drafted). Backlog, **not a blocker**.
- **Doctrine:** §10 (Lego — slug + JSON for extensible taxonomy).
- **Back-reference:** `docs/handoffs/TASK-PR8-CONFLICT-TABLE.md` (B1 — source enum analysis).

### Item B — `COUNTRIES` const + `countries.name_*` → slug + JSON migration
- **Current:** hardcoded `COUNTRIES` const (ISO codes) in `apps/web/components/app/onboarding-wizard.tsx`, plus DB columns `countries.name_lt` / `name_en` / etc.
- **Status:** pre-existing technical debt — **not introduced by PR #8**.
- **Doctrine:** §2 (no translations stored in DB) + §10 (extensible taxonomy as slug + JSON).
- **Back-reference:** `docs/handoffs/TASK-PR8-CONFLICT-TABLE.md` (B5 — pre-existing follow-up).
