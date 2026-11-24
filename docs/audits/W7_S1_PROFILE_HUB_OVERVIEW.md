# W7-S1 — PROFILE HUB OVERVIEW

Consolidates the five duplicated readiness/summary surfaces on
`/dashboard/profile` into ONE canonical `ProfileHubOverview`. Consolidation,
not feature removal — §5 maps every absorbed fact and action to its new home.

## 1. Starting state

| | |
|---|---|
| Starting `origin/main` | `cf5b2e2948ef3f392d936136e0011c8455680aa9` (verified, not assumed) |
| Worktree | `C:/Users/Mano/Documents/lm-w7-s1` — new, isolated, own `node_modules`, own dev server `:3460`, own `.env.local` → local stack `127.0.0.1:54321` |
| Branch | `feat/cc/w7-s1-profile-hub-overview-v1` |
| Local DB | 190/190 migrations, dev fixtures. **No migration is required or included by this slice.** |
| Evidence | `docs/audits/evidence/w7-s1/` — 14 screenshots + 6 measurement JSONs |
| Capture tools | `apps/web/scripts/w7-s1-capture.mjs`, `apps/web/scripts/w7-s1-interaction-proof.mjs` (both refuse any non-loopback base URL) |

Sources read and re-verified against current code before implementation:
`W7_PROFILE_FULL_INVENTORY.md`, `FULL_PRODUCT_SURFACE_INVENTORY.md`,
`PRODUCT_SIMPLICITY_SCORECARD.md`, `docs/product/CHAT_FIRST_DASHBOARD_V1.md`,
`docs/product/MAP_STRATEGIC_PRODUCT_MODEL.md`,
`docs/program/W1_W22_CURRENT_STATE_MATRIX.md`,
`docs/program/SEQUENTIAL_W_EXECUTION_TRAIN.md`.

*(Note: the brief listed `CHAT_FIRST_DASHBOARD_V1.md` and
`MAP_STRATEGIC_PRODUCT_MODEL.md` under `docs/audits/`; they live under
`docs/product/`. Same documents.)*

## 2. BEFORE measurements

Measured on this worktree, this machine, this stack — the pre-slice code
restored from `cf5b2e29` and served by the same dev server, so the comparison
is like-for-like. The partial-worker figures reproduce the §23 audit exactly
(6104 / 8823 / 19 cards / 14 `<h2>` / 34 unlabelled / 75 sub-44 px).

| scenario | 1440 height | 375 height | folds @375 | cards | sections | `<h2>` | sub-44 px | unlabelled inputs |
|---|---|---|---|---|---|---|---|---|
| A worker, partial profile | 6104 | 8823 | 10.9 | 19 | 16 | 14 | 75 / 74 | 34 |
| B worker, substantially complete | 6104 | 8752 | 10.8 | 19 | 16 | 14 | 75 / 74 | 34 |
| C company identity | 6203 | 8952 | 11.0 | 20 | 16 | 14 | 76 / 75 | 34 |

The five summary surfaces at 1440, scenario A (y / height):

| surface | y | height |
|---|---|---|
| `ProfileStateStrip` | 276 | 64 |
| `LiveProfileSection` | 381 | 299 |
| `WorkerSetupJourney` | 704 | **506** |
| `ProfileHubOverview` (old) | 1644 | 257 |
| `CvCompletenessGrid` | 1925 | 224 |
| **total** | spread over y 276→2149 | **1350** |

`SkillsReviewBanner` renders only when unsupported skills exist; it is a sixth
member of the same family and was absorbed with the rest.

## 3. The five duplicated surfaces — what the duplication actually was

- **`deriveWorkerReadiness` was rendered FOUR times** — as a state word
  (strip), a named missing list (live), five steps (journey) and four pillars
  (hub).
- **Journal counts appeared three times** — freshness + today (strip), evidence
  entries (live), journal pillar (hub).
- **`deriveSkillEvidence` was computed three times per render** from identical
  inputs (hub props, review-banner IIFE, hub-internal recomputation).
- **Two "complete your profile" CTAs** — the hub's primary action and the
  journey's step links, plus a third from the review banner.

## 4. Implementation

`ProfileHubOverview` is now the single overview, mounted **first** in the page
body (previously 4th, at y=1644; now y=259). One reading order for every
identity:

```
WHO AM I  →  STATUS  →  WHAT IS MISSING  →  WHAT TO DO NEXT
                                         →  (disclosure) WHAT IS ALREADY DONE
```

- **Who am I** — avatar + name, read-only. The avatar *editor* stays below.
- **Status** — one honest state word from the ONE readiness model, plus
  "N of 5" and the freshness line. No percentage, no rating (§19a).
- **What is missing** — the five plain-language setup steps that are not done,
  with their hints, plus any readiness signal no step covers (`journal`,
  `evidence`) using the existing action-wording copy. Required work only.
- **What to do next** — one primary action, plus the chat bridge and the
  existing secondary links.
- **What is already done** — one `<details>`: completed steps, today's
  activity, work history, the evidence line, the skill-evidence support block,
  the opportunity signal, and the CV section grid as **optional** improvement
  explicitly separated from required work.

Files changed:

| file | change |
|---|---|
| `components/app/profile-hub-overview.tsx` | rewritten as the consolidated overview |
| `app/[locale]/dashboard/profile/page.tsx` | four mounts removed; grid + evidence derived once and passed in; hub moved to the top |
| `components/app/cv-completeness-grid.tsx` | `nested` variant (no own card surface, `h3` heading) |
| `lib/player-card/today-activity.ts` | **new** — the today-count reader extracted from the strip |
| `components/app/{profile-state-strip,live-profile-section,worker-setup-journey,skills-review-banner}.tsx` | **deleted** (absorbed) |
| `messages/{lt,en,de,nl,ru}.json` | 4 new keys: `doneDisclosure`, `askWorkspace`, `state.done`, `state.todo` |
| 6 existing guards | re-pointed at the new location, intent unchanged |
| `lib/guards/w7-s1-profile-hub-consolidation.test.ts` | **new**, 34 assertions |

**No migration.** No business logic changed. No new route. No `data-testid`
that a downstream consumer depended on was dropped without a replacement.

### Chat-first relationship

The hub carries `profile-hub-ask-workspace` → `/dashboard`, the ONE
conversation. It is deliberately **not** a seeded-prompt deep link: `?result=`
is the only parameter the workspace honours, so an `?ask=`-style link would be
a control promising behaviour the product does not have. No second assistant,
no parallel workflow. Pinned by the guard.

## 5. OLD → NEW capability map

Nothing may silently disappear. Every row is asserted by
`w7-s1-profile-hub-consolidation.test.ts`.

### `ProfileStateStrip` (deleted)

| information | new location | action preserved | data source |
|---|---|---|---|
| readiness state word | hub status line (`profile-hub-status`) | tile → steps became the missing list itself | `deriveWorkerReadiness` |
| freshness (newest entry date) | hub status line (`profile-hub-freshness`) | — | `card.latestEvidenceAt` |
| today's activity count | disclosure (`profile-hub-activity`) | — | `countTodayJournalEntries()` (extracted reader) |

### `LiveProfileSection` (deleted)

| information | new location | action preserved | data source |
|---|---|---|---|
| named missing list | hub "what is missing" | each item links to its editor (it did not before) | `missingReadinessPillars` |
| work history | disclosure (`live-profile-history`) | — | `card.workHistory` |
| current-engagement count | disclosure | — | `countCurrentEngagements` |
| evidence line (3 populations) | disclosure (`live-profile-evidence`) | — | canonical card |
| opportunity signal + closest §19 basis + matched skills | disclosure (`live-profile-opportunity`) | — | `getProfileOpportunitySignal` |

### `WorkerSetupJourney` (deleted)

| information | new location | action preserved | data source |
|---|---|---|---|
| 5 named steps + hints | hub missing list (undone) / disclosure (done) | all 5 links, same destinations | `deriveWorkerReadiness` + card |
| "N of 5" progress | hub status line | — | same |
| `#setup-journey` anchor | **inherited by the hub** | `completeOnboarding` deep link still lands correctly | — |

### `CvCompletenessGrid` (moved, not deleted)

| information | new location | action preserved | data source |
|---|---|---|---|
| 10 CV sections, real filled/empty | inside the hub disclosure, `nested` | all 10 editor links | computed on the page from data already read |

### `SkillsReviewBanner` (deleted)

| information | new location | action preserved | data source |
|---|---|---|---|
| unsupported-skill count | hub review note (`profile-hub-review-note`) | CTA → `#profile-edit`, same `skills.reviewBanner` copy | `deriveSkillEvidence` |

### Old `ProfileHubOverview` surface

| information | new location |
|---|---|
| 4 pillars (cv/skills/journal/availability) | superseded by the readiness list; availability is a named step, journal a stepless pillar, CV/skills the minimum-contract essentials |
| minimum-contract `missing` essentials | `data-card-missing` on the missing list |
| skill-evidence support block | disclosure (`profile-hub-skill-evidence`) |
| not-verified disclaimer, primary action, journal / CV-import / opportunities links | unchanged |

**Not moved, and why:** the avatar *editor* (`#profile-identity`), managed
companies (`#managed-companies`), trust block, and every detailed editor stay
where they are. They are editors, not summaries; W7-S4 proposes the two
misplaced ones move to their canonical homes as a separate slice.

## 6. AFTER measurements

| scenario | 1440 | Δ | 375 | Δ | folds @375 | cards | `<h2>` | sub-44 px |
|---|---|---|---|---|---|---|---|---|
| A worker, partial | 6104 → **5273** | **−831 (−13.6 %)** | 8823 → **7486** | **−1337 (−15.2 %)** | 10.9 → **9.2** | 19 → **16** | 14 → **12** | 75 → **71** |
| B worker, complete | 6104 → **4943** | **−1161 (−19.0 %)** | 8752 → **7078** | **−1674 (−19.1 %)** | 10.8 → **8.7** | 19 → **16** | 14 → **12** | 75 → **71** |
| C company identity | 6203 → **5460** | **−743 (−12.0 %)** | 8952 → **7673** | **−1279 (−14.3 %)** | 11.0 → **9.4** | 20 → **17** | 14 → **12** | 76 → **72** |

Against the ~1350 px / ~2 mobile screens target: **mobile exceeds it in every
scenario (−1279 to −1674 px, ≈1.6–2.1 screens); desktop reaches −831 to
−1161 px.** The desktop shortfall is deliberate — the consolidated hub is
itself 648 px because it now carries identity, status, the missing list with
hints, the action row and the disclosure summary. Forcing the last ~200 px
would have meant dropping the step hints, which are the plain-language
explanation of what each missing item means. Function was kept over the round
number, as the brief allows.

Position, scenario A @1440: hub **y=259 h=648** (was y=1644 h=257 as the 4th
block). Missing list y=378, primary action y=780 — **status, what is missing
and the next action are all inside the first 900 px fold.**

### A measurement caveat, stated so it is not mistaken for a defect

Chrome returns a **stale non-zero `getBoundingClientRect()`** for content
inside a collapsed `<details>` (`content-visibility: hidden`). The raw JSON
therefore shows `cvGrid: {h: 167.5}` even when collapsed. `docHeight` (5273)
and the hub's own height (647.5) correctly exclude it, and the interaction
proof confirms the content is not visible until the disclosure is opened.

## 7. Accessibility changes

Introduced by this slice:

- every step/pillar row is a real focusable link with `min-h-11` (44 px floor);
- every action link raised to `min-h-11` (they were 32 px);
- status is **never colour-only** — each row pairs its icon with an `sr-only`
  state word (`state.done` / `state.todo`), in all five shipped locales;
- the disclosure `<summary>` is keyboard-reachable by Tab, toggles on Enter,
  and shows a `:focus-visible` ring — proven with real key presses, not
  programmatic focus;
- semantic headings: the hub is an `<h2>` with `<h3>` subsections; the page
  still has exactly one `<h1>`;
- sub-44 px targets **75 → 71** (1440) and **74 → 70** (375).

Deliberately **not** attempted, per the brief: the 34 unlabelled inputs are
unchanged. They are the tri-state preference radios and licence checkboxes in
`worker-availability-prefs-form.tsx`, untouched by this slice. Recorded as
W7-S2.

## 8. Performance changes

**Structural (deterministic):**

| | BEFORE | AFTER |
|---|---|---|
| files in the profile render path | 6 | 3 |
| `await` expressions across them | **51** | **46** |
| `deriveWorkerReadiness` calls per render | 4 | **1** |
| `getWorkerPlayerCard()` call sites | 3 | **1** |
| `deriveSkillEvidence` calls per render | 3 | **1** |
| the three absorbed data reads | spread across 3 sibling components | **ONE `Promise.all`** |

The `Promise.all` is not cosmetic. Absorbing three siblings into one component
initially **serialised** reads React could previously start together; the first
AFTER capture measured that as a regression, and the batch was introduced in
response. A guard now pins it.

**TTFB: inconclusive, and reported as such.** Dev-server medians ranged
2663–4239 ms AFTER and 2673–3186 ms BEFORE, but repeated runs of *identical*
code varied 3129→7171 ms. The measurement noise exceeds any difference between
the two versions, so no TTFB claim is made in either direction. Raw runs are in
the evidence JSONs.

## 9. Browser evidence

Local Chromium, this worktree's own dev server on `:3460`, `caret: "initial"`.

Interaction proof — **21/21 checks pass at 1440 AND 375**, in both the
partial-profile and fully-ready states:

- exactly one `ProfileHubOverview`; all four absorbed testids absent;
- reading order status → missing → next action → done (the ready state
  correctly renders "nothing missing" in the same slot);
- absorbed detail hidden while collapsed, and today's activity, work history,
  the opportunity signal and the CV grid all revealed on opening;
- all six editor anchors still on the page;
- an absorbed destination really navigates (`/dashboard/opportunities`);
- the disclosure is Tab-reachable, Enter-togglable, with a visible focus ring;
- every step row is a real focusable link;
- **no horizontal overflow, zero product console errors, zero hydration
  warnings** at both widths;
- layout jump of the primary action after interactivity: **0 px**.

Screenshots: `before|after-{worker-partial,worker-complete,company-org}-{1440,375}.png`
and `after-disclosure-open-{1440,375}.png`.

## 10. Simplicity score — PROFILE row, same seven dimensions

Scored with the identical rubric and scale as `PRODUCT_SIMPLICITY_SCORECARD.md`;
the methodology was not changed.

| dimension | BEFORE | AFTER | why |
|---|---|---|---|
| immediate clarity | 1 | **2** | one overview answering who/status/missing/next, first block, inside the fold — instead of four competing summaries starting at y=276 |
| navigation | 2 | 2 | unchanged; the page-level IA is W7-S4 |
| action clarity | 1 | **2** | one primary action instead of three "complete your profile" CTAs; every missing item is now itself a link to its editor |
| visual hierarchy | 0 | **2** | 1350 px of competing summary → one 648 px block; 19→16 cards, 14→12 `<h2>` |
| AI discoverability | 1 | **2** | an explicit bridge into the conversation exists on the profile for the first time |
| mobile | 0 | **1** | 10.9 → 9.2 folds (8.7 when complete). Better, still long — the page is 9 screens |
| error recovery | 2 | 2 | unchanged |
| **average** | **1.0** | **1.86** | **PILOT_BLOCKER → NEEDS_POLISH** |

Honest limit: **PROFILE does not reach PASS.** At 9.2 mobile folds and 34
unlabelled inputs it is a materially better screen, not a finished one.

## 11. Remaining W7 debt

| id | debt | evidence |
|---|---|---|
| W7-S2 | 34 unlabelled inputs, 70 sub-44 px targets — nearly all in `worker-availability-prefs-form.tsx` (12 tri-state groups × 3 + 5 licence checkboxes at 30–32 px) | measured |
| W7-S3 | ≈15 serial await stages on the page itself: `getOwnAvatar`, `getOwnedOrganizations`, `getEmployerOwnerProfileId`, `getOwnTrustSignals` (awaited inside JSX) and five counting queries are still standalone stages | `W7_PROFILE_FULL_INVENTORY.md` §3 |
| W7-S4 | `#managed-companies` and `MessageButton` still misplaced (canonical homes: `/dashboard/company`, `/dashboard/communication`) | inventory §5 |
| W7-S5 | a pure company/agency identity silently loses 12 of 21 sections with no copy acknowledging it | inventory §2 |
| W7 P1-3 | conversation memory — SQL still in `docs/proposals/`, never a migration | matrix |
| W7 P2-1 | open-ended bookings skip the overlap guard | matrix |
| minor | `profileHub.pillars.*` and the old `evidence.intro/supported` keys remain in 5 locale files; `evidence.*` is still rendered, `pillars.*` is now unused copy | this slice |

## 12. Proposed W7-S2…S5 ordering

**W7-S3 → W7-S2 → W7-S4 → W7-S5.**

S3 first: it is behaviour-identical, needs no browser judgement, and the
page is now short enough that its waterfall is the dominant remaining cost.
S2 second: the a11y debt is concentrated in one component, so it is one file
and a guard. S4 third: the moves are only legible once the page is short. S5
last: copy-only, and it depends on what S4 leaves behind.

## 13. Verdict

**`W7_S1_PROFILE_HUB_OVERVIEW_DELIVERED_MEASURED_NOT_YET_PASS`**

Five duplicated surfaces consolidated into one, with a documented old→new map
and a 34-assertion guard proving no capability was lost. Page height down
12–19 % desktop and 14–19 % mobile; cards 19→16; `<h2>` 14→12; four fewer
sub-44 px targets; the overview moved from the 4th block to the 1st, with
status, missing and next action all inside the first fold. Typecheck clean,
856 test files / 13921 tests pass, 21/21 browser checks at both breakpoints,
zero console errors, zero hydration warnings, no overflow, no layout jump.

**W7 is NOT done.** Six items remain in §11.
