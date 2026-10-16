# Minors and age policy v1

| | |
|---|---|
| **Status** | DRAFT v1, 2026-10-15. **Requires lawyer review.** Statements of Lithuanian law below are marked [LAWYER VERIFY] and must be confirmed against the current consolidated texts. |
| **Scope** | GDPR Art. 8, 6(1)(f) (the "child" limb), 12(1), 24, 25 and Recital 38; national labour law on minors. |
| **Sources** | Audit A3 §5 and its addendum (Minors). `supabase/migrations/20260827210000_learner_visibility_least_privilege_v1.sql:86-88`. `apps/web/components/app/signup-form.tsx`, `auth-legal-notice.tsx` (via A3). Terms and privacy copy in `messages/en.json:5606-6037` (via A3). Matrix rows M45, ROPA A28. |

> **LT santrauka.** Šiuo metu platformoje:
> - nėra amžiaus patikros;
> - nėra gimimo datos lauko;
> - Terms ir privatumo politikoje nieko nesakoma apie amžių.
>
> Kodo komentaras pats pripažįsta, kad besimokantieji „labai dažnai yra nepilnamečiai“. Platforma siūlo darbą, todėl taikomi ir darbo teisės apribojimai nepilnamečiams.
>
> Pagal BDAR 8 str. Lietuvoje skaitmeninio sutikimo amžius yra 14 metų (reikia patikrinti). Sutikimu pagrįstos funkcijos yra matomumas darbdaviams, partnerio atstovavimas ir prisijungimo vietos signalas.
>
> Rekomendacija:
> - savarankiškai registruotis leisti nuo 16 metų, deklaruojant amžiaus grupę;
> - jaunesniems nei 18 metų taikyti „jaunimo režimą“: be darbdavių paieškos, be automatinio atitikimo, be perdavimų Nonstop, be darbo pranešimų apie draudžiamus darbus;
> - 14–15 metų asmenims leisti dalyvauti tik per mokyklos valdomą programą.
>
> Sprendimą priima savininkas kartu su teisininku.

## 1. Facts (2026-10-15)

| Fact | Evidence |
|---|---|
| No age gate and no minimum age at signup | A3 §5 (`signup-form.tsx`, `auth-legal-notice.tsx`) |
| No birth-date column in any public table | A3 §5 (catalog scan) |
| No age statement in the Terms or the Privacy Policy | A3 §5 (`en.json:5626-5653`) |
| Learners linked to schools are "very often a minor" | `20260827210000_learner_visibility_least_privilege_v1.sql:86-88` |
| Learner visibility was narrowed: a school relationship no longer inherits the employer scope (salary expectation, relocation, night shifts, …) | same migration (least-privilege fix) |
| Education cohort members in prod | 4 (`education_cohort_members`, A1 §1a) |
| The product targets work, apprenticeships and learners | A3 §5 |
| Consent-based features a minor could use: `profile_discoverability`, `partner_supply_representation`, `proposition_consent` (hand-off), consented login-location signal, speech-dictation notice | `privacy_consent_purposes`; ROPA A05, A20, A29 |
| Profiling that a minor would be subject to: auto-match, ranking, job alerts, Living CV inference | `dpia-v1-matching-and-profiling.md` |
| **Unknown:** whether any current account belongs to a minor | Not measurable without age data |

## 2. Legal frame [LAWYER VERIFY]

**GDPR Art. 8.** Art. 8 applies where **consent** (Art. 6(1)(a)) is the basis for an information-society service offered directly to a child.

- Below the national age of digital consent, consent must be given or authorised by the holder of parental responsibility.
- The controller must make reasonable efforts to verify this, taking available technology into account.
- **Lithuania** set the age at **14** (Law on Legal Protection of Personal Data, ADTAĮ) [LAWYER VERIFY article and current wording].
- Processing on Art. 6(1)(b) (contract) is outside Art. 8. Whether a minor can validly conclude the platform contract is a question of national civil law. Under the LT Civil Code, minors aged 14–18 generally act with the consent of their parents, with exceptions for small everyday transactions and their own earnings [LAWYER VERIFY].

**Other GDPR provisions.**

- **Art. 6(1)(f):** the interests of a child weigh more heavily in any legitimate-interest balance. This affects telemetry, cross-organisation inference and ranking.
- **Art. 12(1) and Recital 58:** information addressed to a child must be in clear and plain language the child can understand.
- **Recital 71:** solely automated decisions with significant effect should not concern a child. The platform takes none, but it does profile (DPIA).

**Labour law (employment of minors).**

- EU Directive 94/33/EC on young people at work sets the framework.
- Lithuanian Labour Code provisions on minors [LAWYER VERIFY articles]. In outline:
  - employment generally from 16;
  - from 14 to 16 only light work, with written consent of a parent or legal representative, and possibly school or health conditions;
  - under 14 only very limited activities;
  - restricted working time, no night work, and lists of work prohibited for minors.
- **Consequence for the platform:**
  - a minor shown to employers, matched to adult jobs or handed off to a staffing business could be steered to unlawful work;
  - salary expectations, night-shift willingness and relocation data have reduced justification for minors.

**Education relationship.** A school processes learners' data under its own basis, often Art. 6(1)(e) or (c) under education law. The platform is then likely a processor for the school (`roles-and-responsibilities-v1.md` §3 analogy).

## 3. Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A. 18+ only** | Self-declared "I am 18 or older" at signup; no minors at all. Schools may register only adult learners. | Simplest; removes labour-law and Art. 8 risk | Excludes apprentices and 16–17-year-old job seekers, who are part of the target audience. Adult-only learner cohorts are unrealistic. |
| **B. 16+ self-signup, youth mode under 18** (recommended) | Age-band declaration at signup (under 16 / 16–17 / 18+). No birth date is collected (minimisation). Under 16: no self-signup. 16–17: youth mode (§4). | Matches the LT employment age; protects minors; keeps apprentices | Needs engineering, and the declaration is self-reported |
| **C. 14+ with parental consent flow** | As B, plus 14–15 self-signup with verified parental consent for consent-based features | Widest reach | A parental-verification process is needed (Art. 8(2)). Light-work-only matching is complex. High effort. |
| **D. No change** | Status quo | — | Undocumented risk. Learners who are minors already exist in the code's assumptions. The age gap stays MEDIUM, or HIGH once a minor is confirmed. |

## 4. Recommendation (Option B, plus school-managed 14–15) [OWNER + LAWYER]

1. **Signup.** Collect an age-band declaration, not a birth date. Under 16 cannot self-register.
2. **Learners aged 14–15** exist only inside a school-managed cohort. The school acts as controller and the platform as processor (DPA with the school). Learners in this group have no labour-market features: they are not discoverable, not in auto-match, get no job alerts, no hand-offs and no partner-supply representation.
3. **Youth mode (16–17)** until the account holder declares 18+.
   - Off: `profile_discoverability`, `partner_supply_representation` and hand-offs, all hidden. Excluded from the auto-match pool. No pay-expectation, night-shift or overtime fields in any employer view.
   - Restricted: job alerts are limited to listings an employer has marked as suitable for minors. If no such marker exists, job alerts are off.
   - No telemetry device storage beyond what is strictly necessary.
   - Notices are written in plain language for young readers.
4. **Existing accounts.** A one-time age-band prompt at the next sign-in. Until it is answered, treat school-linked learners as under 18.
5. **Terms and Privacy.** State the minimum age, youth mode and the parental contact route. Handle requests from parents as in DSR SOP §8.
6. **DPIA.** Update `dpia-v1-matching-and-profiling.md` §9 once the option is chosen.

## 5. Implementation steps

| # | Step | Owner | Type |
|---|---|---|---|
| 1 | Choose an option (A, B, C or D) and confirm the LT age thresholds and Labour Code articles | Owner + Lawyer | organisational |
| 2 | Add an age-band field (enum, no date) to the account, with an additive migration. Signup UI and the existing-account prompt. Data-minimisation note in the field comment. | Engineering | product-function (migration GREEN if additive) |
| 3 | Youth-mode gates in the canonical paths: `can_view_worker` / discoverability RPCs refuse grants under 18; the auto-match pool filter; the hand-off dispatcher filter; job-alerts filter. One predicate, no second system. | Engineering | product-function (RLS change: RED review) |
| 4 | Learner cohorts: school DPA template; cohort members flagged under 18 by default | Lawyer + Owner | vendor-contract |
| 5 | Terms, Privacy Policy and age copy in all 6 locales; plain-language youth notice | Lawyer + Engineering | legal-text |
| 6 | Guard tests: no discoverability grant, hand-off or auto-match inclusion for an under-18 band | Engineering | product-function |
| 7 | Record the decision in the DPO re-assessment (G-33) and in the ROPA (A28) | Owner | organisational |
