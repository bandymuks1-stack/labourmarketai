# Company map & geography contract v1 (F12)

Two problems from production finding F12: (a) a map click instantly
overwrote the saved location; (b) a company could only exist as a single
implicit point — no table for company geography existed at all. This doc
is the contract for both fixes. The company-geography migration is
**OWNER-GATED and NOT applied** at the time of writing.

## Company geography model

`public.company_locations` — one row per (company, kind, place):

| Field | Rule |
|---|---|
| `kind` | `headquarters` \| `operating` \| `desired_market` |
| `country` | required ISO-3166-1 alpha-2 (matches the app's `MARKET_COUNTRIES`) |
| `region` / `city` | optional free text, ≤120 chars |
| `label` | optional short display label, ≤120 chars |
| `latitude` / `longitude` | OPTIONAL company-entered approximate coords; both-or-neither (CHECK `company_locations_coord_pair`) |

- Multi-country by design: real companies work in several markets.
- At most ONE headquarters per company (partial unique index
  `uq_company_locations_single_hq`); saving a new HQ replaces the old one
  inside the RPC.
- Row cap: 50 locations per company, enforced in the write RPC.
- **This table never stores private worker coordinates.** Company
  geography only; the worker's map location stays device-local.

## Security (fail-closed)

- RLS SELECT: `owns_company(company_id) OR is_admin()`. v1 is a private
  management surface — no public/worker read; any wider exposure is a
  separate owner-gated decision.
- Writes: RPC-only — `save_company_location_v1` /
  `remove_company_location_v1`, SECURITY DEFINER, owner-checked
  server-side, pinned `search_path`. No insert/update/delete policies on
  the table.
- Grants: `authenticated` gets table SELECT and RPC EXECUTE only; `anon`
  and `public` revoked on the RPCs.

## Owner-gated migration (NOT applied — human gate)

- Migration: `supabase/migrations/20260713120000_company_locations_v1.sql`
  (header carries the explicit HUMAN GATE banner).
- Rollback: `supabase/rollbacks/20260713120000_company_locations_v1.down.sql`.
- Ledger: entered in APPLIED_LEDGER under **Deferred**.

### Activation steps (owner)

1. Review the migration + rollback pair.
2. Apply via `supabase db push` or the dashboard SQL editor.
3. Verify: RLS enabled on `public.company_locations`; the single SELECT
   policy exists; no write policies; RPC grants limited to
   `authenticated`; `uq_company_locations_single_hq` present.
4. Move the ledger entry from Deferred to the applied table with the
   apply date.
5. Reload the company workspace — the section switches from the gated
   state to the live editor automatically (no code change needed).

## Honest gated UI state (before activation)

`components/app/company-locations-section.tsx` +
`lib/company/company-locations.ts`: the data layer detects the missing
table (Postgres error `42P01`) and the section renders one honest line —
prepared, owner activation pending. It never renders a fake empty list,
never a crash, never a dev marker. This is the reference implementation of
the honest-degradation rule in
`docs/launch/product-presentation-contract-v1.md`.

## Map layer behavior

- **Before activation:** the company layer on the market map shows no
  company geography (there is none to show); the company workspace shows
  the gated state. Nothing pretends.
- **After activation:** the company layer renders HQ / operating /
  desired-market entries with their optional approximate coordinates.
  Entries without coordinates appear in the list/section but not as map
  pins. Worker locations remain a separate concern and are never mixed
  into this layer.

## Map safe-edit contract (worker location, fixed on this branch)

Previous behavior: a Leaflet map click immediately persisted the clicked
point (localStorage, device-local) — one stray tap silently destroyed the
saved location.

Contract now (implemented in `components/app/market-map-base.tsx` +
`market-map-live.tsx`):

1. A click NEVER overwrites the saved location.
2. The user enters an explicit edit mode.
3. Clicks in edit mode place a dashed PREVIEW marker only.
4. **Save** commits the preview; **Cancel** (or leaving edit mode)
   discards it.
5. The previous location is kept and displayed until a new one is
   confirmed.

This same click → preview → confirm shape is the rule for any future map
editing surface, including the company locations editor once activated.
