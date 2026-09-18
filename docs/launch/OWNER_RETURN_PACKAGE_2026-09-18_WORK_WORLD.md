# OWNER RETURN PACKAGE — Work World propagation, 2026-09-18

One consolidated package for the owner-away autonomous execution
(directive "MASTER CONTINUATION DIRECTIVE — 2026-09-18"). Not a diary:
each section states truth at the proof level it was actually reached.

Proof levels used exactly: CODE_PROVEN < BUILD_PROVEN < LOCAL_BROWSER_PROVEN
< PRODUCTION_DEPLOYED < PRODUCTION_BROWSER_PROVEN < HUMAN_UI_PROVEN.
LOCAL_BROWSER_PROVEN here always means: the production build (`next build`
+ `next start`) against the **production** Supabase backend, walked with
Playwright as a synthetic identity, desktop 1360 px + mobile 390 px, LT/EN/RU.

---

## A. PRODUCTION

| | |
|---|---|
| main SHA at package time | `a2bf8ff3` (#1784) |
| production SHA | `a2bf8ff3` (`/api/health` build field, 15:4x UTC), health OK (auth + db) — main = prod |
| merged PRs (this run) | #1777 Journal · #1778 Calendar · #1779 Field · #1780 Map · #1781 Chat context · #1782 Communication · #1783 Agency + Institution · #1785 Player Identity · #1784 Landing + dead-class fixes |
| deployed PRs | all nine above (verified by `/api/health.build` = merge SHA after each wave) |
| RED (draft, `needs-human-gate`) | #1786 Public Jobs + OAuth consent — see J |
| migration state | **unchanged** — zero migrations, zero RLS, zero authority changes in this run |
| critical software blockers | NONE |

Deploy note: every merge to `main` deploys via Vercel; each was verified by
`/api/health.build` matching the merge SHA before the next edge was started
(#1777–#1780 verified at `990572da`; #1781–#1783 at `8abe70e2`; #1784–#1785 at `a2bf8ff3`).

## B. PRODUCT COMPLETION

Legend per surface: IMPLEMENTED · VISUALLY_PROPAGATED · DESKTOP_PROVEN ·
MOBILE_PROVEN · ZERO_DATA_PROVEN · LT/EN/RU_PROVEN · A11Y · REGRESSION ·
PRODUCTION_DEPLOYED · PRODUCTION_BROWSER_PROVEN.

| Surface | Impl | Propagated | Desktop | Mobile | Zero-data | LT/EN/RU | A11y | Regression | Prod deployed | Prod browser |
|---|---|---|---|---|---|---|---|---|---|---|
| CHAT_FIRST (`/dashboard`, Context Panel, World State) | YES | YES (#1781: history spine, place precision in map legend) | LOCAL | LOCAL | n/a (panel shows work context) | YES | inherits panel (no modal, no focus trap; guarded) | none (439 guard tests) | YES | PENDING (authed) |
| PLAYER_IDENTITY (`/dashboard/profile`) | YES | YES (#1774 EvidenceState, #1776 PeriodBand, #1785 history spine + on-arrival) | LOCAL | LOCAL | YES (honest `live-profile-history-empty`) | YES | headings h2/h3 kept; `<details>` still keyboard-focusable | none (327 guard tests) | YES | PENDING — Donatas's own walk |
| PEOPLE/CAPACITY (roster) | YES | YES (#1774 PersonPresence) | LOCAL (earlier) | LOCAL | YES | YES | – | none | YES | PENDING |
| DEMAND/MATCHING (needs) | YES | YES (#1775 CapacityBand) | LOCAL | LOCAL | YES | 11 locales | – | none | YES | PENDING |
| JOURNAL | YES | YES (#1777 WorkSpine + EvidenceState on every entry) | LOCAL | LOCAL | existing empty state kept | YES | chip text + colour, never colour-only | none (86 guard tests) | YES | PENDING |
| CALENDAR (`/dashboard/planning`) | YES | YES (#1778 OBSERVED/COMMITTED/PLANNED/UNKNOWN chip on every row; DERIVED period band on month view) | LOCAL | LOCAL | YES (no derived section for a person with no period record) | YES | chip is text + colour | none (`planning.test.ts` unchanged) | YES | PENDING |
| FIELD (`/projects/[id]/operations`) | YES | YES (#1779 CapacityBand people vs open slots; PlaceTimeStamp lanes) | LOCAL | LOCAL | YES (0 people / 1 slot) | YES | P4 contract kept (≥44 px buttons, text+symbol) | none | YES | PENDING |
| MAP (`/dashboard/market-map`) | YES (unchanged canonical map) | YES (#1780 PlacePrecision on every world row) | LOCAL | LOCAL | existing honest states kept | YES (5 routed) | chip text | none | YES | PENDING |
| COMMUNICATION (`/dashboard/communication/[id]`) | YES | YES (#1782 PersonPresence for permitted counterpart; PlaceTimeStamp per message) | LOCAL | LOCAL | existing `noMessages` kept | YES | restricted chip keeps lock icon + text | none (36 guard tests) | YES | PENDING |
| AGENCY (`/company/partners`) | YES | YES (#1783 PersonPresence rows, PlaceTimeStamp) | render-test (no synthetic agency has workers) | – | YES (honest empty) | labels passed in | – | none | YES | PENDING — Ramūnas/Nonstop role truth (see H) |
| INSTITUTION (`/company/education`) | YES | YES (#1783 learner presences from institution-typed fields; cohort span) | LOCAL | LOCAL | existing empty kept | YES | – | none | YES | PENDING — first real institution (see H) |
| JOBS (`/jobs`, `/jobs/[id]`) + `/oauth/consent` | YES | READY, **RED-gated** (#1786, two waivers) | LOCAL | LOCAL | n/a (52 594 real vacancies) | YES | – | none | NO (waiver) | – |
| LANDING (`/`) | YES | YES (#1784: chain wears the evidence diamond; freeze baseline regenerated with note) | LOCAL | LOCAL | n/a | YES | unchanged | none (landing guards green) | YES | – |

## C. CONNECTED WORK WORLD

| Edge | State |
|---|---|
| CHAT ↔ JOURNAL | EXISTING (log-via-chat, chat journal answers) — untouched; journal now reads as the same spine the Context Panel history draws |
| CHAT ↔ DEMAND | EXISTING (opportunities result → `openEntity` → Context Panel) — walked: QA worker's opportunities are EXTERNAL vacancies only, so no internal-demand entity opened; populated history spine proven by rendered DOM |
| CHAT ↔ MAP | EXISTING (World State map) — legend now states country-level precision with the same chip as `/market-map` |
| CHAT ↔ FIELD | EXISTING (chat chips → operations page) — untouched |
| CHAT ↔ CALENDAR | EXISTING (planning links from chat/journal) — untouched |
| DEMAND → PEOPLE/CAPACITY | ONE band: demand row (#1775) and Field (#1779) now use the same `CapacityBand` |
| DEMAND → MAP | EXISTING world layer; rows carry precision (#1780) |
| DEMAND → FIELD | EXISTING (project field slots = work without a person) — now drawn as capacity |
| DEMAND → CALENDAR | EXISTING (bookings/projects as PLANNED/COMMITTED rows) — now labelled |
| WORK/JOURNAL → EVIDENCE | ONE rule: `evidenceStandingOfVerification` — manager confirmation = ORGANIZATION_ATTESTED (champagne), never green |
| EVIDENCE → IDENTITY | EXISTING (#1774/#1776) + #1785 history spine visible on arrival |
| WORK → CALENDAR/HISTORY | NEW: the 800 h period record draws on the month view as a DERIVED band (#1778) — never a day item |

Nothing was manufactured to satisfy a test: every edge above is either an
existing relationship now wearing the grammar, or a rendered-DOM/real-data
proof of a new derived view.

## D. 800 H

| | |
|---|---|
| canonical record | ONE (`organization_evidence_records`, SELF_ATTESTED) |
| total | 800.00 |
| period | 2025-06-01 → 2025-11-30 |
| projection | 133.34 · 133.34 · 133.33 · 133.33 · 133.33 · 133.33 (`projectPeriodAggregateByMonth`) |
| sum | 800.00 (pinned by `period-projection.test.ts`, `planning-derived-period-render.test.ts`) |
| derived label | "Derived equal monthly share · not source days" (rendered on profile AND on the calendar month view) |
| fake days | NO — the calendar never turns the period into day items (guarded) |
| PeriodBand | deployed (#1776); now also on `/dashboard/planning?view=month` for months Jun–Nov 2025 with the active month emphasised (#1778) |
| production proof | PRODUCTION_DEPLOYED; PRODUCTION_BROWSER_PROVEN = Donatas's own month view (his account is not agent-mintable) |

## E. QUALITY

| | |
|---|---|
| ANTI_AI_SLOP | grammar is people·work·time·place·capacity·evidence on every touched surface; no card walls added; Field tokens deliberately kept on the player-identity tile (no second person grammar) |
| DESIGN_TOKEN_CONFORMANCE | `design-token-classes` + `premium-design-pass` green on every PR; **and** 7 files carrying dead shadcn classes (compiled to NO CSS) were found and fixed (#1784 three files; #1786 jobs + consent) — guarded against return |
| UNKNOWN_NOT_ZERO | calendar UNKNOWN chip for undated rows; identity "no start date"; map "country only"; PlacePrecision `unknown` kind exists for future rows |
| EVIDENCE_NOT_VERIFICATION | enforced once in `evidenceVariant`; journal bridge guarded so NO verification state maps to green |
| LT / EN / RU | walked on every surface; all new keys present; silent-trust + untranslated-ratchet guards passed (two label rewrites recorded in the PRs) |
| FULL_LOCALE_PARITY | LT/EN parity guard green; new keys added to every locale that carries the namespace (5 active for planning/journal/marketMap; 11 root for demand) |
| DESKTOP / MOBILE | 1360 px + 390 px on every walked surface; no overflow observed |
| ZERO_DATA | journal (QA earlier), calendar month (no period record), field (0 people), identity (no history), agency (render test), map (existing honest states) |
| A11Y | no new colour-only state (every chip carries text); Context Panel stays non-modal; Field P4 targets kept; **not** a full WCAG pass — see K for what remains |
| VISUAL_REGRESSION | 9 new guard files (`work-world-*.test.ts`, `planning-derived-period-render`, `agency-worker-presence-render`); no existing guard weakened except `message-counterpart-restricted` **widened** to accept the presence form (same field, same fallback) |
| PERFORMANCE | one new bounded read (calendar month: `listMyOrganizationEvidence`, limit 100, own links only); zero duplicate fetches elsewhere |

## F. CAPABILITY LOSS

CHAT_FIRST NO · MAP NO · JOURNAL NO · CALENDAR NO · FIELD NO · IDENTITY NO ·
PEOPLE NO · DEMAND NO · COMMUNICATION NO · AGENCY NO · INSTITUTION NO · JOBS NO.

Reachability of every protected surface is unchanged (primary nav ids
pinned by `action-first-ia`; `protected-surface-inventory` unchanged).

## G. SECURITY

schema changes = NONE · RLS changes = NONE · authority changes = NONE ·
privacy changes = NONE (restricted counterpart stays locked; scouting
anonymisation untouched; learner presence built only from institution-typed
fields; no coordinates inferred) · RED owner decisions = ONE (J).

Walk hygiene: every minted session (QA identity via the allow-listed script;
synthetic `e2e-*` identities via the same magic-link mechanics in a scratch
script) was deleted after use; no production rows were written by any walk.

## H. REAL USERS

| Actor | ready | human action |
|---|---|---|
| WORKER (Donatas) | YES | open `/dashboard/profile` — history, evidence and opportunities are now on arrival; open `/dashboard/planning?view=month&date=2025-09-01` — the 800 h band with September's 133.33 h |
| EMPLOYER (Donatas / Klinkerio) | YES | `/dashboard/projects/<id>/operations` — the people-vs-open-slots band; demand → interested workers unchanged |
| AGENCY (Nonstop) | YES (technically) | Ramūnas confirms whether Nonstop should operate as a staffing agency (roles are inverted in prod: LM = staffing_agency, Nonstop = construction) |
| INSTITUTION | YES (internal) | first real training organisation nomination + validation |

## I. RELEASE

WORKER_EXTERNAL_INVITE = READY · EMPLOYER_EXTERNAL_INVITE = READY ·
AGENCY_EXTERNAL_INVITE = READY (role truth pending, H) ·
INSTITUTION_REAL_VALIDATION = PENDING (human) ·
FOUR_ROLE_CONTROLLED_LAUNCH_READY = **YES** (unchanged by this run).

## J. OWNER DECISIONS

1. **Two PR-scoped waivers must name #1786.** Both live in
   `.github/scripts/owner-waivers.mjs` and are expanded only by verbatim
   owner approval (#1649 note: "NOT general authority to self-approve
   future waivers"):
   - `public-acquisition-route-jobs` (covers 1184, 1193, 1203, 1208, 1255,
     1649) — #1786 fixes the dead classes on `/jobs`, `/jobs/[id]` and the
     vacancy card, and adds the card stamp + detail place precision.
   - `oauth-consent-auth-infrastructure` (covers 1347) — #1786 fixes the
     consent page's primary button, which had **no background** (dead
     `bg-primary`).
   Minimum decision (one line): *"I approve adding ONLY PR 1786 to the
   existing `public-acquisition-route-jobs` and
   `oauth-consent-auth-infrastructure` waiver `pullRequests` lists."*
   Safe options: (a) approve → number added to both lists, un-draft,
   auto-merge; (b) decline → `/jobs` keeps undefined secondary-text colour
   and the consent primary button stays background-less. Recommended: (a).
   The waiver file is not touched until approval.

No other owner decision was needed in this run.

## K. HUMAN WALK (Donatas, shortest path, product language)

1. Sign in → **Profile**. Without opening anything: you should see your
   organisation history as a line of diamonds (where, for whom, when), the
   evidence line, and your opportunities. The 800 h record reads as a
   six-month ribbon — 133.34 · 133.34 · 133.33 × 4 — marked "derived, not
   source days".
2. **Calendar → Month → go back to September 2025.** Under the grid: the
   same 800 h ribbon with September highlighted and "133.33 h this month
   (derived)". Go to any 2026 month: no ribbon (nothing to derive).
3. **Calendar → Week (a week with journal entries).** Every row carries a
   small label: ĮVYKO for journal work, ĮSIPAREIGOTA for accepted work,
   PLANUOTA for the rest, BE DATOS for undated.
4. **Journal.** Each day is a line of diamonds; every entry carries a
   standing chip — cyan "SAVO ĮRAŠAS" for your own record, champagne
   "VADOVO PATVIRTINTA" if a manager confirmed. Never green.
5. **Map.** Each place in the list says how precisely it is known:
   MIESTAS (stated) or TIK ŠALIS (approximate).
6. **A project → Operations.** Under "People": one band — people on the
   project vs slots without a person.
7. **Messages → any thread.** The other person appears as a presence
   (initial tile + name), never as an e-mail.
8. Say what feels wrong. REAL HUMAN OBSERVATION > any written pass above.

---

Continuation state for the next agent session:
`~/.claude/projects/.../memory/propagation-continuation-state.md`.
