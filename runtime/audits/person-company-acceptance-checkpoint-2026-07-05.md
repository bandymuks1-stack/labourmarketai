# Person / Company Acceptance Checkpoint (2026-07-05)

**Baseline:** `main` @ `3d23f82` (CR train closed, #631). Full product tree
minus payments complete; commercial readiness + human usability complete;
payments BLOCKED and untouched.
**Method:** SOURCE AUDIT ONLY — every status below is proven from routes,
libs, migrations and guards at `3d23f82`. **No real browser smoke was
performed in this checkpoint** — everything needing eyes-on-screen is marked
`OWNER_MANUAL_SMOKE_REQUIRED` with exact steps (§5).
**Statuses:** GREEN (real, guarded, source-proven) / YELLOW (partial — exact
gap named) / RED (missing) / BLOCKED (owner/external gate).

**Verdict up front: no P0 blocker found. No repair PR needed.**
26 of 28 audited items GREEN; 2 YELLOW (both known wording/content gates,
carried from the CR closure); payments BLOCKED. Two subagent findings were
double-checked against source and CORRECTED before this doc (see §6) — the
statuses below are the verified ones.

---

## 1. Person / worker flow readiness

| # | Item | Status | Evidence (source) |
|---|---|---|---|
| W1 | Registration → role choice → onboarding | GREEN | auth/callback checks `onboarded_at` → `/onboarding` wizard (worker/company cards) → `complete_onboarding` RPC → role dashboard |
| W2 | Fresh-worker dashboard entry | GREEN | active-role overview, real counts only, honest empty states (dashboard/page.tsx) |
| W3 | Profile / Mano CV / avatar / CV export | GREEN | one player-card system; `/dashboard/journal` = Mano CV lead; `/cv` print-to-PDF with honest skill tiers; avatar with monogram fallback |
| W4 | Work journal (modes, recognition, photo, confirmations) | GREEN | WAGON 8 quick/structured/photo presets over ONE composer; offline recognition; 1-photo free tier; EvidenceDecisionTimeline; review only when `journal_review_enabled` |
| W5 | Documents room + LT guidance | GREEN (scoped) | `DOCUMENTS_READINESS_ENABLED = true` (verified in source — LIVE); 9-market readiness from worker's own input + disclaimer; WAGON 9 LT guidance at `#guidance`. By-design notes: `country_document_requirements` ships EMPTY (needs legal source — honest unknown state); guidance drafts owner-gated (see YELLOW list) |
| W6 | Opportunities / demand board | GREEN | approved-route MODEL A only (verified companies, curated projection, no free text/ids); neutral fit signals, no scores; internal interest button with honest copy |
| W7 | Bookings / availability | GREEN | proposed→accepted/declined/withdrawn/expired lifecycle, overlap block, honest needs-migration state |
| W8 | Communication inbox | GREEN | RLS-scoped conversations, unread tracking, named permission states, no contact leak |
| W9 | Language behavior | GREEN | defaultLocale=lt, active lt/en/ru, switcher in header, parity guard |
| W10 | Worker mobile navigation | GREEN | bottom-nav derived from feature-availability (active + safe only); tabs: overview / map / journal / messages; documents & bookings reachable via account menu / dashboard links; preparing features CANNOT reach nav (guard) |

Preparing/pending states a worker can legitimately see (all honest, none
fake): `bookings-unavailable` (only if migration probe fails — applied in
prod), `documents-guidance-pending` (non-LT locales, by design),
hidden catalogue features `matching`/`marketplace` (no UI, no CTAs).

## 2. Company / employer / staffing-agency flow readiness

| # | Item | Status | Evidence |
|---|---|---|---|
| C1 | Company registration + verification ladder | GREEN | setup form → `save_company_setup`; draft→active_unverified→…→verified; client can NEVER set verified (admin-only migration 20260604130000) |
| C2 | Staffing-agency mode (Direction A) | GREEN | `company_type='staffing_agency'` in the ONE company workspace; legacy `/dashboard/agency` = redirect stub; pool + agency-worker linking with honest degradation |
| C3 | Demand posting | GREEN | private draft form (company page) + real 3-step submit wizard (`/dashboard#demand-intake`); closed enums (work type, country, accommodation, transport, tools) guard-pinned to RPC whitelists; owner-scoped readback |
| C4 | Scouting | GREEN | `/dashboard/company/scouting`; deterministic match-v1, no fake scores; scout-safe anonymization until gated conversation; owner-scoped shortlist |
| C5 | Team / membership | GREEN | org members panel, team brigades (org-type=team, #612), invitations lifecycle, company workers list with ops-bridge fields |
| C6 | Projects / objects | GREEN | projects + `project_worker_assignments` + operations board (STADIONAS) + handover passport (append-only, manager-only) + WAGON 8 work gallery (private signed URLs; manager RLS applied+verified in prod) |
| C7 | Journal review | GREEN | `review_journal_entry` (0034) + engagement gate (`journal_review_enabled`), append-only confirmations, batch review with exception surfacing, manager-evidence card |
| C8 | Help requests (WAGON 10) | GREEN | 5 typed CTAs → `submit_help_request_v1` (applied+verified in prod) → `customer_requests` @ in_review; no external sending; honest no-auto-specialist copy |
| C9 | Admin/operator company lifecycle | GREEN | company-verification panel, support inbox, follow-up queue, sales intake + help-requests section, launch/billing readiness boards — all requireSuperadmin + admin RLS |

## 3. Person ↔ company cross-flow (the seams)

| # | Seam | Status | Evidence |
|---|---|---|---|
| X1 | Company posts demand → worker sees it | GREEN | submitted demand + admin-approved route (`approved_direct_partner`) → `list_open_demand_for_workers` curated projection → worker board. Default-closed: unapproved routes invisible |
| X2 | Worker interest → company sees + acks | GREEN | `demand_interest_signals` (worker-owned) → company scouting view → `acknowledge_demand_interest` (reviewed/contacted); worker withdraw immutable to company |
| X3 | Company books worker → both sides | GREEN | `propose_booking_request` → worker accept/decline (overlap-blocked) → company withdraw pre-accept; append-only event log; entitlement-gated |
| X4 | Assignment → stadium → journal autolink | GREEN | assignment rows on ops board; `create_journal_entry_full` auto-links project_id ONLY when exactly one active same-org assignment (never a guess); photos reach the project gallery |
| X5 | Journal entry → confirmation → verified skill on CV | GREEN (verified against source — see §6) | TWO real paths: (a) one-tap confirm queue → `confirm_entry_and_verify_skills` RPC (20260530140000, applied; flips confirmed declared skill to verified/manager_confirmed — first real verified proof on prod 2026-05-30; guard quick-confirm-honesty.test.ts), (b) `review_journal_entry` evidence path (0034). Verified label renders only from `verified \|\| manager_confirmed` |
| X6 | Worker ↔ company messaging | GREEN | communication-eligibility named states (existing conversation / engagement / scouting shortlist / admin / no_permission), default-closed, in-app only, no phone/email leak |
| X7 | Company help request → operator queue | GREEN | help row (in_review) → admin sales-intake help section; reused follow-up action; nothing external |

No dead-end seams found: every flow that shows something offers the real
next action, and every write lands on an operator- or counterpart-visible
surface.

## 4. Mobile / simple navigation

| Item | Status | Evidence |
|---|---|---|
| Bottom nav (mobile) derived from ONE catalogue | GREEN | `bottom-nav.tsx` + `feature-availability.ts` (`active` AND `safeToShowInPrimaryNav` only) |
| Preparing/hidden features cannot reach nav | GREEN | compact-nav-marketplace-ia + route-truth-map guards (drift ceiling CI-enforced) |
| In-page quick-nav on long surfaces | GREEN | `page-quick-nav.tsx` on Mano CV / profile |
| Command finder by normal terms | GREEN | #621 registry; help terms now real actions (#630) |
| Actual on-device rendering/tap-targets | OWNER_MANUAL_SMOKE_REQUIRED | not verified in a browser by this checkpoint — see script §5 (steps marked 📱) |

## 5. Owner browser smoke script (Lithuanian) — OWNER_MANUAL_SMOKE_REQUIRED

No real browser smoke was performed by this checkpoint. Recommended pass
(~20 min, LT locale, ideally one worker account + one company account;
📱 = repeat on a phone):

**A. Darbuotojas (worker):**
1. Registracija → rolės pasirinkimas „Darbuotojas" → onboarding pabaiga →
   ar patenkate į apžvalgą be klaidų? 📱
2. `/lt/dashboard/journal` → įjunkite visus tris įrašo tipus (Greitas /
   Išsamus / Nuotraukos ataskaita) → išsaugokite įrašą su nuotrauka →
   ar matote sąžiningą sėkmės būseną ir įrašą sąraše? 📱
3. `/lt/dashboard/profile` ir `/lt/cv` → ar kortelė ir CV rodo tik tikrus
   duomenis (jokių išgalvotų įverčių)?
4. `/lt/dashboard/documents` → šalies pasirinkimas → ar būsenos sąžiningos?
   → `#guidance` → ar gairės rodomos lietuviškai su „laukia teisininko
   peržiūros" ženkleliais?
5. `/lt/dashboard/opportunities` → ar matomi tik patvirtintų įmonių
   poreikiai? → paspauskite „domiuosi" → sąžininga vidinio signalo kopija?
6. Kalbos perjungimas į EN → dokumentų gairės ir pagalbos paaiškinimai
   rodo TIK „ruošiama iš lietuviško pagrindinio teksto" pranešimą.

**B. Įmonė (company):**
7. Registracija → „Įmonė" → įmonės profilio forma → ar būsena
   „aktyvuota, nepatvirtinta" (ne „patvirtinta")? 📱
8. `/lt/dashboard#demand-intake` → pateikite poreikį per 3 žingsnius →
   `/lt/dashboard/company` → ar matote poreikį sąraše?
9. `/lt/dashboard/company#help` → pateikite „Buhalterijos pagalba"
   užklausą su pastaba → sąžininga sėkmės būsena (žmogus peržiūrės,
   specialistas nepriskiriamas automatiškai)? 📱
10. `/lt/dashboard/company/scouting` → ar kandidatai anonimizuoti iki
    pokalbio? → įtraukite į trumpąjį sąrašą.
11. Projektas: sukurkite/atsidarykite projektą → priskirkite darbuotoją →
    ar darbuotojas matomas STADIONE? → „Darbų galerija" → ar matote
    darbuotojo žurnalo nuotrauką (galerijos RLS jau pritaikyta prod)?
12. Žurnalo peržiūra: patvirtinkite darbuotojo įrašą vieno bakstelėjimo
    eilėje → ar darbuotojo CV įgūdis tapo „patvirtintas su įrašais"?

**C. Operatorius (admin):**
13. `/lt/dashboard/admin` → sales intake → „Pagalbos užklausos" — ar matote
    9 žingsnio užklausą su tipu ir pastaba? → užfiksuokite follow-up.
14. Įmonių patvirtinimo eilė → ar rodo 7 žingsnio įmonę?

**D. Mobilus patikrinimas (📱 žingsniai):** apatinė navigacija — Apžvalga /
Žemėlapis / Žurnalas / Žinutės; jokių horizontalių slinkčių; mygtukai
pasiekiami nykščiu.

## 6. Corrections made during this audit (honesty note)

Two subagent findings were double-checked and corrected against source
before publishing this checkpoint:
1. A claim that `DOCUMENTS_READINESS_ENABLED` is false → source shows
   `= true` (lib/config/documents.ts line 11); documents readiness is LIVE.
2. A claim that confirmation→verified-skill (X5) is not wired → source
   shows the applied `confirm_entry_and_verify_skills` RPC + the one-tap
   confirm queue wrapper (lib/journal/quick-confirm-actions.ts,
   guard quick-confirm-honesty.test.ts) with a real verified proof on prod
   since 2026-05-30. X5 is GREEN.

## 7. Remaining YELLOW / BLOCKED (carried from CR closure — none new)

| Item | Status |
|---|---|
| GDPR/privacy + terms/cookies FINAL WORDING | YELLOW — owner/lawyer gate |
| Skill-recognition LIMITS plain-language copy (area 13) | YELLOW — small copy slice |
| LT-master approvals (17 guidance items + 5 help explanations) | OWNER GATE (drafts honest, needsLegalReview) |
| `country_document_requirements` content | OWNER/LEGAL GATE (ships empty by design) |
| Pricing flip draft_pricing → owner_confirmed | OWNER GATE (never enables payments) |
| Payment provider connection | **BLOCKED — the one external gate; untouched** |
| Real browser smoke of the flows above | OWNER_MANUAL_SMOKE_REQUIRED (§5) |

**Bottom line:** person and company flows are source-proven end-to-end with
honest states everywhere; the checkpoint found no P0 blocker and proposes no
repair PR. What stands between today and commercial operation: the owner
smoke pass (§5), the wording gates, and the payment provider decision.
