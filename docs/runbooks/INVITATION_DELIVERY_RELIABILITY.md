# Invitation delivery reliability — deploy, verify, roll back

Owner P0 2026-11-13 (incident: partner referral invitation `862a91f4`, reference `lead_5d5f567d`,
`delivery_failed`, cause unrecoverable because no SMTP reason was kept). Owner decision on PR #3318:
**no merge, no migration, no deploy, no cron until separately approved.** Each step below is one
separate owner approval; nothing here runs on its own.

## What ships, in two PRs

| Stage | PR | Contents | Needs |
|---|---|---|---|
| A | #3318 `fix/cc/invitation-delivery-reliability-v1` | SMTP codes-only diagnostics, classes TEMPORARY / PERMANENT / CONFIGURATION / UNKNOWN_OUTCOME, owner state model, opened links never rotated (auto retry AND manual reprocess), bounded auto retry of confirmed-temporary failures, migration `20261113190000` + rollback | migration apply, merge |
| B | stacked on A `fix/cc/invitation-delivery-bounces-alerts-v1` | bounce (DSN) recognition from the sender mailbox (read-only), owner alerts through the EXISTING Agentai OS owner channel (one `agentai-project-event/v1` file per unique event in the Agentai OS inbox; LM never messages Telegram itself), cron install/remove script, this runbook | merge, 1 env value, script copy, cron install |

Merging to `main` deploys automatically (Quality Gates → `deploy-vps.yml`, health-checked, automatic
rollback when health fails). So **merge = deploy** for the app.

## Order (each step only after the previous one is verified)

### 1. Apply the migration (approval: "APPLY MIGRATION 20261113190000")
- Supabase MCP `apply_migration` with the exact file `supabase/migrations/20261113190000_invitation_delivery_attempts_v1.sql`.
- Additive only: 10 nullable/defaulted columns on `invitations` (metadata-only, no rewrite; 245 rows on
  2026-11-13), one new table, 6 new service_role-only functions, 2 indexes, 4 CHECKs that hold for NULL.
  No existing row value, function body, policy or grant changes.
- Safe with the CURRENT app (it references none of these objects).
- Verify (read-only SQL):
  ```sql
  select count(*) from public.invitations where delivery_attempts <> 0 or delivery_failure_class is not null; -- 0
  select public.invitation_delivery_health_v1(24);                                                           -- zeros
  select has_function_privilege('authenticated','public.record_invitation_dsn_v1(text,text,text)','execute'); -- false
  ```
- Rollback of this step alone: `supabase/rollbacks/20261113190000_invitation_delivery_attempts_v1.down.sql`.

### 2. Merge stage A #3318 (approval: "MERGE APPROVED #3318")
- Auto-deploys. Verify: `ssh agentai-vps 'readlink /root/lm-prod/current'` shows the merge sha;
  `curl -s https://labourmarket.ai/api/health` is 200.
- Behaviour change visible at once: every failed invitation send logs one line
  `[invitations] delivery_failed id=… reason=… class=… step=… reply=… enhanced=…` (no address) and is
  stored in `invitation_delivery_attempts_v1`. The manual reprocess (`lm-referral-reprocess.sh`)
  now leaves out opened links and unknown outcomes.
- Nothing is retried automatically yet (no cron).
- App rollback: `deploy-vps.yml` → *Run workflow* with the previous sha, or on the VPS
  `sudo /root/lm-prod/bin/lm-deploy-receive.sh rollback <previous sha>` (the previous release stays on disk).

### 3. Merge stage B (approval: "MERGE APPROVED #<B>")
- Auto-deploys. Adds `?mode=bounces` to `/api/cron/invitation-delivery-retry`.
- Nothing runs until step 5.

### 4. Configure (owner, on the VPS — `sh /root/lm-prod/bin/lm-env-set.sh`, values never in chat)
- `LM_IMAP_HOST=imap.hostinger.com` (the sender mailbox; same login as `LM_SMTP_USER/PASS`; IMAP 993).
- Owner alerts need NO app env and NO new secret (owner 2026-11-14: the existing Agentai OS channel).
  The host script writes each NEW alert as one `agentai-project-event/v1` file (codes and counts only) into
  `/var/lib/docker/volumes/agentai_agentai-runtime/_data/inbox/project-events` (override:
  `AGENTAI_PROJECT_EVENT_DIR`). The Agentai OS operator loop ingests it within ~30 s and its one bot
  delivers it; `OWNER_DECISION_REQUIRED` + `FAILED` is high-signal, so it is sent at once, any hour.
  One notification per unique event: ledger `/root/lm-prod/.invitation-delivery-events` — an episode
  alert once while open; a dead letter / bounce / unknown outcome again only when its count RISES.
- Restart through the normal deploy path so the container reads `LM_IMAP_HOST`.

### 5. Install the schedule (approval: "INSTALL CRON invitation-delivery")
```sh
install -m 700 ops/vps/lm-invitation-delivery-retry.sh /root/lm-prod/bin/lm-invitation-delivery-retry.sh
install -m 700 ops/vps/lm-invitation-delivery-cron.sh  /root/lm-prod/bin/lm-invitation-delivery-cron.sh
sh /root/lm-prod/bin/lm-invitation-delivery-cron.sh --dry-run   # 401 without secret, jq present, Agentai OS inbox writable, 200 health; installs nothing
sh /root/lm-prod/bin/lm-invitation-delivery-cron.sh install     # /etc/cron.d/labourmarket-invitation-delivery
```
- Schedule: `retry` every 10 min, `bounces` at :07 and :37. Its own cron file — `/etc/cron.d/labourmarket`
  is not touched.
- Also refresh the manual reprocess script: the copy at `/root/lm-prod/lm-referral-reprocess.sh`
  (2026-10-28) predates the run lock; install the repo version so manual and scheduled runs share
  `/root/lm-prod/.referral-reprocess.lock`.

### 6. Verify after the first runs
```sh
tail -5 /root/lm-prod/invitation-delivery.log          # mode=retry http=200 …, mode=bounces http=200 …
tail -5 /root/lm-prod/invitation-delivery-alerts.log   # ALERT / NOTIFY agentai-inbox / CLEAR lines, if any
ls /var/lib/docker/volumes/agentai_agentai-runtime/_data/inbox/project-events/processed | grep invitation-delivery | tail -3
```
- `unknown_outcome_open` ≥ 1 is EXPECTED right after step 1: invitation 862a91f4 is an unclassified old
  failure. It is never re-sent automatically (its link was opened); the owner decides.

## Rollback (any stage, independent)

| Undo | Command | Effect |
|---|---|---|
| Schedule | `sh /root/lm-prod/bin/lm-invitation-delivery-cron.sh --remove` | stops retry, bounce scan and owner alerts; app and data unchanged |
| Stage B app | redeploy the stage A sha (`deploy-vps.yml` dispatch or `lm-deploy-receive.sh rollback <sha>`) | `bounces` mode gone |
| Stage A app | redeploy the pre-#3318 sha | diagnostics no longer recorded; migration objects simply unused |
| Migration | app first (or keep the new app — it treats missing functions as "not applied"), then `supabase/rollbacks/20261113190000_invitation_delivery_attempts_v1.down.sql` | removes only the new objects; `delivery_status`, reservations, tokens untouched; recorded diagnostics lost (export `invitation_delivery_attempts_v1` first) |

Verified on Postgres 17 with the production table shape (2026-11-13): pre-existing data byte-identical
(md5) after forward, after every new function ran, and after rollback; forward and rollback both
re-runnable; client roles reach none of the new objects; `service_role` reaches them only through the
SECURITY DEFINER functions.

## Isolation guarantees
- The circuit breaker and every retry decision belong to the partner-referral retry run only (per-run
  state, nothing persisted). LabourMarket.ai and Nonstop Group first-contact campaigns (Agentai OS, a
  different repository and pipeline), the intake path and inviters' own sends are never paused by it.
- No new invitation or commercial mail is ever created: the retry re-sends only a partner referral
  whose own first send was authorised, whose last failure was a CONFIRMED temporary one, and whose
  link was never opened. One mail per address is enforced in the database under an address lock.
- UNKNOWN_OUTCOME is never retried: it is reconciled by a bounce for its Message-ID, or by the owner.
- The bounce reader is read-only (IMAP EXAMINE + BODY.PEEK): no message, flag or folder changes.
