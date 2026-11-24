# Agentai OS ← LabourMarket.ai — daily growth export, contract v1

**Status:** route and aggregate built. The database function is a RED migration (SECURITY DEFINER + GRANT). It is
**not applied**, so the route **answers 503 until the owner applies it**. The definitions of registration and ACTIVE
were approved by the owner on 2026-10-29. The definition of COMPLETED is **flagged for owner confirmation**.

Owner directive 2026-10-29: Agentai OS is measured daily by REAL registrations and Living CVs, not by invitations sent.
This is the one door through which Agentai reads those numbers. It is aggregate-only and carries no personal data.

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
    "total": { "count": 7, "suppressed": false },
    "byAttribution": [
      { "utmSource": "nonstop", "utmMedium": "email", "utmCampaign": "worker-inbound-2026-09", "utmContent": "(suppressed)", "count": 4 },
      { "utmSource": null, "utmMedium": null, "utmCampaign": null, "utmContent": null, "count": 3 }
    ]
  },
  "activeLivingCv": { "count": 12, "suppressed": false },
  "completedLivingCv": { "count": null, "suppressed": true },
  "definitionVersion": "lm-growth-daily/v1",
  "generatedAt": "2026-10-29T06:00:00.000Z"
}
```

- **Headline counts** (`registrations.total`, `activeLivingCv`, `completedLivingCv`) are `{ count, suppressed }`.
  `count` is exact when it is 0 or at least 3. A true value of 1 or 2 is sent as `{ "count": null, "suppressed": true }`.
  Agentai should show it as "<3", never as 0 and never as a guess.
- **`byAttribution`** rows always have `count` ≥ 3. They sum to `total.count` when the total is published. When the total
  is withheld, `byAttribution` is `[]`.
- `null` in a utm field means the registration carried no such tag (organic or untagged traffic).
- `"(suppressed)"` means the field was rolled up by the small-cell rule.
- `"(unrecognised)"` means the tag held something other than `[A-Za-z0-9._-]{1,120}` (free text is never echoed).
- Rows are sorted by `count` desc, with the all-`"(suppressed)"` residual row last.
- A consumer must refuse the whole body on an unknown `definitionVersion` or an unknown key.

## Definitions

- **REAL person.** The population rule of `ops_product_metrics_v1`, used verbatim and kept identical by a test:
  QA-synthetic accounts and test domains are TEST, `@labourmarket.ai` and admins are INTERNAL, everyone else is REAL.
  Only REAL people are counted anywhere in this export.
- **Registration on day D** *(owner-approved 2026-10-29)*. A REAL account **created** during D (UTC) that has **signed
  in at least once** (through the e-mail confirmation link, OAuth, or a password).
  - An abandoned signup that never confirmed or signed in is not a registration. An invitation sent never is.
  - The account's e-mail confirmation timestamp is deliberately not read, because it is not a trusted signal in this
    database (`lib/guards/email-verified-boundary.test.ts`).
- **Attribution.** The first-touch `utm_source / utm_medium / utm_campaign / utm_content` that the signup form stores on
  the account (`components/app/signup-form.tsx` → `getFirstTouchAttribution()`).
  - It is the first touch on the browser that signed up. An invitee who first visited untagged, signed up on another
    device, or used Google/Apple sign-in shows as untagged (`null`).
  - This undercounts invitations. It never overcounts them.
- **ACTIVE (recently updated) Living CV on day D** *(owner-approved 2026-10-29)*. A REAL person with a worker profile who
  **recorded at least one live (not deleted) Work Journal entry** in the 30 days ending with D (UTC).
  - A signup, onboarding, CV upload, or self-declared skills alone are **not** activity.
  - Historical people an organization imported but who never claimed an account are not counted.
- **COMPLETED (filled) Living CV** *(⚠️ flagged for owner confirmation)*. A REAL person with a worker profile whose CV
  holds **all five parts of the product's own CV checklist** (`lib/conversation/worker-activity.ts`, the percentage a
  worker sees):
  1. their own summary (`profiles.profile_text` not blank);
  2. at least one skill (`profile_skill_claims`);
  3. at least one language (`worker_languages`);
  4. an availability status (`workers.availability_status`);
  5. at least one **real** work-history entry: an engagement that has a title or an organization.

  One deliberate tightening of the product checklist: every worker automatically gets an untitled, organization-less
  engagement when their profile is created (migration `20260702140000`). That makes the in-product "work history" step
  true for everyone, so here it does **not** count.

  COMPLETED is a **state measured at read time** (`generatedAt`), not an activity on D. The CV fields carry no
  history, so it cannot be measured "as of" an earlier day. A CV completed a year ago and never touched since counts as
  COMPLETED and not as ACTIVE. The two counts overlap but are separate numbers.

### Open for the owner

1. **Confirm COMPLETED** as defined above, or name the parts it should require.
2. **Stricter ACTIVE (optional, later).** "≥1 entry in the window **confirmed by someone other than the person**"
   (the `review-status.ts` definition) would ship as `lm-growth-daily/v2`. v1 is never silently redefined.
3. **Lift the 1–2 suppression** only after the re-identification assessment (see below). Until then, no exact 1 or 2
   leaves this product.

## Small-cell rule (owner 2026-10-29: no exact 1 or 2)

- **Headline counts:** 1 and 2 are withheld (`suppressed: true`). 0 and anything ≥ 3 are exact.
- **Attribution groups:** a group below 3 is rolled up one level at a time (content → campaign → medium → source). What
  is still small after the source level joins one residual row whose four fields are all `"(suppressed)"`.
- **Complementary suppression:** the residual could be worked out as the total minus the visible rows. So a residual of
  1 or 2 absorbs the smallest visible rows until it reaches 3. When the total itself is withheld, no attribution row is
  published at all.
- **Per-recipient tags:** Agentai's `utm_content` is per recipient (`ns-inbound-<12hex>`), so a single invitee's tag is
  always a cell of one and is always rolled up. **Agentai should read campaign-level results, not per-recipient
  ones.**

## Drift

Day D is computed from current data each time it is read, so numbers for a past day can change:

- A late first sign-in adds that registration to its creation day.
- An account erasure removes that person from every past day.
- COMPLETED is always the current state.

Agentai should store the value it read for D, with `generatedAt`, rather than expect it to stay fixed.

## Data protection

- **Personal data touched (inside LabourMarket.ai only):**
  - account creation and first-sign-in timestamps, the e-mail address (only to classify test and internal accounts),
    and the four first-touch utm tags;
  - presence-only reads of the CV fields above and of journal entry dates. No CV text, journal text or skill label is
    read into the result.
  - All of it is read inside one `stable` database function. Nothing per person leaves the database.
- **What leaves:** integer counts and utm labels only. Every number is 0 or ≥ 3. Labels are restricted to a slug
  charset, and per-recipient tags are always rolled up. No id, name, e-mail, phone, address, CV text or per-person
  timestamp.
- **Re-identification risk (residual, low):**
  - Exact 1–2 counts, single-invitee tags and free-text tags cannot leave this product.
  - What remains is **cross-day differencing**. For example, `activeLivingCv` going from 5 to 4 tells Agentai that
    someone's last entry left the 30-day window. That cannot be tied to a person without other data. Agentai already
    knows whom it invited, but it never receives per-person tags.
  - Repeated reads of the same day differ only by drift (see above), never by a person's attribute.
- **Retention:** LabourMarket.ai stores nothing new. Agentai retains the daily aggregates under its own policy.
- **Access control:**
  - The route requires the `SUPPLY_FEED_BEARER_TOKEN` machine secret, constant-time compared. It answers 503 while the
    secret is unset and 401 on a wrong token. There is no user or cookie path.
  - The database function has an empty `search_path`, and EXECUTE is granted to `service_role` only (revoked from
    public, anon and authenticated).
- **Legal basis (proposed; the owner and the DPO decide):** legitimate interest (GDPR Art. 6(1)(f)) in measuring the
  outcome of the acquisition partner's invitations. The output is aggregated so that it is no longer personal data
  (Recital 26). It is computed under the same purpose as the existing first-touch attribution that the signup form
  stores.

## Where it lives

- Database aggregate: `supabase/migrations/20261029120000_agentai_daily_growth_aggregate_v1.sql`
  (rollback in `supabase/rollbacks/`).
- Body and small-cell rule: `apps/web/lib/api/growth-daily.ts` (tests next to it).
- Route: `apps/web/app/api/internal/growth-daily/v1/route.ts`.
