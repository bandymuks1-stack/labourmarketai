# Worker Workspace UX Audit v2 — terminology unification + density cleanup

Sprint v2 §1 slice (2026-07-14). Scope: every worker-facing screen under
`/dashboard` + the `/cv` sheet. Philosophy: the same dense, decision-first,
actions-first Labour Market OS standard PR #751 applied to the dashboard.
Static-only pass — no data-flow, server-logic, routing or migration changes.

Verification: `pnpm -C apps/web typecheck` ✅ · `pnpm -C apps/web lint` ✅ ·
`pnpm -C apps/web test` ✅ (599 files / 9591 tests) ·
`pnpm -C apps/web check:i18n-debt` ✅ (within baseline, de/nl/ru = 0).

---

## 1. Terminology mapping applied (all 5 active locales: lt / en / ru / nl / de)

Canonical rule: one concept = one name; nav label = page title; tier/claim
distinctions live in secondary text, never in headings.

| Concept | Old variants found | Canon (LT) | Keys changed |
|---|---|---|---|
| Work journal | „Darbo žurnalas" (nav) vs „Darbo dienoraštis" / „dienoraštis" / „Darbo įrašai" (page H1) / NL „Mijn cv" / DE „Mein CV" (nav tab!) | **Darbo žurnalas** (EN Work journal, RU Рабочий журнал, NL Werkjournaal, DE Arbeitsjournal) | `journal.navTitle` (page H1, 5 locales), `auth.dashboard.tabs.journal` (nl+de were mislabelled "My CV"), `profileHub.journalLink`, `roles.worker.description`, `vision.workflowSteps.s3`, `auth.onboarding.rolePicker.worker.desc` + `.infoBox`, `auth.dashboard.wow.journal.title`, `auth.dashboard.wow.nextSteps.journal.body`, `agentOs.checklist.item.journal` |
| Open-journal verb | „Atidaryti dienoraštį" / „Atverti dienoraštį" / „Atidaryti žurnalą" | **„Atidaryti darbo žurnalą"** | `auth.dashboard.wow.journal.cta`, `auth.dashboard.wow.canonical.proof.cta`, `auth.dashboard.mySpace.proofCard.cta`, `workerEvidence.emptyCta` (+ EN "Open work journal", RU «Открыть рабочий журнал», NL "Werkjournaal openen", DE "Arbeitsjournal öffnen") |
| Skills surface | „Mano gebėjimai" / „Mano kandidatiniai įgūdžiai" / „Mano veiklos ir įgūdžiai" / EN "My capabilities" / RU «Мои возможности» / NL "Mijn capaciteiten" / DE "Meine Kompetenzen" | **Mano įgūdžiai** (EN My skills, RU Мои навыки, NL Mijn vaardigheden, DE Meine Fähigkeiten) | `journalSkillLinks.profileLink`, `roleDashboards.{company,agency,buyer}.profileLink`, `skills.textFirst.savedToCapabilities` + `.viewCapabilities`, `auth.dashboard.mySpace.activities.title`, `marketMap.capabilities.title` („Gebėjimų signalai" → „Įgūdžių signalai"). `skillClarify.listTitle` „Mano kandidatiniai įgūdžiai" → „Išsaugoti įgūdžiai" (tier jargon out of the heading; the self-declared framing stays in `selfDeclaredNote`, guard-pinned) |
| Identity surfaces | profile H1 was „Mano gebėjimai"; NL/DE `/cv` sheet claimed „Bevestigd CV" / „Bestätigter Lebenslauf" ("Confirmed CV" — dishonest) | profile page = **Mano profilis**; `/cv` sheet = **Mano CV** | `skills.pageTitle` → „Mano profilis" (nav „Profilis" ↔ H1 now agree); `cvExport.pageTitle` nl → "Mijn cv", de → "Mein Lebenslauf" (removes an affirmative-certification title the silent-trust guard misses because it only scans lt/en/ru) |
| Network | nav „Ryšiai" vs eyebrow „TINKLAS" vs section „Mano ryšiai" | **Ryšiai** (page = nav, PR #751 naming kept) | `network.eyebrow` → „RYŠIAI"; `network.relationships.title` „Mano ryšiai" → „Aktyvūs ryšiai" (5 locales) — the section lists only ACTIVE work relationships, so the new name is more honest and no longer duplicates the page title |
| Map | nav „Žemėlapis" vs „Mano rinkos žemėlapis" | **Žemėlapis** | Already canonical: page H1 = `marketMap.pageTitle` = „Žemėlapis" (fixed by an earlier slice — pre-explored fact was stale). `marketMap.title` („Mano rinkos žemėlapis") kept — see §4 |
| RU typo fix | «Журнал работ становится вашим записейом» (broken RU) | — | `auth.dashboard.wow.nextSteps.journal.body` → «Рабочий журнал становится вашей записью» |

Non-active locales (da/pl/sv/…) were not touched (parity guard scopes to the
5 active locales only).

### Guard updates (canonical-term swaps only — no honesty guard weakened)

| Guard | Change | Why intent is preserved |
|---|---|---|
| `lib/guards/journal-evidence-framing.test.ts` | `navTitle` regex `/darbo įraš/i` → `/darbo (įraš|žurnal)/i`; EN `/work record/i` → `/work (record|journal)/i` | Intent = journal never titled as CV/evidence. „Darbo žurnalas" satisfies it; the records framing stays pinned on `listTitle` |
| `lib/guards/cv-workspace-ia.test.ts` | exact pins `"Darbo įrašai"` → `"Darbo žurnalas"` for `journal.navTitle` and `profileHub.journalLink` | Intent = only `/cv` carries the „Mano CV" title; unchanged |
| `lib/guards/profile-text-flow-wiring.test.ts` | `savedToCapabilities` must contain „Mano įgūdžiai" (was „Mano gebėjimai") | Intent = success message names the unified skills surface; only the surface's canonical name changed |

---

## 2. Per-screen audit table

Columns: what was removed/tightened · what was left deliberately · notes.

| Screen | Removed / tightened | Left deliberately (why) | 
|---|---|---|
| **Dashboard home** `dashboard/page.tsx` | Nothing removed — already decision-first after PR #751 + audit PR6 (single top-slot card, collapsed hub person block, „Kas ką gerina" explainer already retired, count-gated pending cards). Benefits from the journal/skills renames via shared keys. | Whole structure — every block is count-gated or guard-audited. |
| **Profile** `dashboard/profile/page.tsx` | H1 „Mano gebėjimai" → **„Mano profilis"** (nav „Profilis" ↔ title now agree). Verified `/cv` reachable from the header (`profile-cv-export-link`, pre-existing) — no duplicate link added. | `FeatureNote` (guard `launch-explanations-cta` REQUIRES it on this surface); `ProfileHubOverview`, `CvCompletenessGrid`, `SkillsReviewBanner`, `TrustBlock`, all CV-section editors — canon from recent slices; capability warehouse already collapsed in `<details id="capabilities">`. |
| **Journal** `dashboard/journal/page.tsx` | H1 „Darbo įrašai" (3rd name for the surface) → **„Darbo žurnalas"** = nav tab; list keeps „Darbo įrašai" as its h2 so the hierarchy reads journal → records. | The three small-print lines above the list (`whoCanConfirm`, `cvBridge`, `proofLoop`) — each is individually guard-mandated (journal-evidence-loop / cv-workspace-ia / journal-proof-engine) and already 11px muted; identity card + spreadsheet mode + readiness already collapsed `<details>`; day nav already capped at 21 chips; day groups already collapse (newest open). |
| **Opportunities** `dashboard/opportunities/page.tsx` | Removed `nextStep.intro` explanatory sentence (restated what the two link cards say); key deleted from all 5 active locales (1 paragraph cut). | `trustNote`, `footnote`, `FeatureNote` (guard-required), „how matching works" (already `<details>`), readiness chips, saved/filters/compare sections — honesty- or feature-guarded; the board list is NOT capped: it is itself the full view and already has filters + progressive-disclosure cards. |
| **Documents** `dashboard/documents/page.tsx` + `lt-document-guidance.tsx` | LT-master guidance registry (the page's long always-open tail list) collapsed into per-country `<details>` with item counts — disclaimer + review-status summary stay always visible; no item removed. | `disclaimer`, `uploadNote` (no file upload exists — §18), `scopeNote`, consent notes, attention strip — all honest-state or legal text; work-proof export cards (3 + journal counts) are the page's real actions. |
| **Planning** `dashboard/planning/page.tsx` | Nothing removed — already dense: chip view-switcher, chip filters, compact month/week strips, per-source honest degradation notes render only on real failure states. | `month.hint` one-liner and `pastHidden` honest history note (single lines, load-bearing). |
| **Tasks** `dashboard/tasks/page.tsx` | The always-open ~10-field create form (≈70 rendered lines) collapsed into a `<details>` disclosure — **open tasks now lead the page**; same form, same RPC action, guard `work-tasks` still green. | `honestNote` („a task contacts nobody") — honesty-guarded; per-card edit forms were already `<details>`; closed tasks already behind a toggle link. |
| **Bookings / Communication / Account / Privacy / Network / Market-map / Reports / Activity / Gallery / Learning / Assist / Instructions** | Audited, no density edits needed: all ≤ ~460 lines, already chip/list-based with honest empty states. Network got the terminology fixes (eyebrow, section title). Market-map is already progressive-disclosure (capture/readiness/world-map demoted into one collapsed „advanced" details since owner UX recovery v1). | Market-map `MapLayersLegend` future-layers list — honest "not on map yet" signal, guard-pinned. |
| **Cross-cutting** | Account menu (`components/app/account-menu.tsx`): added a permanent **„Mano CV" → `/cv`** menu item (`account-menu-cv-link`, label = `cvExport.pageTitle`) so the CV sheet — which lives outside the dashboard shell — is findable from every page. Fixed NL/DE nav mislabel where the JOURNAL tab was called "Mijn cv"/"Mein CV" (a worker tapping "My CV" landed on the journal). | The account menu stays utility-only otherwise (per the IA-cleanup audit). |

Counts: explanatory copy removed = 1 paragraph (opportunities) + 2 heading
de-duplications (network section, journal H1 tri-name); lists collapsed = 2
(tasks create form, LT document-guidance registry — every item still one tap
away); terminology values changed = 58 message values across 5 locales + 5
`journal.json` files; guard files updated = 3 (canonical-term swaps only).

---

## 3. What was checked and deliberately NOT cut (would need owner/guard decisions)

1. **„Mano darbo kortelė" (work card)** — NOT merged into „Mano profilis".
   It is a guarded, distinct state-machine concept (`work-card-state`,
   `profile-work-card-source`, journal `navSubtitle`/`composerBenefit` are
   guard-required to reference it). It does not duplicate the profile; the
   profile is pinned as its *source*.
2. **„Mano kortelė" (player card)** — kept. It names a distinct surface
   (player card, `/dashboard/player-card`) and is already self-consistent
   across nav link, identity actions and page title.
3. **`marketMap.title` „Mano rinkos žemėlapis"** — rename to „Žemėlapio
   apžvalga" was attempted and REVERTED: guard
   `market-map-working-owner-framing-v1` pins the owner-framing („MY market
   map", lt/en/ru) as the anti-public-aggregate honesty signal. The string
   only renders inside the collapsed „advanced" details, so the visible drift
   is minimal. Changing it means changing that guard's intent → owner call.
4. **Journal small-print stack** (whoCanConfirm + cvBridge + proofLoop = 3
   consecutive 11px lines) — each individually guard-mandated; merging them
   into one line would require rewriting 3 guards. Recommend a follow-up
   owner-approved consolidation.
5. **FeatureNote boxes** on profile / opportunities / market-map / company —
   `launch-explanations-cta` requires these exact mounts.

## 4. Remaining recommendations (owner decisions required)

1. **Move `/cv` into the dashboard shell** (`/dashboard/cv`) so it gets the
   nav chrome — RECOMMEND; not done (routing move out of slice scope). The
   account-menu + profile-header + journal-bridge links now cover findability.
2. **RU secondary copy** still mixes «журнал работ» (generic lowercase) in
   ~10 body strings while nav/titles are now «Рабочий журнал» — harmless as
   natural language, but a RU-reviewer pass could unify.
3. **DE proof-wording leak**: `auth.dashboard.wow.nextSteps.journal.body`
   (de) says "wird zu Ihren **Nachweisen**" (= proofs). The
   worker-facing-copy guard only bans LT/EN/RU stems, so this passes —
   recommend extending the guard stems to NL/DE and rewording.
4. **Guard-evading proof wording (LT/EN)**: `skills.pageSubtitle` ends
   „…kuo galite tai **įrodyti**" / EN "…what **proves** it" — evades the
   `įrodym-`/`proofs?` stems. Owner wording pass recommended (e.g. „kuo tai
   paremta" / "what backs it").
5. **Journal small-print consolidation** (see §3.4).
6. **`auth.dashboard.mySpace.*` and `wow.*` blocks** appear unmounted in the
   current UI (folded into the premium hub) but are still guard-pinned copy —
   candidates for a copy-inventory cleanup slice.
