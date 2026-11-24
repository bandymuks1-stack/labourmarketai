# W14 item 7 — KPI host surface matrix

Re-derived from `main @ e6827504` by searching for **rendered percentages and
derived metrics**, not by trusting the prior report. That report claimed
`/dashboard/admin/telemetry` was the only KPI host. **It is not.**

## Surfaces

| route | role | metric | source | formula | window | population | trust | status |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/admin/telemetry` | superadmin | 7 conversion rates | `pilot_events` | `n/d` event counts | **90 days** | preview + platform-admin excluded; anonymous counted | **trustworthy since `d186f476`** | **DEFECT FIXED HERE** |
| `/dashboard/admin/matching` | superadmin | skill fit % | `computeContextFit` | matched ÷ need URIs | instant | one need's ESCO URIs | correct | VERIFIED_CORRECT |
| `/dashboard/opportunities` | worker | fit % | `computeContextFit` | same | instant | same | correct | VERIFIED_CORRECT |
| `/dashboard/company/scouting` | employer | fit % | `computeContextFit` | same | instant | same | correct | VERIFIED_CORRECT |
| `/dashboard/company/planning` | employer | zone coverage % | `clampPct` | covered ÷ required headcount | instant | one zone | stock ratio, not a flow rate | VERIFIED_CORRECT (convention documented in the item-4 ledger) |
| `/dashboard/admin/launch-readiness` | superadmin | **counts only** | live reads | — | current | — | **exemplary** | VERIFIED_CORRECT |
| `(marketing)/calculators/project-cost` | public | estimate | user input | user-supplied | n/a | n/a | not a measurement | OUT OF SCOPE |

**Why the fit surfaces are correct and not merely lucky:** `computeContextFit`
returns `null` for an empty need — *"no structure means no percentage"* — so the
zero-denominator case never reaches a renderer, and each surface renders the
percentage **with its basis** (`matchedTotal` / `needTotal`) rather than alone.
`/dashboard/opportunities` states the rule in its own comment: *explanation
first, never a standalone %*.

`/dashboard/admin/launch-readiness` is the strongest example in the codebase:
*"Every number is a live count… failed reads render '—'. No percentages, no
'ready' badges, no fabricated…"*. Counts, not rates, and a failed read is an em
dash rather than a zero.

## The defect (P1, admin-visible, fixed in this slice)

#1086 and #1088 made the funnel's **backend** honest. The **panel** then did:

```tsx
{r.pct === null ? "—" : `${r.pct}%`}
```

One dash for two genuinely different facts:

| fact | meaning | rendered before | rendered now |
|---|---|---|---|
| measured zero | 0 clicks over 100 landings — a real answer | `0%` | `0%` |
| `insufficient_data` | no landings yet; nothing to divide by | `—` | **`no data yet`** |
| `truncated` | a share exists but the read hit its cap | `—` | **`not stated`** |

And `r.note` — computed on every request since #1086, carrying both the meaning
of the rate and, when truncated, *why no share can be stated* — **was rendered
nowhere**. All of the honesty was in memory and none of it reached the screen.

A trustworthy backend behind a collapsing frontend is still a product defect.

## The fix

`FunnelRate` now carries an explicit `state: "ok" | "insufficient_data" |
"truncated"`, assigned in the **same single place** that decides whether a share
may be stated at all. The UI branches on that value rather than string-matching
the note, which would leave the distinction one refactor from collapsing again.
The note renders under every rate.

## State handling across the panel, after this slice

| state | where it lives | how it renders |
|---|---|---|
| `0` | a real measured rate | `0%` |
| `UNKNOWN` / `INSUFFICIENT_DATA` | `state === "insufficient_data"` | `no data yet` + note |
| `TRUNCATED` | `state === "truncated"` | `not stated` + note explaining the cap; counts shown as `≥ N`; page-level banner |
| `HISTORICAL_NOT_AVAILABLE` | pre-`d186f476` figures | not restated anywhere — the panel only ever shows the current window |
| `HISTORICAL_CONTAMINATION_UNKNOWN` | `funnel.historicalContaminationUnknown` | rendered **verbatim** under the funnel header |
| `MEASUREMENT_VALID_FROM` | — | the panel states the **90-day window** it queried; it never offers a comparison across the boundary, so no comparability is implied |

## Negative controls

Four injected collapses, each verified to actually apply before trusting the
result (the first attempt's patterns silently no-op'd, which would have read as
four false passes):

| injected | caught |
|---|---|
| UNKNOWN coerced to `0` / `ok` | ✅ |
| TRUNCATED merged into `insufficient_data` | ✅ |
| UI collapsed back to a single dash | ✅ |
| explanatory note removed from the UI | ✅ |
| *restored* | 10/10 green |
