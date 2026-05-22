# Public Beta Readiness Audit v1

> **Type:** Readiness / risk / go-no-go audit. **Not** a feature sprint.
> **Base:** `main` @ `ecbf8b6` (PR #23 merged). PR #18 untouched (open/draft).
> **Date:** 2026-05-22. Author: Claude Code.
> **Method:** code review of merged surfaces + live local route/smoke + local
> screenshots (public surfaces). Authenticated dashboards were **not** live-rendered
> (no Docker → no local Supabase; production is real-data-only; no test credentials)
> — assessed by code review and labelled *not live* in the artifact.

---

## 1. Executive summary

The merged WOW foundation (PR #20–#23) gives Labourmarket.ai a **coherent, honest,
working-level** first experience: a non-locking multi-role start, a guided
post-onboarding cockpit, real work-identity and work-journal surfaces, and an
honest manual pilot/lead path. No fake matching/scoring/verification is presented
as real on the functional surfaces, and the contextual-fit-signals doctrine is
respected on the primary locales (en + lt).

**Recommendation: CONDITIONAL GO** — usable for a **tiny, manually guided closed
beta** (founder personally onboards each participant), **not** for open public
traffic yet. The blockers are honesty-of-scale and finish, not brokenness:
preview counters imply a scale that does not exist, two of four dashboard nav
tabs are honest-but-empty, the pilot path depends on an owner-managed env secret,
and the eight non-primary locales' marketing subpages still show ungoverned-reframe
"OVR/ranked" wording (governed by a concept chip but not yet reworded).

---

## 2. Current merged baseline

| PR | What it shipped | Status |
| -- | --------------- | ------ |
| #20 | Post-onboarding cockpit, non-locking start, honest pilot path | merged |
| #21 | Landing ↔ app visual-continuity layer (journey rail) | merged — **working layer, not final WOW standard** |
| #22 | Contextual Fit Signals / Score Doctrine (Constitution §10) | merged |
| #23 | Scouting / Opportunity language cleanup v1 (en + lt) | merged |

Route smoke (live, local): public routes (`/lt`, `/lt/auth/signup`, `/lt/auth/login`,
`/lt/for-companies`, `/lt/pricing`, `/lt/design`) → **200**; authed routes
(`/dashboard`, `/dashboard/profile`, `/onboarding`) → **307 → /auth/login?next=…**
(clean auth wall with return path). No broken routes.

---

## 3. What is already beta-ready

- **Non-locking start** — onboarding is multi-select (`OnboardingWizard`, `Set<Role>`,
  `multiNote`); the first selected role becomes the active *workspace*, not a lock.
  Users can add roles later (`RoleSwitcher.addRole`). Satisfies Constitution §1.
- **Guided cockpit** — worker: journey rail (Identity → Proof → Opportunities) +
  single "Next move" + readiness path + identity/journal panels + "add another
  direction". Company/agency: Define need → Prepare criteria → Review fit → Request
  pilot. Clear next move within ~30s.
- **Real beta-value surfaces** — `/dashboard/profile` (work identity, profession
  templates) and `/dashboard/journal` (declare→confirm→evidence loop, statuses
  submitted/confirmed/rejected) are functional and read from real records.
- **Honest pilot/lead path** — `PilotRequestButton` → `POST /api/leads` inserts a
  real `leads` row (validated via zod, service-role insert), returns honest
  success/error (no fabricated "submitted" state).
- **Auth** — email/password + Google, forgot/reset, clean unauth redirects.
- **Governed concept visuals** — landing carries a global `PRE-ALPHA · Activity
  preview` chip; scouting sections carry a `CONCEPT PREVIEW · PRE-ALPHA` chip;
  placeholder registry + `placeholders:check` gate; demo-to-real policy in force.
- **Mobile (390px)** — landing, signup, login render cleanly stacked; no horizontal
  overflow observed.

---

## 4. What is NOT beta-ready

- **Preview counters imply real scale.** The hero shows large counters
  (~318K "active workers", "1,180", "84", "Activity today", "Avg readiness")
  governed only by a small PRE-ALPHA chip. To an external user this reads like real
  production scale that does not exist.
- **Two of four dashboard nav tabs are empty.** `Discover` ("expected in M3") and
  `Search` ("expected in M2") are honest empty states but occupy half the bottom
  nav, weakening the first dashboard impression.
- **Pilot path depends on an owner-managed secret.** `/api/leads` needs
  `SUPABASE_SERVICE_ROLE_KEY` in production; it degrades gracefully (returns an
  error, no fake success) but **silently drops the lead** if the key is unset.
- **Non-primary locales lag the doctrine.** The `/for-workers`, `/for-companies`,
  `/for-agencies` subpages still contain "OVR / ranked / matching" wording in
  de, nl, sv, no, da, pl, et, lv (governed by the concept chip; reworded only in
  en + lt).
- **Visual finish is working-level, not final WOW.** The landing is long and
  concept-section-heavy (player cards, draft board, market pulse, sparklines); PR #21
  is explicitly a working continuity layer.

---

## 5. Person / worker path assessment

| Step | Result |
| ---- | ------ |
| Understand product in 30s | Adequate — hero + journey band ("One profile. A guided path to opportunities") explain the flow. Concept-heavy below the fold. |
| Register / login | ✓ email/password + Google; clean. |
| Choose start without lock | ✓ multi-select; "you'll choose your role next step"; non-locking copy. |
| Understand "add more later" | ✓ onboarding `multiNote` + cockpit "Add another way" + RoleSwitcher. |
| Reach a useful first dashboard | ✓ worker cockpit with real signals. |
| See a clear next move | ✓ "Next move" panel computes the first incomplete step. |
| Begin building work identity | ✓ profile + journal functional. |

**Verdict:** worker path is the strongest; genuinely usable for beta.

## 6. Company / agency path assessment

| Step | Result |
| ---- | ------ |
| Understand in 30s | ✓ activity-cockpit framing. |
| Register / login | ✓. |
| Choose direction without lock | ✓ same non-locking onboarding. |
| Add other paths later | ✓ RoleSwitcher. |
| Reach a useful first dashboard | ✓ cockpit (Define need → … → Request pilot). |
| Submit / request pilot review | ✓ real lead insert (subject to env secret, §4). |
| Understand what happens after | ✓ "We review every request personally" + success copy. |

**Verdict:** honest manual path; no fake matching. Usable for guided beta.

## 7. Pilot request / lead capture assessment

- Real `leads` insert via service-role; zod-validated; honest success/error states;
  no fabricated confirmation. **Works** when prod env is configured.
- **Risk:** if `SUPABASE_SERVICE_ROLE_KEY` is unset in production, leads are lost
  (graceful error, but no capture). → **P0 verify** (owner action; env not touched here).

## 8. Mobile assessment (390px)

Landing, signup, login: clean, stacked, no overflow. Journey band collapses to a
vertical rail; scouting cards stack. Cockpit rails (3 and 4 stages) fit at 390px
(reviewed in PR #20/#21). **No serious mobile break found.**

## 9. Fake-claim / demo-to-real / contextual-scoring assessment

- **Functional surfaces (dashboard/profile/journal/pilot):** no fake matching,
  scoring, or verification; signals are real records or honest empty states. ✓
- **Concept visuals (landing scouting):** governed (PRE-ALPHA + concept chips,
  placeholder registry). ✓ — except **counter magnitudes** imply real scale (§4).
- **Contextual scoring (Constitution §10):** en + lt clean of OVR / universal score
  / "comparable across workers". The 8 non-primary locales' deep subpages still
  carry "OVR / ranked / matching" → **governed concept**, reword pending.

Classification of remaining issues:
- **Blocker before public beta:** preview-counter scale (open beta); env secret for leads.
- **Safe as governed concept:** player-card/draft gauges; 8-locale subpage wording (chip-governed) — but should be reworded before broad beta.
- **Future polish:** numeric concept gauges → per-context fit signals; landing length.

## 10. Dead-end CTA & empty-surface list

| Surface | Finding | Severity |
| ------- | ------- | -------- |
| `/dashboard/discover` (nav tab) | Honest empty state, "expected in M3" | P1 (empty primary tab) |
| `/dashboard/search` (nav tab) | Honest empty state, "expected in M2" | P1 (empty primary tab) |
| Worker cockpit CTAs | All resolve (`/profile`, `/journal`, `/account`) | OK |
| Company pilot CTA | Real `/api/leads` | OK (env caveat) |
| `/dashboard/inbox` | Present (127 lines); not in bottom nav | OK |
| Market-intelligence "View full insights" `href="#"` (landing) | Anchor goes nowhere | P2 (concept section) |

No truly broken routes; no CTA leading to a 404/blank error page.

## 11. P0 / P1 / P2 readiness blockers

**P0 — before inviting ANY external users**
- **P0.1** Verify `SUPABASE_SERVICE_ROLE_KEY` set in production so pilot/lead capture
  actually persists (owner; env — not touched here).
- **P0.2** Tame hero preview counters so they do not imply real scale (e.g. clearly
  "sample" / smaller / remove magnitude) — they currently read as real active-user
  metrics to an outsider. *(Copy/label change for a future sprint.)*

**P1 — before broader beta**
- **P1.1** Reword `/for-*` subpages in the 8 non-primary locales to match en + lt
  (remove "OVR / ranked / matching" → contextual fit language).
- **P1.2** Resolve the two empty nav tabs (Discover, Search): hide, merge into
  Overview, or label as "coming soon" in-nav.
- **P1.3** Elevate visual finish from working-level toward the final WOW standard
  (PR #21 is explicitly interim).

**P2 — after early beta**
- **P2.1** Relabel numeric concept gauges (92/87/79) as per-context fit signals.
- **P2.2** Reduce landing concept-section length / `href="#"` placeholder anchor.
- **P2.3** Full multi-locale copy polish.

## 12. Recommended next sprint

**"Public Beta Hardening v1"** (copy/governance + owner env verification; still no
new engines, no DB):
1. Owner: confirm prod `SUPABASE_SERVICE_ROLE_KEY` (P0.1) and do a real end-to-end
   pilot-lead test.
2. Tame hero preview counters to clearly-sample magnitudes / framing (P0.2).
3. Reword the 8 non-primary-locale `/for-*` subpages (P1.1).
4. Decide nav-tab strategy for Discover/Search (P1.2).
Then re-run this audit for an open-beta go/no-go.

## 13. Go / No-Go

**CONDITIONAL GO — tiny, manually guided closed beta only.**

- ✅ No role lock; ✅ no fake matching/scoring/verification on functional surfaces;
  ✅ pilot path honest (works with env); ✅ mobile not broken; ✅ dashboards not
  broken; ✅ no security/DB/payment/deploy risk introduced by the foundation.
- ⚠️ NOT open-public-ready: preview counters imply scale (P0.2), pilot persistence
  depends on unverified env (P0.1), 8-locale doctrine lag (P1.1), empty nav tabs (P1.2),
  interim visual finish (P1.3).

**Practically:** the founder can invite a handful of hand-picked workers and
companies today and guide them personally (the cockpit + profile + journal +
pilot path are honest and functional), provided P0.1 (env) is confirmed first.
Do **not** drive untargeted public traffic until P0.2 and the P1 items are addressed.
