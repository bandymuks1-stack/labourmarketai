# W14 item 5 — synthetic / QA exclusion

Re-derived from `main @ 4c4ec278`. The three findings carried forward from
#1086 were checked against current code before anything was changed; one of
them turned out to be materially different from how it had been written down.

## What the historical notes said, and what is actually true

| carried-forward claim | verified state |
|---|---|
| "exclude admins does not feed the funnel" | **Confirmed.** `excludeAdmins` is a `searchParams` flag applied at `telemetry/page.tsx` to the event **table** only; `getAcquisitionFunnel` runs its own read and never sees it. |
| "owner/admin navigation can count as real traffic" | **Confirmed**, and it was the *only* identity-based exclusion available anywhere. |
| "production acceptance activity is not distinguishable from real visitors" | **Partly wrong, and the real problem was worse.** `dev:acceptance` refuses any non-local Supabase target, so the acceptance harness never writes to production. But `pnpm dev` loads `.env.local`, which **does** point at the production project — and the actual gap was that `preview_host` was stamped by the CLIENT emitter only. |

### The finding that was not in the notes

`trackFunnel` (client) stamped `preview_host` from `window.location.hostname`.
`emitServerFunnelEvent` (server) stamped **nothing** — it has no `window`.

So one localhost or preview session produced **half-marked telemetry**: its
client events (`landing_viewed`, `cta_clicked`, `registration_started`) were
excluded from the funnel, and its server events (`match_preview_generated`,
`shortlist_added`, `contact_requested`, `booking_proposed`,
`engagement_created`) were counted as production. Every mid-funnel rate was
computed over a population the top-of-funnel rates had already filtered.

Combined with `.env.local` pointing at production, **ordinary local
development was writing counted rows into the owner's production funnel.**

## Populations

| population | classifiable? | evidence | counts in a business metric? |
|---|---|---|---|
| `identified_user` | **deterministic** | `profile_id` set, not in admin set | ✅ |
| `admin` (owner / staff) | **deterministic, retroactive** | `profile_id` ∈ `profile_roles.role='admin'` ∪ `profiles.active_role='admin'` | ❌ |
| `preview` (localhost / preview deploy) | **deterministic, prospective** | `metadata.preview_host` — now from **both** emitters | ❌ |
| `anonymous` | **not classifiable** | `profile_id IS NULL` | ✅ — see below |

`OWNER`, `INTERNAL_TEAM`, `AUTOMATED_ACCEPTANCE` and `SYNTHETIC_QA` are **not**
separate populations in the data. There is no marker for them, and none was
invented: owner and staff collapse into `admin` when authenticated, and are
indistinguishable from a real visitor when not.

**Classification capability: (C) partially deterministic.** Deterministic for
authenticated internal activity and for non-production origins; impossible for
logged-out internal browsing without a new marker, which would need a schema or
emitter change beyond this slice.

## Why `anonymous` counts

Most top-of-funnel events fire before sign-in, so `profile_id` is NULL by
design. Excluding anonymous would empty the denominator of every acquisition
rate. It counts — and the internal browsing it therefore hides is stated on the
panel rather than quietly claimed as clean.

## The symmetry requirement

An identity filter can only remove **authenticated** activity. Applied to a rate
whose numerator is authenticated and whose denominator is anonymous, it would
shrink the top and leave the bottom — **deflating** the rate rather than
cleaning it, replacing one wrong number with a differently wrong one.

`RATE_AUTH_PROFILE` records the authentication profile of every funnel event,
and a test asserts that all seven rates compare two events of the **same**
profile. That property is what makes one uniform rule safe here; it is verified,
not assumed, and a future rate that mixes profiles will fail the test.

## What changed

1. **One host rule** — `lib/telemetry/production-host.ts`, shared by the client
   emitter and (new) the server emitter, which now stamps `preview_host` from
   the request's own `Host` header. Not `VERCEL_ENV`: a missing or mistyped
   value would silently reclassify the entire funnel, and an unreadable header
   yields `{}` so the row stays counted — a header failure can never blank the
   owner's funnel.
2. **One population boundary** — `lib/analytics/population.ts`. The funnel now
   selects `profile_id`, resolves the admin set, and filters every event
   through `isBusinessFunnelCountable`. A metric added later inherits the rule
   by calling it rather than by remembering a filter.
3. **The event inbox keeps its opt-in `excludeAdmins` checkbox** — it is a
   debugging surface and should stay raw. The *business metric* excludes by
   default. That asymmetry is deliberate.
4. **The panel states both exclusion counts and the contamination caveat**
   verbatim.

A failed admin read yields an **empty** admin set — exclude nobody, the
pre-existing behaviour. Failing the other way would silently delete real
traffic; an inflated number is visibly suspicious, a deflated one is not.

## Historical truth

`HISTORICAL_CONTAMINATION_UNKNOWN` is rendered on the panel. Two reasons, and
they expire differently:

- **logged-out internal browsing** is indistinguishable from a real visitor in
  any row, past or future. **Never expires.**
- **server-emitted events carried no preview marker** before this change, so
  preview/localhost mid-funnel activity was recorded as production. **Stops
  accruing at `MEASUREMENT_VALID_FROM`.**

Admin exclusion **is** retroactive — `profile_id` is stored and the admin set is
current — so it applies to historical rows as well as new ones.

`MEASUREMENT_VALID_FROM` = the deploy of this change. Nothing was deleted,
nothing was backfilled, and no historical figure is restated as clean.
