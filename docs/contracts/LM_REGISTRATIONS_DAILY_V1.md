# LabourMarket.ai → Agentai OS — registrations daily, contract v1

**Status:** route, body and tests built. The database function is an **owner-gated RED migration** (SECURITY DEFINER +
REVOKE/GRANT): `supabase/migrations/20261114120000_lm_registrations_daily_v1.sql`, rollback in
`supabase/rollbacks/`. It is **not applied**. Until the owner applies it, the route **answers 503**. It never answers
200 with zeros.

Owner decision 2026-11-14: measure NEW and ACTIVE users separately for five platform groups. Those groups are workers,
employers (companies), agencies, students and education institutions. This is a minimal aggregate-only door. It does
not depend on the growth-daily export (PR #2886). It uses the same population rule and small-cell rule as that export.

## Request

```
GET /api/internal/registrations-daily/v1?day=YYYY-MM-DD
Authorization: Bearer <SUPPLY_FEED_BEARER_TOKEN>
```

- This is the same machine secret and the same check (`lib/api/supply-feed-auth.ts`) as
  `/api/internal/supply-feed/first-party-v1` and `/api/internal/capability-readback/v1`. No new secret is needed.
- `day` is a UTC calendar day and is **required**. Today is allowed: its NEW counts are partial until the day ends.

| Status | Meaning |
| --- | --- |
| 200 | The body below. A zero is a measured zero. |
| 400 | `{ ok:false, reason:"invalid_day" }`: the day is missing, malformed, not a calendar day, or in the future. |
| 401 | `{ ok:false, reason:"unauthorized" }`: the token is missing or wrong. |
| 503 | `not_configured` means the secret is unset. `unavailable` means the database function is missing, the read failed, or the result was malformed. **Record it as unmeasured, never as 0.** |

All responses carry `cache-control: no-store`.

## Body (illustrative numbers)

```json
{
  "definitionVersion": "lm-registrations-daily/v1",
  "day": "2026-11-13",
  "population": "REAL",
  "generatedAt": "2026-11-14T06:00:00.000Z",
  "groups": {
    "workers":   { "new": { "count": 4, "suppressed": false }, "active7d": { "count": 40, "suppressed": false }, "active30d": { "count": 120, "suppressed": false } },
    "employers": { "new": { "count": 0, "suppressed": false }, "active7d": { "count": 6, "suppressed": false },  "active30d": { "count": 15, "suppressed": false } },
    "agencies":  { "new": { "count": 0, "suppressed": false }, "active7d": { "count": 0, "suppressed": false },  "active30d": { "count": 0, "suppressed": false } },
    "students":  { "new": { "count": 0, "suppressed": false }, "active7d": { "count": 0, "suppressed": false },  "active30d": { "count": 0, "suppressed": false } },
    "education": { "new": { "count": 0, "suppressed": false }, "active7d": { "count": null, "suppressed": true }, "active30d": { "count": null, "suppressed": true } }
  }
}
```

- Every group key and every metric key is always present.
- A cell `C` takes one of three forms:
  - `{ "count": n, "suppressed": false }`: an exact count. `n` is 0 or at least 3.
  - `{ "count": null, "suppressed": true }`: the true value is 1 or 2 and is withheld. Show it as "<3", never as 0.
  - `{ "count": null, "suppressed": false, "unmeasured": true }`: this metric cannot be measured from existing data
    for this day. Show it as unmeasured, never as 0.
- The body holds counts only. It has no id, e-mail, name or per-person timestamp. `generatedAt` is the read time.
- A consumer must refuse the whole body if `definitionVersion` is unknown.

## Definitions

### REAL population

The rule from `ops_product_metrics_v1` is used verbatim, for both people and organizations. A test keeps the text
identical to `20261013140000_ops_product_metrics_staff_acceptance_v2.sql`.

- **TEST:** `app_metadata.qa_synthetic`, `qa.*@labourmarket.ai`, and example / `.invalid` / `.test` domains. An
  organization is also TEST when it is labelled QA-SYNTHETIC, [E2E] or E2E-FIXTURE.
- **INTERNAL:** `@labourmarket.ai` addresses and `profiles.active_role = 'admin'`.
- **REAL:** everyone else. Other organizations take the population of their owner.

Only REAL is published. The aggregate also returns TEST and INTERNAL so the route can check the shape of the result.
Those two never leave the product.

### Groups

The groups come from the actual schema, measured read-only in production on 2026-11-14. Groups may overlap: a student
is usually also a worker.

| Group | Who counts |
| --- | --- |
| `workers` | A person (auth account) with a `public.workers` row, or an active `worker` entry in `public.profile_roles`. |
| `students` | A person with an `education_cohort_members` row whose status is `active` or `left`, meaning they were admitted to a cohort. Requested, declined and withdrawn memberships do not count. |
| `employers` | A **claimed**, non-archived organization of type `company` that is not an education institution. |
| `agencies` | A **claimed**, non-archived organization of type `agency`. |
| `education` | A **claimed**, non-archived organization that holds the `training_provider` organization role, or owns a non-archived `education_programs` row. In production these are organizations of type `company`, so they are taken out of `employers`. |

Discovered organizations (`claim_state = 'discovered'`, imported and unclaimed) are not registrations, and they are never
counted.

### Metrics

- **`new`:** a subject in the group that was created during `day` (UTC).
  - For people this is `auth.users.created_at`. For organizations it is `organizations.created_at`.
  - Group membership is read at the time of the request. For example, a person created on `day` who joined a cohort
    later is counted as a new student for `day`.
- **`active7d` / `active30d`:** a subject in the group with a sign-in or a meaningful production event in the last
  7 or 30 days, **as of read time** (`generatedAt`).
  - A person counts if their latest sign-in (`auth.users.last_sign_in_at`) or their latest production `pilot_events`
    row falls in the window.
  - An organization counts if its owner or an active member (`company_memberships`) is such a person.
  - **Limitation:** auth stores only the **latest** sign-in, so a past window cannot be reconstructed. ACTIVE is
    therefore published only when `day` is today or yesterday (UTC). In that case the window ends at `generatedAt`,
    not at the end of `day`. For any older day, `active7d` and `active30d` are `unmeasured`.

### Unmeasured

- All five groups exist in the schema today, so every group is measured.
- If the aggregate returns an explicit `null` for a metric, the route publishes it as `unmeasured`. This is reserved
  for a group or metric that later stops being measurable.
- A **missing** group or metric, or anything that is not a non-negative integer, is a 503. It is never treated as
  `unmeasured` and never as 0.

## Small-cell rule

- 1 and 2 are always withheld, as `{ count: null, suppressed: true }`. 0 and anything from 3 up are exact.
- This matches the export rule in `AGENTAI_GROWTH_DAILY_V1.md`.

## Drift

The counts for a past day can change when they are read again:

- An erased account disappears from every day.
- A discovered organization that is claimed later keeps its discovery `created_at`. It then appears as new on that
  earlier day.
- Group membership is read at request time.

Agentai should store the value it read, together with `generatedAt`.

## Data protection

- **Read inside LabourMarket.ai only:**
  - account creation and latest-sign-in timestamps;
  - the e-mail address, used only to classify TEST and INTERNAL;
  - organization names, used only for the QA label rule;
  - presence-only reads of group membership tables and of event timestamps.
- All of it is read inside one `stable` database function. Nothing per person leaves the database.
- **What leaves:** REAL integer counts. Every count is 0 or at least 3.
- **Access control:**
  - The route uses the machine secret with a constant-time comparison. It answers 503 while the secret is unset, and
    it has no cookie or user path.
  - The function has an empty `search_path` and definer rights. EXECUTE is granted to `service_role` only and revoked
    from public, anon and authenticated.
- **Network exposure:** the route uses the same pattern as the two routes that share its secret
  (`supply-feed/first-party-v1` and `capability-readback/v1`). nginx proxies it, and the bearer token protects it.
  Only `/api/internal/commercial-requests/` is 404'd at nginx (`ops/vps/labourmarket.ai.nginx.conf:40`, beside `/api/cron/` at line 38) and read on the private Docker network.
  - Moving this route to the private network is a later ops change for the owner: add an nginx `return 404` location,
    and have Agentai call `http://labourmarket-app:3000`.

## Where it lives

- Database aggregate: `supabase/migrations/20261114120000_lm_registrations_daily_v1.sql` (owner-gated, not applied).
  The rollback is `supabase/rollbacks/20261114120000_lm_registrations_daily_v1.down.sql`.
- Body, day rule and small-cell rule: `apps/web/lib/api/registrations-daily.ts`.
- Route: `apps/web/app/api/internal/registrations-daily/v1/route.ts`.
- Canonical fixtures in `docs/contracts/fixtures/`: `lm-registrations-daily-v1.sample.json` (200),
  `lm-registrations-daily-v1.error-503.sample.json` and `lm-registrations-daily-v1.error-401.sample.json`.
  - They are **generated by the real route handler**, never written by hand. The exported `GET` is called with a fake
    data source holding synthetic counts (including a count of 2, which is suppressed, and an unmeasured group) at a
    fixed clock. Each file holds the exact response bytes.
  - `apps/web/lib/api/registrations-daily-contract-fixtures.test.ts` regenerates them and byte-compares them with the
    committed files, so any drift fails. To regenerate:
    `UPDATE_CONTRACT_FIXTURES=1 npx vitest run lib/api/registrations-daily-contract-fixtures.test.ts` (in `apps/web`).
  - The Agentai consumer tests its parser against byte-identical copies of these files.
- Route tests: `apps/web/lib/api/registrations-daily-route.test.ts`. They live under `lib/` because the vitest projects
  only include `lib/**`.
