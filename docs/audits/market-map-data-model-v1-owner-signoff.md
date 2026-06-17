# Market Map Data Model v1 — OWNER SIGN-OFF (DB migration gate)

**Status: PREPARED, NOT APPLIED.** This migration is owner-gated. It has **not**
been run against any database. Nothing applies until you answer the question at
the bottom.

Migration: `supabase/migrations/20260617120000_market_map_data_model_v1.sql`
Rollback:  `supabase/rollbacks/20260617120000_market_map_data_model_v1.down.sql`

## What the migration creates / changes
**Two new tables:**
- `public.preferred_locations` — a person's desired locations + intent
  (work / find_job / sell_services / buy_services / join_team / hire_team /
  project_interest / relocate / remote_if_possible), with granularity, priority,
  per-row `visibility_level`, and `confirmed_by_user`. Distinct from registration.
- `public.consented_login_location_signals` — approximate, consent-gated login
  area. Country/region/city only — **no latitude/longitude/address columns**.

**Two additive extensions (no data rewrite):**
- `public.company_demand_locations` += `granularity, need_type, people_count_min,
  people_count_max, start_date, end_date, urgency, mobility_required,
  accommodation_needed, active, visibility_level`.
- `public.projects` += `granularity, location_confirmed, visibility_level`.

## Why it's needed
The map currently only has country fields from profile/company. To show desired
locations, real (approximate) login signal, richer company needs, and projects —
with privacy/visibility rules and future plan-gated detail — these stores are
required. Today's `workers.preferred_countries[]` can't express intent or
visibility, and there is no login-location source at all.

## Privacy / risk limits (built in)
- Login location can never be exact (no lat/lng/address columns) and is
  consent-gated; `revoked` hides it.
- Owner-scoped RLS on both new tables; no anon/public; grants to `authenticated`
  only; no `using (true)`; no new SECURITY DEFINER function.
- Additive only — no drop/rename/backfill of existing columns; existing RLS
  untouched. Fully reversible via the rollback file.

## What is NOT in this migration (deliberately)
- No public/aggregated **read layer** (`market_map_signal_view` / RPC) — that's
  the next, separate step, with its own visibility-filter tests.
- No UI wiring to the new tables yet (the #457 UI stays valid meanwhile).
- No billing/plan enforcement, no auth changes, no env/secret/Vercel changes,
  no PostGIS/geocoder, no fake data.

## How it would be applied (only after approval)
Per `CLAUDE.md`: **never** `supabase db push`. Apply via **Supabase MCP
`apply_migration`** after your approval, then smoke (insert an own row, confirm
RLS denies another user, confirm login table rejects exact coords by absence),
then regenerate `apps/web/lib/supabase/types.ts`.

## How to roll back
Run `supabase/rollbacks/20260617120000_market_map_data_model_v1.down.sql` via the
same MCP path: it drops the two new tables and the added columns, returning the
schema to its current shape. The new tables are additive, so the reversal is clean.

## Owner question (required before any apply)
> **Ar leidžiate taikyti šią DB migraciją (20260617120000_market_map_data_model_v1) į production?**
> **Do you approve applying this DB migration to production?**

- **Reply "taip / approve"** → I apply it via Supabase MCP `apply_migration`,
  smoke it, regenerate types, and report.
- **Reply "ne / not yet"** → it stays prepared-only; nothing is applied.
- Want changes to the schema first? Tell me and I'll revise the proposal before
  any apply.
