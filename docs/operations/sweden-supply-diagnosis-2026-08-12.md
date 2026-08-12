# Sweden supply — why the board is 3 days stale, diagnosed 2026-08-12

**Verdict: the importer is NOT BROKEN. It is NOT BEING RUN.**

Previous windows recorded the symptom (87 stale rows, `page_fetch_failed`) but
could not separate "our code is broken" from "nobody executed it". This note
settles it with positive evidence, so the next operator does not re-audit it.

## Production state (VERIFIED_DB, read-only, 2026-08-12)

| Fact | Value |
|---|---|
| `public_vacancies` | 87 rows, provider `arbetsformedlingen`, **87/87 `is_active`** |
| `import_session_id` | **0 distinct — all 87 NULL** (predate session threading) |
| newest `last_seen_at` | `2026-08-09 20:05:32Z` — **3 days 01:46 stale** |
| cursor `stream` | `cursor_value` `2026-08-09T20:06:16.997Z`; last SUCCESS `2026-08-09 20:06Z`; last RUN `2026-08-10 16:11Z` → `page_fetch_failed`; `consecutive_failures` 1 |
| cursor `snapshot` | `last_success_at` **NULL — never succeeded**; last run `2026-08-09 19:50Z` → `page_fetch_failed` |

The decisive number is `last_run_at` on the stream channel: **2026-08-10
16:11Z**. Nothing has attempted an import for over two days. A crash loop would
show a recent `last_run_at` and a climbing `consecutive_failures`; both say
otherwise (`consecutive_failures` is 1).

## The upstream API is healthy (VERIFIED_EXTERNAL, 2026-08-12)

The exact bounded request the fixed importer would issue for the window the
cursor is parked at:

```
GET https://jobstream.api.jobtechdev.se/stream
      ?date=2026-08-09T20:06:16.997Z
      &updated-before-date=2026-08-09T23:06:16.997Z
```

answered **HTTP 200** with a small JSON array (~13 ads) carrying the expected
schema (`id`, `headline`, `employer`, `webpage_url`, `removed`, `removed_date`,
`publication_date`, `timestamp`, …).

That single result closes three questions at once:

1. **The endpoint is up** and needs no API key.
2. **The time-window fix works.** `updated-before-date` is honoured, and a 3 h
   slice returns kilobytes — nowhere near the 16 MiB transport cap that caused
   the original 31.9 MiB deadlock. The registry is already configured for this
   (`pagination: "time_window"`, `widthSeconds: 3 * 60 * 60`).
3. **`page_fetch_failed` on 2026-08-10 is stale.** It is not reproducible
   against the live API today, so it should not be treated as an open code
   defect. Most likely a transient network/transfer failure on that one run —
   and note a failed run correctly did NOT advance the checkpoint, which is the
   invariant working as designed.

## Why nothing runs: this is by design, not an outage

`apps/web/scripts/vacancy-operator-run.ts` states the doctrine plainly:

> "there is NO scheduler; every invocation is a deliberate human act"

Import happens only when an operator presses the admin console button or runs
that script. Both paths need:

* the **production service-role key** in the invoking environment, and
* the provider env switch `VACANCY_SOURCE_<KEY>_ENABLED`, deliberately not set
  by the script — "the env flip stays an explicit operator act".

An agent session has neither and must not go looking for them. **Sweden supply
is therefore CONFIGURATION_GATED on an operator action, not blocked on
engineering.**

## Exact operator action to restore supply

From a current checkout, with the production service-role key and the provider
switch present in the environment. **Dry run first** — it writes nothing:

```bash
pnpm tsx --conditions=react-server scripts/vacancy-operator-run.ts --provider arbetsformedlingen --channel stream --mode dry_run
```

Only if the dry run reports a sane fetch/parse accounting, persist:

```bash
pnpm tsx --conditions=react-server scripts/vacancy-operator-run.ts --provider arbetsformedlingen --channel stream --mode persist --apply --i-understand-this-writes-production
```

The stream cursor is parked at `2026-08-09T20:06:16.997Z`, so the walk has a
~3-day backlog to drain in 3 h slices. Expect several slices; each failed slice
must leave the checkpoint where it was.

### What to verify afterwards (do not skip)

* `import_session_id` is **non-NULL on newly written rows** — today 87/87 are
  NULL, so this is the signal that the session-threaded importer really ran;
* `last_seen_at` moves to today;
* the cursor's `last_success_at` advances and `last_failure_code` clears;
* **withdrawals are honoured** — ads with `removed: true` must deactivate, not
  linger as `is_active`; today 87/87 are active, which is exactly the state a
  worker should not be shown as current;
* publisher attribution and the original apply URL survive on new rows;
* no SEK→EUR conversion appears anywhere.

## What is already honest while supply is stale

#1128 shipped the freshness notice, and this diagnosis confirms its premise is
still accurate: the board states how old the external listings are rather than
implying they are current. The staleness is disclosed; it is the *supply* that
is missing.

## Not done in this window

* `/stream` → `/v2/stream` migration was NOT attempted. `/stream` answers 200
  today with the parameters in use, so this is an optimisation, not a fix, and
  it needs official contract evidence for the v2 parameter semantics before
  anything changes.
* No import was executed (no service-role key, correctly).
