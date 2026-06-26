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

## 6. Validation

- `pnpm -F web exec vitest run` — **388 files / 5515 tests pass** (incl. the
  silent-trust guard, 11 tests).
- `pnpm -F web typecheck` / `lint` / `build` — all green.
- Risky-path scan: **NONE** — `git status` = message JSON (copy) + guard tests
  only. No DB/schema/RLS/RPC/Supabase/env/DNS/billing/auth-core/migration files;
  no production data mutation; no ranking/matching change; no internal trust
  logic or stored data removed.

**Held:** draft PR #512, unmerged, undeployed — awaiting owner review.
