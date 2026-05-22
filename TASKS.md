# TASKS

Persistent backlog for work that outlives a single PR. PR-specific handoffs
live in `docs/handoffs/`.

## Universal Architecture Sequence (PR #9 → #13)

- [ ] **PR #10** — Universal data model (non-destructive schema) — *blocked by: PR #9*
- [ ] **PR #11** — Universal Work Journal UI + API — *blocked by: PR #10*
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
