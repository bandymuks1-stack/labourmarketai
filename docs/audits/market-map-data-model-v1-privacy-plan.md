# Market Map Data Model v1 — privacy & security plan

Companion to `20260617120000_market_map_data_model_v1.sql`. **Not applied.**

## Principles
- **Default to country/region level.** Exact city only when the user confirms
  (`granularity` + `confirmed_by_user`). Exact address is never shown publicly.
- **Login location is always approximate and consent-gated.** Structurally
  enforced: `consented_login_location_signals` has **no** latitude/longitude/
  address columns — an exact point cannot be stored. Hidden unless
  `consent_status = 'consented'`; `revoked` hides it everywhere.
- **Registration ≠ desire ≠ login.** Three separate stores so a desire or a
  login area is never mistaken for a home address.
- **Every signal carries `visibility_level`.** The read layer (next step) must
  filter; private/self_only rows never enter public/aggregated output.

## Forbidden (enforced by schema + plan)
- Storing exact address or exact lat/lng for login → **no such columns**.
- Showing login location publicly as an exact point.
- Calling a login area a residential address.
- Any fake/seeded coordinates or markers.

## Data minimisation
- `preferred_locations` / login table store country + optional region/city only.
- Login `precision_level` caps how precise the signal may ever render.
- No PostGIS, no external geocoder introduced.

## Consent lifecycle (login)
`not_requested` → (user opts in) `consented` → (user opts out) `revoked`.
- Only `consented` rows may appear as a (still approximate) login signal.
- `revoked` / `not_requested` → excluded from all shared output by the read
  layer, even though the owner can still see/manage the row.

## Copy (LT/EN/RU)
- "Prisijungimo vieta rodoma apytiksliai" / "Login location is shown
  approximately" / "Место входа показано приблизительно".
- "Tiksli vieta nerodoma be jūsų patvirtinimo" / "Exact location is not shown
  until you confirm it" / "Точное место не отображается, пока вы его не
  подтвердите".

## Residual risks (for owner awareness)
- Region/city granularity, even approximate, narrows a person — mitigated by
  self_only default + explicit user opt-in to raise visibility.
- Aggregated counts could be de-anonymising in very small regions — the read
  layer should apply a minimum-bucket threshold (documented for next step; not
  in this migration).
