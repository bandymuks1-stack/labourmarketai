# Full Product Tree — Reality Map (2026-07-05, train PR-RM)

**Baseline:** main @ `1a08e91` (PR16 merged; launch board fully green_scoped —
`runtime/audits/full-launch-readiness-final-audit-2026-07-05.md`).
**Spec:** `LABOURMARKETAI_FULL_PRODUCT_TREE_TRAIN_AFTER_PR16.md` §7 — this is the
mandatory audit/map PR before any feature work. Audit-only: no product code
changed.

**Method:** each of the 30 product-tree branches was classified from source at
`1a08e91`. Where a 2026-07-02..05 audit already proves a branch, that audit is
CITED, not re-done. Branches without a recent audit were mapped by targeted
source inspection (routes, components, tables/RPCs/migrations, server actions,
guards, i18n). Validation on this branch: `pnpm typecheck` PASS, `pnpm lint`
PASS, `pnpm test` PASS (477 files, 7214/7214) — suite untouched.

**Statuses:** GREEN (source-proven working; "scoped" deferrals documented, not
faked) / YELLOW (partial — exact gap named) / RED (missing as a product layer;
fragments listed honestly) / GATED (payments — never built in this train).

**Totals: 19 GREEN · 8 YELLOW · 2 RED · 1 GATED.**

| # | Branch | Status |
|---|---|---|
| 1 | Public acquisition / SEO / landing / signup funnel | GREEN |
| 2 | Auth / onboarding / person identity | GREEN |
| 3 | Company identity / verification / multi-company | GREEN |
| 4 | Worker profile / Player Card / CV / avatar | GREEN |
| 5 | Work journal / records / evidence / recognition | GREEN |
| 6 | Skill taxonomy / professions / multilingual | GREEN |
| 7 | Company demand creation and lifecycle | GREEN |
| 8 | Matching / scouting / fit explanation | GREEN |
| 9 | Worker opportunity board | GREEN |
| 10 | Worker interest signal | GREEN |
| 11 | Company acknowledgement / review / contacted | GREEN |
| 12 | Trust Connect | GREEN |
| 13 | Teams / brigades / group work model | YELLOW |
| 14 | Accommodation layer | GREEN |
| 15 | Transport layer | YELLOW |
| 16 | Equipment / tools layer | RED |
| 17 | Market map / locations / radius | GREEN |
| 18 | Marketplace services / offers / requests | GREEN |
| 19 | Bookings / job-project handover flow | YELLOW |
| 20 | Messages / contact permission / counterpart identity | YELLOW |
| 21 | Agency / recruiter operating flows | YELLOW |
| 22 | Owner/admin control room | GREEN |
| 23 | Sales / CRM / lead intake / operator workflow | YELLOW |
| 24 | Notifications / follow-up engine | RED |
| 25 | Internal AI agents / automation / audit logs | YELLOW |
| 26 | Localization / language scope | GREEN |
| 27 | Legal / consent / safety / anti-fake / anti-scam | GREEN |
| 28 | Analytics / telemetry / activation reporting | GREEN |
| 29 | Pricing plans / billing readiness | YELLOW |
| 30 | Payments / payment provider connection | GATED |

---

## Branch 1 — Public acquisition / SEO / landing / signup funnel

```text
Branch: 1. Public acquisition / SEO / landing / signup funnel
Current status: GREEN (scoped)
Source files: apps/web/app/[locale]/(marketing)/* (landing, for-workers,
  for-companies, for-agencies, pricing, professions, skills, vision,
  work-abroad, work-opportunities, labour-market, company-need, worker-intake,
  match-preview); apps/web/app/sitemap.ts; apps/web/app/robots.ts
Routes/components: full marketing tree above; intake forms are honest
  AI-draft previews (nothing persisted, honest disabled state without provider)
DB tables/RPCs/migrations: waitlist (apps/web/app/api/waitlist/route.ts)
Tests/guards: public-seo-indexing.test.ts, sitemap-route-truth.test.ts,
  public-no-fake-claims.test.ts, cta-honesty-clarity.test.ts,
  placeholder-marker-prod.test.ts
What is real: every marketing href resolves; worker CTA → /auth/signup;
  company CTA → /company-need bridge; placeholder governance ON; no fabricated
  traction/language claims.
What is missing: nothing launch-scoped. Billing conversion is waitlist-gated
  (owner-gated sprint — branch 29/30).
What is duplicated: none.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: runtime/audits/public-market-entry-sales-launch-audit-2026-07-05.md
  (board items public_market_entry + sales_market_entry, green_scoped).
```

## Branch 2 — Auth / onboarding / person identity

```text
Branch: 2. Auth / onboarding / person identity
Current status: GREEN
Source files: apps/web/app/[locale]/auth/{login,signup,callback,logout,
  forgot-password,reset-password}; apps/web/app/[locale]/onboarding/page.tsx;
  apps/web/middleware.ts; apps/web/lib/auth/actions.ts
Routes/components: login/signup/PKCE callback/logout/reset; onboarding wizard
  gated by profiles.onboarded_at; dashboard/start + start/company.
DB tables/RPCs/migrations: profiles (0001_initial_schema.sql, FK auth.users);
  profile_roles (0003); complete_onboarding RPC (0006, SECURITY DEFINER,
  idempotent).
Tests/guards: auth-middleware-session.test.ts,
  auth-stability-pkce-logout.test.ts, p0-auth-ui-reality.test.ts,
  auth-owner-access-bootstrap.test.ts, auth-cta-app-host.test.ts,
  player-card-identity-consistency.test.ts (board proof for user_identity).
What is real: session refresh middleware, PKCE + logout stability, one
  consolidated person identity; smoke step 1 of the final audit proves the
  path source-grounded.
What is missing: interactive browser signup with a real new account remains
  the owner's manual walk (final audit §3, deliberate).
What is duplicated: none.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: full-launch-readiness-final-audit-2026-07-05.md §1 item 2, §3 step 1.
```

## Branch 3 — Company identity / verification / multi-company ownership

```text
Branch: 3. Company identity / verification / multi-company ownership
Current status: GREEN (scoped)
Source files: apps/web/lib/company/{actions.ts,company-workers.ts,
  company-profile-shared.ts}; apps/web/lib/admin/company-verification*.ts
Routes/components: dashboard/company; dashboard/start/company
  (CompanySetupForm); dashboard/admin/company-verification (admin ladder).
DB tables/RPCs/migrations: companies (0001) + company_type allowlisted incl.
  'staffing_agency' (20260612090000_company_type_and_country_safety.sql);
  save_company_setup_v2 (can NEVER set verified);
  admin_set_company_verification (SECURITY DEFINER, audit-logged,
  20260604130000); organizations (0023, owner_profile_id) +
  engagement_contexts (multi-org membership: add_org_member,
  grant_org_manager, set_engagement_journal_review RPCs);
  company_workers (0027, legacy junction).
Tests/guards: company-verification-admin.test.ts,
  company-automatic-first.test.ts, company-role-simplicity.test.ts,
  company-worker-management-clarity.test.ts + 7 more company-* guards.
What is real: automatic-first ladder (active_unverified usable immediately),
  verified only via admin RPC; multi-org membership real via
  organizations/engagement_contexts.
What is missing: nothing launch-scoped. Legacy company_workers coexists with
  engagement_contexts (documented direction, not a user-facing duplicate).
What is duplicated: agency identity still lives in a parallel agencies table
  (tracked under branch 21, owner decision).
Minimum PR needed: no work needed (consolidation is branch 21's PR).
Payment-related: no | DB apply needed: no | External blocker: no
Proof: trust-connect-minimum-launch-audit-2026-07-05.md item 1;
  company-demand-system-launch-audit-2026-07-05.md items 1–2.
```

## Branch 4 — Worker profile / Player Card / CV / avatar

```text
Branch: 4. Worker profile / Player Card / CV / avatar
Current status: GREEN (scoped)
Source files: apps/web/components/app/worker-player-card*; apps/web/lib/player-card/
Routes/components: /dashboard/profile (canonical); /dashboard/player-card =
  pinned REDIRECT_STUB to journal (Mano CV); /cv export.
DB tables/RPCs/migrations: worker_skills.source/verified (three honest
  evidence tiers), worker_professions; private avatar bucket + signed URLs.
Tests/guards: player-card-profile.test.ts,
  player-card-identity-consistency.test.ts (one card system pinned).
What is real: ONE real data card with RLS-scoped counts; verified label only
  from verified || manager_confirmed; honest empty states.
What is missing (documented deferrals): worker languages editor (YELLOW in
  audit), public profile deliberately not built (default-closed).
What is duplicated: none — marketing FIFA card is a separate
  placeholder-governed concept (§18-marked).
Minimum PR needed: no work needed (languages editor = post-launch slice).
Payment-related: no | DB apply needed: no | External blocker: no
Proof: player-card-worker-profile-launch-audit-2026-07-05.md.
```

## Branch 5 — Work journal / records / evidence / skill recognition

```text
Branch: 5. Work journal / records / evidence / skill recognition
Current status: GREEN
Source files: apps/web/app/[locale]/dashboard/journal;
  apps/web/lib/structuring/* (offline recognition)
Routes/components: /dashboard/journal (primary nav tab).
DB tables/RPCs/migrations: journal entries + journal_entry_confirmations
  (manager confirmation spine); skill_candidate_clarifications (20260609160000).
Tests/guards: journal-realworld-recognition.test.ts (board proof),
  journal-evidence-loop.test.ts, work-journal root-cause audit.
What is real: journal → recognition → evidence tiers → CV loop, guard-pinned
  on real phrases in 12 languages.
What is missing: submitted-text editing (documented deferral).
What is duplicated: /dashboard/market/recognize pinned DUPLICATE_DRIFT
  (overlaps journal recognition; consolidation backlog).
Minimum PR needed: no work needed (recognize-route consolidation folds into
  the drift-cleanup PR, see train order).
Payment-related: no | DB apply needed: no | External blocker: no
Proof: launch board work_journal green_scoped;
  work-journal-recognition-root-cause-v1.md.
```

## Branch 6 — Skill taxonomy / professions / multilingual recognition

```text
Branch: 6. Skill taxonomy / professions / multilingual recognition
Current status: GREEN (scoped)
Source files: apps/web/lib/structuring/language-packs/* (9 packs + base
  lt/en/ru lexicon); apps/web/messages/<locale>/{skill-names,professions,
  journal,labour-market,productivity-units,relationship-types}.json ×12
DB tables/RPCs/migrations: skills, professions (0011 seed + universal
  catalogue waves, e.g. 20260704150000).
Tests/guards: offline-language-pack.test.ts, esco-taxonomy.test.ts,
  COVERED_RECOGNITION_LANGUAGES set-equality pins, 6×12 taxonomy-file pins.
What is real: 12-language offline recognition (≥15 real phrases + ≥5
  false-positive cases per language), no runtime internet dependency.
What is missing: FI full UI locale (owner decision, board-pinned); ESCO link
  curation deferred.
What is duplicated: none (universal-profession cleanup done 2026-07-04).
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: offline-multilingual-skill-recognition-audit-2026-07-04.md;
  skill-recognition-language-coverage-audit-2026-07-04.md.
```

## Branch 7 — Company demand creation and lifecycle

```text
Branch: 7. Company demand creation and lifecycle
Current status: GREEN (scoped)
Source files: apps/web/lib/demand/demand-request.ts;
  apps/web/lib/company/*
Routes/components: §17 three-step wizard → submit_demand_request (status
  hard-pinned 'submitted'); close/reopen (submitted↔closed whitelist).
DB tables/RPCs/migrations: customer_requests (0028); status-transition
  trigger 20260705150000 (APPLIED + verified on production, final audit §2);
  confirmRecognizedNeed writes payload.structured_need (confirmed_by company).
Tests/guards: company-demand-launch.test.ts, demand-status-transition.test.ts,
  demand-intake-migration.test.ts, demand-visibility-honesty.test.ts.
What is real: creation, recognition banner, company confirmation, close/
  reopen, production trigger verified live.
What is missing (documented YELLOW deferrals): submitted-text self-serve
  editing; wizard language-requirement field (column exists; matching stays
  honestly language_unknown).
What is duplicated: none.
Minimum PR needed: small — add the language-requirement field to the wizard
  (reuses existing column + matching path). Optional, not blocking.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: company-demand-system-launch-audit-2026-07-05.md.
```

## Branch 8 — Matching / scouting / fit explanation

```text
Branch: 8. Matching / scouting / fit explanation
Current status: GREEN (scoped)
Source files: apps/web/lib/market/{fit.ts,match-v1.ts,match-subject.ts};
  apps/web/lib/scouting/{scouting.ts,scout-safe-view.ts};
  apps/web/lib/admin/{matching-workbench.ts,structure-need-actions.ts}
Routes/components: dashboard/company/scouting (ranked, anonymized, shortlist);
  dashboard/admin/matching (human workbench).
DB tables/RPCs/migrations: demand_shortlist; payload.structured_need slugs
  (PR4 re-key from ESCO-only to canonical slugs fixed the RED data problem).
Tests/guards: fit-not-rating guard (bans global score), match fixtures
  (10 real), demand-shortlist-migration.test.ts.
What is real: slug-keyed fit + evidence tiers (manager 1.0 > journal 0.7 >
  self 0.4) + reasons/gaps/missingData; scouting flow end-to-end.
What is missing: radius fit uses zero coordinates by design (branch 17 owner
  decision); language stays language_unknown until branch-7 field lands.
What is duplicated: lib/staffing/fit.ts is the NON-PERSISTED marketing
  preview engine — honest by design, but a second fit vocabulary to keep from
  drifting (do not extend it; extend lib/market instead).
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: matching-scouting-reality-audit-2026-07-04.md; final audit §1 item 8.
```

## Branch 9 — Worker opportunity board

```text
Branch: 9. Worker opportunity board
Current status: GREEN
Source files: apps/web/lib/opportunities/*
Routes/components: /dashboard/opportunities (REAL_LAUNCH_SURFACE).
DB tables/RPCs/migrations: list_open_demand_for_workers
  (20260614120000 + 20260705130000 location_label) — serves status='submitted'
  from VERIFIED companies only (Model A, default-closed).
Tests/guards: worker-opportunity-board.test.ts,
  worker-opportunities-approved.test.ts, approved-route-model-a.test.ts.
What is real: approved-route gate, verified-company gate, honest empty
  states, accommodation + location label + "Verified company" badge, no
  contact leak.
What is missing: transport/tools context on cards (branches 15/16).
What is duplicated: none.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: final audit §3 step 4 (guards run against real code path).
```

## Branch 10 — Worker interest signal

```text
Branch: 10. Worker interest signal
Current status: GREEN
Source files: apps/web/lib/opportunities/* (interest actions)
DB tables/RPCs/migrations: demand_interest_signals
  (20260704230000): worker-writable statuses = honest closed set
  {interested, withdrawn}; match_snapshot captured; ownership-scoped RLS.
Tests/guards: worker-interest-signal.test.ts (migration additive + reversible,
  no external sending pinned by source scan).
What is real: express/withdraw interest with snapshot; company badge counts.
What is missing: nothing scoped.
What is duplicated: none (marketplace request loop is a different object —
  service_offering_requests, branch 18).
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: final audit §3 step 5.
```

## Branch 11 — Company acknowledgement / review / contacted state

```text
Branch: 11. Company acknowledgement / review / contacted state
Current status: GREEN
Source files: apps/web/lib/... (ack action calling the RPC);
  apps/web/app/[locale]/dashboard/candidates/page.tsx (candidate drafts,
  honestly labelled "not an account")
DB tables/RPCs/migrations: acknowledge_demand_interest
  (20260705120000, SECURITY DEFINER): owner check + whitelist
  (reviewed|contacted) + worker 'withdrawn' immutable to company; only
  status+updated_at written.
Tests/guards: company-interest-ack.test.ts (SQL pins), status sets disjoint
  and closed, honest internal-only copy.
What is real: the full internal contacted-state loop — "contacted" exists
  only as the real internal state (no external sending anywhere).
What is missing: nothing scoped.
What is duplicated: none.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: final audit §3 step 6; company-demand audit item 11.
```

## Branch 12 — Trust Connect

```text
Branch: 12. Trust Connect — verified company, worker evidence, references,
  risk labels
Current status: GREEN (scoped)
Source files: apps/web/lib/guards/trust-connect-minimum.test.ts (consolidated
  pins); deriveJobDemandRiskFlags (demand intake)
Routes/components: "Verified company" badge on worker board keyed ONLY on
  route_status === 'approved_direct_partner' (real signal, never copy).
DB tables/RPCs/migrations: companies.verification_status;
  worker_skills.verified/source tiers.
Tests/guards: trust-connect-minimum.test.ts, fit-not-rating guard (global
  rating scores banned by §19).
What is real: verification ladder, three evidence tiers, unknowns as
  missingData codes, risk flags = missing-information signals only.
What is missing (documented LATER): cross-party references/endorsements;
  worker document verification UX beyond consent scaffold; company-side risk
  surfacing on scouting.
What is duplicated: none.
Minimum PR needed: no work needed for launch minimum; §8.7 expanded minimum
  (references where model supports them) is the train's later slice.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: trust-connect-minimum-launch-audit-2026-07-05.md.
```

## Branch 13 — Teams / brigades / group work model

```text
Branch: 13. Teams / brigades / group work model
Current status: YELLOW
Source files: apps/web/lib/staffing/worker-intake.ts (WORKER_ENGAGEMENT_TYPES
  incl. 'brigade'; teamSize/teamProfessions/tools — marketing preview,
  non-persisted); apps/web/lib/staffing/company-need.ts (NEED_TEAM_SHAPES
  solo|team|brigade — preview)
Routes/components: no team surface. Persisted fragments only.
DB tables/RPCs/migrations: workers.team_available + solo_available
  (20260613100000); customer_requests.team_size (0028); organizations (0023)
  + engagement_contexts + agency_workers/company_workers as the reuse base
  for membership.
Tests/guards: employer-need-structured-fields.test.ts (team_size),
  worker-intake.test.ts (brigade parsing).
What is real: team/solo availability prefs (persisted), demand team_size
  (persisted), brigade engagement type (preview only).
What is missing (exact gap): team identity + membership + capability summary
  + availability summary + visibility in matching (§8.3 minimum). No team
  entity exists.
What is duplicated: nothing yet — the §8.3 rule is to build ON organizations/
  engagement_contexts, NOT a new team subsystem.
Minimum PR needed: feat(teams): team identity as an organization kind +
  membership via engagement_contexts + capability/availability summary
  read-only card. Additive migration required.
Payment-related: no | DB apply needed: yes (additive) | External blocker: no
```

## Branch 14 — Accommodation layer

```text
Branch: 14. Accommodation layer
Current status: GREEN
Source files: apps/web/lib/demand/demand-request.ts
  (ACCOMMODATION_OFFER_VALUES enum whitelist → payload.accommodation);
  apps/web/lib/market/match-v1.ts (accommodation check)
Routes/components: demand intake captures the enum; worker board displays the
  localized label.
DB tables/RPCs/migrations: workers.needs_accommodation (20260613100000);
  list_open_demand_for_workers projects payload->>'accommodation' through a
  STRICT enum whitelist (20260614120000).
Tests/guards: trust-connect item 8 pin; opportunity-fit tests;
  employer-need-structured-fields.test.ts.
What is real: end-to-end — intake enum → payload → RPC whitelist → board
  display → match explanation. No fake housing guarantee anywhere.
What is missing: nothing scoped (§8.4 minimum is met).
What is duplicated: the marketing preview (worker-intake/company-need forms)
  has its own accommodation enums — honest preview, not a data path.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: trust-connect-minimum-launch-audit-2026-07-05.md item 8.
```

## Branch 15 — Transport layer

```text
Branch: 15. Transport layer
Current status: YELLOW
Source files: apps/web/lib/staffing/worker-intake.ts (TRANSPORT_SITUATIONS —
  marketing preview, non-persisted); apps/web/lib/staffing/fit.ts
  (transport fit — preview engine only)
Routes/components: NO transport on the real demand wizard, NO transport in
  the worker board RPC or card (verified: zero matches in
  20260614120000/20260705130000 and lib/opportunities).
DB tables/RPCs/migrations: workers.has_transport (20260613100000, persisted
  worker pref) — currently unread by the real matching path.
Tests/guards: staffing preview tests only.
What is real: worker-side has_transport column; honest preview-engine fit.
What is missing (exact gap): §8.5 minimum — transport provided/needed/unknown
  enum on demand intake (payload, mirroring accommodation), RPC whitelist
  projection, board display, match explanation.
What is duplicated: none (rule: extend the accommodation pattern, not a new
  subsystem).
Minimum PR needed: feat(transport): clone the accommodation enum path
  (demand-request.ts whitelist + RPC projection + board label + match-v1
  check + i18n). Requires an additive RPC replacement migration.
Payment-related: no | DB apply needed: yes (additive RPC update) |
External blocker: no
```

## Branch 16 — Equipment / tools layer

```text
Branch: 16. Equipment / tools layer
Current status: RED (fragments exist, layer not wired)
Source files: apps/web/lib/staffing/worker-intake.ts (free-text tools[] —
  marketing preview, non-persisted, brigade/zzp path only)
Routes/components: none on real surfaces.
DB tables/RPCs/migrations: skill_candidate_clarifications.tools_materials
  (20260609160000 — clarification free text, not structured); tool-adjacent
  skill slugs exist in the taxonomy (hand-tools, excavator-operator, ...).
Tests/guards: none for tools/equipment as a layer.
What is real: honest fragments only (above). Nothing claims tools support.
What is missing (exact gap): §8.6 minimum — required-tools structure on
  demand intake (enum/slug list + honest unknown fallback), worker capability
  signal reusing existing worker_skills slugs, board display, match
  explanation. No rental marketplace (explicitly out of scope).
What is duplicated: none.
Minimum PR needed: feat(equipment): structured required-tools on
  payload (whitelisted slugs from the existing taxonomy) + honest unknown +
  board/match surfacing. Additive RPC update needed.
Payment-related: no | DB apply needed: yes (additive) | External blocker: no
```

## Branch 17 — Market map / preferred locations / demand locations / radius

```text
Branch: 17. Market map / preferred locations / demand locations / radius
Current status: GREEN (scoped; radius data YELLOW by design — owner decision)
Source files: apps/web/app/[locale]/dashboard/market-map (primary nav tab)
DB tables/RPCs/migrations: preferred_locations (20260617120000, own-rows RLS,
  NO lat/lng by design); company_demand_locations (20260615120000/210000,
  signal-only write); location_label in worker RPC (20260705130000, applied).
Tests/guards: market-map-read-layer-v1.test.ts, preferred-locations boundary
  pin (employers can NEVER read a worker's locations — §20).
What is real: country tier live both sides; city tier via structured city →
  location_label; login consent signals; honest radius status (engine real,
  zero coordinates by design).
What is missing: radius DATA — pinned owner decision on the launch board:
  "offline geocode source or consented device coordinates".
What is duplicated: none.
Minimum PR needed: blocked on the owner decision; then a small
  feat(map-radius) PR wiring the chosen source. No paid visibility (train
  §8.12 rule).
Payment-related: no | DB apply needed: depends on decision |
External blocker: OWNER DECISION (radius data source)
Proof: market-map-location-radius-reality-audit-2026-07-05.md.
```

## Branch 18 — Marketplace services / offers / requests

```text
Branch: 18. Marketplace services / offers / requests
Current status: GREEN (scoped)
Source files: apps/web/lib/services/service-offerings.ts (full CRUD);
  apps/web/lib/marketplace/service-requests.ts (discover/request/respond/
  withdraw via SECURITY DEFINER RPCs)
Routes/components: /dashboard/services + /dashboard/service-requests
  (REAL_LAUNCH_SURFACE); components/app/service-offerings-section.tsx,
  marketplace-loop-section.tsx; /dashboard/marketplace = pinned REDIRECT_STUB.
DB tables/RPCs/migrations: service_offerings (20260627121713 — owner-scoped
  RLS, rate_text free text, NO amount/currency column);
  service_offering_requests (20260627145318 — 2-party RLS, RPC-only writes);
  requester_identities_for_provider RPC (minimal display_name, no contact
  leak); service_requests_seen (20260627181500).
Tests/guards: marketplace-no-fake-no-payment.test.ts,
  marketplace-already-requested.test.ts, marketplace-request-clarity.test.ts;
  honest needs-migration degradation classified in code.
What is real: provider CRUD + full request lifecycle
  (sent/accepted/declined/withdrawn) + safe provider identity. No payments,
  no ratings (§8.9 satisfied).
What is missing: nothing blocking; a consolidated marketplace guard suite
  (mirroring trust-connect-minimum.test.ts) would pin the loop in one place.
What is duplicated: none.
Minimum PR needed: optional chore(guards): consolidated marketplace loop
  guard. Otherwise no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
```

## Branch 19 — Bookings / job-project handover flow

```text
Branch: 19. Bookings / job/project handover flow
Current status: YELLOW (bookings GREEN; handover passport missing)
Source files: apps/web/lib/booking/{booking-actions.ts,booking-state.ts};
  components/app/booking-respond-buttons.tsx
Routes/components: /dashboard/bookings (REAL_LAUNCH_SURFACE);
  /dashboard/projects, /projects/[id], /projects/[id]/operations exist as the
  canonical project surface (reuse base for the passport).
DB tables/RPCs/migrations: booking_requests + booking_request_events
  (20260613100100): propose (owner, readiness_snapshot captured) /
  respond (worker ONLY, overlap conflict 23P01 blocks double-booking) /
  withdraw (owner); append-only event log; entitlement check
  hasFeature("booking_requests").
Tests/guards: booking-honesty.test.ts, booking-visibility-honest.test.ts.
What is real: full booking/agreement lifecycle without payments (§8.10
  essentially met): proposed→accepted|declined|withdrawn|expired, internal
  record, no payment collection.
What is missing (exact gap): §8.8 job/project handover passport — passport
  shell (notes/photos/checklist where safe, responsible parties,
  status/history) on top of projects/[id]/operations. Defect/warranty fields
  only if honest and gated.
What is duplicated: none.
Minimum PR needed: feat(passport): passport shell reusing the existing
  projects surface; additive migration for passport records.
Payment-related: no | DB apply needed: yes (additive, for passport) |
External blocker: no
```

## Branch 20 — Messages / contact permission / counterpart identity

```text
Branch: 20. Messages / contact permission / counterpart identity
Current status: YELLOW (messaging v1 GREEN; contact-permission model missing)
Source files: apps/web/lib/communication/{actions.ts,conversation-display.ts,
  direct-conversation.ts,communication-eligibility.ts}
Routes/components: /dashboard/communication + /[conversationId] (primary nav);
  /dashboard/inbox{,/quick,/report}; communication-composer.tsx.
DB tables/RPCs/migrations: conversations + conversation_participants +
  conversation_messages (0021 — append-only, NO UPDATE/DELETE ever,
  participants+admin RLS); original_language (20260610190000 draft column);
  admin join/revocation (20260612170000).
Tests/guards: chat-visibility-rls.test.ts, communication-migration-0021,
  communication-card-clarity, contact-open-failure-honest,
  message-context-contact-honesty (no phone/email leak),
  message-counterpart-restricted (locked chip, never fake names),
  conversations-language.
What is real: append-only internal messaging with honest counterpart display
  and no contact leak; booking alerts surface as real counts only.
What is missing (exact gap): §8.1 — contact permission STATES
  (canInitiateDirectConversation() currently returns true for v1; no
  permission model, no worker/company visibility rules beyond RLS); §8.2
  residue — abuse/spam minimum (rate caps).
What is duplicated: legacy threads/messages tables (0001) coexist with 0021
  conversations — 0021 is canonical; do not extend the legacy pair.
Minimum PR needed: feat(contact-permission): permission states + counterpart
  visibility rules wired into communication-eligibility + guards. Mostly
  app-side; small additive migration if states are persisted.
Payment-related: no | DB apply needed: maybe (additive) | External blocker: no
```

## Branch 21 — Agency / recruiter operating flows

```text
Branch: 21. Agency / recruiter operating flows
Current status: YELLOW (works for legacy holders; identity consolidation open)
Source files: apps/web/lib/agency/{actions.ts,pool-actions.ts};
  apps/web/lib/config/roles.ts (agency availability:"hidden",
  canBeAddedLater:false — "an agency is a COMPANY whose company_type is
  'staffing_agency'")
Routes/components: /dashboard/agency, /agency/pool, /start/agency,
  /dashboard/buyer, /start/buyer — 5 of the 7 pinned DUPLICATE_DRIFT routes;
  /dashboard/visual-os/agency GATED_PREVIEW (superadmin sample data).
DB tables/RPCs/migrations: agencies (0007), agency_workers (0024/0032),
  agency_worker_invitations (0025); companies.company_type ALREADY supports
  'staffing_agency' (20260612090000) — the schema hook exists.
Tests/guards: route-truth-map.test.ts pins the drift set (must SHRINK);
  agency-workers tests; requireRoleOrRedirect gates.
What is real: legacy agency dashboard + worker pool + invitations for
  existing role holders; new agency signups already closed.
What is missing (exact gap): consolidation of agency/buyer rooms into the
  canonical company workspace (known owner decision, F-D4): data path
  agencies → companies(company_type='staffing_agency'), agency_workers →
  engagement_contexts/company_workers, then REDIRECT_STUB the drift routes
  and shrink the truth map.
What is duplicated: the 5 drift routes above + /dashboard/search router page
  + /dashboard/market/recognize (7 total pinned; ceiling enforced by guard).
Minimum PR needed: refactor(agency): consolidation per owner decision —
  needs the owner to confirm the F-D4 approach before the data migration.
Payment-related: no | DB apply needed: yes (additive backfill + redirects) |
External blocker: OWNER DECISION (consolidation approach)
```

## Branch 22 — Owner/admin control room

```text
Branch: 22. Owner/admin control room
Current status: GREEN (scoped)
Source files: apps/web/lib/admin/launch-board.ts (proof-required board);
  apps/web/app/[locale]/dashboard/admin/* (15 INTERNAL_ADMIN routes)
Routes/components: /dashboard/admin (requireSuperadmin on layout AND page).
DB tables/RPCs/migrations: real head-count reads via admin-RLS client;
  unknowns render "—".
Tests/guards: owner-control-room.test.ts (green_scoped REQUIRES existing
  proof artifact — fake readiness structurally impossible),
  admin-control-room.test.ts.
What is real: KPI band with real counts, review queues, board with CI-enforced
  proof artifacts.
What is missing: live first-use funnel dashboard (deferred, owner-run script
  exists — branch 28).
What is duplicated: none.
Minimum PR needed: no work needed.
Payment-related: no | DB apply needed: no | External blocker: no
Proof: owner-control-room-launch-minimum-audit-2026-07-05.md.
```

## Branch 23 — Sales / CRM / lead intake / operator workflow

```text
Branch: 23. Sales / CRM / lead intake / operator workflow
Current status: YELLOW
Source files: supabase/migrations/0001_initial_schema.sql (leads table:
  source/status/assigned_to/notes — NO UI, NO RLS policy surface, service-role
  only = dead code); apps/web/app/api/waitlist/route.ts (real waitlist
  intake); customer_requests review via admin need-structuring/project-truth.
Routes/components: /dashboard/admin/{need-structuring,project-truth,support}
  are the real operator surfaces today; no lead queue page.
DB tables/RPCs/migrations: leads (dead), waitlist (live), customer_requests
  with 'needs_followup' status (manual operator action).
Tests/guards: admin-request-review.test.ts; no lead-queue guards (nothing to
  guard yet).
What is real: demand intake + admin review + waitlist. Owner can operate
  demand-side sales manually.
What is missing (exact gap): §8.14 minimum — one operator overview
  (users/companies/demands/interest + follow-up queue + activation signals)
  surfacing the EXISTING tables (leads, waitlist, customer_requests,
  demand_interest_signals) read-only in the control room. No outbound
  automation, no fake CRM claims.
What is duplicated: none (rule: extend /dashboard/admin, not a new CRM).
Minimum PR needed: feat(sales-os): read-only lead/intake/follow-up queue
  panel in the existing admin control room. App-side only.
Payment-related: no | DB apply needed: no (reads existing tables) |
External blocker: no
```

## Branch 24 — Notifications / follow-up engine

```text
Branch: 24. Notifications / follow-up engine
Current status: RED (fragments exist; engine missing)
Source files: honest fragments only — pending-booking count badge
  (getPendingIncomingBookingCount, real count or 0), unread message badges,
  service_requests_seen (20260627181500), customer_requests.needs_followup
  (manual), pilot_events telemetry (observability, not notifications).
Routes/components: none — no notifications table, no in-app notification UI,
  no follow-up task model, no reminders, no scheduled jobs.
Tests/guards: none for this layer.
What is real: per-surface honest badges; nothing pretends to be an engine.
What is missing (exact gap): §8.13 minimum — internal follow_up_tasks table
  (worker/company next actions + owner/operator queues), in-app surfacing.
  NO external sending, NO AI pretending to contact people.
What is duplicated: none.
Minimum PR needed: feat(follow-up): follow_up_tasks additive migration +
  honest task list on dashboard + operator queue in admin. Pairs with the
  branch-23 panel.
Payment-related: no | DB apply needed: yes (additive) | External blocker: no
```

## Branch 25 — Internal AI agents / automation / audit logs

```text
Branch: 25. Internal AI agents / automation / audit logs
Current status: YELLOW
Source files: apps/web/app/[locale]/dashboard/admin/agent-os/page.tsx
  (superadmin, read-only index of 10 agent roles → docs/agent-os/agents/*.md);
  learning framework migration 20260627132759: learning_policy_settings
  (auto-confirm DISABLED by default), learning_signals (append-only),
  learning_review_queue (pending|approved|rejected|superseded|auto_actioned);
  audit_logs (0001, append-only; written by assign_operations_role,
  provision_engagement_context, learning confirmations).
Routes/components: no suggestion review UI; audit_logs not surfaced in admin.
Tests/guards: ai-provider-boundary.test.ts, no-direct-llm-client-call.test.ts,
  ai-content-safety.test.ts, ai-readiness.test.ts,
  no-provider-secret-leak.test.ts — the §8.15 safety rails ALREADY exist.
What is real: human-in-loop learning spine (signals → review queue → manager
  approval → journal_entry_confirmations + audit_logs). No autonomous factual
  writes anywhere. No LLM provider calls in the app (guard-enforced boundary).
What is missing (exact gap): §8.15 minimum — suggestion review UI
  (approve/reject/edit) on learning_review_queue + an admin audit-log view.
  No provider dependency needed (suggestions are rules-based).
What is duplicated: none.
Minimum PR needed: feat(agent-readiness): admin suggestion-review surface +
  audit-log read view. App-side only.
Payment-related: no | DB apply needed: no | External blocker: no
```

## Branch 26 — Localization / language scope

```text
Branch: 26. Localization / language scope
Current status: GREEN (scoped)
Source files: apps/web/messages/* (base + 6 namespace files per locale)
Routes/components: lt/en/ru UI ACTIVE (default lt), prerendered, selectable.
Tests/guards: i18n-lt-en-parity.test.ts (lt↔en↔ru, base + all 6 namespaces,
  no empty values), COVERED_RECOGNITION_LANGUAGES set-equality,
  check:i18n-debt in CI.
What is real: 3-locale UI with enforced parity; 12-language taxonomy +
  offline recognition; scope claims CI-cross-checked.
What is missing: FI full UI promotion — explicit owner decision (board row).
What is duplicated: none.
Minimum PR needed: no work needed (FI promotion only after owner decision).
Payment-related: no | DB apply needed: no | External blocker: OWNER DECISION
  (FI locale promotion, non-blocking)
Proof: localization-launch-scope-audit-2026-07-05.md.
```

## Branch 27 — Legal / consent / safety / anti-fake / anti-scam

```text
Branch: 27. Legal / consent / safety / anti-fake / anti-scam
Current status: GREEN (scoped)
Source files: apps/web/app/[locale]/(marketing)/legal/{privacy,terms,cookies,
  marketplace-rules}; consents table (0001: consent_type, given_at,
  revoked_at — never hard-deleted, GDPR audit trail); profiles consent flags.
Tests/guards: constitution-compliance.test.ts, no-legal-guarantee-copy,
  no-fake-outcome-claims, public-no-fake-claims, legal-pages-public-clean,
  privacy-base, input-caps-and-log-privacy, external-link-safety,
  placeholder-marker-prod, marketplace-no-fake-no-payment, no-secret-leakage,
  no-provider-secret-leak — the anti-fake/anti-scam net is the widest guard
  family in the repo.
What is real: legal pages present and honestly marked as "preparing" where
  final wording is pending; consent capture with audit trail; structural
  honesty guards in CI.
What is missing: FINAL legal wording — owner-only gate (legal/business text
  requires owner wording; train stop-rule 5).
What is duplicated: none.
Minimum PR needed: no app work needed; final legal copy = owner input, then a
  small copy PR.
Payment-related: no | DB apply needed: no | External blocker: OWNER INPUT
  (final legal wording, non-blocking for internal product work)
```

## Branch 28 — Analytics / telemetry / activation reporting

```text
Branch: 28. Analytics / telemetry / activation reporting
Current status: GREEN (scoped)
Source files: apps/web/lib/telemetry/{actions.ts,funnel-events.ts};
  apps/web/scripts/generate-activation-report.ts (+ package script);
  apps/web/scripts/generate-pilot-owner-brief.ts
Routes/components: /dashboard/admin/telemetry (INTERNAL_ADMIN).
DB tables/RPCs/migrations: pilot_events (0020, append-only; anon-grant fix +
  service-role read migrations pinned by guards).
Tests/guards: activation-funnel-telemetry.test.ts,
  activation-report-reproducibility.test.ts, pilot-events-migration-0020,
  pilot-events-anon-grant-migration, pilot-events-service-role-read.
What is real: real funnel events, owner-run activation report, no fabricated
  counters (control-room audit item 9: every number real or "—").
What is missing: live first-use funnel dashboard (documented deferral — the
  owner-run script covers §8.16's activation report today).
What is duplicated: none.
Minimum PR needed: optional feat(activation-dashboard): render the existing
  report read-only in admin. Low priority.
Payment-related: no | DB apply needed: no | External blocker: no
```

## Branch 29 — Pricing plans / billing readiness

```text
Branch: 29. Pricing plans / billing readiness
Current status: YELLOW (scaffold real and honest; readiness not closed)
Source files: apps/web/lib/billing/{plans.ts (PAYMENTS_ENABLED=false global
  kill-switch; PRE_PAYMENT_PLANS with audience/feature keys; paid tiers =
  'payment_not_enabled'), entitlements.ts, effective-entitlements.ts,
  entitlements-v1.ts, config.ts/config-core.ts (stripe_test |
  stripe_live_blocked | disabled; live HARD-BLOCKED at validation),
  provider.ts + providers/{stripe-test.ts,noop.ts}, prices.ts,
  checkout-core.ts, subscription-store.ts, webhook-core.ts};
  apps/web/lib/admin/billing-actions.ts (manual pilot grants)
Routes/components: /(marketing)/pricing (PricingTable live read +
  PrePaymentPlanBoundary + BillingTestCheckout, test-state only);
  /dashboard/admin/billing (superadmin: config state, blockers-to-live,
  manual override).
DB tables/RPCs/migrations: 20260613200000_billing_test_mode_records.sql
  (subscriptions + webhook_events, test_mode records, needs-migration honest
  degradation).
Tests/guards: no-live-payments.test.ts, pricing-no-live-claim.test.ts,
  payment-readiness-honesty.test.ts, manual-paid-launch-runbook.test.ts,
  webhook-signature.integration.test.ts, checkout-core/config/entitlements
  unit tests.
What is real: plan model + copy, entitlement evaluation (hasFeature already
  gates booking_requests), TEST-mode Stripe scaffold with signature-verified
  webhook that REJECTS live events, honest admin state surface.
What is missing (exact gap): §8.17 closure — plan boundaries enforced across
  all featured surfaces (entitlement wiring is partial), explicit
  blocked-provider state review, and the owner-gated billing sprint decision.
What is duplicated: none.
Minimum PR needed: feat(billing-readiness): complete entitlement boundary
  wiring + readiness closure audit. App-side; provider stays test/blocked.
Payment-related: YES (adjacent; no provider connection in this PR) |
DB apply needed: no | External blocker: OWNER GATE for anything beyond
  test-mode readiness
```

## Branch 30 — Payments / payment provider connection

```text
Branch: 30. Payments / payment provider connection
Current status: GATED — never build in this train (train doc §6)
Source files: the branch-29 scaffold is the ONLY payment-shaped code;
  live mode is structurally unreachable: config-core rejects non-test keys
  and hard-blocks STRIPE_MODE=live; provider returns noop unless stripe_test;
  webhook assertTestEvent() rejects live events; PAYMENTS_ENABLED=false.
Grep verification (this audit): no mollie, no paypal, no bank acquiring, no
  live checkout path. stripe@22.2.1 dependency serves the TEST scaffold only.
Tests/guards: no-live-payments.test.ts, marketplace-no-fake-no-payment.test.ts.
What is real: the gate itself — provable, guard-pinned.
What is missing: intentionally everything live (Stripe/Mollie/PayPal
  connection, paid checkout, subscriptions capture, live webhooks, billing
  collection).
What is duplicated: none.
Minimum PR needed: NONE in this train. Final acceptable state: "Full product
  tree minus payments is source-proven. Remaining major gate: payment
  provider / billing connection."
Payment-related: YES | DB apply needed: n/a | External blocker: OWNER GATE
  (payment provider connection = the train's terminal external gate)
```

---

## Duplicates / drift to consolidate (complete list)

The route truth map (`apps/web/lib/guards/route-truth-map.test.ts`) pins
exactly 7 DUPLICATE_DRIFT routes (ceiling guard-enforced, must shrink):

| Route | Overlaps | Consolidation |
|---|---|---|
| `dashboard/agency` | canonical company workspace | branch 21 PR (owner decision F-D4) |
| `dashboard/agency/pool` | company worker management | branch 21 PR |
| `dashboard/buyer` | company demand intake | branch 21 PR |
| `dashboard/start/agency` | start/company | branch 21 PR |
| `dashboard/start/buyer` | start/company | branch 21 PR |
| `dashboard/search` | company/scouting router | small redirect PR (can join branch 21 PR) |
| `dashboard/market/recognize` | journal recognition | small redirect PR |

Non-route duplication watchlist (not user-facing, do-not-extend rules):
- `lib/staffing/fit.ts` (marketing preview engine) vs `lib/market/*`
  (canonical) — extend only `lib/market`.
- legacy `threads`/`messages` (0001) vs canonical `conversations` (0021).
- legacy `company_workers` vs `engagement_contexts` (documented direction).
- `agencies`/`agency_workers` tables vs `companies.company_type=
  'staffing_agency'` + `engagement_contexts` (branch 21).

## Prioritized train order for the remaining work

Rules applied: simple > complete; reuse > build; one PR = one branch or one
narrow vertical slice; the train doc's §8 order binds; owner-gated items are
sequenced so pure app-side work never waits on them.

| Order | PR (branch) | Scope (smallest honest slice) | DB apply | Owner gate |
|---|---|---|---|---|
| 1 | feat(contact-permission) — §8.1, branch 20 | permission states + counterpart visibility rules into communication-eligibility + guards | maybe (additive) | no |
| 2 | feat(messaging-minimum) — §8.2, branch 20 | abuse/spam caps + demand/job context linking; closes branch 20 | no | no |
| 3 | feat(transport) — §8.5, branch 15 | clone accommodation enum path end-to-end | yes (additive RPC) | apply-gated only |
| 4 | feat(equipment) — §8.6, branch 16 | structured required-tools + honest unknown, reuse taxonomy slugs | yes (additive RPC) | apply-gated only |
| 5 | feat(teams) — §8.3, branch 13 | team identity on organizations + membership via engagement_contexts + capability summary | yes (additive) | apply-gated only |
| 6 | feat(passport) — §8.8, branch 19 | handover passport shell on projects/[id]/operations; closes branch 19 | yes (additive) | apply-gated only |
| 7 | feat(follow-up) — §8.13, branch 24 | follow_up_tasks + owner/operator queues | yes (additive) | apply-gated only |
| 8 | feat(sales-os) — §8.14, branch 23 | read-only lead/intake/follow-up panel in existing admin | no | no |
| 9 | feat(agent-readiness) — §8.15, branch 25 | suggestion review UI on learning_review_queue + audit-log view | no | no |
| 10 | refactor(agency-consolidation) — §8.11, branch 21 | fold agency/buyer into company workspace; shrink drift set (7→≤2) | yes (backfill) | YES — owner decision F-D4 first |
| 11 | feat(map-radius) — §8.12, branch 17 | wire owner-chosen radius data source | depends | YES — owner decision first |
| 12 | feat(billing-readiness) — §8.17, branch 29 | entitlement boundary completion + readiness closure; provider stays blocked | no | YES beyond test-mode |
| 13 | chore(drift-cleanup) | search + market/recognize redirect stubs (if not folded into #10) | no | no |
| 14 | feat(full-product-tree-final-closure) — §8.18 | final closure audit `runtime/audits/full-product-tree-final-closure-2026-07-05.md` | no | no |

Deliberately NOT queued: §8.4 accommodation (already GREEN), §8.7 trust
expanded minimum (launch minimum GREEN; references slice only if the model
supports it after teams land), §8.9 marketplace completion (GREEN; optional
guard consolidation), §8.10 booking minimum (GREEN inside branch 19),
§8.16 analytics (GREEN; optional dashboard), branch 30 (GATED forever in
this train).

## Owner decisions / gates required (exact list)

1. **Agency/buyer consolidation approach (branch 21, F-D4)** — required
   before train item 10. Everything before it is unblocked.
2. **Radius data source (branch 17)** — offline geocode source vs consented
   device coordinates (already pinned on the launch board).
3. **Billing sprint beyond test-mode readiness (branch 29)** and **payment
   provider connection (branch 30)** — the train's terminal external gate.
4. **FI full UI locale promotion (branch 26)** — non-blocking.
5. **Final legal wording (branch 27)** — owner text, non-blocking.
6. **Production DB applies** — every additive migration in train items 3–7
   and 10 follows the existing owner-gated apply runbook (repo↔prod parity
   currently 103/103 per final audit §2).

## Validation (this PR — audit-only)

| Check | Result |
|---|---|
| `pnpm typecheck` (apps/web) | PASS |
| `pnpm lint` (apps/web) | PASS |
| `pnpm test` (apps/web) | PASS — 477 files, 7214/7214 |

No product code touched; the suite is the untouched PR16 baseline.
