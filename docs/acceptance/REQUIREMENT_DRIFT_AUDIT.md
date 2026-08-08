# Requirement drift audit — real-user acceptance round

**Date:** 2026-08-08
**Baseline:** `main` = `d941dbe58394a402d7e17d2eb238af235d3c7402`
**Method:** local acceptance stack only (`pnpm -C apps/web dev:acceptance`, local
Supabase). Every "VERIFIED" row below was reproduced in a real browser at
375×812 in Lithuanian, as a freshly self-registered user — not inferred from
source.

> **Standing rule for this document.** A capability is not "working" because a
> component, an i18n key, or a passing test exists for it. It is working when a
> user who does not read this repository can find it and finish it. Several
> rows below exist precisely because the code was present and green the whole
> time.

---

## Status vocabulary

`VERIFIED_WORKING` · `WORKING_BUT_HARD_TO_DISCOVER` · `PARTIAL` ·
`IMPLEMENTED_BUT_UNREACHABLE` · `REGRESSED` · `REMOVED_INTENTIONALLY` ·
`REMOVED_ACCIDENTALLY` · `NOT_IMPLEMENTED` · `SUPERSEDED` ·
`CONFIGURATION_GATED` · `OWNER_GATED` · `NOT_ENOUGH_EVIDENCE`

---

## D-01 — Work Journal could not be filled at all

| | |
|---|---|
| **Requirement** | A worker records work in the Work Journal |
| **Original evidence** | Owner audit §6.1 chat-first intake; `journal_text_first` is a primary nav feature |
| **Current evidence** | `/dashboard/journal` renders **no composer** (`JournalEntryComposer` is edit-mode only, by design); its two "create" CTAs pointed at `/dashboard`; the chat answered every journal request with one clarify sentence |
| **Status** | **REGRESSED** → fixed |
| **Root cause** | `extractWorkLog` reports `hasSignal:false` for any sentence with no date and no hours — which is true of *every request*. `startWorkLog` therefore returned the clarify question and never opened the flow. Chat is the journal's only intake, so the journal was unreachable. |
| **User impact** | P0. The tester's words: *"darbų žurnalo negaliu pildyti paspaudus pildyti išmeta į pirmą puslapį."* |
| **Action** | PR #1081 — `explicit` escape hatch (same one `photoFirst` uses); `?intent=log-work` hand-off |
| **Verification** | VERIFIED. Request → date/site/description/save; entry persists across reload; row in `journal_entries` with engagement context. 4 e2e cases; negative control red. |

## D-02 — The journal was reachable in Lithuanian only

| | |
|---|---|
| **Requirement** | The product ships 11 locales |
| **Current evidence** | The `log-work` intent matcher knew only the LT stem `žurnal`. `"fill in my work journal"` and `"запиши работу в журнал"` scored 0 and fell to the unknown fallback. |
| **Status** | **PARTIAL** → fixed |
| **User impact** | P1 — non-LT users could not reach the journal through its only intake |
| **Action** | PR #1081 — `journal / журнал / tagebuch / dagboek` added |
| **Verification** | VERIFIED by unit tests over the router + predicate |

## D-03 — Draft workforce request silently discarded the worker count

| | |
|---|---|
| **Requirement** | An employer states how many workers they need |
| **Current evidence** | Draft payload persisted as `{title, timing, location, capabilities}` — no `teamSize`, while the UI said "Išsaugota." |
| **Status** | **REGRESSED** → fixed |
| **Root cause** | Two independent drops on the **draft leg only**: the executor never forwarded `teamSize`, and `ALLOWED_KEYS.company_request` had no such key (and `sanitize` is string-only). The submit leg always persisted it — so survival depended on a checkbox. |
| **User impact** | P0 — false successful save. Tester: *"Neišsaugo."* |
| **Action** | PR #1081 (2nd commit) |
| **Verification** | VERIFIED — payload now `{… "teamSize":"4" …}`. Negative control red. |

## D-04 — In-app problem reporting: present, invisible, and refused

| | |
|---|---|
| **Requirement** | A tester reports a problem from the screen where it happens |
| **Original evidence** | `LanguageFeedbackWidget` + `submitLanguageFeedback` + `public.language_feedback` + admin inbox `/dashboard/admin/language-feedback` — a complete, canonical implementation |
| **Current evidence** | (a) trigger reduced by **IA cleanup v2 (#11)** to a 36px, `opacity-60`, icon-only `✎` whose label lives in `title`/`aria-label` — both **hover-only**, which a phone has not; (b) the write used `.insert().select("id").single()` |
| **Status** | **WORKING_BUT_HARD_TO_DISCOVER** + **IMPLEMENTED_BUT_UNREACHABLE** → fixed |
| **Root cause (b)** | `RETURNING` is evaluated under the SELECT policy, which is `is_admin()`. For every ordinary user Postgres refused the statement and rolled the insert back. **Reporting worked for administrators and nobody else**; the table was empty. Proven at the database: the same INSERT succeeds without `RETURNING`, fails with it. |
| **User impact** | P1 discoverability, **P0 for the testing programme** — the feedback channel did not exist in practice |
| **Action** | PR #1081 (3rd commit) |
| **Verification** | VERIFIED — row persisted (`route=/dashboard/journal, locale=lt, status=open`), tester stays in place. 4 e2e cases; negative control red. |
| **Not done** | Categories, device/viewport metadata, screenshots — **OWNER_GATED**, see `docs/acceptance/FEEDBACK_CATEGORIES_MIGRATION_PROPOSAL.md` |

## D-05 — Guards that certified the defects

| | |
|---|---|
| **Finding** | Three guards passed continuously while the behaviour they name was broken |
| **Evidence** | `mobile-layout.test.ts` asserted `h-9 w-9` + `opacity-60` — it **pinned** the undiscoverable trigger as correct. `empty-state-affordance` and `launch-readiness-self-test` asserted the journal CTA's **verbatim source line**, so they broke on an improvement while saying nothing about whether the CTA worked. `company-executors.test.ts` used `expect.objectContaining`, which cannot fail on a *missing* field, so the dropped `teamSize` passed. |
| **Status** | **REGRESSED (test quality)** → all four rewritten to assert behaviour/destination |
| **User impact** | P1 — this is the mechanism by which the product loses capabilities while CI stays green |

## D-06 — Dead i18n keys with no consumer

| | |
|---|---|
| **Evidence** | `todayScreen.*` ("Pildyti dienos žurnalą") and `processAssistant.actions.addJournal` ("Pildyti darbo žurnalą") are referenced **only** by guard tests — no component renders them. `product-readiness.test.ts` asserts the string `"addJournalCta":` exists in the message file. |
| **Status** | **NOT_ENOUGH_EVIDENCE** whether these were ever shipped or only ever specified |
| **User impact** | P2 — no user-visible loss today, but a guard asserting a key nothing renders is the D-05 pattern again |
| **Recommended action** | Decide per key: render it or delete it with its guard |

## D-07 — Notification control below the touch minimum, everywhere

| | |
|---|---|
| **Evidence** | Hit-tested at 320/360/375/390/412 across `/dashboard`, `/journal`, `/planning`, `/communication`: **"Mano pranešimai" is 36×36 on every route at every width** |
| **Status** | **PARTIAL** (works, but under the 44px accessibility floor) |
| **User impact** | P2 |
| **Recommended action** | Own slice with the other header controls |

## D-08 — Calendar toolbar is a 36px row of 20 controls

| | |
|---|---|
| **Evidence** | `/dashboard/planning` at every tested width: `DIENA / SAVAITĖ / MĖNUO / METAI / ŠIANDIEN / EITI / VISI / REZERVACIJA / PROJEKTAS / UŽDUOTIS / ŽURNALAS / FINANSAI / KVIETIMAS / ATOSTOGOS / ETAPAI` + prev/next — all 36px tall |
| **Status** | **PARTIAL** |
| **User impact** | P2, rising to P1 for the calendar work the tester asked for — this is the surface they want to use for planning |
| **Recommended action** | Fold into the Work Journal ↔ calendar slice |

## D-09 — Social authentication

| Provider | Code | External config | Status |
|---|---|---|---|
| **Email + password** | Full (`signUp`, `signInWithPassword`, reset) | n/a | **VERIFIED_WORKING** — used throughout this session |
| **Google** | Full — `signInWithOAuth({provider:"google"})`, **same-tab redirect** (`skipBrowserRedirect` left false, no popup), PKCE, `/[locale]/auth/callback`, trace ids, local-state eviction before a fresh PKCE verifier | Requires the Google provider enabled in the Supabase project + authorised redirect URLs | **CONFIGURATION_GATED** — not exercisable on the local stack; the previously rejected popup UX has **not** regressed |
| **LinkedIn** | **None for auth.** `linkedin` exists only as a CV-source slug (`lib/cv/types.ts`) and an external-profile link type (`lib/worker/external-profiles-model.ts`) | — | **NOT_IMPLEMENTED** |
| **Facebook** | **None for auth.** Appears only as in-app-browser detection for geolocation (`lib/browser/geo-capability.ts`) | — | **NOT_IMPLEMENTED** |
| **Instagram / Meta** | Same as Facebook — detection only | — | **NOT_IMPLEMENTED**, and not recommended: Instagram is not a work-identity signal for this product |

**No dead buttons.** The auth screens offer exactly Google + email/password, both
of which are real. Nothing advertises a provider that does not work.

**Account collision:** NOT VERIFIED. Cannot be exercised without a configured
Google project. The email/password + same-email-Google case must be tested
before any provider is added — do not assume matching email is sufficient to
merge identities.

## D-10 — Feedback is unavailable on public and auth surfaces

| | |
|---|---|
| **Evidence** | `LanguageFeedbackWidget` is mounted in `app/[locale]/dashboard/layout.tsx` only, and returns `null` on `/dashboard/market-map` |
| **Status** | **PARTIAL** (deliberate: "no public landing/login exposure") |
| **User impact** | P2 — a tester who hits a problem during **signup or login** has no way to report it, which is exactly where a first-time tester struggles |
| **Recommended action** | Owner decision: the RLS INSERT policy already allows `user_id IS NULL`, so anonymous reporting is possible without a schema change |

## D-11 — Journal entries were dated the day they were TYPED

| | |
|---|---|
| **Requirement** | The tester's most-wanted improvement: a calendar showing which days are filled |
| **Current evidence** | The journal **already projects** into `/dashboard/planning` as a `ŽURNALAS` source. But `startDate: toIsoDay(e.created_at)` used the row's write time, while the save action had been storing the worker's own `work_date` metric all along (`source=worker_input`) — nothing read it. |
| **Status** | **REGRESSED** → fixed |
| **User impact** | P1 — "įrašyk vakarykštį darbą į žurnalą" is a first-class journal phrase, and it silently produced a mis-dated record. A worker checking which days they had filled was reading the days they happened to be typing. |
| **Action** | PR #1081 — pure `journalStartDay(workDate, createdAt)` |
| **Verification** | VERIFIED. Two entries logged today for 2026-08-07 rendered on 08-08 before; after, they leave the forward window and the surface's own counter reads *"Pasibaigę įrašai čia nerodomi: 2"*. 6 unit cases. |

## D-12 — Journal hours and site name could never load

| | |
|---|---|
| **Current evidence** | The follow-up read selected and filtered `journal_entry_metrics.journal_entry_id`. **That column does not exist** — it is `entry_id`. The request errored on every call; the "degrades to null meta" branch swallowed it. |
| **Status** | **REGRESSED** → fixed |
| **User impact** | P2 — the real hours and site name the block exists to show were never rendered, and never would be |
| **Why it survived** | An honest-degradation path hides a typo *forever*: the failure mode is indistinguishable from "this entry has no metrics". Degradation must be honest about *why* it degraded, or it becomes camouflage. |
| **Verification** | VERIFIED — column name corrected; entry site `Peleniškiai objektas` is a real stored metric that was not reaching the surface |

## D-13 — The canonical calendar is forward-only

| | |
|---|---|
| **Evidence** | `/dashboard/planning` defaults to `ARTIMIAUSIOS 7 DIENOS` and states *"Pasibaigę įrašai čia nerodomi: N"* |
| **Status** | **PARTIAL** — honest, but it does not answer the tester's actual question |
| **User impact** | P1 for the calendar requirement: *"which days have I filled?"* is a question about the PAST, and the default view excludes the past by design |
| **Recommended action** | The next calendar slice. `DIENA / SAVAITĖ / MĖNUO / METAI` view modes already exist — establish which of them show past days before building anything new. **Do not build a second calendar.** |

---

## Not reproduced

Recorded so they are not silently dropped, and so a future session does not
re-hunt them without new evidence.

### Tester issue C — employer form reached from the worker/personal side

**NOT REPRODUCED.** Tested as a fresh account holding **both** identities:

- personal workspace: worker chips only; typing *"Reikia darbuotojų"* returned
  the honest fallback, **no employer form**;
- organisation workspace: employer actions present and correct;
- switching back to personal: **no stale employer actions**.

The gate (`identity === "company"`, from `active_role`) held in every path
tested. Two adjacent facts are worth recording:

1. The chat gates on **`active_role`** while the header chip shows the **active
   workspace**. These are different sources of truth; they agreed in testing,
   but nothing structurally forces them to.
2. `resolveActiveWorkspaceId` treats an explicit choice of the personal
   workspace as `storedId = null`, and then returns the organisation anyway
   when `identity === "company"` and the user has exactly one org. A
   company-identity user with one organisation therefore **cannot rest in the
   personal workspace**. Not the tester's report, but a real asymmetry.

Most likely explanation for the tester's experience: they were in the
organisation workspace while thinking of themselves as a worker. The workspace
chip is the only indicator, and it is small.

### Tester issue E — mobile header collision

**NOT REPRODUCED as a collision.** Real hit-testing (`elementFromPoint` at each
control's centre) across 5 widths × 4 routes found:

- **zero covered header controls** at any width;
- **no horizontal overflow** at 320/360/375/390/412 (`scrollWidth === clientWidth`);
- the only genuinely undersized header control is **"Mano pranešimai" (36×36)** — D-07.

What the tester experienced as overlap is more likely the undersized
notification target next to neighbouring controls. The floating feedback pill
does overlay page content (measured, D-04) — but it sits bottom-right, not in
the header.

---

## Summary

| Status | Count |
|---|---|
| VERIFIED_WORKING | 1 (email/password auth) |
| WORKING_BUT_HARD_TO_DISCOVER | 1 (D-04, fixed) |
| PARTIAL | 5 (D-02 fixed, D-07, D-08, D-10, D-13) |
| IMPLEMENTED_BUT_UNREACHABLE | 1 (D-04b, fixed) |
| REGRESSED | 5 (D-01, D-03, D-05, D-11, D-12 — all fixed) |
| NOT_IMPLEMENTED | 3 (LinkedIn, Facebook, Instagram auth) |
| CONFIGURATION_GATED | 1 (Google) |
| OWNER_GATED | 1 (feedback categories migration) |
| NOT_ENOUGH_EVIDENCE | 1 (D-06) |

**This is not a complete audit of the ~54 capability areas requested.** It
covers what was reached while reproducing and repairing the tester's P0s. The
areas not yet examined are listed in the final report as explicitly unaudited —
absence from this document is not evidence of health.

---

# Session 2 — acceptance gate 1 (2026-08-08)

**Branch:** `feat/cc/real-user-acceptance-recovery` · **Baseline:** `main` = `d941dbe5`
**Method:** local acceptance stack (`pnpm -C apps/web dev:acceptance`) plus real-browser
Playwright against the local stack (`pnpm -C apps/web e2e:local`). Rows marked
VERIFIED below were driven in a real browser in this session; rows marked
INFERRED rest on repo evidence and prior audits and say so.

## D-14 — The calendar could not show which past days were filled

| | |
|---|---|
| **Requirement** | A worker can see which days they worked, which have a journal entry, which relevant past days are unfilled, and what they recorded on a chosen day |
| **Current evidence** | `readJournalItems` bounded its query on `created_at` while the projection places entries on `work_date` (changed in `b48ffd98`, this PR) |
| **Status** | **REGRESSED** → fixed |
| **Root cause** | The two columns disagree by design — logging Monday's shift on Friday is ordinary, and back-filling last month is what the journal invites. An entry worked in June and typed in August was never READ while viewing June, so the day rendered empty and "which days did I fill?" answered "none". Nothing errored: the row was simply not in the result set. |
| **User impact** | **P1.** The tester's primary calendar request, unanswerable for any entry not typed on the day it happened. |
| **Action** | `8002b764` — two bounded RLS-scoped reads (work_date-in-range ∪ created_at-in-range) merged by id; a failed work_date lookup is a real error, not a silent fallback |
| **Verification** | **VERIFIED.** Entry logged for 2026-06-15 with today at 2026-08-08 — two months back, so today falls outside the month grid entirely and the row can only appear if the read asks about the day worked. Found on the calendar, opened with real text and site, survived reload. **Negative control: disabling only the work_date lookup turns the case red** while the row is provably present in `journal_entries`. |

## D-15 — The journal and the calendar disagreed about which day an entry belonged to

| | |
|---|---|
| **Requirement** | One record has one day |
| **Current evidence** | `journal/page.tsx` grouped by `utcDayKey(created_at)`; the calendar had moved to `work_date` |
| **Status** | **REGRESSED** (introduced by `b48ffd98` in this PR) → fixed |
| **Root cause** | The diary's day chips, its `?date=` filter and its own "open in calendar" link were all built from `created_at`. The calendar had just moved the entry to `work_date`, so the link landed the worker on an empty day view. Yesterday's shift logged tonight is the ordinary case, so this was the normal path, not an edge. |
| **User impact** | **P1.** A dead-end link out of the journal, and two surfaces stating different days for the same record. |
| **Action** | `8002b764` — `journalStartDay` is the single day-resolution rule for both surfaces; the diary re-sorts by resolved day before grouping and keys groups by ISO day rather than by the formatted label |
| **Verification** | **VERIFIED** in the same browser journey — `/dashboard/journal?date=2026-06-15` shows the entry and its day chip. |

## D-16 — A count cannot answer "which days are filled?"

| | |
|---|---|
| **Requirement** | Visual identification of filled vs unfilled days |
| **Current evidence** | Month cells rendered only a total item count |
| **Status** | **NOT_IMPLEMENTED** → implemented |
| **Root cause** | A day holding one booking and a day holding one journal entry both rendered "1". |
| **User impact** | P1 — the question was not answerable even when the data was correct. |
| **Action** | `8002b764` — `hasJournal` and `isUnfilled` on `CalendarDayCell` with a legend; `indicatesExpectedWork` restricts "unfilled" to days a real record proves were working days (own accepted incoming booking, or a personally assigned project). Never claimed for today or the future. |
| **Verification** | **VERIFIED** in-browser (seeded 2026-06-03 renders "Žurnalas užpildytas"); 17 unit cases pin the marks and how narrow "unfilled" may be. |

## D-17 — The whole calendar toolbar was under the touch minimum

| | |
|---|---|
| **Requirement** | Important interactive mobile controls meet the project's 44px floor |
| **Current evidence** | One shared `CHIP_BASE` at `min-h-9` (36px) covering five view chips, prev/today/next, eight source filters and the date-picker submit; the native date input likewise |
| **Status** | **REGRESSED** → fixed |
| **User impact** | P1 — 8px under the floor on the one surface built entirely out of small tap targets, in the row a thumb reaches first. |
| **Action** | `8002b764` — `min-h-[2.75rem]`, the value the rest of the product uses |
| **Verification** | **VERIFIED by hit-testing in a real browser** at 320 / 360 / 375 / 390 / 412, asserting measured `boundingBox().height ≥ 44` for every toolbar control, plus zero horizontal overflow at each width. Not screenshot-only. |

## D-18 — The feedback control could be findable or non-obstructing, never both

| | |
|---|---|
| **Requirement** | (A) a normal user finds problem reporting in ≲10s; (B) it does not obscure content or intercept unrelated taps |
| **Current evidence** | A fixed-position pill. `0beb7c34` (this PR) made it discoverable and MEASURED that it then covered three calendar cells at 412px |
| **Status** | **PARTIAL** → fixed |
| **Root cause** | A floating trigger always overlays something, and the repo carried three separate workarounds for that one cause: `--feedback-fab-bottom` existed because the button sat on the chat composer's send control and ate the tap; the widget returned `null` on `/dashboard/market-map` because it obstructed the map; shrinking it to a 36px icon to cover less had already made it invisible on a phone. |
| **User impact** | P1 both ways — an unfindable reporter has no value, and a reporter that covers the calendar breaks the surface it sits on. |
| **Action** | `8002b764` — the trigger became an **account-menu item**: one predictable place, in the header on every dashboard route at every width, already a 44px target, obstructing nothing. All three workarounds deleted with it. Reporting now works on the map surface, where it never did. Route, locale, status, persistence and same-route return unchanged. **No migration** — categories/device metadata remain owner-gated, exactly as recorded in `FEEDBACK_CATEGORIES_MIGRATION_PROPOSAL.md`. |
| **Verification** | **VERIFIED.** 5 e2e cases: the item is labelled, ≥44px and owns its centre point; a non-admin's report is accepted; the tester keeps their route; an unsendable report cannot claim success; and **every month cell owns its own centre at 412px** (each scrolled into view first — `elementFromPoint` is viewport-relative, and the first version of that test wrongly reported every below-the-fold cell as obstructed). |

## D-19 — Account-menu items were 36px

| | |
|---|---|
| **Requirement** | The 44px floor |
| **Status** | **REGRESSED** → fixed |
| **Root cause** | `px-2 py-2 text-sm` rows measured 36px. Found by the test written for D-18 — the assertion was authored expecting a pass and failed, which is why it existed. |
| **User impact** | P2 → P1 once the menu became the reporting flow's only entry point. |
| **Action** | `8002b764` — `min-h-[2.75rem]` on all six menu items |
| **Verification** | **VERIFIED** by measured bounding box in a real browser at 375. |

## D-20 — An explicit "personal workspace" choice is discarded for a single-org company identity

**NOT FIXED — recorded as P1 for the next identity/context slice, per instruction.**

| | |
|---|---|
| **Requirement** | Choosing a workspace means the product uses that workspace |
| **Status** | **PARTIAL** (unfixed) |
| **Mechanism (located exactly)** | `active-organization.ts` builds the pointer as `sessionPointer === PERSONAL_WORKSPACE_ID ? null : (sessionPointer ?? dbPointer)` — an **explicit** personal choice is flattened to `null` one line before resolution. `resolveActiveWorkspaceId` then treats `null` as "never chose", and its documented single-org rule (`identity === "company" && organizationIds.length === 1 → that org`) overrides it. Separately, `clearActiveOrganization` **deletes** the session cookie rather than setting it to `personal`, so the explicit choice is not even expressed. |
| **User impact** | **P1, and broad.** Company identity with exactly one organization is the ordinary employer account. For them, selecting the personal space is silently undone on the next page load — so an employer cannot stay in their personal worker space (e.g. to fill their own Work Journal). Existing tests encode the single-org default as *correct* (`workspace-context.test.ts:44`), so nothing goes red: the drift is that "explicitly personal" and "no choice" are the same stored state. |
| **Related drift** | The header displays the active **workspace** while the chat gates on `active_role`; these are different axes and can disagree. Also found: **`profiles.active_organization_id` does not exist in the database** — its migration `20260714210000` is owner-gated and unapplied — so the durable pointer is feature-detected away and the choice is cookie-only today. |
| **Proposed minimal fix (no migration, no identity-model change)** | Two small changes: (1) `clearActiveOrganization` sets the session cookie to `PERSONAL_WORKSPACE_ID` instead of deleting it; (2) resolution short-circuits on that explicit value before calling `resolveActiveWorkspaceId`, leaving the pure resolver's contract untouched. |
| **Why it is NOT in this PR** | It carries one product decision that is the owner's, not a bug fix: whether "personal" is a **durable** choice (needs the gated column) or a **session** choice (cookie only, lost on a new device). Shipping the cookie-only version silently answers that question. |
| **Evidence level** | Mechanism VERIFIED by reading the resolution path and the write path, and by confirming the column's absence against the live local database. The end-to-end browser reproduction was **NOT** run — recorded as INFERRED, not claimed as observed. |

---

# Social authentication — code/config audit

**No provider was activated, enabled or configured by this session.**

| Provider | Status | Evidence |
|---|---|---|
| **Email + password** | `VERIFIED_WORKING` | `/lt/auth/login` renders email/password/submit; used as the authentication path for **every** browser journey in this session (12 e2e cases logged in this way against the local stack). |
| **Google** | `CONFIGURATION_GATED` | Implemented and reachable: `components/app/google-button.tsx` calls `supabase.auth.signInWithOAuth({provider:"google"})` with a PKCE callback on our own host, preceded by `signOut({scope:"local"})`; the button **renders on the login page** (observed). `/api/auth/google` is recorded `VERIFIED` by the functional-reality matrix, and three guards pin the flow (`google-same-tab-redirect`, `auth-stability-pkce-logout`, `oauth-trace-and-safe-diagnostics`). It is **not claimed working**: completing it needs Google client credentials configured on the Supabase project, which this session neither has nor set, and no OAuth round trip was performed. A runbook exists (`docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md`). |
| **LinkedIn** | `NOT_IMPLEMENTED` | Repo-wide search for `linkedin` in app source returns only `lib/cv/types.ts` (a CV **import source slug**, unrelated to auth). No `signInWithOAuth` call, no button, no callback, no config entry. |
| **Facebook** | `NOT_IMPLEMENTED` | The only `facebook` hits are `lib/browser/geo-capability.ts`, which **detects the Facebook in-app browser** to explain geolocation failures. Not an auth path. |
| **Meta / Instagram** | `NOT_APPROPRIATE` | Same as Facebook — `instagram` appears only as in-app-browser detection. Meta does not offer a general-purpose consumer identity provider distinct from Facebook Login, so there is no separate "Instagram sign-in" to implement; treating it as a pending item would be inventing a requirement. |

**Method note.** No provider is called working because code exists. Google is
`CONFIGURATION_GATED` specifically because the code is complete and reachable
while the credential half is outside the repo and unverified here.

---

# Full product-area drift sweep

The agreed list was estimated at ~54 areas; the canonical enumeration in
`docs/audits/labourmarketai-functional-reality-matrix-v1.md` is **87**, and that
larger list is used here rather than a subset.

**Evidence level for this section is INFERRED unless a D-row above covers the
area.** The statuses are re-expressed from that matrix's five-axis evidence
(UI reachability · write path · prod DB object · real prod rows · tests), which
was collected read-only against production on 2026-07-22, plus the W-programme
state as of 2026-08-08. This session did **not** re-drive 87 areas in a browser,
and does not claim to have.

## Counts

| Status | Count |
|---|---|
| `VERIFIED_WORKING` | 40 |
| `PARTIAL` | 24 |
| `CONFIGURATION_GATED` | 13 |
| `IMPLEMENTED_BUT_UNREACHABLE` | 5 |
| `WORKING_BUT_HARD_TO_DISCOVER` | 2 |
| `NOT_ENOUGH_EVIDENCE` | 2 |
| `NOT_IMPLEMENTED` | 1 |
| **Total** | **87** |

## The class the audit was asked to isolate: CODE EXISTS = YES, USER CAN COMPLETE = NO

This is the dominant failure mode in this product, and it is **not** mostly
missing code. Three distinct shapes:

1. **`IMPLEMENTED_BUT_UNREACHABLE` (5)** — module and DB objects exist with no
   reachable UI, or a page whose data is fixture/unwritable: the LMC credit
   ledger (≈1550 lines applied to production, no UI, six `false as const` kill
   switches), the worker documents centre (an inventory over a table nothing can
   write), `/api/leads` (dormant by its own comment), and two superadmin-gated
   preview surfaces.
2. **`PARTIAL` — built, prod-backed, nav-linked, never once used (24)** — the
   prior audit's finding F1 counted **22 shipped modules with zero production
   rows**. A feature can be complete on every axis and still have never carried
   a real user through.
3. **`WORKING_BUT_HARD_TO_DISCOVER` (2)** — real features reachable only by a
   deep link or with zero inbound nav links.

Every defect fixed in this PR belongs to this class. None of them was missing
code; all of them were code that existed, passed its tests, and could not be
completed by a person.

## Areas

| Area | Status | Recorded evidence (2026-07-22 matrix, abridged) |
|---|---|---|
| Work journal — create / edit / supersede / soft-delete / restore | `VERIFIED_WORKING` | VERIFIED — the single most-exercised feature on the platform. Primary nav tab (`lib/config/navigation.ts:66`, `feature-availability.ts:128-134`) |
| Journal photos | `VERIFIED_WORKING` | VERIFIED |
| Journal → skill recognition | `VERIFIED_WORKING` | VERIFIED |
| Manager confirmation → verified skill | `VERIFIED_WORKING` | VERIFIED (thin) — the core trust loop works but has fired twice in production |
| Batch journal review | `PARTIAL` | PARTIAL (never exercised) |
| Voice journal | `CONFIGURATION_GATED` | FLAGGED_OFF — real code, real service in-repo, unconfigured. Honest `unavailable` state |
| Worker profile — professions / curated skills | `VERIFIED_WORKING` | VERIFIED |
| Worker languages | `VERIFIED_WORKING` | VERIFIED |
| Worker preferences v2 (pay basis, shifts, licences, vehicle, tools) | `PARTIAL` | PARTIAL — applied and reachable; usage not distinguishable from NULL defaults |
| Worker education / achievements | `VERIFIED_WORKING` | VERIFIED (thin) |
| Self-declared work history | `PARTIAL` | PARTIAL — no standalone editor; only lights up if the user uploads a CV |
| Worker external profiles (LinkedIn/GitHub/portfolio) | `CONFIGURATION_GATED` | FLAGGED_OFF — section permanently renders `needs_migration` (`external-profiles-section.tsx:217`) |
| CV upload / text extraction | `VERIFIED_WORKING` | VERIFIED |
| CV structured import → profile writes | `PARTIAL` | PARTIAL — deterministic parser only; AI structuring is off (`cv-ai-structuring-actions.ts:23,30` require `AI_PROVIDER_MODE=live`) |
| Verified CV export | `VERIFIED_WORKING` | VERIFIED |
| Personal gallery | `VERIFIED_WORKING` | VERIFIED (near-orphan) |
| Worker documents centre | `IMPLEMENTED_BUT_UNREACHABLE` | UI_ONLY — a document inventory over a table nothing in the product can populate. The page says so (`documents/page.tsx:42-45,446`) |
| Absences / leave | `PARTIAL` | PARTIAL (never exercised) |
| Privacy self-service (consent, export, deletion request) | `VERIFIED_WORKING` | VERIFIED (thin) — one real consent grant exists |
| Contact disclosure requests (employer asks worker for details) | `PARTIAL` | PARTIAL (never exercised) |
| Worker opportunity board | `VERIFIED_WORKING` | VERIFIED |
| Save an opportunity (bookmark) | `PARTIAL` | PARTIAL (never exercised) |
| "New job matches" badge / seen markers | `CONFIGURATION_GATED` | FLAGGED_OFF — write silently no-ops; the badge on `dashboard-module-registry.ts:181` can never light up |
| Express interest in a demand | `VERIFIED_WORKING` | VERIFIED (thin) |
| Interest-response notification | `CONFIGURATION_GATED` | FLAGGED_OFF |
| Journal profession templates (composer scaffolds) | `CONFIGURATION_GATED` | FLAGGED_OFF — composer offers no picker (honest absence) |
| Learning / auto-confirmation policy | `WORKING_BUT_HARD_TO_DISCOVER` | PARTIAL + orphaned — zero inbound links, guard-enforced (`preview-surfaces-unlinked.test.ts:36-47`) |
| Player card | `NOT_ENOUGH_EVIDENCE` | — |
| Onboarding | `VERIFIED_WORKING` | VERIFIED |
| Company setup | `VERIFIED_WORKING` | VERIFIED |
| Company workspace | `VERIFIED_WORKING` | VERIFIED |
| Company operating locations | `CONFIGURATION_GATED` | FLAGGED_OFF — panel renders "prepared, activation pending" (`company-locations-section.tsx:74`) |
| Agency client CRM + demand→client link | `CONFIGURATION_GATED` | FLAGGED_OFF |
| Multi-company switching | `CONFIGURATION_GATED` | FLAGGED_OFF — falls back to single-company behaviour |
| Dashboard card preferences (server-side) | `CONFIGURATION_GATED` | FLAGGED_OFF — silently falls back to device-local `localStorage` |
| Company workers / roles / journal-review grant | `VERIFIED_WORKING` | VERIFIED — this is the *legacy* invite path and it is the one actually in use |
| Canonical invitations (7 types, token-hash, single-use) | `PARTIAL` | PARTIAL (never exercised) — the canonical model has never been used; the legacy `company_worker_invitations` path carries all 4 real invitations |
| Invitation email delivery | `CONFIGURATION_GATED` | FLAGGED_OFF — invitations are a manual link-share feature; `delivery_status` is permanently `not_sent` (honestly rendered, `invitation-list.tsx:129`) |
| Demand posting (draft + submit) | `VERIFIED_WORKING` | VERIFIED |
| Public anonymous company-need intake | `VERIFIED_WORKING` | VERIFIED (thin) |
| Scouting / shortlist | `VERIFIED_WORKING` | VERIFIED (thin) |
| Projects — create, assign workers | `VERIFIED_WORKING` | VERIFIED (thin) |
| Project stages (Gantt sub-phases) | `PARTIAL` | PARTIAL (never exercised) |
| Project budgets | `PARTIAL` | PARTIAL (never exercised) |
| Defects / corrections (quality) | `PARTIAL` | PARTIAL (never exercised) + no index route — there is no cross-project defect list anywhere in `apps/web` |
| Project handover passport | `VERIFIED_WORKING` | VERIFIED (thin) |
| Project operations CSV report | `VERIFIED_WORKING` | VERIFIED (no `needs-migration` branch, unlike its finance sibling) |
| Work tasks | `PARTIAL` | PARTIAL (never exercised) |
| Finance records + CSV export | `PARTIAL` | PARTIAL (never exercised) — export route returns honest 503 `needs_migration` (`finance/export/route.ts:26`) |
| Assets & logistics | `PARTIAL` | PARTIAL (never exercised) |
| Commercial CRM (proposals / contracts) | `PARTIAL` | PARTIAL (never exercised) |
| Bookings (propose / respond / reschedule / deadline) | `PARTIAL` | PARTIAL (never exercised) — the richest degradation code in the repo, guarding a feature nobody has used |
| Service offerings | `VERIFIED_WORKING` | VERIFIED (thin) |
| Service requests | `VERIFIED_WORKING` | VERIFIED (thin) |
| Marketplace listings (accommodation / tools / vehicles) | `PARTIAL` | PARTIAL (never exercised) |
| Teams / brigades | `PARTIAL` | PARTIAL (never exercised) |
| Candidate drafts (agency) | `VERIFIED_WORKING` | VERIFIED (thin) |
| Person detail | `WORKING_BUT_HARD_TO_DISCOVER` | VERIFIED (orphaned from nav) |
| Agency workspace | `NOT_ENOUGH_EVIDENCE` | — |
| Talent pool preview | `IMPLEMENTED_BUT_UNREACHABLE` | UI_ONLY — superadmin-only fixture surface, zero inbound links (guard-enforced) |
| Visual OS preview | `IMPLEMENTED_BUT_UNREACHABLE` | UI_ONLY — labelled preview, superadmin-gated |
| Messaging (conversations) | `VERIFIED_WORKING` | VERIFIED (thin) |
| Message attachments | `PARTIAL` | PARTIAL (never exercised) |
| Out-of-app notification of any kind | `NOT_IMPLEMENTED` | DOES NOT EXIST — recipients learn of messages only by opening the app. The single outbound channel in the whole product is `lib/notifications/telegram-owner-ale… |
| Network / relationships | `PARTIAL` | PARTIAL — the read half is real, the invitation half has never fired |
| Deterministic fit engine (matching) | `VERIFIED_WORKING` | VERIFIED — real and deliberately score-free |
| Automatic two-sided matching marketplace | `CONFIGURATION_GATED` | FLAGGED_OFF by design — `feature-availability.ts:262-275` marks `matching` and `marketplace` `hidden` |
| Market intelligence workspace | `VERIFIED_WORKING` | VERIFIED — Eurostat is a genuinely live external source with real rows |
| Eurostat import | `PARTIAL` | PARTIAL — real data, manual pipeline, no scheduler. `EUROSTAT_SOURCE_ENABLED`/`EUROSTAT_KILL_SWITCH` are absent from `.env.example` |
| Admin market rate averages | `PARTIAL` | PARTIAL (never exercised) — the league thermometer needs n≥2 and has n=0 |
| Billing / Stripe | `CONFIGURATION_GATED` | FLAGGED_OFF — provider resolves to `noop`, Stripe SDK never imported, live mode structurally blocked (`config-core.ts:75-84`) |
| LMC credit ledger | `IMPLEMENTED_BUT_UNREACHABLE` | CODE_ONLY — a fully built, fully inert DB foundation with no UI and six `false as const` kill switches |
| Public business profiles | `PARTIAL` | PARTIAL (never exercised) — default private, 404 until a company opts in |
| Answer engine (SEO questions) | `VERIFIED_WORKING` | VERIFIED (static) — 550 registered questions, only ~45 have written localized answers; unwritten ones are correctly not published |
| Labour-market country pages | `VERIFIED_WORKING` | VERIFIED (static) |
| Marketing pages (`/professions`, `/skills`, `/work-abroad`, `/work-opportunities`, `/match-preview`, `/calculators/project-cost`, `/worker-intake`, `/pricing`, `/vision`, `/about`, `/for-*`, 7 × `/legal/*`) | `VERIFIED_WORKING` | VERIFIED (static) |
| Reports hub | `VERIFIED_WORKING` | VERIFIED |
| Activity centre | `VERIFIED_WORKING` | VERIFIED |
| Assist centre | `VERIFIED_WORKING` | VERIFIED (non-generative) |
| Work instructions | `PARTIAL` | PARTIAL — cannot be separated from the 16 total messages |
| Dashboard search | `VERIFIED_WORKING` | VERIFIED |
| Telemetry | `VERIFIED_WORKING` | VERIFIED — real behavioural data; charts deliberately excluded |
| Admin surfaces (23 pages under `/dashboard/admin/*`) | `VERIFIED_WORKING` | VERIFIED with one exception: `/dashboard/admin/agent-os` renders a static list of 10 agent docs (`agent-os/page.tsx:24-35`, "no live agent runtime in v1") along… |
| `/api/leads` | `IMPLEMENTED_BUT_UNREACHABLE` | CODE_ONLY (dormant) — the route's own comment (`:5-12`) says the CTA was repointed to `customer_requests` |
| `/api/waitlist` | `VERIFIED_WORKING` | VERIFIED (thin) |
| `/api/auth/google` | `VERIFIED_WORKING` | VERIFIED |
| `/design`, `/design/text-first` | `CONFIGURATION_GATED` | FLAGGED_OFF in prod |

---

## What this sweep does NOT establish

- **It is not 87 fresh browser verifications.** Rows outside D-01…D-20 carry the
  prior audit's evidence, re-expressed in this vocabulary. Where that audit said
  UNKNOWN, this says `NOT_ENOUGH_EVIDENCE` rather than guessing.
- **`VERIFIED_WORKING` here means "reachable and functional on all five axes",
  not "used in production".** 22 of the areas below have produced zero
  production rows; they are marked `PARTIAL` for that reason, which is a
  deliberate downgrade, not a coding error.
- **Production behaviour is not established by any local run.** Everything in
  session 2 was verified against the LOCAL stack. Preview and production
  verification are recorded separately.

---

# Session 3 — post-gate continuous delivery (2026-08-08)

**Base:** `main` = `a04cb609`. Worktree `lmai-auth`, branch
`feat/cc/auth-provider-readiness-v1`.

## D-21 — CORRECTION: Google OAuth is configured in production, not gated

**This overturns the session-2 classification.** Gate 1 recorded Google as
`CONFIGURATION_GATED` on the reasoning that the credential half lives outside
the repo and no round trip had been performed. The first half of that was wrong,
and it was checkable without any credential.

| | |
|---|---|
| **Method** | A read-only GET to the production Supabase authorize endpoint — `https://<ref>.supabase.co/auth/v1/authorize?provider=google` — creates nothing. A disabled provider answers with a validation error; an enabled one redirects to Google. |
| **Result** | It redirects to `accounts.google.com/v3/signin/identifier` — the real account chooser. |
| **Parameters observed** (all public by construction) | `client_id` present, ending `…29t.apps.googleusercontent.com` · `redirect_uri=https://<ref>.supabase.co/auth/v1/callback` · `scope=email profile` · `response_type=code` |
| **Status** | `VERIFIED_CONFIGURED` — provider enabled, real OAuth client registered, callback correct. **No owner action is required for Google.** |
| **Still NOT verified** | The completion of a round trip. Consenting would create a real production account, so it was not done. That step belongs to human acceptance. |
| **Why it looked gated** | `supabase/config.toml` has no `[auth.external.google]` block, so Google genuinely cannot be exercised on the LOCAL stack. Local absence was read as production absence. |
| **Incidental finding** | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is declared in `lib/env.ts` but is **vestigial** — the current flow is `signInWithOAuth`, which resolves the client id server-side at the Supabase auth host. Nothing reads the variable. Not removed here (out of scope for a context fix); recorded as `DEFER_P2` cleanup. |

**Lesson recorded:** "the credentials are outside the repo" describes where a
secret lives, not whether a provider works. The provider's own public endpoint
answers the question, and it costs one request.

## D-22 — LinkedIn / Facebook / Instagram: unchanged, and unchanged deliberately

Re-derived from current `main`; no new evidence. LinkedIn and Facebook remain
`NOT_IMPLEMENTED` (their only occurrences in app source are a CV-import slug and
in-app-browser detection for geolocation errors). Meta/Instagram remains
`NOT_APPROPRIATE`.

Per the standing rule — **no dead buttons** — no provider button was added.
Adding one before the provider can complete authentication would be exactly the
"decorative promise" the Google row exists to warn about.

## D-20 — FIXED (was P1, unfixed at gate 1)

The product decision was made: an explicit personal selection must be respected.
Implemented in the smallest existing mechanism (session cookie + the two pure
resolvers), **no migration**, authorization unchanged. See the commit for the
three-layer root cause and both negative controls. `20260714210000` remains
owner-gated and unapplied, so the choice is session-scoped by design.

## D-23 — Identity collision: duplicate accounts are structurally impossible, and that was worth proving

The scenario the audit had to answer: `person@example.com` registers with
email/password; later Google (or any provider) returns the same address. Does
the product end up with a duplicate profile, a duplicate personal workspace, a
duplicate CV, a duplicate worker identity?

**Answered from the database, not from assumption.**

```
CREATE UNIQUE INDEX users_email_partial_key
  ON auth.users USING btree (email) WHERE (is_sso_user = false)
```

Email is UNIQUE in `auth.users` for every non-SSO user. A second row for the
same address cannot exist, so `handle_new_user` — the trigger that creates
`public.profiles`, keyed on `new.id` with `on conflict (id) do nothing` — can
only ever fire once per email. Every downstream identity (`profiles`, `workers`,
`organizations`, memberships, journal, CV) hangs off `auth.users.id`, so the
whole duplicate class is closed at its root.

| Risk | Verdict | Basis |
|---|---|---|
| Duplicate `auth.users` row | **Impossible** (non-SSO) | DB unique partial index |
| Duplicate `profiles` row | **Impossible** | trigger keys on `auth.users.id`, `on conflict do nothing` |
| Duplicate personal workspace / CV / worker / memberships | **Impossible** | all key off `auth.users.id` |

**What this does NOT settle.** Whether GoTrue *links* the new provider identity
to the existing user (the person signs in successfully) or *refuses* it (the
person is blocked and must use their password) is a Supabase project setting —
`auth.identities` is the linking table, and every local fixture currently holds
exactly one `email` identity, so no linked pair exists to observe. That is a
**UX** question, not a data-integrity one, and it cannot be determined from this
repo. Determining it in production would require completing a real OAuth
consent, which creates a production account.

**Deliberately not "fixed".** The instruction was not to auto-merge accounts on
an email assumption. Nothing here does: the guarantee is a database constraint,
not an inference, and no merging logic was added. If the provider refuses rather
than links, the correct repair is an explicit account-link confirmation flow —
recorded as the next auth slice, not invented now.

**Evidence level:** the impossibility is `VERIFIED` against the live local
schema (which is the same migration lineage as production). The link-vs-refuse
behaviour is `NOT_ENOUGH_EVIDENCE`.
