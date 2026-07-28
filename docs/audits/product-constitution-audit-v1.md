# Product Constitution — current-state audit v1

| Field | Value |
|---|---|
| Date | 2026-07-28 |
| Branch | `feat/product-constitution-enforcement-v1` |
| Scope | **Audit only.** Nothing was fixed, redesigned or removed — that was the explicit instruction. Every finding is recorded for a later, separately-scoped decision |
| Constitution | `docs/PRODUCT_CONSTITUTION.md` §12 (axioms) + §13 (Product Gate) |
| Method | Route inventory of `apps/web/app/[locale]/**/page.tsx`, cross-referenced against `lib/config/navigation.ts`, `lib/dashboard/dashboard-module-registry.ts` and `lib/config/feature-availability.ts` |

## Inventory

| Measure | Count |
|---|---|
| Locale screens (`page.tsx`) | **118** |
| Dashboard screens | **79** |
| Screens behaving as a PRIMARY surface | **4** (see PC-01) |
| Existing product/UX guard tests | 552 |
| New surfaces added by this PR | **0** |

---

> **SEVERITY CORRECTED 2026-07-28** by the full route inventory
> (`docs/audits/product-surface-consolidation-map-v1.md` §0):
> `/dashboard/visual-os` (and `/visual-os/agency`, `/talent`) are
> `requireSuperadmin`-gated and redirect non-admins — **no user can reach
> them**. PC-01 therefore drops **P1 → P3** and PC-02 **P2 → P3**: both are
> internal-surface questions, not chat-first violations. The registry-absence
> facts stand; the severity did not.

## Findings

Certainty is stated for each: **certain** = verified from the file/registry;
**needs-decision** = the surface is real and unregistered, but whether that is a
defect is an owner call.

### PC-01 — More than one surface behaves as "primary"

- **Where.** `/dashboard` (canonical chat root, PR #864) · `/dashboard/advanced`
  (documented module escape hatch, linked from the chat header) ·
  `/dashboard/visual-os` (+ `/visual-os/agency`) · `/dashboard/start`.
- **Axiom.** **A-01** (chat-first is the primary interface), **A-03** (one core
  work loop).
- **Evidence.** `/dashboard/visual-os` appears in **no** registry — 0 hits in
  navigation, the dashboard module registry and feature-availability. Its own
  header calls it *"the first surface that reads as a dashboard"*.
- **Certainty.** certain (registry absence verified).
- **How to fix.** Owner decision: either register `visual-os` as a declared
  surface with its five answers, or retire it. `advanced` is already documented
  as the single escape hatch and is not the problem.
- **Priority.** **P1** — it is the clearest drift away from one primary surface.

### PC-02 — A dashboard-like surface ships sample data inside the product tree

- **Where.** `app/[locale]/dashboard/visual-os/page.tsx` — `SAMPLE_WORKERS`,
  entities prefixed `"Sample · "`.
- **Axiom.** **A-06** (no fake anything).
- **Evidence.** The prefix is deliberate and honest (doctrine §18 allows a
  marked preview), and the admin route-truth page labels it *"Vizualinis planas
  / ne funkcijos kelias"*. So this is **labelled**, not fake — the finding is
  that a labelled preview lives at a `/dashboard/*` route indistinguishable
  from real ones, not that it lies.
- **Certainty.** certain (literal marker present).
- **How to fix.** Owner decision: move previews under an explicitly non-product
  path, or declare the route as a preview surface.
- **Priority.** **P2**.

### PC-03 — Unregistered surfaces reachable from real CTAs

- **Where.** `/dashboard/inbox` (+ `/inbox/quick`, `/inbox/report`) — linked
  from `/dashboard/company` in three places, but present in **no** registry.
  Same pattern for `/dashboard/start` (0 registry hits, yet documented as the
  canonical setup path in PR #92/#97).
- **Axiom.** **A-03** (one core loop), **A-09** (every surface locates itself).
- **Certainty.** certain for the registry absence; **needs-decision** on whether
  each should be registered or folded into an existing surface.
- **How to fix.** Add a declaration per surface, or route the CTA at the
  registered equivalent (`/dashboard/communication` is registered).
- **Priority.** **P2**.

### PC-04 — Several market/opportunity surfaces coexist

- **Where.** `/dashboard/market-map` (registered, 2 hits) ·
  `/dashboard/opportunities` (1) · `/dashboard/listings` (1) ·
  `/dashboard/marketplace` (0 — a **redirect stub** to the map by design) ·
  `/dashboard/market/recognize`.
- **Axiom.** **A-08** (one function, one home).
- **Evidence.** `feature-availability.ts` already records the map-first
  correction and explicitly calls `/dashboard/marketplace` a `REDIRECT_STUB`,
  so part of this is already resolved and documented.
- **Certainty.** needs-decision — the remaining question is whether
  `opportunities` and `listings` are one function with two homes.
- **Priority.** **P3**.

### PC-05 — A wizard exists in a chat-first product

- **Where.** `components/app/onboarding-wizard.tsx` (plus stepper state in
  `demand-advanced-sections.tsx`, `project-cost-calculator.tsx`).
- **Axiom.** **A-04** (no mandatory long wizard; progressive completion).
- **Certainty.** needs-decision — a wizard is permitted if it declares why a
  conversation cannot do the job; today nothing declares that.
- **How to fix.** Declare it (with `why_not_chat`) or replace it with the
  conversation path that already exists.
- **Priority.** **P2**.

### PC-06 — Two Journal surfaces

- **Where.** `/dashboard/journal` and `/dashboard/journal/voice`.
- **Axiom.** **A-08**.
- **Certainty.** needs-decision — a voice entry mode is plausibly the SAME
  function with a different input, not a second module. Recorded so the
  distinction is made deliberately rather than by accident.
- **Priority.** **P3**.

### PC-07 — Route truth is maintained by hand

- **Where.** `app/[locale]/dashboard/admin/project-truth/page.tsx` — a manually
  curated registry of routes and their status, ~900 lines.
- **Axiom.** **A-09**.
- **Evidence.** It is accurate and useful, but it is prose in a page: nothing
  fails when a new route skips it.
- **How to fix.** The Product Gate now covers the *new* routes automatically;
  the manual page can converge on it over time.
- **Priority.** **P3** (superseded going forward, not a defect today).

---

## Summary

| # | Finding | Axiom | Certainty | Priority |
|---|---|---|---|---|
| PC-01 | More than one primary surface (`visual-os` unregistered) | A-01, A-03 | certain | **P1** |
| PC-02 | Labelled sample data at a `/dashboard/*` route | A-06 | certain | P2 |
| PC-03 | Unregistered surfaces reachable from real CTAs (`inbox`, `start`) | A-03, A-09 | certain / needs-decision | P2 |
| PC-04 | Several market/opportunity surfaces | A-08 | needs-decision | P3 |
| PC-05 | Undeclared wizard in a chat-first product | A-04 | needs-decision | P2 |
| PC-06 | Two Journal surfaces | A-08 | needs-decision | P3 |
| PC-07 | Route truth maintained by hand | A-09 | certain | P3 |

**7 findings — 1 at P1, 3 at P2, 3 at P3. None was fixed by this PR.**

---

## What the gate blocks from now on

Every one of these classes would be caught **before merge** if introduced today:

| If it happened today | Gate rule | Result |
|---|---|---|
| A new `visual-os`-style dashboard route | `second_dashboard` + `undeclared_surface` | RED |
| A new Journal module | `new_journal_module` | RED |
| A new `inbox`-style unregistered screen | `undeclared_surface` | RED |
| A new onboarding wizard | `wizard_replaceable_by_chat` | RED |
| A new intake form screen | `form_replaceable_by_dialog` | RED |
| A new persistent nav item | `new_persistent_menu` | RED |
| Two surfaces owning one action | `duplicate_action` | RED |
| Chat leaving the core nav / the conversation root | `chat_importance_reduced` | RED |
| A profile surface showing completed actions | `profile_shows_completed_action` | RED |
| A declaration citing an invented axiom | `unknown_axiom` | RED |

Proven, not asserted: a probe commit adding a `visual-os`-style screen with a
stepper, a form and a modal card produced **6 violations**,
`PRODUCT_REVIEW_REQUIRED`, exit 1 — then was removed.

---

## What a machine still cannot decide

Stated plainly, because a gate that pretends to cover everything is worse than
one with a stated edge:

| Question | Why it stays human |
|---|---|
| **Is this surface genuinely spatial/visual, or a form in disguise?** (A-04) | The gate sees a stepper; only a person sees whether a map, a gantt or a signature pad truly needs pixels |
| **Is the role model still non-locking?** (A-05) | Requires reading the flow end to end; no diff pattern expresses it |
| **Is a second surface a duplicate, or a different job with a similar name?** (A-08) | `opportunities` vs `listings` cannot be decided by a regex |
| **Is the copy honest?** (A-06) | Existing honesty guards cover forbidden terms and sample data; tone and implication stay human |
| **Does the feature belong on the canonical chain at all?** (A-09) | The gate checks that a purpose is stated, never whether it is a good one |
| **Is this the right product decision?** | Never automatable. The gate's job is to make the decision explicit and visible, not to make it |

**The gate does not judge taste. It refuses silence.**
