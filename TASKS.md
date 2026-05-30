# TASKS

Persistent backlog for work that outlives a single PR. PR-specific handoffs
live in `docs/handoffs/`.

## Convergence follow-ups (post-PR #152)

Staged from the single-product convergence (`feat/cc/converge-single-product`,
PR #152). Full record: `docs/CONVERGENCE_CHANGELOG.md`.

- [ ] **`feat/cc/membership-engagement-reroute`** — full reroute of
  `company_workers` / `agency_workers` → `engagement_contexts`. These legacy
  link tables still back the live Manager-Confirm loop (the `0036`
  `accept_*_worker_invitation` RPCs write them); `engagement_contexts` lacks
  `operations_role` / `journal_review_enabled`. Migrate those fields + rewrite
  the invite/accept/assign RPCs + worker-management UI, then make the legacy
  link tables read-only. Also closes the live loop gap (entries currently pin to
  org-less engagements → 0 manager confirmations on prod). *Migration-heavy;
  staged so it does not break the working loop mid-flight.*
  - **Constraint (carry into this work):** `projects.organization_id` is
    `ON DELETE RESTRICT`. Deleting an organization that still has projects errors
    at the DB level by design (proof-chain protection). The future org-deletion
    UI must reassign/remove projects first and surface an honest error — never a
    silent failure.

## Captured from retired branches (TASK 03 consolidation cleanup)

The branch consolidation (`docs/BRANCH_CONSOLIDATION_AUDIT.md`, PR #155) retired
two genuinely-unmerged drafts. Their worthwhile ideas are captured here so
nothing is lost; the branches themselves are gone.

- [ ] **Org Tier-2 (org levels / verification / plans) — deferred idea.**
  *(from retired `feat/sr1-tier2-schema-draft-v1`, draft migration `0022_organization_tier2.sql`, never applied.)* The draft added `organizations.registration_code` / `correspondence_address` / `tier`, plus `organization_representatives`, `organization_countries`, and a `promote_organization_to_tier2` SECURITY DEFINER RPC with audit. Additive extension of the canonical org model — not a duplicate. Revisit when org verification/levels actually ship. Supersedes/merges with the older **SR-1** line below (same idea).
- [ ] **Journal append-only TRIGGER guards — deferred (defense-in-depth).**
  *(from retired `feat/cc/pr10b-0014-hardening-implementation`.)* Prod already enforces append-only on `journal_entries` / `journal_entry_confirmations` / `audit_logs` via RLS (no UPDATE/DELETE policy → deny), and audits confirmations via the `review_journal_entry` RPC. Hard `BEFORE UPDATE/DELETE` triggers (`raise exception`) would add defense-in-depth so even a `SECURITY DEFINER`/owner path cannot rewrite history (§3.1). **Deferred deliberately** — the triggers must not break the existing correction / supersession (`0018`) / soft-delete lifecycle, so they need careful design, not a rushed port.
- [ ] **Journal unshipped scaffolds — deferred until their features ship.**
  *(also from `pr10b-0014`.)* `feature_flags` table + `set_entry_visibility` flag-gating (gates public-proof / client-report exposure) and a `proof_of_work` table (M2 proof-file uploads). Not live gaps — missing infrastructure for features that do not exist yet. Build alongside those features.
- [x] **Journal integrity guards — the 2 REAL gaps prod lacks → being shipped.** The `original_language` CHECK (locale set from the canonical source `apps/web/lib/i18n/config.ts`) and the closed-only direct-insert narrowing (§4 default-closed) are drafted in `supabase/migrations/<ts>_journal_integrity_guards.sql` (committed, **queued for review — not applied**). This is the salvaged, current-schema subset of the retired `0014` hardening.

## Universal Architecture Sequence (PR #9 → #13)

- [x] **PR #10 (old greenfield spec)** — **SUPERSEDED** by the PR #14 gap analysis (`docs/handoffs/TASK-PR10-GAP-ANALYSIS.md`). The universal data model already shipped in PR #12 (`0013_work_journal_m1.sql`: 12 tables, RLS on all); the old spec targeted a non-existent Prisma schema and is not executed.
- [x] **PR #10b** — Journal security-hardening delta (`0014`) — **RESOLVED by the TASK 03 audit.** The implementation branch was compared against live prod: the core properties (append-only via RLS, audit-on-confirm via `review_journal_entry`, manager-gated confirmation) were already shipped the canonical way by `0033`–`0036`, and its confirm/reject/revoke RPCs would have **duplicated** the live review path. Branch retired; the 2 real additive gaps salvaged into `journal_integrity_guards` (queued), the triggers + scaffolds captured above. See "Captured from retired branches".
- [ ] **PR #11** — Universal Work Journal UI + API — *blocked by: PR #10b*. Owns the entry↔skill-link table (does **not** exist yet → not created in `0014`) + PR #10b §5.8 compensating controls **#3/#4**. Controls **#1,#2,#5,#6,#7** stay in PR #10b/`0014`.
- [ ] **PR #12** — Living CV Hub + entry-level confirmation — *blocked by: PR #11*
- [ ] **PR #13** — Dashboard redesign (living OS feel) — *blocked by: PR #12*

Strategic compass: `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`

## Sales-readiness sequence (SR-1 → SR-6)

Parallel track to the Universal Architecture sequence above. Defines the doctrine-aligned path from controlled pilot to a state where the platform can honestly invite the first paying organisations. Audit + per-PR scope in `docs/handoffs/TASK-SALES-READINESS-AUDIT-V1.md`.

- [ ] **SR-1** — Org Tier-2 schema (migration `0022_organization_tier2.sql`): `registration_code`, `correspondence_address`, `tier`, `organization_representatives`, `organization_countries`, `promote_organization_to_tier2` SECURITY DEFINER RPC + audit_log entries. *Non-destructive, additive only.*
- [x] **SR-2** — Pre-role-switch copy + pilot draft banner (LT/EN, 10 locales). *Role-switcher dropdown gains `clarityNote` (workspace-view vs account-identity, org-context expectation); dashboard layout mounts `PilotModeBanner` on every authenticated route. `pnpm -F web check:pilot-honesty-copy` guards against fake AI-matching / instant-hiring / automatic-verification / demo-is-live claims.*
- [ ] **SR-3** — Tier-2 onboarding UI (`/dashboard/<role>/tier2`). *Blocked by SR-1.*
- [ ] **SR-4** — Admin Tier-2 review surface + `verify_organization_tier2` RPC. *Blocked by SR-3.*
- [x] **SR-5** — Honest `/pricing` page (LT/EN + 8 placeholder locales). *New `PilotActivationCallout` mounted above the tier table announces no-checkout / no-auto-billing / no-auto-verification / no-fake-free-trial; "Request pilot review" CTA reuses the existing waitlist modal with `source=pricing_pilot_review`. `pnpm -F web check:pricing-honesty-copy` guards against self-serve checkout / automatic billing / guaranteed match / verified-automatically claims.*
- [x] **SR-6** — OVR / scoring copy reframe → contextual fit signals. *User-facing OVR / "verified skills" / "profile strength" / 0–99 marketing language removed from `apps/web/messages/*.json` (10 locales) and `apps/web/content/placeholders.ts`; `pnpm -F web check:fit-signal-copy` guard enforces no reintroduction. Doctrine: `docs/CONTEXTUAL_FIT_SIGNALS.md` §6.*

Sequence prerequisites NOT owned by this track: PR #18 (manager confirmation backbone, standing block), payments provider decision, public posting surface, matchmaking. The sales-readiness track delivers the **honest preconditions** to a paid tier, not the paid tier itself.

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

## Scoring / fit signals doctrine

Doctrine locked (docs-only): **PRODUCT_CONSTITUTION §10** + `docs/CONTEXTUAL_FIT_SIGNALS.md`.
labourmarket.ai never assigns a universal human/business value; every signal is
contextual, traceable, explainable, and dignity-safe. No scoring UI / DB fields /
matching / scoring / verification logic exists yet — these are design gates only.

- [ ] **OVR → contextual-signals reframe** *(blocker before any scoring ships)* —
  existing concept marketing copy ("OVR — one 0–99 rating", "profile strength",
  "Verified skills + OVR") is a **universal-value score** and conflicts with
  PRODUCT_CONSTITUTION §10. Reframe to per-context **coverage + fit** (Types 1–2)
  plus **readiness/proof** (Type 4), each shown with its context — or retire it.
  Stays governed as PRE-ALPHA **concept** until reframed; never a real rating.
  Ref: `docs/CONTEXTUAL_FIT_SIGNALS.md` §6.
- [ ] **Fit/coverage signal design** *(future, not started)* — when designed, must
  pass the Type-5 admission test (contextual · traceable · explainable ·
  human-dignity safe) and record context + evidence source per signal.
  Supersedes any single-number profile-strength idea (`TASK-SKILL-CONFIDENCE-DESIGN`).
