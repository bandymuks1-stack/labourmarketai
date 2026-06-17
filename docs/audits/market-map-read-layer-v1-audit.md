# Market Map read layer v1 — architecture audit

Decides the safest read-layer shape for normalizing Market Map signals
(profile / company / preferred / login / company-need / project) into one format
with visibility + min-bucket aggregation rules. **No UI. No new DB migration.**

## Options considered
| Option | Pros | Cons / blockers |
|---|---|---|
| **DB VIEW** | one query | can't express consent-gated login filtering + min-bucket aggregation cleanly; cross-user reads need it to be SECURITY DEFINER (privilege) → **new migration + RED review** |
| **SECURITY DEFINER RPC** | can read across users for aggregation | new migration, privileged function, owner-gated; heavier review; only needed for the *cross-user/public* aggregate |
| **TS service layer** (chosen) | matches existing repo practice (`lib/market-map/self-signal.ts`, `lib/demand/demand-location.ts` already read RLS-scoped tables + normalize in code); no migration; pure, fully unit-testable visibility/aggregation engine | cannot read *other users'* rows (RLS) → a true cross-user/public aggregate needs a future privileged source |

## Decision
**TypeScript service layer**, in two parts:
1. **A pure engine** (`lib/market-map/signals.ts`) — normalization + the visibility
   filter + the min-bucket aggregation, as side-effect-free functions. This is the
   reviewable, fully-tested core and ships now.
2. **An owner-scoped fetcher** (`getOwnMarketSignals()`) — reads the CALLER'S OWN
   rows via the existing RLS-scoped Supabase client (profiles, companies,
   preferred_locations, consented_login_location_signals, company_demand_locations,
   projects) and returns them normalized (the "my signals" / self view). RLS
   guarantees it only ever returns the caller's own rows.

## What is NOT in this PR (and why)
- **Cross-user / public aggregated fetch.** RLS blocks reading other users' rows
  with the user/anon client, so a real market-wide aggregate needs a future
  **owner-gated SECURITY DEFINER RPC** (or service-role read) as its source. The
  aggregation ENGINE is built and tested here against synthetic rows, but no
  cross-user/public aggregated output is fetched or shipped — satisfying "no
  public aggregated output without tests" and "no new migration this sprint".
- **UI wiring** — separate next PR.

## Conclusion
No DB migration is required for v1: the engine + self-view fetcher run entirely on
the existing RLS-scoped tables. The cross-user aggregate is explicitly deferred to
a future owner-gated RPC; this PR ships the tested engine + self view only.
