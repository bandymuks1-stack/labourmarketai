# Sweden supply — RESTORED, 2026-08-13 (V8 train)

**Verdict: the stream is CAUGHT UP.** `87 → 7092` stored rows, cursor walked
from `2026-08-09T20:06Z` to `2026-08-13T06:12Z`, `caughtUp: true`,
`consecutive_failures: 0`. Freshness on the board is now real, not disclosed
staleness.

Operator authorization: the V8 train directive (§24) explicitly delegated the
service-role execution path and the provider env switch for this catch-up.
Every run went through `apps/web/scripts/vacancy-operator-run.ts` — the same
runner as the admin console, dry-run first, no manual SQL, no scheduler
installed.

## Production truth after the run (VERIFIED_DB, read-only)

| Fact | Value |
|---|---|
| `public_vacancies` (arbetsformedlingen) | **7092** |
| `is_active` | 7088 |
| `lifecycle = 'removed'` | 4 (live withdrawals, applied as narrow updates) |
| `import_session_id` threaded | 7008 / 7092 (the 84 rest are the pre-threading legacy set) |
| newest `last_seen_at` | `2026-08-13 06:13Z` |
| distinct import sessions | 6 |

## The catch-up surfaced three latent persist-layer defects — all fixed, merged same day

Each failure was SAFE: the cursor never advanced on a failed run, and re-runs
re-classified already-written rows instead of double-counting them.

1. **#1135 — existence read outgrew the URL.** The exact-accounting read sent
   every batch id through one `.in()` filter; past ~8 KB the gateway rejects
   the URL with a non-PostgREST error (empty code). 755 ids squeaked under the
   line, the next window did not. Reads now travel in 200-id chunks.
2. **#1137 — a withdrawal is not a rewrite.** Stream removal records carry no
   body (the validator admits titleless removals on purpose, #1121), and the
   full-row upsert handed the table an empty `title_raw` its own `1..300`
   bound refused (23514). Withdrawals are now a narrow lifecycle UPDATE; the
   last published content stays as history; absent-ad withdrawals surface in a
   new `withdrawnAbsent` count instead of failing or vanishing.
3. **#1138 — write arms outran the statement timeout.** A single ~2 500-row
   upsert hit 57014. Writes now travel in 500-row idempotent chunks.

The lesson worth keeping: **dry runs cannot prove the persist path.** All
three defects lived exclusively in code a dry run never executes. The first
dry run of the day was flawless and the first three persist attempts each
failed differently.

## Honest limitation, unchanged

`translationsRequested 993 / translationsAvailable 0` on the first window
(and equivalents after): the operator environment has no translation provider
configured, so Swedish ads are stored in Swedish with `translation_status`
reflecting exactly that. The board's language-fallback rendering handles it;
nothing pretends to be translated (V8 §56).

## Cadence note for the next operator

There is still NO scheduler, by doctrine — supply freshness decays again from
this moment. Either an operator re-runs the stream channel periodically
(each run is now bounded and self-healing), or the owner decides a scheduled
execution path. That decision is NOT made here.
