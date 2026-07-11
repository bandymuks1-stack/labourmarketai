# Company-Need Owner Alert — Production Activation v1 (2026-07-11)

Owner action 2 from `non-landing-launch-repair-final-report-v1.md`, executed
for real on 2026-07-11. No secret values appear in this document, the repo,
the PR, or any log.

## Channel decision

| Candidate | State | Decision |
|---|---|---|
| Agentai OS bridge (preferred by code) | No public HTTPS endpoint exists — Agentai OS runs locally with no inbound HTTP (see `owner-alert-agentai-os-bridge-plan-v1.md` §3, still "NEEDS OWNER AGENTAI OS BRIDGE DEPLOYMENT"). No real endpoint/token values exist anywhere. | NOT activated; `AGENTAI_OS_*` env left unset (clean disabled state) |
| Standalone Telegram fallback (PR #685) | Existing owner Telegram bot + owner chat id already in use by the Agentai OS owner channel; values available in a secure local location. No new bot was created. | **ACTIVATED as the single live channel** |

## What was changed (production only)

Env vars added to the `labourmarketai` Vercel project
(`prj_ZbFhWTGNX3kNP1ztujit9INvlnIC`), target `production`, type
`sensitive`, transmitted via API body only (never echoed to a terminal,
never committed):

- `OWNER_TELEGRAM_ALERTS_ENABLED` = `true`
- `OWNER_TELEGRAM_BOT_TOKEN` = existing owner bot token `[redacted]`
- `OWNER_TELEGRAM_CHAT_ID` = existing owner chat id `[redacted]`

No other env var was added, changed, or removed (before-state had exactly
5 vars: 4 Supabase + 1 placeholder-marker flag; all untouched).

## Deployment

- New production deployment: `dpl_BoBwMgnKKZUa6Kn9drbg7ZDaXx9Q`
  (`vercel redeploy` of the previous production build so the new env is
  baked in), state **READY**, aliased to `https://labourmarket.ai`.
- Post-deploy smoke: apex 200 · www 308 → apex · app 200 · auth login 200 ·
  sitemap 200 (130 URLs, 5 locales) — all green.

## Real delivery test

- Method: direct alert-function test — the exact fallback delivery call the
  production helper makes (`sendMessage`, plain text,
  `disable_web_page_preview: true`), using the same credentials that are now
  in production env. Per the activation rules, **no fictitious public
  company-need intake row was created** — the delivery test does not
  require one.
- Test time: **2026-07-11T05:15:13Z**
- Result: **HTTP 200, `ok=true`, `message_id=936`** — the clearly-labelled
  `[SISTEMINIS TESTAS]` message was really delivered to the owner's
  existing Telegram chat.

## Safety properties (already enforced in code + tests)

- `sendCompanyNeedOwnerAlert` never throws; a send failure cannot break the
  intake insert (guarded by `telegram-owner-alerts.test.ts`).
- Alert fires only after real persistence (`persist.ok`).
- All fields whitespace-collapsed + capped at 120 chars; plain text (no
  Telegram markup mode) so user input cannot inject markup.
- Secrets are server-only env — never `NEXT_PUBLIC`, never in the client
  bundle, `no-secret-leakage` guard active.

## Rollback

Either of (no redeploy strictly needed for the flag to matter on the next
deploy; do redeploy to apply immediately):

1. Set `OWNER_TELEGRAM_ALERTS_ENABLED=false` in Vercel production env and
   redeploy → alert becomes a silent no-op (code path 3).
2. Or delete the three `OWNER_TELEGRAM_*` env vars and redeploy — the
   helper returns to the honest no-op state. Intake persistence is
   unaffected in every case.
