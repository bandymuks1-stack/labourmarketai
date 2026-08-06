# W7 P1-4 — `/dashboard/profile` inventory: AUDIT PLAN (no implementation)

Prepared 2026-08-07. **This document is the plan, not the audit.** No code is
changed in this window and none may be changed by the audit itself.

| | |
|---|---|
| Worktree | `C:/Users/Mano/Documents/labourmarketai-w7-p14-audit` (PINNED) |
| Branch | `audit/w7-p14-profile-inventory` |
| Pinned at | `origin/main` `779357aac31a28704c169bba2a03265a2f104f42` |
| Target | `apps/web/app/[locale]/dashboard/profile/page.tsx` — **1007 lines** |
| Output | `docs/audits/w7-p14-profile-inventory.md` + browser evidence + slice list |
| Forbidden | splitting the file, moving a section, editing a component, any migration, any production write |

Why pinned: the false "W6 has no shipped surface" report and #1042's false "no
project-completion control exists" were both produced by grepping the SHARED
main tree while a concurrent session held it at an older commit. Every claim in
this audit cites this worktree's HEAD.

## Measured starting facts (from the pinned tree — verify, do not trust)

- 1007 lines; **35 `await` expressions**; two `Promise.all` batches (lines 132,
  234) — everything outside those batches is a potential serial waterfall.
- Nine anchored sections already exist: `profile-top`, `profile-identity`,
  `managed-companies`, `cv-availability`, `cv-languages`, `profile-edit`,
  `capabilities` (a `<details>`), `candidate-skills`, plus the header link row.
  The remaining sections are unanchored — enumerating them is step 1.
- ≈20 section-level component imports (`WorkerTradeProfile`,
  `WorkerSetupJourney`, `ProfileTextFirstFlow`, `ProfileHubOverview`,
  `ProfileStateStrip`, `LiveProfileSection`, `CapabilityProfileSection`,
  `SkillClarifySection`, `TrustBlock`, `WorkerEducationSection`,
  `WorkerAchievementsSection`, `PageQuickNav`, …).

## Step 1 — Section inventory (static, pinned tree)

Enumerate **every** section top-to-bottom. One table row each:

| # | Section | Anchor / testid | Component | Data source (`lib/*` fn) | Awaited in a `Promise.all`? | Role gate | Conditional render | Lines |

Rules: a section is a distinct visual block a user could name. Record the
source function, not "supabase". If a section renders for a non-worker role,
say which. If two sections read the same source, flag it — that is a
duplication candidate, not a finding yet.

## Step 2 — Render-cost measurement

For each section: which of the 35 awaits feed it; whether that await sits in a
`Promise.all` batch or runs serially; whether the source is a single query, an
RPC, or an N+1 loop. Produce a **serial-waterfall list** ranked by depth. Also
record local TTFB for `/lt/dashboard/profile` (5 runs, median) as the baseline
any future split must beat.

## Step 3 — Browser measurement at 1440 and 375

Local stack only. Never production. Never another worktree's dev server —
start this worktree's own server and confirm the port before capturing (a prior
session's Playwright silently reused another worktree's `:3100`).

Per breakpoint, per section: rendered height, whether it is above the fold,
whether it collapses, and a screenshot. Full-page capture at both widths.

Screenshot hygiene: pass `caret: "initial"` — `caret: "hide"` injects a style
that produces phantom hydration/computed-style mismatches that are not product
defects.

## Step 4 — Defect sweep (record, never fix)

Four buckets, each finding cited `file:line` + screenshot:

1. **Overflow** — horizontal scroll or clipped content at 375; long unbroken
   strings; tables and chip rows that do not wrap.
2. **Hydration** — every console hydration warning, with the mismatching
   attribute. Discount the caret class above.
3. **Console** — every error and warning at load, on `<details>` expand, and
   after each interactive control.
4. **Duplication** — the same fact rendered twice (e.g. skills in both
   `CapabilityProfileSection` and `candidate-skills`); two sources answering
   the same question; a section duplicating a dedicated route.

## Step 5 — Profile-owned vs misplaced classification

Exactly one label per section, with a one-line reason:

- `PROFILE_OWNED` — identity/CV facts that belong here.
- `MISPLACED_HAS_HOME` — a canonical route already exists (name it).
- `MISPLACED_NEEDS_HOME` — does not belong, no destination exists yet.
- `DUPLICATE_OF` — name the winner.
- `DEAD_OR_GATED_OFF` — never renders in current config; say why.

Standing constraint: **Product Gate A-09 blocks undeclared screens.** A
`MISPLACED_NEEDS_HOME` verdict is a proposal for the owner, never a licence to
create a route. The canonical home for experience-domain content is
`?result=experiences`, not a new dashboard route.

## Step 6 — Proposed future slices

Three to six coherent slices, ordered by leverage. Each states: exact files,
whether a migration rides along (P1-4 should need none), the guard that pins
it, the browser proof required, and its rollback. No slice may mix a move with
a behaviour change.

## Definition of done for the audit window

Inventory table complete (every section, no "etc."); waterfall list + TTFB
baseline; screenshots at 1440 and 375; four defect buckets each with cited
findings or an explicit "none found"; every section classified; slice list
written; W7 matrix row updated; **zero product-code changes in the diff.**

## Out of scope (do not touch)

W8 and everything after it. W7's other items (P1-3 conversation memory, P2-1
open-ended booking overlap) are separate slices. No migration, no owner gate,
no production write, no PROD_QA identity use.
