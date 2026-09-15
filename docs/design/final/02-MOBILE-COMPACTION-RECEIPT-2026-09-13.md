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
- **The list answers the same window the grid draws.** Three scopes, and the
  calendar always names the one in force: DAY (`?date=`), PERIOD (`?month=`,
  set by the ‹ › buttons — the days inside the period the grid is drawing),
  and RECENT (neither — the most recent days overall, the right first view).
  Found by re-reading the diff before the owner walked it: without the PERIOD
  scope the grid showed August while the list still showed September's last
  days, which is two answers to "which days am I looking at". Period
  navigation also drops a day selection the new period does not contain,
  while clearing the day keeps the period.
- **Bounded diary.** Every scope renders at most
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

---

# PASAULIS — THE MAP IS THE BASE (same day, second slice)

Owner: "jei tai pagrindinė 'Pasaulio' erdvė, jos natūralus pagrindas turi
būti interaktyvus žemėlapis su realiomis galimybėmis pagal šalis/miestus;
iš žemėlapio pereinama į kompaktišką rezultatą/detalę."

**Nothing new was built.** The interactive map already existed and worked:
`components/app/market-map/world-discovery.tsx` on the canonical
`<MarketMap>`, with a viewport-bounded server read
(`lib/market-map/world-read.ts`), clustering by place, a hard object cap
with the folded remainder counted, FACT/DERIVED as material *and* words, and
an always-present list equivalent. It was reachable only as a text link at
the bottom of a collapsed disclosure on PASAULIS — a working capability
behind a door nobody opens.

**Now.** The same component, fed by the same reader for the same default
viewport, is rendered directly under the PASAULIS header, above the banded
list. Selecting a place offers one link into the page's OWN existing
`?country=` discovery filter (`lib/opportunities/discovery-filters.ts`), so
a place narrows the compact list the person is already reading. Discovery
above (where demand *is*), fit below (what of it fits *me*, and why) — the
separation the fit bands exist to protect (DEMAND ≠ SUPPLY, band ≠ rating).

- No second map, no second engine, no second reader, no new route.
- `/dashboard/market-map` keeps every other layer and stays linked from the
  market section; nothing moved and nothing was duplicated.
- A "į sąrašą" anchor sits beside the map heading, so anyone who came for
  the list is one tap past it.

## Guard retired deliberately

`lib/guards/world-discovery-subset.test.ts` rule 3 said "one mount, one
entry". Its INTENT — one implementation, one reader, one action, one Leaflet
bootstrap, no new world/map route — is unchanged and still enforced. What
changed is the COUNT: the canonical mounts are now a closed two-entry list
(`/dashboard/market-map` and `/dashboard/opportunities`), each asserted to
render the component exactly once, with PASAULIS additionally asserted to
build no map of its own and to send a place into the page's own country
filter. Adding a third mount stays a product decision with a receipt.

## Do-not-regress, confirmed still true

The Living CV may still surface a DIFFERENT profession when the evidence
supports it — `result.readiness.evidencedProfessionSlug` still feeds
`MarketExplanationPanel` and the board's retrieval, untouched by this slice.

## Owner walk (phone), added to §5

6. `/lt/dashboard/opportunities` — the map is the first thing under the
   title; pan/zoom re-reads and the counts strip follows.
7. Tap a place (on the map or in its list) → **Rodyti šios šalies
   galimybes** → the same page, narrowed by country, with the active-filter
   chip visible.

---

# PROFESINIS PROFILIS — the page opens on the person (same day, third slice)

Owner: "per daug kortelių/mygtukų/teksto".

`/dashboard/profile` opened with **seven** equally-weighted destination chips
in a two-column grid — a wall of decisions before the person had seen their
own profile. The two a worker actually leaves this page for (**Galimybės**,
**CV**) stay visible; the other five (documents, visibility, gallery,
network, my spaces) moved behind ONE disclosure.

Same links, same targets, same affordance class, same tap size. Only how
many shout at once changed — every reachability guard
(`room-separation`, `clickable-affordance`,
`w7-s4-profile-information-architecture`, `player-card-profile`) still
passes unchanged, which is the point: nothing became unreachable.

Pinned by `mobile-compact-surfaces`: the two primaries are asserted to be in
the visible cluster, and all five others are asserted to be inside the
disclosure — so neither half can quietly disappear.

**Still open on this surface** (not in this slice): the profile page is
1,300+ lines and remains a long page behind its quick-nav. Splitting it into
stations per the target IA §2 is its own slice with its own receipt.
