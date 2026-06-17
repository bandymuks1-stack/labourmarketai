# Market Map Data Model v1 — RLS plan

Companion to `20260617120000_market_map_data_model_v1.sql`. **Not applied.**
Mirrors the proven pattern from `company_demand_locations` (20260615120000):
owner-scoped, admin read via `public.is_admin()`, **no anon/public**, grants to
`authenticated` only.

## New tables
### `preferred_locations`
- `enable row level security`.
- **select:** `profile_id = auth.uid() or public.is_admin()`.
- **write (all):** `using (profile_id = auth.uid())` + `with check (profile_id = auth.uid())`.
- `grant select, insert, update, delete ... to authenticated`. No anon/public.

### `consented_login_location_signals`
- `enable row level security`.
- **select:** `profile_id = auth.uid() or public.is_admin()` (self/admin only).
- **write (all):** `using (profile_id = auth.uid())` + `with check (profile_id = auth.uid())`.
- `grant ... to authenticated`. No anon/public. `unique (profile_id)` (one row/user).
- The read layer additionally excludes rows where `consent_status <> 'consented'`
  from any shared/aggregated output.

## Extended tables (RLS unchanged — additive columns only)
- `company_demand_locations` and `projects` keep their existing RLS; new columns
  inherit it. No policy is loosened, dropped, or widened.

## Who sees what
| Actor | Sees |
|---|---|
| The user | their own preferred_locations + login signal (any consent state) |
| Company owner/admin | their company's need locations + project locations |
| Public / market view | only `aggregated` / `region_visible` / `city_visible` signals, via the read layer — **never** `private` / `self_only` |
| Platform admin | diagnostic / `admin_only` signals via `is_admin()` |

## Hard RLS guarantees (also checked by the guard test)
- No `using (true)`. No `to anon`. No grant to `anon` / `public`.
- No new `SECURITY DEFINER` function.
- No existing policy dropped or loosened.

## If full RLS for the read/aggregation layer cannot ship in this PR
It cannot — the public-aggregation read layer (`market_map_signal_view` / RPC /
service) is a **follow-up** step that depends on these tables existing. This PR
ships only the tables + per-row RLS. **Stop at owner sign-off before applying;**
do not expose any aggregated public output until the read layer + its own tests
land. Risk documented in the privacy plan.
