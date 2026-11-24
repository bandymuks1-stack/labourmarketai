# Public Launch Readiness — QA pass (Step 6/6)

> Owner-away autonomous sprint, final QA. **No broad redesign, no schema change.**
> This pass audits the public + auth-gated surfaces for launch and records the
> evidence. No fixes were required — the surfaces are in a launch-ready state.

## Scope checked
Public homepage · register/login paths · worker path (profile/CV) · company/client
demand path · Estimate Builder · evidence/source sections · country evidence pages
· mobile 360–430px · desktop · LT/EN/RU · no fake AI/verified/matching/pricing/
clients/users.

## Automated results (this pass)

| Check | Result |
|---|---|
| Public route smoke `/`, `/lt`, `/en`, `/ru` (live) | ✅ 200, no 500 |
| New country routes `/{lt,en,ru}/labour-market` + `/labour-market/{lt,lv,ee}` | ✅ 200, no 500 |
| Auth-gated `/{lt,en,ru}/dashboard` without login | ✅ 307 → `/{locale}/auth/login` (no 500) |
| Horizontal overflow (mobile 390px + desktop 1280px, all surfaces) | ✅ none (`overflow=false` on all 14 captures) |
| Fake-claim scan (en/lt/ru public copy) | ✅ clean — 3 EN matches are honest **negations**/evidence answers (see below); LT/RU = 0 |
| Active-AI claim on public routes | ✅ none (AI layer inert by default) |
| Mobile + desktop screenshots (en/lt/ru, homepage + country index + country page) | ✅ 14 captured |
| Launch-relevant guards (no-fake-claims, evidence-integrity, ai-boundary, country-evidence, demand-flow, estimate) | ✅ 61 tests pass |

### Fake-claim scan detail (all honest)
- `estimate.intro` / `estimate.disclaimer`: "**not** a binding quote" — explicit disclaimer.
- FAQ "How is worker experience guaranteed?" → "Through confirmed skills, employer-confirmed history and contextual fit signals — **not** self-reported CVs." — evidence-based answer, no fabricated guarantee. (Pre-existing marketing copy; honest. Optional owner polish: soften the question wording. Not a defect.)

## Guard coverage (enforced in CI, not just this pass)
- `public-no-fake-claims` — no fabricated scale/traction/guarantee/verified overclaim.
- `public-evidence-integrity` — no fake homepage charts; not construction-only; MarketPulse carries an illustrative label.
- `labour-market-evidence-provenance` / `-i18n` — every evidence card fully sourced + localized; **no English leakage** on LT/RU.
- `country-evidence` — every country signal sourced; localized en/lt/ru; no LT/RU English leakage.
- `ai-provider-boundary` / `estimate-clarify-assist` — AI inert by default; no number/verification can be AI-sourced; no active-AI public copy.
- `demand-flow-input` — real input, empty blocked, real wizard (no fake-clickable), no purple sweep over the form.
- `action-truth` / `dashboard-primary-action-clarity` — no dead links, no fake-clickable cards, stepper progress-only.

## Screenshot artifacts (local, gitignored under runtime/)
`runtime/project-quality/launch-readiness/` — for en/lt/ru × mobile + desktop:
`home-*`, `country-index-en-*`, `country-lt-en-*`, `country-lt-lt-*`, `country-ee-ru-*`.

---

## Plain-language checklist for human reviewers

**Worker path**
- [ ] Sign in → `/dashboard/profile`: profile hub shows your skills, journal, CV link.
- [ ] Open `/cv`: identity, **professional summary** (your own text), skills grouped by honest tier (confirmed/evidence/declared), confirmed work proof. Print works.
- [ ] Confirm: nothing shows as "verified" unless a real manager confirmation exists. No fake rating/ranking/score.

**Company / client demand path**
- [ ] Dashboard (company/agency role): "Find a worker or team" form.
- [ ] Step 1 describe (required) → 2 criteria → 3 review → create. Empty submit is blocked.
- [ ] After submit: a confirmation echoes what you entered; the read-back lists your request with its details.
- [ ] No purple band over the form; no fake-clickable 1/2/3.

**Estimate Builder**
- [ ] In Criteria, open the optional estimate; enter workers/hours/rate/materials/overhead/margin/contingency.
- [ ] The total + low/high range compute deterministically; the disclaimer says "preliminary, not a binding quote".
- [ ] No AI assist is visible (inert by default); negatives/impossible % are blocked.

**Public evidence**
- [ ] Homepage evidence module: each card links its source with figure date + region.
- [ ] `/labour-market`: country index; LT/LV/EE live, others "coming soon".
- [ ] A country page (e.g. `/lt/labour-market/lt`): per-country source-backed signals + the EU evidence backdrop. Every figure links a source.

**Mobile + localization**
- [ ] 360–430px: no horizontal scroll; CTAs reachable; bottom nav doesn't cover the form.
- [ ] LT and RU pages show **no English** in the body (only official names/acronyms like EURES/Eurostat/EU).

**No fake claims**
- [ ] No "AI is matching/verifying", no guaranteed price, no fake users/clients/matches, no fabricated statistics without a source.

## Owner decisions still pending (from this sprint)
- **Matching/shortlist (Step 3)** and **Communication/booking (Step 4)** are BLOCKED: a company-facing candidate/contact surface needs a worker-data **visibility/consent/RLS** decision (private-data-exposure). Matching is admin-only today.
- **Country figures**: currently qualitative sourced statements; a future verified-data pass (national statistics offices) can add exact numbers with provenance.
- **AI activation**: the AI layer is inert; activation needs provider/budget/key + privacy/audit + run-logging in a dedicated owner-approved slice.
