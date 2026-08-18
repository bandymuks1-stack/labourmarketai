# Localization truth audit — 2026-08-18 (TRAIN F)

Read-only audit. Repo: `C:/Users/Mano/Documents/labourmarketai-wt/truth-audit-0818`,
branch `docs/cc/full-project-truth-2026-08-18`, HEAD `cb078ff3`.
Owner P0 under test: **"Russian must genuinely work across every major journey."**

Method: flattened every catalogue (`apps/web/messages/<loc>.json` + the six
per-locale taxonomy files under `apps/web/messages/<loc>/`) to leaf key paths
with Python `json.load`, then compared structurally against `en`. Taxonomy keys
are namespaced `@<file>` below. Total flattened leaves per active locale: **10,829**.

---

## 0. Headline verdict

**RU is genuinely translated — the catalogue is not the problem.** Structural
parity is perfect and 99.33% of English prose has real Cyrillic Russian behind it.

There is exactly **one real RU defect cluster**, and it is the worst possible
location: **the landing hero — the first screen a Russian visitor sees — is raw
English.** 37 of the hero's prose keys were never translated for RU, NL or DE.
They were translated for LT only.

| Metric | RU |
|---|---|
| Keys missing from ru (present in en) | **0** |
| Keys extra in ru | 0 |
| `[EN]` markers | **0** |
| Empty string values | 0 |
| Identical-to-EN values (all types) | 110 |
| Identical-to-EN **prose** values | **54** |
| RU values with Latin letters and **no Cyrillic** (prose) | **55** |
| **Union — genuinely untranslated RU prose keys** | **55** |
| — of which `landing.hero.*` | **37** |
| — of which benign (placeholders/currency/brand/format) | 16 |
| — of which internal admin-only | 2 |
| **RU Cyrillic coverage of EN prose (8,224 keys)** | **99.33%** |

**Total missing/untranslated RU keys = 0 missing + 55 untranslated = 55**, of
which **37 are the landing hero** and only **~39 are user-facing at all**.

---

## 1. RU vs EN — structural comparison

```
missing (in en, not in ru):        0
extra   (in ru, not in en):        0
[EN] marker values:                0
empty string values:               0
identical-to-en (all leaves):    110
identical-to-en (prose only):     54
latin-only prose values:          55
```

Structural parity is enforced and holding. The `landing.hero` gap is **invisible
to every existing guard** — see §6.

### Top 30 affected RU key paths, grouped by journey area

**Landing / marketing — 37 keys (THE defect). All rendered, all user-facing.**

```
landing.hero.reacting                        "Market reacting… {count} signals"
landing.hero.decisionField.whyHere           "Why here"
landing.hero.decisionField.whyNow            "Why now"
landing.hero.decisionField.whyYou            "Why you"
landing.hero.decisionField.whyNotElsewhere   "Why not elsewhere"
landing.hero.reason.r1a                      "Checking open needs by role and region…"
landing.hero.reason.r1b                      "Comparing against available people in each area…"
landing.hero.reason.r1c                      "Weighing travel distance and start dates…"
landing.hero.reason.r2a                      "Searching welding needs in offshore industry…"
landing.hero.reason.r2b                      "Checking certification requirements…"
landing.hero.reason.r2c                      "Weighing the seasonal project cycle…"
landing.hero.reason.r3a                      "Collecting availability signals by region…"
landing.hero.reason.r3b                      "Checking skills evidenced in work journals…"
landing.hero.reason.r3c                      "Assessing readiness to start…"
landing.hero.decision.d1.whyHere             "Rotterdam and Eindhoven have more open needs…"
landing.hero.decision.d1.whyNow              "Projects start within the next 4 weeks."
landing.hero.decision.d1.whyYou              "Your work journal holds 14 entries…"
landing.hero.decision.d1.whyNotElsewhere     "Belgium and Germany show lower demand…"
landing.hero.decision.d1.next                "Review these needs"
landing.hero.decision.d2.whyHere             "Offshore industry in Stavanger and Bergen…"
landing.hero.decision.d2.whyNow              "The contracting cycle opens before the winter season."
landing.hero.decision.d2.whyYou              "You have welding evidence and are ready to travel."
landing.hero.decision.d2.whyNotElsewhere     "Denmark has fewer projects; Poland has more…"
landing.hero.decision.d2.next                "See the requirements"
landing.hero.decision.d3.whyHere             "Vilnius and Kaunas hold the most people ready to start."
landing.hero.decision.d3.whyNow              "Their availability was confirmed in the last 2 weeks."
landing.hero.decision.d3.whyYou              "Your need matches their evidenced skills."
landing.hero.decision.d3.whyNotElsewhere     "Latvia and Estonia hold fewer available people…"
landing.hero.decision.d3.next                "Review these people"
landing.hero.askPlaceholder                  "Ask your own question…"   (also the aria-label)
landing.hero.unmatched                       "In this demonstration I answer about electricians…"
landing.hero.previewLabel                    "Best matching person"
landing.hero.previewRole                     "Electrician · Vilnius · Available from September"
landing.hero.previewMetric.entries           "Work records"
landing.hero.previewMetric.skills            "Evidenced skills"
landing.hero.persistAction                   "Save this result"
landing.hero.persistWhy                      "An account is only needed to save, apply or make contact…"
```

**Admin-internal — 2 keys** (not worker/employer facing)

```
vision.controlRoom.ownerSmokeLabel           "Owner production smoke"
admin.launch.status.green_scoped             "green scoped"
```

**Benign — 16 keys** (placeholders, currency/date formats, brand and mode badges,
proper nouns). These are correctly left as-is and are **not** defects:

```
businessProfile.emailPlaceholder  "hello@example.com"
auth.signup.email_placeholder     "name@company.com"
waitlist.email_placeholder        "name@company.com"
network.invite.emailsPlaceholder  "imya@primer.ru, drugoi@primer.ru"   (RU-appropriate)
auth.dashboard.workCard.value.payRange   "€{min}–{max}"
conversation.criteria.salaryRange        "€{min}–{max}"
opportunities.structured.chipPay         "{amount} {currency}/{unit}"
opportunities.structured.chipPayBasis    "{amount} {currency}/{unit} ({basis})"
reports.journalWindow.windowRange        "{start} – {end}"
workspace.ai.journalLine                 "— {day}: {what}"
workspace.ai.demandLine                  "— {title} ({state})"
planBoundary.plans.worker_plus           "Worker Plus"        (plan brand name)
billingTest.badge / billingStatus.badge.stripe_test  "TEST MODE"
intelligence.sources.key.uzt_lt          "Užimtumo tarnyba"   (proper noun)
vision.controlRoom.pr18Status            "BLOCKED (issue #32)"
```

### Proof the hero gap is live, not dead code

- `apps/web/app/[locale]/(marketing)/page.tsx:27` — `getTranslations("landing.hero")`
- `apps/web/components/marketing/hero-live-demo.tsx:64` — `useTranslations("landing.hero")`

`hero-live-demo.tsx` renders `reacting` (225), `decisionField.whyNotElsewhere`
(281), `previewLabel` (324), `previewRole` (338), `persistAction` (361),
`persistWhy` (364), `askPlaceholder` (381 **and 382 as `aria-label`**),
`unmatched` (435), plus the `reason.*` / `decision.*` bodies via
`components/app/market-map/landing-scenario.ts`.

`landing.hero.headline` and `landing.hero.sub` **are** translated in RU. So a
Russian visitor gets a Russian headline and subheadline, then an English AI
demo directly underneath it. This is precisely the failure mode of judging a
locale by its navigation.

### Cross-locale proof — this is a LT-only translation, not a RU-only miss

`landing.hero` has 61 leaves in `en.json`. Values identical to EN:

| locale | identical / 61 |
|---|---|
| lt | **4** (translated) |
| ru | **44** |
| nl | **44** |
| de | **45** |
| pl, sv | 0 — *namespace absent entirely* (non-active, not routed) |

---

## 2. NL and DE — counts only

| locale | leaves | missing | extra | `[EN]` | empty | identical-to-EN (all) | identical-to-EN (prose) | % of EN prose |
|---|---|---|---|---|---|---|---|---|
| lt | 10,829 | 0 | 0 | 0 | 0 | 90 | 15 | 0.18% |
| **ru** | 10,829 | **0** | 0 | **0** | 0 | 110 | **54** | **0.66%** |
| **nl** | 10,829 | **0** | 0 | **0** | 0 | 423 | **130** | **1.58%** |
| **de** | 10,829 | **0** | 0 | **0** | 0 | 359 | **126** | **1.53%** |

Untranslated prose by namespace:

- **NL (130):** `@labour-market` 44, `landing` 37, `journal` 9, `orgMembers` 9,
  `@journal` 7, `opportunities` 3, `admin` 2, `auth` 2, `agentOs` 2,
  `workspace` 2, remainder 1 each.
- **DE (126):** `@labour-market` 44, `landing` 37, `journal` 9, `orgMembers` 9,
  `@journal` 6, `planBoundary` 4, `auth` 2, `agentOs` 2, `opportunities` 2,
  `workspace` 2, remainder 1 each.

**NL and DE are materially weaker than RU** — roughly 2.4x the untranslated
prose. Their largest cluster is `@labour-market` (44 taxonomy terms), where
**RU is 100% translated**. NL/DE also carry 9 untranslated `orgMembers` and
9 `journal` prose keys that RU does not.

---

## 3. Hardcoded user-facing strings (bypassing i18n)

Scanned all `.tsx` under `apps/web/app` and `apps/web/components` (485 files),
excluding `*.test.*`, `*.spec.*`, `__tests__/`, `tests/`, `*.stories.*`.
Extracted multi-line JSX text nodes and the attributes `placeholder=`,
`title=`, `aria-label=`, `alt=`, `label=`, `aria-description=`; stripped
comments; filtered out code fragments, ids, paths and camelCase.

**The codebase is overwhelmingly i18n-clean.** Only 49 candidates across 9
files survived, and they concentrate in two admin diagnostic pages that are
English-by-design. Worst offenders:

| # | file:line | kind | string |
|---|---|---|---|
| 1 | `apps/web/app/[locale]/dashboard/admin/project-truth/page.tsx:137` | jsx-text | "Real situation, not a preview. No fake rows, no fake counts…" |
| 2 | `…/admin/project-truth/page.tsx:147` | jsx-text | "1. Root cause — why admin sees only himself" |
| 3 | `…/admin/project-truth/page.tsx:150` | jsx-text | "The DB-level RLS helper" |
| 4 | `…/admin/project-truth/page.tsx:157` | jsx-text | "When you switch workspace," |
| 5 | `…/admin/project-truth/page.tsx:166` | jsx-text | "→ you see only your own profile row." |
| 6 | `…/admin/project-truth/page.tsx:181` | jsx-text | "2. Your admin signals (this session)" |
| 7 | `…/admin/project-truth/page.tsx:211` | jsx-text | "✗ no (app-only)" |
| 8 | `…/admin/project-truth/page.tsx:225` | jsx-text | "To fix the mismatch" |
| 9 | `…/admin/project-truth/page.tsx:289` | jsx-text | "3. What this session CAN see (RLS-filtered)" |
| 10 | `…/admin/project-truth/page.tsx:292` | jsx-text | "These counts come from the SAME user-scoped supabase client…" |
| 11 | `…/admin/project-truth/page.tsx:333` | jsx-text | "migration 0026 not applied" |
| 12 | `…/admin/project-truth/page.tsx:362` | jsx-text | "migration 0025 not applied" |
| 13 | `…/admin/project-truth/page.tsx:378` | jsx-text | "migration 0027 not applied" |
| 14 | `…/admin/project-truth/page.tsx:412` | jsx-text | "migration 0028 not applied" |
| 15 | `…/admin/project-truth/page.tsx:430` | jsx-text | "migration 0029 not applied" |
| 16 | `…/admin/project-truth/page.tsx:442` | jsx-text | "4. Environment summary (no secret values)" |
| 17 | `…/admin/project-truth/page.tsx:565` | jsx-text | "7. Exact owner action to fix admin visibility" |
| 18 | `…/admin/project-truth/page.tsx:568` | jsx-text | "Option A — fastest, session-scope only: switch your active workspace back to" |
| 19 | `…/admin/project-truth/page.tsx:604` | jsx-text | "✓ Applied to prod 2026-05-28 (migration 0024_is_admin_dual_signal…)" |
| 20 | `…/admin/project-truth/page.tsx:621` | jsx-text | "Listing ALL Supabase auth users (including those who registered but have no…" |
| 21 | `…/admin/project-truth/page.tsx:638` | jsx-text | "Honest diagnostic · no fake rows · no service-role client · no mutations…" |
| 22 | `apps/web/app/[locale]/dashboard/admin/telemetry/page.tsx:234` | jsx-text | "No funnel events yet, or the event store is unavailable." |
| 23 | `…/admin/telemetry/page.tsx:280` | jsx-text | "No attributed conversions yet." |
| 24 | `…/admin/telemetry/page.tsx:383` | jsx-text | "AI cost and usage" |
| 25 | `…/admin/telemetry/page.tsx:424` | jsx-text | "Actual run cost, USD (costed runs only)" |

Remaining, outside the top 25 but worth naming because they are **not** admin-only:

- `apps/web/app/[locale]/dashboard/admin/telemetry/page.tsx:444, 450, 457, 463` — four more English-only status/empty-state lines.
- `apps/web/app/[locale]/dashboard/talent/page.tsx:103, 110, 145, 161` — the talent
  preview page is English-only prose plus `aria-label="Sample worker cards"` (150)
  and `aria-label="Sample job demand cards"` (173). Line 145 mixes English with a
  Lithuanian literal (`owner-approved laukia`) — a RU or DE user sees both.
- `apps/web/app/global-error.tsx:33, 50` — see §5; deliberate and documented.

False positives excluded after inspection: `components/app/live-map.tsx:29`,
`components/app/live-world-map.tsx:30`, `components/app/workspace/opportunities-result.tsx:155,177`,
`app/[locale]/cv/page.tsx:96`, `components/app/market-map/location-map.tsx:60`
— all JS expression fragments caught by the `>…<` heuristic, not rendered text.

**Assessment:** hardcoded strings are a real but *contained* problem. They do not
threaten the RU P0 — every one of them sits on an admin diagnostic surface, an
owner-review preview page, or the pre-i18n root error boundary.

---

## 4. RU coverage by journey area

Areas mapped from real top-level namespaces in `en.json` (184 of them) plus the
six taxonomy files. "Untranslated" = value identical to EN **or** containing
Latin letters with no Cyrillic, restricted to prose (≥2 Latin words in EN).

| Journey area | Namespaces (evidence) | EN prose keys | RU untranslated | Verdict |
|---|---|---|---|---|
| **Landing / marketing** | `landing`, `pricing`, `waitlist`, `hero`, `heroCards`, `about`, `features`, `footer` | 201 (`landing`) | **37** | **PARTIAL — P0.** Sub-namespaces `landing.loop`, `landing.marketProof`, `landing.headline`/`sub` translated; **`landing.hero` body is raw English.** First screen fails. |
| **Auth** | `auth` (532 keys incl. `auth.dashboard`) | 401 | 2 (both benign: email placeholder, `€{min}–{max}`) | **COMPLETE** |
| **Onboarding** | `setupJourney`, `setupRoleChoice`, `workerIntake`, `journey`, `todayScreen` | 122 | 0 | **COMPLETE** |
| **Profile** | `profileHub`, `playerCard`, `playercards`, `profileState`, `profileAvatar`, `profileSkillClaims`, `capabilityProfile`, `businessProfile`, `externalProfiles`, `workerPrefs` | 276 | 1 (benign `hello@example.com`) | **COMPLETE** |
| **CV** | `cv`, `cvSections`, `cvExport`, `cvImport`, `profileCvClarity` | 175 | **0** | **COMPLETE** |
| **Jobs** | `jobPostings`, `opportunities`, `jobDiscovery`, `vacancySources`, `marketplace`, `marketplaceListings`, `candidatePool`, `candidates` | 362 | 2 (both benign pay-chip formats) | **COMPLETE** |
| **Matching** | `matchPreview`, `scouting`, `marketMap`, `marketMapBase`, `intelligence`, `structuredDemand`, `marketRecognition`, `marketPulse`, `worldMap`, `mapLayers` | 677 | 1 (benign proper noun `Užimtumo tarnyba`) | **COMPLETE** |
| **Journal** | `journal` (base) + `@journal` taxonomy (431) | 509 | **0** (1 non-prose: `@journal.proofLoop.cvLink` = "CV") | **COMPLETE** — 430/431 taxonomy leaves Cyrillic |
| **Employer / organization** | `roleDashboards`, `workspace`, `companies`, `companyOps`, `companyNeed`, `orgMembers`, `orgDocuments`, `teamBrigades`, `agencies`, `agencyPool`, `agencyBridge`, `agencyClients`, `clientBridge` | 720 | 2 (benign `— {day}: {what}` line formats) | **COMPLETE** |
| **Projects** | `projects`, `projectOps`, `projectStages`, `projectEconomics`, `workObjects`, `handoverPassport` | 344 | **0** | **COMPLETE** |
| **Calendar** | `bookings`, `planning`, `workforcePlanning`, `absences`, `trips`, `timesheets` | 93+ | **0** | **COMPLETE** |
| **Approvals** | `approvals`, `workEntryReview`, `developmentReviews`, `reviewReport`, `requests`, `helpRequests`, `agreements` | 184 | **0** | **COMPLETE** |
| **Documents** | `documents`, `documentFiles`, `documentCentre`, `orgDocuments`, `assets` | 171 | **0** | **COMPLETE** |
| **Notifications / messaging** | `communication`, `conversation`, `messaging`, `activityCentre`, `followUp`, `invitations`, `workerInvitations`, `network` | 679 | 2 (benign `€{min}–{max}`; RU-localized invite placeholder) | **COMPLETE** |
| **Billing** | `adminBilling`, `billingStatus`, `billingTest`, `planBoundary`, `accountPlan`, `finance`, `commercial` | 152 | 3 (all benign: "TEST MODE" ×2, "Worker Plus" plan name) | **COMPLETE** |
| **Privacy / legal** | `legal` (216), `privacyConsent`, `privacySelfService` | 309 | **0** | **COMPLETE** |
| **Errors** | `notFound`, `errorBoundary`, `orgTier1Warning`, `planBoundary` | 7 in-catalogue | 0 in-catalogue | **PARTIAL** — catalogue clean, but `app/global-error.tsx` is outside i18n (§5) |
| *(Admin / internal)* | `admin`, `vision`, `agentOs`, `telemetry`, `adminPilots`, `adminReadiness`, `adminLaunchReadiness` | 323+ | 2 prose + hardcoded pages (§3) | **PARTIAL — not user-facing; out of P0 scope** |

**RU Cyrillic coverage across all 190 namespaces: 175 fully Cyrillic; 15 carry at
least one Latin value, and in 13 of those the Latin value is benign.**

---

## 5. Locales where a major journey falls back incorrectly

**5.1 — No fallback exists at all.** `apps/web/lib/i18n/request.ts` loads exactly
one locale's files and merges them; there is **no `fallbackLocale` and no
per-key EN backstop**. A missing key surfaces as a next-intl `MISSING_MESSAGE`
error, not as English. Today this is safe (0 missing keys in all 5 active
locales) but it is a brittle design: the parity guard is the *only* thing
standing between a dropped key and a runtime error on a routed page.

**5.2 — `landing.hero` "falls back" by having been copied, not translated.**
Because the English text was physically pasted into `ru.json`, `nl.json` and
`de.json`, the system cannot detect it and no fallback is triggered. RU, NL and
DE visitors see English on the primary marketing surface while believing the
site is localized. **This is the incorrect fallback.**

**5.3 — `app/global-error.tsx` is locale-blind by design.** It sits above the
`[locale]` segment, renders its own `<html lang="lt">`, and hardcodes Lithuanian
+ English (`:33`, `:50` — "Bandyti dar kartą / Try again"). The file documents
the reason: the intl provider may be part of what broke. Defensible, but a
Russian, Dutch or German user hitting a root-level error gets no language they
necessarily read, and the document is mislabelled `lang="lt"` for all of them.

**5.4 — non-active locales are correctly inert.** `lv/et/da/no/sv/pl` (3,923
leaves each) are not routed, not prerendered and not selectable
(`routing.ts` uses `activeLocales`). `fi` is taxonomy-only by design
(`NON_UI_TAXONOMY_LOCALES`). **Neither is a defect** — both are declared honestly
in `apps/web/lib/i18n/launch-language-scope.ts`.

---

## 6. Why no guard caught this

Two guards exist and both are blind to copied English:

1. **`apps/web/lib/guards/i18n-lt-en-parity.test.ts`** compares **key structure**
   and rejects **empty** values across `lt/en/ru/nl/de`. A key whose value is
   verbatim English passes — the key exists and is non-empty.

2. **`apps/web/lib/guards/i18n-debt.ts`** counts the literal marker
   `UNTRANSLATED_MARKER = "[EN]"`, with RU/NL on a **ZERO baseline**. The
   `landing.hero` strings were pasted **without** the `[EN]` prefix, so the debt
   inventory reads clean at zero while 37 English strings ship to RU.

**The gap:** nothing asserts that a RU value differs from its EN counterpart, and
nothing asserts RU prose contains Cyrillic. Both are cheap, deterministic checks.

Note also that `config.ts` already states RU/NL/DE are "AI-seeded full
translations pending human review (§7.4)" and are **preview-tagged** in the
language selector. The code has been honest about Tier 2 status all along; the
`landing.hero` block simply never went through the AI seeding that the rest did.

---

## 7. Recommended fixes (not applied — audit only)

1. **P0 — translate the 37 `landing.hero.*` keys for RU** (then NL, DE). This is
   the entire user-visible RU defect.
2. **P1 — add a guard**: for each active non-EN locale, fail if a prose value is
   byte-identical to EN outside an allowlist (the 16 benign keys in §1).
3. **P1 — add a RU script guard**: fail if a `ru` value contains ≥2 Latin words
   and zero Cyrillic, same allowlist.
4. **P2 — NL/DE `@labour-market`**: 44 untranslated taxonomy terms each; RU is
   already at 100% here.
5. **P2 — `dashboard/talent/page.tsx`**: move the 4 prose strings and 2
   `aria-label`s into the catalogue; it currently mixes English and Lithuanian.
6. **P3 — `global-error.tsx`**: consider a 5-language line or at least drop the
   hardcoded `lang="lt"`.

---

## 8. Honest bottom line

Russian is **not** a veneer here. Every major *product* journey — journal, CV,
jobs, matching, projects, approvals, documents, calendar, employer workspace,
billing, privacy — is genuinely, fully Russian, including 100% of the profession,
skill and labour-market taxonomies. That is real work and it holds up.

But the owner's P0 still fails on first contact: **a Russian visitor lands on
`/ru` and the hero — the product's own live AI demonstration — speaks English at
them.** Fixing 37 strings closes the gap. Nothing structural is wrong.

NL and DE are in worse shape than RU on every measure and should not be
described as equivalent to it.
