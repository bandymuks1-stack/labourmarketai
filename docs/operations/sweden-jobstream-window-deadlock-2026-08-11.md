# Sweden supply stall — root cause and fix (2026-08-11)

Swedish vacancy supply stopped growing after `2026-08-09T20:06:15Z`. The stored
checkpoint recorded `page_fetch_failed` on every subsequent run, and the
snapshot channel had never succeeded at all.

Root-caused with live, read-only `GET` probes against the official JobTech API.
No secrets involved, no scraping — the published public endpoints only.

## The source was never down

Every probe returned `HTTP 200`, `content-type: application/json`, no redirect,
and no rate-limit header. All four date encodings we could plausibly send —
`2026-08-09T20:06:15.000Z`, `…T20:06:15`, `…T20:06:15Z`, `…T20:06:15.000` —
were accepted and returned byte-identical results. **Date-format and outage
theories are refuted.**

## Primary cause — an unbounded window against a byte cap, feeding itself

`jobstream.api.jobtechdev.se/stream` takes only a *start* bound (`date=`) and
answers with everything changed since that instant, in one un-paginated body.

| Request | Bytes | Elapsed |
|---|---|---|
| `?date=2026-08-09T20:06:15` (the stored checkpoint) | **33,415,133 (31.87 MiB)** | ~26 s |
| `?date=…&updated-before-date=2026-08-10T00:00:00` (≈3.9 h slice) | **538,564 (0.51 MiB)** | 0.6 s |

`VACANCY_IMPORT_BOUNDS.maxResponseBytes` is **16 MiB**, so the first request
failed as `response_too_large`.

The failure then fed itself. A failed run correctly refuses to advance the
checkpoint — but that means the next run asks for a *wider* window, gets a
*larger* response, and fails again. The gap grew roughly 16 MiB per day. **This
could never have recovered on its own; it was a deadlock, not an outage.**

`updated-before-date` is a real, honoured JobStream parameter — it is the lever
that fixes this. `to-date` and `date-to` are silently ignored (byte-identical
to sending nothing), which is what proves `updated-before-date` is genuinely
honoured rather than a coincidence of a quiet window.

## Secondary defects found in the same pass

1. **`/snapshot` exceeds the cap too** (>20 MiB and still streaming when the
   probe capped). The documented cold-start path was therefore blocked as well:
   no snapshot to bootstrap, no stream to continue. *Not fixed here — see Open.*
2. **The request timeout did not bound the transfer.** `vacancy-adapter.ts`
   cleared its abort timer as soon as `await fetch()` resolved — i.e. when the
   *headers* arrived (~130 ms) — leaving `res.arrayBuffer()` unbounded. The
   declared `requestTimeoutMs: 20_000` only ever bounded time-to-first-byte, so
   a stalled body could hang indefinitely. Now cleared in `finally`.
3. **The discriminating failure code was erased.** Every transport failure logs
   the same `page_fetch_failed` code with the real classification in `detail`;
   the runner wrote only the code into `vacancy_import_cursors.last_failure_code`.
   The operator therefore saw `page_fetch_failed` for every possible cause —
   which is exactly why this needed a live diagnostic session to classify. The
   detail is now preserved (`page_fetch_failed:response_too_large`).

## Why the checkpoint could not stay on publisher timestamps

The stream filters on an *update* axis. No field in the payload reproduces it:

- `publication_date` (what `computeNextVacancyCursor` used, via `publishedAt`):
  in one 3.9 h slice, **51.7 % of the 83 records were published before the slice
  start**, the oldest by 11 days (`2026-07-29`). Trusting it rewinds the walk
  into a permanent replay.
- `timestamp`: spans `2026-06-18` → `2026-08-10T19:24` — outside the requested
  window end — and **0 of the 23 withdrawal deltas carry one**.
- A withdrawal delta carries no publication date at all, so the parser falls
  back to `publishedAt: capturedAt`, our own run clock. Any batch containing one
  would jerk the checkpoint to "now" and **silently skip** everything between.
  That is data loss, not merely a replay, and it explains why the stored
  checkpoint looked like a run time rather than a publication time.

So a windowed channel checkpoints on **the end of the last slice it consumed in
full** — the one bound we actually asked for and were completely answered on.

## The fix

- The registry gains a `time_window` pagination mode. The Swedish `stream`
  channel declares a 3 h slice (measured ~0.4 MiB, two orders of magnitude under
  the cap) and a 60 s safety lag. The publisher's parameter *names* live in the
  descriptor, so no shared stage learns JobTech's vocabulary and adding a
  country stays a one-entry change.
- `planVacancyWindows` (pure) slices `[checkpoint, now − lag)` into abutting
  windows, capped at `maxPagesPerSession`.
- The importer walks the slices, moving the checkpoint by exactly one consumed
  slice at a time, and reports `caughtUp` so a truncated catch-up cannot read as
  "current".
- A slice that fails leaves the *already consumed* slices consumed
  (`partialCursor`), while still recording the failure and incrementing the
  failure streak. Without this, one permanently bad slice would pin the
  checkpoint and rebuild the same deadlock.
- The safety lag keeps the newest slice edge away from the present, so a record
  written a moment after a slice closed is not skipped by the checkpoint.

Backlog drain rate: 50 slices × 3 h = **6.25 days of backlog per session**.

## Open

- `/snapshot` remains above the 16 MiB cap, so cold start from a null checkpoint
  is still blocked. Raising the shared ceiling would weaken the bound for every
  provider, so the correct fix is an incremental/streaming reader — deliberately
  not bundled here. Not currently blocking: the Swedish checkpoint is non-null,
  so the walk resumes without it.
