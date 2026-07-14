# Sandbox example files (synthetic)

Documentation fixtures for the Manual Import Sandbox
(`/dashboard/admin/import-sandbox`). Every figure is SYNTHETIC (subject
ids are prefixed `example-`) — these files exist to exercise the dry-run
UI and are never read by any runtime code, never imported anywhere.

- `example-internal-clean.csv` — validates fully (internal source).
- `example-cvbankas-shaped.ndjson` — every row correctly blocked by
  `source_approved:source_not_active` today; `validAfterActivation`
  shows both rows would validate once the owner activates the source.
- `example-broken-mixed.ndjson` — one valid row, one duplicate, one row
  with a disallowed country + bad salary unit + wrong language, one row
  with a missing metric key.
