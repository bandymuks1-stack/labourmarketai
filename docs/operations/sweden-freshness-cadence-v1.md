# Sweden supply freshness cadence — design + gate (V8 §10, 2026-08-13)

## Why there is no scheduler today
`vacancy-operator-run.ts` doctrine: "there is NO scheduler; every invocation
is a deliberate human act". That rule existed because the persist path was
unproven and a scheduler would have automated an unverified writer against
production. That premise CHANGED on 2026-08-13: the full catch-up ran to
`caughtUp: true` (87→7092), three latent persist defects were found and fixed
(#1135/#1137/#1138), and every failure mode observed left the cursor honest.
The importer is now a proven, bounded, idempotent, self-healing operation.

## Requirement (owner, V8 continuation §10)
Public launch cannot depend on "maybe someone remembers to run the import".
Periodic safe freshness is REQUIRED before PUBLIC_LAUNCH_READY.

## Design — reuse the canonical runner, add ONLY a trigger
No new importer, no relaxed gate. The scheduled path invokes EXACTLY
`vacancy-operator-run.ts --provider arbetsformedlingen --channel stream
--mode persist --apply --i-understand-this-writes-production` with the same
env gates (`VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED` + service key).

Candidate trigger (recommended): **GitHub Actions scheduled workflow**, cron
`17 5,11,17 * * *` (3×/day, off-peak minutes), concurrency group so runs
never overlap, 15-min timeout, each run uploads the JSON accounting as an
artifact. Kill switch = deleting one repo variable
(`VACANCY_SCHEDULE_ENABLED`), checked as the first step. Failure = red
workflow + the cursor's own `consecutive_failures` (which the admin console
already shows). Provider cadence limits are far above 3/day (JobStream is
built for frequent polling; the registry's own `VACANCY_CHANNEL_CADENCE`
stays authoritative in-code).

## CONFIG GATE (blocks activation — record and continue)
Requires TWO owner actions that an agent must not perform:
1. `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` as GitHub
   Actions **secrets** (new secret placement = owner-only per doctrine);
2. repo variables `VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED=true`,
   `VACANCY_SCHEDULE_ENABLED=true` (the env flip stays an explicit owner act).
The workflow file itself can ship inert (it no-ops without the secrets), so
the code side is unblocked; activation is exactly those two console actions.

## Until activated
Freshness decays from 2026-08-13 06:12Z. Interim honest state: the board
discloses listing age (#1128), and any operator can re-run the bounded
command above at any time.
