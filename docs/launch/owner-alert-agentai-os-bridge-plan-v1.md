# Owner Alert → Agentai OS Bridge — Plan v1 (LabourMarket.ai side)

Date: 2026-07-07. This documents the LabourMarket.ai side of routing
`/company-need` owner alerts through the **existing Agentai OS Telegram owner
channel** instead of a separate standalone Telegram bot, and the exact owner
deployment/env actions still required to make it live.

Sibling docs: [`../launch/manual-paid-launch-runbook.md`](./manual-paid-launch-runbook.md);
the Agentai OS receiver design lives in the Agentai OS repo
(`docs/agent-os/labourmarketai-owner-alert-bridge-receiver-plan-v1.md`).

---

## 1. What ships in this PR (LabourMarket.ai, code)

`lib/notifications/telegram-owner-alerts.ts` is now **bridge-aware**. On a
successful `/company-need` persistence the caller fires a best-effort owner
alert with this dispatch priority:

1. **Agentai OS bridge (PREFERRED)** — when `AGENTAI_OS_ALERTS_ENABLED=true` and
   `AGENTAI_OS_ALERT_ENDPOINT` + `AGENTAI_OS_ALERT_TOKEN` are set, it `POST`s a
   stable JSON event (below) to the endpoint with an `Authorization: Bearer
   <token>` header. **Agentai OS owns the Telegram send**, so LabourMarket.ai
   needs no Telegram bot token / chat id of its own.
2. **Standalone Telegram (FALLBACK, PR #685)** — direct Telegram `sendMessage`,
   only when `OWNER_TELEGRAM_*` is configured.
3. **No-op** — nothing configured → silent, no network call, nothing faked.

All three env groups are **server-only**, never `NEXT_PUBLIC`, never committed.
The send is best-effort, timeout-bounded (4s), and never throws — a bridge
failure cannot affect the submission, the persisted row, or the owner queue.

## 2. Event contract (LabourMarket.ai → Agentai OS)

```json
{
  "source": "labourmarketai",
  "event": "company_need_submitted",
  "severity": "info",
  "created_at": "<ISO timestamp>",
  "payload": {
    "company_name": "…", "contact": "…", "sector": "…",
    "country": "…", "city_or_region": "…", "headcount": "…",
    "urgency": "…", "start_or_date": "…", "duration": "…",
    "languages": "…", "source_path": "/lt/company-need",
    "admin_route": "/dashboard/admin/company-need-intakes"
  }
}
```

Every field is whitespace-collapsed and length-capped (120 chars). No secrets,
no raw unbounded description, no intake id (the persistence helper does not
return one; adding it would change intake semantics and is out of scope).

## 3. Why this is GATED — production topology

LabourMarket.ai runs on **Vercel**. The Agentai OS Telegram infrastructure runs
**locally** on the owner's machine as a CLI + a Telegram *getUpdates* poller
(the cleanroom `sendAgentDigest` sender) — it has **no public inbound HTTP
endpoint**. Therefore **Vercel production cannot reach Agentai OS directly**.

To make the preferred path live, the owner must expose a **public HTTPS bridge**
that reaches the local Agentai OS sender. Until then, the LabourMarket.ai code is
ready and inert (no-op or standalone fallback).

**STATUS: NEEDS OWNER AGENTAI OS BRIDGE DEPLOYMENT.**

## 4. Exact owner actions

1. **Deploy a public Agentai OS bridge** (pick one; details in the Agentai OS
   receiver plan):
   - a Cloudflare Tunnel / reverse proxy exposing a small local receiver, or
   - a tiny always-on Worker/VM that validates the bearer token + payload and
     invokes the cleanroom sender to the owner Telegram target, or
   - a hosted queue the local poller drains.
2. **Set the shared secret** on both sides (the bridge validates it).
3. **Set LabourMarket.ai env in Vercel** (server-only, never commit):
   - `AGENTAI_OS_ALERTS_ENABLED=true`
   - `AGENTAI_OS_ALERT_ENDPOINT=<https URL of the bridge>`
   - `AGENTAI_OS_ALERT_TOKEN=<the shared secret>`
4. Redeploy. With owner approval, submit one test `/company-need` and confirm
   the alert arrives in the Agentai OS owner Telegram channel; clean the test row
   via the service-role path (as in the PR #681 data-layer smoke).

## 5. PR #685 standalone helper decision

**Kept as an explicit fallback**, not removed. Env priority is: (1) Agentai OS
bridge, (2) standalone Telegram, (3) no-op. If the owner prefers a single
channel, simply leave the `OWNER_TELEGRAM_*` vars unset — the standalone path
then never activates. No breaking change to the PR #685 no-op behavior.

## 6. Security / privacy

- No Telegram token or chat id is needed in LabourMarket.ai when the bridge is
  used; the bridge token + endpoint are server-only env, never `NEXT_PUBLIC`,
  never a literal → never in the client bundle. The `no-secret-leakage` guard
  (extended in PR #685 with a Telegram-token pattern) still applies.
- The bridge call carries only the clipped, allowlisted event fields — no
  secrets, no full row, no RLS/data exposure. Private intakes are never exposed
  publicly; the alert is server→server only.
- Alerts fire only after `persist.ok`; never for unpersisted/fake events.

## 7. Validation (this PR)

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` ·
`pnpm placeholders:check` · `pnpm check:i18n-debt` ·
`pnpm check:public-seo-indexing` — reported in the PR. The bridge/standalone
behavior is exercised by `telegram-owner-alerts.test.ts` with mocked fetch (no
real network call).
