# W6 — Human-in-loop Learning Model — RED Plan (for owner approval)

> **Status: PLAN ONLY. No DB mutation. No code written yet.** This document is a
> proposal for owner review. Nothing here is applied. The migration described is
> a *future* draft that would be human-gated and applied only via Supabase MCP
> `apply_migration` after a separate explicit approval.
>
> Decision point is at the end: **A) build draft PR (migration drafted, NOT
> applied) · B) adjust plan · C) stop.**

---

## 0. Core framing (read first)

The single hardest doctrine constraint is: *learning must not become a hidden
verification system.* The audit shows the platform already has a **real,
conservative confirmation spine** that W6 must reuse rather than circumvent:

- Real verification only happens inside `confirm_entry_and_verify_skills()`
  (SECURITY DEFINER), gated by `manages_organization()` **AND** a per-employment
  `journal_review_enabled` flag, writing an append-only
  `journal_entry_confirmations` row + an `audit_logs` row + the
  `worker_skills.verified` update. (`supabase/migrations/20260530140000_*.sql:219-273`)
- Confirmation authority is the trilogy `relationship_slug in
  ('manager','owner','external_manager')`. (`20260602130000_confirmation_role_check.sql`)
- Worker-facing "strongest" state is **neutral** ("With records"), never a green
  "Verified" chip — enforced by `silent-trust-wording.test.ts`.

**Therefore the W6 design rule:** the learning model *only produces signals and
suggestions*. It NEVER writes `verified=true`. The **optional auto-confirmation
policy** is modelled as a manager's **explicit, scoped, reversible
pre-authorization** that, when an eligible event occurs, invokes the *same*
confirmation spine, attributes the confirmation to the **enabling human manager**
(`enabled_by`), and records it as `action='auto_confirm'` with the `policy_id` so
it is fully transparent and auditable. The learning system is never the
confirmer; a human's standing, recorded authority is.

---

## 1. Current-state audit (what already exists)

### Already REAL and DB-backed — do NOT re-implement
| Thing | Where | Real? | Confirms anything? |
|---|---|---|---|
| `candidate_skills` (append-only free-text skill intake, status candidate/approved/rejected, author+admin RLS) | `20260610130200_candidate_skills.sql` | Yes | No — "NEVER auto-approved, NEVER verified" |
| `skill_candidate_clarifications` (owner-scoped) | `20260609160000_*.sql` | Yes | No |
| `profile_skill_claims` (self-declared, status `self_declared`) | `0015_profile_skill_claims.sql` | Yes | No |
| `worker_skills` confidence model (`confidence_score`/`confidence_bin` + `verified`/`verified_by`/`verified_at`/`source`) | `0013_work_journal_m1.sql:244`, `0010_*.sql:41` | Yes | Only via manager RPC |
| `journal_entry_confirmations` (append-only manager decision trail) | `0013_work_journal_m1.sql:176` | Yes | Records confirmations |
| `audit_logs` (universal append-only audit) | `0001_initial_schema.sql:268` | Yes | Audit only |
| `review_journal_entry`, `confirm_entry_and_verify_skills` (SECURITY DEFINER, gated) | `0034_*.sql:66`, `20260530140000_*.sql:219` | Yes | The ONLY verify path |
| Authority helpers `is_admin()`, `manages_organization(org)`, `owns_worker(w)`, `owns_company(c)` | `0024`, `0013:109`, `0001:314/321` | Yes | — |

### Exists but COPY/UI/in-memory only (ephemeral — NOT persisted)
- Recognition tiers `auto_signal / candidate_suggestion / manual_only` — pure fn
  `lib/structuring/recognition-tiers.ts`.
- `new-skill-suggestions.ts`, `skill-recognition.ts` — deterministic catalogue
  matchers, no IO, suggestions recomputed each render.
- `SimilarSkillsSection` — suggestion-only UI; guard asserts **no**
  certification/verification language.
- Confidence formula `lib/journal/confidence.ts` — computed in memory, written to
  `worker_skills` only via the manager-confirmation path.

### MISSING (the real W6 gaps)
1. No **persistent, generic learning-signal log** (today every suggestion is
   ephemeral / recomputed; nothing is recorded for later human review or audit).
2. No **manager-scoped human review queue** for suggestions (the only review
   backlog is `candidate_skills`, which is skills-only and **admin-only**).
3. No **company-manager-controlled policy** object (policy is hard-coded in the
   confidence formula; there is no opt-in setting, no scope, no audit of who
   enabled what).
4. No **optional auto-confirmation** that reuses the confirmation spine under a
   recorded, scoped, reversible manager authorization.

### How manager / journal confirmation boundaries work today (must not break)
- A confirmation is **never** recorded from a label or org link alone:
  `manages_organization()` **and** `journal_review_enabled=true` (per
  `company_workers`/`agency_workers`) are revalidated **inside** every RPC.
- Every confirmation write = 1 `journal_entry_confirmations` row + 1 `audit_logs`
  row + (for skills) 1 `worker_skills` update with `verified_by/verified_at/
  source='manager_confirmed'`. Append-only; never updated/deleted.
- `is_admin()` is dual-signal (`profiles.active_role='admin'` OR
  `profile_roles.role='admin'`).

### What W6 must not break
Silent-trust wording contract; the confirmation-authority trilogy; the
`journal_review_enabled` gate; append-only proof; the dual-signal admin check;
`candidate_skills` admin-approval semantics; W8 `service_offerings`.

---

## 2. Learning model purpose

**Learns from (real, in-scope events only):**
work journal entries · manager confirmations · rejected/edited confirmations ·
service offerings (W8) · booking/service activity *where already real*
(`booking_requests`/`booking_request_events`) · company/team-scope activity ·
worker profile edits · skill claims · evidence attachment metadata *if already
present* · explicit human review outcomes.

**Must NOT learn from:** private data outside the user/company scope · raw hidden
assumptions · fake/demo data · unconfirmed claims treated as final truth ·
unauthorised cross-account signals · anything that bypasses RLS or consent.

Output of learning is always one of: a **stored signal**, a **queued suggestion**,
or an **explained confidence** — never a verification.

---

## 3. Proposed schema (minimal additive — 3 new tables + reuse `audit_logs`)

All three tables are **additive**; no existing table is altered. Full SQL lives
in the migration (§10). Columns below are the proposal.

### 3.1 `public.learning_signals` — append-only observed facts
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `subject_worker_id` | uuid not null → `workers(id)` cascade | who the signal is about |
| `subject_skill_id` | uuid → `worker_skills(id)` set null | nullable |
| `organization_id` | uuid → `organizations(id)` set null | scope; null = self-only |
| `actor_id` | uuid → `profiles(id)` set null | the REAL profile whose action produced it |
| `source` | text check in (journal_entry, manager_confirmation, manager_rejection, service_offering, booking_activity, profile_edit, skill_claim, evidence_attachment, human_review_outcome) | |
| `source_object_type` / `source_object_id` | text / uuid | link to source row |
| `signal_kind` | text check in (skill_evidence, skill_candidate, activity, correction) | |
| `proposed_outcome` | jsonb | **suggestion only**, nullable, never a confirmation |
| `confidence_score` | int 0..100 default 0 | mirrors existing bins |
| `confidence_bin` | text check in (red,yellow,green) default red | |
| `created_at` | timestamptz default now() | **append-only — no `updated_at`, no update/delete policy** |

*Stores: facts (observations).* Necessary because suggestions are currently
ephemeral; a human review queue and any audit need a durable, append-only record.

### 3.2 `public.learning_review_queue` — human-reviewable suggestions (mutable status)
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `signal_id` | uuid → `learning_signals(id)` set null | origin |
| `subject_worker_id` | uuid not null → `workers(id)` cascade | |
| `subject_skill_id` | uuid → `worker_skills(id)` set null | |
| `organization_id` | uuid not null → `organizations(id)` cascade | review is org-scoped |
| `suggestion_kind` | text check in (confirm_skill, review_skill, dismiss) | |
| `proposed_action` | jsonb | |
| `status` | text check in (pending, approved, rejected, superseded, auto_actioned) default pending | |
| `reviewed_by` | uuid → `profiles(id)` set null | |
| `reviewed_at` | timestamptz | |
| `review_note` | text ≤2000 | |
| `produced_confirmation_id` | uuid → `journal_entry_confirmations(id)` set null | set when a confirm actually happened |
| `policy_id` | uuid → `learning_policy_settings(id)` set null | set when `auto_actioned` |
| `created_at`/`updated_at` | timestamptz | |

*Stores: suggestions + their human review decision.* Necessary to make
suggestions reviewable by a scoped manager (today there is no such backlog).
**A queue item NEVER itself verifies** — `approved` only marks intent; the actual
confirmation goes through the spine RPC and links back via
`produced_confirmation_id`.

### 3.3 `public.learning_policy_settings` — company-manager policy, **default OFF**
| col | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `organization_id` | uuid not null → `organizations(id)` cascade | |
| `policy_kind` | text check in (auto_confirm_journal_skill) | Phase-1: one kind |
| `enabled` | boolean not null **default false** | the safety default |
| `scope` | jsonb default '{}' | which workers/skills/relationships it applies to |
| `rule` | jsonb default '{}' | thresholds: e.g. `min_confirmations`, `min_confidence` |
| `enabled_by` / `enabled_at` | uuid → profiles / timestamptz | who turned it on, when |
| `disabled_by` / `disabled_at` | uuid → profiles / timestamptz | who turned it off, when |
| `created_at`/`updated_at` | timestamptz | |
| unique `(organization_id, policy_kind)` | | one policy per kind per org |

*Stores: policy decisions.* Necessary so auto-confirmation is an explicit,
scoped, auditable, reversible manager choice — not hidden behaviour.

### Not adding a 4th table
The **audit trail reuses `audit_logs`** (canonical, append-only) plus the
existing `journal_entry_confirmations`. No `learning_events` table is needed in
Phase 1.

---

## 4. Optional company-manager auto-confirmation policy

**Model: delegated, recorded, scoped authority — not machine authority.**

- **Default OFF** (`enabled=false`); enabling requires an explicit manager write
  setting `enabled=true`, `enabled_by`, `enabled_at`.
- **Scope = the manager's org only.** RLS (§5) makes `learning_policy_settings`
  writable only by `manages_organization(organization_id)`; the auto-confirm RPC
  re-checks that `enabled_by` still manages that org *at fire time*.
- **Transparent / configurable / auditable / reversible:** the row records who,
  when, which `policy_kind`, which `scope`, which `rule`. Disabling sets
  `disabled_by`/`disabled_at` and flips `enabled=false`.
- **Never bypasses the spine.** Auto-confirmation does NOT write `verified` itself
  in app code. It calls a single SECURITY DEFINER RPC (§6) that:
  1. asserts the policy is `enabled` and the item is within `scope` and meets
     `rule` thresholds;
  2. **re-validates live authority**: `enabled_by` still
     `manages_organization(org)`, relationship still active, and
     `journal_review_enabled=true` for that worker (same gate as a manual
     confirmation);
  3. produces a **real** `journal_entry_confirmations` row with
     `confirmer_id = enabled_by`, `confirmer_role` from the live relationship,
     `confirmation_scope = {action:'auto_confirm', policy_id, decision:'approved',
     skills_confirmed:[…]}`;
  4. updates `worker_skills` exactly as the manual path does;
  5. writes `audit_logs` (`action='auto_confirm_via_learning_policy'`, `actor_id =
     enabled_by`, payload `{policy_id, review_item_id, …}`);
  6. sets the queue item `status='auto_actioned'`, `produced_confirmation_id`,
     `policy_id`.
- **Worker-facing wording unchanged.** Because the result is a *real* confirmation
  event, the existing neutral silent-trust state ("With records") applies. No new
  "verified/confirmed" wording is introduced; an honest detail line may note the
  confirmation came from a standing manager policy.
- **Trigger (Phase-1 recommendation): manager-initiated.** A manager action
  ("apply standing policy to eligible items") runs the RPC over eligible queued
  items. This keeps a human literally in the loop and avoids any background
  autonomy (no cron is in scope). Event-time auto-firing is *possible* with the
  same RPC as the safety boundary, but is deferred to a later, separately
  approved step.
- **Disable/revoke behaviour:** disabling stops **future** auto-confirmations
  immediately. **Already-created confirmations remain** (they were genuine,
  authorized, audited acts); reversing a past confirmation is out of Phase-1
  scope and would use the normal confirmation-revocation mechanism if/when one
  exists (flagged as a gap — see §12).
- **Abuse / accident controls:** default OFF; scope required (an empty scope
  confirms nothing); `rule` thresholds (min confirmations/confidence) required to
  be met; live re-validation of authority + `journal_review_enabled`; a guard
  test asserting default-OFF and audit-event-required; unique policy per org/kind
  to prevent silent duplication.

**If, on review, this delegated-authority model is judged too strong:** the
safer minimal alternative is to ship **only** signals + review queue + policy
*record* with auto-confirmation **disabled at the code level** (the RPC not built
in Phase 1) so a manager can express intent but every confirmation still requires
a manual click. I flag this as the fallback and recommend the owner choose.

---

## 5. RLS model (every table)

No anon/public grants. No `using(true)`. No broad cross-user SELECT. Grants to
`authenticated` only. Pattern mirrors `service_offerings` + the
`manages_organization()` org-scope idiom.

### `learning_signals` (row-owner + org-scope; append-only)
- **SELECT:** `owns_worker(subject_worker_id)` (worker self-transparency) OR
  `manages_organization(organization_id)` OR `is_admin()`.
- **INSERT (with check):** `owns_worker(subject_worker_id)` OR
  `manages_organization(organization_id)` OR `is_admin()` — i.e. you may only log
  a signal about a worker you legitimately have scope over.
- **UPDATE / DELETE:** none (append-only).

### `learning_review_queue` (org-scope; worker read-only)
- **SELECT:** `owns_worker(subject_worker_id)` OR
  `manages_organization(organization_id)` OR `is_admin()`.
- **INSERT (with check):** `manages_organization(organization_id)` OR `is_admin()`.
- **UPDATE (with check):** `manages_organization(organization_id)` OR `is_admin()`
  (the subject worker **cannot** review their own item).
- **DELETE:** none (use `status='superseded'`).

### `learning_policy_settings` (org-manager only)
- **SELECT:** `manages_organization(organization_id)` OR `is_admin()`.
- **INSERT / UPDATE (with check):** `manages_organization(organization_id)` OR
  `is_admin()`.
- **DELETE:** none.

**How manager authority is proven:** exclusively via the existing
`manages_organization(org)` SECURITY DEFINER helper (active engagement context
with `relationship_slug in ('manager','owner','external_manager')`), never via a
client-supplied flag. No hidden visibility expansion: workers see only their own
rows; managers see only their org's rows; admin via `is_admin()`.

---

## 6. RPC / server-action boundaries

### Ordinary RLS-client writes (NO SECURITY DEFINER)
- Insert `learning_signals` (scope enforced by RLS with-check).
- Insert/update `learning_review_queue` status by a scoped manager.
- Insert/update `learning_policy_settings` by a scoped manager (enable/disable).

### The ONE SECURITY DEFINER RPC (genuinely necessary)
`public.apply_learning_auto_confirmation(p_review_item_id uuid) returns text`

Necessary because: (a) `journal_entry_confirmations` INSERT is already
**definer-RPC-only** by existing design; (b) the action must atomically
re-validate authority + `journal_review_enabled`, write the confirmation, update
`worker_skills`, write `audit_logs`, and update the queue item — the same shape as
the existing `confirm_entry_and_verify_skills`. Doing this through plain RLS would
require loosening the confirmation INSERT policy, which is unacceptable.

Safety design (mirrors existing definer RPCs):
- `language plpgsql security definer set search_path = public`.
- `uid := auth.uid()`; `if uid is null then raise … errcode '42501'`.
- Load policy by the item's org; `if not policy.enabled then return 'policy_disabled'`.
- `if not manages_organization(v_org)` **for the caller** AND the action is
  manager-triggered → `return 'not_authorized'` (the caller must themselves be a
  manager of the org to run the batch; the *confirmation* is attributed to
  `enabled_by`, who is also re-checked).
- Re-check `enabled_by` still manages org (live), relationship active,
  `journal_review_enabled=true` for the worker → else `'review_not_enabled'`.
- Scope check (`scope` matches subject) and threshold check (`rule` met) → else
  `'out_of_scope'` / `'threshold_not_met'`.
- Then: insert confirmation, update `worker_skills`, insert `audit_logs`, update
  queue item. Return `'ok'`.
- `revoke all on function … from public; grant execute … to authenticated;`

Failure modes are explicit tagged strings (no silent success).

### Server actions (`apps/web/lib/learning/*.ts`)
- `recordLearningSignal`, `listReviewQueue`, `setReviewItemStatus`,
  `getLearningPolicy`, `setLearningPolicy(enabled, scope, rule)`,
  `applyAutoConfirmation(reviewItemId)` (wraps the RPC).
- **Honest degradation:** `const ABSENT = new Set(["42P01","42883","PGRST202",
  "PGRST204","PGRST205"])`; on absent table/function return
  `{ kind: "needs-migration" }`. **No "try later" fake success.**

---

## 7. Events / signals captured

For each captured signal: **source** (enum §3.1) · **actor** (`actor_id`, real
profile) · **subject** (`subject_worker_id`, optional `subject_skill_id`) ·
**company scope** (`organization_id`) · **proposed outcome / confidence** (jsonb +
score/bin, suggestion only) · **review status** (via the queue item) · **link to
source object** (`source_object_type/id`) · **suggestion-only vs
confirmation-producing** (signals + queue are suggestion-only; only the RPC
produces a confirmation, and only under a policy) · **audit trail**
(`audit_logs`).

---

## 8. Separation rules (no field collapses these into one fake "verified")

| Concept | Home | Trust meaning |
|---|---|---|
| Worker self-claimed skills | `profile_skill_claims` / `worker_skills.source='self_declared'` | self-declared |
| Manager-confirmed skills | `worker_skills.verified=true, source='manager_confirmed'` + `journal_entry_confirmations` | confirmed (neutral UI) |
| Journal-derived suggestions | `learning_signals` / `learning_review_queue` | suggestion only |
| Service offerings (W8) | `service_offerings` | provider listing |
| Bookings / service requests | `booking_requests` / `customer_requests` | activity |
| Company policy settings | `learning_policy_settings` | policy |
| Admin actions | `audit_logs` | audit |
| Learning suggestions | `learning_review_queue.status=pending` | not a fact |

A suggestion (`learning_*`) and a confirmation (`worker_skills.verified` +
`journal_entry_confirmations`) are **separate rows in separate tables**; the only
bridge is the audited RPC, which always produces a real confirmation row.

---

## 9. Existing data touched / not touched

- **No existing table altered.** Three new additive tables only.
- **No existing row mutated at apply time.** `worker_skills` is updated **only at
  auto-confirmation runtime** (identical to a manual confirmation), never as a
  backfill, and only after a manager opts in and an eligible event fires.
- **No backfill.** **W10 stale-data backfill is NOT started.**
- **W8 `service_offerings` is not modified.** (It may be *read* as a signal
  source; no schema/RLS change to it.)
- Preferred: **additive-only, zero existing-row mutation in Phase 1.**

---

## 10. Migration files

- `supabase/migrations/<UTC>_human_in_loop_learning.sql` — additive: 3 tables +
  RLS + grants to `authenticated` + the one definer RPC. Header `-- DRAFT —
  needs-human-gate — DO NOT APPLY automatically` + `-- @human-gate-approved`.
- `supabase/rollbacks/<UTC>_human_in_loop_learning.down.sql` — guarded drops (§11).
- App: `apps/web/lib/learning/learning.ts` (+ shared types module, mirroring the
  W8 `service-offerings-shared.ts` split so the `"use server"` file exports only
  async functions), `components/app/learning-review-section.tsx`,
  `app/[locale]/dashboard/learning/page.tsx` (auth-gated; **not** added to primary
  nav until applied).
- i18n: new `learning` namespace in `messages/{en,lt,ru}.json` (active locales),
  suggestion-only wording, **no** verify/confirm stems in worker-facing keys.
- Guards (§14).
- **Migration-count baselines to bump 86 → 87** (all three spots):
  `lib/guards/product-readiness.test.ts` (`SPRINT_BASELINE`),
  `lib/guards/market-map-read-layer-v1.test.ts` (`<= 86`),
  `lib/guards/ops-bridge-migration.test.ts` (meta-guard `SPRINT_BASELINE = 86`).

The migration will trip `migration-safety` RED patterns (SECURITY DEFINER +
grant/execute); it carries `-- @human-gate-approved`, so the gate downgrades them
to human-gated notices and the PR opens **draft + `needs-human-gate`**.

---

## 11. Rollback plan

- Guarded-drop idiom (refuse to drop a non-empty table): for each of the three
  tables, `do $$ begin if exists(select 1 from public.<t> limit 1) then raise
  exception '<t> not empty — refusing automatic rollback'; end if; end $$;` then
  `drop table if exists …`. Drop order respects FKs (queue → signals/policy).
- `drop function if exists public.apply_learning_auto_confirmation(uuid);`
- **Refusal to drop non-empty tables unless the owner explicitly approves data
  loss** (the exception forces a manual, deliberate decision).
- **Disable policy behaviour without dropping data:** set every
  `learning_policy_settings.enabled=false` (one UPDATE) — auto-confirmation stops
  immediately while all rows are preserved. This is the preferred "stop" lever.
- **Stop auto-confirmation safely:** disable policies (above) and/or
  `drop function apply_learning_auto_confirmation` (the RPC is the only writer of
  auto-confirmations; dropping it makes the surface inert without data loss).

---

## 12. Risk list

| Risk | Control |
|---|---|
| Accidental hidden verification | Learning code never writes `verified`; only the audited RPC does, only under an enabled policy; guard asserts no `verified=true` write outside the RPC |
| Manager overreach | All authority via `manages_organization()`, re-validated live in the RPC; org-scoped RLS; worker can't review own item |
| Cross-company leakage | Org-scoped SELECT; no `using(true)`; no anon/public; subject worker sees only own rows |
| RLS mistake | Static RLS guard (§14) + `migration-safety` + advisor check post-apply |
| Policy accidentally defaulting ON | `enabled boolean not null default false` + default-OFF guard test |
| Learning score read as truth | Score/bin are suggestion metadata only; never gate UI "verified" wording |
| UI overstating confidence | Silent-trust guard extended to the `learning` namespace; suggestion-only copy |
| Stale data polluting signals | Append-only signals carry `created_at` + source link; W10 backfill excluded; staleness handling deferred |
| Rollback with existing rows | Guarded drops refuse non-empty tables |
| Future discovery/payment coupling | Out of scope (§17); no-payment guard extended to learning files |
| Auto-confirmation firing on self-action | RPC attributes to `enabled_by` (manager), re-checks live authority + `journal_review_enabled`; worker can't enable a policy |

---

## 13. Privacy risk list

- **Stored:** worker id, optional skill id, org id, actor id, source object
  pointer, suggestion/confidence metadata, review decisions, policy settings.
- **Not stored:** raw private profile text beyond the source pointer, cross-org
  data, free-form sensitive notes beyond a bounded `review_note`, no PII beyond
  existing FKs.
- **Retention:** signals append-only; no auto-expiry in Phase 1 (flagged for a
  later retention policy decision).
- **Visibility boundaries:** worker sees own; manager sees own-org; admin all —
  enforced by RLS, not UI.
- **Transparency:** worker can see signals/suggestions about themselves and any
  resulting confirmation (`produced_confirmation_id`); manager sees org scope;
  admin sees audit.
- **Deletion/disable:** disabling a policy stops future auto-confirmations and
  preserves data; rollback refuses to delete non-empty tables without explicit
  approval.

---

## 14. Validation plan (all required before "ready")

typecheck · lint · build · full vitest · `migration-safety` (expect GREEN at
job-level with human-gated notices for the definer RPC + grant) · **RLS static
guard** (RLS enabled, owner/org-scoped, no anon/public, no `using(true)`, grant
to `authenticated`) · **no-fake-data guard** · **no hidden verified/confirmed
wording guard** (extend silent-trust scan to the `learning` namespace) · **i18n
parity lt/en/ru** · **honest-degradation guard** (ABSENT set + `needs-migration`)
· **auto-confirmation default-OFF guard** (`enabled … default false`) ·
**audit-event-required guard** (the RPC writes `journal_entry_confirmations` +
`audit_logs` for any confirmation-producing path) · **policy-scope guard**
(policy + queue update require `manages_organization`).

---

## 15. Smoke plan

**Pre-apply (honest degradation):** `/<locale>/dashboard/learning` auth-gated when
logged out; with the table absent the surface shows a calm "not available yet"
state; server actions return `needs-migration`; no fake states.

**Post-apply (DB-layer, simulated JWTs, rolled back so 0 rows persist + real
HTTP):** create a learning signal · queue a suggestion · manager reviews
(approve) · manager rejects another · manager confirms a skill **only** through
the real authority path (RPC) and an `audit_logs` + `journal_entry_confirmations`
row is created · enable a company auto-confirmation policy (manager) · run the
policy over an eligible item · assert a real confirmation + audit event is created
and attributed to `enabled_by` with `action='auto_confirm'` · disable the policy ·
assert future auto-confirmations stop · cross-account/company RLS isolation
(another company's manager and an unrelated worker cannot see/act) · lt/en/ru
surface sanity · production smoke after merge.

---

## 16. What becomes real after W6

Real stored learning signals · a real manager-scoped human review queue · a real
audit trail (reusing `audit_logs` + `journal_entry_confirmations`) · an optional,
default-OFF, company-manager-controlled auto-confirmation policy that produces
**real, attributed, audited** confirmations through the existing spine · honest UI
that separates *suggestions* from *confirmations*.

---

## 17. Explicitly out of scope

W10 stale-data backfill · payment/checkout · public discovery changes · fake
recommendations · automatic platform-wide verification · auto-confirmation
default ON · cross-company learning visibility · changing W8 `service_offerings`
schema · changing existing confirmation authority without owner approval ·
background/cron auto-firing (Phase-1 auto-confirmation is manager-triggered) ·
confidence-history versioning · retention/auto-expiry.

---

## Decision point

- **A) Approve building the draft PR** — migration drafted but **NOT applied**;
  rollback, app wiring, UI, i18n, guards; draft + `needs-human-gate`; full
  validation; no DB mutation until a separate apply approval.
- **B) Adjust the plan** — e.g. choose the **safer fallback** (ship
  signals + review queue + policy *record* only, with the auto-confirmation RPC
  **not built** in Phase 1, so every confirmation stays a manual click), narrow
  sources, or change scope/thresholds.
- **C) Stop.**

**My recommendation:** A, but with an explicit owner choice on §4 — either the
full delegated auto-confirmation RPC, or the safer fallback (B-variant) where the
policy is recorded but Phase-1 ships **suggestions-only** and no automated
confirmation. The signals + review queue + policy record are low-risk and
clearly additive; the auto-confirmation RPC is the only piece that touches the
verification spine and is where I most want explicit direction.
