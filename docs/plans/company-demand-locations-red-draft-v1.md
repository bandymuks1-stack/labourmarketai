# Company demand locations — RED draft v1

> **Status:** RED draft — migration **authored, NOT applied**. Human-gated.
> Apply to prod **only** via Supabase MCP `apply_migration` after owner +
> Chat-Claude review. Never `db push`. This document is the schema before/after,
> RLS risk table, apply checklist and rollback for that review.

## Goal

Prepare the **first real geo layer** for the live market map (built on the #422
foundation): **company demand locations** — *where* a company actually needs
workers / a brigade / a service / a project executed.

A demand location is a **labour-market signal**, not:
- the company's registration address,
- a fake marker,
- a catalogue point.

Until the migration is applied **and** real, geocode-verified rows exist, the
market-map demand layer shows **"schema prepared"** and plots **zero** points.

## What this draft contains

| Artefact | Path | Applied? |
|----------|------|----------|
| Forward migration | `supabase/migrations/20260615120000_company_demand_locations.sql` | **No** (human-gated) |
| Rollback | `supabase/rollbacks/20260615120000_company_demand_locations.down.sql` | n/a |
| Typed read model | `apps/web/lib/market-map/demand-locations.ts` | code only, inert |
| Market-map wiring | `apps/web/components/app/market-map-shell.tsx` (demand layer = `schemaPrepared`) | code only |
| Guard test | `apps/web/lib/guards/market-map-demand-locations.test.ts` | CI |
| Owner-review artefact | `runtime/review/company-demand-locations-red-draft-v1/OWNER-REVIEW.html` | local (gitignored) |

## Schema — before / after

**Before.** Demand lives in `public.customer_requests` (migration 0028 +
`20260530150000`): `profile_id` owner, free-text `country` + `location`, a
`payload` jsonb, owner-scoped RLS, insert via RPC only, **no anon**. There is
**no structured location, no coordinates, no geocoding** anywhere in the schema.

**After (additive only — nothing existing is changed).** One new table:

```
public.company_demand_locations
  id              uuid pk
  request_id      uuid  -> customer_requests(id) on delete cascade   (the real demand)
  owner_id        uuid  -> profiles(id)          on delete cascade   (owner scope)
  country_code    text  not null   CHECK ~ ^[A-Z]{2}$                 (required)
  region          text  null
  city            text  null
  locality        text  null
  address_text    text  null
  location_label  text  not null   (1..200)
  latitude        numeric null
  longitude       numeric null
  geo_precision   text  not null default 'unknown'      (country|city|address|coordinates|unknown)
  geocode_status  text  not null default 'not_required' (not_required|pending|verified|failed|manual)
  source          text  not null default 'demand_form'  (demand_form|admin|import|manual)
  created_at / updated_at timestamptz
  + 3 indexes: (request_id), (owner_id), (country_code)
```

**No-fake-point guarantees enforced by the DB itself (not just app code):**
- `coords_valid` — latitude/longitude are **both-or-neither** and within WGS84 ranges.
- `coords_require_verification` — coordinates may exist **only** when
  `geocode_status` is `verified` or `manual` → **no random/unverified points**.
- `precision_matches_coords` — a `geo_precision='coordinates'` claim must carry coordinates.

## RLS risk table

| Concern | Decision | Why it's safe |
|---------|----------|---------------|
| Who can read | `owner_id = auth.uid()` **or** `public.is_admin()` | Mirrors `demand_shortlist` (20260612220000). Owner sees only their own demand locations; admin via existing predicate. |
| Public / anon read | **None** | No `to anon`, no `to public`, no `using (true)`. There is no consented public-demand model yet, so demand locations stay private. |
| Who can write | `owner_id = auth.uid()` (USING + WITH CHECK) **and** the referenced `customer_requests` row must belong to the caller (EXISTS in WITH CHECK) | Owner-only writes; no admin write override; no broad UPDATE; **cannot attach a location to another user's `request_id`** (request-spoofing closed). |
| Grants | `select, insert, update, delete` to `authenticated` **only** | The single migration-safety RED flag → `-- @human-gate-approved`. No anon/public/service_role grant. |
| New SECURITY DEFINER fn | **None** | Writes go through normal RLS; no RLS-bypassing function in this draft. |
| Auth core | **Untouched** | No `auth.*` change. |

**migration-safety classification:** RED (the GRANT). Annotation
`-- @human-gate-approved` downgrades the flag to a notice so CI is green, **and**
moves the PR to the RED human-gate class → opened as **draft** with the
**`needs-human-gate`** label. Structural checks pass (timestamped filename,
unused version, sibling `.down.sql`).

## Apply checklist (owner / Chat-Claude — manual, after approval)

1. Review this doc + the migration SQL + the RLS policy diff above.
2. Apply **only** via Supabase MCP `apply_migration` (project `gorgitwvdzxbnaxhrsrw`).
   Never `supabase db push`.
3. Verify post-apply: table exists, RLS enabled, two policies present, grant is
   `authenticated`-only, no anon access.
4. Bump nothing else — `SPRINT_BASELINE` is already 82 in this PR.

## Rollback

`supabase/rollbacks/20260615120000_company_demand_locations.down.sql`:

```sql
begin;
drop table if exists public.company_demand_locations;
commit;
```

Fully reversible — the table is new and additive, carries no pre-existing prod
rows, and owns its own indexes/policies/grant (all dropped with it). No
0-row assertion needed because nothing pre-existing is removed.

## How this feeds the market map (after apply + real data)

1. A company submitting a demand (`customer_requests`) can attach one or more
   locations → rows in `company_demand_locations` (a **future** owner-scoped
   write path; not built in this draft).
2. The demand layer reads via `summarizeDemandLocations()` /
   `isMappableDemandLocation()` (`lib/market-map/demand-locations.ts`):
   - rows with **verified/manual coordinates** → real points;
   - rows with only country/city text → **signal-only** aggregate (a need
     exists here), **never** a fake marker.
3. `demandLayerStatus()` returns `schema_prepared` (now) → `signal_only` → `live`.

## Out of scope for this draft (each its own future slice)

- Owner-facing write UI / RPC to attach a location to a demand.
- Geocoding (no external geocoder; owner-gated; would set `geocode_status`).
- Worker preferred locations, project lat/lng, accommodation table — separate
  RED drafts (see the #422 data-source matrix).

**Confirmations:** Supabase apply **0** · DB mutation **0** · fake marker data
**0** · fake coordinates **0** · external geocoding API/key **0** · auth/RLS
runtime change **0** · deploy **0**.
