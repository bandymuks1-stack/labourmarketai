# Pre-apply RED review — company demand locations v1 (PR #423)

> **Status:** RED draft — migration **NOT applied**. This is the pre-apply
> review the owner requested. **No apply / no merge / no deploy** without the
> owner's explicit word. Apply path is **Supabase MCP `apply_migration` only** —
> never `db push` (repo filenames don't match the prod ledger).

## 1. Migration + rollback re-check

| Check | Result | Evidence |
|-------|--------|----------|
| Rollback drops only the NEW additive table | ✅ | `20260615120000_company_demand_locations.down.sql` = `drop table if exists public.company_demand_locations;` — nothing else |
| No destructive change to existing objects | ✅ | forward migration is `create table if not exists` + indexes + RLS + one grant; no drop/rename/alter/backfill of `customer_requests` or any table |
| No anon / public grant | ✅ | grant is `… to authenticated` only; no `to anon`, no `to public`, no `service_role` |
| RLS enabled before use | ✅ | `alter table … enable row level security;` precedes both policies and the grant |
| owner/admin read + owner write matches existing model | ✅ | mirrors `demand_shortlist` (20260612220000): select `owner_id = auth.uid() or is_admin()`, write `for all` owner-scoped. (Parent `customer_requests` uses RPC-only insert; see §6 limitation.) |

## 2. owner_id / profile_id / request spoofing

- **Owner source.** `customer_requests.profile_id` (migration 0028) is the demand
  owner — FK to `profiles(id)`, the same identity `auth.uid()` returns. Correct
  owner source. ✅
- **owner_id spoofing.** `company_demand_locations.owner_id` is gated by
  `WITH CHECK (owner_id = auth.uid())` → a caller **cannot** insert/update a row
  with anyone else's `owner_id`. ✅
- **request_id spoofing — HARDENED in this review.** The original WITH CHECK only
  pinned `owner_id`. It now **also** requires the referenced demand to belong to
  the caller:
  ~~~sql
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.customer_requests cr
                where cr.id = request_id and cr.profile_id = auth.uid())
  )
  ~~~
  So a caller cannot attach a location to **someone else's** `request_id`, even
  with their own `owner_id`. The subquery is itself RLS-filtered, so it is
  defence in depth. ✅ (Guarded by `market-map-demand-locations.test.ts`.)

## 3. CHECK constraints — no path for fake markers

| Constraint | Effect |
|------------|--------|
| `coords_valid` | lat/lng **both-or-neither** + WGS84 ranges (`lat ∈ [-90,90]`, `lng ∈ [-180,180]`). A half-pair or out-of-range is rejected. |
| `coords_require_verification` | `latitude is null OR geocode_status in ('verified','manual')` → coordinates can exist **only** on a verified/manual row; `pending`/`failed`/`not_required` rows can never carry coordinates → **no random points**. |
| `precision_matches_coords` | `geo_precision = 'coordinates'` ⟹ coordinates present. |
| Net | A point can only exist when deliberately confirmed (verified/manual). City/country-only rows hold **no** coordinates and are never plottable. |

## 4. App / read model

- `isMappableDemandLocation()` returns true **only** when lat **and** lng are
  non-null **and** `geocodeStatus ∈ {verified, manual}`. City/country-only or
  pending rows → `false`. ✅
- `summarizeDemandLocations()` returns counts only (`total`, `withCoordinates`,
  `mappable`, `signalOnly`, `byCountry`) — it **never synthesizes a point**;
  unverified/text-only rows surface as `signalOnly`, i.e. status/aggregate. ✅
- `market-map-shell.tsx` renders an **empty canvas** and a "schema prepared"
  demand layer — **no markers at all** today. ✅
- **fake marker data = 0**, **fake coordinates = 0** (guards:
  `market-map-demand-locations.test.ts`, `market-map-foundation.test.ts`).

## RLS policy matrix

| Action | Role | Predicate | Result |
|--------|------|-----------|--------|
| SELECT | authenticated (owner) | `owner_id = auth.uid()` | sees only own rows |
| SELECT | authenticated (admin) | `public.is_admin()` | sees all (admin diagnostics) |
| SELECT | anon | — | **no policy → denied** |
| INSERT | authenticated | `owner_id = auth.uid()` AND own `request_id` | only onto own demand |
| UPDATE | authenticated | USING `owner_id = auth.uid()` + CHECK own `request_id` | only own rows, stays on own demand |
| DELETE | authenticated | `owner_id = auth.uid()` | only own rows |
| any | anon / public / service_role | — | **no grant → denied** |

## Allowed / blocked user cases

| Case | Outcome |
|------|---------|
| Owner adds a location to **their own** demand | ✅ allowed |
| Owner reads **their own** demand locations | ✅ allowed |
| Admin reads any demand location (diagnostics) | ✅ allowed |
| User attaches a location to **another user's** `request_id` | 🚫 blocked (WITH CHECK exists-clause) |
| User inserts a row with **another user's** `owner_id` | 🚫 blocked (WITH CHECK owner_id) |
| User reads **another user's** demand locations | 🚫 blocked (SELECT owner-scoped) |
| Anonymous/public reads or writes | 🚫 blocked (no anon/public policy or grant) |
| Any row stores **coordinates while `pending`/`failed`/`not_required`** | 🚫 blocked (CHECK) |
| Half a coordinate pair, or out-of-range lat/lng | 🚫 blocked (CHECK) |

## Rollback command

~~~sql
begin;
drop table if exists public.company_demand_locations;
commit;
~~~
(`supabase/rollbacks/20260615120000_company_demand_locations.down.sql`)

## EXACT apply command — run ONLY after the owner's explicit apply approval

Apply via **Supabase MCP `apply_migration`** against project
`gorgitwvdzxbnaxhrsrw`, name `20260615120000_company_demand_locations`, with the
SQL body of `supabase/migrations/20260615120000_company_demand_locations.sql`
(strip the `-- @human-gate-approved` / header comments; keep the `begin … commit`
body). **Do NOT** run `supabase db push`. No other command.

## EXACT smoke after apply

SQL (read-only verification):
~~~sql
-- 1. table exists + RLS on
select relrowsecurity from pg_class where relname = 'company_demand_locations';      -- expect: t
-- 2. exactly two policies (select + write)
select polname, polcmd from pg_policy
 where polrelid = 'public.company_demand_locations'::regclass order by polname;        -- expect: select, write(all)
-- 3. grants are authenticated-only (no anon/public/service_role)
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='company_demand_locations' order by 1,2;   -- expect: authenticated only
-- 4. no rows
select count(*) from public.company_demand_locations;                                  -- expect: 0
~~~

App smoke (no behaviour change expected — write path not built yet):
- `/lt`, `/en`, `/ru` → 200
- `/lt/dashboard/market-map` → 307 (auth-gated), demand layer still "schema prepared", **0 markers**
- `/robots.txt`, `/sitemap.xml` → 200

## Confirmations
Supabase apply **0** · DB mutation **0** · merge **0** · deploy **0** · fake
marker data **0** · fake coordinates **0** · external geocoder/key **0**.

## Known limitation (documented, not a blocker — no write path exists yet)
The grant allows direct `authenticated` writes (PostgREST), so once applied an
owner could self-set `geocode_status='verified'` with their own coordinates on
**their own** demand. This affects only that owner's own demand display, never
another user's data. When the owner-facing write path is built, `'verified'`
should be reserved for the geocoder/admin and owners limited to
`'manual'`/`'pending'` (a future RPC slice). Until that write path exists, there
is no UI that writes here at all.
