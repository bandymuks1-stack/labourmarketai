# Landing -> profile conversion audit v1

Date: 2026-06-18 - Scope: the first 2-3 screens reached from the main landing CTAs,
checked against root `DESIGN.md`. Read-only audit; fixes in PR
`feat/landing-to-profile-conversion-v1`.

## Landing CTA -> actual route -> first screen/component

| Landing CTA (i18n) | Route | Route file | First screen component |
|---|---|---|---|
| Create your profile / Susikurti profili (`hero.ctaPrimary`, journey CTA, `labourMarket.workerPathCta`) | `/auth/signup` | `app/[locale]/auth/signup/page.tsx` | `components/app/signup-form.tsx` -> on success `router.replace("/onboarding")` |
| Start a work need / Pradeti darbo poreiki (`hero.businessLink`) | `/company-need` | `app/[locale]/(marketing)/company-need/page.tsx` | `components/app/company-need-form.tsx` + bridge |
| Employer path (`labourMarket.employerPathCta`) | `/for-companies` | `app/[locale]/(marketing)/for-companies/page.tsx` | marketing page |
| Post-signup real profile build | `/onboarding` | `app/[locale]/onboarding/page.tsx` (auth-gated) | `components/app/onboarding-wizard.tsx` |

All CTA routes resolve (the `(marketing)` route group does not affect the URL). No broken CTAs found.

## Screen-by-screen

### A. `/auth/signup` (`SignupForm`) - Create your profile
- Quality: Good. Google OAuth + validated email/password/confirm, honest `state-warning` disclaimer, clear error with one-tap "Login instead".
- Copy: Clear, honest, no overpromise.
- Mobile: Single-column form, ~44px inputs, fine.
- DESIGN.md: Mostly aligned (H1 `text-3xl`, blue focus rings). No fake claims.
- Verdict: No change needed.

### B. `/onboarding` (`OnboardingWizard`) - the real "create profile" screen
- Quality: Functional but sparse. Step 1 = pick role (person/company); Step 2 = display name + country -> done.
- Gap (main finding): The premium landing promises real profile, CV import, real skills, availability, work experience/evidence, real work-needs matching. The onboarding does not carry that promise forward - after picking a role + name + country the user is dropped to the dashboard with no preview of what they will build. The first post-CTA screen feels weaker than the landing -> the conversion-quality collapse this task targets.
- Copy: Honest (role descriptions mention "profile, skills, CV and a work journal"; info box about the Work Journal), but the flow ahead is never stated.
- Mobile: OK (`max-w-md`, single column, role cards `grid-cols-1 sm:grid-cols-2`). Primary buttons are `self-start`, not full-width.
- DESIGN.md: Role cards reasonable; no honest "self-declared / suggested / confirmed" framing surfaced at the start. No fake data.
- Overpromise: None.

### C. `/company-need` (`CompanyNeedForm` + bridge) - Start a work need
- Quality: Good and already honest: produces a vacancy draft the company reviews; the AI assistant is disabled until a provider is enabled ("Your details are not saved"); bridge note says "This is a preview"; `submit` = "Create vacancy draft"; subtitle "we never publish automatically".
- Copy mismatch (finding): The page title is "Post a worker need" while the landing CTA that leads here is "Start a work need". "Post" reads as publish-live and breaks landing->screen label continuity.
- Mobile: `max-w-2xl` form, bridge buttons `flex-col sm:flex-row`. Fine.
- DESIGN.md / overpromise: Honest; only the title label leans publish-y.

## Issues summary
- Confusing/weak: onboarding does not preview the real profile-building flow (CV/skills/availability/evidence).
- Label mismatch / mild overpromise: `companyNeed.title` "Post a worker need" vs landing "Start a work need".
- No "demo/fake/too-technical/too-generic" wording found on these screens. No fake workers/companies/scores/verified badges. No matching guarantees. No "living/gyvas/zivoj".

## Top 3 safe fixes for this PR
1. Onboarding continuity panel - add an honest "After this - your real profile" preview to onboarding Step 2 (import CV optional, add real skills, set availability, add work experience and evidence) with a self-declared->confirmed honesty note ("nothing is auto-verified"). i18n in all 11 locales. Closes the landing->profile quality gap.
2. Company-need title coherence - change `companyNeed.title` "Post a worker need" -> "Start a work need" (matches the landing CTA + the honest draft reality; subtitle unchanged). All 11 locales.
3. Premium + mobile polish on onboarding - primary buttons full-width on mobile with premium radius; the new panel uses DESIGN.md card styling. No logic change.

Out of scope (kept): signup form (already good), all business logic, DB/Supabase/auth/billing, route structure.