# Market Map Data Model v1 — audit

Read-only audit grounding the owner-gated migration proposal
`supabase/migrations/20260617120000_market_map_data_model_v1.sql`.
**No migration has been applied.**

## What location data already exists (verified via information_schema)
| Table | Location fields present | Use today |
|---|---|---|
| `profiles` | `country` | profile_location signal (#457) |
| `companies` | `country`, `address`, `registration_code` | company_location signal (#457) |
| `workers` | `current_location_country`, `preferred_countries text[]`, `willing_to_relocate`, `needs_accommodation`, `has_transport`, `max_trip_days`, `team_available`, `solo_available`, `availability_status`, `available_from`, `salary_min_eur`, `salary_max_eur` | worker country + preferred (#457) |
| `company_demand_locations` | `country_code`, `region`, `city`, `locality`, `address_text`, `geo_precision`, `geocode_status`, `source`, `request_id`, `owner_id` | demand signal (#457) |
| `customer_requests` | `country`, `location` (free text) | demand source |
| `projects` | `country`, `city`, `start_date`, `end_date`, `housing_provided`, `status`, `company_id` | not yet on map |

## Which signals can be shown WITHOUT a migration (already shipped in #457)
- `profile_location` (profiles.country)
- `company_location` (companies.country)
- `preferred_location` — **shallow**: only the `preferred_countries[]` array (no region/city, no intent, no per-location visibility)
- `company_need_location` (company_demand_locations, country-grouped)

## What is missing → needs the migration
1. **preferred_locations** — a dedicated multi-row table with intent
   (work / find_job / sell_services / buy_services / join_team / hire_team /
   project_interest / relocate / remote_if_possible), region/city, granularity,
   priority, per-location visibility, and a `confirmed_by_user` flag. Today's
   `workers.preferred_countries[]` cannot express intent or visibility.
2. **consented_login_location_signals** — there is **no** login-location source
   today. New, consent-gated, **approximate only** (country/region/city; no
   lat/lng/address columns exist by design).
3. **company need shape** — `company_demand_locations` exists but lacks
   need_type, people counts, dates, urgency, mobility/accommodation, granularity,
   visibility, active → **additive columns** (no new table, no duplication).
4. **project location detail** — `projects` already has country/city → add
   `granularity`, `location_confirmed`, `visibility_level` (**additive**); no new
   table needed (argument: reuse avoids a parallel project-location store).
5. **visibility_level** — no signal carries a visibility level today; the
   migration adds it to every new/extended signal table.

## Privacy risks (addressed by the migration + privacy plan)
- Login location could leak an exact point → mitigated structurally: the login
  table has **no** lat/lng/address columns, and is consent-gated + self/admin
  read only.
- Registration vs. desire conflation → separate tables (`preferred_locations`
  is not `profiles`/`companies`).
- Over-exposure of private rows in a public/aggregated map → every row carries
  `visibility_level`; the read layer (next step) must filter.

## RLS rules required (see rls-plan)
- Owner-scoped read/write on both new tables (`profile_id = auth.uid()`),
  admin read via `public.is_admin()`, **no anon/public**, grants to
  `authenticated` only — mirrors `company_demand_locations` (20260615120000).

## Visibility classification per signal
| Signal | Default visibility |
|---|---|
| profile_location | self_only (aggregated for public map) |
| company_location | company_only |
| login_location | self_only, consent-gated |
| preferred_location | self_only (user may raise to region/city/aggregated) |
| company_need_location | company_only (owner may raise to aggregated/region) |
| project_location | company_only |
| skill_density / supply_demand / opportunity | aggregated only |
| evidence / risk | admin_only / internal |

## Conclusion
A migration **is** required for `preferred_locations` (with intent + visibility)
and `consented_login_location_signals`; the company-need and project layers only
need **additive columns**. The proposal is additive, reversible, owner-scoped,
and owner-gated. **It must not be applied without owner sign-off.**
