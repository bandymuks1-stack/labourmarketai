# LabourMarket.ai production on the Agentai VPS — runbook (2026-10-17)

**Status:** LIVE since 2026-10-17 ~16:50 UTC. Production = Cloudflare Free (proxy, DNS,
edge TLS) → Hostinger VPS `76.13.77.40` (nginx 1.29, HestiaCP) → Docker container
`labourmarket-prod` (`node:22-bookworm-slim`, `127.0.0.1:3200` only) → Supabase project
`gorgitwvdzxbnaxhrsrw` (unchanged). **Vercel is no longer in the request path, the build
path or the deploy path.** Its project still exists (deletion = separate owner decision).

Cost: 0 € on top of what already existed (VPS, Cloudflare Free, Supabase as before).

## 1. Topology and the files that define it

| Piece | Where | Defined by |
|---|---|---|
| DNS | Cloudflare zone `labourmarket.ai` (owner's own Cloudflare account, NS dilbert/kate) | `labourmarket.ai` A → 76.13.77.40 proxied; `www` A → 76.13.77.40 proxied; SSL/TLS **Full (strict)** |
| Edge TLS | Cloudflare (Let's Encrypt edge cert, auto-renewed) | — |
| Origin TLS | `/etc/ssl/labourmarket/origin.pem` (Cloudflare Origin CA, valid to **2041-10-13**) + `origin.key` (600, generated on the VPS, never left it) | CSR route: `ops/vps` history |
| nginx vhost | `/etc/nginx/conf.d/domains/labourmarket.conf` | [`ops/vps/labourmarket.ai.nginx.conf`](../../ops/vps/labourmarket.ai.nginx.conf) |
| Real client IPs | `/etc/nginx/conf.d/cloudflare.inc` (22 ranges, `CF-Connecting-IP`), included by nginx.conf | HestiaCP |
| Container | `labourmarket-prod`: 0.5 CPU, 768 MB (no swap), pids 256, uid 1000, `cap-drop ALL`, `no-new-privileges`, `restart=unless-stopped`, json-file logs 10 MB × 3, healthcheck `/api/health` every 30 s | [`ops/vps/lm-prod-run.sh`](../../ops/vps/lm-prod-run.sh) |
| Releases | `/root/lm-prod/releases/<sha>/` (standalone build, side by side), `/root/lm-prod/current` symlink | [`ops/vps/lm-deploy-receive.sh`](../../ops/vps/lm-deploy-receive.sh) |
| Env | `/root/lm-prod/env` (600, 19 names, see §3); backups `/root/lm-prod/env.bak-*` | owner-run scripts only |
| Cron | `/etc/cron.d/labourmarket` (**prepared, not installed** — §5) | [`ops/vps/labourmarket.cron`](../../ops/vps/labourmarket.cron), [`ops/vps/lm-cron.sh`](../../ops/vps/lm-cron.sh) |
| Smoke | [`ops/vps/lm-smoke.sh`](../../ops/vps/lm-smoke.sh) (health, routes, OAuth PRM, MCP 401, resources, Agentai 5/5) | — |

Boot persistence (verified after the unplanned VPS reboot at 2026-10-17 16:36 UTC): `docker`,
`nginx`, `cron` are `systemctl enabled`; the container restart policy brought it back healthy.

## 2. Deploy without Vercel

[`.github/workflows/deploy-vps.yml`](../../.github/workflows/deploy-vps.yml) — manual
dispatch: build the standalone artefact on a Linux runner (the VPS cannot build: 3.9 GB RAM vs
~6 GB build peak), secret-scan it, ship it over SSH to the **forced-command receiver**
(`lm-deploy-receive.sh` as user `lmdeploy`, the only command that key can run), start the
container, wait for health, **roll back automatically** to the previous release if health never
comes, then verify `https://labourmarket.ai/api/health` serves the new build id.

One-time owner setup (names only): GitHub secrets `VPS_DEPLOY_SSH_KEY`, `VPS_DEPLOY_HOST`,
`VPS_DEPLOY_KNOWN_HOSTS`; VPS user `lmdeploy` + sudoers + authorized_keys line as documented in
the receiver header. Until then the workflow fails loudly (no false green) and deploys are done
the manual way: build in a Linux container, `scp` the tgz, `sh lm-prod-run.sh <sha>` (what the
2026-10-17 launch did).

Rollback: `ssh lmdeploy@vps "rollback <previous-sha>"` or on the VPS
`sh /root/lm-prod/bin/lm-prod-run.sh <previous-sha>` (releases are kept, newest 3).
nginx rollback: `sh /root/lm-prod/bin/lm-cutover.sh rollback` (restores the legacy vhost from the
backup dir; only useful if the legacy :3000 app ever returns). Full pre-cutover copy of
`/etc/nginx`: `/root/nginx-etc-before-cutover-20261017T164853Z.tgz`.

## 3. Environment (names only; values never in git, chat or logs)

Required to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `CONVERSATION_TOKEN_SECRET`,
`VERCEL_ENV=production` (the app's production-evidence word; kept on purpose, see
`lib/telemetry/production-host.ts`), `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED`.
Set by `lm-prod-run.sh`: `VERCEL_GIT_COMMIT_SHA=<release sha>` (health `build`).

Flags, current production values: `PAYMENTS_ENABLED=false`, `BILLING_PROVIDER=none`,
`STRIPE_MODE=test`, `AI_PROVIDER_MODE=disabled`, `AI_PROVIDER=gemini`, `AI_GEMINI_ENABLED=false`,
`OWNER_TELEGRAM_ALERTS_ENABLED=false`, `NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS=true`,
`VACANCY_SOURCE_ARBETSFORMEDLINGEN_ENABLED=true`.

**Why the Vercel copy could not be reused:** every Vercel production variable was marked
*Sensitive*; `vercel env pull` returns the literal `[SENSITIVE]` for those (write-only by
design). Values were restored from the owner's own sources; integrations whose secrets only
lived in Vercel (Stripe secret/webhook, Telegram bot, Gemini key, supply-feed bearer, Nonstop
pair tokens) stay OFF until the owner re-supplies or regenerates them (§6).

## 4. Health, monitoring, logs

- `https://labourmarket.ai/api/health` → `ok`, `build` (first 8 of the sha), `deployEnv:
  production`, auth + db probes, vacancy freshness. GitHub `health-probe.yml` polls it every
  15 min (fails loudly); `product-monitor.yml` hourly.
- Container: `docker logs labourmarket-prod` (rotated), `docker stats`; VPS: `/proc/pressure/cpu`,
  Agentai OS must stay 5/5 healthy (Agentai has priority: `docker update --cpus=0.3
  labourmarket-prod` or stop it if Agentai degrades).
- nginx: the vhost has no `access_log` directive yet (HestiaCP default is off) — proposed
  change: per-domain access log for incident diagnosis (owner approval, §7).

## 5. Scheduled work — one owner per task (inventory 2026-10-17)

| Task | Route / job | Today | Target |
|---|---|---|---|
| Weekly digest | `/api/cron/weekly-digest` (Mon 07:00 UTC) | **not running** (was Vercel Cron) until `lm-cron-install.sh` is approved | VPS `cron.d/labourmarket` via `lm-cron.sh` — the ONE owner |
| Commercial handoffs | `/api/cron/commercial-handoffs` (06:00 UTC) | **not running**; inert anyway until Nonstop tokens are paired | VPS cron.d |
| Job alerts | `/api/cron/job-alerts` (06:17 UTC) | the GitHub `job-alerts-cadence.yml` no-op was **removed** (it never had `CRON_SECRET`; nginx 404s `/api/cron/*` from the internet) | VPS cron.d (line present in the bundle) |
| Billing recovery | `/api/cron/billing-recovery` | `billing-recovery-cadence.yml` kept **dispatch-only** (schedule removed; its static gate stays reviewable). Since 2026-10-23 it makes **no HTTP call**: nginx 404s `/api/cron/*` from the internet, so a runner call could never succeed; an open gate fails loudly and points at `lm-cron.sh billing-recovery` on the VPS. `apps/web/vercel.json` keeps its `crons` block unchanged: three guards read it as the schedule declaration and the Vercel project is disabled, so the block is inert documentation | VPS cron.d line added only with the Stripe GO |
| **DB backup** | `db-backup.yml` 03:30 UTC: `pg_dump` on the runner with the existing `SUPABASE_DB_URL` secret → **restore drill** into a throw-away postgres:17 → `age`-encrypt to the VPS public key → ship via the forced-command receiver (`backup`) → `/root/lm-prod/backups/` (700/600), 14-day rotation | **prepared, needs the deploy trio + `ops/vps/backup.age.pub`** | GitHub-side dump; VPS stores ciphertext only; no DB password typed anywhere |
| NAV (Norway) ingestion | `nav-supply-cadence.yml` 02/08/14/20 UTC (GitHub, service role) | GREEN after migration | keep (GitHub) |
| Sweden ingestion | `sweden-supply-cadence.yml` 01/09/17 UTC | GREEN | keep |
| Freshness check | `ingestion-freshness.yml` 04/10/16/22 UTC | GREEN | keep |
| Health probe | `health-probe.yml` */15 | fails loudly on outage | keep |
| Product monitor | `product-monitor.yml` hourly | GREEN | keep |
| Prod QA walk | `prod-qa-walk.yml` daily rotation + post-merge | GREEN on the VPS (role-routes, brigade, journal, living-cv, marketplace…) | keep; its 24 h budget was a Vercel-CPU rule — revisit |
| Legacy LABMA backup | root crontab `0 3 * * * /root/Labma/scripts/nightly-backup.sh` | dumps a **legacy local DB** (164 KB, unchanged daily) + empty files tar to `/root/backups` | leave until a new backup mechanism is proven (owner rule) |

## 6. Integrations after migration (honest state)

| Integration | State | Why / what unlocks it |
|---|---|---|
| Supabase (DB, auth, Google sign-in, OAuth server for MCP clients) | **ON** | unchanged project; redirect URLs unchanged (same domain) |
| ChatGPT MCP connector | endpoint ON (PRM, AS metadata, 229 tools public count) — **authenticated test pending owner Refresh** | same authorization server → no re-link expected |
| E-mail invitations (`INVITE_EMAIL_PROVIDER`) | OFF (never configured in Vercel either) — invites work by link | owner supplies Resend/Postmark key (paid tiers exist; free tier possible) |
| Supabase auth e-mails | Supabase built-in SMTP (rate-limited) | custom SMTP = owner decision |
| AI (Gemini adapter, assistant, journal suggestions, CV structuring, market explanations) | **OFF** (`AI_PROVIDER_MODE=disabled`) | owner GO + `GEMINI_API_KEY` (exists in the owner's local env; free tier) |
| Stripe payments | OFF (`PAYMENTS_ENABLED=false`) — pricing shows the honest off state | owner supplies live secret + new webhook secret + price id; publishable key needs a rebuild |
| Telegram owner alerts | OFF | bot token + chat id, or the Agentai OS alert bridge |
| Nonstop handoff + referral | OFF (no tokens on either side) | new token pair, both sides (separate approval) |
| Supply feed bearer | OFF (401) | new bearer, handed to the consumer |
| Voice transcription | OFF (needs ≥ 2 vCPU) | keyboard dictation is the 0 € path |

## 7. Changes that need separate owner approval (none done)

1. **Cron:** `sh /root/lm-prod/bin/lm-cron-install.sh --dry-run`, then without the flag (installs
   `cron.d/labourmarket`: weekly-digest, commercial-handoffs, job-alerts; billing-recovery stays out
   while payments are off). Rollback: `--remove`.
2. **Deploy + backup channel:** owner creates the `lmdeploy` user + sudoers + forced-command
   `authorized_keys` line (receiver header) and the three GitHub secrets; then one proof dispatch of
   `deploy-vps.yml` (current main sha) and one of `db-backup.yml` with `restore_drill_only=true`.
3. **Backup key:** on the VPS `age-keygen -o /root/lm-prod/backup.age.key` (600); the PUBLIC half is
   committed as `ops/vps/backup.age.pub`; the owner keeps an offline copy of the private key (without
   it no backup can be decrypted). Then the nightly schedule is live; legacy LABMA cron stays.
4. nginx per-domain access log.
5. Supabase dashboard: enable **leaked-password protection** (free toggle; advisor WARN).
6. **AI on, 0 €, privacy-safe by construction.** The code already encodes the free-tier rule
   (`lib/ai/runtime/data-egress.ts`): without `AI_GEMINI_PAID_TIER_CONFIRMED=1` a Gemini key is
   treated as free tier and may receive only `PUBLIC` / `LOW_RISK_PROJECT_DATA` tasks —
   `explain_market_demand`, `structure_future_work`, `derive_workforce_requirements`,
   `detect_capacity_gap`, `detect_skill_gap`. Personal and free-text tasks (`extract_cv`,
   `explain_match`, `normalize_*`, `draft_follow_up`, `translate_*`, `propose_conversation_intent`)
   are refused with a typed privacy refusal that never counts as a run. Enable with
   `lm-env-set.sh` (value from a 600 file, never argv): `AI_PROVIDER_MODE=live`, `AI_PROVIDER=gemini`,
   `AI_GEMINI_ENABLED=true`, `GEMINI_API_KEY` (from the owner's local env file via scp),
   `AI_DAILY_RUN_BUDGET=200` (global cap; per-org default cap 100/day), then `--restart`.
   Zero-cost guarantee = the key's Google project has **no billing account** (owner checks in
   AI Studio: plan "Free of charge"); then over-quota answers 429 and costs nothing. The
   Cloudflare adapter is translation-only (`@cf/meta/m2m100-1.2b`), not a general LLM.

## 8. Defect found by the first production walks (fixed in this PR)

`POST /api/assistant/transcript` refused every browser write with 403 since the move: its
same-origin check compared `Origin` with `new URL(req.url).host`, which on the self-hosted server
is the **bind host** `0.0.0.0:3000` (measured: `Origin: https://labourmarket.ai` → 403,
`Origin: http://0.0.0.0:3000` → 400). Result: no `assistant_messages` row was written after the
cutover (DB: last row 2026-10-15), the `chat-continuity` walk failed. Fix: `lib/http/same-origin-request.ts`
judges the Origin against the request's public host (the MCP door's `requestPublicOrigin`); the
Stripe portal return URL (`/api/billing/portal`) had the same `req.url` dependency and now uses the
same helper. Guard test: `lib/http/same-origin-request.test.ts`.
