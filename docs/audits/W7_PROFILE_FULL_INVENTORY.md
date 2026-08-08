# W7 P1-4 — `/dashboard/profile` FULL INVENTORY

Executes `w7-p14-profile-inventory-PLAN.md`. **Audit only — zero product-code
changes are attributed to this document.**

| | |
|---|---|
| Pinned at | `origin/main` `779357aac31a28704c169bba2a03265a2f104f42` |
| Worktree | `C:/Users/Mano/Documents/lm-w7-ux-audit` (detached, own `node_modules`, own dev server `:3450`, own `.env.local` → `http://127.0.0.1:54321`) |
| Target | `apps/web/app/[locale]/dashboard/profile/page.tsx` — 1007 lines |
| Identity | `dev.worker@local.test` (local fixtures, 190/190 migrations) |
| Evidence | `docs/audits/evidence/w7-ux-audit/worker-profile-{1440,375}.png`, `measurements-worker.json` |
| Capture tool | `apps/web/scripts/ux-audit-capture.mjs` (headless Chromium, `caret: "initial"`, refuses any non-loopback base URL) |

## 0. Method note — one false positive discarded

The first pass drove the page through the in-app browser pane. That pane was
not compositing frames, and the profile route appeared to render **only a
skeleton with all 19 sections present but at height 0**. That is the #1011
signature (`labourmarketai-suspense-reveal-needs-paint`), not a product defect:
the same route in a real painting Chromium renders 6104 px of content with the
skeleton unmounted. **No hang defect is reported.** A second candidate —
`/dashboard/admin/users` returning 404 — was also discarded: only
`/admin/users/[id]` exists and nothing links to the bare path.

## 1. Measured page facts

| metric | 1440×900 | 375×812 |
|---|---|---|
| rendered height | **6104 px** | **8823 px** |
| folds | 6.8 | **10.9** |
| TTFB (local dev, warm) | 5655 ms | 3913 ms |
| `.card-border` blocks | 19 | 19 |
| `<section>` | 16 | 16 |
| `<h2>` | 14 | 14 |
| buttons / links | 57 / 39 | 57 / 39 |
| **inputs with no label** | **34** | **34** |
| **targets under 44 px** | **73** | **72** |
| horizontal overflow | none | none |
| console errors (product) | none | none |

Only one `<h1>` ("Mano profilis"). Document width never exceeds the viewport at
375 — the mobile overflow bucket is **clean**.

## 2. Section inventory (top to bottom, y at 1440)

`Own` = classification (§5). Data source is the `lib/*` function, not "supabase".

| # | Section | Anchor / testid | Component | Data source | In a `Promise.all`? | Role gate | y / h | Own |
|---|---|---|---|---|---|---|---|---|
| 1 | Title + 5 action links | `#profile-top` | inline | none | — | 4 of 5 gated on `workerId`; Documents also on `DOCUMENTS_READINESS_ENABLED` | 94 / 26 | `PROFILE_OWNED` |
| 2 | Page quick-nav (4 anchors) | `page-quick-nav` | `PageQuickNav` | none | — | none | 177 / 58 | `PROFILE_OWNED` |
| 3 | State strip — readiness · freshness · today | `profile-state-strip` | `ProfileStateStrip` | canonical player-card model | client | worker | 276 / 64 | `DUPLICATE_OF` #6 |
| 4 | Live profile — missing / history / evidence / opportunity | `live-profile-section` | `LiveProfileSection` | same canonical card model | client | worker | 381 / 299 | `DUPLICATE_OF` #6 |
| 5 | Setup journey — 6 steps | `worker-setup-journey` | `WorkerSetupJourney` | readiness model | client | self-gates to worker | 704 / **506** | `DUPLICATE_OF` #6 |
| 6 | Hub overview — 4 pillars + 1 primary action | `profile-hub-overview` | `ProfileHubOverview` | reuses reads already on the page | — | `hasWorker` prop | 1644 / 257 | `PROFILE_OWNED` (the declared single summary) |
| 7 | Avatar | `#profile-identity` | `ProfileAvatar` | `getOwnAvatar()` | **serial** (L160) | none | 1233 / 122 | `PROFILE_OWNED` |
| 8 | Managed companies + add-company | `#managed-companies` | inline | `getOwnedOrganizations()` | **serial** (L165) | none | 1379 / 180 | `MISPLACED_HAS_HOME` → `/dashboard/company` |
| 9 | Feature note | `feature-note-profile` | `FeatureNote` | none (extra `getTranslations` at L592) | — | none | 1583 / 38 | `PROFILE_OWNED` |
| 10 | CV completeness grid — 10 cards | `cv-completeness-grid` | `CvCompletenessGrid` | derived from reads above | — | worker | 1925 / 224 | `DUPLICATE_OF` #6 |
| 11 | Skills review banner | — | `SkillsReviewBanner` | `deriveSkillEvidence` (recomputed, L712) | — | worker | conditional | `DUPLICATE_OF` #6 (pillar `skills`) |
| 12 | Trust block — 3 counters | `profile-trust-block` | `TrustBlock` | `getOwnTrustSignals()` | **serial, inside JSX** (L732) | worker | 2173 / 186 | `PROFILE_OWNED` |
| 13 | Availability & work preferences | `#cv-availability` | `WorkerAvailabilityPrefsForm` | `getOwnAvailabilityPrefs()` | batch L234 | worker | 2382 / **946** | `PROFILE_OWNED` |
| 14 | Languages | `#cv-languages` | `WorkerLanguagesSection` | `getOwnWorkerLanguages()` | batch L234 | worker | 3352 / 283 | `PROFILE_OWNED` |
| 15 | Education | `#cv-education` | `WorkerEducationSection` | `getOwnWorkerEducation()` | batch L234 | worker + read kind | ~3650 | `PROFILE_OWNED` |
| 16 | Achievements / declared certificates | `#cv-achievements` | `WorkerAchievementsSection` | `getOwnWorkerAchievements()` | batch L234 | worker + read kind | ~4000 | `PROFILE_OWNED` |
| 17 | External profiles | — | `ExternalProfilesSection` | `getOwnExternalProfiles()` | batch L234 | worker + `kind !== "no-worker"` | ~4400 | `PROFILE_OWNED` |
| 18 | Message company | — | `MessageButton` | `getEmployerOwnerProfileId()` | **serial** (L271) | worker **and** resolved employer | conditional | `MISPLACED_HAS_HOME` → `/dashboard/communication` |
| 19 | Text-first composer + trade picker | `#profile-edit` | `ProfileTextFirstFlow` + `WorkerTradeProfile` | `profile_skill_claims`, `worker_skills`, professions | mixed | composer universal; picker worker-only | ~4800 | `PROFILE_OWNED` |
| 20 | Capabilities disclosure (collapsed) | `#capabilities` `<details>` | `CapabilityProfileSection` | claims + `engagement_contexts` + skill dots | L353 / L397 **serial** | none (contents worker-shaped) | ~5600 | `PROFILE_OWNED` (collapsed on purpose) |
| 21 | Candidate skill clarify | `#candidate-skills` | `SkillClarifySection` | own read (client) | client | worker | ~5900 | `PROFILE_OWNED` |

No section is `DEAD_OR_GATED_OFF` for a worker identity. For a **pure
company/agency identity** sections 3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 21
all disappear and the page collapses to title + avatar + companies + composer —
which is a different page under the same heading, with no copy acknowledging it.

## 3. Render-cost / serial-waterfall list (ranked)

18 `await getTranslations(...)` run **serially before any data read** (L105–119),
plus a 19th inline at L592. They are request-cached and cheap individually, but
they are 19 sequential awaits ahead of the first query.

Ranked serial waterfall after the translation block:

1. `createClient()` → `auth.getUser()` (L121–124) — gates everything.
2. `Promise.all` batch #1 (L132) — the identity reads.
3. **`getOwnAvatar()` (L160) — serial, alone.**
4. **`getOwnedOrganizations()` (L165) — serial, alone.**
5. `Promise.all` batch #2 (L234) — prefs, languages, education, achievements, external profiles.
6. **Five standalone counting queries, serial (L241, L249, L255, L264)** — projects count, certificate docs count, worker projects, journal count.
7. **`getEmployerOwnerProfileId()` (L271) — serial.**
8. `profile_skill_claims` (L286) → `worker_skills` (L294) → skill links (L309) — three serial reads.
9. `engagement_contexts` (L353) → `profile_skills` (L397) → template (L416) — three more serial reads.
10. **`getOwnTrustSignals()` (L732) — awaited *inside the JSX return*,** so it cannot overlap anything.

That is **≈15 sequential stages**. Ten of the 35 awaits are single-read stages
that batch #1 or #2 could absorb without changing behaviour.

TTFB baseline any future split must beat (local dev, warm compile, median of the
captured runs): **1440 → 5655 ms, 375 → 3913 ms.** Dev-server numbers; they are
a relative baseline, not a production figure.

## 4. Defect sweep

**Overflow** — none. `document.scrollWidth === innerWidth` at both widths; the
action cluster's mobile 2-column grid works.

**Hydration** — none observed in a painting browser (the earlier apparent
failure was the non-painting pane, §0).

**Console** — one entry at both widths, in both cases
`The Content Security Policy directive 'upgrade-insecure-requests' is ignored
when delivered in a report-only policy.` That is the report-only CSP header on
an `http://` dev origin — an environment artifact, **not a product defect**.

**Duplication** — the page carries **six** components that answer "how complete
/ ready is my profile?", five of them above the fold-2 line:

| component | y | h | what it says |
|---|---|---|---|
| `ProfileStateStrip` | 276 | 64 | readiness · freshness · today's activity |
| `LiveProfileSection` | 381 | 299 | what is missing · where work happened · evidence · matching opportunities |
| `WorkerSetupJourney` | 704 | **506** | 6 setup steps with their own completion state |
| `ProfileHubOverview` | 1644 | 257 | 4 pillars + the single declared primary action |
| `CvCompletenessGrid` | 1925 | 224 | 10 filled/empty CV section cards |
| `SkillsReviewBanner` | cond. | — | unsupported declared-skill count |

Together **≈1350 px — 22 % of the desktop page and one and a half mobile
screens** — before the user reaches a single editable field. The in-file comment
at L913–919 states that the hub overview is "the SINGLE output summary" and that
the former duplicates were removed; five other summaries survived that cleanup.

Second duplication: `deriveSkillEvidence(...)` is computed **three times** in
one render (L608, L712, and inside the hub's own props) from the same inputs.

Third: `#managed-companies` restates `/dashboard/company`'s own entry list, and
the header's five action links restate destinations that also exist in the
account menu and the quick-nav.

**Accessibility** — 34 inputs carry no `aria-label`, no `aria-labelledby`, no
wrapping `<label>` and no `label[for]`. The bulk are the tri-state preference
radios (`prefs-tristate-*`, 12 groups × 3) and the licence checkboxes
(`prefs-licence-{B,BE,C,CE,D}`), which render at **30–32 px** — below the 44 px
target the rest of the codebase uses. 73 controls are under 44 px in total.

## 5. Classification summary

| label | count | sections |
|---|---|---|
| `PROFILE_OWNED` | 13 | 1, 2, 6, 7, 9, 12, 13, 14, 15, 16, 17, 19, 20, 21 |
| `DUPLICATE_OF` | 5 | 3, 4, 5, 10, 11 → all of #6 |
| `MISPLACED_HAS_HOME` | 2 | 8 → `/dashboard/company`; 18 → `/dashboard/communication` |
| `MISPLACED_NEEDS_HOME` | 0 | — |
| `DEAD_OR_GATED_OFF` | 0 | for a worker |

Product Gate A-09 stands: nothing here proposes a new route.

## 6. Proposed slices (ordered by leverage, none implemented here)

**W7-S1 — collapse the five redundant readiness summaries into `ProfileHubOverview`.**
Files: `profile/page.tsx` only (remove mounts of `ProfileStateStrip`,
`LiveProfileSection`, `WorkerSetupJourney`, `CvCompletenessGrid`,
`SkillsReviewBanner`; the hub already renders pillars + missing-list + one
action). No migration. Guard: a test asserting exactly one readiness summary
testid on the page. Proof: 1440 + 375 screenshots, page height before/after.
Rollback: revert one file. Expected: −1350 px desktop, −2 mobile screens.

**W7-S2 — label the preference and licence controls.**
Files: `worker-availability-prefs-form.tsx` (+ the licence group). Add
`aria-labelledby` pointing at the existing legend/label text; raise the 30–32 px
controls to 44 px. No migration. Guard: extend the a11y test to fail on an
unlabelled input inside the prefs fieldset. Proof: axe pass + 375 screenshot.

**W7-S3 — flatten the serial waterfall.**
Files: `profile/page.tsx` only. Move `getOwnAvatar`, `getOwnedOrganizations`,
`getEmployerOwnerProfileId`, `getOwnTrustSignals` and the five counting queries
into the two existing `Promise.all` batches; hoist `getOwnTrustSignals` out of
JSX. Behaviour-identical. Guard: a lint rule or test forbidding `await` inside
the returned JSX. Proof: TTFB median over 5 runs vs the baseline above.

**W7-S4 — move `#managed-companies` and `MessageButton` to their canonical homes.**
Pure move, no behaviour change, gated behind S1 so the page is short enough for
the removal to be legible. Proof: the destinations still list the same rows.

**W7-S5 — honest non-worker profile.**
For a pure company/agency identity the page silently loses 12 of 21 sections.
Add one line of copy naming what this surface is for that identity. Copy-only.

Sequence: **S1 → S3 → S2 → S4 → S5.** No slice mixes a move with a behaviour
change; none needs a migration.

## 7. Out of scope

W7 P1-3 (conversation memory) and P2-1 (open-ended booking overlap) are separate
slices. W8+ untouched. No migration, no owner gate, no production write, no
PROD_QA identity was used.
