# Silent-Trust Wording Cleanup — P0 (audit + implementation record)

**Branch:** `fix/silent-trust-wording-cleanup-p0`
**Status:** draft PR, held — not merged, not deployed.
**Class:** GREEN (copy + presentational only). No DB / schema / RLS / RPC / Supabase
/ env / DNS / billing / auth-core change. No production data mutation. No new
approval authority. No change to ranking / matching behaviour. No underlying
data or internal trust logic removed.

---

## 1. Owner rule (the contract this enforces)

> Never show public or normal-user wording that suggests the platform publicly
> **certifies** a person, skill, work record, company, or service — unless the
> owner later explicitly approves a separate public trust model.

Confirmation / review / verification signals stay **real and stored**, and are
still used **internally and silently** (ranking, matching, review, quality
signals, fraud prevention, a future trust-scoring model). What changes is only
the **wording and the visual badge** on normal / public / self-view surfaces:
they now describe the **record state** in neutral language instead of asserting
a public certification. Self-view surfaces are in scope because they can be
shared (player card, own map marker, CV/export, journal/trust block).

The honest **pending** copy ("Laukia patvirtinimo" / "Awaiting confirmation")
is intentionally **kept** — it states the *absence* of certification, which is
exactly what the owner wants surfaced.

---

## 2. Audit — every hit of `patvirtin* / tvirtin* / verified / confirmed / proof / ✓`, classified

Classification:

- **A — Normal/public/self-view affirmative certification wording or badge.**
  In scope → **neutralized.**
- **B — Admin / internal-reviewer-only surface.** The reviewer acts on the
  record; the wording is operational, not a public badge → **kept** (internal).
- **C — Structural / company-identity label** (not a person/skill trust badge)
  → **kept.**
- **D — Underlying stored data & internal logic** (the `verified` column, the
  `confirm_*`/`review_*` RPCs, `journal_entry_confirmations`, capability tallies)
  → **kept, untouched** — this is the silent signal the rule explicitly preserves.

### A — neutralized (this PR)

| Surface | Key / token | Before (LT / EN / RU) | After (LT / EN / RU) |
|---|---|---|---|
| Player card | `playerCard.verifiedTitle` | Patvirtinti įgūdžiai / Verified skills / Подтверждённые навыки | **Įgūdžių signalai / Skill signals / Сигналы навыков** |
| Player card | `playerCard.verifiedEmpty` | (verified-skills empty) | **Įgūdžių signalų dar nėra… / No skill signals yet… / Сигналов навыков пока нет…** |
| Player card | workcard pill `playerCard.workCardConfirmed/Pending` | Patvirtinta / Confirmed … | **Darbo kortelė pateikta / nepateikta — Work card submitted / not submitted** |
| Player card (visual) | green `verified-pop` chip, `state-success` glow, `trust-ring`, `trust-accent`, `ShieldCheck`, `player-card-verified-skills` testid | gold/green verified badge | **neutral ink chips, neutral border, `player-card-skill-signals` testid, `Shield` (no check)** |
| Map own marker | `verifiedSkillsCount` → ✓N gold badge + gold ring | "✓ 3" gold | **removed; ring always neutral cyan `#22D3EE`; pills = status + availability only** |
| Today screen | `todayScreen.week.confirmed* ` + gold accent | Patvirtinta / Confirmed, gold `trust-accent` count | **Peržiūrėta / Reviewed; neutral count (no gold)** |
| Today screen (visual) | `ClipboardCheck` confirm icon | clipboard-check | **`CalendarRange`** |
| Evidence card | `workerEvidence.confirmed` + emerald chip | Patvirtinti / Confirmed, emerald | **Su įrašais / With records; neutral ink chips, muted label** |
| Evidence strip | `evidenceStatus.confirmed.label/hint` + emerald active chip/dot | Patvirtinta / Confirmed, emerald | **Su įrašais / With records; "Pagrįsta jūsų peržiūrėtais darbo įrašais."; neutral ink chip + muted dot** |
| Trust block | `trust.verifiedSkills` / `trust.managerConfirmations` + green stat + `ShieldCheck`/`ClipboardCheck` | Patvirtinti įgūdžiai / Vadovo patvirtinimai, green | **Susieti įgūdžiai / Linked skills; Peržiūrėti įrašai / Reviewed records; neutral ink stat; `Layers`/`Eye` icons** |
| CV sheet | `cvExport.tiers.confirmed` + emerald tier + ✓ | Patvirtinta / Confirmed, emerald, "✓ " | **Su įrašais / With records; slate tier; no checkmark** |
| CV sheet | `cvExport.tiers.declared` | Laukia patvirtinimo / Self-declared / … | **Nurodyta pačių / Listed by you / Самозаявлено** |
| CV sheet | `cvExport.summary.verifiedSkills` / `managerConfirmations` | Patvirtinti / Vadovo patvirtinimai | **Susieti įgūdžiai / Linked skills; Peržiūrėti įrašai / Reviewed records** |
| CV sheet | `cvExport.proofRole` / `proofEmpty` | Patvirtino / proof role | **Įrašo ryšys / Record link; "Susietų įrašų dar nėra. / No linked records yet."** |
| Capabilities legend | `capabilities.status.confirmed` (+ note/legend) | Patvirtinta / Confirmed | **Su įrašais / With records** |
| Worker readiness | `workerReadiness.confirmedSkills` | Patvirtinti įgūdžiai | **Susieti įgūdžiai / Linked skills** |
| Journal skill links | `journalSkillLinks.source.confirmed` | Patvirtinta / Confirmed | **Su įrašais / With records** |
| Journal CV bridge | `journal.cvBridge` "patvirtinta/confirmed/подтверждено" | patvirtinta | **peržiūrėta / reviewed / просмотрено** |

(LT/EN/RU only — the three served locales. The 8 non-served locale files keep
their existing strings; they are not user-reachable.)

### B — kept (admin / internal-reviewer-only)

- **Review inbox actions** (`components/app/journal-inbox-entry.tsx`,
  `lib/journal/review-actions.ts`, RPC code strings): the reviewer *performs*
  the confirmation. The labels are operational ("Patvirtinti įrašą" = the verb),
  not a public certification badge. The viewer is an authorised manager/owner,
  not a normal/public user. Out of scope.

### C — kept (structural / company-identity)

- **Scouting / marketplace** structural labels and **company-identity** fields
  are not a person/skill trust badge. Out of scope.

### D — kept, untouched (the silent signal itself)

- `worker_skills.verified` column, `journal_entry_confirmations` rows, the
  `confirm_entry_and_verify_skills` / `review_journal_entry` RPCs, the capability
  `counts.confirmed` tally, the `cvSkillTier` classifier (`verified === true` →
  the strongest rung). All preserved — the data and the ranking/matching/review
  logic are unchanged. Only the *label and badge* on top of them changed.

---

## 3. Allowed neutral wording used

LT: Įgūdžių signalai · Su įrašais · Susieti įgūdžiai · Peržiūrėti įrašai ·
Nurodyta pačių · Įrašo ryšys · Darbo įrašai · peržiūrėta.
EN: Skill signals · With records · Linked skills · Reviewed records · Listed by
you · Record link · Work records · reviewed.
RU: Сигналы навыков · С записями · Связанные навыки · Просмотренные записи ·
Самозаявлено · Связь записи · просмотрено.

None of these assert that the platform certifies the person/skill/record.

---

## 4. Guards preventing reintroduction

- **New:** `lib/guards/silent-trust-wording.test.ts` —
  (A) forbids any affirmative-certification stem (`verif|confirm|patvirtin|
  tvirtinat|подтверж|верифиц`) on the ten positive-state labels across lt/en/ru;
  (B) forbids the certification visual tokens (`trust-ring`, `trust-accent`,
  `tier-gold`, `state-success`, `ShieldCheck`, `verifiedSkillsCount`,
  `verifiedBadge`, `emerald`, `"✓ "`) on the player card, own map marker, trust
  block, worker-evidence card, evidence strip, and CV sheet. Keeps the honest
  pending copy out of scope.
- **Updated to the new contract** (were pinning the old certification copy):
  `player-card-unification.test.ts`, `today-screen-honesty.test.ts`,
  `verified-cv-honesty.test.ts`, `cv-friendly-copy.test.ts`,
  `production-reality-trust-p0.test.ts` (issue-4 marker).

---

## 5. Owner correction — pending-confirmation wording removed (second pass)

**Owner rule tightened:** even *pending* confirmation wording ("Laukia
patvirtinimo" / "Awaiting confirmation" / "Ожидает подтверждения") implies a
public certification path, so it must NOT appear in normal/public/self-view UI
**at all** — not as a positive badge and not as an honest negative. Confirmation
/ verification stays real and stored (internal silent signal); the surfaces now
use **neutral review / record** language only.

**Replacement vocabulary (review/record, never certification):**

| state | LT | EN | RU |
|---|---|---|---|
| pending (awaiting) | Laukia peržiūros | Waiting for review | Ожидает просмотра |
| pending (baseline) | Dar neperžiūrėta | Not reviewed yet | Ещё не просмотрено |
| positive | Peržiūrėta / Su įrašais | Reviewed / With records | Просмотрено / С записями |
| "confirmed by a person" | peržiūri žmogus | reviewed by a person | просматривает человек |

**Surfaces changed (worker-self-view / public-in-app):** evidenceStatus,
workerEvidence, evidenceReport, capabilityProfile, profileSkillClaims,
profileHub, profileCvClarity, marketMap.capabilities.status, journalSkillLinks,
featureNotes, skills (+ skills.textFirst), suggestionStatuses, features,
structuring, playerCard (hints / readiness steps / journal-supported),
skillClarify, todayScreen, worldMap, myWorkView, workEntryReview, and the
worker dashboard / onboarding strings in `auth.dashboard.*` / `auth.onboarding.*`.
Representative changes: `evidenceStatus.awaiting_confirmation.label` "Laukia
patvirtinimo"→"Laukia peržiūros"; `skills.verified` "Patvirtinta"→"Peržiūrėta";
`skills.textFirst.confirmedByYou` "Laukia patvirtinimo"→"Laukia peržiūros" /
"Awaiting confirmation"→"Not reviewed yet"; `todayScreen.action.pending`
"…laukia patvirtinimo"→"…laukia peržiūros"; `features.external_confirmation.*`
"External confirmation / …confirm your work records"→"External review /
…review your work records"; `auth.dashboard.nextAction.worker_waiting.title`
"…waiting for confirmation"→"…waiting for review". **198 + 17 locale values**
updated across lt/en/ru via a path-precise, format-preserving script.

**Deliberately EXCLUDED (different sense / not the skill-work-record trust
ladder), documented so they are not mistaken for misses:**
- **marketMap location/coordinate confirmation** (`ownerScopeNote`,
  `mySignals.exactHidden`, `demandSignalNote`, `signalLayer.noPoints`,
  `atlas.signalOnlyNote`) — "exact location appears only once you confirm it" is
  a privacy/geo feature, not certification of a person/skill. (The feature-note
  `featureNotes.marketplaceMap` was reworded to drop the literal word anyway.)
- **auth password / sign-in-link verification** (`confirm_password_label`,
  `callback.verifying`) and the **reviewer** action `auth.dashboard.chainActions.
  reviewEntriesDesc` ("Confirm, reject…") — auth + reviewer surfaces, not
  worker self-view.
- **ICU placeholder NAMES** (`{confirmations}`, `{needConfirmation}`) in
  `evidenceReport.entrySummary` / `missingNote` — variable names, never rendered.
- **PUBLIC marketing prose** on `/for-workers` & `/for-companies`
  (`workers.*` / `companies.*`: "Verify your skills", "Confirmed skills") — in
  scope under the public clause but a brand-messaging rewrite; **flagged for an
  explicit owner go/no-go** before changing marketing copy. ~13 strings.

**Guard extended:** `silent-trust-wording.test.ts` now also walks the 22
worker-self-view / public trust namespaces and fails on ANY certification stem
(`verif|confirm|tvirtin|подтверж|верифиц`) in a rendered value (ICU placeholder
names stripped first). Five further guards that pinned the old "not
confirmed / not verified" contract were flipped to the neutral "not reviewed"
contract: `employer-preview-honesty`, `journal-entry-skill-links`,
`product-readiness`, `profile-capability-clarity`, `profile-skill-claims`,
`profile-text-flow-wiring`, `skill-clarify-capture`.

---

## 6. Owner decision — extend to public marketing (third pass)

Owner: the rule applies **everywhere visible to normal users**, including public
landing, `/for-workers`, `/for-companies`. No "one rule inside the app, another
in marketing." Public certification wording removed and replaced with neutral
work-record / profile-signal language (owner's allowed direction: "Build your
work profile", "Show / Add your work records", "Skill signals from your
entries", "Profile data from work records", "Better matching from clearer
records").

**Public pages / namespaces changed:** `/for-workers` (`workers.*`,
`pages.workers.*`), `/for-companies` (`companies.*`, `pages.companies.*`), and
the public `work-abroad` / `worker-intake` / `company-need` / `vision` pages.

**Public before → after (EN; LT/RU done in parallel):**

| Path | Before | After |
|---|---|---|
| `workers.journey.steps.1.title` | Verify your skills | **Build your work records** |
| `workers.journey.steps.1.desc` | Employers and certificates confirm what you can do. | **Your work records and certificates show what you can do.** |
| `workers.faq.items.0.q` | How are skills verified? | **Where do skill signals come from?** |
| `workers.faq.items.0.a` | Through employer confirmations on completed work… | **From your work-journal records on completed work…** |
| `workers.faq.items.2.a` | Only **verified** employers and agencies… | **Only registered employers and agencies…** |
| `workers.profile.subcopy` | …real completed work and **confirmed skills**… | **…real completed work and work records…** |
| `workers.profile.bullets.0` | …from **confirmed skills**, reliability and **on-site proof**. | **…from your work records, reliability and on-site records.** |
| `workers.profile.bullets.2` | **Skill evidence — built from confirmed work**… | **Skill signals — built from your work records…** |
| `workers.features.items.1.title` | **Evidence-backed skills** | **Records-backed skills** |
| `workers.features.items.1.desc` | Built from **confirmed work** and certificates. | **Built from your work records and certificates.** |
| `workers.features.items.0.desc` | …completed work and **proof**… | **…completed work and records…** |
| `workers.journey.steps.3.desc` | …strengthens your **proof** and readiness. | **…strengthens your records and readiness.** |
| `pages.workers.benefits.0.body` | …**evidence-backed skills**… visible to **vetted employers**… | **…records-backed skills… visible to registered employers…** |
| `companies.demand.bullets.2` | …compared with **confirmed worker skills**. | **…compared with workers' skill records.** |
| `companies.features.items.3.title` | **Confirmed skills** + fit signals | **Skill records + fit signals** |
| `companies.features.items.3.desc` | Hire on **evidence**, not on claims. | **Hire on records, not on claims.** |
| `companies.faq.items.0.a` | …from **confirmed skills**… **on-site proof**… | **…from workers' skill records… on-site records…** |
| `companies.faq.items.3.a` | Through **confirmed skills, employer-confirmed history**… | **Through workers' skill records, employer-reviewed history…** |
| `pages.companies.benefits.2.body` | Tap **vetted** agency pools… | **Tap registered agency pools…** |
| `workAbroad.steps.1.body` | …**It never invents experience and verifies nothing.** | **…It never invents experience.** |
| `workAbroad.aiNote` | It does not **verify** your skills, documents or legal status… | **It does not check your skills or documents on its own…** |
| `workerIntake.subtitle` | …we never **verify** or auto-publish anything. | **…nothing is published automatically.** |
| `workerIntake.aiNotVerified` | Review before saving — **not verified**, nothing is saved… | **Review before saving — nothing is saved automatically.** |
| `companyNeed.aiNotVerified` | Review before publishing — **not verified**… | **Review before publishing — nothing is published automatically.** |
| `vision.controlRoom.fakeClaimsLabel` | Fake AI / matching / **verified** | **Fake AI / fake matching / fake reputation** |

(84 public values across lt/en/ru.)

**Allowed exceptions KEPT (per owner):**
- **email / account verification** — `auth.callback.verifying`,
  `auth.*.confirm_password_label`.
- **legal company-identity verification** where it clearly means legal identity
  (not skill/work certification) — `companyReadiness` / `documents` legal status.
- **strictly internal / admin / reviewer-only** workflow text — `journal.inbox`,
  `auth.dashboard.chainActions.reviewEntriesDesc`, and the **employer-app**
  `dashboard/company/scouting` (`scouting.*`) + `dashboard/search`
  (`searchRoom.*`). These are not normal/public/self-view surfaces.
- **commercial pricing confirmation** — `pricing.*` ("we'll confirm pricing").
- **availability status badge** (Available/Working/Busy) — not a trust badge.
- **certificates** (the worker's own uploaded documents) — real artefacts, not a
  platform certification claim.
- **"check" CTAs** — e.g. `workAbroad.ctaReadiness` "Check country readiness".

**Guard extended:** `silent-trust-wording.test.ts` now also walks the public
marketing namespaces (`workers, companies, agencies, pages, hero, journey,
vision, workAbroad, workerIntake, companyNeed, services, marketPulse,
playercards, labourMarket, matchPreview`) and fails on any certification stem.

---

## 7. Validation

- `pnpm -F web exec vitest run` — **388 files / 5515 tests pass** (incl. the
  silent-trust guard, 11 tests).
- `pnpm -F web typecheck` / `lint` / `build` — all green.
- Risky-path scan: **NONE** — `git status` = message JSON (copy) + guard tests
  only. No DB/schema/RLS/RPC/Supabase/env/DNS/billing/auth-core/migration files;
  no production data mutation; no ranking/matching change; no internal trust
  logic or stored data removed; no DB field/function renamed.

**Held:** draft PR #512, unmerged, undeployed — awaiting owner review.
