# CONTINUATION CHECKPOINT — 2026-09-13 (mobile UX recovery)

Written for the next session/context. Facts only; nothing forecast.

## Where the repository stands

| | |
|---|---|
| `main` at session start | `6331908` — "#1689 premium recovery — one worker loop, A-14 constitution (#1724)" |
| Working branch | `claude/labourmarket-mobile-ux-qwdmk8` |
| Branch head | `a3f073c` |
| Open PR | **#1727** — https://github.com/bandymuks1-stack/labourmarketai/pull/1727 |
| PR state | **DRAFT** (see *Blocked* below) |
| Production | unchanged — nothing from this branch is merged or deployed |

## What was actually done, and proven how

Five commits, one PR, **composition only**. No migration, no RLS, no auth,
no new AI call, no new route, no new reader, no destructive write.

1. `0554aa3` — **the journal's records live on a calendar**; the opportunity
   list reads as a list.
2. `8b99abd` — **PASAULIS' base is the map**, and a place opens that place's
   list.
3. `1c0fbbd` — the map and the first results share one phone screen.
4. `1549de4` — the **profile** opens on the person, not on seven decisions.
5. `a3f073c` — the diary answers the same window the calendar draws.

**TECHNICALLY_PROVEN** (each run locally on the head, all green):
`pnpm -F web typecheck`, `lint` (0 errors), `test` — 1325 files / 22,652
tests, `build`, plus `placeholders:check`, `check:fit-signal-copy`,
`check:pilot-honesty-copy`, `check:pricing-honesty-copy`,
`check:worker-plain-language`, `check:constitution`,
`check:primary-route-smoke`, `check:public-seo-indexing`,
`check:i18n-debt`, `product-truth --check`, `migration-safety` (GREEN — no
migration files changed).

**CI on GitHub**, on `8b99abd`: **Quality Gates ✅ · E2E Smoke ✅ ·
Migration Safety ✅**. Later commits were pushed after that run; re-check
the head before merging.

`product-gate.mjs` reports 42 violations locally — **identical on a clean
checkout of `main`**, i.e. pre-existing waiver-scoped surfaces, nothing this
branch introduced.

**HUMAN_UI_PROVEN = NO. PRODUCTION_PROVEN = NO.** Nobody has walked this on
a phone. Do not upgrade either without a real walk.

## Blocked — needs the owner (nothing an agent can do)

1. **PR #1727 cannot be taken out of draft from here.** Both GitHub GraphQL
   mutations — `markPullRequestReadyForReview` and
   `enablePullRequestAutoMerge` — fail repeatedly (HTTP 502 and
   "Something went wrong while executing your query", several distinct
   request ids). The repo's own merge model names the likely cause: the
   one-time DI prerequisite *repo setting → Allow auto-merge = ON* plus
   branch protection requiring `quality` and `migration-safety`. Until that
   is set, auto-merge is inert. **Owner action: press "Ready for review"
   and merge #1727** (or turn Allow auto-merge on and let an agent retry).
2. **`SUPABASE_DB_URL`** (read-only) is still missing as a GitHub Actions
   secret — the live secdef-allowlist and migration-parity gates stay
   inactive. This is open owner decision GOV-1, unchanged by this session.
3. The six open owner decisions printed by `product-truth.mjs`
   (PER-11, ORG-2, EVID-2, EVID-6, MKT-7, GOV-1) are unchanged.

## Shortest owner walk (phone) — the one thing that is actually needed

1. `/lt/dashboard/journal` — a calendar opens on the current month with dots
   on the days that carry records; the list below shows a handful of days.
2. Tap a day **with** dots → only that day, with **Įrašyti darbą** and
   **Atidaryti kalendoriuje** beside its date.
3. Tap a day **without** dots → it stays selected and says so.
4. **Savaitė** / **Mėnuo**, then ‹ › — the grid AND the list move together.
5. `/lt/dashboard/opportunities` — the map is the first thing under the
   title and the first rows are on the same screen.
6. Tap a place → **Rodyti šios šalies galimybes** → the same page, narrowed.
7. The rows read as rows; open one — every fact is inside it.

## NEXT_HIGHEST_VALUE_ACTION

In order, for whoever picks this up:

1. **Get #1727 merged** (owner gate above), then re-verify on production.
2. **PAKLAUSK is still a conversation, not yet a control surface.** The
   machinery exists and is real — `lib/conversation/action-registry.ts`
   (54 actions with confirmation tiers and preconditions), `dispatch.ts`,
   `intent-registry.ts`, `result-registry.ts`. What was NOT audited this
   session is how many of those 54 a person can actually reach from the
   PAKLAUSK tab on a phone. Start by measuring that, not by building.
3. **`/cv` (1,041 lines) and `/dashboard/profile` (1,300+ lines) are still
   long pages.** The profile's chip wall is fixed; the page itself is not
   split into stations per target IA §2. That is its own slice.
4. `/dashboard/gallery` and `/dashboard/work-in-numbers` were NOT inspected
   this session — check them against the same compactness rule before
   assuming they are fine.

## DO-NOT-REGRESS

- The journal calendar **reads nothing**. It is a pure re-shaping of the
  page's own `entryDayGroups`, which come from the canonical work-time rule.
  If it ever grows a query, the diary and the calendar can disagree again.
- **One map, one reader.** `world-discovery-subset` now allows a CLOSED
  two-entry mount list. A third mount is a product decision with a receipt,
  never a convenience import.
- **Both mandatory opportunity disclosures.** The talent-pool chip renders
  OUTSIDE the essence filter, and "pay not stated" stays on the row. A
  talent pool may never read as a vacancy.
- **The Living CV may still surface a different profession** when the
  evidence supports it (`evidencedProfessionSlug`). Confirmed untouched.
- Every profile destination stays reachable — five moved behind one
  disclosure, none were removed.
- SEP-7 on the calendar: an empty cell is a recorded zero over a known day,
  a future day is shown and not offered, and a day the reader could not
  answer for never reaches the grid.
