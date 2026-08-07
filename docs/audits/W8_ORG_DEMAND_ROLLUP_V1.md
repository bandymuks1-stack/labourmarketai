# W8 — org demand rollup v1 (W14-6 + the W14-7 remainder)

> Status: **W8_ORG_DEMAND_ROLLUP_V1_SHIPPED** — no new route, no migration.
> Built on the applied org demand spine `20260806200000`.

## 1. What shipped

**Half A — the W14-7 remainder.** `getCompanyDemandIntelligence()`
(`lib/intelligence/intelligence-read.ts`) widened from `profile_id = user.id`
to `organization_id = employer.organizationId` — the fix its own docblock
recorded as "a different slice" when the org column did not exist. A
co-manager now sees their organization's demand on `/dashboard/intelligence`
and `/dashboard/company/planning`; personal (NULL-org) rows stay out of the
COMPANY surface; the `is_admin()` RLS branch stays unreachable (scope still
comes from `requireEmployerCompany()`, no caller-supplied id). Both guards
that pinned the old predicate (`company-intelligence-owner-scope`,
`org-demand-scope-gates`) were updated deliberately to pin the new one and
forbid the old one returning alongside it.

**Half B — the rollup W14-6 wanted.** New reader
`lib/company/org-demand-rollup.ts` (in `lib/company/` — the spine guard pins
`scouting.ts`/`booking-actions.ts` as org-column-free): demands by bounded
status + open/total, structured share (`parseStructuredNeed`), shortlist
count, worker-interest signals joined through the org's own request ids, and
median time-to-fill over accepted org bookings. Hosted on the EXISTING
`/dashboard/reports` org view (a new route is an automatic Product-Gate A-09
RED — the `/dashboard/experiences` precedent).

**Two honest scopes, never both.** The reports demand section renders the
ORGANIZATION rollup when `requireEmployerCompany()` resolves, and falls back
to the caller's OWN requests (the pre-spine read) only when no org context
exists — a personal customer keeps their numbers. Each scope carries its own
basis label (`reports.basis.orgDemandOrg` vs `reports.basis.orgDemand`), so
the two counts cannot be mistaken for one another.

**A-12 honesty.** Time-to-fill has no denominator — production has 0
`booking_requests` rows (the marketplace loop has not closed yet). It
renders as an explicit sentence — *"Time to fill is not measurable yet — no
accepted bookings exist. No number is shown instead of real data."* — never
a zero tile. The measured tile exists and activates only when real accepted
bookings appear.

## 2. Proof

- Full guard suite **10,964 passed / 619 files** (incl. the new
  `org-demand-rollup-scope.test.ts`: org predicate on every table read, no
  profile_id predicate, no admin-route import, unmeasured-state pins,
  5-locale copy). `tsc --noEmit` + eslint clean.
- Live browser proof (local stack, org workspace selected via the real
  chip): rollup renders `OPEN 2 / TOTAL 3 / STRUCTURED 1 / SHORTLISTED 0 /
  WORKER INTEREST 0` over seeded org-attributed rows, plus the unmeasured
  sentence and the org basis label. 1440+375 captures in
  `docs/audits/evidence/w8-org-rollup/`; re-runnable via
  `apps/web/scripts/w8-org-rollup-evidence.ts` (local-only).

## 3. Copy

`reports.org.demand.{structured,shortlisted,interest,timeToFillDays,timeToFillUnmeasured}`
+ `reports.basis.orgDemandOrg`, real in lt/en/ru/nl/de (the `reports`
namespace exists only in the five active catalogs, same as before).

## 4. Not done, deliberately

- No response-rate / offer-acceptance metrics — same missing denominator as
  time-to-fill; they join when bookings exist.
- No new conversation result kind — the result-registry files are
  ring-fenced by the W8 chat guard; extending the guarded reports surface
  was the lower-risk host. A chat `demand-rollup` result can reuse this
  reader later.
- `lib/crm/pipeline.ts` (`stageCounts`) untouched — despite the W14-6 slice
  card naming it, it is the superadmin CRM intake queue, a different domain.
