# Universal Human Confirmation Roles — Audit & Design v1

**Date:** 2026-06-02
**Status:** Audit + design. **No schema change shipped** — the only code in this
slice is a guard (`apps/web/lib/guards/confirmation-honesty.test.ts`) that keeps
the product honest about who can confirm.
**Scope:** the confirmation/evidence model across schema, journal, profile, skill
evidence, onboarding, and LT/EN messages.

## Why this is audit-only

The product should let many kinds of people vouch for a person's real
capability — a teacher for a student's project, a buyer for a handmade product,
a parent for a child's achievement, a manager for work. **Today the backend
cannot store any of those except the work-manager case.** Adding the rest is a
database migration with real privacy and minor-safety design. The goal is
explicit: *do not fake broad confirmations the backend cannot store.* So this
slice produces the audit, the design for the deferred migration work, and a
guard that prevents the UI from drifting into a dishonest claim.

## 1. Current schema / data-model limitations

- **`journal_entry_confirmations`** (migration `0013_work_journal_m1.sql`) is the
  single confirmation record. Key columns:
  - `confirmer_id → profiles(id)` (NOT NULL)
  - `confirmer_engagement_context_id → engagement_contexts(id)` **NOT NULL** —
    *every confirmation must be anchored to an org-scoped engagement.* This is
    the hard gate: a person with no managing engagement over the worker has no
    row they could ever insert.
  - `confirmer_role text NOT NULL` — free text at the schema layer, but written
    only by the RPC (below), so in practice always one of three values.
  - `confirmation_scope jsonb` — the decision payload.
- **The review RPC** `review_journal_entry` (`0034`, re-defined in
  `20260530140000_membership_engagement_reroute.sql`) gates the caller to
  `relationship_slug in ('manager','owner','external_manager')` and writes that
  slug into `confirmer_role`. `reviewable_journal_entry_ids` applies the same
  gate. RLS on the table (`manages_organization()`) enforces the same set
  independently.
- **`relationship_types`** seeds: `owner, employee, manager, consultant,
  collaborator, freelancer, unemployed, student, volunteer`. The category CHECK
  already allows `education` and `other`, and `student`/`volunteer` slugs exist —
  **but none of parent, guardian, teacher, mentor, buyer, or customer exist**,
  and `student`/`volunteer` are dormant (never wired to confirmation).
- **Skill verification** (`worker_skills.source ∈ self_declared | work_journal |
  manager_confirmed`, plus `verified`) is flipped to `manager_confirmed` only by
  the same manager-gated RPC. `journal_entry_skills` is evidence-support only and
  can never set `manager_confirmed`.

**→ Confirmers supported today: `manager`, `owner`, `external_manager` only.**
Buyer/customer is a separate *user role* (`0026_customer_entity.sql`), not a
confirmation relationship — customers cannot confirm entries.

## 2. Current UI / copy assumptions

Audited every confirmation surface and all message files. **No over-claim
exists** — the copy is already honest and manager-scoped:

- `journal.entry.confirmerRole` = `{manager, owner, external_manager}` (LT+EN).
- `workerEvidence.confirmed` = "Confirmed by manager" / "Patvirtinta vadovo".
- `workerEvidence.footnote` = "…confirmed by a manager. Nothing is confirmed
  automatically." / "…patvirtinti vadovo. Sistema nieko nepatvirtina automatiškai."
- `journal.savedConfirmNote` (PR #238) = "…until a manager or client confirms it."
  ("client" is the lay reading of `external_manager` — the client-side manager in
  a staffing triangle; acceptable, and pinned not to widen further.)
- The journal page review filter is hard-coded to the three slugs.

No string promises parent/guardian/teacher/mentor/family/student confirmation.
The guard pins this so it stays true.

## 3. Privacy & minor-safety risks (for the deferred migration)

There is **zero** minor handling today (no age field, no guardian link, no
consent capture). That is fine while confirmation is work-only, but the broad
model introduces real risks that MUST be designed before any code:

- **Minors as subjects.** A student/child profile implies under-18 users. Any
  parent/teacher confirmation flow needs: an age/é minor flag, guardian linkage,
  and consent capture — none of which exist. Until then, **no minor data should
  be collected or exposed**, and nothing public by default.
- **Impersonation.** "I am this child's parent / this student's teacher" is an
  identity claim. Without a verified link it is trivially forgeable, so a broad
  confirmer must be *invited/linked by the subject or an existing trusted party*,
  never self-asserted — and that linkage is itself sensitive.
- **Buyer→seller confirmation** must be scoped to an actual transaction/request,
  or any stranger could "confirm" (or disparage) a seller.
- **Data minimization.** Grades, school, family relationships are sensitive
  categories. RLS must keep them owner-only by default, exactly as
  `profiles.profile_text` is today.

**This slice adds no minor data and no new exposure — it only documents the
requirements and guards against premature claims.**

## 4. What can be safely changed WITHOUT a migration

- **Honesty guard (shipped here).** Pins confirmer labels to the supported set,
  pins the RPC/engagement constraints, and blocks copy that names a broad
  confirmer the backend can't store. This is the safe, useful change.
- **Copy clarity (future, optional, no migration):** an honest per-entry "who can
  confirm this today" line naming only manager/owner. *Not shipped here* to avoid
  implying soon-to-exist roles; it can ride on the migration slice instead.

There is **no honest UI change that adds a new confirmer** without the schema —
so none was made.

## 5. What REQUIRES a migration (deferred, RED class)

Each broad confirmer needs schema + RLS + RPC + consent design. Sketch:

1. **Defense-in-depth first (smallest migration):** add an explicit
   `CHECK (confirmer_role in ('manager','owner','external_manager'))` to
   `journal_entry_confirmations`. Makes today's invariant explicit at the schema
   layer before widening it. Additive, reversible, GREEN-ish but still a
   migration → human-gated.
2. **Relationship types:** add `teacher`, `mentor`, `guardian`, `parent`,
   `buyer`/`customer_confirmer` slugs (categories `education` / `other`).
3. **Linkage model:** a verified, subject-initiated link table (e.g.
   `confirmation_links(subject_profile_id, confirmer_profile_id, relationship,
   status, consented_at)`) so a confirmer is *granted*, never self-claimed.
   Buyer→seller links anchor to a request/transaction id.
4. **RPC + RLS:** generalize `review_journal_entry` / `manages_organization()`
   into a `can_confirm(entry, confirmer)` that accepts the new linked roles, each
   with its own scope rule. Keep `confirmer_engagement_context_id` or add a
   nullable `confirmer_link_id` alternative — never allow a confirmer with
   neither.
5. **Minor safety:** age flag + guardian consent gate + owner-only RLS on
   sensitive categories; nothing public by default.
6. **i18n + guard update:** add the new `confirmerRole.*` labels and widen this
   guard's `SUPPORTED_CONFIRMERS` set in lockstep with the migration (the guard
   intentionally fails if labels are added without the backend).

## Recommended next implementation slice (exact)

**Slice: "confirmer_role CHECK + buyer→seller confirmation, design-gated."**
Smallest honest forward step, in two PRs:

- **PR A (migration, RED/human-gated):** add the explicit
  `CHECK (confirmer_role in ('manager','owner','external_manager'))` constraint
  (reversible; asserts zero rows violate it first) and update
  `manager-review-rpc` / this guard to pin the CHECK. Pure hardening, no new
  capability — proves the migration + human-gate path end-to-end on the safest
  possible change.
- **PR B (design doc → then migration):** design the `confirmation_links` table
  + `can_confirm()` for the **buyer→seller** case first (clearest consent model:
  a real purchase/request anchors it, no minors involved), with owner-only RLS
  and a guard. Defer parent/teacher (minor-safety) until the linkage + consent
  primitives from PR B exist.

Rationale: start with the change that adds the least risk (an invariant the code
already enforces), prove the gated-migration pipeline, then add the one broad
confirmer (buyer) that needs no minor-safety work, before touching anything
involving minors.

## §6 — Authority-model addendum (preserved from #511, 2026-08-24)

Two ideas from the closed Approval-Authority-Model PR #511 that exist in neither
this doc nor the code, preserved on the hygiene pass. Context: the core defect
#511 reported is already FIXED on main — `20260720150000_journal_photo_continuity_v1.sql`
gives the list gate and the action gate the identical predicate
`public.is_admin() or public.manages_organization(...)`, so the old
list/action disagreement is gone. What remains worth keeping:

1. **Honest operator identity.** When a platform operator confirms a record,
   they confirm *as* `platform_operator`, never disguised as a company manager.
   Main kept the `is_admin()` shortcut in the guard predicate rather than
   removing it; the honest resolution is that any confirmation an operator makes
   is attributed to the operator role, not silently rendered as employer
   confirmation.

2. **Confirmer tier rule.** Distinguish `employer_verified` from `observed`.
   **Only `employer_verified` may flip `worker_skills.verified`.** Client,
   property-owner, or merely-observed confirmations can strengthen evidence but
   must never masquerade as employer verification — the tier is carried, never
   collapsed. This is the same fit-not-rating discipline (§19) applied to *who*
   stands behind a confirmation.

Both are design guidance for any future `can_confirm()` generalization, not a
shipped contract. Branch `audit/approval-permission-readiness-v1` is preserved.
