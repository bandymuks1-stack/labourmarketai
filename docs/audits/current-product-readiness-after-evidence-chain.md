# Current Product Readiness Audit — after the Evidence Chain (#241–#245)

**Date:** 2026-06-03
**Baseline:** `origin/main` @ `4d1ea1c` (after PR #245 merge)
**Type:** Read-only audit. No code, DB, migration, RPC/RLS, payment, marketplace, or feature changes. This document only.
**Scope of the evidence chain reviewed:**

| PR | Slice | Merge |
| --- | --- | --- |
| #241 | "Who can confirm this today" plain line on journal + profile | merged `3729d30` |
| #242 | Evidence Status Strip v1 (worker journal + profile) | merged `e3e47eb` |
| #243 | Manager Evidence Review Clarity v1 (inbox) | merged `07f2ced` |
| #244 | Evidence Decision Timeline v1 (worker journal entry) | merged `c56332c` |
| #245 | Evidence Chain Polish Pass v1 (dedup status, unify LT wording) | merged `4d1ea1c` |

---

## 1. What works now (REAL / functional)

### Worker onboarding & profile
- **Signup → onboarding wizard** is real: email/password via Supabase Auth, then a Step 1 multi-role picker (worker / company / agency / customer) and Step 2 profile (display name + country). Pending invitations are surfaced before the role screen. `worker` is the only `active` entry-point role; the others are honestly `start-available` with real setup routes. Roles are non-locking (`canBeAddedLater: true`), and that promise is stated in copy.
  - `apps/web/app/[locale]/onboarding/page.tsx`, `apps/web/lib/config/roles.ts`
- **Worker dashboard (no company/engagement)** lands on an honest "Overview" cockpit: real profession / skills / journal counts only, no fake metrics, a first-use panel guiding the 5-step path. A worker with no writable engagement gets a precise reason (pending invite / on-roster / none) rather than a flat empty state.
  - `apps/web/app/[locale]/dashboard/page.tsx`, `apps/web/app/[locale]/dashboard/journal/page.tsx` (no-context branch)
- **Worker profile evidence card** ("Mano įrodymai") honestly separates **confirmed-by-manager** skills, **self-declared** skills (with an "awaiting confirmation" note), and **system-recorded** journal-entry count. Reads straight from stored data; no score, no fake "verified by AI".
  - `apps/web/components/app/worker-evidence-card.tsx`

### Journal entry creation
- **Text-first composer** is the primary path: free-text describe → rule-based structure suggestion → the worker confirms what is true → save. Suggestions are explicitly **not** facts until confirmed; multi-fragment LT parsing works; precise save errors surface. Entries stay private and self-declared until a real human confirms them.
  - `apps/web/components/app/journal-entry-composer.tsx`, `apps/web/lib/journal/actions.ts`

### Evidence status & timeline (the chain)
- **Evidence Status Strip** (shared component) shows the three honest states — *self-declared / waiting for confirmation / confirmed* — as compact chips, data-gated so "confirmed" lights up only when a real approved signal exists. Used on the worker journal list header and the profile evidence card.
  - `apps/web/components/app/evidence-status-strip.tsx`
- **Evidence Decision Timeline** on each worker journal entry shows the real, ordered append-only history: *Record created → Waiting for human confirmation → Confirmed / Changes requested / Not confirmed*, each decision with the confirmer **role** (manager / owner / external (client) manager) + date, and a reason **only when one was actually given**. After #245 this is the single per-entry status surface (the duplicate status chip was removed).
  - `apps/web/components/app/evidence-decision-timeline.tsx`, `apps/web/lib/journal/review-status.ts` (`deriveReviewTimeline`)
- **"Who can confirm" clarity line** on journal + profile names exactly the supported confirmer roles and states the entry stays self-declared until one of them confirms.

### Manager inbox review
- **Manager review inbox** lists only the real gated reviewable set (entries the caller manages, where `journal_review_enabled = true`, no evidence row yet) and records approve / confirm-skills / request-changes / reject through the SECURITY DEFINER RPCs. It degrades to an empty inbox (no mock data) if the gating RPC is absent.
  - `apps/web/app/[locale]/dashboard/inbox/page.tsx`, `apps/web/components/app/journal-inbox-entry.tsx`, `apps/web/lib/journal/review-actions.ts`
- **Review Clarity v1** explains, honestly, what each action does to a worker's evidence (a real human confirmation, never automatic), plus the shared status legend and per-action consequence hints.

### Pricing / payment honesty
- **Honest.** The pricing page states prices are "not finalised yet" and "billing is never started for you on this page"; every plan CTA routes to a **waitlist**, not a checkout. There is **no Stripe / checkout / subscription wiring** anywhere. A CTA-honesty guard blocks "checkout/paid/premium/atsiskaityti" language while billing is unwired.
  - `apps/web/app/[locale]/(marketing)/pricing/page.tsx`, `messages/{en,lt}.json#pricing`, guard `cta-honesty-clarity.test.ts`

---

## 2. What the user can safely test now

A real person can, end-to-end and without hitting a fake feature:

1. **Sign up** and complete onboarding as a **worker** (pick worker; optionally add other roles — honestly marked "start-available").
2. **Build a profile** text-first: describe themselves, confirm rule-based skill suggestions (saved as **self-declared**, never auto-verified).
3. **Log journal entries** against an active engagement; see them as private, self-declared records.
4. **See the evidence states** on the profile card and journal list (self-declared / waiting / confirmed chips) and the **per-entry decision timeline** (created → waiting, and, once a manager acts, the full confirmed / changes-requested / not-confirmed history with role + date + real reason).
5. **As a manager/owner** with `journal_review_enabled` on a worker, open the **inbox**, read the review-clarity explanation, and **approve / request changes / reject / confirm skills** — and watch the worker-side timeline reflect the real decision.
6. **Read pricing** and join a **waitlist** (no card is ever charged).

> Caveat for manual testing: the manager review loop requires a real org engagement with `journal_review_enabled = true`. Without it, the inbox is honestly empty and entries stay self-declared (this is correct behaviour, not a bug).

---

## 3. What is blocked by RED / DB (do not attempt in a GREEN slice)

These are open **RED `needs-human-gate` draft PRs** — each requires owner approval + manual prod migration (per the Auto-merge Safety Envelope). They are **out of scope** for any GREEN polish and must not be touched here:

| PR | Blocked capability | Why RED |
| --- | --- | --- |
| **#240** | Pin `confirmer_role` to manager/owner/external_manager at the DB level | DB migration (column/constraint) — human-gated |
| **#183** | Slice 5 — project / task foundation | new tables + RLS |
| **#172** | M4 matching engine "why" | migration + RPC + data-model decision |
| **#171** | Slice 7 — payments / subscriptions | billing (RED class by definition) |
| **#168** | Slice 4 — invitation membership reflected canonically | membership/engagement data change |

Consequently, the following are **blocked until the above land**:
- **Broad confirmer roles** (parent / teacher / buyer / family) — the backend only stores manager/owner/external_manager; widening is a migration (#240 territory). The whole evidence chain is deliberately honest about this.
- **Real matching / "why matched"** — config-hidden (`matching`, `marketplace` = `hidden`); needs #172.
- **Real payments / subscriptions** — needs #171; today's pricing is waitlist-only by design.
- **Project/task linking of journal entries** — the data model is "ready" but linking is inactive (needs #183); journal copy already says so honestly.
- **Canonical invitation→membership reflection** — needs #168.

---

## 4. Recommended next GREEN slice (small, safe, no DB)

Ordered by value-to-effort, all achievable as code/copy-only GREEN slices (no DB, no RED dependency):

1. **Evidence timeline on the worker profile "Living CV" / history view** (read-only reuse). The timeline component + `deriveReviewTimeline` already exist; surfacing a compact confirmed-only history on the CV/profile would extend the chain to the profile without new data. *(Highest coherence with #241–#245.)*
2. **Manager inbox "what happens next" after a decision** — a small honest confirmation toast/line tying the manager's action to the worker-visible timeline state (pure copy + existing result state). Closes the loop narratively.
3. **Empty/zero states polish for the evidence surfaces** — when a worker has entries but no engagement-with-review, make the "waiting" explanation point at the precise next step (owner must enable review), reusing existing `reviewNotEnabledNote`.
4. **i18n parity sweep of the new evidence keys** (`evidenceStatus.*`, `entry.timeline.*`, `inbox.reviewClarity.*`) under the existing `i18n-lt-en-parity` guard, to lock the chain's copy against future drift.

Each of these is presentation/copy-only, guardable, and independent of the RED PRs.

---

## 5. What should NOT be touched yet

- **PR #240** and RED drafts **#183 / #172 / #171 / #168** — owner/human-gated; leave as drafts.
- **`confirmer_role` allow-list** (manager/owner/external_manager) — pinned by `confirmation-honesty` + the timeline guard; do not widen without #240.
- **Pricing → real billing** — keep waitlist-only until #171; do not add checkout/Stripe/"buy" CTAs.
- **Marketplace / matching** — keep `hidden` in `feature-availability`; do not render or imply functional matching.
- **Talent discovery sample cards** — keep every entity "Sample · " prefixed and the "Preview / Owner review" banner; do not present as live data.
- **Auto-verification / AI claims** — no surface may claim automatic or AI confirmation; the chain is explicitly human-only.
- **The append-only confirmation model** — never mutate/delete evidence rows for display; latest-wins + full timeline read-only is the contract.

---

## Appendix — honesty guards protecting the chain (regression net)

These vitest guards (run via `pnpm -F web test`) keep the evidence chain honest:

- `confirmation-honesty.test.ts` — only manager/owner/external_manager named; no broad confirmer; footnote stays honest about automatic confirmation; "who can confirm" lines name the supported roles.
- `evidence-status-honesty.test.ts` — strip copy no broad/auto/AI; "confirmed" chip is data-gated at every call site.
- `manager-review-clarity-honesty.test.ts` — inbox clarity copy honest; strip reuses the data-gated component.
- `evidence-decision-timeline-honesty.test.ts` — timeline never yields confirmed without a real approved row; never invents a reason; no AI/automatic/broad-confirmer copy; waiting is human.
- `journal-review-origin.test.ts` — the timeline is the **single** per-entry status surface (no duplicate chip regression) and still surfaces who/when per decision.
- `cta-honesty-clarity.test.ts`, `placeholder-sample-affordance.test.ts`, `matching-ui-neutralized.test.ts`, `product-readiness.test.ts` — pricing/marketplace/matching honesty + readiness.
