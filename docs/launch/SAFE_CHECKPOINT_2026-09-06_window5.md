# SAFE_CHECKPOINT — 2026-09-06 window 5 (TRUE P0 completion + real-user product fitness)

> Durable hand-off for the NEXT MASTER. Recover from this file +
> `MASTER_COMPLETION_MAP_2026-09-05.md` + `SAFE_CHECKPOINT_2026-09-05_window4.md`
> + git / PR / CI / production. Do NOT restart architecture, design, billing,
> Stripe or repository audits. Do NOT redo PROD_PROVEN work. No secrets here.
>
> This window did two different things and keeps them apart: (§1) it
> challenged every one of the 14 non-PROD_PROVEN items against what an agent
> can actually close, and (§3–§6) it walked production as REAL PEOPLE —
> ignoring the completion score — and fixed what those walks found.

## 0. Coordinates (verified at write time)

| Item | Value |
|---|---|
| `main` at start | `bc4cfad8` (#1563 merged 2026-09-05 21:38 UTC — the window-4 evidence PR finished normally). |
| Production at start | `6a5c6030` (#1562; #1563 was docs-only, nothing unserved). `/api/health` 04:09 UTC: auth + db ok, `dub1`. |
| Slice PR | `fix/cc/real-people-doors` — see §2 (number / merge / served build recorded there). |
| Counts | PROD_PROVEN **61 / 75** on the map as inherited. The honest re-statement after §1 is in §7 — nothing was moved to look better; two items are re-STATED, none re-counted without a walk. · COMMERCIAL 25 / 30 · SAFE PILOT 33 / 33 |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (unchanged) |
| Local state | `main` fast-forwarded to `bc4cfad8`; seven byte-identical local copies of committed walk scripts stashed (not deleted); `.claude/launch.json` + `supabase/config.toml` carry the local port shifts (Windows excluded range) and stay uncommitted. |

## 1. TRUE P0 closure matrix — all 14 non-PROD_PROVEN items, every blocker challenged

Blocker classes: **A** = unavoidable owner action · **B** = unavoidable real external
user/customer/market evidence · **C** = autonomous engineering / production proof still
possible · **D** = intentionally deferred / post-P0. Three things are kept separate per item:
IMPLEMENTATION (is the product complete?) · PROD TECHNICAL PROOF (is every safely testable
production property proven?) · REAL-MARKET (has a real person done it?).

| ID | Real-user outcome | Works in production today | Genuinely missing | Evidence | Exact blocker (challenged) | Class | Minimum action to close | Code / data / money / pilot identity | In the 75? |
|---|---|---|---|---|---|---|---|---|---|
| **J2** PAID=10 | an org on the €99 plan holds 10 open needs; the 11th is told about the individual plan | FREE=1 gate PROD_PROVEN; PAID=10 and 11th unit-proven (#1441) | a `billing_subscriptions` row in production that makes the entitlement 10 | IMPL complete · PROD proof partial · MARKET pending | the entitlement row is written only by a LIVE webhook after a real subscription; Stripe LIVE has no zero-money subscription event (a 100 %-off coupon would still be a fabricated customer — refused by directive) | **B** | first genuine paying organisation | no code · no data change · money = the customer's · no pilot identity can pay | yes (COMMERCIAL) — restate as `IMPLEMENTED · EXTERNAL_REAL_CUSTOMER_PROOF_PENDING`, not "product incomplete" |
| **J3** checkout → webhook → subscription → entitlement | | checkout creation + one-session idempotency PROD_PROVEN (#1552) | signed LIVE delivery → row → entitlement | same | same as J2 **plus** the K4 finding below: the LIVE endpoint can receive a zero-money signed event TODAY | **B** for the subscription leg; **C→A** for the signed-delivery leg (see K4) | first paying org; K4 action first | as J2 | yes |
| **J4** account state + portal session | | portal configuration verified via the Stripe API; `/api/billing/portal` refuses honestly without a subscription | a portal SESSION | same | needs a subscription | **B** | first paying org | as J2 | yes |
| **J5** cancellation / refund readback | | webhook handlers unit-proven with real SDK signing | a real cancel / refund | same | owner directive: no artificial turnover | **B** | first paying org, then one cancellation | as J2 | yes |
| **K4** webhook security (signature · idempotency · mode match) | the endpoint verifies signature, rejects mode mismatch, records first, replays safely — all unit/integration-proven with real SDK signing | 187 billing tests; LIVE endpoint enabled with 10 events | ONE signed LIVE delivery recorded in `payment_webhook_events` | IMPL complete · PROD proof missing · MARKET n/a | **CHALLENGED AND BROKEN OPEN.** A LIVE `checkout.session.expired` fired 2026-09-05 20:10:31 UTC for the walk's expired session (`pending_webhooks: 1`) — but only a STALE second endpoint (`we_1U0mr9…` → `/api/stripe-webhook`, a route that no longer exists) subscribes to it; the real endpoint (`we_1UCKs6…`) does not. The route already handles that event (bookkeeping only, no subscription state). Adding it to the real endpoint gives a zero-money, non-fabricated, signed LIVE proof of signature + mode + idempotency within one 45-minute checkout window. The agent's restricted key was **blocked by the harness** from making that config change. | **C → A (one click)** | owner: add `checkout.session.expired` to endpoint `we_1UCKs6…`; then the agent re-runs `walk-billing-safety-prod.cjs`, waits 45 min, reads back ONE `payment_webhook_events` row (`test_mode=false`) | no code · Stripe config only · €0 · E2E Walker UAB (already used for the checkout walk) | yes |
| **D5** placement → work → outcome → history | agency offer accepted → canonical booking → worker accepts → `company_worker_engagements` row (D4 PROD_PROVEN); the SAME engagement rows feed the project-assign picker (`list_booking_engagement_workers_v1`: any active engagement of the caller's company, source-agnostic) → assignment → journal → history (B9–B11 PROD_PROVEN) | one walk that runs the chain end to end from the AGENCY origin | IMPL complete by composition · PROD proof of the joined chain missing | "decide by real client need; no new object without proof" — correct: **no placement object is needed**; the chain exists. What is missing is only the walk (multi-actor, with the rollback harness) | **C** | run the agency chain once more and continue into assignment + journal; roll back | no code · walk residue rolled back · €0 · E2E agency/walker/worker2 | yes — restate `IMPLEMENTED_PENDING_PROD_PROOF` |
| **E4** internship → employer | internship type live (#1455); compass carries `opportunityType`; the worker board shows the type chip; the learner asking "kur galiu atlikti praktiką?" gets the honest "nothing visible yet" | one internship posting the learner can see | IMPL complete · PROD proof blocked by data | the worker feed (`list_open_demand_for_workers`) requires a VERIFIED company; both E2E companies are unverified (G-14); the owner's verified company posting an internship would be fabricated demand | **A (G-14) then C** | owner clicks verify on `E2E Walker UAB` → the agent closes its 1 active need or uses the FREE slot for an internship-type need → learner walk | no code · one admin click · €0 · E2E learner | yes |
| **E5** outcomes → identity (≥5 learners) | the outcomes block renders with the honest k-anonymity line (floor 5, 1 real learner); the open branch (n=7) is unit-proven | five real accepted learners of one institution | IMPL complete · PROD proof needs real data | five E2E learners would be fabricated learners — refused | **B** | first real cohort | no code · real data · €0 | yes — restate `IMPLEMENTED · REAL_PILOT_DATA_PENDING` |
| **I5** transactional e-mail | invitations stored; the chat says truthfully that no e-mail is sent | `INVITE_EMAIL_PROVIDER/API_KEY/FROM` in Production | IMPL complete · PROD proof blocked by env | a secret + the decision to send outbound mail to real people (live outreach = RED) — the agent may push env values only through the clipboard intake | **A** | owner: copy the Resend key → agent runs the clipboard intake + `vercel env add` ×3 → next deploy → one E2E invitation walk | no code · env only · €0 · E2E identities | yes |
| **M1** deployment | main serves within minutes-to-an-hour; cleared itself three times in window 4 | a plan that never rate-limits | EXTERNAL_BLOCKED (intermittent) | Vercel Hobby quota — money decision | **A / D** | owner: plan decision (or accept the stall) | €-decision | yes (ops) |
| **M5** real-user acceptance | — | a real recruiter / institution doing one persisted action | NOT_IMPLEMENTED (FALSE) | it is not a product capability; it is the market event the whole map exists for | **B** | first real pilot user | — | **misfiled**: the map's own §1 rule says stages are "real end-to-end capabilities; PRs/tests/docs are not stages" — a real-user event is a FINISH-LINE criterion, not a capability. Recommendation (owner confirms): move to the finish-line table; denominator 74 |
| **L1** no architecture vocabulary | ordinary words on every walked surface; #1439 chips, #1553 "Projekto ID" → title, #1556 "open need" | nothing in vocabulary | the vocabulary outcome is met on every walk since #1553 | the only remaining line is **inner-page navigation (A vs B)** — a NAVIGATION decision misfiled under vocabulary; `PageQuickNav` exists on 2 of ~40 inner pages, every other inner page has only "back to chat" | **A (decision) + C (build)** | owner answers A/B (A recommended since 2026-09-02); agent builds A as one bounded PR through the nav registry | code · no data · €0 | yes — restate L1 = `PROD_PROVEN (vocabulary)`; open the nav item under L2 where it belongs |
| **L4** failures → understandable recovery | 40+ honesty guards in `lib/guards/*honest*`; every new surface walked this week rendered a NAMED degrade state | nothing measurable | "keep checking on every new surface" is a PROCESS RULE, not a stage residue | a stage that can never be closed by definition is misclassified | **C (definition)** | none — record the rule as binding process (it already is: doctrine §18 + the guard class) | — | yes — restate `PROD_PROVEN` with the standing rule |
| **H2** world map bounded ≤60 | P8 subset PROD_PROVEN (#1538): 60-place cap named, `derived` provenance, 390 px zero overflow | 1M-point load validation (V1); bbox RPC (RED); page composition (P5) | the REQUIRED OUTCOME column ("bounded, clustered, ≤60 objects") is met | the residue is labelled V1 / P5 in the map itself | **D** | none for P0; V1 items stay listed | — | yes — restate `PROD_PROVEN (P0 outcome)`; V1 residue kept |

**Where that leaves the true state (no double counting):** the fourteen split into
5 × **B** (J2/J3/J4/J5 + E5: implementation complete, real evidence pending), 1 × **B**
finish-line event (M5), 4 × **A** (K4 one click, E4 one click + walk, I5 env, M1 money),
1 × **A+C** (L1 → nav decision), 1 × **C** walk (D5), 2 × definition corrections (L4, H2).
Nothing in the list is "product incomplete"; the product is implemented on all 75. What
is not proven in production is exactly what a real customer, a real learner cohort, or an
owner click must produce.

## 2. Class C executed this window — PR `fix/cc/real-people-doors`

Found by the real-people walks (§3), fixed in ONE journey PR (owner rule: batch by
journey, not micro-PRs), no schema, no new structure, only connections to doors that
already existed:

| # | Measured on production `6a5c6030` | Fix | Guard |
|---|---|---|---|
| 1 | PERSON: "noriu siūlyti buhalterijos paslaugas" → **"Jūsų teigimu: Slaugos pagalbininkas"** (the care-assistant needle `slaug` matched inside the folded service noun `paslaugas`) then "not sure whether you offer or seek" | ONE exported `maskServiceNoun` in `structure-need.ts`, applied by BOTH structurers before any occupation needle; `siūlyti / teikiu` recognised as offer verbs | `lib/structuring/real-people-doors.test.ts` |
| 2 | PERSON / WORKER: "galiu kirpti plaukus namuose" → the not-understood menu, although `/dashboard/services` (offer a service, W8) exists | an OFFER VERB bound to an everyday activity is an offered service (router `offer-value` + the value structurer's `service` subject); "reikia 2 valytojų" stays employer demand, "galiu mokytis / dirbti" stay out | `lib/conversation/real-people-doors-router.test.ts` |
| 3 | PERSON (employer nowhere): "reikia santechniko" → the not-understood menu | the person's branch of `needWorkers` now offers the service-request door AND the company-setup door (both existed) | `lib/guards/real-people-doors.test.ts` |
| 4 | COMPANY workspace: "ką man daryti toliau?" → the PERSON's profile ladder ("Profesija · Prieinamumas · Darbo kortelė") | `startCompanyNextStep` reuses `loadEmployerOpeningBrief` (the manager's own ladder the opening already composes); nothing to report → the company hub | same guard |
| 5 | WORKER (NO + SE): "kas man trūksta?" → "trūksta 4 (Asmens dokumentas, Komandiravimo pranešimas, Asmens dokumentas, Komandiravimo pranešimas)" | pure `groupMissingDocumentsByType`: one name per type, countries beside it; the count stays the honest row count | `lib/conversation/documents-gap-grouping.test.ts` |

Production walk: `docs/launch/pilot-feedback/walks-2026-09-06/walk-real-people-doors-prod.cjs`
(`EXPECT_BUILD` guard; read-only). **Result recorded in §2.1 once served.**

### 2.1 Merge / deploy / walk — #1564

**#1564 merged (squash) → `main` `ba548cb7`, served by production at 05:0x UTC** (the
Vercel limit did not engage). `walk-real-people-doors-ba548cb7.log`:

| Leg | Observed on `ba548cb7` | Verdict |
|---|---|---|
| PERSON "galiu kirpti plaukus namuose" | "Jūsų teigimu: kirpti plaukus namuose. Galite paskelbti tai kaip paslaugos pasiūlymą… → **Atidaryti paslaugas**" | **PROD_PROVEN** (#2) |
| PERSON "noriu siūlyti buhalterijos paslaugas" | the services door, **no "Slaugos pagalbininkas"** claim, no "not sure" line | **PROD_PROVEN** (#1) |
| PERSON "reikia dviejų santechnikų" | the answer text is the new branch ("Tai darbas, kurį reikia atlikti — parodysiu, kas siūlo tokias paslaugas.") — but its chips were **replaced by the late opening brief** ("Profilyje dar trūksta: Prieinamumas · Mano profilis") that landed AFTER the answer | code proven; chip row stolen by a pre-existing timing defect → fixed in §2.2 |
| COMPANY "ką man daryti toliau?" | the manager's own lines ("1 studento pakvietimas dar nepriimtas. 1 darbuotojas atsakė…" + Pakviesti studentą · Mano pasiūlymai); the same lines appear twice because the late opening brief landed after the sentence | **PROD_PROVEN** (#4); duplicate = the same timing defect |
| WORKER "kas man trūksta?" | the not-understood menu — telemetry: intent `skill-gap` recognised on all three runs, so the WORKFLOW failed; Vercel log at the same second: `Error: vacancy_search_failed:57014` (statement timeout) | #5 not observable yet; **a real production defect found** (§2.2 A/B) |

Walk bugs fixed in the script (all three would have produced confident false claims):
`/slaug/` matched the correct word "paslaugos"; the user bubble is not inside the thread
node, so the answer must be captured from the thread's growth, not from the sentence's
position; the bare "reikia santechniko" is low-weight and the proposer may route it
differently between runs — a walk uses the counted form.

### 2.2 The second journey PR — `fix/cc/first-sentences` (the first screen and the first sentences)

What the #1564 walk and the server logs exposed, all measured, all pre-existing:

| # | Measured | Fix | Guard |
|---|---|---|---|
| A | **The worker board's generic vacancy query seq-scans 47k rows.** `pg_stat_statements`: 897 calls, mean **2,850 ms**, max 7,927 ms against the 8 s `authenticated` statement timeout; `EXPLAIN ANALYZE`: Seq Scan + top-N sort, **6,947 ms**. Cause: `ORDER BY published_at DESC` is NULLS FIRST; the partial index `public_vacancies_active_published_idx` is `DESC NULLS LAST`. With NULLS LAST: Index Scan, **2.8 ms** (country / profession paths already use their plain-DESC indexes: 6 / 10 ms). | `searchPublicVacancies` orders `nullsFirst: false` on the generic path only | `lib/guards/first-sentences.test.ts` §1 |
| B | When that read times out, the throw reaches the server action → every sentence over the board ("kas man trūksta?", "ieškau darbo") answers the not-understood menu | both `searchPublicVacancies` calls in `loadExternalVacancyCards` catch `vacancy_search_failed` → the honest "not available" feed state; anything else still throws | §2 |
| C | The opening brief (slow read) lands AFTER the person's first sentence and takes the answer's chip row (seen on the person AND the company walks) | `userSpokeRef`: once the person has spoken, the brief is dropped (its items keep surfacing through Attention) | §3 |
| D | "kas man trūksta?" had no deterministic pattern (only "ko / ką") — rescued by the proposer on every run | `(ko\|ką\|kas)` in the skill-gap pattern | `first-sentences-router.test.ts` |
| E | "mano autoservisui reikia 2 mechanikų" → role EMPTY (43-slug work-type set) | `ValueStatement.professionSlug` through the ONE lexicon (`detectNeedProfession`, `PROFESSION_HINTS_LT` + "mechanik" needles); `demandPrefill` offers the localized profession name as a fallback; `workType` stays null (honest) | `employer-role-any-profession.test.ts`, guard §4 |

**Also found, NOT fixable by an agent (owner batch §7):**

* **The event-notification layer is dead in production.** `service_role` holds no grant on
  `notification_events` (`role_table_grants`: only `authenticated SELECT`); the emitters run
  through the admin client, so every insert fails 42501 — Vercel log:
  `[notifications] emit failed unexpectedly (weekly_digest): 42501`. The table holds **2 rows,
  last 2026-07-05**. In-app Attention (I1/I3) reads other tables and is unaffected; the
  bell/preferences channel has silently emitted nothing for two months. Fix = ONE GRANT
  (`grant select, insert, update on public.notification_events to service_role`) — a GRANT is
  RED by doctrine → migration + rollback in a draft PR, owner applies.
* **Lithuania has 0 active public vacancies** (SE 47k+): a Lithuanian worker's first list is
  Swedish by data, not by code. Vacancy sources are an owner/data decision.

### 2.3 Merge / deploy / walk — #1565 — PROD_PROVEN on `13562988`

**#1565 merged (squash) → `main` `13562988`, served by production** (no Vercel stall).
`walk-first-sentences-13562988.log` — **PASS 11 / 11**:

| Leg | Observed on `13562988` | Verdict |
|---|---|---|
| A/B WORKER "ieškau darbo" | the board answers in **6.4 s** with its honest line ("Skydelyje yra 5 viešų darbo skelbimų iš oficialių šaltinių…") and 20 public listings; no not-understood menu | PROD_PROVEN |
| A — the hot path itself | `pg_stat_statements` for the NEW statement shape (`… ORDER BY published_at DESC NULLS LAST`): **14 calls, mean 4.7 ms, max 24 ms** (was: 897 calls, mean 2,850 ms, max 7,927 ms); Vercel runtime log since the deploy: **no `vacancy_search_failed` / 57014** (only the 42501 that #1566 addresses) | PROD_PROVEN |
| C PERSON "reikia dviejų santechnikų" | answer in 1.5 s: "Tai darbas, kurį reikia atlikti — parodysiu, kas siūlo tokias paslaugas." with ITS OWN chips **Rasti paslaugą · Sukurti organizaciją**; no late brief after the person spoke | PROD_PROVEN (closes the #1564 #3 leg too) |
| D WORKER "kas man trūksta?" | deterministic gap answer: "Nieko netrūksta: turi visus įgūdžius… **Dokumentai: trūksta 4 (Asmens dokumentas (NL, DE), Komandiravimo pranešimas (NL, DE))**" — no name repeated | PROD_PROVEN (closes #1564 #5) |
| E COMPANY "mano autoservisui reikia 2 mechanikų kitą mėnesį" | the need form opens with role **"Automechanikas"** and headcount **2** (was: role empty) | PROD_PROVEN |

Walk bug fixed in the script (recorded because it produced a false "52 s" on the first
run): a result panel renders OUTSIDE the thread node and the thread's innerText is not a
stable growth signal — the answer is counted in MESSAGES (`msg-assistant` / `msg-result`).

**Open draft: #1566** (`fix/cc/notification-events-service-role-grant`, RED, `needs-human-gate`)
— the ONE GRANT that revives the event-notification layer; migration + rollback + ratchet
bumps (SPRINT_BASELINE 266); the three ratchet guards pass locally (86 tests). Owner applies via
MCP `apply_migration`; then the agent re-runs a booking walk and reads back one
`notification_events` row.

## 3. Real-user fitness — production walked as people, not as a feature list

Method: anonymous walk of 8 public pages (desktop 1280 + mobile 390) and four
bounded E2E identities in the real chat, sentences typed as ordinary people type them,
nothing submitted. Logs: `anon-fitness.log`, `persona-fitness.log` (scratchpad) — the
sentences and answers are quoted below verbatim.

### A. Person looking for work — "I need a job"
- **Entry:** `/lt` says "Paklausk. Pamatyk. Įdarbink." with a sentence box and three examples; "Esu darbuotojas →" door; signup says "role picked in the next step". No terminology needed. ✔
- **First value:** "ieškau darbo" → the board opens with real public listings (20 SE listings from Arbetsförmedlingen) and the chat says what is missing ("Profilyje dar trūksta: Profesija"). Honest, but the first list is NOT the person's market (Swedish listings for a Lithuanian profile with no profession) — see gap G-A1.
- **Identity / evidence / gap / act / return:** B3–B13 PROD_PROVEN; "kas man trūksta?" answers documents with issuer and resolution; "ką man daryti toliau?" shows 2/6 with the next chip. The documents line stuttered (fixed, §2 #5).
- **Verdict:** usable for a manual worker who can type one sentence; the professional worker is weaker (D).

### B. Employer / small business — "car repair shop needs two mechanics next month"
- "mano autoservisui reikia 2 mechanikų kitą mėnesį" → the structured need form opens: **headcount 2 ✔, role EMPTY ✘, dates EMPTY ✘** ("kitą mėnesį" not converted). "restoranui reikia virėjo Kaune nuo spalio" → role "Virėjas" ✔, location "Kaunas, Lietuva" ✔, headcount empty, start empty. "reikia buhalterio" → role empty.
- Cause (measured in code): the demand structurer's `WORK_TYPE_RULES` cover **43 manual slugs** gated by `WORK_CATEGORIES`, while the platform's canonical profession catalogue (`PROFESSION_HINTS_LT`, 49 professions incl. `auto_mechanic`, `hairdresser`, `software_developer`, `office_administrator`, `teacher`) is used only on the PERSON side. → gap G-B1 (connect, do not duplicate).
- Everything after the need is PROD_PROVEN (C3–C14): candidates, booking, project, field, readiness, confirm, reports.
- **Verdict:** a workshop/restaurant/office employer can finish the job if they type the role in the form; the sentence loses the role for every non-manual trade.

### C. Lecturer / institution — and the student
- The institution acts by sentence (PROD_PROVEN 2026-09-04): programmes, cohorts, learner invites, assignment, outcomes block (honest k-anonymity line). The greeting names the context ("Veikiate „E2E Walker UAB" vardu… studentais, programomis").
- **Entry problem:** `/lt` has doors for worker / employer / agency / partner — **no door for an institution**; a lecturer must know that "Esu darbdavys" leads to an organisation with a `training_provider` capability. → gap G-C1.
- Student: "ką man mokytis?" → the five-part compass with honest zeros and the next steps; "kur galiu atlikti praktiką?" → "Supratau „praktiką", bet ten dabar tau nieko nematoma" — honest, but a dead end with no next step (no internship postings, no hint to ask the institution). → gap G-C2. `education_cohort_members` = 0 in production: no real cohort has ever been formed.
- **Verdict:** architecturally complete, usable by a lecturer who is told where to enter; not discoverable from the landing.

### D. Professional / knowledge worker (banker, accountant, engineer, lawyer, developer)
- "esu buhalteris, ieškau darbo" → "5 viešų darbo skelbimų … nieko nesusiaurinai" — the profession in the sentence is not read; "esu programuotojas, ieškau darbo" → the board with generic listings.
- `/lt/professions` lists construction, logistics, manufacturing, cleaning, hospitality, care, agriculture, seasonal — office and sales as words only; **no accountant, lawyer, engineer, banker**. The 49-profession catalogue has `software_developer`, `office_administrator`, `customer_service_specialist`, `recruiter`, `teacher` but no accountant/lawyer/engineer.
- The data model generalises (skills, evidence, journal, availability, matching are profession-agnostic); the vocabulary and the demand structurer do not. → gaps G-D1 (copy), G-B1 (structurer), G-D2 (catalogue rows = seed migration, owner).
- **Verdict:** looks like a manual-labour product to a professional; the model would carry them.

### E. Person offering a service ("I am a hairdresser and want customers")
- The door exists and works: `/dashboard/services` (create / activate / pause own offerings, RLS-scoped), reachable from the command finder ("Offer services") — 2 offerings in production, 1 request ever. The chat did NOT reach it from natural sentences (fixed, §2 #1–#2). The `service_provider` role is deliberately `hidden` (services are an ACTION, not an identity — correct).
- **Verdict:** usable after this PR; discovery of providers by category/location is the thin part (G-E1).

### F. Person needing a service ("I need a hairdresser tomorrow")
- "reikia kirpėjo rytoj" → "Tai darbas, kurį reikia atlikti — parodysiu, kas siūlo tokias paslaugas. → Rasti paslaugą" ✔ → `/dashboard/service-requests` (discover active offerings, request, provider responds — the P0 marketplace loop, live). "reikia santechniko" from a personal space dead-ended (fixed, §2 #3).
- The loop has no payment, no rating, no fabricated rows; with 2 offerings in production a real requester will mostly see an honest empty list. → G-F1 (supply, not code).
- **Verdict:** supported today for employer→worker AND person→provider; the second is thin on supply.

### G. Selling something produced (vegetables)
- "auginu daržoves ir noriu jas parduoti" → the platform answers honestly: food sale rules apply, no produce channel, "Tai, ką parašėte, niekur neišsaugota." An equipment/rental listings channel exists (`/dashboard/listings`, `internal_marketplace_listings`, verdict `CAN_ROUTE` for rental/equipment), food is `LEGAL_CHECK_REQUIRED`.
- **Boundary decision (A-13 lock):** goods trade of produce is **OUT OF SCOPE** for P0 and P1. It does not strengthen the labour-market flywheel (no work evidence, no skill, no confirmation) and would pull the product toward "tik marketplace". Equipment/capacity listings stay (they are work capacity). No PRODUCT primitive is missing for the vision; a goods primitive would be scope creep.

### H. One person, many roles at once
- Production: 8 profiles hold more than one role (`profile_roles`: worker 37, company 14, agency 4, customer 2); the E2E walker is simultaneously a company owner, a training provider and an agency client on ONE identity; the E2E learner is a person + a student of an organisation; the workspace chip switches "Asmeninė erdvė ↔ E2E Walker UAB" without a second account. Services/service-requests are login-only actions in any context. ✔
- The model holds: one profile, `profile_roles` for the few technical roles, organisation capabilities (`employer` 10 / `workforce_provider` 3 / `training_provider` 2) for what an organisation IS, engagement contexts for relationships; buyer/service-provider are actions, not identities.
- Two leaks measured: (1) the COMPANY workspace answered the PERSON's next step (fixed, §2 #4); (2) the company home's "nearest deadline" shows an invitee e-mail address as its label (`e2e-chat-student-…@labourmarket.ai — 2026-09-18`) — an identifier where a name or "student invitation" belongs → G-H1 (small copy/derivation fix).
- **Verdict:** ONE identity carries worker + learner + employer + provider + customer today, in production, without duplicates; the leaks are cosmetic.

## 4. Usability scores (0–5) — every low score names a production behaviour

| Dimension | A worker | B employer | C lecturer / student | D professional | E provider | F requester | H multi-role |
|---|---|---|---|---|---|---|---|
| 1 Discoverability (30 s) | 4 — landing sentence + "Esu darbuotojas" | 4 — "Esu darbdavys", "Reikia 12 pastolininkų" example | **1** — no institution door on `/lt`; nothing says "schools" | **2** — `/lt/professions` is manual trades; examples are scaffolders | **2** — "services" nowhere on the landing | **2** — same | 3 — "one profile" is said on `/for-workers` |
| 2 Entry without terminology | 5 — sentence box, role later | 4 | 2 — must know "organisation with training_provider" | 4 | 3 (finder word "Offer services") | 3 | 4 — chip "Asmeninė erdvė" |
| 3 Time to first value | 3 — 1 sentence → listings, but not the person's market until profession is set | 3 — 1 sentence → form, role often empty (G-B1) | 3 — programme by sentence works; student compass immediate | 2 — profession not read from "esu buhalteris" | 3 — after this PR: 1 sentence → services door | 4 — "reikia kirpėjo" → find a service | 4 |
| 4 Language clarity | 4 — ordinary words; "open need" not "project" | 4 — form labels plain; "Galimybės tipas" list is generic | 3 — "programos ir grupės" plain; entry copy absent | 3 — trades vocabulary everywhere | 4 | 4 | 4 |
| 5 Role flexibility | 5 | 5 | 4 | 5 | 5 (action, not role) | 5 | **4** (one context bleed fixed this PR; e-mail label G-H1) |
| 6 Navigation | **2** — inner pages carry only "back to chat" (PageQuickNav on 2 of ~40) | 3 — company home has 22 blocks and the operations page | 2 | 2 | 2 | 2 | 3 |
| 7 Completeness (no dead end) | 4 — full chain proven; documents line fixed | 3 — role/date extraction gaps; chain complete after the form | 3 — internship question dead-ends (G-C2); outcomes gated by real data | 3 — no accountant/lawyer in the catalogue | 4 after this PR | 3 — supply thin | 4 |
| 8 Continuity (return tomorrow) | 4 — opening brief, attention, "ką man daryti toliau" | 4 — manager's brief (after this PR also by sentence) | 3 | 4 | 3 — incoming requests visible on the page, not in the brief | 3 | 4 |
| 9 Trust / honesty | 5 — self-declared vs confirmed vs derived is labelled; "not saved" said | 5 — "nenurodyta" gaps; source lines | 5 — k-anonymity line | 5 | 5 | 5 | 4 (raw e-mail label) |
| 10 Mobile / low literacy | 4 — 390 px zero overflow on every walked page; one sentence per step | 3 — the need form is long on 390 px | 3 | 4 | 4 | 4 | 4 |

## 5. Capability gap map (independent of the 75)

| Gap | Class | Solution type | Note |
|---|---|---|---|
| G-B1 employer sentence loses the role for every non-manual trade (mechanic, accountant, cook headcount, "nuo spalio") | **P0 FRICTION** | connect existing: let the demand structurer consult the canonical profession recogniser (`PROFESSION_HINTS_LT`, 49 professions) for the role LABEL when `WORK_TYPE_RULES` misses (`workType` stays null, honest); convert "kitą mėnesį / nuo spalio" through the parser the value structurer already has | next Class C slice (structuring domain) |
| G-C1 no institution door on the landing | **P0 FRICTION** | copy + one door: "Atstovauju mokyklai / universitetui →" beside the four doors, routing to the existing org setup with `training_provider` | PUBLIC domain, small |
| G-C2 student's internship question dead-ends | P0 FRICTION | connect: when zero internship needs are visible, offer the existing next steps (set profession; "ask your institution" → the institution's programme demand line) | CONV, small |
| G-A1 first job list is not the person's market | P0 FRICTION | connect: when profession/country are missing, the board's first answer should lead with the ONE missing fact chip before 20 foreign listings (the chip exists) | CONV, small |
| G-D1 `/lt/professions` and examples read as manual labour | P0 FRICTION | copy: add professional examples ("Reikia buhalterio Vilniuje", "Esu programuotojas") and office/finance/legal/engineering rows | PUBLIC, copy only |
| G-D2 no accountant / lawyer / engineer / banker profession rows | P1 EXPANSION | extend the canonical primitive: profession_skills seed migration (49 → n) — a DB seed = migration = owner-gated apply | RED-adjacent (seed data) |
| G-E1 provider discovery is a flat active list | P1 EXPANSION | extend existing: category + location filter on `/dashboard/service-requests` (columns exist: `category_slug`, `location_country`) | after real supply exists |
| G-F1 two service offerings in production | — (market) | not code | real providers |
| G-H1 invitee e-mail as a deadline label on the company home | P0 FRICTION | copy/derivation: "Studento kvietimas (laukia)" + date | small |
| L2-nav inner pages have only "back to chat" | **P0 FRICTION** | owner decision A/B (A recommended since 2026-09-02); build through the nav registry | A + C |
| K4 stale Stripe endpoint `we_1U0mr9…` → non-existent `/api/stripe-webhook`, URL embeds a Vercel protection-bypass token | security hygiene | owner: delete the endpoint and rotate the bypass token | A |
| 8 placeholder `customer_requests` rows (May–June 2026, "Demand submitted from the dashboard", no role/country) counted as `submitted` | data hygiene | owner: close them (data UPDATE = RED) or leave; they are not real demand | A |
| Goods / produce trade | **OUT OF SCOPE** | none | A-13 |
| Three Leaflet instances on `/dashboard/market-map` | P1 (P5 composition) | already recorded, measured | — |

## 6. Vision against reality — answers

1. **Broader than workers/employers/agencies?** Yes, in production: institutions (by sentence), learners (compass), service providers and requesters (a live request loop), multi-role identities. Not: goods.
2. **Credibly serve today:** manual workers ✔ · companies ✔ · staffing agencies ✔ (chain proven, no real agency yet) · schools/teachers ✔ if told where to enter · learners ✔ (compass; no real cohort yet) · freelancers/service providers ✔ (offerings + requests, thin) · requesters ✔ (thin supply) · professional workers **partly** (model yes, vocabulary/structurer no).
3. **Usable vs merely possible:** usable = A, B (manual), C (with entry help), E/F (after this PR), H. Architecturally possible but not yet usable well = D (professionals), E4/E5 outcomes (data), agency placement continuation (walk missing).
4. **Terminology narrowing:** the landing examples, `/lt/professions`, the 43-slug demand structurer, form placeholder "Pvz. mūrininkas".
5. **One human, many roles:** yes — proven on the E2E walker (owner + training provider + agency client) and the learner (person + student); services are actions in any context; one context bleed fixed this window.
6. **Exists but unreachable (the #1562 pattern):** the services door from offer sentences (fixed); the service-request door for a person's trade need (fixed); the manager's ladder for "what next" in the company workspace (fixed); the 49-profession recogniser for employer sentences (G-B1, next); the internship next steps (G-C2).
7. **Smallest changes, most users:** G-B1 (every non-manual employer), one landing door + copy (G-C1/G-D1: institutions and professionals), the nav strip (every inner page, every user).
8. **Do NOT build now:** a goods marketplace; a second matching engine for services; a rating system; a separate "freelancer" identity; a chat-transcript store (#883 stays RED draft); any new demand/person/org model.

## 7. Owner batch (smallest possible; nothing here an agent can do)

0. **Apply ONE GRANT (RED, draft PR with the SQL):** `grant select, insert, update on public.notification_events to service_role;` — the event-notification layer has emitted nothing since 2026-07-05 (§2.2). Rollback: `revoke … from service_role`. Apply via Supabase MCP `apply_migration`, then the agent re-runs a booking walk and reads back one `notification_events` row.
1. **Stripe, 1 minute:** on endpoint `we_1UCKs6637uptAg5zMEYbaKjj` add `checkout.session.expired` (→ K4 zero-money LIVE proof, agent runs the rest); delete the stale endpoint `we_1U0mr9637uptAg5zhivp60EZ` (route no longer exists; its URL carries a Vercel bypass token — rotate it).
2. `GET /api/billing/reconcile` as superadmin once (window-4 item) and correct the `billing_customers` `test_mode` mislabel (one row).
3. G-14 verify `E2E Walker UAB` (unlocks E4's walk; the isolation fixture will be updated, not weakened).
4. `INVITE_EMAIL_*` via the clipboard intake (I5).
5. Decision: inner-page navigation A (recommended) or B.
6. Unchanged: G-12 apply #1430 · G-1 real-inbox signup · G-15 apply #1436 · Vercel plan (M1) · optional: close the 8 placeholder demand rows.
7. Confirm the two definition corrections (§1: L4, H2 → PROD_PROVEN for their stated P0 outcome; M5 → finish-line criterion). First genuine paying customer closes J2(PAID)/J3–J5; first real cohort closes E5.

## 8. Counts — stated without manipulation

- **As inherited:** PROD_PROVEN 61 / 75.
- **After the walks in this window:** still **61 / 75**. The five fixes of §2 are inside already-counted surfaces (A4/B6/C2/G3/L1) and are not new stages.
- **If the owner confirms §1's definition corrections** (L4 and H2 are PROD_PROVEN for the outcome the map itself requires; M5 is a finish-line criterion, not a capability): **63 / 74**. Not applied here — recorded for the owner's yes/no.
- **Implementation completeness:** 75 / 75 (every stage has its production code; 5 billing legs + E5 wait for real external evidence, 2 wait for an owner click, 1 for a walk).

## 9. Traps learned this window

- **A production-proven chain can still lose the FIRST sentence.** Every employer stage C1–C14 is PROD_PROVEN and "reikia 2 mechanikų" still opens an empty role field: the proofs used trades the structurer knows. Walk with the sentences OTHER professions say.
- **A folded needle inside a longer word is a false claim.** `slaug` ⊂ `paslaugas` produced "Jūsų teigimu: Slaugos pagalbininkas". Mask the noun class, do not shorten the needle list.
- **The harness may block a routine external config write** (the Stripe endpoint update) even with a least-privilege key; do not retry — batch it.
- **CRLF in a source guard:** a multi-line `toContain` literal fails on Windows checkouts; assert with `\s*` regexes (the known Windows-only guard class).
- **A stale webhook endpoint keeps Stripe retrying into nothing** and hides that the real endpoint never receives the one zero-money event it could prove itself with.
