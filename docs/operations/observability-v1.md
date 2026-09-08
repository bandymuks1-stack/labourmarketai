# Observability v1 — what watches production, and what pages whom (FINAL COMPLETION Train L, 2026-09-02)

**Principle:** every alert maps to a person who cannot do something. No vendor SDK is required for v1; the
sinks are Vercel logs and a public health endpoint. Choosing a paid monitoring vendor is an owner-visible,
reversible step listed at the end — nothing here changes if it is taken.

## 1. What exists (inventory — do not rebuild)

| Signal | Where | State |
|---|---|---|
| Product funnel events (~55) with first-touch attribution | `lib/telemetry/*`, `pilot_events` (anon-insert grants applied) | live |
| Per-request server timing on the assistant transport | `Server-Timing: auth, capability, presentation, total` on `/api/mcp` (#1414) | live |
| Auth server logs (sign-in, OAuth, confirmation requests, mailer errors) | Supabase → Logs → Auth | live, read by the agent via MCP |
| Database advisors (security / performance) | Supabase advisors | live (1 intentional ERROR, WARNs triaged 2026-09-02) |
| Weekly digest cron | `/api/cron/weekly-digest` (CRON_SECRET) | live; 503 = store unavailable |
| Deployment status | GitHub deployments + Vercel checks per commit | live |

Missing before L1: a liveness probe a monitor can call, and a structured, PII-free record of uncaught server
errors.

## 2. What L1 adds

- **`GET /api/health`** — public, uncached, timeout-bounded: `auth` (GoTrue `/settings`) and `db` (anon RPC
  `count_public_vacancies_v1` through PostgREST). 200 when both answer, 503 otherwise. Body: booleans,
  latencies, build sha, region. Guard: `lib/guards/production-health-observability.test.ts`.
- **`instrumentation.ts` → `onRequestError`** — one JSON line per uncaught server error:
  `{"lm":{"event":"request_error","route":"/[locale]/dashboard/…","method":"GET","kind":"render","name":"TypeError","digest":"…"}}`.
  Never the query string, headers, cookies, body, user or message. The `digest` is what the error boundary
  shows a person, so a support report can be matched to the line.

## 3. Alerts that map to user impact (v1 rule set)

| Alert | Condition | Impact | Source |
|---|---|---|---|
| SITE DOWN | `/api/health` ≠ 200 for 2 consecutive checks (1-min interval) | nobody can sign in or read | external uptime monitor (§5) |
| AUTH ERRORS | auth log `level=error` count > 10 in 10 min, or `path=/token` 5xx | sign-in / OAuth failing | Supabase log alert |
| REQUEST ERRORS | > 20 `request_error` lines in 10 min, or any burst on one `route` | a page is broken for everyone | Vercel log drain query |
| PAYMENT WEBHOOK | `/api/billing/webhook` non-2xx (once payments are live, Train D) | entitlements stop updating | Vercel log drain |
| IMPORT FAILURES | vacancy runner run with `status=failed` (existing `vacancy_import_cursors`) | job board goes stale | weekly SQL check until a cron alert exists |
| JOURNAL WRITE ERRORS | `request_error` on `kind=action` under `/dashboard/journal` or `/api/mcp` journal capabilities | people cannot record work | Vercel log drain |
| DB GROWTH | `pg_database_size` crosses T1 (1 GB) — see `capacity-thresholds-v1.md` | plan / retention decision due | monthly SQL until the readout is wired |
| COLD LATENCY | `/api/mcp` `Server-Timing total` p95 > 800 ms warm for a day | assistants feel slow | log drain aggregation |

## 4. Backup / rollback (L3 — to be DRILLED, not described)

- **App rollback:** Vercel → Deployments → promote the previous production deployment (seconds). Drill: promote
  `f0147927` → verify `/api/health` build sha changes → promote back. Record in the register.
- **Database:** Free plan = daily backups, no PITR; Pro = PITR. The recovery expectation is written down here
  so nobody discovers it during an incident: on Free, the worst case is up to 24 h of canonical data
  (journal, confirmations) — one more reason G-6 recommends Pro.
- **Migrations:** every migration ships a `.down.sql` (CI-enforced); apply/rollback via MCP `apply_migration`.

## 5. Owner-visible steps (each optional, reversible, free at v1 scale)

1. **Uptime monitor** on `https://labourmarket.ai/api/health` (UptimeRobot / Better Stack free tier): 1-min
   interval, alert on 2 consecutive failures, e-mail + phone. EXTERNAL_GATE (account signup).
2. **Vercel log drain** (Vercel → Project → Settings → Log Drains) to any free log store, with the §3 queries.
3. **Supabase log alerts** for auth errors (Supabase → Logs → Auth → save query → alert).
4. Later, if desired: a vendor SDK (Sentry etc.) — the `onRequestError` hook is the single place to add it.
