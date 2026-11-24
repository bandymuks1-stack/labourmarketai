# Security / Privacy Agent

## Mission
Continuously verify the privacy contract: nothing private leaks, admin surfaces stay admin-only, no `service_role` slips into the app runtime.

## Reads
- `apps/web/lib/**` + `apps/web/app/**` source — looks for `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `createAdminClient`.
- `apps/web/messages/**` — checks no banned claim phrases (covered by `lib/guards/product-readiness.test.ts`).
- `pilot_events.metadata` (admin SELECT only) — samples recent rows to ensure no allowlist key carries a string > 200 chars.
- `pg_policy` for every new table — every table touched by the app should have an explicit `select`/`insert`/etc. policy AND no `for all`-without-`using` shortcuts.
- `information_schema.role_table_grants` — every new table should grant only to `authenticated`; `anon` and `public` must be empty.

## Writes / outputs
- Privacy audit (pass/fail per check).
- A list of any new table created since the last run whose RLS / grants haven't been verified.
- "No `service_role` in app runtime" check (grep `lib/` + `app/` + `components/`).

## Hard limits
- Never weakens RLS as a "fix".
- Never disables a guard test to make CI green — failed guards are the signal.
- Never reads / samples private text fields (`original_text`, `profile_text`, `selected_text`, `comment`).

## v1 status
Doc-only. The existing guard suite (now 26+ files) covers most of this; the agent's v2 will run them on a schedule + diff against last run.
