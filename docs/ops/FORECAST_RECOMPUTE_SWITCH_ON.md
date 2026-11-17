# Forecast recompute: deployment and safe switch-on (register 3.34)

Owner order 2026-11-16: prepare the deployment instructions and a safe switch-on plan for
`forecast-recompute`. **3.34 stays NOT VERIFIED until the job has actually run in production**
and a production walk has read the stored result (§5).

## 1. What it is, and what it writes

- **Route:** `GET /api/cron/forecast-recompute` (`apps/web/app/api/cron/forecast-recompute/route.ts`).
  It needs `Authorization: Bearer $CRON_SECRET`; without it the answer is 401. It answers 503
  "unavailable" if the forecast database functions are missing.
- **One pass:** `runRecomputePass` (`apps/web/lib/forecast/forecast-scheduler-core.ts`).
  - At most **25 projects or 60 s** per pass.
  - Only projects that are due under their organization's cadence
    (`forecast_due_candidates_v1`) are recomputed:
    - **weekly** (the default when an organization has no settings row): Sundays UTC only;
    - **daily**: once a day;
    - **hourly**: once an hour;
    - **live**: after a recorded signal.
- **Writes:** one new versioned row per due project in `project_forecasts`, plus
  `project_forecast_state`, through the service-role-only `forecast_record_v1`.
  - That call also clears the project's consumed `project_forecast_signals`, the "live" mode
    triggers that the recompute has used.
  - Nothing else is written.
  - No person, booking, journal or payment row is touched.
  - The rows are readable under RLS only by someone who passes `can_manage_project`.
- **What users see:** nothing changes on any page.
  - The manager's project page computes its forecast on read (`lib/forecast/forecast-read.ts`), with or without stored rows.
  - Stored rows are read only by the chat/MCP tool `project_forecast_get`.
- **Schema:** `supabase/migrations/20261025045152_project_forecasts_v1.sql`, applied in production
  on 2026-10-25 (production ledger `20261025045152`). No migration is needed for this switch-on.
- **Schedule:** `ops/vps/labourmarket.cron` holds `*/5 * * * * … lm-cron.sh forecast-recompute`.
  Every 5 minutes the pass checks what is due; under the weekly default most passes find nothing to do.

## 2. Why the owner has to do it

Deploys do not refresh `/root/lm-prod/bin`. Those scripts are installed **by hand** (runbook §9.1.0).
The public site returns 404 for `/api/cron/*` (nginx), so no GitHub workflow can call the route
instead. An older `lm-cron.sh` on the VPS answers `unknown cron` for `forecast-recompute`.

## 3. Switch-on, step by step (on the VPS, as root)

1. **Bring the two files up to date** from `main`, the same way as other bin scripts (`scp`):
   `ops/vps/labourmarket.cron` → `/root/lm-prod/bin/labourmarket.cron`, and
   `ops/vps/lm-cron.sh` → `/root/lm-prod/bin/lm-cron.sh`. Check them:
   ```sh
   grep -c forecast-recompute /root/lm-prod/bin/lm-cron.sh /root/lm-prod/bin/labourmarket.cron   # each ≥ 1
   ```
2. **Dry run.** This installs nothing:
   ```sh
   sh /root/lm-prod/bin/lm-cron-install.sh --dry-run
   ```
   It must end `dry-run OK` with `forecast-recompute: unauthenticated=401 OK`. Any `STOP:` line
   names the missing piece: env permissions, `CRON_SECRET`, container health, or a route that
   is not fail-closed.
3. **Install.** This makes one authenticated run per route straight away:
   ```sh
   sh /root/lm-prod/bin/lm-cron-install.sh
   ```
   Expect `forecast-recompute: authenticated run OK`. Note that this also installs the other
   scheduled routes in the bundle (weekly-digest, commercial-handoffs, job-alerts and
   privacy-erasure); `billing-recovery` stays out while payments are off. Installing the bundle
   is runbook §7 item 1. If only the forecast should start now, say so, and Lane H prepares a
   forecast-only cron file.
4. **Read back** after 5–10 minutes:
   ```sh
   grep forecast-recompute /root/lm-prod/cron.log | tail -3        # http=200 lines
   ```
   And read-only in the Supabase SQL editor:
   ```sql
   select count(*), max(computed_at) from public.project_forecasts;
   ```
   Under the weekly default the count can stay 0 until the first Sunday (UTC).

## 4. Getting a first stored forecast sooner (optional)

A platform admin can set one organization's cadence to `daily` through the chat/MCP tools
`forecast.mode.set_draft` → `forecast.mode.set_confirm`. This is audited in `audit_logs`, and
`forecast_set_mode_v1` refuses anyone who is not an admin. Use only the synthetic QA organization
("QA-SYNTHETIC Alfa"), never a customer's. Setting it back to `weekly` the same way undoes it.

## 5. When 3.34 counts as verified

Only when **all** of these hold, by register number 3.34:

1. `cron.log` shows `forecast-recompute http=200` runs in production.
2. `project_forecasts` holds at least one row written by the pass.
3. The production walk project-execution **E-12b** reads project A's stored forecast through
   `project_forecast_get` and passes the stored-row checks: version ≥ 1, a known cadence, less
   than 8 days old (#3449).

Until then E-12b logs "no stored forecast yet" and the register keeps 3.34 at NOT VERIFIED.
Green CI does not count.

## 6. Switching off and rolling back

- **Stop only the forecast:** remove the `forecast-recompute` line from
  `/etc/cron.d/labourmarket`. cron picks up the change by itself.
- **Stop every scheduled route:** `sh /root/lm-prod/bin/lm-cron-install.sh --remove`.
- **Stored rows:** they are harmless when left in place. They are versioned history and nothing
  in the web app depends on them. Deleting them is a production data change and needs the owner.
- **Load:** each pass is capped at 25 projects / 60 s, and the route returns 503 rather than
  failing loudly if the database functions are missing. A stuck pass can be stopped by removing
  the cron line.

## 7. Open owner decision (not needed for the switch-on)

Today only a platform admin can change an organization's cadence, and there is no web control
for it (OI-86). Whether managers may change it themselves is the owner's call.
