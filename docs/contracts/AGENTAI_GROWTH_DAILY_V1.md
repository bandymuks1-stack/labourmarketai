# Agentai OS ← LabourMarket.ai — daily growth export, contract v1

**Status:** route and aggregate built; the database function is a RED migration (SECURITY DEFINER + GRANT) and
answers **503 until the owner applies it**. The definitions below are a proposal and **need owner confirmation**.

Owner directive 2026-10-29: Agentai OS is measured daily by REAL registrations and ACTIVE Living CVs, not by invitations
sent. This is the one door through which Agentai reads those numbers. It is aggregate-only and carries no personal data.

## Request

```
GET /api/internal/growth-daily/v1?day=YYYY-MM-DD
Authorization: Bearer <SUPPLY_FEED_BEARER_TOKEN>
```

- The same machine secret Agentai already holds for `/api/internal/supply-feed/first-party-v1` and
  `/api/internal/capability-readback/v1`. No new secret.
- `day` is a UTC calendar day. Default: yesterday. Only **complete** days are served: today, future days, and days more
  than 92 days back are `400 invalid_day`.

| Status | Meaning |
| --- | --- |
| 200 | The body below. A zero is a measured zero. |
| 400 | `{ ok:false, reason:"invalid_day" }` |
| 401 | Wrong or missing token. |
| 503 | `not_configured` (secret unset) or `unavailable` (database function missing or the read failed or was inconsistent). **Record as NEPAMATUOTA, never as 0.** |

## Body (`definitionVersion: "lm-growth-daily/v1"`)

```json
{
  "day": "2026-10-28",
  "registrations": {
    "total": 7,
    "byAttribution": [
      { "utmSource": "nonstop", "utmMedium": "email", "utmCampaign": "worker-inbound-2026-09", "utmContent": "(suppressed)", "count": 4 },
      { "utmSource": null, "utmMedium": null, "utmCampaign": null, "utmContent": null, "count": 3 }
    ]
  },
  "activeLivingCv": 12,
  "definitionVersion": "lm-growth-daily/v1",
  "generatedAt": "2026-10-29T06:00:00.000Z"
}
```

- `byAttribution` always sums to `total`. Sorted by `count` desc, with the all-`"(suppressed)"` residual row last.
- `null` in a utm field = the registration carried no such tag (organic or untagged traffic).
- `"(suppressed)"` = rolled up by the small-cell rule.
- `"(unrecognised)"` = the tag held something other than `[A-Za-z0-9._-]{1,120}` (free text is never echoed).
- A consumer must refuse the whole body on an unknown `definitionVersion`.

## Definitions (v1 — owner to confirm)

- **REAL person.** The population rule of `ops_product_metrics_v1`, verbatim (guarded identical by a test): QA-synthetic
  accounts and test domains are TEST, `@labourmarket.ai` and admins are INTERNAL, everyone else is REAL. Only REAL
  people are counted anywhere in this export.
- **Registration on day D.** A REAL account **created** during D (UTC) that has **signed in at least once** (through
  the e-mail confirmation link, OAuth, or a password). An abandoned signup that never confirmed or signed in is not a
  registration. An invitation sent never is. The account's e-mail confirmation timestamp is deliberately not read,
  because it is not a trusted signal in this database. A person who signs up on D but first signs in on D+1 appears in
  D from D+1 on (see Drift).
- **Attribution.** The first-touch `utm_source / utm_medium / utm_campaign / utm_content` the signup form stores on
  the account (`components/app/signup-form.tsx` → `getFirstTouchAttribution()`). First touch on the browser that signed
  up: an invitee who first visited untagged, or signed up on another device or through Google/Apple sign-in, shows as
  untagged (`null`). This undercounts invitations; it never overcounts them.
- **ACTIVE Living CV on day D.** A REAL person with a worker profile who **recorded at least one live (not deleted)
  journal entry** in the 30 days ending with D (UTC). A signup, onboarding, CV upload, or self-declared skills alone
  are **not** activity: those would be vanity proxies. Historical people an organization imported but who never
  claimed an account are not counted.

### Open for the owner

1. **Headline for "active".** v1 counts *recorded* work (evidence state "recorded", decision 0023). A stricter
   alternative is "≥1 entry in the window **confirmed by someone other than the person**" (the `review-status.ts`
   definition). It is more meaningful but will be near zero for weeks. If the owner prefers it, it ships as
   `lm-growth-daily/v2`. v1 is not silently redefined.
2. **Exact daily total.** `total` and `activeLivingCv` are published exactly, even when they are 1 or 2. They name no
   attribute of anyone. Only attribution groups are suppressed. Say so if small totals should be bucketed too.

## Small-cell rule

No attribution group with fewer than **3** registrations is published as its own row. A small group is rolled up one
level at a time (content → campaign → medium → source). What is still small after the source level joins one residual
row whose four fields are all `"(suppressed)"`. That row names no attribution, so it is published at any size. Because
Agentai's `utm_content` is per-recipient (`ns-inbound-<12hex>`), a single invitee's tag is always a cell of one and is
always rolled up to its campaign. **Agentai should read campaign-level results, not per-recipient ones.**

## Drift

Day D is computed from current data each time it is read. A late first sign-in adds to its creation day, and an account erasure removes that person from every
past day, so re-reading an old day can give a smaller number. Agentai should store the value it read for D, with
`generatedAt`, rather than expect it to stay fixed.

## Where it lives

- Database aggregate: `supabase/migrations/20261029120000_agentai_daily_growth_aggregate_v1.sql`
  (rollback in `supabase/rollbacks/`).
- Body and small-cell rule: `apps/web/lib/api/growth-daily.ts` (tests next to it).
- Route: `apps/web/app/api/internal/growth-daily/v1/route.ts`.
