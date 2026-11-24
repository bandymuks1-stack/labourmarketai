> **HISTORICAL, POINT-IN-TIME AUDIT — DO NOT UPDATE IN PLACE.**
> Audit date **2026-08-02** · base commit `380c3679` · source `audit/w7-employee-journey` @ `0c9bb249`.
> Findings are frozen exactly as written and were **not** re-scored against later work.
> Closed since this audit: **P1-1** by PR #981 (`6119da2b`), **P1-2** by PR #979 (`1c8df7f8`).
> Current state → [post-merge production readiness baseline 2026-08-03](./post-merge-production-readiness-baseline-2026-08-03.md).
> Restored to `main` on 2026-08-03 (docs-only, content unaltered).

---

# W7 — EMPLOYEE JOURNEY: READ-ONLY AUDIT

**Mode:** `READ-ONLY AUDIT`. No product code, UI, migration, merge, deploy or
Telegram touched. Only this document was created.

**Base:** `origin/main` @ `380c3679` (W6 slice 2 —
`feat(w6): computeConfidence containment`). Worktree
`C:\Users\Mano\Documents\labourmarketai-w7-audit`, branch
`audit/w7-employee-journey`, created FROM `origin/main` — **not** from the W6
PR #974 branch.

**Entry-gate state recorded at audit start:**

| Check | State |
|---|---|
| Canonical repo `C:\Users\Mano\Documents\labourmarketai` | branch `main` @ `6e50df3f`, **behind origin/main by 2** |
| Main worktree clean? | **NO** — 3 modified PNGs under `docs/audits/evidence/premium-rebuild-w1/`, 1 untracked dir `docs/audits/evidence/player-card-owner-review-2026/`. Not touched by this audit. |
| `origin/main` | `380c3679` (after `git fetch --prune`) |
| W7 worktree existed? | NO → created from `origin/main` |
| Branch `audit/w7-employee-journey` local/remote? | Neither → created |
| W6 merge state | Slice 1 (#972) and slice 2 (#973) **MERGED**. Slice 3 / **PR #974 NOT merged** — its branch `feat/cc/w6-slice3-experience-records` lives in worktree `lm-wt-w5`. Treated as a dependency, never copied in. |

---

## 1. FACTUAL END-TO-END MAP

The canonical worker path as it actually exists on `main`:

```
 1 landing              /[locale]                      (marketing)
                        HeroLiveDemo → ProductChainBand → PlayerCardShowcase
                        → TrustBand → FinalCtaBand
 2 signup               /[locale]/auth/signup          SignupForm
                        Google OAuth · email+password (8ch/upper/digit/special)
                        AuthLegalNotice ×2 · ?next= preserved
 3 login                /[locale]/auth/login           LoginForm
                        ?next= preserved · Google-hint on password failure
                        · preview-host honesty notice · forgot-password ×2
 4 onboarding           /[locale]/onboarding           OnboardingWizard
                        step1 roles (worker | company, multi-select)
                        step2 display_name + country (NO default country)
                        pending-invite note · ?next= survives
 5 profile              /[locale]/dashboard/profile    1007-line page,
                        ~25 sections (setup journey, live profile, hub
                        overview, trust block, availability, languages,
                        education, achievements, external profiles,
                        capabilities, skill clarify …)  chrome = "panel"
 6 job search           chat chip "jobs" → startFindWork()
                        criteria readback FIRST (loadCriteriaSummaryForChat)
                        → if gaps: says what is known + asks via
                          worker.save-work-card form → THEN searches
                        → findWorkForChat() → assistant sentence
                        → ?result=opportunities  (OpportunitiesResult)
 7 apply / invitation   WorkerInterestButton (one write path, both surfaces)
                        WorkerInvitations in the panel · /invite/[token]
 8 planning             chat "agenda" → loadContextBrief → ?result=calendar
                        full: /dashboard/planning  (chrome = "panel")
 9 work start           booking accept → respond_booking_request (SECURITY
                        DEFINER, DB-level overlap guard)
10 work journal         chat "logwork" → extractWorkLog → WorkerWorkLogFlow
                        (preview → explicit confirm → createJournalEntry)
                        full: /dashboard/journal (chrome = "panel")
11 evidence             journal composer photo (1/entry free tier)
                        journal_entry_confirmations (append-only)
12 confirmation         review-status.ts → approved | rejected |
                        changes_requested | submitted (latest-wins)
13 skill update         skill-pipeline → worker_skills + provenance
                        → confidence recompute (W6 slice 2 containment)
14 experience/reputation  ✗ DOES NOT EXIST ON MAIN  (see §7)
15 pay / work result    /dashboard/finance → "needs-migration" honest state
16 back to chat         ← arrow in the panel-chrome header; logo→/dashboard
                        in full chrome
17 next action          opening brief (≤3 lines, ≤3 chips) on every chat mount
```

**Architectural truth:** the doctrine holds. `/dashboard` renders exactly one
`<ConversationChat>`; `/dashboard/advanced` is deleted; the Context Panel is the
one result surface; one dispatcher (`handleChip`) serves thread chips AND panel
chips. **No parallel employee dashboard exists as a route.** The caveat is in
§4/D2 — the *chrome* still forks.

---

## 2. FULL / PARTIAL / MISSING MATRIX

### A. Entry and authentication

| Item | State | Note |
|---|---|---|
| Landing CTAs | FULL | `FinalCtaBand` — "four real doors, no dead links", guard-pinned |
| Login (email/password) | FULL | `login-form.tsx` |
| Signup (email/password) | FULL | `signup-form.tsx`; `check_email` branch handles the Supabase confirm-email toggle instead of dead-ending |
| Google OAuth | FULL | `google-button.tsx`, callback `auth/callback/route.ts`; stray-code middleware salvage |
| Redirects / `?next=` | **PARTIAL** | see **P1-1** — query string is dropped |
| Locale retention | FULL | locale prefix carried through login → callback → onboarding → dashboard |
| Workspace creation | FULL | `completeOnboarding` → `getWorkspaceContext` |
| Return to started action | PARTIAL | path returns, query does not (P1-1) |

### B. Onboarding

| Item | State | Note |
|---|---|---|
| Required vs optional fields | FULL | roles ≥1, display_name, country — all validated client + server |
| Profile-completion logic | FULL | ONE source: `deriveWorkerReadiness(getWorkerPlayerCard())`; chat, opening brief and card read the same 6 pillars |
| Onboarding vs profile-edit duplication | FULL (no duplication) | onboarding sets identity only; everything else lives on the profile |
| Continue later | FULL | `onboarded_at` gate; a revisit with `?next=` honours it |
| False completion signals | **FULL — none found** | `introComplete` fires only at `missingCount === 0`; opening brief emits `briefProfileGap` only when `missing.length > 0` |
| Mobile | FULL | single-column, `w-full` buttons, 44px targets |

### C. Profile and Player Card

| Item | State | Note |
|---|---|---|
| Professional identity | FULL | `professionSlug`, `WorkerTradeProfile` |
| Avatar | FULL | `ProfileAvatar` + signed URL |
| Competence presentation | FULL | `CapabilityProfileSection` |
| Evidence tier | FULL | ONE canonical `lib/evidence/evidence-tier.ts` (W6 slice 1) |
| Skill states | FULL | declared / journal-supported / verified — three honest rungs |
| Availability | FULL | `WorkerAvailabilityPrefsForm` |
| Experience counts | **MISSING** | no store exists (§7) |
| CV | FULL | `/cv`, auth-gated in middleware AND at page level |
| **No stars / no total trust score** | **FULL (compliant)** | grep across `trust-block`, `worker-player-card`, `profile-state-strip` → zero star/rating/score renders; dormant `trust_score` columns stay unrendered; guard-pinned |
| What the worker sees | FULL | full own card |
| What the employer sees | FULL | `scout-safe-view.ts` + `worker-profile-visibility.ts` — anonymised, no name/contacts |
| What an anonymous visitor sees | **FULL (nothing)** | no public worker route exists; `/cv` is in `REQUIRES_AUTH`. **But** `lib/legal/permission-matrix.ts` has no `anon` column → the published matrix does not state this (P2-4) |
| Profile page shape | **PARTIAL** | 1007 lines / ~25 sections — see **P1-4** |

### D. Discovery and candidacy

| Item | State | Note |
|---|---|---|
| Search | FULL | `findWorkForChat` → `loadWorkerOpportunityMatches` → gated RPC × match engine |
| Filters / geography / skills / availability | FULL | `runFindWork(text)` carries World State from the sentence |
| Match explanation | FULL | §19 basis `matched/total (confirmed)` — never a bare percentage |
| Job detail | FULL | row → `world.openEntity({type:"job"})` → panel entity mode |
| Apply / express interest | FULL | `WorkerInterestButton` — ONE write path shared by board and panel; hidden (not faked) when the gated table is absent |
| Invitation acceptance | FULL | `WorkerInvitations` in the panel + `/invite/[token]`; renders above the map so a phone user does not have to scroll past it |
| Decline reason privacy | FULL | closed `DECLINE_REASON_KINDS`; invalid input degrades to "no reason", never an error; `reasonStored:false` when the v2 RPC is absent |
| **"Ieškau darbo" never pre-rejects** | **FULL (compliant)** | `startFindWork` reads criteria FIRST, states what is known, asks for gaps, and only then searches. The old "nothing found" cold open is gone. |
| Return to chat | FULL | result panel stays inside `/dashboard` — no navigation |

### E. Planning and work start

| Item | State | Note |
|---|---|---|
| Booking | FULL | `propose_booking_request_v3` → v1 fallback |
| Schedule / calendar | FULL | `getPlanning` + `?result=calendar` + `/dashboard/planning` |
| Conflict detection | FULL | `buildWorkContext` conflict counting surfaces in the opening brief |
| **Double-booking block** | **FULL — DB-enforced** | `respond_booking_request` (SECURITY DEFINER) raises `23P01` on `daterange && daterange` overlap. **Edge:** a booking with `start_date IS NULL` skips the guard entirely (P2-1) |
| Work-start condition | FULL | state machine `proposed → accepted\|declined` only |
| Work statuses | FULL | `booking-state.ts` |
| Error / unavailable states | FULL | `conflict` is its own result kind; UI has a distinct label |
| Offer list freshness | **PARTIAL** | P2-2 — `bookingOffers` is a server prop from page load; accepting/declining does not re-read it in the same session |

### F. Work Journal → Evidence → Skills

| Item | State | Note |
|---|---|---|
| Journal entry | FULL | deterministic extract → editable preview → explicit confirm → one write path |
| Structuring | FULL | `extractWorkLog` (pure, `today` injected) |
| **Files and photos** | **PARTIAL** | photos exist ONLY on `/dashboard/journal`; the chat work-log flow has no attachment at all (P1-2) |
| **File compression** | **MISSING** | `photo-upload.ts` validates and REJECTS >5 MB (`"invalid"`); there is no client-side resize/re-encode anywhere (P1-2) |
| Confirmation | FULL | `journal_entry_confirmations`, append-only, actor/org/role/scope |
| Rejection / changes requested | FULL | `review-status.ts`, latest-wins, legacy `action` mapped |
| Evidence drill-down | FULL | W5 slice 3 — bars open the skill-filtered journal |
| Skill update | FULL | `skill-pipeline` + provenance; the flow reports the REAL outcome (added / strengthened / awaiting confirmation / pipeline failed) |
| Confidence presentation | FULL | bins + 3-item legend; numeric score guard-pinned unrendered; W6 slice 2 caps the self-logged term at 15 |
| Return to chat | FULL | work-log `onClose` → player card in the panel |

### G. Experience and reputation

| Item | State |
|---|---|
| Experience store (table) | **MISSING** — zero migrations reference any experience/review record table |
| Eligibility contract | FULL **as a contract only** — `lib/trust/experience-eligibility.ts` |
| Any UI consumer | **MISSING and guard-ENFORCED** — `experience-eligibility.test.ts` walks `app/` + `components/` and asserts **zero** files import it (`OWNER_DECISION_GATED — MP-6`) |
| "Palikti patirtį" CTA | **MISSING** |
| Positive / negative display | MISSING |
| Reply / dispute | MISSING |
| Moderation state | Contract only — `submitted → in_moderation → published\|rejected`, no shortcut, authors can never move a record |
| `reputation` result kind | **STUB (honest)** — declared with `dataReadiness: "unverified"` → falls back to `/dashboard/profile` with a stated reason |
| Verdict | **`BLOCKED_BY_W6`** |

The contract is sound and already §19-reconciled (guard: the vocabulary contains
no `score|rating|star|percent`; the only aggregate is a transparent count, and
below the minimum it renders as absence, not zero).

**W6 PR #974 is explicitly NOT treated as production fact.** Nothing in this
audit credits its behaviour.

### H. Return and continuity

| Item | State | Note |
|---|---|---|
| What the user sees next login | FULL | opening brief: new matches → conflicts/overdue → unlogged work → unread messages → first profile gap. Every line is a count from the person's own rows; a failed read contributes nothing |
| **Chat remembers active context** | **PARTIAL — state yes, transcript no** | see **P1-3** |
| **History grouped** | **OWNER_GATED (never renders)** | `HistoryBlock` is fully built but unreachable — the migration is unapplied (P1-3) |
| Clear next action | FULL | ≤3 chips, recommended first, server-ordered |
| Dead ends | 2 found (§4) |
| Function findable without manual navigation | FULL | chat chips + `HeaderSearch` command palette on every width |

---

## 3. DEFECTS

### P0
**None.** No defect on `main` blocks a worker from completing the core loop
(register → onboard → profile → search → apply → book → log work → evidence →
confirmation → skill), and no honesty/privacy principle is violated.

### P1

**P1-1 — `?next=` loses the query string (`MISLEADING` continuity)**
- File: `apps/web/middleware.ts:221`
- Code: `loginUrl.searchParams.set("next", request.nextUrl.pathname)`
- User impact: a worker opening a deep link such as
  `/lt/dashboard?result=opportunities` or `/lt/dashboard/journal?entry=<id>`
  while logged out is bounced to login and returns to the **bare** path. The
  thing they clicked is gone; the product looks like it lost their request. The
  audit's "return to the started action" requirement is only half met.
- Minimal fix: `request.nextUrl.pathname + request.nextUrl.search`.
  `getSafeReturnPath` / `isSafeReturnPath` already tolerate a query (they only
  reject `//`, a scheme, a non-`/` start and `/auth`), so no validator change is
  needed. One line.
- Depends on: nothing.
- Verification: log out → open `/lt/dashboard?result=opportunities` → expect
  login `?next=%2Flt%2Fdashboard%3Fresult%3Dopportunities` → after login the
  opportunities panel is open. Add to `tests/e2e/auth.spec.ts`.

**P1-2 — Photo evidence is unreachable from the chat, and a phone photo is
rejected instead of compressed (`PARTIAL` + `MISSING`)**
- Files: `apps/web/components/app/conversation/worker-worklog-flow.tsx` (no
  attachment control at all); `apps/web/components/app/conversation/chat/composer.tsx:121-131`
  (the paperclip's ONLY behaviour is `handleChip({id:"cv"})`);
  `apps/web/lib/journal/photo-upload.ts:17,33-39`
- Table: storage bucket `journal-entry-photos`, RPC
  `register_journal_entry_photo` (migration `20260612091000`)
- User impact: two compounding problems. (a) The doctrine says the chat is the
  primary work surface, yet the one thing a construction worker most wants to
  attach to a work log — a site photo — can only be added on
  `/dashboard/journal`. (b) `isValidJournalPhoto` rejects anything over 5 MB as
  `"invalid"`. Modern phone cameras routinely produce 4–12 MB JPEGs, so a real
  worker photographing real work gets a flat refusal with no path forward. There
  is no `canvas`/`toBlob`/resize step anywhere in the tree.
- Minimal fix: (a) client-side downscale-and-re-encode before
  `isValidJournalPhoto` (longest edge ≈2048 px, JPEG q≈0.8) — this is where the
  5 MB ceiling stops being a wall; (b) then, separately, surface a photo step in
  `WorkerWorkLogFlow` reusing `uploadJournalEntryPhoto` unchanged (one write
  path preserved).
- Depends on: nothing. (a) and (b) are independently shippable; (a) first.
- Verification: unit-test the compressor's output size/dimension bounds;
  browser-test a >5 MB fixture through the journal composer, then through the
  chat flow.

**P1-3 — The conversation has no memory across sessions (`OWNER_GATED`)**
- Files: `apps/web/lib/assistant/transcript.ts`;
  `apps/web/components/app/conversation/chat/conversation-chat.tsx:249-314`;
  `apps/web/components/app/conversation/chat/history-block.tsx`
- Migration: `docs/proposals/assistant-transcript-v1/20260724_assistant_transcript_v1.sql`
  — **present in `docs/proposals/`, absent from `supabase/migrations/`.**
- User impact: `loadAssistantThread` returns `{available:false}`, `persistTurn`
  is a no-op, and `HistoryBlock` never mounts. Every reload or return starts the
  thread from the greeting. The audit's "does the chat remember the active
  context / is history grouped" question answers: **state yes, conversation no.**
  The degradation is honest (nothing claims to be saved), and the opening brief
  + profile summary are a genuine substitute for *state* continuity — but a
  person who asked a question yesterday cannot see what they were told.
- Minimal fix: **owner gate.** Applying the RED migration is the whole change;
  the client and server adapters are already written and already degrade
  correctly. Nothing to implement — a decision to make.
- Depends on: owner (schema apply).
- Verification: after apply, send two turns → reload → the collapsed history
  block appears above the greeting and pages backwards.

**P1-4 — `/dashboard/profile` is a de-facto second worker dashboard
(`PARTIAL`)**
- File: `apps/web/app/[locale]/dashboard/profile/page.tsx` (1007 lines, ~25
  mounted sections)
- User impact: the route is correctly in `PANEL_PREFIXES` (simple chrome, back-
  to-chat arrow), so it is not a *parallel navigation system*. But it is a
  single scrolling page holding the setup journey, live profile, hub overview,
  trust block, availability, languages, education, achievements, external
  profiles, capabilities and skill clarification. On a phone that is a very long
  scroll with `PageQuickNav` as the only wayfinding. It is where the "chat is the
  primary surface" principle is weakest in practice — not violated in
  architecture, diluted in ergonomics.
- Minimal fix: no code change is safe to recommend from a read-only pass. The
  W7 slice plan (§8) proposes measuring it first.
- Depends on: W6 (adds an experience section to this same page — see §9).
- Verification: 375 px screenshot pass + section-count inventory.

### P2

**P2-1 — Open-ended bookings skip the double-booking guard**
- File: `supabase/migrations/20260613100100_booking_requests.sql:220-234`
- The overlap check is wrapped in `if p_decision = 'accepted' and br.start_date
  is not null`. A booking with no start date can be accepted on top of any other
  accepted booking, and it is also invisible to every other booking's overlap
  test. Narrow (the proposer normally sets a date) but it is the one hole in an
  otherwise DB-enforced rule.
- Fix: a migration → owner-gated. Record only.

**P2-2 — Booking offers in the chat go stale within the session**
- File: `apps/web/app/[locale]/dashboard/page.tsx:67-113` — `bookingOffers` is
  resolved server-side at page load and passed as a prop. `handleChip("offers")`
  re-renders the same frozen array, so a worker who accepts an offer and then
  asks for offers again sees it still listed as pending until a full reload.
- Fix: re-read through a server action on the `offers` chip, mirroring
  `startFindWork` / `startAgenda`.

**P2-3 — `?result=journal|evidence|invoice` renders a pending sentence with no
way forward (`STUB`)**
- Files: `apps/web/lib/conversation/result-registry.ts` (journal, evidence,
  invoice are all `dataReadiness: "real"` and include the `personal` context);
  `apps/web/components/app/workspace/result-body.tsx:112-166` (`InlineResult`
  has cases for `opportunities`, `market`, `player-card`, `calendar` only)
- Mechanism: `canRenderInline` returns **true** for these three, so the honest
  fallback branch — the one carrying the `openFull` button — is **skipped**, and
  the person lands on `default → <p>{t("pendingInline")}</p>`. The panel's close
  `X` is the only exit; the `advancedRoute` the registry declares is never
  offered.
- Reachability: **not reachable from any in-product control today.** Nothing
  calls `openResult` with these kinds, and no `<Link>` writes them. It bites on a
  hand-typed or previously-shared URL. That is why this is P2 and not P1.
- Fix (choose one): downgrade the three to `"unverified"` (one-word change,
  restores the fallback + button), or give `default` the same `openFull` button
  the fallback branch has. Then pin it: a guard asserting every
  `dataReadiness:"real"` kind has an `InlineResult` case.
- Verification: open `/lt/dashboard?result=journal` → expect a stated reason and
  a working "open full screen" control.

**P2-4 — The published permission matrix has no anonymous column**
- File: `apps/web/lib/legal/permission-matrix.ts:26` —
  `MATRIX_ROLES = ["worker","company","teamOwner","admin"]`
- The audit asks what an anonymous visitor sees. The real answer is **nothing**
  (no public worker route; `/cv` is in `REQUIRES_AUTH` in `middleware.ts:83` and
  gated again at page level). That is a genuinely strong privacy position which
  `/legal/data-access` does not currently state. Adding an `anon` column would
  be a legal-copy change → owner wording gate.

**P2-5 — Chat auto-scroll ignores `prefers-reduced-motion`**
- File: `apps/web/components/app/conversation/chat/conversation-thread.tsx:59-61`
  — `scrollIntoView({behavior:"smooth"})` unconditionally, on every new turn.
  Every other motion on this surface is documented as reduced-motion-aware; this
  one is not. WCAG 2.3.3 (AAA) / vestibular comfort.

---

## 4. DEAD ENDS

| # | Where | Severity | State |
|---|---|---|---|
| D1 | `?result=journal` / `evidence` / `invoice` — pending sentence, no `openFull`; only the panel `X` escapes | P2 | `STUB` (P2-3) |
| D2 | Chrome fork: the chat's result panel offers "open full screen" → `/dashboard/opportunities`, which is **not** in `PANEL_PREFIXES`, so the worker lands in **full** chrome — `DashboardTabs` + `BottomNav` + the Rexora footer, a different navigation system mid-journey. Not a dead end (the logo returns to `/dashboard`) but a **continuity break**, and the closest thing on `main` to a "parallel employee dashboard" | P2 | `PARTIAL` |

`/dashboard/journal`, `/dashboard/planning`, `/dashboard/profile` and
`/dashboard/communication` are all in `PANEL_PREFIXES` and keep the back-to-chat
arrow. `/dashboard/opportunities` is the one core-loop destination that is not.

---

## 5. MISLEADING CTAs

| # | Control | Why | Verdict |
|---|---|---|---|
| M1 | Composer paperclip (`composer.tsx:121`) | In a chat, a paperclip means "attach to this message". Here it **always** opens the CV import flow, whatever the conversation is about — including mid-work-log, where attaching a site photo is exactly what a worker would expect. `aria-label` comes from `labels.attach`. | `MISLEADING` — folds into P1-2 |
| M2 | `?result=…` panel title | The panel renders the registry `titleKey` (e.g. "Work journal") above a body that says the result is pending. The title promises a result the body cannot deliver. | `MISLEADING` — folds into P2-3 |

**Checked and clean:** no "Complete your profile" CTA renders on a complete
profile (`introComplete` at `missingCount === 0`; `briefProfileGap` only when
`missing.length > 0` — one completeness source, verified end to end). No stars,
no total trust score, no numeric confidence anywhere. No CTA promises a
capability that does not exist: `reputation` states its own unverified status,
`finance` states `needs-migration`, `WorkerInterestButton` is not rendered at all
when its gated table is absent, and the reminder/translate intents answer with an
honest block rather than a fake action.

---

## 6. MOBILE AND ACCESSIBILITY

**Strong:**
- 44 px minimum targets are systematic (`size-11`, `min-h-11`) across composer,
  panel, chips and result buttons.
- The conversation thread is `role="log" aria-live="polite"
  aria-relevant="additions"` — arriving assistant turns are announced.
- Typing indicator is `role="status" aria-live="polite"`.
- Speaker names are `sr-only` per turn.
- The Context Panel is a **non-modal** `<aside>` with `aria-label` — no focus
  trap, no backdrop; the chevron and `X` are both real exits.
- iOS home-indicator inset honoured (`env(safe-area-inset-bottom)`).
- The composer survives pre-hydration typing (a real production data-loss bug,
  already fixed).
- A pending invitation renders **above** the map so it is not a scroll away
  inside a ~45 dvh sheet.

**Gaps:**

| # | Item | Severity |
|---|---|---|
| A1 | `scrollIntoView({behavior:"smooth"})` with no `prefers-reduced-motion` check | P2-5 |
| A2 | On phones the expanded panel is `max-h-[78dvh]` while its body is `max-h-[45dvh]` — a wide result (market drill-down rows) scrolls inside ~45 dvh above the composer. Needs a 375 px screenshot pass to confirm it is comfortable rather than cramped. | P2 — needs evidence |
| A3 | `/dashboard/profile` at 375 px: ~25 stacked sections, `PageQuickNav` the only wayfinding | P1-4 |
| A4 | `LocaleSwitcher` is `hidden md:flex` in the conversation header — on a phone, changing language requires the account menu | P2 |

---

## 7. W6 DEPENDENCIES

| W7 point | W6 dependency | State on `main` |
|---|---|---|
| 14 — experience / reputation | **PR #974** (`feat/cc/w6-slice3-experience-records`) | **NOT merged.** No table, no UI, guard-enforced zero consumers. `BLOCKED_BY_W6` |
| Where eligibility appears | `lib/trust/experience-eligibility.ts` — `deriveReviewEligibility` needs a completed interaction: `accepted_booking` past its start date, `completed_engagement` with `ended_at`, or `concluded_service_request` accepted | The interactions **already exist** on `main` (booking accept, engagements). Only the record store and the surface are missing |
| Where "Palikti patirtį" would attach | Three honest anchor points, all existing: (1) chat opening brief — a completed interaction is exactly the "reason to be here today" signal `loadOpeningBrief` composes; (2) `?result=reputation` — the descriptor already exists, flip `unverified → real`; (3) the panel's entity mode for a finished booking | All three are **additive** — no new route needed |
| Trust-signal leakage | W6 slice 1 unified `EvidenceTier`; W4 permission matrix holds | FULL |
| Confidence containment | W6 slice 2 — `SELF_LOGGED_CONFIDENCE_CAP = 15` | FULL, merged |
| Experience counts on the Player Card | `WorkerPlayerCard` has no experience field | MISSING — W6 adds it |

**Rule honoured throughout this audit:** every W6 slice-3 capability is recorded
as `BLOCKED_BY_W6`, never as a W7 gap and never as a production fact.

---

## 8. RECOMMENDED W7 SLICE PLAN

Ordered so nothing collides with active W6 work (see §9). **Not started — awaits
a separate owner command.**

| Slice | Scope | Touches | W6 conflict |
|---|---|---|---|
| **W7-1** Continuity repair | P1-1 (`next` + search) and P2-3 (result-registry honesty + a guard pinning "every `real` kind has a renderer") | `middleware.ts`, `result-registry.ts`, `result-body.tsx`, 1 new guard, 1 e2e | **None** |
| **W7-2** Evidence on a phone | P1-2(a): client-side photo downscale before validation. The single highest-value real-worker fix in this audit. | new `lib/journal/photo-compress.ts`, `photo-upload.ts` | **None** |
| **W7-3** Photo in the chat work log | P1-2(b) + M1: a photo step in `WorkerWorkLogFlow`, reusing `uploadJournalEntryPhoto` unchanged; disambiguate the paperclip | `worker-worklog-flow.tsx`, `composer.tsx` | **None** |
| **W7-4** Offer freshness + chrome continuity | P2-2 (re-read offers via a server action) and D2 (decide whether `/dashboard/opportunities` joins `PANEL_PREFIXES`) | `dashboard/page.tsx`, `conversation-chat.tsx`, `dashboard-chrome.tsx` | **None** |
| **W7-5** Mobile evidence pass | A2 + A3 + A4: 375 px screenshots of chat, expanded panel, profile; then a scoped decision | evidence only, then scoped | **Profile page — wait for W6** |
| **W7-6** Experience surfacing | Wire the eligibility contract to its three anchor points | `opening-brief.ts`, `result-registry.ts`, profile page | **HARD — blocked on PR #974** |
| — | P1-3 (transcript migration), P2-1 (booking migration), P2-4 (legal matrix copy) | — | **OWNER GATES — no agent action** |

Recommended first: **W7-2**, then **W7-1**. W7-2 is the only item that changes
what a real worker on a real site can actually do today.

---

## 9. FILE CONFLICT MAP

**Do NOT edit in parallel with active W6 (PR #974) work:**

| File | Why |
|---|---|
| `apps/web/app/[locale]/dashboard/profile/page.tsx` | W6 slice 3 adds the experience section here. 1007 lines — a near-certain conflict. |
| `apps/web/lib/conversation/result-registry.ts` | Both W7-1 (readiness flags) and W6 (`reputation` → `real`) edit the same descriptor array. Memory records that #974 renames the `reputation` kind. **Sequence, never parallelise.** |
| `apps/web/lib/trust/experience-eligibility.ts` | W6-owned. Read-only for W7. |
| `apps/web/lib/guards/experience-eligibility.test.ts` | The "zero consumers" assertion **must** be updated by W6, not by W7. A W7 edit here would silently unlock the owner gate. |
| `apps/web/components/app/worker-player-card.tsx` | W6 adds experience counts. |
| `apps/web/lib/conversation/opening-brief.ts` | W6 may add an experience-eligibility line. |
| `supabase/migrations/` | W6 owns the experience migration. W7 must add none. |

**Safe for W7 to edit now (no W6 overlap):**
`middleware.ts` · `lib/auth/redirect.ts` · `lib/journal/photo-upload.ts` ·
`components/app/conversation/worker-worklog-flow.tsx` ·
`components/app/conversation/chat/composer.tsx` ·
`components/app/workspace/result-body.tsx` ·
`components/app/dashboard-chrome.tsx` · `app/[locale]/dashboard/page.tsx`

**Cross-W map:**

| W | Relationship |
|---|---|
| **W6 Trust/Reputation** | Blocking for journey point 14; shares 6 files above |
| **W10 Marketplace** | Shares `worker-opportunities*`, `WorkerInterestButton`, the gated demand RPC. W7 consumes, never redefines |
| **W12 Calendar** | Shares `lib/planning/*`, `lib/booking/*`, `calendar-result.tsx`. P2-1 is a W12 migration, not W7 |
| **W13 Messaging** | Shares `lib/communication/*`, `ChatMessageReply`, `getUnreadConversationCount`. W7 only reads the unread count |
| **W19 Mobile/A11y/Perf** | Owns A1–A4. W7-5 should hand its evidence to W19 rather than fix in place |

---

## 10. PRODUCT-CODE INTEGRITY CONFIRMATION

```
$ cd C:/Users/Mano/Documents/labourmarketai-w7-audit
$ git status --porcelain
(empty)
$ git rev-parse HEAD
380c3679cb79b9f09d99ae4090b845447cd46efe
$ git diff --stat origin/main
(empty)
```

The worktree was byte-identical to `origin/main` throughout the audit. Every
tool call was a read (`Read`, `Grep`, `Glob`, `git log/status/diff/show`). **No
product code, UI, migration, test, config or guard was modified. No branch was
merged. No deploy ran. No production system was touched. No Telegram message was
sent. No W8 or later stage was started.** This document is the only file
created, and it was written after the integrity check above.

The canonical repo's pre-existing dirty state (3 modified PNGs + 1 untracked
evidence dir) was recorded at the entry gate and left exactly as found.

---

**Verdict: `W7_EMPLOYEE_JOURNEY_READ_ONLY_AUDIT_COMPLETE`**

No implementation begins without a separate owner command.
