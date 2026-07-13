# Canonical User Journey — Browser Proof v1

Date: 2026-07-13 · Local dev server (worktree branch
`feat/canonical-user-journey-living-cv-crm-v1-implementation`) against the
production Supabase project (RLS-scoped reads/writes through the real UI only).

## Proof accounts (temporary — owner cleanup gate)

Two clearly-labelled accounts created via the admin API
(`user_metadata.e2e_proof = "canonical-journey-v1"`):
- `canonical.journey.proof.worker@e2e-proof.local` (worker; profile id `a34dd6aa-…373d`)
- `canonical.journey.proof.company@e2e-proof.local` (company `E2E Proof Statyba UAB`,
  type `staffing_agency`, UNVERIFIED on purpose; profile id `d808a6e6-…cfb98`)

Everything they created is invisible to real users (worker data behind
consent gates; the company demand was CLOSED at the end and unverified
companies never reach worker boards). Privacy-consent rows are append-only
by design, so agent-side deletion was not attempted — **owner gate: delete
the two auth users from the Supabase dashboard when done** (cascades), plus
the one `company_need_public_intakes` row (`b3e0352c-…`) and the closed
`customer_requests` rows if desired.

## WORKER journey — proven in the browser

| Step | Result |
|---|---|
| Registration → login → onboarding (identity pick, name, country) | ✅ lands on the one dashboard; hub person card with real 0-counts, ONE next step |
| Solo-worker journal availability | ✅ journal renders with personal engagement (prod migration 20260702140000 verified: ledger row + trigger + 20 live rows) |
| CV import (paste) → extraction → per-chip review | ✅ 4 suggestions; text persisted ("CV: Pateiktas"); nothing saved without confirm |
| Confirm → claims saved + LIVING-CV DELTA | ✅ applied toast + honest delta: "2 į kataloginį sąrašą nepateko (ne pagal jūsų darbo kryptis) — jie lieka jūsų profilyje kaip jūsų pačių įrašai." (worker had no direction yet — the delta tells the truth) |
| Work direction set via the real picker | ✅ "Plytelių klojėjas" primary direction |
| Journal entry → save banner | ✅ banner + NEW "Peržiūrėti savo CV →" link (/lt/cv) |
| /cv Verified CV | ✅ one composition: profession, journal count 1, professional description = the imported CV text; "sudaromas tik iš jūsų paskyros duomenų" |
| Privacy: employer discoverability consent | ✅ full disclosure copy → "Sutinku ir įjungiu matomumą" |
| Opportunities | ✅ honest readiness gates (no fake matches; catalogued skills still 0 → readiness says so) |
| Worker→employer contact button | ⚠️ code path unit-pinned (guards + eligibility tests); full E2E needs a VERIFIED company demand on the worker board — company verification is admin-only (owner gate), so not browser-provable with proof accounts |

## COMPANY journey — proven in the browser

| Step | Result |
|---|---|
| Public /company-need intake (anonymous) | ✅ persisted (`status='new'`, contact_email = the company account's email) |
| Claim bridge card on /dashboard/company | ❌ BLOCKED by a **pre-existing production defect**: `company_need_public_intakes` has NO grants for `service_role` (only `postgres`) — the admin queue (PR #681) has been silently broken in production the same way. Fix drafted: `20260713190000_company_need_intake_service_grants.sql` (owner-gated). The card degrades honestly (renders nothing). |
| Onboarding → company setup (staffing_agency) | ✅ role-gate banner honest; setup saves; workspace opens |
| Draft need on company page | ✅ "Išsaugota kaip privatus juodraštis" |
| Draft → wizard AUTO-PREFILL (P3 core) | ✅ wizard opened with role+description prefilled + honest note "Užpildyta iš jūsų juodraščio — peržiūrėkite ir pateikite"; deterministic auto-suggest fired on step 2 |
| Submit → ONE canonical row | ✅ success links to scouting; DB shows draft row `closed` + one `submitted` row (entered ONCE) |
| Scouting: derived pipeline chips (P4) | ✅ two candidates with `Naujas` chip + ONE next action "Peržiūrėti šį kandidatą →" |
| Shortlist → stage transition | ✅ chip became `Peržiūrimas`, next action became "Pradėti pokalbį →" (derived from the persisted demand_shortlist row) |
| Contact gate | ✅ honest default-closed: worker set no availability → no contact affordance rendered (never a dead button) |
| Interview/offer/accepted stages | unit-pinned (17-case precedence ladder); not browser-driven (needs worker availability + booking round-trips) |
| Demand closed at the end | ✅ via the scouting "Uždaryti šį poreikį" control |

## AGENCY (staffing_agency mode) — proven in the browser

| Step | Result |
|---|---|
| "Klientai" panel in the company workspace | ✅ renders ONLY for staffing_agency; honest gated state "PARUOŠTA — LAUKIA SAVININKO AKTYVAVIMO" (agency_clients migration is an owner-gated draft) |
| Demands per client | ✅ truthful "negalima susieti" note + the agency's real demands with status chips (PATEIKTA / UŽDARYTA) + per-demand "Kandidatai →" scouting links |
| Hiring result | shares the canonical pipeline (accepted stage); same unit coverage as company |

## Viewports (360×800, 390×844, 412×915, 1366×768, 1440×900)

- Scouting (candidate pipeline): NO horizontal overflow at any of the 5;
  the one primary next-action link fully visible at 360 px.
- Company workspace (incl. Klientai + claim/demand sections): NO overflow at 360.
- Worker dashboard/profile/journal/cv driven at 1280 during the journey;
  repo mobile-layout guards cover the shared shell.

## AI states

`AI_PROVIDER_MODE` unset in the dev env → the AI structuring enhancement
correctly added NOTHING (no fake AI chips, no badge); deterministic
extraction carried the whole flow. `/work-abroad` no longer claims AI.

## Honest gaps carried to the owner

1. Apply `20260713190000` (service-role grants) — unblocks the admin intake
   queue (production defect) AND the claim bridge.
2. Apply `20260713160000` (agency_clients) — activates client records + linking.
3. Verify a company (admin action) to make worker-board demands + the
   worker→employer contact browser-provable end-to-end.
4. Delete the two e2e-proof auth users + intake row (see above).
5. Claims saved BEFORE a work direction exists are never retro-promoted;
   the manual catalogued picker covers it today — candidate follow-up:
   re-run promotion when a direction is added.
