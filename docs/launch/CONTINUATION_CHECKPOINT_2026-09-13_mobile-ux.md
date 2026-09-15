# CHECKPOINT — mobile UX correction, 2026-09-13

Owner scope: the MOBILE UX correction only. Not a product/governance audit.

## Exact state

| | |
|---|---|
| Branch | `claude/labourmarket-mobile-ux-qwdmk8` |
| Mobile-UX CODE baseline | `31ba19b` (#1729) — the last commit carrying CODE from this work |
| PR #1729 | **MERGED** as `31ba19b` |
| `main` lineage | `31ba19b` (#1729) ← `cb4f43c` (#1728) ← `dd6147d` / `cc63df5` (#1727). This checkpoint itself rides a LATER docs-only commit, so neither `main` nor the branch stays at `31ba19b` — do not read that SHA as a current head |
| Production | Vercel auto-deploys `main`; all three PRs are on it. The Vercel deploy itself was NOT verified from here |

`main` carries one EMPTY duplicate squash commit (`dd6147d`): during a GitHub
incident a merge call reported `500` but had in fact succeeded (`cc63df5`),
and the retry produced a no-op. Trees are identical; left alone deliberately
— removing it means rewriting `main`. **After a 5xx on a GitHub write,
re-read before retrying.**

## DONE

**Work Journal — calendar-first history.** The flat day-chip strip over an
endless date list is retired. A real month/week calendar is the day
navigator; tapping a day shows that day's entries and that day's actions
(record work, open the same day on `/dashboard/planning`). Quick recording
unchanged. Each date shows **entries (marker) · hours (number) · state
(marker material + words in `aria-label`)**. Three scopes — DAY (`?date=`),
PERIOD (`?month=`, the ‹ › buttons), RECENT — each bounded to 7 day-cards
with an honest "+n". The long list survives as the day/period detail.
The grid is a PURE re-shaping of the page's own `entryDayGroups`; it reads
nothing, so it cannot disagree with the diary or the planning calendar.
`confirmedCount` uses the page's own `deriveReviewResult === "approved"`.

**Pasaulis — map-first.** The already-working `WorldDiscovery` map (canonical
`MarketMap`, viewport-bounded reader, clustered by place, honest counts,
list equivalent) moved from a link at the bottom of a collapsed disclosure
to directly under the header, above the banded list, at `mode="result"`
(32vh) so map + first rows share one phone screen. A place links into the
page's OWN `?country=` filter. CV-driven cross-profession opportunities
preserved (`evidencedProfessionSlug` untouched).

**Galimybės — compact rows.** Essence on the row (work · place · pay if
stated · fit band · clamped WHY); detail stays behind the existing
disclosure. Both mandatory disclosures survive by construction. One action
hierarchy: forward action first, keep-for-later quiet.

**Profilis** — 7 destination chips → 2 visible + 5 behind one disclosure.
**CV** — print-hidden section jump strip; the document is NOT collapsed.

**Measured at 390px and 690px** (real component, real compiled CSS): overflow
**0**, every control **≥44px**, a whole month in **403px**. Four defects were
found ONLY by measuring and are fixed in #1729: dates lacked hours/state;
‹ › were 36px and the pills 26px; `"57 val. 15 min.."` double period in
LT/RU/NL/DE; and my own state words broke the precise-origin doctrine
(now "patvirtino vadovas" / "paties užrašyta").

## NOT DONE / NOT VERIFIED

- **No phone walkthrough by a human.** `HUMAN_UI_PROVEN = NO`,
  `PRODUCTION_PROVEN = NO` for every item above.
- **No Docker in the build container** → local Supabase cannot boot → the
  authenticated pages were never rendered end-to-end. NOT measured:
  full `/dashboard/journal` page scroll length, `/dashboard/opportunities`
  composition, bottom-nav obstruction, and **map usability** (Leaflet needs
  a live browser + tiles).
- `/dashboard/profile` was NOT split into stations — deliberately. Most of
  that file is already inside two disclosures (`#cv-details`,
  `#capabilities`); ~6 blocks render unconditionally. A line count is not a
  page length.
- PAKLAUSK was NOT changed — deliberately. 52 registered actions, 77
  classified intents (40 read / 17 write / 16 route / 3 blocked), and
  `lib/conversation/starters.ts` already derives contextual starters on the
  server, capped at three. It must not be given a menu.

## Files changed (all three PRs)

`lib/journal/journal-calendar.ts` (new, pure) ·
`components/app/journal/journal-calendar.tsx` (new) ·
`app/[locale]/dashboard/journal/page.tsx` ·
`app/[locale]/dashboard/opportunities/page.tsx` ·
`components/app/market-map/world-discovery.tsx` ·
`components/app/opportunity-structured-detail.tsx` ·
`app/[locale]/dashboard/profile/page.tsx` · `app/[locale]/cv/page.tsx` ·
`messages/{lt,en,ru,nl,de}{,/journal}.json` ·
guards `journal-calendar`, `mobile-compact-surfaces`,
`world-discovery-subset` (mount list widened to a CLOSED two entries) ·
e2e `calendar-journal-history` (repointed to the calendar cell).

No migration, no RLS, no auth, no grant, no schema change in any of it.

## Why #1729 sat unmerged for ~45 minutes

Auto-merge was armed and every check was green, but GitHub never fired it:
the PR had a **merge conflict**. #1728 was squash-merged, so `main` carried
the same CV edits under a different history than the branch still held.
Conflicts were in `mobile-compact-surfaces.test.ts` and this file; both were
resolved by merging `origin/main` INTO the branch (never a rebase or
force-push) and keeping the branch's newer content.

**Lesson, and it cost 45 minutes:** "no check suite failed" does NOT mean a
PR is mergeable. A merge conflict is silent in check events. When a PR with
auto-merge armed has not merged, attempt the merge — the 405 names the
reason immediately.

## Review findings on #1729 — three fixed, two declined

Codex review, fixed in `3d8430d`:
- **P1** a SELF-approval was being labelled "manager confirmed"
  (`deriveReviewResult` returns `approved` for one, and the journal reader
  does not select `confirmer_id`). The words now say a JOURNAL RECORD is
  confirmed and never name an actor the data cannot identify (SEP-3).
- **P2** `Math.max(0.1, …)` printed 0,1 h (~6 min) for a day of 1-2 recorded
  minutes. Such a day now reads `<0,1`.
- **P2** the CV summary anchor was dead in the facts-only state; the facts
  section now takes the id exactly when the summary block is absent. This
  closed a real gap in #1728's "no dead anchor" claim — its guard checked the
  id existed somewhere, not that it was on the block that renders.

Declined, with reasons on the PR: backfilling `journal.calendar` into the six
unrouted catalogs (they also lack `dayNav`, which predates this work — a
standing convention, not a regression), and the `aria-label` duration units
(`formatDuration` supports en|lt only; extending it is its own change).

## Unrelated findings — RECORDED, NOT ACTED ON

Found while working, outside this mobile-UX scope, deliberately left alone
(owner: do not drift into governance cleanup):

- `capability-register.ts` EDU-2 and the `J-INSTITUTION-OUTCOME` journey link
  assert, as current truth, that "a programme cannot be CORRECTED … there is
  no update function in `pg_proc` … the one live programme reads
  `demandUnknown` and always will". Read-only SQL against production
  `gorgitwvdzxbnaxhrsrw` on 2026-09-13 contradicts every clause:
  `update_education_program_v1(uuid,text,text,text,text)` exists
  (SECURITY DEFINER, migration `20260908120000`), and the single programme
  carries `builder` / vocational. Its demand tile still shows no number for a
  DIFFERENT and legitimate reason —
  `count_public_vacancies_by_profession_v1()` returns 20 professions and
  `builder` is not among them, an honest UNKNOWN (SEP-7), not a defect.
  A correction was drafted and then REVERTED out of this branch to keep the
  mobile-UX PR clean. It needs its own PR and its own owner decision.
- `main` carries one EMPTY duplicate squash commit (`dd6147d`) from the
  GitHub incident described above. Harmless; removing it means rewriting
  `main`.

## Owner gates

1. **The phone walkthrough.** Nothing replaces it.
2. `SUPABASE_DB_URL` (read-only GitHub Actions secret, GOV-1) — two live
   security gates stay inactive without it. Unchanged by this work.

## NEXT ACTION (exact)

1. **No CODE from this work is in flight.** Everything through `31ba19b` is
   merged. The only thing that may still be open is this checkpoint's own
   docs-only PR — check `git log origin/main -1` rather than trusting any
   SHA written here.
2. **Wait for the owner's walkthrough.** Do not start another
   mobile slice without rendered evidence of a problem: remaining candidates
   (full journal page scroll, map usability, bottom-nav obstruction) are
   exactly the ones this container cannot measure.
3. If a rendering environment with Docker becomes available, boot local
   Supabase + fixtures and re-run the 390px measurement against the REAL
   `/dashboard/journal` and `/dashboard/opportunities` pages.

## DO-NOT-REGRESS

- The calendar reads nothing — pure re-shaping of the page's own day groups.
- One map, one reader: `world-discovery-subset` allows a CLOSED two-entry
  mount list. A third mount is a product decision with a receipt.
- Talent-pool chip renders OUTSIDE the essence filter; "pay not stated"
  stays on the row.
- CV sections are not collapsed; every jump anchor is built from the same
  predicate that renders its section.
- An untimed record is never "0 h"; an empty day is a recorded zero; a
  confirmation always names its origin.
