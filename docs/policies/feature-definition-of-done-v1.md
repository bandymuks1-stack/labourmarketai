# Feature Definition of Done — v1

> **Status:** Binding. Codifies the owner-stated Done criteria of
> 2026-05-28 (Stage 2 and the constitution-enforcement P0). Every
> visible-product sprint, slice, or feature PR must satisfy this DoD
> before claiming "shipped" and before progression state advances.

This DoD complements (does not replace) the existing technical green
checks from `CLAUDE.md` (typecheck / lint / build) and the signal
classification rules from `docs/DEMO_TO_REAL_DATA_POLICY.md`. The
existing rules are necessary but not sufficient; this DoD is the
additional gate that prevents a static preview from being mis-shipped
as a real feature.

## 1. The seven-line DoD

Every feature, slice, or sprint ships ONLY if it can answer all seven
of the following questions truthfully in the PR description and the
matching artefact:

1. **BEFORE** — What does the owner currently see (route + literal
   copy or chip + behaviour)?
2. **AFTER** — What does the owner see now (route + literal copy or
   chip + behaviour)?
3. **URL** — Exact LT URL and EN URL the owner can open to test.
4. **ACTION** — The single concrete action the owner can perform on
   that URL (form submit, button click, server action call, etc.).
5. **RESULT** — The visible state change after the action (chip
   flips, count updates, redirect lands on a new view, etc.) —
   described literally, not "user gets feedback".
6. **RELOAD** — Whether the result persists after a browser reload
   AND a session restart. If it does not persist, the feature is
   NOT done — it is a preview.
7. **BLOCKER** — If anything in 1–6 is impossible today, the exact
   blocker: missing table / missing RPC / missing env / missing
   service route / missing owner-approved DB migration. No
   hand-waving; the next concrete action required must be stated.

Each of the seven items is required in every visible-product sprint
artefact, even if the answer to BLOCKER is "none".

## 2. The four progression states

A feature, lane, or stage is exactly one of:

| State | Meaning | May advance progression? |
|---|---|---|
| **real** | All 7 DoD lines pass: visible URL + concrete action + persistent result + no blockers. Backed by real records or a named source. | Yes |
| **partial** | Some 7 DoD lines pass with caveats explicitly stated (e.g. "RELOAD: persists for catalogue; not for invited members yet"). Honest. | Yes, only if the partial scope is explicitly named |
| **blocked** | At least one DoD line cannot pass today. The exact blocker is stated. No relabel. | No |
| **preview** | Visual chrome, sample data, no real persistence path. Useful for direction; never advances progression. | No — never |

**A preview is not a completed feature.** Calling a preview "shipped"
or advancing the visible-product-progress state past it is a
violation of this policy.

## 3. Progression-advance gate

The Agentai `visible-product-progress` system at
`runtime/state/visible-product-progress.json` (gitignored owner-local
state) holds the shipped-stage list per project. Advancing it via
`npm run agentai:visible-product:advance -- --project <p> --stage <s>`
is **forbidden** unless the stage's PR carries:

- the 7-line DoD answered in the PR body or the linked artefact;
- the matching feature state is `real` or `partial`;
- the validation block shows green typecheck / lint / build / tests;
- the constitution compliance checklist
  (`docs/policies/constitution-compliance-checklist-v1.md`) is
  filled in.

Advancing the progression state for a stage whose DoD does not pass
is treated as a regression and must be reverted in the next sprint.

## 4. Required PR header block

Every visible-product PR (and every sprint artefact in
`runtime/artifacts/labourmarketai-real-visual-os-2026-05-28/`) must
carry this header block near the top:

```
## Feature Definition of Done

State: real | partial | blocked | preview

BEFORE: <literal description>
AFTER:  <literal description>
URL:    /<lt>/... and /<en>/...
ACTION: <single concrete action>
RESULT: <literal visible state change>
RELOAD: persists | does not persist (<why>)
BLOCKER: none | <exact missing piece>

Constitution checklist: see docs/policies/constitution-compliance-checklist-v1.md
```

A PR whose header is missing any of the 7 lines does not satisfy DoD,
and progression must NOT advance.

## 5. Worked examples

### 5.1 PR #95 (Stage 2 — Activity Setup Hub) → **partial**

| Line | Value |
|---|---|
| BEFORE | `/dashboard` showed Company / Agency / Buyer as `Ruošiama` chip with no real on-ramp; `/dashboard/{agency,company,buyer}` redirected away from users without the role. |
| AFTER | `/dashboard/start` lists three real-state lanes; Agency + Company setup forms write `public.agencies` / `public.companies` rows via the `add_role` RPC; Buyer page surfaces the missing-`public.customers` blocker. |
| URL | `/lt/dashboard/start`, `/en/dashboard/start`, plus four sub-routes. |
| ACTION | Type an agency name in `/lt/dashboard/start/agency` → click `Pradėti agentūros nustatymą`. |
| RESULT | Form is replaced by a "✓ Pradėta" card listing the DB-stored `legal_name`, `country`, `created_at`. |
| RELOAD | Persists. Verified via prod DB sanity (`select count(*) from public.agencies` increments by one). |
| BLOCKER | Agency / Company paths: none. Buyer path: missing `public.customers` entity table (M3 scope per migration 0007 comment). |

Verdict: `partial` for the lane group (Agency + Company are `real`,
Buyer is `blocked`). Progression advanced from `slice-3` to
`slice-4-agency-card` on the strength of the Agency + Company
parts, with Buyer's blocker explicitly noted in the artefact.

### 5.2 PR #90 (Talent visible preview) → **preview**

| Line | Value |
|---|---|
| BEFORE | `WorkerCard` and `JobDemandCard` primitives existed but no route rendered them. |
| AFTER | `/dashboard/talent` renders 3 `Sample ·` workers + 3 `Sample ·` jobs in the dashboard auth shell. |
| URL | `/lt/dashboard/talent`, `/en/dashboard/talent`. |
| ACTION | None — read-only sample view. |
| RESULT | Owner can see the primitives in context. |
| RELOAD | N/A — sample data is hardcoded. |
| BLOCKER | No real worker / job data wiring; no action persists anything. |

Verdict: `preview`. Useful for owner-review of the direction. Does
not count as a completed feature. The visible-product-progress
state was nevertheless advanced (slice-1-worker-card + slice-2-
job-demand-card + slice-int-talent-route) for the underlying
*primitive* lanes — the preview surface itself is honestly labelled
in the feature status matrix on `/dashboard/admin/project-truth`.
This dual treatment is the policy boundary: primitives can be real
even when the integration surface is preview.

## 6. What this policy forbids

- Marking a route `real` when no persistent action exists on it.
- Marking a route `real` when sample data drives the visible state.
- Advancing `visible-product-progress` for a stage whose DoD is not
  satisfied.
- Calling a preview "shipped" in any artefact, PR body, or sprint
  report.
- Hiding a `blocked` lane behind a `partial` label without naming
  the blocker.

## 7. See also

- `docs/PRODUCT_CONSTITUTION.md` §5 (no fake anything), §9 (demo-to-real)
- `docs/DEMO_TO_REAL_DATA_POLICY.md` — concept / sample / preview / real taxonomy
- `docs/policies/constitution-compliance-checklist-v1.md` — per-PR checklist
- `docs/policies/onboarding-channels-policy-v1.md` — self-entry parity
- Agentai progression module at `agent-control-center/src/visible-product-progress/` (PR #164)
