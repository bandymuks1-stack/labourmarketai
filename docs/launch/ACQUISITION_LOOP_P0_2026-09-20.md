# P0 — DEMAND → JOB → DISTRIBUTION → REGISTRATION → MATCH → RETENTION LOOP

Date: 2026-09-20. Owner directive: one canonical commercial acquisition loop, plus
the same-day scope update for personal-membership Facebook-group distribution.
This document is the CURRENT FLOW TRACE (§22 of the directive), the contracts
(§25 E–N), the GREEN work shipped, the ONE consolidated RED owner packet, the
funnel measurement, the first welder pilot readiness and the production proof.

Rule kept throughout: **UNKNOWN ≠ FAILED**, no invented employer, salary,
headcount, location, date, certificate, visa, urgency; no second jobs table,
demand model, matching engine, notification system, publisher, scheduler,
worker profile or consent model. Agentai OS = discovery + distribution;
LabourMarket.ai = the canonical destination.

---

## A. CURRENT FLOW FOUND (traced 2026-09-20, five parallel traces + production reads)

| Edge | Found | Class |
|---|---|---|
| DEMAND (real employer need) | Agentai discovers from approved lawful sources (fail-closed approval gate, provenance per record). LabourMarket holds **52,073 live public vacancies**, all Arbetsförmedlingen (SE); **399 live welder ads, 143 employers, 21 regions** (276 mention MIG/MAG, 55 mention certificates; 0 state a start date; 0 state pay). `customer_requests` holds ONE welder demand (LT, 2026-09-04, submitted). | EXISTING_AND_WORKING |
| DEMAND INTELLIGENCE (profession × market) | Agentai `demand-aggregate.ts` + `signal-variant-plan.ts` (COUNTRY_OCCUPATION scope; receipt of 2026-09-18: SE 346 adverts / 203 employers, Svetsare 35). Never merges employers into one fictional job. | EXISTING_AND_WORKING |
| LABOURMARKET.AI JOB | The canonical job for an external ad IS the `public_vacancies` row and its public page `/[locale]/jobs/[id]`. `public_vacancies` never becomes a `customer_requests` row (doctrine). A first-party LM/Nonstop recruiting job needs a real client relationship; no `LabourMarket` organization row exists in production. | EXISTING_AND_WORKING (external) / HUMAN_VALIDATION_ONLY (first-party) |
| JOB LIFETIME | `public_vacancies`: `published_at`, `expires_at` (publisher-stated), `is_active`, `lifecycle`; expiry applied at read time; deactivation never deletion. `customer_requests`: six-state status, R-15 close/reopen RPCs, **no expiry column, no 30-day rule**. | EXISTING (external) / RED_OWNER_GATE (first-party 30-day) |
| PUBLIC JOB (anonymous) | `get_public_vacancy_preview_v1` (SECDEF): occupation, working time, positions, published date; **title, employer, country, region, city, description, apply URL withheld** (owner directive 2026-08-24). Board `/jobs?profession=welder` **times out cold in production** (8.3 s under `anon`, 3 s statement timeout; 12 timeouts in the last 24 h). | GREEN_FIX (page) / RED_OWNER_GATE (country) / RED (search fn) |
| SOCIAL DISTRIBUTION | Agentai: 8-language composer, 8 honesty rules (`campaign-qa`), presentation boundary, ONE gated Facebook Page publisher (dry-run default, `--publish`, receipts), community-group register (39 rows) + manual share queue, LT worker acquisition BLOCKED. **Every link pointed at the locale root** — no job URL builder existed. | GREEN_CONNECT |
| AUTH → RETURN URL | `?next=` sanitiser (`getSafeReturnPath`), password + Google OAuth callback, e-mail confirmation, onboarding completion all honour `next`; the job page's own CTAs carried it. Only hole: `dashboard/layout.tsx` bare `/onboarding` (not on the job path). | EXISTING_AND_WORKING |
| ONBOARDING | Two-step wizard; job URL wins over the role destination. | EXISTING_AND_WORKING |
| MATCH (requirement by requirement) | ONE engine `matchWorkerToNeed` v2.2: 20 criteria, outcomes `met / not_met / negotiable / unknown`, hard/weighted/negotiable classes, `missingFacts` per side; `deriveFitBand` → strong / possible / missing_requirement / conflict / not_assessed. Rendered on the board (external rows included) — **absent on the public job page**. | GREEN_CONNECT |
| INTEREST | `expressVacancyInterestCore` → `demand_interest_signals` (vacancy source) → `commercial_handoffs` → Nonstop dispatcher (LIVE since 2026-09-17, R-14 consent gate). Control mounted only on the board. | GREEN_CONNECT |
| ALTERNATIVES | None: a non-fit terminated in the band + why line. | GREEN_CONNECT |
| CONTINUOUS MATCHING CONSENT | No existing consent means "compare me with other employers' jobs and notify me": discoverability (passive), employer disclosure (per context), partner supply representation (outbound feed), `worker-broader-search-v1` (partner transfer), proposition consent (per vacancy). Doctrine forbids widening a consent past the sentence read. | RED_OWNER_GATE |
| JOURNAL | Journal → recognised skills → matchable: working. Weekly digest `journal` focus linked the BOARD, e-mail subject dropped the focus and was LT-only. No "did you work this week" reminder for people who stopped logging. | GREEN_FIX (link/e-mail) / RED (reminder = new digest audience) |
| NOTIFICATION → EXACT JOB | `notification_events` hrefs are per ENTITY TYPE only; `SAFE_METADATA_KEYS` = 4 keys, no id; no new-vacancy trigger, no cron; `saved_search_match` fires only when the worker renders the board. | RED_OWNER_GATE |
| FUNNEL MEASUREMENT | `pilot_events` (anon insert allowed, admin read, 300/min ceiling), first-touch `utm_*` in localStorage merged into conversion events, `cta_clicked` with `cta_id`, auth/onboarding/interest events live. **No job impression, job open, return-to-job, compared, missing-info events.** | GREEN_CONNECT |

Production facts read 2026-09-20 (read-only SQL): 24 real workers, 0 real welders (both `welder` rows are fixtures); `profiles.locale` = lt 57 / en 1 / ru 1; notification kinds live: weekly_digest 17, demand_interest_expressed 4, invitation_accepted 1; Nonstop = `companies 048aa7e1` (construction, verified) + two `organizations` rows; no LabourMarket organization.

---

## B. REUSED CANONICAL COMPONENTS (nothing duplicated)

`public_vacancies` + `/[locale]/jobs/[id]` (the job), `getSafeReturnPath` + auth callback (return), `buildOwnWorkerContext` (subject), `buildNeedFromVacancy` (need), `matchWorkerToNeed` (engine), `deriveFitBand` / `whyCodesFor` / `MatchTierExplanation` / `FitBandChip` (rendering), `VacancyInterestButton` + `expressVacancyInterestCore` + `commercial_handoffs` (interest), `searchPublicVacancies` + `compareMatches` (alternatives), `pilot_events` + `trackFunnel` / `TelemetryView` / `TrackedCta` + first-touch attribution (measurement), `notificationEventHref` / `notificationRenderedType` / `maybeDispatchNotificationEmail` (retention), and in Agentai `campaign-url.ts`, `community-group-registry.ts`, `manual-share-queue.ts`, `campaign-qa.ts`, `publication-gate.ts`, `group-share-copy.ts` labels.

---

## C. GREEN FIXES / CONNECTIONS SHIPPED

LabourMarket.ai (branch `feat/cc/acquisition-loop-p0`):

1. **Public job page, member half** (`app/[locale]/(marketing)/jobs/[id]/page.tsx`, new `lib/opportunities/public-job-reading.ts`): requirement-by-requirement comparison (band chip, one honest band sentence in 5 locales, hard/weighted/negotiable tiers, facts not yet provided, the ad's own unknowns), the EXISTING "I want this job" control with the R-14 proposition-consent question, up to 3 other live ads of the same profession judged by the same engine ("closer on known requirements" only when the band is stronger), a non-matchable member sent to the profile, a member whose ad closed told the AD changed (never "create an account"), an unexpected member-read error rendered as the anonymous half.
2. **JOB A → REGISTER → JOB A made measurable**: the page's own `next` is `/{locale}/jobs/{id}?via=auth`; the sanitiser keeps it; the return render shows a note and emits `job_returned_after_auth`.
3. **Funnel**: six new registered events (`job_board_viewed`, `job_opened`, `job_returned_after_auth`, `job_compared`, `job_missing_info_shown`, `job_alternatives_shown`), emitted anonymous-safe with the opaque vacancy id; registration CTAs tracked (`public_job_signup` / `public_job_login`) with first-touch attribution; admin funnel stages extended. No schema change (`pilot_events.event_name` has no CHECK).
4. **Retention loop**: journal-focused digest now links `/dashboard/journal`; the e-mail renders the SAME focused key and link as the bell and in the recipient's stored `profiles.locale`.
5. **JOB → SOCIAL boundary export** (`apps/web/scripts/job-campaign-facts.ts`): the campaign-authorized fields of one job as JSON (+ an `INTERNAL_ONLY_NEVER_PUBLISH` evidence block for the publication gate only). Run 2026-09-20 against production for the live welder ad `e3ec6c1e` (Skåne, 1 position, full time, expires 2026-10-18).
6. Guard `lib/guards/public-job-acquisition-loop.test.ts` (20 tests); typecheck, lint (0 errors), full unit suite 23,952 passed (the 4 failures are pre-existing local classes: booking guard, R-15 CRLF text guard, DOCX extraction, and one language-marking count that this slice corrected).

Agentai OS (branch `feat/cc/job-campaign-group-packets`):

7. `campaign-url.ts`: exact-job destinations — `labourMarketJobPath(uuid)`, `labourMarketProfessionBoardPath(slug)` (LM catalogue allowlist), a path may carry its own `profession` query, all four utm parameters appended after it; foreign keys, URLs, traversal refused.
8. `community-group-registry.ts`: per-group measured tri-states `alternativeIdentityAllowed`, `anonymousPostAllowed`, `linkAllowed`, `adminApprovalRequired` (+ `identityRulesSourceUrl`), UNKNOWN by default for every existing row; `permittedIdentityFor()` = alias "LabourMarket.ai" where the group permits it → Page where it can post → personal profile only under a per-publication owner allowance → otherwise the questions to verify.
9. `publication-gate.ts`: identity `LABOURMARKET_GROUP_ALIAS`, accepted only on FACEBOOK_GROUP for LABOURMARKET and only with the group's measured `aliasAllowedByGroup`.
10. `manual-share-queue.ts`: a candidate may carry the `REAL_CURRENT_VACANCY` frame with its (internal) evidence.
11. New `job-campaign-packet.ts` + `scripts/distribution/build-job-packets.ts` (`npm run agentai:job-packets -- --facts=…`): READY_TO_POST packets per suitable group — GROUP, WHY, PERMITTED IDENTITY, LANGUAGE, POST COPY (7 languages, rendered only from the export; RU carries "Работа не гарантируется."), ASSET, EXACT JOB URL, CAMPAIGN ID, CONTENT TAG, JOB ID, EXPIRY, ADMIN APPROVAL, HUMAN ACTION; a fact check that refuses invented pay, accommodation, transport, rotation, certificate, visa, urgency, employer name, unknown numbers, derived skills as requirements; refusal states NOT_RELEVANT / VERIFY_GROUP / HUMAN_PUBLICATION_REQUIRED / REFUSED.

---

## D. RED OWNER DECISIONS (one consolidated packet — none resolved by an agent)

| # | Decision | Why RED | Smallest amendment offered |
|---|---|---|---|
| **R-A** | Anonymous campaign landing may show the MARKET (country, optionally region) of a public job. | Owner directive 2026-08-24 withholds country anonymously; today's directive requires "WELDER — SWEDEN → WELDER — SWEDEN". Direct conflict of two owner decisions. Change = SECDEF projection body (`get_public_vacancy_preview_v1`, `search_public_vacancy_previews_v1`) = RED by migration-safety rule g. | Add `country` (and `region`) to the anonymous projection only; keep employer, city, coordinates, title, apply URL, description member-only. Until decided the anonymous page shows the occupation label in the publisher's language and no country. |
| **R-B** | Rewrite `search_public_vacancy_previews_v1` so the profession-filtered board stops timing out. | Cold plan reads ~14.9k pages for 20 welders (generic plan cannot use the profession index behind `p_profession_slug is null OR …`); 8.3 s under `anon` vs 3 s timeout; measured through the shipped function. SECDEF replace = RED (rule g), same class as #1572. | **DRY-RUN PROVEN 2026-09-20 inside `BEGIN … ROLLBACK` on production (zero residue):** plpgsql body branching on the parameters, same signature / ACL / NULL projection / order / limits; welder page **1,333 buffers (was 14,878)**, 518 ms first in-transaction call under `anon`; parity in the same transaction for (welder), (none), (needle), (needle + welder, offset 5): identical 20 ids and identical totals 399 / 52,073 / 399 / 393. Production still holds the `LANGUAGE sql` version. SQL ready to lift into a `-- @human-gate-approved` draft on the owner's word. |
| **R-C** | Continuous cross-employer matching consent + future-match notification + deep link. | No existing consent carries this sentence (doctrine: never widen a consent past the sentence read); notification metadata allowlist has no id; a new-vacancy trigger/cron is a new notification audience. Consent semantics = RED by the directive. | One new `privacy_consent_purposes` row `continuous_opportunity_matching` v1 with the exact sentence ("compare my profile with other employers' opportunities and notify me when a relevant match appears"), grant/withdraw RPCs mirroring discoverability; `notification_events` metadata key `vacancyId` (opaque) so `saved_search_match` / a new `new_match` kind can land on `/jobs/{id}`; a daily cron that evaluates consenting workers against ads published since the last run. |
| **R-D** | LabourMarket.ai / Nonstop as the PUBLISHING/RECRUITING party for a real demand (first-party job). | Requires a real client relationship (none exists in production; the two connection rows are E2E fixtures) and an owner act (LM organization row, staffing_agency switch). Not schema — human. | Until a real client exists the welder pilot uses the external public ad as the canonical job (publisher = public employment source, employer named after registration, LabourMarket.ai = destination, not employer). |
| **R-E** | 30-day lifetime for first-party demand (`customer_requests`). | No expiry column; ACTIVE → EXPIRED needs schema. Only relevant once R-D produces first-party jobs. | `valid_until timestamptz` default `created_at + 30 days`, a read-time liveness rule, re-confirmation sets a new `reconfirmed_at`; never auto-republish. |

Nothing in R-A…R-E was applied, drafted as SQL against production, or worked around.

---

## E–N. CONTRACTS

**E. DEMAND → JOB.** A distributed job is a `public_vacancies` row that is `lifecycle=published`, `is_active`, unexpired, from an approved source, with provenance (`provider_key`, `external_id`, `captured_at`, `attribution_code`). Demand intelligence (N employers need X in market M) may pick the profession and market of a campaign; it never becomes a job. A first-party job requires R-D.

**F. JOB → SOCIAL.** `job-campaign-facts.ts` is the only source a creative system receives: id, path, live, published/expires, source language, occupation label, profession slug, positions, working time, employment form, compensation iff stated, market (country, region), required languages, recognised skill slugs (machine-derived, never requirements), start date iff stated, parties by rule, `notStated` list. Employer name, city, apply URL, description and source names are not in the campaign-visible block. Any generated copy is judged by `checkJobPostAgainstFacts` + `campaign-qa` + the presentation boundary before it can be a packet. Provider-neutral: the export is JSON; ChatGPT or any tool may render from it and is judged the same way.

**Known gap (GREEN_CONNECT, not built):** the gated Facebook **Page** publisher (`facebook-page-operate.ts`) has no job mode — its signal and welcome modes still link the locale root. Today the exact job URL reaches a reader only through the human group packets. Joining the Page publisher to `labourMarketJobPath` is a small follow-up; it was not done because the directive authorises no publishing expansion.

**G. SOCIAL → EXACT JOB.** Every packet link is `https://labourmarket.ai/{reader locale}/jobs/{uuid}?utm_source=facebook&utm_medium=group&utm_campaign={campaign}&utm_content={fbg-job-…}` (or the profession board for a profession-level campaign). Four utm parameters, on its own line, verified verbatim in the text. Locale = the reader's language when the site serves it, else `en` with the reason recorded.

**H. AUTH → SAME JOB RETURN.** `next=/{locale}/jobs/{id}?via=auth` from the page's own CTAs → signup/login (password or Google) → confirmation → onboarding if genuinely new → the same URL. The return render shows "You are back on the job you opened before signing in" and emits `job_returned_after_auth`. A member whose ad closed meanwhile sees "This advertisement is no longer open" and the board.

**I. JOB → REQUIREMENT COMPARISON.** Subject = the person's own rows; need = the ad's stated facts; engine v2.2; band + sentence + tiers (`met` / `not_met` / `negotiable` / `unknown` per criterion) + facts not yet provided + the ad's own unknowns. No percentage, no stars, no score; missing ≠ failed; not assessed ≠ not suitable. A person without a declared profession and skills is sent to the profile (text-first), not shown a fake comparison.

**J. ALTERNATIVE OPPORTUNITY.** Beside any band short of `strong`: up to 3 other live ads of the same profession, one indexed query capped at 12, ranked by the same comparator; "closer on known requirements" only when the band is stronger; never "better for you".

**K. CONTINUOUS MATCH CONSENT.** Not asked today (R-C). No existing structure is reused for it; nobody is silently enrolled.

**L. JOURNAL → FUTURE MATCH.** Journal entries → recognised skills (`work_journal` provenance) → the same subject → the same comparison on the next visit. The weekly journal digest now lands on the journal. A reminder to people who stopped logging is part of R-C (new audience).

**M. NOTIFICATION → EXACT JOB.** Not available today: hrefs are per entity type (R-C names the exact widening).

**N. MULTILINGUAL.** One job row, the publisher's text in the source language (marked `lang` for assistive tech), the page chrome and the comparison in the reader's locale (lt/en/ru/nl/de), campaign copy in en/de/ru/pl/uk/nl/sv from the same facts. Translation of the welder ads is `unavailable` for all 399 (translation column empty) — the title stays Swedish everywhere; that is stated, not hidden. Legal/certificate semantics are never translated into a different qualification (the composer never states certificates at all).

---

## O. FUNNEL MEASUREMENT (first-party `pilot_events`, no new tracking, no PII)

| Step | Event | Present before | Now |
|---|---|---|---|
| JOB_IMPRESSION | `job_board_viewed` (candidate_count, success:false when the board did not answer) | — | ✔ |
| JOB_OPEN | `job_opened` (surface anonymous/member, ref_type public_vacancy, ref_id) | — | ✔ |
| REGISTRATION_CTA | `cta_clicked` cta_id `public_job_signup` / `public_job_login` + first-touch utm | generic | ✔ |
| AUTH_STARTED | `login_started` / `registration_started` / `google_oauth_start` | ✔ | ✔ |
| ACCOUNT_CREATED | `signup_completed` | ✔ | ✔ |
| ONBOARDING_MINIMUM_COMPLETE | `onboarding_completed` | ✔ | ✔ |
| RETURNED_TO_ORIGINAL_JOB | `job_returned_after_auth` | — | ✔ |
| JOB_COMPARED | `job_compared` (result_kind = band, success = matchable) | — | ✔ |
| MISSING_INFO_REQUESTED | `job_missing_info_shown` (unresolved_unknown_count) | chat only | ✔ |
| INTEREST/APPLY | `vacancy_interest_expressed`, `commercial_handoff_created` | ✔ | ✔ |
| ALTERNATIVES | `job_alternatives_shown` | — | ✔ |
| CONTINUOUS_MATCH_CONSENT | — | — | R-C |
| JOURNAL_FIRST_ENTRY | `journal_entry_saved` (first-ness derived in the admin read) | ✔ | ✔ |
| FUTURE_MATCH_NOTIFICATION | — | — | R-C |

Campaign attribution: `utm_source/medium/campaign/content` captured first-touch in the browser and merged into `cta_clicked` and later conversion events; `utm_content` is the Agentai content tag, unique per group × job × language, so "which surface produced a worker, not a click" is answerable from `pilot_events` (admin read, 90-day window, row-cap honesty). Limits stated: first-touch lives in localStorage (cross-device journeys lose it); the read-out is the admin telemetry page / SQL, not an Agentai reader.

---

## P. FIRST WELDER PILOT READINESS

| Requirement | State |
|---|---|
| Real current welder demand | **YES** — 399 live SE ads, 143 employers (Arbetsförmedlingen); pilot job `e3ec6c1e-51d9-47be-81d6-1dce0b5e61e5` (Svetsare, Skåne, expires 2026-10-18); facts exported. |
| Real welder supply already registered | **NO** — 0 real welders in production (2 fixtures). The campaign is what acquires them; no test candidate is manufactured. |
| Canonical LabourMarket.ai job | the external public ad (contract E); first-party = R-D. |
| Exact attributed job link | `npm run agentai:job-packets -- --facts=<export>` builds it per group. |
| Groups | Run 2026-09-20 against the 39-row Agentai register for job `e3ec6c1e`: **1 READY_TO_POST** (`fb-pl-2377036582577847` "PRACA – NORWEGIA – SZWECJA – DANIA – SKANDYNAWIA", Polish, Page identity measured TRUE, admin approval UNKNOWN), **12 VERIFY_GROUP** (Sweden-focused PL/UK/RU/EN groups — the owner answers: alias allowed? Page can post? links allowed? admin approval?), 4 LT groups refused (LT worker acquisition blocked), 9 groups refused for languages the composer does not write (lv/ro/et), 13 NOT_RELEVANT (NL/EE/GE/AZ/EU-only communities do not cover the SE market). Receipt: `runtime/distribution/job-packets/…-lm-job-welder-se-2026-09-e3ec6c1e.json` (gitignored, local). |
| Permitted identity "LabourMarket.ai" | available the moment a group is measured `alternativeIdentityAllowed=TRUE`; otherwise Page or owner allowance. |
| Same-job registration flow | LIVE on production after merge (proof below). |
| Requirement comparison, interest, alternatives | LIVE after merge. |
| Continuous matching consent, future notification | R-C. |
| Anonymous landing says "Sweden" | R-A. Until then the landing shows "Svetsare, manuell" + published date + the locked card. |
| Profession-board link | R-B (times out cold). Use the single-job link. |

---

## Q. SECURITY / PRIVACY

No new table, RPC, policy, grant or secret. Member reads stay under the caller's own client and RLS; the anonymous projection is untouched; the SECDEF functions are untouched (R-A/R-B are decisions, not changes). Telemetry carries only the opaque vacancy id, bounded scalars and first-touch utm; no employer name, no title, no e-mail. The campaign export's internal evidence block is marked and never rendered; the presentation boundary and the fact check prove it. No owner Facebook credential, cookie or session touches either repo; group posting remains a human act; no scraping of private groups; UNKNOWN capabilities are never resolved optimistically. `vibe-sec` checklist: RLS untouched, no outbound send added, no payment path, no migration.

## R. CAPABILITY LOSS

None. Protected surfaces (chat-first, active context, map, journal, calendar, field, communication, evidence, history, matching, people, demand, player identity, agency, institution, public jobs, opportunities, auth, onboarding, multilingual, privacy, consent, company OS) are unchanged; the public job page gained sections and lost none; the board gained one beacon. Question (B): nothing the architecture allowed became impossible — the comparison, interest and alternatives reuse the engine's extension points; the consent and notification designs are named, not foreclosed.

## S. PRODUCTION PROOF

**MERGED AND DEPLOYED (2026-09-20 ~08:05 UTC).** Owner approved the waiver extension verbatim ("I approve adding ONLY PR 1809 to the existing public-acquisition-route-jobs waiver pullRequests list"); PR #1809 squash-merged as `362e28c5` with every check green; `/api/health` reports build `362e28c5`. **Production walk on that build (QA worker, read-only):** identical to the local-build table below — anonymous page carries `next=…%3Fvia%3Dauth`, member render shows the return note, band `missing_requirement`, FITS `country_location`, MISSING availability (worker) / pay (demand), interest control with the R-14 question, three same-profession alternatives, no return note on a plain visit, board `?profession=welder` 20 cards (warm). agentai #774 still awaits the owner's merge (CI billing gate).

**Earlier merge state (2026-09-20 07:40 UTC), kept for the record.** labourmarketai PR #1809: all checks green except `quality`, which stops at the Product gate with the EXPECTED 18 `not waived — pr-not-covered` lines of the `public-acquisition-route-jobs` waiver (6 codes × 3 surfaces; CI run 35495974758 and the local run agree; **zero** findings with any other reason; the A-09 line in the log is the pre-existing excused `/oauth/consent`). Every prior extension of that waiver quotes an owner sentence approving ONE PR number, and #1649's says it is *not* authority to self-approve — so extending it to #1809 is the owner's act. The exact text is prepared (§T.0); auto-merge is armed and will fire on the next green run. agentai PR #774: the private repo's Actions billing gate fails the job in 2 s with no steps; local typecheck + 431 tests green; a direct merge is a review act the owner performs.

**Browser proof against the production database (local `next start` of build `hRqLv-6H0SZpgytN36hbJ` = head `c061a4a2`, Playwright, QA worker `qa.worker+goal3` — a tiler, read-only, 2026-09-20 07:17 UTC):**

| Step | Observed |
|---|---|
| Anonymous `/en/jobs/e3ec6c1e…` | h1 "Svetsare, manuell", published date, locked card; **no comparison**; CTAs `public_job_signup` / `public_job_login` → `/en/auth/signup?next=%2Fen%2Fjobs%2Fe3ec6c1e…%3Fvia%3Dauth` (return path + marker intact). |
| Member `…?via=auth` | h1 = publisher title "Erfaren svetsare till tunga fordon"; return note rendered; band **`missing_requirement`**; why line: "lacks skills the ad requires · a different profession than yours · requirements were recognized from the ad's text, not yet confirmed · Availability not set"; tiers: FITS `country_location`; MISSING INFORMATION: "You have not stated: Availability", "The company has not stated: Pay"; ad gaps: "start date, language requirements, pay not comparable (not in EUR)"; sentence: "Missing information is not a failed requirement…". |
| Interest | "I want this job" + the R-14 consent question + "This is not an application and no message goes to the employer." |
| Alternatives | 3 other live Swedish welder ads (TopWork Sverige AB · Uppvidinge / Vetlanda / Högsby), each "Missing a requirement"; no "closer" claim because no band is stronger (coverage, not opinion). |
| Member plain visit | no return note (marker-driven, not sticky). |
| Board `?profession=welder` | 20 cards (warm database; the cold timeout is R-B). |
| Raw i18n key leaks | none. |

Screenshots: `walk-anon.png`, `walk-member.png` (session scratchpad). Production itself will show the same once #1809 merges; the deployed page is byte-identical to this build.

## T. HUMAN VALIDATION NEXT ACTION

0. **Waiver (blocks #1809):** one sentence — "I approve adding ONLY PR 1809 to the existing `public-acquisition-route-jobs` waiver `pullRequests` list." — then the prepared block (`.github/scripts/owner-waivers.mjs`, see the PR) is committed and CI merges. Also: merge agentai #774 (CI billing-gated).
1. Owner decides R-A and R-B (both block the "WELDER — SWEDEN" landing being fully honest and the profession board being usable); R-C when the first real workers exist.
2. Owner measures the first 3–5 welder-relevant groups in the register (alternative identity / link / admin approval; rules read at a named URL) and runs `npm run agentai:job-packets -- --facts=<export> --groups=…`.
3. Owner posts the READY_TO_POST packet by hand under the named identity; no agent publishes.
4. Watch `pilot_events` for `utm_content` of that packet: `job_opened` → `cta_clicked` → `registration_started` → `signup_completed` → `job_returned_after_auth` → `job_compared` → `vacancy_interest_expressed`.
5. Next is a real visitor, not another audit.
