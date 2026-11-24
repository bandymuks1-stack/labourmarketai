# W4-D ACCEPTANCE MATRICES (evidence labels per V8 §0.5)

## WORKER

| Journey | Status / Evidence |
|---|---|
| Signup | WORKING_BUT_UNUSED — 36 users exist (VERIFIED_DB); flow guard/E2E-covered (VERIFIED_LOCAL); no new-user auth browser proof this window (auth gate) |
| Language | VERIFIED_PRODUCTION — switcher on landing/auth (browser-proven post-#1148); cookie 1y; account preference read on login (#1148, test-pinned VERIFIED_LOCAL); 5 routed locales; 6 catalogs inactive (106 missing namespaces — known gap, not routed) |
| Onboarding | VERIFIED_LOCAL — guards + flow tests; no CV step in onboarding (deep-link only, by design); switcher now present (#1148) |
| Profile | VERIFIED_LOCAL — per-item confirm doctrine intact (audit); prod: 36 profiles |
| CV | VERIFIED_LOCAL — full chain code-complete + free (no paywall, print-to-PDF); "CVs=0" is a metric artifact (no CV store by design; upload stores nothing). Real-traffic proof NOT_ENOUGH_EVIDENCE |
| Journal | VERIFIED_PRODUCTION (36 entries live) + append-only RLS (doctrine audit) |
| Skills | VERIFIED_LOCAL — worker_skills promotion works; ESCO catalogue EMPTY (owner-gated import) → typeahead degrades honestly |
| Provenance | VERIFIED_LOCAL — self_declared/confirmed separation; no "verified" overclaim (guards) |
| Discoverability | VERIFIED_PRODUCTION — default closed, consent-event RPCs, #1097 behavioural proof (62/62, 2026-08-13) |
| Jobs | VERIFIED_PRODUCTION — 7088 active Swedish ads live, freshness same-day; attribution rendered |
| Matching | VERIFIED_LOCAL — shared engine native+external, honest gaps (pay_not_comparable etc.); prod usage 0 → WORKING_BUT_UNUSED |
| Application | VERIFIED_LOCAL — native apply flow + external confirm step (#1148, guard-pinned); authed browser proof BLOCKED_EXTERNAL |
| Booking | EMPTY_BY_EXPECTATION — 0 rows post-cleanup; chain test-covered; booking→engagement never run with real users (known) |
| Engagement | EMPTY_BY_EXPECTATION — 0 rows; emitters shipped #1143 |
| Notifications | WORKING_BUT_UNUSED — infra applied (2 migrations, 9 event types), 0 rows since activation; emitters test-covered |
| Absence | EMPTY_BY_EXPECTATION — 0 rows; W12 privacy floor (WHO/WHEN never WHY) guard-pinned |
| Calendar | VERIFIED_LOCAL — planning model + views; prod usage 0 |
| Privacy | VERIFIED_PRODUCTION — intake RPC live since 2026-07-06; self-service export RLS-scoped; policy copy honest |
| Deletion | PARTIAL — intake + admin visibility (#1149) only; executor NOT implemented (design doc shipped; destructive steps OWNER_GATED) |
| Feedback | VERIFIED_LOCAL — language_feedback path (account-menu trigger) |

## EMPLOYER

| Journey | Status / Evidence |
|---|---|
| Organization | VERIFIED_PRODUCTION — 13 orgs; fail-closed employer context resolver (guard-pinned spine) |
| Language | VERIFIED_PRODUCTION — as worker row |
| Morning brief | VERIFIED_LOCAL (#1146; ladder guard-pinned); authed browser proof BLOCKED_EXTERNAL |
| Today | VERIFIED_LOCAL (#1147 Organization Today; fact-only, null≠0) — deployed, authed proof BLOCKED_EXTERNAL |
| Journal reports | VERIFIED_LOCAL (#1147 windowed report in /dashboard/reports?journalWindow=; privacy guard pins no original_text) — deployed |
| Organization report | VERIFIED_LOCAL (#1147 journal section + existing demand/projects/tasks/documents/finance) — deployed |
| Progress | PARTIAL — review states + windowed counts shipped; no per-worker scoring BY DESIGN |
| Planning | VERIFIED_LOCAL — capacity zone + gap timeline (pre-existing) |
| Calendar | VERIFIED_LOCAL — pre-existing |
| Absence | VERIFIED_LOCAL — decisions queue + absent-now (#1146) + Today (#1147); reason never shown (W12) |
| Workload/Capacity | VERIFIED_LOCAL — assessCapacity/buildGapTimeline (pre-existing) |
| Workforce inquiry | VERIFIED_PRODUCTION — 17 real inquiries live |
| Forecast | PARTIAL — gap timeline exists; no dedicated forecast surface (not launch-critical) |
| Recruitment | VERIFIED_LOCAL — search/matching/booking chain; recruitment foundational, daily-UI-secondary (doctrine §0.6 honoured) |
| Matching | as worker row |
| Booking/Engagement | EMPTY_BY_EXPECTATION (0 rows) |
| Notifications | WORKING_BUT_UNUSED |
| Reporting | VERIFIED_LOCAL (#1147) — deployed |
| Simulation | NOT built — out of scope, no fake |
| Privacy | VERIFIED_PRODUCTION — journal/absence floors guard-pinned |
| Feedback | VERIFIED_LOCAL |

## PRODUCT PHILOSOPHY TESTS

D8 WORKER: arrive→language(choose native, 5 routed)→understand(landing honest)→profile→free CV(yes, proven free)→journal→evidence status(honest provenance)→discoverability control(consent, reversible)→real jobs(7088)→matches explained(tier explanation + gaps)→apply(native or confirmed external redirect)→privacy understood(honest policy). VERDICT: PASS for the 5 routed locales, with the ESCO-empty and AI-off caveats (degrade honestly). Label: VERIFIED_LOCAL + partial VERIFIED_PRODUCTION.

D9 EMPLOYER (HIRINGS=0): morning brief ✓, Today ✓, journal review+reports ✓, progress counts ✓, planning/capacity ✓, absences ✓, org report ✓ — recurring value exists without a single hire. VERDICT: PASS (architecture level, VERIFIED_LOCAL); real-usage evidence NOT_ENOUGH_EVIDENCE (0 engagements in prod).

D10 TRUST: operator identity public (both entities, registers), data categories + access matrix public, consent/deletion/retention honestly described (periods pending = declared pending), security contact + security.txt live, subprocessors listed (#1149), no mechanism disclosure (guard-pinned). VERDICT: PASS with two declared pending items (retention periods LEGAL_DECISION_REQUIRED, DPAs owner action).
