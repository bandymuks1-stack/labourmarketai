# CONTINUATION CHECKPOINT — 2026-09-13 (mobile UX recovery)

Written for the next session/context. Facts only; nothing forecast.

## Where the repository stands

| | |
|---|---|
| `main` at session start | `6331908` — "#1689 premium recovery — one worker loop, A-14 constitution (#1724)" |
| Working branch | `claude/labourmarket-mobile-ux-qwdmk8` |
| Branch head | `a3f073c` |
| PR #1727 | **MERGED** — https://github.com/bandymuks1-stack/labourmarketai/pull/1727 |
| `main` after the merge | `dd6147d` (tree byte-identical to the tested head `3b27e9e`) |
| Production | Vercel auto-deploys `main`; **PRODUCTION_PROVEN is still NO** until the owner walks it |

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

## One thing to know about `main`'s history

GitHub was mid-incident during the merge: `markPullRequestReadyForReview`,
`enablePullRequestAutoMerge` and the REST merge endpoint all returned 502 /
500 for several minutes. **One of the merge calls that reported
`500 Server Error` had in fact succeeded server-side** (`cc63df5`, 12:25:57),
and the retry that finally reported success produced a second, EMPTY squash
commit (`dd6147d`, 12:32:18). `git diff cc63df5 dd6147d` is empty and
`git diff 3b27e9e dd6147d` is empty, so the content on `main` is exactly what
was tested. The duplicate is a no-op commit in the history and was left
alone deliberately: removing it would mean rewriting `main`, which the
operating contract forbids.

**Lesson for the next agent:** when a GitHub write returns 5xx, re-read the
resource before retrying — the write may have landed.

**The repo's *Allow auto-merge* setting IS on.** It was enabled successfully
on the follow-up PR #1728 minutes later, so the merge model's one-time DI
prerequisite is satisfied and every earlier failure was the incident alone.
GREEN-class PRs can be opened with auto-merge from here on; the
wait-for-CI-then-merge fallback is not needed.

## Blocked — needs the owner (nothing an agent can do)

1. **`SUPABASE_DB_URL`** (read-only) is still missing as a GitHub Actions
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

1. **The owner's phone walk** (§ above). Everything else is guesswork until
   someone has used it.
2. **PAKLAUSK is NOT "just another menu" — measured, and the measurement
   argues against building.** `action-registry.ts` carries 52 actions with
   confirmation tiers and preconditions; `intent-registry.ts` carries 77
   classified intents (40 read · 17 write · 16 route · 3 blocked) wired
   through `dispatch.ts` into the chat; and discoverability is already
   designed — `lib/conversation/starters.ts` derives starter chips on the
   SERVER from the person's real signals, capped at three, per workspace
   kind. So do **not** rebuild it, and do not add a menu to it.
   Two facts recorded, neither of them yet a defect:
   · `actionsForRoles()` is exported by the registry and called NOWHERE in
     the product — the registry is a contract, not an enumerated menu, and
     actions are reached through the intents and through the components
     that dispatch by id. That is what the registry's own docstring says
     the design is ("wired per journey"), so it is not, by itself, a bug.
   · six registered actions are referenced nowhere outside the registry —
     `worker.complete-onboarding`, `worker.upload-cv`, `worker.save-skills`,
     `agency.review-clients`, `agency.offer-status`, `agency.who-waits`.
     Whether the LLM proposer can still reach them was NOT established.
     Establish that before calling them dead.
   The honest next step is the owner's phone walk telling us WHERE it reads
   as a menu. Anything before that is speculation.
3. **`/dashboard/profile` needs no split — a line count is not a page
   length.** 1,300+ lines sounds like a bedsheet, and an earlier version of
   this checkpoint said so. Re-read: most of the page is already inside TWO
   disclosures (`#cv-details`, holding work preferences, languages,
   education, organization evidence, the learning compass, achievements and
   external profiles; and `#capabilities`, holding skills). What renders
   unconditionally is the header, the jump strip, the hub overview, the
   trust signals, a feature note and the composer — about six blocks. The
   destination-chip wall was the real defect on this page and it is fixed.
   Do not "split it into stations" on the strength of `wc -l`.
4. `/cv` is deliberately NOT compacted — it is a printable DOCUMENT
   (`cv-doc`, `print:` styles, template registry) and is meant to be read
   top to bottom. It gained a print-hidden jump strip instead. Do not
   "fix" it by collapsing sections.
5. `/dashboard/gallery` (116 lines) and `/dashboard/work-in-numbers`
   (305 lines) were checked and are **already compact**. Do not redo them.

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
- **A CV is a document.** `/cv` sections are not collapsed and must not be:
  the jump strip is the way in, and every one of its anchors is built from
  the SAME predicate that renders its section, so it can never offer a dead
  link. Pinned by `mobile-compact-surfaces`.
