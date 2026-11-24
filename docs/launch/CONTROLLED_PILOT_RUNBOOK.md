# CONTROLLED PILOT RUNBOOK

Status: `CONTROLLED_PILOT_PACKAGE_READY_PENDING_OWNER_GO`
Prepared: 2026-08-05 (launch train §16). No invitation has been sent; no real
person or company has been contacted. This runbook activates ONLY on an
explicit owner GO.

## Shape

- 10–20 workers; 3–5 companies; one or two professional groups (recommend:
  construction finishing trades + one adjacent trade, matching existing
  supply data); one geographic zone (recommend: one Lithuanian city region).
- Assisted onboarding only — every participant is walked in personally by the
  operator; no self-serve cold traffic, no ads, no automatic outreach.
- No Stripe Live requirement for first access: pilot runs on the free plan
  with `enforced=false` entitlements (current designed state).

## Participant criteria

Workers: active in the chosen trades, smartphone-capable, Lithuanian or
Russian speaking (product is localized), willing to log real work in the
journal, consent recorded. Companies: genuinely hiring in the zone, an owner
or manager willing to create real demand, consent recorded. Exclusions: no
minors, no participants sourced from scraped lists — personal/professional
network and inbound interest only.

## Onboarding script (per participant)

1. Operator creates nothing for them — participant signs up themselves
   (assisted screen-share or in person) so the funnel telemetry is real.
2. Worker: profile → skills → availability → location → journal first entry.
3. Company: company setup → organization context → first real demand.
4. Operator records: participant id, cohort tag in `pilots` /
   `pilot_participants` (admin control room), consent timestamp.
5. Expectation-setting: pilot product, defects likely, no payment asked,
   data deletable on request (GDPR path exists in-product).

## Consent & privacy notes

- Real consent event stored via the in-product privacy consent path.
- No participant data leaves the platform; no analytics tooling beyond the
  first-party `pilot_events` (pseudonymous sessions, admin-only reads).
- Data cleanup on exit: GDPR deletion path (worker_id detach pattern proven
  by the §7.1 E3 case); operator executes on request within 30 days.

## Daily operator routine (health checks)

1. `/dashboard/admin/telemetry` — funnel counts + error events
   (`result='error'` with `error_code`), AI cost section (must stay 0 while
   AI is disabled).
2. `/dashboard/admin/launch-readiness` — conversion funnel snapshot.
3. `/dashboard/admin/pilots` — cohort outcomes; record contact/enquiry/
   booking/hire outcomes manually as they are learned.
4. Vercel deployment state green; no new Sentry/console error class (route
   smoke on the 5 core routes).
5. Defect triage (severity policy below), same-day acknowledgement to the
   affected participant.

## Funnel metrics (all measurable today or with #1015)

registration_started → signup_completed → onboarding_completed →
(worker) profile_saved / journal_entry_saved →
(company) organization_created* → demand_saved →
match_preview_generated* → shortlist_added* → contact_requested* →
booking_proposed* → booking_accepted → engagement_created* →
project_assigned* / project_completed* → experience_submitted* →
experience_published*.   (* = lands with PR #1015.)

Success thresholds for GO-to-expansion (proposal — owner confirms):
≥70% of invited workers complete profiles; ≥3 companies create real demand;
≥5 real bookings proposed; ≥2 accepted; ≥1 completed engagement with a
published experience; zero cross-tenant incidents; zero unresolved P0/P1.

## AI cost thresholds

AI stays `AI_PROVIDER_MODE=disabled` at pilot start (current prod state).
If the owner enables it mid-pilot (separate gate incl. the 90-day-retention
precondition): daily budget via `AI_DAILY_RUN_BUDGET`; alert threshold
€5/day, hard-stop €25/day — checked in the admin AI-cost view; runaway =
flip provider mode back to `disabled` (env change, no deploy).

## Defect severity policy

- P0 (stop-the-pilot): cross-tenant data visible; data loss; auth broken;
  fake success on a money-adjacent surface. Action: pause invitations, fix
  before any participant touches the affected surface again.
- P1 (fix within 24h): a core chain step (demand→booking→engagement) fails
  for a real participant; UUID-name rendering hit by a real participant.
- P2 (fix within the pilot): degraded UX, honest error states, copy issues.
- All defects logged with repro + participant impact in the daily log.

## Rollback / stop conditions

Stop the pilot (no new logins asked, participants informed) if: any P0
occurs twice; the same P1 recurs after its fix; funnel shows <30% onboarding
completion after 10 assisted attempts (product not ready signal); operator
capacity fails the daily-review promise for 3 consecutive days.
Technical rollback: Vercel instant rollback to previous deployment; DB
changes during pilot remain owner-gated exactly as now (no schema change
without the standard gate, pilot or not).

## Support route

Single operator channel (existing owner phone/Telegram — participants get
one number/handle at onboarding). In-product: the existing help-request
path (`submit_help_request_v1`) which lands in the admin control room.

## Feedback collection

Weekly 15-minute call per company; per-worker short check-in at journal
moments; structured notes into `pilot_outcomes` (contact_made /
enquiry_made / booking_accepted / hire_reported / no_outcome) — already in
schema, admin-noted.

## Go / no-go criteria

- GO for pilot start (owner decision): production QA journey proven (§14),
  launch audit green (§15), #1015 merged (funnel measurability), display-name
  Decision 1 applied (no UUID names in front of real users — §22 stop
  condition), support route confirmed.
- GO for expansion (2nd zone / self-serve): success thresholds above met,
  cost per active participant computed and acceptable, zero open P0/P1.
- GO for Stripe Live (§17 package): expansion GO + Test-Mode full proof +
  pricing economics signed off by owner. Never during the first cohort.

## Explicitly out of scope during pilot

Automatic outreach of any kind; ads; scraping; Stripe Live; paid
infrastructure; AI provider activation without its own gate; contacting
anyone who has not been personally invited by the owner.
