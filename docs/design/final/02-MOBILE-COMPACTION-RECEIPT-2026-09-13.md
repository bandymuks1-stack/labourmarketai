# MOBILE COMPACTION — RECEIPT (2026-09-13)

Owner direction, same day, after the #1724 walk: the data logic improved but
the phone still fails — "puslapiai yra per ilgos paklodės, funkcijos
išmėtytos, per daug kortelių/mygtukų/teksto, o svarbi informacija
neparodoma natūraliausiu būdu."

This receipt records what that direction retired and what now pins its
replacement. It is additive to `01-WORKER-MOBILE-IA-2026-09-13.md` (the
target IA) and changes no reader, no table, no policy.

Evidence level: **TECHNICALLY_PROVEN** (typecheck, lint, 1324 test files /
22 6xx tests, `next build`, every secret-free CI gate). **HUMAN_UI_PROVEN =
NO** and **PRODUCTION_PROVEN = NO** until the owner walks it on a phone —
the shortest path is at the end.

---

## 1. DARBO ŽURNALAS — the records live on a calendar

**Retired.** The horizontal day-chip strip (`journal-day-nav`) over the full
list of day groups. It could only ever show days that already carried
records, in one flat row, above an endless scroll of date headings: the
person could not see the shape of their own month, and a day with nothing
recorded yet was not reachable at all.

**Now.** A real calendar — month or week — is the day navigator
(`components/app/journal/journal-calendar.tsx`), and tapping a day shows
exactly that day below with that day's actions: record work, or open the
same day on the one canonical calendar (`/dashboard/planning?view=day`).
Quick recording stays where it was, above the history.

- **One truth.** The grid is built by a pure model
  (`lib/journal/journal-calendar.ts`) from the page's OWN `entryDayGroups` —
  the days it already resolved through the canonical work-time rule
  (`resolveWorkDayDetail` → `deriveEntryWorkTime`). The module reads nothing
  and can therefore never disagree with the diary, the planning calendar or
  a Work-in-Numbers figure. No second calendar, no second store.
- **URL state, no JavaScript.** `?date=` (the day), `?cal=month|week` (the
  scale), `?month=` (the anchored period). A day is shareable, survives a
  reload, and works before any script runs. `?skill=` and `?period=` are
  carried across a day change, so a drill-down is not undone by a tap.
- **Honesty.** An empty cell is a recorded zero over a known day, not an
  unknown (SEP-7); a future day is shown and not offered. A tapped day with
  no records now STAYS selected and says so, instead of silently falling
  back to the whole diary (which read as "your tap did nothing").
- **Bounded diary.** With no day selected the list renders the most recent
  `DIARY_DAY_LIMIT = 7` days and states how many days it is not stacking —
  the same bounded-output-with-an-honest-"+n" rule
  `lib/planning/calendar-result.ts` already uses. Nothing is deleted and
  nothing is unreachable: every other day is one tap away on the grid.

## 2. GALIMYBĖS — a compact row first, the detail on selection

**Retired.** The full-height card as the list unit: a labelled company line,
the whole structured chip row, an unclamped WHY, a next-action line, and
four controls of equal weight, repeated down the page.

**Now.** The row carries the essence — the work, where it is, the pay if the
employer stated it, the fit band, and the main WHY (clamped to two lines).
Everything else was already behind `OpportunityDetailsDisclosure` and stays
there; the chip row gained an `essence` mode that shows pay only.

- **Both mandatory disclosures survive the compaction**, by construction:
  the talent-pool chip is rendered OUTSIDE the filtered chip list (a talent
  pool may never masquerade as a vacancy), and "pay not stated" stays on the
  row rather than moving into the detail.
- **One action hierarchy.** The forward action for the row (express
  interest — the gated real write) reads first; save and compare moved into
  a quiet secondary cluster; the details door follows. The same canonical
  controls, the same gates, a different reading order.

## 3. Guards

- `lib/guards/journal-calendar.test.ts` — the model: UTC and Monday-first
  arithmetic, the grid reports what it was given, in-scope totals never
  borrow a neighbouring month's day, and it reads nothing.
- `lib/guards/mobile-compact-surfaces.test.ts` — the composition of both
  surfaces, including that the retired day-chip strip cannot come back and
  that neither mandatory disclosure was compacted away.
- `tests/e2e/calendar-journal-history.spec.ts` — repointed from the retired
  day chip to the calendar's own cell for the same day (the orphan guard
  fails otherwise; the legacy expectation was retired deliberately, per IA
  §7).

## 4. Not touched

No migration, no RLS, no auth, no new AI call, no new route, no new reader,
no destructive write. The organization surfaces, the company hub and the
full composer are unchanged.

## 5. Shortest owner walk (phone)

1. `/lt/dashboard/journal` — the calendar should open on the current month
   with dots on the days that carry records; the list below should show a
   handful of days, not a bedsheet.
2. Tap a day with dots → only that day, with **Įrašyti darbą** and
   **Atidaryti kalendoriuje** beside its date.
3. Tap a day with no dots → it stays selected and says there are no records
   for it, with the one action that changes that.
4. Switch **Savaitė** / **Mėnuo**, then ‹ › to the previous period.
5. `/lt/dashboard/opportunities` — the rows should read as rows; open one
   and confirm every fact that used to be on the card is inside it.
