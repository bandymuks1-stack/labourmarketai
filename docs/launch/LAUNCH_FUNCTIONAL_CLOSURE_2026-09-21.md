# Launch functional closure — owner-away pass (2026-09-21)

Continues `LAUNCH_COMPLETION_2026-09-20_CHECKPOINT.md` and
`AUTH_SOCIAL_LOGIN_CLOSURE_2026-09-21.md`; nothing recorded there is superseded.
Scope rule of this pass: no candidate shortlist / matching / candidate-card /
avatar UI (another team owns it); no OAuth change; no redesign; no new
dependency; no pricing; no owner-gated decision taken.

Baseline at start: main = production = `ef862d7a` (health ok, dub1, auth+db ok),
migration ledger 300 = repo (last `20260920185851`). Everything below was
executed against **production** with the allowlisted synthetic identities only
(`qa.worker+goal3`, `e2e-walker`, `e2e-timing`, `e2e-learner`, `qa.manager+multiw`,
`e2e-outsider`) — read-only except the QA worker's OWN rows (one journal entry
dated 2026-09-15, one availability round-trip, notification read markers).
Every RLS mutation probe ran inside a DO block aborted by RAISE (zero residue).

Legend: **IMPLEMENTED** = code merged · **PRODUCTION_PROVEN** = walked on the
deployed build with DB read-back · **HUMAN_PROOF_REQUIRED** = needs a real
person / real account · **BLOCKED** = external or owner gate.

## 0. Social OAuth — closed

`FACEBOOK_PUBLIC_E2E_PASS` recorded (Meta app `1088055617411429` approved +
Published, public production login returned with the correct profile name).
LinkedIn OIDC PRODUCTION_PROVEN, Google PRODUCTION_PROVEN. Not touched.

## 1. Worker E2E (production, QA worker, build `ef862d7a`)

| step | state | evidence |
|---|---|---|
| registration / onboarding | PRODUCTION_PROVEN (prior: 2026-09-21 magic-link callback walk, 2026-09-04 onboarding walk) | not re-run — no new synthetic identity was created |
| professional profile | PRODUCTION_PROVEN | `/lt/dashboard/profile` h1 "Mano profilis"; identity card, readiness steps, skills 9/9 journal-backed; **one defect found** (§5 D-1) |
| Work Journal → work entry / evidence | **PRODUCTION_PROVEN (write)** | chat `?ask=1` → "noriu užrašyti darbą" → inline flow → save → confirm; row `95cf970b` `hybrid`/`lt`, dated 2026-09-15 (`work_date` metric), `quantity = 6 square_meters` (ai_extracted), `pipeline_version 2`, unresolved fragment recorded honestly; visible on `/lt/dashboard/journal` |
| skills / ESCO projection | PRODUCTION_PROVEN (partial by design) | `journal_entry_skills` → `tiling` linked from the entry; `skills.esco_uri` NULL for tiling (ESCO bridge covers 31/161 skills — known, owner-gated #1355 scope) |
| availability | **PRODUCTION_PROVEN (write)** + **defect** | readiness step "Kada galite pradėti?" → `#cv-availability` opens the details bar → editor → `available` → DB `workers.availability_status = available` (18:17:03 UTC), readiness strip `ready`, step `data-done=true`. Then "Nenurodyta" + save → "Išsaugota" but DB still `available` (§5 D-5, fixed) |
| job discovery | PRODUCTION_PROVEN (read) | `/lt/dashboard/opportunities` 200; board RPC `list_open_demand_for_workers` as the QA worker → 7 rows, all `company_request/submitted`, 0 closed, 0 drafts, 0 `agency_offer` |
| application / interest | HUMAN_PROOF_REQUIRED for this pass | the 7 open needs belong to REAL organizations — an interest signal from a synthetic worker would notify a real employer; loop already PRODUCTION_PROVEN 2026-09-17 (#1760) |
| messages | PRODUCTION_PROVEN (read) | `/lt/dashboard/communication` 200 "Mano pranešimai"; inbox honest on empty |
| notifications | **PRODUCTION_PROVEN (write)** | bell → 3 `weekly_digest` rows → "Pažymėti visus skaitytais" → DB `read_at = 17:57:13 UTC` on all 3 (persisted, not optimistic-only) |
| logout / relogin persistence | PRODUCTION_PROVEN (2026-09-21 on `f90f31cc`; the build since is docs-only) | session cookie gone after logout, `next` preserved, locale kept |
| 27 worker routes | PRODUCTION_PROVEN (read) | all 200, no raw i18n keys, no `[EN]`, no uuid in body text, no horizontal scroll; `/dashboard/company` for a worker → `?notice=needs_company_role`; `/dashboard/admin` → bounced |

## 2. Employer E2E outside the candidate panel (E2E Walker owner)

| step | state | evidence |
|---|---|---|
| organization onboarding | PRODUCTION_PROVEN (prior, 2026-09-04) | not re-run |
| workforce need create / edit / close / reopen | PRODUCTION_PROVEN (prior R-15, ledger 20260920051619; hostile+legit contracts) | `/lt/dashboard/company/needs` 200; DB: 11 submitted / 4 closed / 2 draft company requests; closed ones absent from the worker board |
| project / team / work planning | PRODUCTION_PROVEN (read) | `/company/planning` (honest UNKNOWN sentence for an undated commitment), `/projects`, `/projects/<id>/operations` — ended assignment → "0 žmonių projekte", no actionable row; **status leaked as raw `DRAFT`** (§5 D-4, fixed) |
| invitations | PRODUCTION_PROVEN (read) | `/company/people`, `/network` 200; DB: 1 pending invitation past `expires_at` reads `expired` (`computeDisplayStatus`), `list_invitations_for_me_v1` excludes it, accept RPC refuses it |
| messaging | PRODUCTION_PROVEN (read) | `/communication` 200; 5 conversations / 18 messages; 0 revoked participants; on-read translation resolver (stored `translation_status=unavailable` is the legacy column, not consulted) |
| Work Journal / employer confirmation | PRODUCTION_PROVEN (prior #1694 pair walk) | `/inbox`, `/inbox/report` 200 ("Patvirtinti įrašai", "Peržiūros ataskaita") |
| lifecycle persistence | PRODUCTION_PROVEN (DB) | statuses: company_workers 7 active; engagements 84 active; assignments 3 active / 2 ended; projects 9 (all `draft`); memberships 20 active |
| 35 employer routes | PRODUCTION_PROVEN (read) | all 200; `/talent` → dashboard, `/buyer` → `needs_customer_role`; **assets form showed a raw uuid** (§5 D-3, fixed) |

## 3. Agency / Nonstop E2E (E2E Agentūra owner, `e2e-timing`)

| step | state | evidence |
|---|---|---|
| organization context | PRODUCTION_PROVEN | `/company/partners` "Personalo agentūros režimas", `/company/needs` "Jūsų pasiūla ir rinkos poreikiai" (supply direction) |
| worker / client / project relationships | PRODUCTION_PROVEN (read) | connections: Walker `active`, `e2e-chat-client` `pending`; shared request "Suvirintojas"; roster "E2E Worker Two" offerable; offers `declined` + `accepted` |
| permitted cross-org operations | PRODUCTION_PROVEN (RLS) | as the agency: only its own request direct (`bda1abdb`), the shared client request only via RPC; 0 client projects / journal / allocations / bookings |
| isolation — no data leaks | **PRODUCTION_PROVEN** | §9 matrix below |
| offer progress | **defect** | the declined offer wore "REZERVACIJA PRIIMTA" (§5 D-2, fixed) |
| Nonstop real walk | HUMAN_PROOF_REQUIRED | unchanged: `RAMUNAS_NONSTOP_REAL_WALK_2026-09-20.md` |

## 4. Institution / training (E2E Walker UAB = training provider; `e2e-learner`)

| route / mutation | class | evidence |
|---|---|---|
| `/dashboard/company/education` — learners (invited / joined / declined-expired), outcomes gate (≥5 learners, numbers only), programmes (edit), cohorts (create, assign learner), CSV report, add programme, live demand for the programme direction | **LIVE** | rendered with real rows: 1 programme "E2E Pastolininkų kursas", cohort "2026 ruduo", 1 joined learner, `connectedCount` from `engagement_contexts(student, active)` |
| invite students → `join_organization` invitation with `relationship_slug=student` → learner accepts → student engagement | LIVE (PRODUCTION_PROVEN 2026-09-18 I-2 real UI) | DB: 3 invitations (2 accepted by the same learner, 1 expired) |
| learner `/dashboard/learning` | LIVE | review queue empty, auto-confirm OFF (default), honest |
| learner reaching `/dashboard/company/education` | LIVE (guarded) | → `?notice=needs_company_role` |
| Learners join the cohort (journey link) | **NOT_LIVE** (register: BROKEN — learner placement RED) | the institution assigns; the learner cannot self-join |
| Competency → qualification / recognised equivalence; RPL | **NOT_LIVE** (register: BROKEN / NOT_BUILT) | unchanged |
| institution ↔ employer demand hand-off | LIVE read (public demand count per direction), NOT_LIVE write (no employer internship posting exists: 0 of 17 demand rows declare a type) | unchanged |
| minor: the learners list is an invitation list — a person who accepted two invitations appears twice while the count says 1 joined | truthful (two invitations) but confusing | not changed; noted for the copy owner |

## 5. Defects found → fixed in this pass (PR #1821, GREEN, no migration — MERGED)

| # | defect (production, reproduced) | root cause | fix | regression test |
|---|---|---|---|---|
| **D-1** | every worker's profile said "Jūsų komandų dabar nepavyko nuskaityti" and the R-9 "My teams" withdrawal never rendered (QA worker AND e2e-learner) | `lib/company/team-links.ts` read the LEGACY `agency_workers` table; in production `agencies` / `agency_workers` carry **no grant at all** for `authenticated` (`relacl` null / postgres-only) → PostgREST 42501 on every read → the whole result became `error` | the live `company_workers` source decides the result; a 42501/42P01 answer from the legacy source contributes nothing (0 rows in production, agencies are `companies.company_type=staffing_agency` since Direction A) | `lib/company/team-links.test.ts` (7) |
| **D-2** | agency partners page: the DECLINED offer for E2E Worker Two showed "REZERVACIJA PRIIMTA · KLIENTAS ATMETĖ" | `list_agency_offer_progress_v1` derives `review_stage` per (request, worker) pair and ignores `o.status`; the accepted second offer's booking leaked onto the first | `effectiveReviewStage(offerStatus, reviewStage)`: declined → `rejected`, withdrawn → `offered`, open/accepted keep the derived stage; row carries `data-stage` | `lib/agency/bridge-model.test.ts` (+3) |
| **D-3** | `/dashboard/assets` "add asset" organization selector rendered `12009546-6707-…` (a nameless organization) | `assets.ts` fell back to the raw id when `display_name` was null (same for workers) | `display_name ?? legal_name ?? null`; UI says "Organizacija be pavadinimo" / "Darbuotojas be vardo" (6 active locales) | type change (`name: string \| null`) + typecheck |
| **D-4** | `/lt/dashboard/projects/<id>/operations` "BŪSENA: DRAFT" — raw English enum on a Lithuanian page | status rendered as stored | rendered through the existing `projects.map.status.*` label set (`isProjectStatus` guard; unknown values shown as stored, never invented) | typecheck; existing label parity |
| **D-5** | work-card editor: choosing "Nenurodyta" over a saved availability reports "Išsaugota" while the row keeps `available` (`updated_at` bumped) — a control that visually succeeds and does not persist | `save_worker_card` coalesces every null parameter (null = keep); no live write path can clear | the empty choice is offered only while nothing is saved; once anything is saved the form says "an empty field keeps what is saved" (6 locales). Clearing = RED follow-up (§7) | `lib/guards/work-card-editor-keep-only.test.ts` |
| **D-6** | `/lt|ru|pl/legal/data-deletion` served hard-coded English (title included) inside a localized site — the public Meta data-deletion URL | #1819 shipped the page without catalog keys | `legal.dataDeletion.*` in the 6 active catalogs; page reads the namespace; same facts (controller, retention, process) | i18n parity + static key-resolution guards |

Not defects (verified): notification `dedupe_key` "duplicates" are one key per recipient (unique index `(recipient, dedupe_key)`); `hreflang` present on every public page (`hrefLang`); `/dashboard/notifications` is not a route by design (bell + `/dashboard/activity`); the profile's `#cv-details` closed bar opens on every deep link (`DetailsHashOpener`), so the work-card editor IS reachable; planning "1 iš jų nepavyko suskaičiuoti" is the honest UNKNOWN for an undated commitment.

## 6. DB / RLS proof (production, read-only or aborted DO blocks)

All 197 public tables have RLS enabled. Actor matrix (`set_config('role','authenticated')` + JWT claims):

| actor | sees | cannot see / cannot do |
|---|---|---|
| `e2e-outsider` (worker, no org) | own profile, own worker, own notification | 0 journal / requests / roster / conversations / messages / memberships / projects / bookings / offers / invitations / org evidence / allocations |
| `qa.manager+multiw` (manager of Alfa, owner of Gama) | Alfa+Gama memberships and engagements only | 0 rows of E2E Walker UAB (2 projects, 1 request, 5 allocations, 3 invitations, 3 engagements, 1 booking); UPDATE projects / requests / profiles / notifications of others → 0 rows; UPDATE memberships (self-promote) → **42501** (no grant, RPC-only); INSERT allocation into Walker → **42501**; UPDATE workers / journal / companies / invitations / bookings of others → **42501**; DELETE others' messages → **42501** |
| `qa.worker+goal3` | own 22 (+1) journal entries only | 0 other workers' journal / roster / bookings / allocations / org evidence / messages; UPDATE others' journal → 42501; INSERT customer_requests / projects → 42501; UPDATE roster / bookings → 42501; `demand_interest_signals` update → 0 rows |
| `e2e-timing` (agency) | own connections / shares / offers, own request, own roster worker; workers that are discoverable (consent) or on its roster | 0 client projects / journal / allocations / bookings / invitations; the shared client request only through the bridge RPC |
| anon | (prior gate) 42501 on every SECDEF | unchanged |

Known-open, owner-gated (NOT fixed here, by rule): `companies_select = auth.uid() is not null` — every authenticated person can read all 15 company rows incl. `contact_email` / `contact_phone` / `vat_number` (K2-1, RED draft #1430); a `manager` membership is not `owner/admin` for `owns_company` (ORG-2 owner decision) so a manager reads 0 projects directly. Neither was weakened or "fixed".

## 7. RED packet added by this pass (nothing applied; one sentence each)

| # | decision | why RED | smallest change |
|---|---|---|---|
| **R-P1** | "Apply `list_agency_offer_progress_v2`: derive `review_stage` from the offer's own `booking_id` / `status`, not from the (request, worker) pair." | SECDEF body replace | `case when o.status='declined' then 'rejected' when o.status='withdrawn' then 'offered' when exists (booking b where b.id=o.booking_id and b.status='accepted') …`; the UI already applies the same rule client-side (D-2) |
| **R-P2** | "Apply `save_worker_card_v2` with explicit clear flags (`p_clear_availability`, `p_clear_available_from`, `p_clear_salary`, `p_clear_location`)." | SECDEF signature change | until then the editor is honest (D-5); the chat executor keeps "blank = keep" by design |
| **R-P3** | "Grant `SELECT` on `agencies` / `agency_workers` to `authenticated` (legacy key space) — OR retire the four legacy readers (`start/page.tsx`, `journal/page.tsx:441`, `instructions.ts:160`, `agency/agency-workers.ts`)." | grant widening (migration-safety) vs. code deletion of a path that has 0 production rows | recommended: **retire the readers** (GREEN, next pass) — the legacy space is dead (`agency_workers` 0 rows, 3 stale `agencies` rows); no grant needed |
| unchanged | W-1, R-B #1813, ARCH-4 v2 #1815, COMM-1 #1816, CAL-7, and the §O list | — | — |

## 8. Locale / mobile / PWA

- Public sweep `/lt /en /ru /pl` × 15 routes: all 200, `<html lang>` correct per route, 404 localized, no raw keys, no `[EN]`, no uuid; canonical + 6 hreflang + x-default on every page; `/` → 307 `/lt`.
- Authenticated: `/ru/dashboard`, `/en/dashboard/profile`, `/pl/dashboard/journal`, `/ru/dashboard/company/needs`, `/en/dashboard/company` all localized; locale kept through auth callback (2026-09-21 proof).
- Static guard `i18n-key-resolution-static` green; parity guard green; i18n-debt within baseline (de/nl/pl/ru = 0).
- Mixed-language surfaces found and fixed: D-4 (raw enum), D-6 (English legal page).
- 375 px: 12 worker routes + login + jobs — no horizontal scroll; Today renders the three doors; dialogs' focus hook unchanged (#1812).
- PWA: manifest 200 (`standalone`, id `/`, 4 PNG icons + maskable + svg all 200), `apple-touch-icon` via Next `apple-icon.png` (180×180), theme-color + viewport-fit=cover; no service worker by design (no offline claim).
- Console: only the CSP **Report-Only** notice `upgrade-insecure-requests is ignored` on every page (`next.config.ts:82`) — harmless noise; drop the directive from the report-only policy when CSP is enforced (GREEN follow-up, not done: policy change).

## 9. Communication audit

- 25 notification rows / 22 types registered; 3 `weekly_digest` keys reused across recipients (not duplicates); 0 same-recipient-type-entity duplicates within a minute; mark-read persists (proven).
- Invitations: `pending/not_sent` 3, `accepted/not_sent` 2 — `delivery_status=not_sent` because `INVITE_EMAIL_*` is absent (EXTERNAL gate; the product shows copy/share links honestly). 1 expired-pending row reads `expired` everywhere.
- Conversations: RLS participant-only; author = `auth.uid()` on insert; 0 revoked participants; translation on read (`translate_message` runs still 0 — no cross-language thread exists → HUMAN_PROOF_REQUIRED for the round-trip).
- No uncontrolled outreach was sent; no interest signal was raised against a real organization.

## 10. Receipt

- **PRODUCTION_SHA**: start `ef862d7a`; after this pass **`051c825d`** (= main = production).
- **DEPLOYMENT**: Vercel production, dub1; `/api/health` → `build: 051c825d`, auth + db ok (19:02 UTC).
- **FLOWS_PROVEN** (this pass, production): worker journal write + evidence + skill projection; availability write + readiness update; notification read-marker persistence; 27 worker / 35 employer / 10 agency / 5 learner routes read-proven; board lifecycle (closed/draft/agency_offer excluded); institution surface LIVE inventory; RLS actor matrix.
- **DEFECTS_FOUND**: 6 (D-1…D-6) + 3 RED-class root causes (R-P1…R-P3).
- **FIXES_MERGED**: D-1…D-6 — PR [#1821](https://github.com/bandymuks1-stack/labourmarketai/pull/1821), squash `051c825d`, auto-merged after `quality`, `migration-safety`, `e2e-smoke`, `mobile`, CodeQL green; production-proven (§11).
- **DB/RLS_PROOF**: §6.
- **LIFECYCLE_PROOF**: board excludes closed/draft/supply; ended assignment not actionable, row preserved; expired invitation not acceptable, row preserved; closed need keeps its candidates door (history) but no offer control.
- **LOCALE/MOBILE/PWA**: §8.
- **SECURITY**: boundaries hold on read and write for worker / manager / agency / outsider; two known-open owner-gated items unchanged (K2-1, ORG-2).
- **HUMAN_PROOF_REQUIRED**: the 12-step acceptance walk (checkpoint §6); Nonstop real walk; a real cross-language thread (ka/uk); worker interest on a real need; social login by a NEW public person on each provider (owner did Facebook; Google/LinkedIn proven earlier).
- **OWNER_DECISIONS_REQUIRED**: checkpoint §4 packet (W-1, R-B, ARCH-4 v2, COMM-1, CAL-7) + R-P1, R-P2, R-P3 above; K2-1 (#1430); ORG-2.
- **EXTERNAL_BLOCKERS**: `INVITE_EMAIL_*` (e-mail channel), Apple / Google Play / EAS accounts, store listings, social profile URLs, PL consent legal text (unchanged from checkpoint §5).
- **EXACT_NEXT_OWNER_WALK_STEP**: open `https://labourmarket.ai/lt/dashboard/profile` as Donatas — the "MANO KOMANDOS" section must no longer say "nepavyko nuskaityti"; if he is on a roster the withdrawal control is visible. Then checkpoint §6 step 1.

## 11. Merge / deploy record — PRODUCTION_PROVEN on `051c825d`

- PR #1821 merged 2026-09-21 ~18:55 UTC (squash `051c825d`); Vercel production served
  `build: 051c825d` by 19:02 UTC (health ok, dub1).
- **D-1** QA worker `/lt/dashboard/profile`: `team-links-error` 0, no "nepavyko nuskaityti";
  **e2e-worker2** (two active roster links): `team-links` section rendered with 2 rows
  (E2E Agentūra UAB since 2026-09-04, E2E Walker UAB since 2026-09-02), each with the R-9
  withdrawal control "Čia nebedirbu — išeiti iš komandos" — the first time this control was
  reachable on production.
- **D-2** agency partners (`e2e-timing`): rows `data-stage=accepted` "REZERVACIJA PRIIMTA ·
  KLIENTAS PRIĖMĖ" and `data-stage=rejected` "ATMESTA · KLIENTAS ATMETĖ".
- **D-4** `/lt/dashboard/projects/d9af86de…/operations`: "BŪSENA: JUODRAŠTIS".
- **D-6** `/lt` "Paskyros ir duomenų ištrynimas", `/ru` "Удаление аккаунта и данных",
  `/pl` "Usunięcie konta i danych", `/en` unchanged — title and h1.
- D-3 / D-5 are proven by their guards and typecheck (no nameless organization exists on a
  production surface the synthetic identities can reach after the shell org is named; the
  work-card keep-only hint renders once anything is saved — QA worker's row carries
  `availability_status = available` from this pass's walk, so the hint is live for it).
