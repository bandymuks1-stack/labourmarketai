# Premium completion — canonical execution register

Owner directive 2026-10-09 (P0). One register, one coordinator. This file is the
single place for status; do not start a parallel register. Authority for what the
product IS: `docs/OWNER_TARGET_ARCHITECTURE_V1.md`. Run
`node .github/scripts/product-truth.mjs` before architectural changes.

Evidence rule: no gate is passed without evidence. Audit rows below are
**code-read evidence only** (imports, register) until a rendered pass at 375 and
1280 px confirms them.

## Gates

| Gate | State | Evidence needed |
|---|---|---|
| 1 Functional completeness | OPEN | each in-scope workflow technically verified or recorded as deferred |
| 2 Internal premium quality | OPEN | all core routes on the premium grammar, 375 + 1280 screenshots |
| 3 Public landing | NOT STARTED (waits on 2) | 3-second test, registration path, LCP budget |
| 4 Human-like QA | NOT STARTED (waits on 2+3) | browser journeys, synthetic identities, read-back |
| 5 Production proof | NOT STARTED | green checks, deploy verified |

## Design base (decided by owner 2026-10-09)

Build on `main`. Base grammar = `components/app/premium/grammar.tsx` (Stamp,
Eyebrow, Accented, RegionHead, LevelMark, EvidenceBar), proven on `/cv` and the
"Your opportunities" block. Port only needed pieces of PR #2110 / #2125, route by
route. Do not merge either stack wholesale (landing guards conflict with #2205).

## Lane B — internal premium (code-read audit)

| Route | Class | Next |
|---|---|---|
| `/cv` | PREMIUM | keep |
| opportunities | PARTIAL | re-skin lower bands (premium block sits above ~2,200 legacy lines) |
| home | PARTIAL | RegionHead/Eyebrow rhythm; link to Living CV |
| journal, planning | PARTIAL | unify evidence vocabulary (EvidenceState vs LevelMark) |
| talent | PARTIAL | PersonIdentityCard |
| profile | LEGACY | slice 1 |
| hours | LEGACY | slice 3 |
| projects, projects/[id], operations | LEGACY | raw status/attention badges |
| company/*, candidates | LEGACY | |
| communication, inbox | LEGACY | |
| listings, services, buyer, network | LEGACY | |

Raw enum leak confirmed: `components/app/agency-workers-section.tsx:374`
(`{inv.status}`). Add a guard against raw enum rendering.

## Lane A — functional (register-derived; no row is BROKEN)

Capability register: 34 usable, 69 partial, 16 human-UI-proven. Candidate
actions, to be verified before work (some register notes pre-date merged work):

1. DEM-4 ingestion — OWNER POLICY 2026-10-09 (#2241): daily completeness is sufficient. NAV 4 scheduled runs/day + bounded self-rearming catch-up (>=600 s spacing, stops at feed head); Sweden 3 stream runs/day (+ transient invalid_json retry, #2239); ingestion-freshness.yml checks each source every 6 h, stale after 26 h, one incident per source, bounded recovery. NAV catch-up MEASURED (#2244; 2026-10-09 21:14Z wall = feed 2026-09-02 06:28Z; 3.7 wall-h covered 41 source-h, but weekday-daytime pages run ~1 source-h per wall-h, so head ETA stays a range) ( feedPositionAt = newest consumed sistEndret, source time): 2026-10-09 18:59Z wall = feed at 2026-09-01 12:41Z, i.e. ~38 days behind. Rate is source-density dependent: ~4 source-h per wall-h on weekday daytime, much faster overnight (Aug 31 13:09 -> Sep 1 12:41 in 1.5 wall-h). Rough head ETA 4-10 days of continuous chaining; refine from accumulating runs. Cursor token changes are NORMAL progression (UUID rotates after ~#900-1000, suffix monotonic, no UUID reused, 13:57Z-16:45Z), not resets. Throughput bound = 1 feed request (~117 entries) + 100 detail fetches per ~3 min session (NAV request budget). Withdrawals VERIFIED: non-ACTIVE/missing status -> removed, no contact data (17 inactive NAV rows 10-09). Track separately: last session / last verified head catch-up / backlog / new+updated / withdrawn / failures. Verify withdrawal handling against the source rules. #2227 watchdog stays unapplied (needs a new owner decision).
2. MKT-2 universal marketplace — APPLIED in production 2026-10-07 (ledger 20261007155109/155211/155215/160116). No approval needed; remaining work is UI + walk evidence.
3. CAL-6 / COM-2 expiry — NOT scheduled. Both RPCs refuse a service-role caller. Package: new migration adding two service_role-only wrapper RPCs (sweep_expire_stale_booking_requests_v1, sweep_expire_contact_disclosure_requests_v1) + /api/cron/expiry-sweeps + daily workflow. RED (SECURITY DEFINER + GRANT). Pre-apply checks: booking_request_events.actor_id nullable; contact_disclosure_log_change accepts null actor. Owner approval required before apply.
4. DEM-6 team offers — APPLIED in production 2026-10-08 (ledger 20261008050149), 0 rows; remaining work is UI + walk evidence.
5. PER-2/PER-3 profile headline/bio editor mounted on the profile page?
6. COM-3 notifications: prove all types end to end.
7. PER-12 GDPR export completeness.
8. WRK-8 / EVID-6 corrections + right of reply: human-UI proof (0 prod rows).
9. CAL-8 shifts/rotas MISSING; ten dated stores not on the calendar.
10. COM-1 team threads participant model.

i18n: 13 locale folders; add a register row for locale parity.

## Lane C — public landing (prep only; builds after Gate 2)

Gaps: abstract headline fails 3-second test; no real product views; no Living CV /
Journal sections; competing doors (signup / Jobs / free-text "Understand");
mobile CTA position unmeasured; thin projects/services; ~20 webp stages per
persona with no LCP budget; JSON-LD only Organization + WebSite; SEO title
framing differs from h1.

## Lane D — feeds/search/scheduling
See Lane A item 1. `vercel.json` has two crons only.

## Lane E — human-like QA
Inactive until Gates 2 and 3 pass.

## Opening state (final agent team, 2026-10-10)

Measured, not inferred:
- Registration is PUBLIC: Supabase auth `disable_signup=false`; email, Google,
  LinkedIn (OIDC) and Facebook enabled; email confirmation ON
  (`mailer_autoconfirm=false`) through Resend SMTP. No invite/waitlist/beta gate
  exists in code (searched). The 10-06 "Confirm email OFF" step remains an
  optional owner dashboard action, not an opening blocker.
- Production = main = 3fbf19c5; /api/health auth+db ok; vacancies current.
- Public signed-out audit (GET only, 1280 + 375 px, 6 locales, 126 unique
  header/footer/hero URLs): no P0. All 200, no 5xx, no #418, no overflow at
  375, no banned/placeholder copy, no raw keys/enums, sitemaps 24/24 sampled 200.
- Guard suite on main: 1,085 files / 18,725 tests passed.

Open, owner-gated (agents may not change):
- Mobile home: first primary CTA at ~1,035 px on 375x812 (hero photo first).
  `focus-landing` + living worker hero are hash-frozen (`landing-freeze`) —
  needs the owner's landing plan.
- `/jobs/[id]`: title is the raw source-language occupation with no brand
  suffix, no og:image, an empty market heading. Route is under the
  `public-acquisition-route-jobs` product-gate waiver (per-PR owner sentence;
  #1803 already carries part of it).
- Signed-in production walks this session: QA session mint DENIED by the
  session classifier (production reads). Not worked around. Prior walks
  (PERSON/COMPANY/AGENCY chains, 09-28 .. 10-09) stand as evidence.
- (as last read 2026-10-09; not re-read — Supabase MCP did not connect this
  session) 4 real companies `active_unverified` (one submitted request hidden from
  workers since 09-16) → operator verification at
  /dashboard/admin/company-verification (owner/admin identity).

## Owner decisions open (agents may not resolve)
ORG-2, EVID-2, MKT-7, COM-6, COM-8, GOV-1. RED drafts awaiting gate: #2227,
#2209, #2203, #2165, #2150, #1816, #1813.

## Slice log
| Slice | PR | State |
|---|---|---|
| register | #2229 | merged |
| register reconcile 2026-10-09 | #2243 | merged |
| NAV feed position (source time) | #2244 | merged |
| Living CV once + profile gold restraint | #2245 | merged |
| register 2026-10-09 b | #2247 | merged |
| one gold action per view (people, marketplace, journal) | #2248 | merged, deployed |
| structure: people readiness table + recorded-work disclosure, compact journal evidence chain, owner home confirm queue, marketplace browse-first | #2249 | merged, deployed 2026-10-10 06:01Z |
| structure: one assignments panel (no second card per project), marketplace 4 navigation groups + sub-chips | #2250 | merged, LIVE (prod build 3fbf19c5, 2026-10-10 06:39Z) |
| decision 0021 documents = readiness, not a vault | #2200 | merged 2026-10-10 |
| public entry: bare /auth/signup + /auth/login no longer 404 (locale-constrained shortcuts), /privacy + /terms aliases, footer double full stop, report-only CSP console error | this PR | open |
| agency /talent + /opportunities redirects | - | INTENTIONAL: role-gated-routes.ts (talent = admin-only operator console; opportunities = worker role), refusal carries a reason notice; pinned by role-gated-routes.test.ts; no change |
| #2242 lane B pass | #2242 | merged 2026-10-09 |
| #2240 PGRST303 bounded retry | #2240 | merged 2026-10-09 (owner-authorized); prod verification pending |
| #2235 expiry RED | #2235 | MIGRATION UNAPPLIED in production. ISOLATED TEST PASSED 2026-10-10 (preview DB bfktirnptrmpzhptguja, 385-migration schema, synthetic data): T1 anon/authenticated refused 42501, service_role only; T2 2 bookings + 1 disclosure expired exactly, kept rows untouched, every audit event = system identity; T3 rerun 0; T4 role-holding actor 42501, unprovisioned P0001, window 0 -> 22023; T5 rollback removes 4 fns, keeps expired rows/audit/identity. Evidence on PR comment. New Supabase branch not creatable (plan needs Pro). Recommendation: apply the reviewed file via MCP apply_migration, then merge PR, then enable the cadence workflow. System identity PROVISIONED 2026-10-09 (owner-approved sequence): auth user 1fb04546… banned to 2126, unconfirmed, no session/refresh/one-time token, last_sign_in null; GoTrue refused magic-link verify (403) and password grant (400) 'User is banned'; profile 'LabourMarket system' role-less (active_role null, 0 profile_roles), not onboarded, no org, no consents; trigger-created workers + engagement_contexts rows removed by id after a 0-reference check; full uuid scan of public+auth = auth.users, auth.identities, profiles only. PR CI green (guard registration + env-reader fix). BLOCKED: the rolled-back production dry run (migration + one back-dated sweep + attribution read, forced rollback) was denied by the session's auto-mode classifier; not attempted by another route. Apply only after that evidence exists. |
| React hydration #418 | #2246 | LIVE-VERIFIED 2026-10-09 (prod deploy f6e0788): 0/38 cold signed-in loads on labourmarket.ai (inbox, opportunities x10; candidates, company/planning, communication x6), 14-route live sweep clean. ROOT-CAUSED + FIXED: RSC slot props under host <main> in DashboardChrome suspended and the replayed host claim ran with an advanced hydration cursor. SlotBoundary fix; cold prod build before 2-4/12 (/opportunities), 3/6 (/inbox); after 0/48; 24-route signed-in sweep clean. Guard hydration-slot-boundary.test.ts | 