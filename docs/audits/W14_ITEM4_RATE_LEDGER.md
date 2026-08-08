# W14 item 4 — canonical rate ledger

Re-derived from `main @ 33d1344a` by searching for **division expressions and
`* 100` computations**, not for metric names. A metric called "conversion" need
not contain "rate"; a division can be a rate without being named one.

## Scope of the search

- every `* 100` / `* 1000` percentage computation under `apps/web/lib` and
  `apps/web/app`;
- every division whose operands are counts, lengths or totals;
- `supabase/migrations/**` for SQL- or RPC-side ratios;
- the modules named for analytics: `lib/admin/conversion-funnel.ts`,
  `lib/admin/pilot-metrics.ts`, `lib/telemetry/*`.

**There are no SQL- or RPC-side rates.** The entire rate surface is TypeScript.

Layout percentages (`lib/projects/stage-gantt.ts` — bar offsets and widths) are
excluded: they are geometry, not measurements.

## The ledger

### 1. Acquisition funnel — 7 rates · `lib/admin/conversion-funnel.ts`

| field | value |
|---|---|
| BUSINESS QUESTION | is the acquisition funnel converting well enough to spend on ads? |
| NUMERATOR / DENOMINATOR | counts of two `pilot_events` event names |
| SOURCE EVENTS | `pilot_events` (first-party, no third-party analytics) |
| TIME WINDOW | **was: none. now: `created_at >= now − 90d`** |
| FLOW OR STOCK | flow (events) — correct kind |
| ENTITY / UNIQUE BY | event occurrence — **not** unique session or visitor |
| EXCLUSIONS | `metadata.preview_host === true` (localhost / Vercel preview) |
| SYNTHETIC QA | see §"synthetic contamination" below |
| NULL RULE | denominator ≤ 0 → `null`, never 0% and never `Infinity` |
| SURFACE | `/dashboard/admin/telemetry` — **admin/owner-visible** |
| STATUS | **was `INCOMPATIBLE_POPULATIONS` → now `VERIFIED_CORRECT`** (within the stated uniqueness caveat) |

**The defect.** The read was `.select("event_name, metadata").in(…).limit(5000)`
— no `ORDER BY`, no time predicate. Postgres promises nothing about which rows
an unordered `LIMIT` returns, so once `pilot_events` passed 5000 rows every
numerator and denominator was drawn from an **arbitrary subset of all history**,
and the panel kept printing a confident percentage. Both the module doc and the
panel already told the owner these were *"event occurrences over the recent
window"*. There was no window — the claim lived only in prose.

The truncation was **biased, not merely noisy**: within one visitor's journey
`landing_viewed` precedes `registration_started`, so dropping a slice removes
disproportionately many top-of-funnel events and **inflates** every conversion
rate. Wrong in the flattering direction, for the one reader deciding whether to
spend money.

**Formula before → after:** the arithmetic is unchanged
(`round(n/d * 1000)/10`). What changed is the population `n` and `d` are counted
over, and what happens when that population cannot be read completely.

| | before | after |
|---|---|---|
| window | none (all history) | `created_at >= now − 90d`, in the query |
| ordering | none — arbitrary rows | `created_at desc` — cap keeps the newest |
| at the cap | prints a percentage anyway | every rate `null`, counts shown as `≥ N` |
| panel copy | "over the recent window" | "over the last 90 days" + a truncation banner |

**MEASUREMENT_VALID_FROM.** Rates read from this panel before this change are
not comparable with rates read after it — the population changed from "an
arbitrary ≤5000-row slice of all history" to "the last 90 days, completely or
not at all". Earlier figures are **HISTORICAL_NOT_AVAILABLE**: the events still
exist, but no recorded figure can be reconstructed, because which rows the old
query returned was never determined. Nothing was backfilled and no historical
number is restated.

**Known remaining coarseness (not a defect, but stated).** Counts are event
occurrences, not unique sessions. A visitor who reloads the landing page three
times contributes 3 to the denominator of "Landing → CTA click". `pilot_events`
carries `session_id`, so a per-session variant is *reconstructable* — but the
labels say "share of landings", and a landing **is** an event, so the current
reading is internally consistent and is disclosed on the panel. Changing it
would change the owner's numbers for a semantic preference, so it is recorded
here rather than done silently.

**Cohort mismatch on the three mid-funnel rates.** "Booking proposed →
engagement created" divides engagements created *in the window* by bookings
proposed *in the window*; a booking proposed before the window can be accepted
inside it, so the ratio can legitimately exceed 100%. The population is
compatible (`engagementCreated` is emitted **only** from the booking accept
path, `source: "booking"` — verified in `lib/booking/booking-actions.ts:250`),
but the cohorts are not aligned. The notes already say "(event counts)".
Aligning cohorts needs a per-booking join, which is real work, not a formula
fix. **Status: `NOT_ENOUGH_EVIDENCE` for a per-cohort rate; the event-count
ratio is correctly labelled.**

### 2. Profile completeness · `lib/conversation/worker-activity.ts:166`

`stepsDone / checks.length`. Both sides come from the same array, the same
entity and the same instant; the denominator is the fixed count of profile
steps. A share of a checklist, not a flow rate. **`VERIFIED_CORRECT`.**

### 3. Contextual fit · `lib/market/fit.ts:60`

`matchedUris.length / need.length` — a same-instant set comparison over one
population (the need's ESCO skill URIs). Guarded by
`if (need.length === 0) return null` with the comment *"no structure means no
percentage"*. This is the UNKNOWN ≠ 0 rule already applied correctly.
**`VERIFIED_CORRECT`.**

### 4. Signal divergence · `lib/intelligence/contradiction.ts:79`

`|a−b| / max(|a|,|b|)`, zero-denominator guarded. Compares two signal values at
one instant — not a rate over a population. **`VERIFIED_CORRECT`.**

### 5. Salary delta · `lib/intelligence/salary-model.ts:219`

`(subject − benchmark) / benchmark`. A ratio of two monetary values, not a
count ratio; the benchmark is a stated comparator. **`VERIFIED_CORRECT`.**

### 6. Zone coverage · `lib/workforce/planning-zone-view.ts:227`

`clampPct(covered, required)`, employer-visible on
`/dashboard/company/planning`. `required <= 0` returns **100**.

A stock ratio at an instant (covered vs required headcount), not a flow rate,
so it is not a stock-delta rate. The `required = 0 → 100%` convention is
defensible — nothing required is nothing uncovered — and the panel renders the
raw `required` / `covered` counts beside it, so the reader is not left inferring
a denominator. Recorded, not changed: flipping it to "—" is a product decision
about an empty zone, not a correctness fix. **`VERIFIED_CORRECT` (convention
documented).**

### 7. Task-duration percentiles · `lib/admin/pilot-metrics.ts`

`percentile(sortedMs, 0.5 / 0.75)` — order statistics, not ratios. Notably this
sibling module **already** ordered its read
(`.order("created_at", {ascending:false}).limit(WINDOW_ROWS)`), which is what
makes "the most recent N events" a coherent population. The funnel simply
lacked the same discipline. **`VERIFIED_CORRECT`.**

## Roll-up

| status | count | which |
|---|---|---|
| `VERIFIED_CORRECT` | 6 modules | §2–§7 |
| `INCOMPATIBLE_POPULATIONS` → fixed | 7 rates (1 module) | §1 acquisition funnel |
| `STOCK_DELTA_RATE` | **0** | no rate anywhere is derived from stock deltas |
| `MISSING_EVENT` | 0 | every rate's events are emitted at real action points |
| `HISTORICAL_NOT_AVAILABLE` | 1 | pre-change funnel figures (§1) |
| `SYNTHETIC_CONTAMINATION` | see below | |
| `UNREACHABLE` | 0 | |

## Synthetic / QA contamination (recorded for item 5, not expanded into)

- **Excluded today:** events carrying `metadata.preview_host === true`
  (localhost and Vercel preview origins) are dropped from both numerator and
  denominator, and the excluded count is shown.
- **Not excluded today:** production events generated by the owner's own
  browsing and by acceptance runs against production. The panel offers an
  "exclude admins" filter for the event table **below** the funnel, but that
  filter does **not** feed `getAcquisitionFunnel` — the funnel counts admin
  navigation as real traffic.
- **Also not excluded:** e2e/acceptance sessions that run against a production
  origin would be indistinguishable from real visitors, since the only marker
  is `preview_host`.

Both are genuine contamination of an admin-visible metric and belong to **W14
item 5**. They are recorded here rather than fixed, because excluding admin
profiles from the funnel changes the owner's numbers and needs the same
population discipline applied deliberately, not as a side effect of item 4.

## The activation funnel specifically (§5 of the command)

`dashboard_viewed` (#1080) is **not** part of `FUNNEL_STAGES` and therefore
feeds none of the seven rates. Whatever #1080 fixed about its emitter, it does
not make any rate in this ledger correct or incorrect — the stages that do feed
rates are the eight acquisition events plus the mid-funnel marketplace events
listed in `FUNNEL_STAGES`. That claim was checked rather than assumed, which is
what §5 asked for: the previous item does not transitively certify this one.

After this change the seven rates have a compatible population (same table,
same 90-day window, same preview exclusion, same event-occurrence uniqueness on
both sides) or they report `null`. The remaining known gaps are the two above:
event-vs-session uniqueness, and cohort alignment on the three mid-funnel
ratios — both stated on the panel and in this ledger rather than hidden.
