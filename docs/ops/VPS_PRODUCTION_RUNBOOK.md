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
  production`, auth + db probes, vacancy freshness. GitHub `health-probe.yml` is also the
  external **stall monitor** (2026-10-23): every 5 min (GitHub runs it late/sparsely) one GET
  each to `/api/health`, `/lt`, `/lt/auth/login` through Cloudflare, one summary line (status,
  connect, first byte, total, colo), and it fails loudly on a first byte > 10 s, a 5xx or no
  answer; `product-monitor.yml` hourly. `vps-status.yml` (manual) prints the receiver's
  `status` — release, docker health, RestartCount — with the existing deploy key, read-only.
- Container: `docker logs labourmarket-prod` (rotated), `docker stats`. A swap REMOVES the old
  container and, with it, its logs; since 2026-10-23 `lm-prod-run.sh` first saves them to
  `/root/lm-prod/logs/*.log.gz` (root-only, newest 20). VPS: `/proc/pressure/cpu`,
  Agentai OS must stay 5/5 healthy (Agentai has priority: `docker update --cpus=0.3
  labourmarket-prod` or stop it if Agentai degrades).
- nginx: the vhost has no `access_log` directive yet (HestiaCP default is off) — proposed
  change: per-domain access log for incident diagnosis (owner approval, §7).

## 5. Scheduled work — one owner per task (inventory 2026-10-17)

| Task | Route / job | Today | Target |
|---|---|---|---|
| Weekly digest | `/api/cron/weekly-digest` (Mon 07:00 UTC) | **running** on the VPS cron.d (measured 2026-10-23: weekly_digest notifications in the 07:00 UTC hour on Monday 10-19) | VPS `cron.d/labourmarket` via `lm-cron.sh` — the ONE owner |
| Commercial handoffs | `/api/cron/commercial-handoffs` (06:00 UTC) | **running** (measured 2026-10-23: the 06:00 UTC sweep read the queue; consented hand-offs are delivered by the immediate path) | VPS cron.d |
| Job alerts | `/api/cron/job-alerts` (06:17 UTC) | the GitHub `job-alerts-cadence.yml` no-op was **removed** (it never had `CRON_SECRET`; nginx 404s `/api/cron/*` from the internet) | VPS cron.d (line present in the bundle) |
| Billing recovery | `/api/cron/billing-recovery` | `billing-recovery-cadence.yml` kept **dispatch-only** (schedule removed; its static gate stays reviewable). Since 2026-10-23 it makes **no HTTP call**: nginx 404s `/api/cron/*` from the internet, so a runner call could never succeed; an open gate fails loudly and points at `lm-cron.sh billing-recovery` on the VPS. `apps/web/vercel.json` keeps its `crons` block unchanged: three guards read it as the schedule declaration and the Vercel project is disabled, so the block is inert documentation | VPS cron.d line added only with the Stripe GO |
| **DB backup** | `db-backup.yml` 03:30 UTC: `pg_dump` on the runner (`public` + `auth`) through a **temporary CLI login role** minted with the owner's scoped `SUPABASE_ACCESS_TOKEN` (or the optional `SUPABASE_BACKUP_DB_URL` read role) → **restore drill** into a throw-away postgres:17 → `age`-encrypt to the VPS public key → ship via the forced-command receiver (`backup`) → `/root/lm-prod/backups/` (700/600), 14-day rotation | **never produced a backup** (drills 10-17 failed on permissions; since 10-18 no credential secret) — owner step in §9.1 | GitHub-side dump; VPS stores ciphertext only; no DB password typed anywhere |
| NAV (Norway) ingestion | `nav-supply-cadence.yml` 02/08/14/20 UTC (GitHub, service role) | GREEN after migration | keep (GitHub) |
| Sweden ingestion | `sweden-supply-cadence.yml` 01/09/17 UTC | GREEN | keep |
| Freshness check | `ingestion-freshness.yml` 04/10/16/22 UTC | GREEN | keep |
| Health + stall probe | `health-probe.yml` */5 (was */15) | fails loudly on an outage, a 5xx or a first byte > 10 s | keep |
| Product monitor | `product-monitor.yml` hourly | GREEN | keep |
| Prod QA walk | `prod-qa-walk.yml` daily rotation + post-merge | GREEN on the VPS (role-routes, brigade, journal, living-cv, marketplace…) | keep; its 24 h budget was a Vercel-CPU rule — revisit |
| Legacy LABMA backup | root crontab `0 3 * * * /root/Labma/scripts/nightly-backup.sh` | dumps a **legacy local DB** (164 KB, unchanged daily) + empty files tar to `/root/backups` | leave until a new backup mechanism is proven (owner rule) |

## 6. Integrations after migration (honest state)

| Integration | State | Why / what unlocks it |
|---|---|---|
| Supabase (DB, auth, Google sign-in, OAuth server for MCP clients) | **ON** | unchanged project; redirect URLs unchanged (same domain) |
| ChatGPT MCP connector | endpoint ON (PRM, AS metadata, 229 tools public count) — **authenticated test pending owner Refresh** | same authorization server → no re-link expected |
| E-mail invitations + notifications (`INVITE_EMAIL_PROVIDER=smtp` over `LM_SMTP_*`, the info@ mailbox) | OFF until `LM_SMTP_PASS` is set — invites work by link | owner sets the mailbox password with `lm-env-set.sh` (§9.2) |
| Supabase auth e-mails | Supabase built-in SMTP (rate-limited) | custom SMTP = owner decision |
| AI (free-first provider chain: Cloudflare Workers AI → Mistral → Groq; Gemini only on a billed key) | **OFF** (`AI_PROVIDER_MODE=disabled`; every `ai_runs` row since 10-19 has `provider = 'disabled'`, monitor signal `ai-runtime-disabled`) | owner creates free keys + GO (§9.3) |
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
6. **AI on, 0 €, privacy-safe by construction.** See §9.3 for the exact keys and commands.
   Corrected 2026-10-25: (a) the Gemini **free** tier is not an option for this product — the Gemini
   API Additional Terms (effective 2026-03-23) say "You may use only Paid Services when making API
   Clients available to users in the European Economic Area, Switzerland, or the United Kingdom", so
   the code now keeps Gemini disabled unless `AI_GEMINI_PAID_TIER_CONFIRMED=1`; (b) the earlier note
   that a free key may also receive `LOW_RISK_PROJECT_DATA` tasks was wrong — with no egress grant an
   external provider receives `PUBLIC` only (`lib/ai/runtime/data-egress.ts`). Today that is
   `explain_market_demand`. `structure_future_work` / `derive_workforce_requirements` need an owner
   egress grant; personal and free-text tasks (`extract_cv`, `explain_match`, `normalize_*`,
   `draft_follow_up`, `translate_*`, `propose_conversation_intent`) stay refused for every free tier
   with a typed privacy refusal that never counts as a run.

## 8. Defect found by the first production walks (fixed in this PR)

`POST /api/assistant/transcript` refused every browser write with 403 since the move: its
same-origin check compared `Origin` with `new URL(req.url).host`, which on the self-hosted server
is the **bind host** `0.0.0.0:3000` (measured: `Origin: https://labourmarket.ai` → 403,
`Origin: http://0.0.0.0:3000` → 400). Result: no `assistant_messages` row was written after the
cutover (DB: last row 2026-10-15), the `chat-continuity` walk failed. Fix: `lib/http/same-origin-request.ts`
judges the Origin against the request's public host (the MCP door's `requestPublicOrigin`); the
Stripe portal return URL (`/api/billing/portal`) had the same `req.url` dependency and now uses the
same helper. Guard test: `lib/http/same-origin-request.test.ts`.

## 9. Restoring the baseline services — who acts, and how (2026-10-23)

Every step below is the OWNER's own action unless it says otherwise. No step
asks for a value in chat, a file or a PR. An agent may list secret NAMES
(`gh secret list`) and read the booleans the product shows; it never reads,
prints or sets a value.

### 9.1 Database backup (`db-backup.yml`)

**State:** never produced a backup. The 10-17 drills failed on permissions
(`permission denied for schema auth`, then `… for table profiles`), and every
night since 10-18 the job stops at *Require secrets*.

Ready (verified in the repo and run logs): `ops/vps/backup.age.pub`; the deploy
trio secrets; the forced-command receiver with its `backup` action (present in
every committed version; the installed copy is current enough to take
argument-style commands, because every deploy reaches `DEPLOY_OK`). The
receiver and the other `/root/lm-prod/bin` scripts are installed BY HAND
(`scp` + `sh lm-channel-setup.sh`); no workflow updates them.

**Default path — no database password (the owner signs in with Google):**
1. Supabase dashboard → Account → **Access Tokens**
   (`https://supabase.com/dashboard/account/tokens`) → *Generate new token* →
   scoped token: **only the LabourMarket project**, capability **Database:
   read-write** (the temporary-login-role endpoint requires `database_write`;
   the job also reads the pooler settings, `database_pooling_config_read` — if
   the first run reports `pooler config: HTTP 403`, include that permission),
   **expiry** set (e.g. 90 days; at most one year). The value is shown once.
2. On the owner's own machine: `gh secret set SUPABASE_ACCESS_TOKEN --repo bandymuks1-stack/labourmarketai`
   (hidden prompt; paste, Enter). Nothing else changes: no existing password,
   connection string or secret is touched.
3. The coordinator dispatches `db-backup.yml` with `restore_drill_only=true`
   first, then one full run (ships to the VPS).
4. Rotation: before the expiry, generate a new token and repeat step 2; then
   delete the old token in the dashboard.

What the token can do, honestly: it is a Management-API credential. With
*Database: read-write* on this project it can run SQL as an administrator
(that is how it mints the temporary role). Mitigations: one project only, one
capability, an expiry, stored only as a GitHub Actions secret read by this one
workflow (never by a pull-request job), the temporary role is deleted at the
end of every run, and pg_dump reads inside a READ ONLY transaction. A legacy
(account-wide) token would also work but reaches every project — do not use one.

**Alternative — a dedicated read role (only if the token path is refused):**
the owner runs this in the Supabase SQL editor, with a password the owner
generates locally and never shares (it changes no existing credential):

```sql
create role lm_backup with login bypassrls connection limit 2 password '<owner-generated, 32+ chars>';
grant pg_read_all_data to lm_backup;            -- SELECT on every table and sequence, every schema
alter role lm_backup set default_transaction_read_only = on;
```

`BYPASSRLS` is required: pg_dump sets `row_security = off` and stops with an
error for a role that cannot bypass RLS (PostgreSQL 17 pg_dump docs,
`--enable-row-security`). Supabase's `postgres` role has `CREATEROLE` and
`BYPASSRLS`, and since PostgreSQL 16 a role that has BYPASSRLS may create a role
with it (PostgreSQL 17 `CREATE ROLE` docs). Then the Session-pooler URI of
`lm_backup.<project-ref>` goes into `gh secret set SUPABASE_BACKUP_DB_URL`
(hidden prompt). When that secret exists it wins over the token.

**Accounts (auth.users) — the former gap:** the job now dumps `public` and
`auth` together; if `auth` cannot be read it falls back to `public` only and
says so (warning + summary line `scope=public`). The restore drill checks that
`auth.users` restored when the scope says it is there.

**Second line of defence:** on a paid Supabase plan, Dashboard → Database →
**Backups** lists the platform's own daily backups (Pro keeps 7 days). Check
that the list is not empty. On the Free plan the page offers none — the
GitHub job is then the only backup.

**Confirm on the VPS (prints names, sizes and hashes only):**
`ls -l /root/lm-prod/backups/` · `age-keygen -y /root/lm-prod/backup.age.key`
(must equal `ops/vps/backup.age.pub`) · `sha256sum /root/lm-prod/bin/lm-deploy-receive.sh`
(equals `git show origin/main:ops/vps/lm-deploy-receive.sh | sha256sum` when the
installed copy is current). Keep the offline copy of `backup.age.key` — without
it no backup can be decrypted.

### 9.2 Outbound e-mail

| Setting | Kind | Owner action |
|---|---|---|
| `LM_SMTP_HOST`, `LM_SMTP_PORT` (465 only), `LM_SMTP_USER`, `LM_SMTP_FROM` | plain settings | none if already present (check below) |
| `LM_SMTP_PASS` | **secret** (the info@ mailbox password) | `read -rs V; printf '%s' "$V" \| sh /root/lm-prod/bin/lm-env-set.sh LM_SMTP_PASS --restart; unset V` |
| `INVITE_EMAIL_PROVIDER=smtp` | owner switch (invitation + notification mail; without it a complete mailbox sends GDPR notices only) | `printf smtp \| sh /root/lm-prod/bin/lm-env-set.sh INVITE_EMAIL_PROVIDER --restart` if absent |
| `INVITE_EMAIL_FROM` | optional plain setting | only to override the sender |
| Supabase Auth e-mail (sign-up confirmation, password reset) | Supabase dashboard → Authentication → SMTP | separate from the platform mailbox |

Observe without reading a value: `cut -d= -f1 /root/lm-prod/env | grep -E '^(LM_SMTP_|INVITE_EMAIL_)'`
on the VPS (names only), or `/dashboard/admin/launch-readiness` → *mail* panel
(per-setting present/missing, port supported, invitations on/off; superadmin only).
A notification mail is still sent only to people whose own preference turned
e-mail on (default OFF). GDPR erasure notices also need the VPS cron (§7.1).

### 9.3 AI runtime

Since 10-19 every `ai_runs` row has `provider = 'disabled'`: people reach AI
surfaces and no provider answers. The hourly monitor raises
`ai-runtime-disabled` (P2) for that state and `ai-failing` when > 30 % of runs fail.

**Routing (one router, `lib/ai/runtime/`; no second one).** Task → policy tier
(`task-routing.ts`; deterministic tasks never call a model) → privacy veto per
provider (`data-egress.ts`) → free-first order (`provider-chain.ts`): a configured
local runtime, then **Cloudflare Workers AI → Mistral → Groq** (all `free_tier`),
then metered vendors (Gemini only on a billed key). On 429 / 5xx / timeout the
next candidate is tried (each at most once per run; per-request timeout =
min(`AI_REQUEST_TIMEOUT_MS`, the task's latency ceiling)); a provider that just
failed is tried last for the vendor's `retry-after` or 30–60 s, doubling up to
15 min (`provider-cooldown.ts`). Nothing ready → the surface shows its honest
"AI unavailable" state, never a fabricated answer. Budgets unchanged:
`AI_DAILY_RUN_BUDGET` (global) + per-organization daily cap.

**What a free tier may receive: `PUBLIC` only** (no egress grant names one;
any future grant is capped at `LOW_RISK_PROJECT_DATA`).

| Provider (priority) | Env names (names only) | Free quota (read 2026-10-25) | Data terms |
|---|---|---|---|
| Cloudflare Workers AI (1) | `AI_CLOUDFLARE_ENABLED`, `CLOUDFLARE_ACCOUNT_ID`, **secret** `CLOUDFLARE_API_TOKEN` (Workers AI read+edit) | 10,000 Neurons/day on Workers **Free** (no card); past it requests fail, never billed | no training on customer content; not retained after the request |
| Mistral, free Experiment plan (2) | `AI_MISTRAL_ENABLED`, **secret** `MISTRAL_API_KEY` | rate-limited, $0 (phone verification) | may train unless the Admin → Privacy opt-out is switched off |
| Groq, free plan (3) | `AI_GROQ_ENABLED`, **secret** `GROQ_API_KEY` | per-model RPM/RPD limits shown in the Groq console | not retained by default (logs ≤ 30 d; ZDR switch), US storage |
| Gemini (metered) | `AI_GEMINI_ENABLED`, **secret** `GEMINI_API_KEY`, `AI_GEMINI_PAID_TIER_CONFIRMED=1` | none usable: the free tier may not serve EEA users | paid tier: not used for training |
| Run modes | `AI_PROVIDER_MODE=live`, `AI_PROVIDER=cloudflare` (or `mistral` / `groq`: whichever key exists), `AI_DAILY_RUN_BUDGET=200` | | |

Owner commands on the VPS — each secret from a hidden prompt, never argv; one
`--restart` at the very end (`S=/root/lm-prod/bin/lm-env-set.sh`):

```sh
read -rs V; printf '%s' "$V" | sh $S CLOUDFLARE_API_TOKEN; unset V
read -rs V; printf '%s' "$V" | sh $S CLOUDFLARE_ACCOUNT_ID; unset V
printf true | sh $S AI_CLOUDFLARE_ENABLED
read -rs V; printf '%s' "$V" | sh $S MISTRAL_API_KEY; unset V
printf true | sh $S AI_MISTRAL_ENABLED
read -rs V; printf '%s' "$V" | sh $S GROQ_API_KEY; unset V
printf true | sh $S AI_GROQ_ENABLED
printf cloudflare | sh $S AI_PROVIDER
printf 200 | sh $S AI_DAILY_RUN_BUDGET
printf live | sh $S AI_PROVIDER_MODE --restart
```

Observe: the next `ai_runs` rows for `market_explanation` carry
`provider = 'cloudflare'` (or the next free tier); personal tasks carry
`blocked_reason = 'egress_refused'` and no cost. Rollback:
`printf disabled | sh $S AI_PROVIDER_MODE --restart`.

### 9.4 Authorized admin testing

Admin = `profiles.active_role = 'admin'` OR a `profile_roles` row with
`role = 'admin'` (`lib/auth/superadmin.ts`). The database helper `is_admin()`
reads the SAME two signals (migration 0024), so an admin is an admin in the
database too: RLS admits it to admin-only rows across every organization.

The walk `spec=admin-console` (`apps/web/tests/e2e/prod-admin-console.spec.ts`)
is read-only. Its denial part (worker and company owner are refused with
`?notice=needs_operator_access`) runs today; its admin part SKIPS until an admin
session exists. Making it run needs an explicit owner approval of ALL of:
1. a sixth synthetic identity (e.g. `qa.admin+walk@labourmarket.ai`) added to the
   hard-coded allowlist in `lib/testing/prod-qa-guard.ts`, provisioned like the
   others (`app_metadata.qa_synthetic`, no organization);
2. that identity receiving the admin role (one `profile_roles` row, role `admin`
   — RED class: it grants database-wide admin reads to a session minted by
   GitHub Actions for the length of one walk);
3. the walk minting an `admin` slot in `prod-qa-walk.yml`, with the
   `production-qa` environment's required reviewer switched on for that spec.
No agent grants this role.

### 9.5 Web push notifications (COM-3 push channel, OFF by default)

Push is a third hop of the existing notifications: the same event, the same
person and the same title as the bell. It stays completely inert, and the
opt-in in the account settings stays hidden, until **all four** settings below
are present and the migration `20261023171500_web_push_subscriptions_v1` is
applied (RED, owner-approved apply via Supabase MCP only).

| Setting | Kind |
|---|---|
| `WEB_PUSH_VAPID_PRIVATE_KEY` | **secret**: 32-byte P-256 private key, base64url |
| `WEB_PUSH_VAPID_PUBLIC_KEY` | plain: the matching 65-byte public key, base64url |
| `WEB_PUSH_VAPID_SUBJECT` | plain: `mailto:` address a push service may contact (e.g. the platform mailbox) |
| `WEB_PUSH_ENABLED=true` | owner switch; any other value or none = OFF |

**1. Generate the key pair on the VPS.** It must never come from the
repository, a chat or an agent. The private key goes straight into the env
file and is never shown on screen:

```sh
node -e 'const c=require("crypto"),k=c.createECDH("prime256v1");k.generateKeys();require("fs").writeFileSync("/root/.vapid-priv",k.getPrivateKey().toString("base64url"),{mode:0o600});process.stdout.write(k.getPublicKey().toString("base64url")+"\n")'
```

The command prints the PUBLIC key only. It needs Node 18 or newer. If the
host has no `node`, run the same line on your own computer, and enter the
private key with the hidden-input variant below. Then:

```sh
sh /root/lm-prod/bin/lm-env-set.sh WEB_PUSH_VAPID_PRIVATE_KEY < /root/.vapid-priv && shred -u /root/.vapid-priv
read -r V; printf '%s' "$V" | sh /root/lm-prod/bin/lm-env-set.sh WEB_PUSH_VAPID_PUBLIC_KEY; unset V   # paste the printed public key
printf 'mailto:info@labourmarket.ai' | sh /root/lm-prod/bin/lm-env-set.sh WEB_PUSH_VAPID_SUBJECT
```

If you would rather type the private key yourself (for example, generated on
your own computer), use hidden input instead of the file:
`read -rs V; printf '%s' "$V" | sh /root/lm-prod/bin/lm-env-set.sh WEB_PUSH_VAPID_PRIVATE_KEY; unset V`.

**2. Switch it on** (only after the migration is applied):
`printf true | sh /root/lm-prod/bin/lm-env-set.sh WEB_PUSH_ENABLED --restart`.

**3. Observe** without reading a value:
`cut -d= -f1 /root/lm-prod/env | grep '^WEB_PUSH_'` (names only). In
`/dashboard/account` → Notifications, a "Push notifications on this device"
block appears. Turn it on in a browser, then trigger any notification for
that account: the device shows the bell's title, and a click opens the same
page the bell links to.

**Turning it off:** unset or change `WEB_PUSH_ENABLED` and restart. The opt-in
disappears and nothing more is sent. Stored subscriptions stay until people
turn push off or a push service reports them gone.

**Rotating the keys** invalidates every existing subscription; people must turn
push on again. Do it only if the private key may have leaked.
