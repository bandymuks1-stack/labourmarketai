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
| **DB backup** | `db-backup.yml`, every 4 h with a skip guard (one backup a day): `pg_dump` on the runner (`public` + `auth` + `storage` metadata + `supabase_migrations` ledger) through the owner-approved read role `SUPABASE_BACKUP_DB_URL` (or a temporary CLI login role via `SUPABASE_ACCESS_TOKEN`) → **restore drill** with exact schema-object and per-table row proof → Storage **files** + pg_cron job definitions downloaded via the Storage API and size-checked → both `age`-encrypted to the VPS public key → shipped via the forced-command receiver (`backup`) → `/root/lm-prod/backups/` (700/600), 14-day rotation | **producing backups since 2026-11-03** (drill 41636950462, full 41637888590); completeness proof + files bundle 2026-11-03 (§9.1.0) | GitHub-side dump; VPS stores ciphertext only; no DB password typed anywhere |
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

7. **Agentai's private path to the commercial requests feed** (owner decision 2026-11-07, B:
   private Docker network, no new public port). Not applied. In this order:
   1. Install the new `lm-prod-run.sh` and the vhost from `main`, compare sha256 with git.
      The script creates `lm-agentai-internal` (`--internal`) on its next run.
   2. Without waiting for a deploy: `docker network create --internal lm-agentai-internal`
      (if missing), then `docker network connect --alias labourmarket-app lm-agentai-internal labourmarket-prod`.
   3. Agentai side: `agentai-scheduler` joins the network as `external: true` in its compose file,
      and only that service. It calls `http://labourmarket-app:3000/api/internal/commercial-requests/v1`
      with `Host: labourmarket.ai`, `X-Forwarded-Proto: https` and its bearer token.
   4. Check: from the scheduler, `/api/health` on `labourmarket-app:3000` answers 200; the feed
      answers 401 with no token. One deploy later, the alias is on the new container
      (`docker network inspect lm-agentai-internal`) and the old one is gone.
   5. Then `nginx -t` and reload with the new vhost: the public path answers 404, like `/api/cron/`.
   6. Only then the two tokens (owner): `COMMERCIAL_REQUESTS_FEED_TOKEN` here,
      `AGENTAI_LM_COMMERCIAL_REQUESTS_TOKEN` in Agentai's scheduler env, and a test on both sides.
   Rollback: `docker network disconnect lm-agentai-internal labourmarket-prod`, the old vhost, and
   the old `lm-prod-run.sh`. The network itself holds nothing. Because the network is `--internal`,
   neither side gets a way out to the internet through it, but the scheduler can reach every route
   of the app on port 3000, as anyone can through nginx today.

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

**State (2026-11-03):** producing backups. The owner created the read role
behind `SUPABASE_BACKUP_DB_URL`; drill 41636950462 and full run 41637888590
were green (the first stored dump is on the VPS). Before that: the 10-17 drills
failed on permissions (`permission denied for schema auth`, then `… for table
profiles`), and from 10-18 the job stopped at *Require secrets*. What a backup
holds, and the proof, are in §9.1.0.

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

**Accounts (auth.users) — the former gap:** the job dumps `public`, `auth`,
`storage` and `supabase_migrations` together (§9.1.0); if that cannot be read it
falls back to `public` only and says so (warning + summary line `scope=public`).
The restore drill proves every dumped schema came back (§9.1.0).

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

### 9.1.0a Daily run, alerts and limits (2026-11-04)

**Daily run.** `db-backup.yml` has six schedule slots, and also starts when Quality Gates finishes on `main` (the `db-backup` freshness job too); a guard job skips the run when a backup reached the VPS in the last 18 h. A person's dispatch always runs. "Reached the VPS" means the *Ship to the VPS* step succeeded (`.github/scripts/db-backup-last-shipped.sh`): a skipped run and a `restore_drill_only` run are green and ship nothing.

**Alerts.** A failed run opens or updates one `db-backup-failed` issue, with only the run link in it, and the next backup that ships closes it. A run from a branch is a test and neither opens nor closes the issue. The `db-backup` job in `ingestion-freshness.yml` fails when no backup reached the VPS in 26 h, updates the same issue and dispatches a backup.

**What each run proves:** the dump restores into a throw-away `postgres:17` with exact schema-object counts, grants equal per schema and kind (count and hash; only counts are printed), and every table inside its source window; every Storage file by count and size; both files encrypted with `age`; the receiver re-checks the sha256 of what it received and the `age` header before storing, and answers `BACKUP_OK`.

**What it does not prove:**
- that a stored file decrypts: the drill runs on the plaintext before encryption, and the receiver never holds the key at that step. Decryption is a manual check, last done 2026-11-03 over root SSH on the VPS with the VPS's key. The owner's offline copy of the key has not been shown to decrypt;
- a restore into a real Supabase project;
- that the scope is complete on every run: if `auth` and the other schemas cannot be read, the job falls back to `public` only and stays green, with a warning;
- anything after the 14-day rotation.
- role memberships and role attributes: `pg_dump` does not hold them, so the drill creates every source role as a plain role. The grants are exact; what each role can inherit is not in the backup;
- that grants apply on a real Supabase target: the drill restores as a superuser and keeps owners, which the project's `postgres` role cannot do there (§9.1.1 step 5).

**The one expected restore error.** `restore-errors=1 (harmless=1)` is `CREATE SCHEMA public;` failing because the target database already has that schema. Run 41815407585 confirms it from both sides: `restore.err` has one error line, the server log has one `ERROR`, and it is this statement. Nothing else fails with it, and the schema-object proof is exact. Any other error counts as `other`, which only warns; the object and row proofs are what fail the job.

**Last proof (2026-11-04).** Manual run 41815407585: full backup, restore drill and shipping passed. Not yet exercised: a scheduled start, the 26 h freshness job, the failure issue. A manual run makes the guard skip scheduled slots for the next 18 h, so a skipped scheduled run proves the slot fired, and only the first slot after that proves a scheduled backup.

**Independence.** The automatic copies are in one place, on the production VPS, next to the app and its key. There is no automatic second destination, which is an owner decision. Other copies: encrypted files copied by hand on 2026-11-03 to the owner's PC, which do not update, and Supabase's managed Pro backups, whose list could not be read with the tools available (they hold no Storage files).

**The scheduler is not reliable for this repository.** Measured 2026-10-28 to 11-04: `*/5` ran 31 times out of 2,017 slots, hourly workflows about 28 of 168, and six-hourly ones started 3 to 6 h late, with gaps up to 12.7 h. The 26 h check runs on the same scheduler, so if GitHub's schedule stops, the backup and its alarm stop together. A trigger outside GitHub is proposed separately and is not installed.

### 9.1.0b Backup watchdog and SEO watch: variant B (PROPOSED, NOT INSTALLED)

**Nothing here is on the VPS.** The owner held the root install on 2026-11-05 and approved preparing this variant for review only. Installing it needs a separate owner approval.

**What a merge does, as far as the repo shows.** It doesn't change the receiver, file permissions, users or schedulers: the deploy tarball holds only the app and goes only into `releases/`, the deploy key can run only `deploy`, `status`, `rollback` and `backup`, nothing in the repo updates `ops/vps` on the host, and `install-backup-watchdog.sh` stops until a separate reviewed PR fills in its pins. **But a merge does ship a new release of unchanged app code and restarts the app,** because `ops/` and `.github/` aren't docs, so the docs-only rule doesn't skip it. The VPS's actual state hasn't been read for this. If the receiver file were ever copied by hand before the group exists, its group-read lines do nothing: folder `700`, files `600`, as today.

**The live receiver already differs from `main`.** A read-only check on 2026-11-05 found the live file equal to commit `8922acf08`, while `main` has `8ebb43e93` (#3064), so the live one writes no `verified.log` and none exists in the folder. This gap exists today, with or without this PR. The install therefore brings two receiver changes: #3064's record and the group-read lines.

**The first run after an install reports `no_record`, and that is expected.** Nothing is verified until a whole pair has come through the new receiver. The installer says so, the alert mail says so, and one alert is followed by one recovery mail. The installer doesn't invent a record for the older pairs. A real `no_record` that lasts past the next backup is a real problem.

**Design**

| | Backup watchdog | SEO watch |
|---|---|---|
| User | `lmwatch`, no login, one group | `lmseo`, no login, one group, not in `lmwatch` |
| Why separate | Reads encrypted backups | Parses internet content, so it holds nothing worth taking |
| Scheduler | `lm-backup-watchdog.timer`, hourly at minute 7, `Persistent` | `lm-seo-watch.timer`, daily 05:37 UTC, `Persistent` |
| Linux capabilities | None | None |
| Database access | None | None of its own; it reads public pages as anyone does |
| Folder | `/var/lib/lm-watch` (700) | `/var/lib/lm-seo` (700) |
| Sees backups | Read-only bind at `/var/lib/lm-watch/backups` | No |
| Mail | Alerts-only credential in its `env` (600), never the main mailbox's | Same |

The kernel's file permissions are the limit, and the sandbox is a second layer. So a gap in the sandbox doesn't expose the decryption key, `env`, Docker's container configs or `/etc/shadow`: `lmwatch` has no right to read them anyway.

**Limit: file permissions can't stop a world-readable file.** Another app's careless `.env` would be readable. The units hide `/opt`, `/srv`, `/mnt`, `/media`, `/backup` and home folders, but the rest of the host stays visible. `/backup` can be listed by anyone on this host, though its current archive isn't readable, so hiding it is defence in depth only.

The read-only check on 2026-11-05 found no real secret value readable by `nobody` in the places it searched. It matched file names and common patterns, so **it isn't proof that none exists**. Repeat it if the install comes much later.

**Network:** the units can't reach `localhost`, link-local addresses such as cloud metadata, or the private ranges `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` and `fc00::/7`. The private ranges matter on this host: the read-only check showed an unprivileged user connecting directly to the app container's bridge address on its internal port, which goes round the port published on `127.0.0.1` and round nginx and Cloudflare. The host's bridge gateway addresses answered too. The local DNS stub (`127.0.0.53`) stays allowed, and the host uses that stub. A test showed this failing before the fix (run 42021975563).

**Limit:** the units can still reach the internet, which includes this host's own public address and anything it exposes there, as anyone can.

**Logs go to the journal, never a file in the service user's folder.** systemd opens `append:` files as root, before dropping to the user, and follows links, so a service user could have written into any file as root. This was shown in a test before the fix (run 42006499668).

**Proposed receiver change** (`ops/vps/lm-deploy-receive.sh`, between the `group read` markers, plus two call sites):

- Only when group `lmwatch` exists, the folder becomes `750 root:lmwatch` with setgid cleared, each stored backup and `verified.log` become `640 root:lmwatch`. `.part` files stay `600`. The key and `env` aren't in that folder and aren't touched.
- Plain files only: a link is refused, `chgrp -h`, never `-R`. If the folder itself is a link, the backup stops with `BACKUP_FAIL`. If `verified.log` is a link, nothing is written through it.
- A failure to set group read doesn't fail the backup. The watchdog then can't read the file and alerts, which is the safe direction.

**What it detects**

| Situation | Status | When |
|---|---|---|
| **No new backup: the job never started, or nothing arrived** | `stale` | Past 26 h, from the clock alone |
| No record at all | `no_record` | Next run |
| Backup failed half-way: one file of a pair | `incomplete_pair` | After 1 h |
| Transfer left behind | `failed_transfer` | After 1 h |
| Stored file with no record | `unrecorded_file` | After 1 h |
| File gone, changed size, changed bytes, not `age` | `missing_file`, `size_mismatch`, `sha256_mismatch`, `not_age` | Next run |
| A file it should read but can't | `unreadable` | Next run |
| A link or anything but a plain file in the folder | `symlink`, `unexpected_entry` | Next run |
| Modes wider than intended, setgid, wrong group or owner, an ACL | `mode_too_wide`, `wrong_group`, `wrong_owner`, `acl_present` | Next run |
| Running as root, or able to read a secret, or in `docker`, `sudo`, `adm` | `runs_as_root`, `access_too_wide` | Next run |
| Its own runs stopped for over 6 h | One "was not running" mail when it runs again | Next run |

One incident means one alert when it starts, none while it lasts, and one when it clears.

**When mail itself fails, and what stays unsolved**

- A failed alert isn't marked as sent, so the next hour tries again. The run exits 2, the unit shows as failed, and the log says `mail=failed:<code>`. **Nothing else tells a person.** There's no second route from the VPS, because that would need a new service or token, which this approval doesn't include.
- **Silence is noticeable only by a person:** a weekly "still alive" mail. If it stops coming, something is wrong. Nobody is told that it stopped.
- **From outside:** the GitHub freshness job checks the backup's age and opens the `db-backup-failed` issue, independently of the VPS. Its stale path hasn't been proven in production yet.
- **Still unsolved:** the VPS down and the freshness job broken at once; a compromised watchdog staying silent; an alert mailbox nobody reads. Accepted by the server isn't the same as arrived, so delivery needs a person to see the test mails.

**Resources**

- **Watchdog:** hourly it reads one pair of backups to hash them, with `Nice=19`, idle I/O, 50% of one CPU and 128 MB at most. One journal line an hour. Measured on the host: the newest database backup hashed in 1.12 s with 0.36 s of CPU at idle I/O, possibly from page cache. On this evidence, hashing less often isn't needed. Still watch it for a day after an install.
- **SEO watch:** about 20 public requests a day, up to 30 s each.
- **New on the host:** 2 users, 2 groups, 4 unit files, 2 folders. No port, no sudo rule, no package.
- **Cost:** 0, unless the alerts-only mail credential needs a paid mailbox; that assessment is in the private record.

**Tests**

- `ops/vps/lm-backup-watchdog.test.sh`, `ops/vps/lm-seo-watch.test.sh`: synthetic, in `quality`.
- `ops/vps/lm-watch-sandbox.test.sh`, workflow `vps-watch-tests.yml`: real users, real systemd units and the real receiver on GitHub's throw-away machine, with invented secrets and backups. It refuses to run anywhere else.
- It proves: `lmwatch` and `lmseo` can't read planted root-only secrets in Docker paths, `/opt`, `/srv`, `/var/spool`, `/etc`, or world-readable ones in `/opt`, `/srv` and `/backup`; `lmwatch` reads the backup pair and can't write or delete; no capabilities; a link as a log can't write as root; local routes, metadata, private addresses on a dummy interface and a real container on a real Docker bridge are blocked while DNS, TLS and an SMTPS connection work; the timer alerts with no new file; every alert above; rollback; the installer's real steps with test pins, and that it stops when the network rule is missing.
- **The real folder's shape:** old `archive-*.age` and `.sha256` files at `600`, an old database with no partner, several pairs and no `verified.log`. It reports `no_record` and nothing else, then `ok` after one pair through the new receiver, with old files at `640` or still at `600`.
- It doesn't send real mail or log in to a mail server.
- **It doesn't prove the production host.** That machine's systemd version, layout and other apps are different.

**Measured on the host, read-only, 2026-11-05:** 1 vCPU; systemd 255; cgroup v2; `CONFIG_CGROUP_BPF=y`; DNS through the resolved stub; ports 465 and 587 reachable with TLS 1.3 verified. Users `lmwatch` and `lmseo`, `/var/lib/lm-*` and `/opt/lm-watch` don't exist yet. Reading these doesn't prove that `IPAddressDeny` is enforced there, so the installer tests it.

**Before any install (owner, read-only on the VPS).** Run once on 2026-11-05, with the output kept private; repeat these if the install comes much later.

```bash
ps -p 1 -o comm=
```

```bash
systemctl --version | head -1
```

```bash
stat -c '%a %U %G' /root /root/lm-prod /root/lm-prod/backups
```

```bash
ls -ld /var/lib/docker; docker info --format '{{.DockerRootDir}}'
```

```bash
ls -d /*
```

Names of secret-looking files an unprivileged user could read, names only and no contents. Keep the output private:

```bash
runuser -u nobody -- find / -xdev \( -path /proc -o -path /sys \) -prune -o -type f \( -name '.env*' -o -name '*.key' -o -name '*.pem' -o -name 'id_rsa*' -o -name '*credential*' -o -name '*secret*' \) -readable -print 2>/dev/null
```

```bash
resolvectl status 2>/dev/null | head -3; ls -l /etc/resolv.conf
```

**Install, after separate approval:** a reviewed PR sets the pins in `install-backup-watchdog.sh`, then it runs as root, then `runuser -u lmwatch -- sh test-backup-watchdog-mail.sh <address>`. PASS only when someone has seen both test mails arrive.

Before any timer starts, the installer finds what answers on a private address from outside the units (containers on their internal ports, and the host's private addresses), and proves each is refused from inside both real units, with DNS and TLS still working. If any is reached, or nothing answers so it can't be proven, it stops with the timers off, and rollback below applies. It then runs the real check, which must say `ok` or `no_record`. One alert mail can go to the approved address at that point.

**Check it, once installed:** `systemctl list-timers 'lm-*'`, `journalctl -u lm-backup-watchdog -n 5`, `systemctl --failed`.

**Rollback**

```bash
systemctl disable --now lm-seo-watch.timer lm-backup-watchdog.timer
```

```bash
rm /etc/systemd/system/lm-seo-watch.* /etc/systemd/system/lm-backup-watchdog.*
```

```bash
systemctl daemon-reload
```

```bash
find /root/lm-prod/backups -maxdepth 1 -type f \( -name 'lm-db-*.dump.age' -o -name 'lm-files-*.tar.age' -o -name verified.log \) -exec chgrp -h root {} + -exec chmod 600 {} +
```

```bash
chgrp -h root /root/lm-prod/backups; chmod 700 /root/lm-prod/backups
```

```bash
userdel lmwatch; userdel lmseo; groupdel lmwatch; groupdel lmseo
```

Without the group, the receiver goes back to `700` and `600` by itself; its old copy is `lm-deploy-receive.sh.bak-variant-b`. Removing `/var/lib/lm-watch`, `/var/lib/lm-seo` and `/opt/lm-watch` is optional, and the backups' contents aren't touched at any point.

**Remaining risks**

- `lmwatch` reads encrypted backups. Useful to an attacker only with the key, which stays out of reach, but it could copy them out over the network.
- The alerts-only credential can send mail as that address. Limit it to sending, or to its own mailbox.
- Group read widens who can read the backup files, by one account. That's the change the owner is asked to approve.
- The receiver is on the backup path, so a mistake there could affect backups. It's tested, and a group-read failure isn't fatal, but it is still a change to that file.
- SEO watch presents itself as Googlebot from a non-Google address, and Cloudflare could challenge it. That would look like a false alarm.
- If `lmwatch` is ever added to another group by hand, the check catches only `docker`, `sudo` and `adm`, plus the paths it tests.
- World-readable secrets outside the hidden folders stay readable until the owner's pre-install check has been read and acted on.
- `IPAddressDeny` needs the kernel's cgroup support. The host shows cgroup v2 and `CONFIG_CGROUP_BPF=y`, but enforcement there is proven only by the installer's step, which hasn't run. The test proves it only on GitHub's machine.

### 9.1.0 What a backup holds — and what it does not (completeness, 2026-11-03)

Measured on production 2026-11-03 (counts only): base tables `public` 249,
`auth` 27, `storage` 8, `supabase_migrations` 1, `cron` 2, `realtime` 3 (one
partitioned), `vault` 1. The read role behind `SUPABASE_BACKUP_DB_URL`
(BYPASSRLS + `pg_read_all_data`) can read every one of them.

**"284 reachable vs 253 restored", explained.** 284 = 249 + 27 + 8 base tables
in `public`, `auth`, `storage`. The drill's former "public tables=253" counted
`information_schema.tables`, which lists VIEWS too: 249 base tables + 4 views
(`worker_absence_scheduling`, `lmc_lot_balances`, `lmc_account_balances`,
`market_index_v1`) = 253. Nothing extra was created and no table was lost; the
drill now prints base tables and views separately and proves them exactly. (The
same drill DID lose objects — see *Restore errors* below.)

| Schema | In the backup | Why |
|---|---|---|
| `public` | pg_dump | product data |
| `auth` | pg_dump | accounts, identities, sessions |
| `storage` | pg_dump (metadata) + **files bundle** | buckets and object rows; the FILES themselves are in no database dump (nor in Supabase's own DB backups) |
| `supabase_migrations` | pg_dump | the applied-migration ledger: what a restored database already contains |
| `cron` | job definitions in the files bundle (`cron-jobs.csv`) | its tables belong to the pg_cron extension; a schema dump would carry data for tables a restore cannot create. The target's pg_cron recreates them; jobs are re-scheduled from the CSV |
| `vault` | **not backed up, on purpose** | Supabase-managed secrets encrypted with this project's own key: ciphertext is useless elsewhere and must not travel; the owner re-enters secrets |
| `realtime` | **not backed up, on purpose** | Supabase runtime (subscriptions, short-lived broadcast partitions), recreated by the platform; no product data |

**What the nightly drill proves** (job summary, counts only): per schema, the
exact number of tables, views, indexes, constraints, policies, triggers and
functions equals the source; the grants match per schema and kind, by count and by
hash of (object, grantee, privilege, grant option), and a difference fails the job
(proven by an injected extra grant, run 41819279617); every table's row count lands inside its source
window [before dump, after dump] — the key tables (`profiles`, `workers`,
`organizations`, `journal_entries`, `journal_entry_confirmations`, `auth.users`,
`storage.objects`, `supabase_migrations.schema_migrations`) fail the job when
outside it, any other table only warns (busy tables such as `auth.sessions`
can move both ways between the two reads), and a table that restored EMPTY or
not at all fails; every journal entry keeps its worker. The Storage step proves
every listed object downloaded with exactly its recorded size (count + total
bytes) and that the cron export has as many jobs as `cron.job`.

**Restore errors, expected and not.** Against a plain postgres:17 the former
drill logged 195 error lines: `role "authenticated" does not exist` (RLS
policies), `data type uuid has no default operator class for access method
"gist"` (the one exclusion constraint, which needs `btree_gist`), and `schema
"public" already exists`. Only the last is harmless; the others meant policies
and a constraint were MISSING from the restored copy while the row proof still
passed. The drill now creates the Supabase roles and extensions first (what a
Supabase target already has), so the only expected error is `schema "public"
already exists`. Any other error line is printed (first ten, statement text
only) as a warning, and the exact object proof turns any missing object into a
failure.

**Receiver.** The files bundle needs the receiver from main (it accepts
`lm-files-<stamp>.tar.age` and rotates it after 14 days). Like every
`/root/lm-prod/bin` script it is installed BY HAND. Until it is, the job stores
the database dump and then fails loudly on the files bundle, naming this step.

### 9.1.1 Restoring a backup (verify first; production only with owner approval)

The nightly job proves every dump restores (the drill), but a real recovery
is a separate, owner-approved act. Order: **verify in isolation → owner
decision → (only then) production**. Never restore over production to "test".

**To prove a stored pair, use `ops/restore-stored-backup.sh`** on the owner's PC (Git Bash + Docker
Desktop), with the owner's offline key: same image, target preparation and `pg_restore` call as the
drill, no network, plaintext in the container's memory, counts only in the output, and it compares
objects, grants, key tables and Storage files with what the backup's run reported. It does not load
the VPS and it also proves the offline key.
`bash ops/restore-stored-backup.sh --run <run id> --key <key file> --db lm-db-<stamp>.dump.age --files lm-files-<stamp>.tar.age`.
Steps 1–4 below are the manual path on the VPS. Their `--no-owner --no-privileges` restore gives
readable data but leaves out owners and grants, so its result cannot be compared with the run's grant counts.

1. **Pick the pair** on the VPS: `ls -l /root/lm-prod/backups/` —
   `lm-db-<UTC stamp>.dump.age` (the database) and `lm-files-<same stamp>.tar.age`
   (Storage files + cron jobs), 600, 14 days kept. Compare their sha256 with the
   run's summary.
2. **Decrypt on the VPS into a 700 scratch directory** (the private key never
   leaves the VPS):
   `umask 077; mkdir -p /root/lm-restore/files && age -d -i /root/lm-prod/backup.age.key -o /root/lm-restore/lm.dump /root/lm-prod/backups/lm-db-<stamp>.dump.age`
   and `age -d -i /root/lm-prod/backup.age.key /root/lm-prod/backups/lm-files-<stamp>.tar.age | tar -C /root/lm-restore/files -xf -`
   → `files/storage/<bucket>/<object name>`, `files/storage-manifest.jsonl`
   (bucket, name, size, sha256 per object), `files/cron-jobs.csv`.
3. **Restore into a throw-away database first** — a local `postgres:17`
   container on the VPS, never the production project:
   `docker run -d --name lm-restore-check -e POSTGRES_PASSWORD=<local-only> -p 127.0.0.1:55433:5432 postgres:17`.
   **Prepare the target the way Supabase has it** (otherwise every policy and the
   exclusion constraint go missing):
   ```sql
   create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema extensions;
   create extension btree_gist with schema extensions;
   create extension pgcrypto with schema extensions;
   create extension "uuid-ossp" with schema extensions;
   ```
   then `pg_restore -h 127.0.0.1 -p 55433 -U postgres -d postgres --no-owner --no-privileges /root/lm-restore/lm.dump`.
   pg_restore orders the work itself (schemas → types and functions → tables →
   data → indexes and constraints → triggers → policies); one invocation restores
   all four schemas (`public`, `auth`, `storage`, `supabase_migrations` — or
   `public` only when the run's summary said `scope=public`). Expected error:
   `schema "public" already exists`, nothing else. Any other error is a missing
   object — stop and look before going further.
4. **Check what came back** (counts only, nothing printed from rows) against the
   run's summary: per-schema object counts; `select count(*)` of the key tables;
   `select count(*) from storage.objects` (= lines of `storage-manifest.jsonl`);
   `select max(version) from supabase_migrations.schema_migrations` (the newest
   applied migration); the newest `created_at` of a busy table — the point in
   time the backup holds. Files:
   `cd /root/lm-restore/files && jq -r '"\(.sha256)  storage/\(.b)/\(.n)"' storage-manifest.jsonl | sha256sum -c --quiet`
   (no output = every file intact).
5. **Owner decision.** Prefer the narrowest recovery: copy back only the
   affected rows, tables or files. A whole-database restore into a Supabase
   project replaces newer data and needs the owner's explicit approval, a
   maintenance window and a fresh dump of the current state taken first.
   Supabase's own Pro backups (Dashboard → Database → Backups, 7 days) are the
   alternative for a whole-project point-in-time restore of the DATABASE; they
   hold no Storage files either. Into a NEW Supabase project, in this order:
   1. the roles and extensions of step 3 already exist there — do not create them;
   2. `pg_restore --no-owner` as the project's `postgres` role, so the grants come back
      (the dump holds them since 2026-11-04; older dumps do not). **Not yet tested on a
      real Supabase project:** a grant made by another role can fail there. Compare the
      result with the run's `grants equal the source` line and fix any difference before
      the database serves anyone. For
      `public`, `storage` and `supabase_migrations` (`-n` each); `auth` is created
      by the platform, so restore it with `--data-only -n auth` afterwards;
   3. **Storage files** go back through the Storage API with the service-role
      key, one upload per manifest line, same bucket and name
      (`POST /storage/v1/object/<bucket>/<name>` with `x-upsert: true`); the
      bucket rows came back with the `storage` schema;
   4. **cron jobs**: for each line of `cron-jobs.csv`,
      `select cron.schedule(<jobname>, <schedule>, <command>)`;
   5. **vault secrets** are not in the backup: the owner re-enters them.
6. **Clean up** the plaintext: `shred -u /root/lm-restore/lm.dump; find /root/lm-restore/files -type f -exec shred -u {} +; rm -rf /root/lm-restore; docker rm -fv lm-restore-check` —
   `-v` also removes the container's anonymous data volume (`/var/lib/postgresql/data`), which
   otherwise keeps a second plaintext copy of the restored database on the VPS. Confirm with
   `docker volume ls -qf dangling=true` (no volume from the drill may remain).

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

Every vendor considered (Kimi, DeepSeek, OpenRouter, NVIDIA, Meta, Qwen,
Scaleway, OVHcloud, Hugging Face, DeepL Free/Pro, LibreTranslate, …), its terms,
sources and integration state live in ONE place:
`apps/web/lib/ai/runtime/provider-catalogue.ts`. Its `termsCeiling` is enforced
by `data-egress.ts` (Kimi / DeepSeek / NVIDIA trial / Meta API: excluded; DeepL
Free, Mistral free mode, OpenRouter: PUBLIC only, whatever a grant says).

**Translation** (`translate_message`): self-hosted LibreTranslate → Cloudflare
m2m100 → DeepL → the LLM chain → the original. Message text is
`SENSITIVE_FREE_TEXT`, so only a self-hosted engine (or a provider holding an
owner grant) ever receives it; the original is stored and one tap away, and a
rendering is labelled "Machine translation from …". A DeepL key ending `:fx`
is DeepL Free (`deepl_free`): its terms forbid personal data, so it is PUBLIC-only.

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
