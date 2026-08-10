# Vacancy source continuation design v1 — measured, then designed

Date: 2026-08-10. Status: DESIGN + first measurements; no cap was raised.

## Measured real behaviour (Arbetsförmedlingen, 2026-08-09/10)

| Fact | Measured value |
|---|---|
| `/snapshot` (full country, single response) | Does NOT fit the first-run bounds: request failed at the 16 MB / 20 s single-response caps (`page_fetch_failed`, 0 bytes counted, 0 retries → non-transient classification). The links feed reports **43,604** live ads country-wide, so the full snapshot is far beyond a single bounded response by design. |
| `/stream?date=<8h ago>` (Sunday window) | 200 OK, **702 KB**, 273 records = 87 live ads + 186 `removed:true` tombstones; parsed 273/273; one page; well inside every bound. |
| `/joblinks` (offset/limit) | 200 OK, paged (100/page cap × 50 pages/session), reports `total.value` — usable for volume telemetry without a full read. |
| Session accept cap | 5,000 (`maxAcceptedPerSession`) — never approached; the 8h stream window accepted 87. |

## The continuation model that follows from the measurements

1. **Cold start = operator cursor SEED at a recent instant** (an explicit,
   recorded act — done 2026-08-09 at `2026-08-09T12:00:00Z`), NOT a
   full-country snapshot. The checkpointed stream then reads a small bounded
   delta window.
2. **Steady state = stream continuation from the stored cursor.** Each run
   covers only what changed since the last successful persist run; the runner
   already refuses to advance the cursor past an unfetched page. Weekend
   day-volume measured at ~300–600 records/day → single-page runs for the
   foreseeable operator cadence.
3. **Backfill (the remaining ~43k historical actives) is a SEPARATE,
   owner-gated decision.** Options, in preference order:
   a. repeated `links` sessions (paged, ≤5,000 accepted/session → ~9 sessions
      to cover Sweden) storing the links-shape record (headline, employer,
      location, canonical URL — no description by feed design);
   b. a snapshot-specific bound raise (response cap only, temporarily, one
      run) — rejected for now: it weakens the deliberate first-run safety and
      the stream already grows coverage forward.
   Neither is activated; the cap stays 5,000 and the byte/time caps stay as
   shipped. Raising any of them is a one-line, owner-reviewed change.
4. **Accounting stays per-session and exact** (inserted/updated/unchanged
   from the repository partition; scanned = accepted + rejected + duplicated
   from the importer). Nothing in the continuation design adds arithmetic.

## Operator runbook (as proven in production)

- Dry run: `pnpm tsx --conditions=react-server scripts/vacancy-operator-run.ts --provider arbetsformedlingen --channel stream --mode dry_run`
- Import: same with `--mode persist --apply --i-understand-this-writes-production`
- Stop everything instantly: `VACANCY_IMPORT_KILL_SWITCH=on` (env, no deploy).
- The admin console buttons (`/dashboard/admin` vacancy section) call the SAME
  runner with the same gates.

First real import (2026-08-09): 87 inserted / 0 updated / 0 unchanged from
274 scanned (187 tombstone rejections); second run over the same window: 87
duplicates, 0 inserted — idempotency proven. Production rows: 87, all SE, all
attributed, unique on (provider, external_id).
