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
