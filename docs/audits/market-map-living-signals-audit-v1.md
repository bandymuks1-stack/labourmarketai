# Market Map — living-signals audit (pre-code, v1)

Read-only audit before the P0 fix that turns Market Map from a placeholder
into a real labour-market signal surface. No DB/env/auth/billing/deploy change.

## 1. Components responsible for the (wrong) empty-state
- `components/app/market-map-shell.tsx` — renders `MarketMapSelfSignal` first,
  then EITHER the demand signal board (`hasSignals` from `company_demand_locations`)
  OR an empty-state card using `marketMap.canvasEmptyTitle` / `canvasEmptyBody`.
  **Bug:** the empty-state is keyed only off *demand rows*, so a logged-in user
  with a real profile/company country still sees "Signalų žemėlapis — kol kas
  tuščias" below their own signals — a self-contradiction.
- `components/app/market-map-self-signal.tsx` — already renders the worker +
  company country signals (added in #449).
- `components/app/market-map-signal-layer.tsx` — renders the demand board.

## 2. Where location data comes from today (real, no migration needed)
- `lib/market-map/self-signal.ts` → `getOwnSelfSignals()` reads (RLS-scoped to
  the caller): `profiles.country`; `workers.current_location_country` +
  `workers.preferred_countries`; `companies.country`. Returns worker + company
  country signals.
- `lib/demand/demand-location.ts` → `getOwnDemandSignalBoard()` reads
  `company_demand_locations` (owner's own, country-grouped, coordinate-free).

## 3. Available signal sources (MVP, existing fields only)
| Signal | Source field(s) | Status |
|---|---|---|
| Profile location | `profiles.country` (+ worker current location) | ✅ available |
| Company location | `companies.country` (+ `address`) | ✅ available |
| Preferred / desired locations | `workers.preferred_countries[]` | ✅ available (not yet surfaced as its own layer) |
| Company need / demand locations | `company_demand_locations` | ✅ available |
| Project locations | project tables | ⚠️ present in schema; not wired into the map this sprint |
| Login location | auth/session/request metadata | ❌ no safe, reliable source today → neutral "will appear when reliable" copy |

## 4. Misleading i18n keys (must be removed/reworded)
- `marketMap.canvasEmptyTitle` = "Signalų žemėlapis — kol kas tuščias"
- `marketMap.canvasEmptyBody` = "Kai realūs duomenys turės vietos lauką… Jokių netikrų taškų."
- `marketMap.foundationNotice` = "Jokių netikrų taškų — žemėlapis užsipildys tik realiais duomenimis…"
- `marketMap.signalLayer.noPoints`, `marketMap.atlas.signalOnlyNote` — contain "jokių netikrų"/fake framing.
All imply a logged-in user/company/profile is "not real data" — false.

## 5. Fields missing for the FULL future model (next-sprint migration candidates)
- A dedicated **preferred/desired locations** table (multi-row, with intent:
  work / buy / offer / project / team) — today only `preferred_countries[]`.
- **Login location history** (approximate, consented) — needs a safe capture +
  storage design; not present.
- **Project / work-order location** fields surfaced for the map layer.
- Region/city granularity + confirmation flag for "exact location shown only
  after the user confirms".
- Per-signal **visibility level** (country / region / city) for plan-gated detail.

## 6. Fix plan (this sprint, no migration)
1. Remove the false empty-state: when ANY real signal exists (profile country,
   company country, preferred location, or demand), render a real country/region
   signal surface — never "kol kas tuščias".
2. Surface 5 signal categories honestly: **Profilio vieta**, **Įmonės vieta**,
   **Prisijungimo vieta** (neutral until reliably determinable), **Norimos
   lokacijos** (from `preferred_countries`), **Įmonės poreikio lokacijos** (demand).
3. Replace banned copy in lt/en/ru with country/region-level honesty copy.
4. Add CTAs (refine profile/company location, add preferred location, add demand
   location) → real routes, honest disabled where not built.
5. Keep the layer legend as a prepared architecture (no fake data); document the
   deeper layers (skills density, rates, teams, projects, accommodation/mobility,
   supply-demand balance, evidence, risk, opportunities) as next-sprint.
6. Guards: copy guard (forbid banned phrases), signal-existence guard (no
   empty-state when a signal exists), layer-legend test, privacy test (login
   location never exact), mobile source checks.
