# Labour Market OS — browser proof v1

**Date:** 2026-07-13
**Environment:** local dev server (worktree branch
`feat/labour-market-os-workforce-planning-ai-routing-v1`) against the
production Supabase project, authenticated as the existing e2e-proof company
account (`canonical.journey.proof.company@e2e-proof.local`, staffing_agency
"E2E Proof Statyba UAB", deliberately UNVERIFIED so its demands are never
worker-visible). Session reused from the canonical-journey proof — no
credentials were created or changed.
**Evidence form:** DOM/text assertions captured live through the in-app
browser. Screenshot capture was unavailable in this session (tooling
timeout); every claim below is backed by the recorded DOM checks, not
images. AI provider mode: disabled (no `AI_PROVIDER_MODE`) — which is itself
one of the required proofs.

## 1. Employer (company) — entry path A: future work → gap → recommendation ✅ PROVEN

1. `/lt/dashboard/company/planning` (planning zone, empty state): renders
   "Darbo jėgos planavimas" with the CHOICE of starting points ("Pradėkite
   nuo jums patogaus taško": sukurti darbo poreikį ar poziciją / sukurti
   projektą / peržiūrėti kandidatus / rasti žmones ir įmones). No step
   counters, no gating. `planning-zone-primary-cta` count = 0 (no fake CTA
   without data).
2. Entry choice "Sukurti darbo poreikį ar poziciją" → existing demand wizard
   (`#demand-intake` on `/lt/dashboard`). Filled a real future work package:
   "Plytelių klojėjų brigada biurų apdailai (E2E PROOF)" — 4 klojėjai + 1
   brigadininkas, Vilnius, ~6 sav., ~1200 val. Wizard derived sector
   "Plytelių klojėjas · Statyba" and country deterministically, with honest
   copy "Nieko nepateikiame automatiškai". Created via "Sukurti darbo
   pasiūlymą" → "✓ Išsaugota" (canonical `customer_requests` row via the
   existing RPCs — no new model).
3. Planning zone after creation (data entered ONCE, zero re-entry):
   - capacity summary: **"1 reikia žmonių / 0 galima padengti /
     TRŪKSTA 1 ŽM."** (headcount gap computed from real data);
   - risk chip "GERAI" with honest note (no dated need → no risk date yet);
   - undated timeline group with "ją galite papildyti vėliau" (progressive
     completion, nothing blocked);
   - **recommendation labeled as a suggestion**: "REKOMENDUOJAMAS KITAS
     ŽINGSNIS: Pasitelkti įdarbinimo agentūrą →" + "Pasiūlymas pagal jūsų
     dabartinius duomenis — tinka ir bet kuris kitas pradžios taškas.";
   - exactly ONE `planning-zone-primary-cta` (→ `/lt/dashboard/company/scouting`,
     a real surface); "KITI PRADŽIOS TAŠKAI" alternatives visible beside it.

Honest note: the wizard's headcount field was set to 5 during the run but
the derived requirement shows 1 (the structured team-size did not carry
from that input in this run). The gap/recommendation pipeline is proven
end-to-end regardless; input fidelity is listed as a follow-up check.

## 2. Employer — entry path B: candidate-first → same canonical context ✅ PROVEN

`/lt/dashboard/candidates` renders the candidate/provider drafts surface
("Įrašykite kandidatą arba peržiūrėkite juodraščius… juos matote tik jūs")
with honest copy: a draft is not an account, nothing is AI-matched, later
linkable to a real account and to demands/shortlists — the same canonical
pipeline objects. No sequencing requirement leads back to path A.

## 3. Agency — client → future works / demand context ✅ PROVEN (honest pending state)

On `/lt/dashboard/company` (agency mode active for this staffing_agency
account) the "Klientai" panel shows **"PARUOŠTA — LAUKIA SAVININKO
AKTYVAVIMO"** (the `agency_clients` migration is deferred in production)
and "JŪSŲ UŽKLAUSOS — Užklausų kol kas negalima susieti su klientais",
listing the newly created demand in the same canonical context. This is
the honest degradation contract working live; full client→demand linking
activates when the owner applies `20260713160000_agency_clients_v1`
(runbook: `docs/runbooks/apply-deferred-intake-grants-and-agency-clients-v1.md`).
The company workspace also carries the "Darbo jėgos planavimas" card
linking to the planning zone.

## 4. Worker journeys (CV → Living CV; external profile → same profile) ⛔ BLOCKED_EXTERNAL_INPUT_REQUIRED

No worker session exists in this browser profile and both unblock paths are
owner-gated:
- resetting the e2e-proof worker password touches production auth
  (denied by policy — correctly);
- a local Supabase stack is blocked by the `supabase *` permission deny
  rule in this session.

Operator options to unblock (any one):
1. allow `supabase start`/local stack for a proof session
   (`npx supabase start` + `db reset` + `pnpm db:fixtures:local` gives
   dev.worker/dev.company/dev.agency@local.test accounts), or
2. owner resets the proof-worker password themselves and runs the worker
   journey, or approves a session for it.

What already stands without the browser run: the external-profiles section
is unit/guard-tested (visibility default private, disconnect soft, no
auto-import, honest not-enabled state), and the Living CV flow was proven
in `docs/launch/canonical-user-journey-browser-proof-v1.md` (PR #748).
The NEW external-profiles surface renders its honest
"prepared, owner activation pending" state until `20260713210000` is
applied — same contract as the Klientai panel proof above.

## 5. AI routing behaviour

- **No provider → honest deterministic flow ✅ PROVEN LIVE:** with
  `AI_PROVIDER_MODE` unset, the demand wizard ran fully deterministic
  (sector/country derivation, "Nieko nepateikiame automatiškai"), the
  planning zone computed gaps deterministically, and no AI copy or fake AI
  affordance appeared anywhere.
- Deterministic-first, cost ceiling, escalation, fallback: enforced by unit
  + guard tests (`task-routing.test.ts`, `ai-task-routing.test.ts`,
  `run-agent-routing.test.ts` — 247 AI-scope tests green). Live
  multi-tier routing cannot be observed without a configured provider key
  (owner-gated secret) — declared honestly, not simulated.

## 6. Viewports

Planning zone (both empty and data states) checked at **360×800, 390×844,
412×915, 1366×768, 1440×900**: `document.documentElement.scrollWidth <=
innerWidth` at every size (no horizontal scroll; primary CTA visible at
360px). Public `/lt/company-need` and `/lt/auth/login` also pass the
overflow check at 360px.

## 7. Production data created by this proof (cleanup addendum)

- ONE `customer_requests` row: "Plytelių klojėjų brigada biurų apdailai
  (E2E PROOF)", submitted, owned by the proof company (visible only to the
  company + review team — the company is unverified). Close/delete via the
  scouting view or let it cascade with the proof-account deletion already
  listed in `docs/launch/canonical-journey-proof-data-cleanup-v1.md`.
- Plus the wizard's auto-saved draft of the same text if one persisted
  alongside the submitted row.
- No other writes: candidates/Klientai/planning surfaces were read-only;
  the public intake form was rendered but never submitted.
