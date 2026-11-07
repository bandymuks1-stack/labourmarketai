# FUNCTION REGISTER — every LabourMarket.ai function, one status

The ONE canonical per-function register (owner order 2026-10-28). Every session and sub-agent reads it
BEFORE starting a task and updates it after a merged PR, a deploy or a test result. Coordination (who does
what, lanes, owner items) lives in [`COORDINATION_REGISTER.md`](COORDINATION_REGISTER.md); the public area
summary in [`../master/LABOURMARKET-FUNCTIONAL-AUDIT.md`](../master/LABOURMARKET-FUNCTIONAL-AUDIT.md) is a view of
this file. **This repository is public:** no personal data, no secrets, and no exploitable security detail —
a security/permission row says only that an item is open.

## Rules (binding)

1. **Check this file before every new task.** A `LIVE_VERIFIED` function is not re-tested or re-built without a
   concrete regression, a new change that can affect it, or a named defect.
2. A new defect in a verified function is recorded as **`REGRESSION`** in the issue column with its evidence;
   the earlier proof stays in the evidence column (never deleted).
3. An unknown result is never written as a pass. A green CI run alone is `PASS_CI_ONLY`.
4. The Stripe LIVE payment chain (row 7.5) and the optional Stripe TEST walk (row 7.4) are different scenarios.

| Status | Meaning |
|---|---|
| `LIVE_VERIFIED` | proven in production: a production walk, a recorded owner/real-user action, or real production use |
| `PASS_CI_ONLY` | passes automated tests, no production proof |
| `FAIL` | does not work (the issue column says what) |
| `BLOCKED` | built; waits for a named owner decision, account or configuration |
| `NOT_VERIFIED` | not checked yet, or built but contradicted by product-truth / not proven end to end (the issue column says which) |
| `NOT_IMPLEMENTED` | not built |
| `OPTIONAL_TEST` | an extra test scenario that does not block launch |
| `DUPLICATE` | the same function as another row (named in the evidence); kept for history, never counted in the totals |

## Totals (288 planned functions, 2026-11-03)

| LIVE_VERIFIED | PASS_CI_ONLY | FAIL | BLOCKED | NOT_VERIFIED | NOT_IMPLEMENTED | OPTIONAL_TEST |
|---|---|---|---|---|---|---|
| 196 | 6 | 8 | 39 | 16 | 22 | 1 |

2026-11-03 evening: documents-approvals 41716118134, agency-chain 41717112150, orders-bookings 41718546706 (build a10b6c47d), project-execution 41722638759 and marketplace 41729310761 (build 7f0f06583) re-proved their rows; no status changed. 2026-11-03: 13.5 BLOCKED → LIVE_VERIFIED by db-backup restore drill 41664420591 + full run 41665452921 (#3005). 2026-11-03: 11.7 NOT_VERIFIED → LIVE_VERIFIED by recognition-chain 41617507405; J-12 redefined by the owner as the baseline learning-group journey (11.1–11.7), RPL 11.10 a separate advanced stage. 2026-11-03: 11.2 NOT_VERIFIED → LIVE_VERIFIED by cohort-join-request 41611766407 (6/6). 2026-11-02: 2.20 FAIL → NOT_VERIFIED by owner decision 0028, then → LIVE_VERIFIED by journal-confirm 41478434884. 4.9 and 5.7 PASS_CI_ONLY → LIVE_VERIFIED by alert-mail 41488266687.

Full planned scope 2026-11-01: 277 rows − 2 DUPLICATE (7.10 = 4.22, 4.17 = 2.35; kept, not counted) + 13 functions found in the vision, architecture and decision documents with no row before (2.36, 2.37, 3.34–3.36, 4.30, 5.20, 5.21, 6.22–6.24, 7.30, 7.31) = **288**. Seven rows were reconciled with product-truth (3.8, 4.6, 11.2, 11.7, 7.5 → NOT_VERIFIED; 2.20, 2.24 → FAIL); their earlier proof stays in the row. Production-verified share of the full scope: **190 / 288 = 66.0 %** (186 after the 2026-11-02 recount; +3.8, 4.6, 6.18, 9.18 from production walks 41350506578 and 41357630136). Targets (conditional, not guaranteed): core product complete and public mid-December 2026; full historical scope February 2027 (preliminary).

Seeded 2026-10-28 from the 275-row QA matrix of 2026-10-23…28 plus the 2026-10-28 production results; a `PASS` row
whose evidence names a production run or production use became `LIVE_VERIFIED`, any other `PASS` became `PASS_CI_ONLY`.

Changes on 2026-11-06 (owner's final readiness check): 19 production walks ran one at a time in the Chrome build the runner carries, scripted and headless, on synthetic accounts. **All 19 passed:** build 71c04bfc0: slow-connection 42268376841, fresh-activation 42269903438, profile-cv-history 42272818314, journal-confirm 42274838542, living-cv-growth 42275884833, jobs-search 42276842752, marketplace-goods-services 42279056300, marketplace 42280640690, company-chain 42281698766, agency-chain 42284428561, orders-bookings 42285624633, project-execution 42287752119, notifications-inapp 42289500998, mobile-surfaces 42290511605, sectors-languages 42292448548, public-org-locales 42293709781, ux-metrics 42297101191, role-routes 42299857459; build 439ba1032: search-support-privacy 42310054875 (20 passed, 2 skipped; its two earlier failures were the walk's own selector, #3120, #3121). Found and fixed: a save with no connection said nothing (#3118, slow-connection FAIL 42225155800, PASS 42268376841). No status changed from these walks alone. They prove what each walk's steps cover, not the whole of a row's scope, and not a person's Chrome.

Changes on 2026-11-01 (function audit, production walks on build 38bfb9d93): **3.6 → `FAIL`** (REGRESSION,
project-execution E-5); **2.19 → `LIVE_VERIFIED`** (the core journal is proven in production; its AI part was already
counted separately as row 10.9, so 2.19 no longer double-counts the AI block). 58 further rows got a fresh 2026-11-01
production proof without a status change. Not run: invited-worker (identity not provisioned — owner step).

Later on 2026-11-01 (build 3b7eafbe4, after #2897): **3.6 → `LIVE_VERIFIED`** again — prod walk project-execution
41295981934 green end to end (the 2026-11-01 E-5 failure was the walk reading the answer before it arrived, not a lost
assignment); prod walk mcp-agents 41296658531 green on the build that carries #2895 (no MCP regression). J-7 → complete. Then #2900/#2901: the production MCP walk records and corrects a Work Journal entry —
mcp-agents 41307643008 on c3df7431d 10/10, so the #2895 correction over MCP is production-verified (2.19, 2.21, 10.1).

Later on 2026-11-01 (builds 7f8bfaa2a, 681e6678f, 4a5b45828), fresh production proof without a status change:
- mobile web at 390 px (8.11): mobile-surfaces 6/6, run twice;
- notifications (5.10): notifications-inapp 8/8;
- worker records and exports (2.22, 2.33, 2.34): worker-records-exports 8/8;
- bookings (5.13, 6.7-6.9): orders-bookings 16/17, with B-1 skipped for want of a synthetic customer;
- roster and workspace isolation (3.21-3.32, 1.10): org-roster 7/7;
- worker data isolation (1.11): worker-identity-split 5/5;
- chat continuity (5.2): chat-continuity.

The orders-bookings failures on the way were test defects (#2905, #2907). The gate that keeps such defects out is #2908: every Playwright spec must load in `quality`.

### Reconciliation — where 275 and 277 come from

| Step | Rows | Evidence |
|---|---|---|
| Owner's private functionality registry v2, 2026-10-21 | 284 rows = 274 counted + 10 not counted | public summary in [`../master/LABOURMARKET-FUNCTIONAL-AUDIT.md`](../master/LABOURMARKET-FUNCTIONAL-AUDIT.md) ("274 … 10 more rows kept for traceability") |
| — not counted, RETIRED | 4.23 talent sample preview, 4.24 legacy agency pool, 4.27 legacy demand table, 6.22 dead contract-payment code, 10.12 legacy assist provider | registry v2 rows marked RETIRED |
| — not counted, DUPLICATE | 6.5 (= 5.13), 6.15 (= 4.15), 8.17 old "jobs board phone layout" (= 4.4), 9.21 (= 1.7), 10.28 (= 2.17) | registry v2 rows marked DUPLICATE |
| QA matrix, 2026-10-23 | 275 = 274 + **7.29** VAT / Stripe Tax (added after 10-21, RED draft #2685) | private QA matrix, six directions A–F |
| This register, 2026-10-30 | 277 = 275 + **8.17** Android app + **8.18** iOS app (#2878, #2888) | ID 8.17 was **re-used**: the 10-21 duplicate 8.17 was never counted, the new 8.17 is a different function |
| Merged since 10-30, no new row | #2887 job fit (4.5), #2889 work.find rows + fit in UI (4.5, 10.1), #2893 night/split shifts + confirm replay (2.19, 5.3), #2894 skill time, company period split, no-duration records (2.4, 2.13, 2.26, 3.27), #2895 own-entry correction over MCP/mobile (2.21, 10.1) | each extends an existing function; adding rows would double-count |
| Queued, not counted | owner-approved job-intake growth item (#2896, P1, not started) | `COORDINATION_REGISTER.md` §3.3a |

So **275 was right on 2026-10-23**; **277 is right today** and no function was dropped silently. The ID gaps
(4.23, 4.24, 4.27, 6.5, 6.15, 9.21, 10.12) are the not-counted rows above.

### Three completion measures (method stated; never one number)

Denominator = 287 functions (288 planned minus the one `OPTIONAL_TEST` scenario, 7.4; the two DUPLICATE rows are not counted).

| Measure | Method | Result |
|---|---|---|
| **Technical implementation** | every row except `NOT_IMPLEMENTED` (a `BLOCKED` row is built but waits for an owner step) | **265 / 287 = 92.3 %** |
| **Production verification** | `LIVE_VERIFIED` only (`PASS_CI_ONLY`, `NOT_VERIFIED`, `BLOCKED`, `FAIL` never count) | **196 / 287 = 68.3 %** (74.0 % of the built 265) |
| **Real user-journey completion** | 19 end-to-end journeys a real person needs (below); a journey counts only when **every** step is `LIVE_VERIFIED`, none is `FAIL`, and no admin help is needed | **16 / 19 = 84.2 %** complete · 1 partial · 0 broken · 2 blocked · 0 unverified (J-12 counts the baseline learning-group journey 11.1–11.7; advanced RPL 11.10 is tracked separately, owner D-15) |

Per area (technical / production-verified) — as of the 277-row register, before the 2026-11-01 full-scope update; recomputed at the next weekly progress report:

| Area | Rows | Built | Verified |
|---|---|---|---|
| 1 Identity, sign-up, organizations | 15 | 100 % | 87 % |
| 2 Worker profile, Work Journal, Living CV | 35 | 100 % | 86 % |
| 3 Company operations & projects | 33 | 100 % | 100 % |
| 4 Demand, jobs & matching | 26 | 96 % | 85 % |
| 5 Chat & communication | 19 | 100 % | 68 % |
| 6 Marketplace | 19 | 84 % | 74 % |
| 7 Plans, billing & entitlements (7.4 excluded) | 28 | 75 % | 18 % |
| 8 Languages & markets | 18 | 100 % | 67 % |
| 9 Admin, privacy & security | 24 | 100 % | 71 % |
| 10 MCP & AI agents | 26 | 88 % | 38 % |
| 11 Education & learning | 10 | 90 % | 70 % |
| 12 Market intelligence | 6 | 100 % | 100 % |
| 13 Infrastructure & operations | 17 | 100 % | 59 % |

The 19 journeys (rows in brackets):

| # | Journey | State | Why |
|---|---|---|---|
| J-1 | Worker joins → onboarding → first journal entry → Living CV (1.1, 1.4, 2.19, 2.4) | complete | fresh-activation 2026-11-01 |
| J-2 | Journal entry → manager confirms / returns → confirmed on Living CV (2.20, 2.21, 2.31) | complete | journal-confirm 41478434884 2026-11-02 (4/4, decision 0028: own declaration, no self as independent confirmer, manager approval, hours once) |
| J-3 | Worker finds a need → raises a hand → company contacts → thread (4.3, 4.16, 5.4) | complete | company-chain 2026-11-01 |
| J-4 | Public job search → job page → save / hand-off to the source (4.4, 4.29) | complete | jobs-search 2026-10-28 |
| J-5 | Company joins → organization → first need → candidates → shortlist → contact (1.6, 4.1, 4.11, 4.12, 4.16) | complete | fresh-activation, company-talent-history 2026-11-01 |
| J-6 | Company invites a person → the person accepts → member (1.9, 1.4) | complete | invited-worker 41430482903 2026-11-02 (7/7: invitation hidden until the mailed proof, accepted on the network page, member as worker, journal → Living CV) |
| J-7 | Project → assign worker → hours on site → board → report (3.2, 3.6, 3.3, 2.23, 3.13) | complete | project-execution 41722638759 2026-11-03 |
| J-8 | Need → dates proposed → worker accepts → engagement (5.13) | complete | orders-bookings 41718546706 2026-11-03 |
| J-9 | Agency declares supply → client bridge → offer (4.15, 4.28) | complete | agency-chain 41717112150 2026-11-03, search-support-privacy 2026-11-01 |
| J-10 | Brigade offered and matched as a unit (3.7, 4.6, 4.7) | complete | brigade-formation 41350506578 2026-11-01 (19/19); product-truth link LIVE (#2917) |
| J-11 | Goods / service listed → found → requested → accepted → messages (6.1–6.3) | complete | marketplace 41729310761 2026-11-03 |
| J-12 | Institution → cohort → learner → practice → competency (11.1–11.7) — BASELINE learning-group journey | complete | 11.1, 11.3–11.6 learning-practice 2026-10-21/25; 11.2 learner join request cohort-join-request 41611766407 (6/6, 2026-11-03); 11.7 practice → authorised sign-off → competency → learner view recognition-chain 41617507405 (2026-11-03). Formal recognition of prior learning / qualification (11.10 RPL) is NOT part of this journey: owner decision D-15 (2026-11-02, confirmed 2026-11-03) makes it a separate, later ADVANCED stage — tracked as row 11.10, never an automatic qualification |
| J-13 | Buyer workspace → request → provider (6.4, 6.1) | complete | buyer-workspace 41713787541 2026-11-03 (10/10, B-3b); earlier: buyer-workspace 41480104268 2026-11-02 (9/9, non-customer → customer → provider request); next extension (request → offer/contract) is owner decision RED-1, draft #2946 |
| J-14 | Organization buys a plan without help (7.1, 7.5, 7.15, 7.28) | blocked | 7.15 hidden by design, 7.28 FAIL (owner/legal) |
| J-15 | Alert / e-mail about a new matching job without signing in (4.9, 5.7, 5.9) | partial | alert-mail 41488266687 2026-11-02 (9/9): matching-job alert e-mail arrives and opens signed out (4.9, 5.7 LIVE_VERIFIED); the weekly digest e-mail (5.9) is not yet observed in production |
| J-16 | Forgotten password → reset mail → new password (1.3) | complete | mail-reset 41428606490 2026-11-02 (2/2, the real reset mail in the QA mailbox) |
| J-17 | Install the native app from a store (8.15, 8.17, 8.18) | blocked | no store listing (owner accounts) |
| J-18 | Own data export / erasure request (9.4, 9.5, 9.6) | complete | search-support-privacy 2026-11-01, erasure 2026-10-19 |
| J-19 | Growth: potential capabilities + learning compass (2.29, 11.3) | complete | living-cv-growth 2026-11-01, learning-practice 2026-10-25 |

## Combined audit view — functions, SEO, GEO, search and design (2026-11-03)

Owner order 2026-11-03: one combined PASS / FAIL / BLOCKED / NOT VERIFIED register, tied to real production tests in Chrome;
new functions never stop the stabilization of the existing core user journeys. This view is part of this file, not a
second register. The function rows below keep their own status; this view reads them under a stricter rule.

**Rules of this view (binding for it):**

1. Every row has exactly one of **PASS / FAIL / BLOCKED / NOT VERIFIED**.
2. **PASS** needs production evidence: a `prod-qa-walk` run id (spec + date) or a Chrome production check (date, URL,
   viewport). For an infrastructure row, a production job run id against the production system counts (a walk cannot
   prove a backup). A CI run, an isolated local run, a code read or a bare "live" note is **NOT VERIFIED**.
3. A function's PASS falls to **FAIL** when the latest walk of its spec failed on a product assertion; a test defect
   already fixed on `main` leaves the row as it was and names the re-run.
4. Mapping from the function rows: `LIVE_VERIFIED` → PASS when the evidence names a production walk run or a Chrome
   production check, otherwise NOT VERIFIED; `PASS_CI_ONLY`, `NOT_VERIFIED`, `OPTIONAL_TEST` → NOT VERIFIED; `FAIL` → FAIL;
   `BLOCKED` → BLOCKED; `NOT_IMPLEMENTED` → BLOCKED when it waits on a named owner decision or an owner-gated RED draft,
   otherwise FAIL (not built). `DUPLICATE` rows are not counted.
5. SEO, GEO, search and design checks are run **signed out** (the 2026-11-04 rows: method under "How the 2026-11-04 rows were measured") (requests without cookies) on `https://labourmarket.ai`, build
   `a10b6c47`, 2026-11-03 20:00–20:30 UTC, in the desktop app's built-in Chromium browser. Phone checks name their
   viewport.

### Totals (functions 2026-11-03; SEO, GEO, search and UX/UI 2026-11-04)

| Dimension | Rows | PASS | FAIL | BLOCKED | NOT VERIFIED |
|---|---|---|---|---|---|
| Functions (288, per area below) | 288 | 162 | 9 | 60 | 57 |
| SEO (2026-11-07) | 10 | 8 | 1 | 1 | 0 |
| GEO (2026-11-07) | 6 | 5 | 0 | 0 | 1 |
| Internal search (2026-11-04) | 9 | 5 | 2 | 0 | 2 |
| UX/UI (2026-11-04; DS-1–DS-5 from 2026-11-03) | 15 | 12 | 3 | 0 | 0 |
| **All** | **328** | **192** | **15** | **61** | **60** |

Functions per area:

| Area | Rows | PASS | FAIL | BLOCKED | NOT VERIFIED |
|---|---|---|---|---|---|
| Identity, sign-up & organizations | 15 | 11 | 0 | 1 | 3 |
| Worker profile, Work Journal & Living CV | 37 | 29 | 1 | 5 | 2 |
| Company operations & projects | 36 | 33 | 0 | 0 | 3 |
| Demand, jobs & matching | 26 | 21 | 0 | 2 | 3 |
| Chat & communication | 21 | 13 | 1 | 4 | 3 |
| Marketplace | 22 | 13 | 0 | 7 | 2 |
| Plans, billing & entitlements | 30 | 1 | 2 | 15 | 12 |
| Languages & markets | 18 | 9 | 0 | 6 | 3 |
| Admin, privacy & security | 24 | 11 | 1 | 3 | 9 |
| MCP & AI agents | 26 | 8 | 1 | 14 | 3 |
| Education & learning | 10 | 7 | 1 | 2 | 0 |
| Market intelligence | 6 | 4 | 0 | 0 | 2 |
| Infrastructure & operations | 17 | 2 | 2 | 1 | 12 |
| **Functions** | **288** | **162** | **9** | **60** | **57** |

Where the stricter rule moves a function (all other rows map one to one):

- **#3004 agency fixes are NOT VERIFIED:** the docs-readiness live roster and the client-record authority fixes are applied and catalog-checked. documents-approvals has no agency step, and agency-chain does not open agency documents readiness or client records, so neither walk proves them. They have no function row of their own.
- **Marketplace 6.1–6.3 stay PASS:** walk 41721656743 (21:31 UTC, build `7f0f06583`) failed M-5 on a test race: the publish action was still queued when the walk closed the page. The walk-only fix #3028 re-ran green as 41729310761 (22:20 UTC, build `7f0f06583`).

- **6.4 buyer workspace stays PASS:** walks 41674630724 and 41676554374 (16:29 and 16:40 UTC) failed B-3b because they ran before #3003 was deployed (build `a10b6c47d`, 20:27 UTC). The re-run after the deploy, buyer-workspace 41713787541 (20:39 UTC), passed 10/10, B-3b included.
- **PASS instead of BLOCKED (1):** 13.5 database backup. Restore drill 41664420591 and full run 41665452921
  (2026-11-03) are production job runs (#3005). The function row below is updated.
- **NOT VERIFIED instead of PASS (34):** `LIVE_VERIFIED` rows whose evidence is production data, an owner action, a CI
  run, an isolated run or a bare "live" note, but no production walk run and no Chrome production check: 1.2, 1.12,
  1.13, 4.29, 5.14, 6.11, 6.16, 7.3, 7.16, 7.17, 8.1, 8.17, 8.18, 9.4, 9.6, 9.8, 9.10, 9.22, 9.23, 9.24, 10.18, 10.19,
  10.23, 12.2, 12.5, 13.2, 13.6, 13.7, 13.8, 13.10, 13.11, 13.12, 13.14, 13.15. Their production facts stay true in the
  rows; they only lack the evidence type this view asks for.
- **NOT_IMPLEMENTED (22):** 21 wait on a named owner decision or an owner-gated RED draft → BLOCKED. 5.20 user-defined
  automations has no owner gate and is not built → FAIL (not built; not a defect of anything that exists).

The 9 function FAILs: 2.24, 5.20 (not built), 7.27, 7.28, 9.25, 10.20, 11.8, 13.1, 13.17. Their reasons are in the
rows.

### How the 2026-11-04 rows were measured

Signed out, on `https://labourmarket.ai`, 2026-11-04 between 05:30 and 07:00 UTC. Two production checks:

- **Chrome:** the desktop app's built-in Chromium browser made same-origin `fetch` requests with `credentials: "omit"` and parsed each response with `DOMParser`. That covers status, canonical, hreflang, robots meta, JSON-LD, h1, title, description and `lang`.
- **Playwright Chromium, signed out** (`playwright-core` 1.60, headless, no cookies), for the Web Vitals and accessibility checks:
  - phone: 390×844, DPR 3, touch, 4× CPU throttle, +150 ms latency;
  - desktop: 1366×900, no throttle;
  - one cold load per page and one real click (h1, then a neutral spot) for INP;
  - axe-core 4.10.2, rule sets `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`.

The Web Vitals are lab numbers from one load each, not field data.

Database timings come from production `pg_stat_statements`, read-only. They are cumulative since the statistics reset of 2026-05-19, so a mean blends old and new code. No production data was written.

### SEO (signed out, 2026-11-04)

| ID | Check | Status | Evidence | Defect / blocker | Executor / next action |
|---|---|---|---|---|---|
| SEO-1 | robots.txt | PASS | Chrome: `/robots.txt` 200, `Allow: /`, 39 `Disallow` lines (private paths), 3 `Sitemap` lines, `Content-Signal: search=yes,ai-train=no,use=reference` | — | Coordinator: re-check on risk |
| SEO-2 | sitemap.xml: every URL | PASS | Chrome: 264 URLs (44 paths × lt, en, ru, nl, de, pl), 1,770 `xhtml:link` alternates. **All 264 were fetched:** 264 × 200, 264 self-canonical, 0 `noindex`, 7 hreflang each (6 + x-default), `<html lang>` matches the path 264/264, exactly one h1 264/264. Median 327 ms, max 1,176 ms | — | Coordinator: re-check on a sitemap change |
| SEO-3 | Jobs and questions sitemaps | PASS | Chrome: `/jobs-sitemap.xml` 200 with 55 shards. **All 55 shards fetched:** 55 × 200, **54,222 job URLs**, 7 alternates and a `lastmod` on every URL. 18 job URLs sampled (first, middle and last of shards 0, 10, 20, 30, 40, 54): 18 × 200, self-canonical, indexable. `/questions-sitemap.xml` 270 URLs; 30 sampled (every 9th): 30 × 200, self-canonical | keyset paging of the jobs sitemap is RED draft #2996, not applied | Owner: apply approval for #2996 |
| SEO-4 | Canonical | PASS | 312 pages (SEO-2, SEO-3 samples): each names itself. `/lt/jobs?q=…` names `/lt/jobs` | page 2+: SEO-8 | Coordinator: re-check on risk |
| SEO-5 | hreflang | PASS | 312 pages: 7 alternates each, x-default present | — | Coordinator: re-check on risk |
| SEO-6 | Structured data validity | PASS | 312 pages: **0 JSON-LD parse errors**. Organization + WebSite on every page; CollectionPage on `/jobs`; Article + BreadcrumbList on question pages; WebPage on job pages | no JobPosting by design (employer and place are members-only, 2026-08-24 rule) | Coordinator: re-check on risk |
| SEO-7 | Title and description length | PASS | Measured as a crawler, all 264 sitemap pages, build `c99d56bc`, 2026-11-07: **0 titles over 70, 0 descriptions over 170, 0 under 70** (before #3125: 0, 2, 12). Each country page's description adds its first evidence signal | 15 descriptions of 161–169 may be cut in a search result. No native review of the wording in ru, nl, de, pl | Coordinator: re-measure on a copy change |
| SEO-8 | Job board page 2+ | FAIL | Chrome: `/lt/jobs?page=2` and `/en/jobs?page=3` name `/lt/jobs` and `/en/jobs` as canonical. Their 20 cards differ from page 1 (0 of 20 overlap). Deep pages cost more: page 500 took 487 ms, page 1,500 916 ms, page 2,500 2,041 ms | fix in draft #2984. **Exact block:** the permission system refused the commit, the push to `fix/cc/jobs-pagination-canonical` and `gh pr ready 2984` ("Unrequested Commit in a Connected App"). The product gate is not the block: #2997 has the waiver. Left to do: merge main, `JOBS_SELF_CANONICAL_MAX_PAGE = 100` with one test, so crawlers aren't invited to deep OFFSET scans | Owner: approve exactly this push and `gh pr ready 2984`, or add a permission rule |
| SEO-9 | Country market pages | PASS | Chrome: `/{locale}/labour-market/{lt,lv,ee,pl,de,nl}`: 36 sitemap URLs, all 200, self-canonical, indexable | — | Coordinator: re-check on risk |
| SEO-10 | Country and city on signed-out job pages | BLOCKED | Chrome: cards read "Darbdavys ir vieta: prisijungus" | the database function is RED draft #2993, not applied. It waits for the owner's apply approval | Owner: apply approval for #2993 |

### GEO (generative engines, signed out, 2026-11-04)

| ID | Check | Status | Evidence | Defect / blocker | Executor / next action |
|---|---|---|---|---|---|
| GEO-1 | llms.txt | PASS | Chrome: `/llms.txt` 200, sections "How to read this site", "Public pages", "Facts to keep straight", "Connect an AI assistant", "Security", 11 links. Build `90e47a29` (#3070): names only `www.` as a redirect, states what a signed-out job page shows, that ads are not machine-translated and that services have no public pages | `/llms-full.txt` 404 (optional) | None |
| GEO-2 | Answer-engine crawlers may read the site | PASS | `/robots.txt`: `User-agent: *` allowed, `use=reference`. Search and answer agents are not named, so they are allowed | Cloudflare's managed block disallows the training crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, GoogleOther, Applebot-Extended). Owner choice (D-10), not a defect | Owner: confirm the crawler choice (D-10) |
| GEO-3 | Question-and-answer pages | PASS | 270 question pages; 30 sampled, all with Article + BreadcrumbList, self-canonical | — | Coordinator: re-check on risk |
| GEO-4 | Public market facts are quotable | PASS | SEO-9 | — | Coordinator: re-check on risk |
| GEO-5 | Key pages answer "what is it" in text | PASS | Chrome, main text: `/en/about` opens with "What is LabourMarket.ai / LabourMarket.ai is…" (829 words, 10 h2). `/en` 655 words, 13 h2; `/en/pricing` 899 words, states that prices are confirmed and online activation is not open; `/en/for-companies` 426 words | hub pages are thin: `/en/questions` 58 words, `/en/labour-market` 63 words, both without h2. No `FAQPage` markup on any page | GREEN executor: add text to the two thin hubs |
| GEO-6 | Entity consistency | NOT VERIFIED | Browser, build `c99d56bc`: on `/en`, `/de`, `/lt` and their `/about` pages the Organization has one `@id`, WebSite's publisher points to it, and its description is in the page's language. The old "operating platform" wording is gone from those `/about` pages. Hero text is the owner's (#3097) | 0 `sameAs`: no profile exists, so none is claimed. **Markup and copy only.** By owner's order it isn't PASS: nothing shows that any answer engine now describes the product correctly (AEO-2, AEO-4). `/ru`, `/nl`, `/pl` weren't read | Coordinator: read answer engines per AEO-4 |

### Internal search (2026-11-04)

| ID | Check | Status | Evidence | Defect / blocker | Executor / next action |
|---|---|---|---|---|---|
| SR-1 | `/jobs` free text, cold first query | FAIL | 2026-11-06: walk sr1-first-search 42306207666 on 2940847ed, 16 readings, scripted headless Chrome on a synthetic account, spanning stream import 42306344677: signed in and signed out, during and after that import, every search answered with no unavailable state. That import was small (1 new, 2 updated), so the reading after a large import is still NOT MEASURED, and SR-10 still fails. Timings are in the private record. Earlier: measured by J-13: see its report and RED draft #3024. `pg_stat_statements`: `search_public_vacancy_previews_v1` 35,752 calls, mean 560 ms, max 2,999 ms (the 3 s anon timeout) | fix is RED draft #3024, not applied. #3020's trigram index was rolled back (RC-A6, #3025). 2026-11-04: after the owner-approved manual VACUUM, pages read per search fell from 30.5k to 4.3k and signed-out Chrome searches took 0.43–0.92 s with no unavailable state; the status stays FAIL until the decay measurement after the 08:11 import and a cold check after idle. 2026-11-04 #3069 live (one scan over a new expiry-ordered index; ledger 20261104192157, 20261104192220; merged 8fb1043c1). First production result, build `8fb1043c`, 16 min after deploy, signed out: `byggarbetare` first search 970 ms (0 results), repeat 330 ms; `b` 382 ms; `ok` 763 ms; `qqxzv` 318 ms; no cancels. Positive, not a pass: first searches on terms with results and after two real imports are still to be measured, and SR-10 stands | GREEN executor: honest timeout state. Coordinator: new RED draft |
| SR-2 | `/jobs` free text, correctness and warm timing | PASS | Chrome, signed out, full HTML: `suvirintojas` 736 ms, `snickare` 451 ms, `el` 446 ms; **20 cards each, and 20 of 20 titles contain the term**. `developer` 0 cards with the honest "0 rasta… nerasta" state. No "unavailable" state | — | Coordinator: re-walk on risk |
| SR-3 | Profession filter | PASS | Chrome: `?profession=teacher` 306 ms, 20 cards; `handyman` 2 cards; `electrician` page 1 / page 2: 20 / 20 cards, 0 overlap | — | Coordinator: re-walk on risk |
| SR-4 | Search paging | FAIL | Chrome: unfiltered board p1/p2 0 overlap; `?q=el` p1/p2 0 overlap. **But a term that maps to a profession drops the page:** `/lt/jobs?q=elektrikas&page=2` redirects to `/lt/jobs?profession=electrician` and shows page 1 again (20 of 20 the same) | the board's own links never build this URL, so only shared or hand-made links meet it. Fix ready in draft #3123. Its tests pass; **its only failing check is the product gate**, as `jobs/page.tsx` is under the `public-acquisition-route-jobs` waiver, which takes a number only with the owner's words | Owner: "I approve adding ONLY PR 3123 to the existing public-acquisition-route-jobs waiver pullRequests list." Then the number goes in both pins |
| SR-5 | Jobs search walk | PASS | prod walk jobs-search 41663385778 (2026-11-03) | — | Coordinator: re-walk on risk |
| SR-6 | Job page from search, signed out | PASS | SEO-3: 18 job pages from the sitemap, 200, self-canonical, indexable | — | Coordinator: re-check on risk |
| SR-7 | Marketplace find | PASS | prod walk marketplace 41729310761 (2026-11-03): M-3 the buyer finds the shelf among goods; M-5 the buyer reaches the service from the market. `pg_stat_statements`: `marketplace_listings` reads 501 calls, mean 1.3 ms, max 79 ms; `org_capabilities_for_visible_listings_v1` 141 calls, mean 9.2 ms, max 314 ms | — | Coordinator: re-walk on risk |
| SR-8 | People / candidates search | NOT VERIFIED | no production walk searches people: company-chain C-2/U-3 opens the hand-raisers of a need, which is not a search. `pg_stat_statements`: `list_discoverable_worker_ids_v1` 572 calls, mean 41.9 ms, **max 2,536 ms**; `list_discoverable_worker_profiles_v1` 463 calls, mean 45.4 ms, max 1,021 ms | needs a walk step: the company searches by profession and place and finds the synthetic discoverable worker, and an undiscoverable one stays absent | Coordinator: add the walk step |
| SR-9 | Organizations directory search | NOT VERIFIED | no walk. `search_organizations_directory_v1` 16 calls in total, mean 11.0 ms, max 55 ms | needs a walk step | Coordinator: add the walk step |
| SR-10 | `/jobs` free text finds the ads that exist | FAIL | P0 accuracy defect, registered 2026-11-04 by owner order. The search reads the occupation label only: `byggarbetare` returns 0 while 12 live ads carry it in the title; `ok` is 1,288 by occupation and 1,527 by title. Existing behaviour, not caused by #3069 | owner requirement: search at least the job title, the profession and its synonyms, related specialities and suitable structured requirements, in several languages, ranked by relevance, with country and profession filters kept. Measure the cost first; no fix that brings back long first-search waits; test on scratch first. Conflict to settle: the 2026-08-24 directive keeps the hidden title out of anonymous matching | J-13: cost comparison, then a minimal safe fix for owner approval |

### UX/UI (signed out, 2026-11-04)

Pages: `/lt`, `/lt/jobs`, `/lt/for-companies`, `/lt/for-workers`, `/lt/pricing`, `/lt/questions`, `/lt/auth/signup`, `/lt/labour-market/lt`, `/en`, `/lt/jobs?q=suvirintojas`.

| ID | Check | Status | Evidence | Defect / blocker | Executor / next action |
|---|---|---|---|---|---|
| UX-1 | LCP, phone 390 px | PASS | Playwright: worst `/lt` **2,384 ms** (the h1); others 500–1,388 ms. Good is ≤ 2,500 ms | `/lt` is close to the limit under 4× CPU | Coordinator: re-measure on a home page change |
| UX-2 | LCP, desktop | PASS | Playwright: worst `/lt` 632 ms, others 208–536 ms | — | None |
| UX-3 | CLS, phone 390 px | FAIL | Playwright: **0.13 on 9 of 10 pages** (0 on `/lt/auth/signup`). Good is ≤ 0.1 | **Cause:** the analytics consent banner (`components/app/analytics-consent.tsx`, `placement="top"`) renders only after hydration, because the choice is read from the device. It is inserted above the header, and its 59 px pushed the header and the whole page down (desktop, 671 ms after start). It hits every first visit, crawlers included. The banner is in the page flow on purpose (owner decision 2026-11-03: never cover a field), so the fix is an owner choice. Either render it from the server when there is no choice cookie (the choice mirrored into a cookie), or reserve its space. This is consent UX, so no GREEN change was made | Owner: choose how the banner renders |
| UX-4 | CLS, desktop | PASS | Playwright: 0.043 on 9 of 10 pages, 0 on sign-up | same cause as UX-3, below the limit here | None |
| UX-5 | INP (one real interaction) | PASS | Playwright: worst 96 ms on phone (`/lt/for-companies`), 56 ms on desktop. Good is ≤ 200 ms | lab proxy: one click per page | None |
| UX-6 | Accessibility (axe, WCAG 2.x A/AA) | PASS | Playwright + axe at 390 px, signed out. Build `2afdfd8a`: 55 failing nodes on 44 public paths. **Build `07fd9fa7`, after #3030, #3038, #3039: 44 of 44 paths clean, 0 nodes** | signed-in pages have never been scanned (A11Y-2); only lt at 390 px was swept | Coordinator: add axe to a walk (A11Y-2) |
| UX-7 | No sideways scroll | PASS | Playwright: scroll width = viewport on all 20 loads | — | None |
| UX-8 | Runtime errors | PASS | Playwright: 0 `pageerror` and 0 console errors on all 20 loads | — | None |
| UX-9 | Not-found state | FAIL | Chrome: `/en/this-page-does-not-exist`, `/lt/jobs/00000000-0000-0000-0000-000000000000` and `/lt/auth/sign-up` answer 404 + `noindex` (correct). But the HTML is Next's `<html id="__next_error__">` shell: no `lang`, no h1, the home page's title. The branded page appears only through JavaScript | the not-found render falls into the error shell on the server. `/lt/auth/sign-up` (hyphen) could redirect to `/lt/auth/signup` | GREEN executor: render not-found on the server; redirect the hyphen address |
| UX-10 | One logo everywhere (browser tab) | FAIL | Owner defect 2026-11-04: the old ascending-bars logo shows in the browser tab. `app/favicon.ico` was last changed 2026-06-28 and all three sizes were the bars; Next emits it as `rel=icon sizes=16x16`. Looked at, and already the LM mark: `app/icon.svg`, `public/app-icon.svg`, `public/brand/lm-mark.svg`, `public/icon-*.png`, `public/icon-maskable-*.png`, `app/apple-icon.png`, the four `apps/mobile/assets` images. OG and Twitter images are a text wordmark; the 404 page and transactional e-mail carry no logo image; `placeholders/logo-mark.svg` is not used by any surface; no PDF library exists, CV and report printing is the browser printing the page. Sign-up and sign-in use the one `LmLogo`. **For the owner:** the source vectors (`docs/brand/source`) are orange `#FFA100`; the product shows the same geometry in gold under the visual direction approved 2026-09-09 (#1683). The wide main logo with the wordmark is not used as a file anywhere. Outside this repository and not checked: the Google OAuth consent logo and any Stripe invoice branding | Production, build af97d1b5 (coordinator, 2026-11-04). **PASS:** 9 files match the repo by hash; served favicon correct in real Chrome's cache mode; header mark seen on `/lt`; favicon 48 px, mobile icon, adaptive and splash images viewed. **FAIL:** `opengraph-image` has no mark; the 404 page has no logo at all (no old logo either). **NOT VERIFIED:** the real Chrome tab strip (screen access declined). Build cfa33d65 (coordinator, seen by eye): the 404 page shows the mark, and the share image shows the mark (LT, at `?check=1`); fix #3059. **New defect, same day:** `/lt/opengraph-image` was served `immutable, max-age=31536000` while `og:image` on most pages has no version in its URL, so browsers and crawlers can keep the old card for up to a year. The shorter cache is in the share-card cache PR; existing copies still need a versioned URL (`lib/seo/metadata.ts`, not touched, coordinator's call) or the owner's social debugger refresh. Stays FAIL until the cache header, e-mail, the printed CV, the signed-in header and the real tab strip are settled |
| DS-1 | Mobile sign-up at 360 px | PASS | Chrome, 360×780, 2026-11-03: no sideways scroll, full-width fields, 42 px submit, terms above the form | inputs use 14 px text, so iOS Safari zooms on focus | GREEN executor: 16 px inputs |
| DS-2 | Mobile sign-up at 390 px | PASS | Chrome, 390×844, 2026-11-03: no sideways scroll; `autocomplete` email / new-password; three labels | the same 14 px note | GREEN executor: 16 px inputs |
| DS-3 | Role navigation | PASS | prod walk role-routes 41329744822 (2026-11-01, 5 roles); prod walk mobile-surfaces 41317177981 (2026-11-01, 390 px, 6/6) | — | Coordinator: re-walk on risk |
| DS-4 | Customer door in "More" (#3003) | PASS | prod walk buyer-workspace 41713787541 (2026-11-03) B-3b | — | Coordinator: re-walk on risk |
| DS-5 | Job cards on a phone | PASS | Chrome, 390×844, 2026-11-03: 20 cards, 358 px wide, no sideways scroll, source language named | — | Coordinator: re-check on risk |

### Latest production walk per spec (2026-11-04 07:15 UTC)

The six walks of 2026-11-04 (buyer-workspace, documents-approvals, agency-chain, orders-bookings, project-execution, marketplace) all ran on one build, `d69327239` (deploy run 41784453076, finished 06:21:51Z; `/api/health` build `d6932723`), with no deploy between them.

From `gh run list --workflow prod-qa-walk.yml --limit 1000` (display title `prod-qa-walk <spec>`). The latest
non-cancelled run and the last success. "None in the last 1000 runs" means the window, which reaches back to 2026-10-17.

| Spec | Latest run | Date | Conclusion | Last success |
|---|---|---|---|---|
| admin-console | 40688059945 | 2026-10-28 | success | 40688059945 2026-10-28 |
| agency-chain | 41787046374 | 2026-11-04 | success | 41787046374 2026-11-04 |
| ai-off-honesty | 40301607964 | 2026-10-26 | success | 40301607964 2026-10-26 |
| alert-mail | 41488266687 | 2026-11-02 | success | 41488266687 2026-11-02 |
| billing-test-mode | 40668367143 | 2026-10-28 | failure | none in the last 1000 runs |
| brigade-formation | 41350506578 | 2026-11-01 | success | 41350506578 2026-11-01 |
| buyer-workspace | 41785749357 | 2026-11-04 | success | 41785749357 2026-11-04 |
| calendar-planning | 41656893141 | 2026-11-03 | success | 41656893141 2026-11-03 |
| chat-confirm-once | 41543973553 | 2026-11-02 | success | 41543973553 2026-11-02 |
| chat-continuity | 41322286924 | 2026-11-01 | success | 41322286924 2026-11-01 |
| cohort-join-request | 41611766407 | 2026-11-03 | success | 41611766407 2026-11-03 |
| company-chain | 41672031864 | 2026-11-03 | success | 41672031864 2026-11-03 |
| company-governance | 40687308231 | 2026-10-28 | success | 40687308231 2026-10-28 |
| company-talent-history | 41279265278 | 2026-11-01 | success | 41279265278 2026-11-01 |
| concurrency-probe | 40342223134 | 2026-10-26 | success | 40342223134 2026-10-26 |
| digest-setup | 41584540254 | 2026-11-03 | failure | none in the last 1000 runs |
| documents-approvals | 41786102850 | 2026-11-04 | success | 41786102850 2026-11-04 |
| employee-beta-gate | 41671159180 | 2026-11-03 | failure | 40045368369 2026-10-24 |
| fresh-activation | 41279196446 | 2026-11-01 | success | 41279196446 2026-11-01 |
| invited-worker | 41430482903 | 2026-11-02 | success | 41430482903 2026-11-02 |
| jobs-search | 41663385778 | 2026-11-03 | success | 41663385778 2026-11-03 |
| journal-confirm | 41478434884 | 2026-11-02 | success | 41478434884 2026-11-02 |
| lcp-locale-probe | 40328663291 | 2026-10-26 | success | 40328663291 2026-10-26 |
| learning-practice | 41668191663 | 2026-11-03 | success | 41668191663 2026-11-03 |
| living-cv-growth | 41281984217 | 2026-11-01 | success | 41281984217 2026-11-01 |
| lmc-csrf | 40210854856 | 2026-10-25 | success | 40210854856 2026-10-25 |
| mail-reset | 41428606490 | 2026-11-02 | success | 41428606490 2026-11-02 |
| manager-chat | 41658636784 | 2026-11-03 | success | 41658636784 2026-11-03 |
| marketplace | 41790404575 | 2026-11-04 | success | 41790404575 2026-11-04 |
| marketplace-goods-services | 41664268898 | 2026-11-03 | success | 41664268898 2026-11-03 |
| mcp-agents | 41307643008 | 2026-11-01 | success | 41307643008 2026-11-01 |
| mcp-chain | 41589289076 | 2026-11-03 | success | 41589289076 2026-11-03 |
| mcp-oauth-client | 41356233405 | 2026-11-01 | success | 41356233405 2026-11-01 |
| mobile-surfaces | 41317177981 | 2026-11-01 | success | 41317177981 2026-11-01 |
| notifications-inapp | 41312513056 | 2026-11-01 | success | 41312513056 2026-11-01 |
| orders-bookings | 41787683432 | 2026-11-04 | success | 41787683432 2026-11-04 |
| org-roster | 41318490491 | 2026-11-01 | success | 41318490491 2026-11-01 |
| profile-cv-history | 41282258795 | 2026-11-01 | success | 41282258795 2026-11-01 |
| project-context | 41661103338 | 2026-11-03 | success | 41661103338 2026-11-03 |
| project-execution | 41789372775 | 2026-11-04 | success | 41789372775 2026-11-04 |
| public-market-direction | 40186517027 | 2026-10-25 | success | 40186517027 2026-10-25 |
| public-org-locales | 40371836163 | 2026-10-26 | success | 40371836163 2026-10-26 |
| push | 41712000880 | 2026-11-03 | pending | 41548831709 2026-11-02 |
| recognition-chain | 41617507405 | 2026-11-03 | success | 41617507405 2026-11-03 |
| register-gaps | 41366955536 | 2026-11-02 | success | 41366955536 2026-11-02 |
| requirements-countries | 40209522348 | 2026-10-25 | success | 40209522348 2026-10-25 |
| role-routes | 41329744822 | 2026-11-01 | success | 41329744822 2026-11-01 |
| rota-repeat | 40659497014 | 2026-10-28 | success | 40659497014 2026-10-28 |
| schedule | 41299117311 | 2026-11-01 | failure | none in the last 1000 runs |
| search-support-privacy | 41283989921 | 2026-11-01 | success | 41283989921 2026-11-01 |
| sectors-languages | 40300823818 | 2026-10-26 | success | 40300823818 2026-10-26 |
| staff-review-notice | 41659492978 | 2026-11-03 | success | 41659492978 2026-11-03 |
| utilisation-planned-actual | 40295307338 | 2026-10-26 | success | 40295307338 2026-10-26 |
| ux-metrics | 40339788562 | 2026-10-26 | success | 40339788562 2026-10-26 |
| work-verification | 41287293886 | 2026-11-01 | success | 41287293886 2026-11-01 |
| worker-identity-split | 41318189146 | 2026-11-01 | success | 41318189146 2026-11-01 |
| worker-records-exports | 41312948857 | 2026-11-01 | success | 41312948857 2026-11-01 |

The five latest failures:

- **employee-beta-gate:** a test defect. G5 read the market anchors before Leaflet drew them. It is fixed on `main`: the spec now waits for an anchor or the empty state, and names this run. Its re-run is pending.
- **digest-setup:** the harness. The walk itself ran; the closing session-revoke step reported 5 of 6 sessions revoked. #2975 is open: a session the walk signed out itself counts as revoked.
- **schedule:** the walk brake. It was dispatched 0.4 min after a deploy, inside the 5 min quiet period, and is not re-run yet.
- **billing-test-mode:** the optional 7.4 scenario. The pilot organization is not armed in Stripe TEST.
- **push:** in progress at the time of writing.

The coordinator's queue, all green. On build `a10b6c47d` (deployed 20:27 UTC): buyer-workspace 41713787541, documents-approvals 41716118134 (its first try was a deploy-brake refusal, not the product), agency-chain 41717112150, orders-bookings 41718546706. On build `7f0f06583` (deployed 21:19 UTC, contains `a10b6c47d`): project-execution 41722638759 and marketplace 41729310761. The marketplace run 41721656743 before it failed M-5 on a test race, fixed walk-only in #3028.

### Real user blockers (2026-11-03)

These are what a real person meets now. Owner-gated scope and not-yet-built functions are listed apart.

1. **The first search for a new word on `/jobs` fails** (SR-1). The visitor waits 4–11 s and gets no jobs. #3069 is live since 2026-11-04 (first reading 970 ms); still FAIL with SR-10, the search misses ads that exist.
2. **Organizations cannot buy a plan without help** (J-14). 7.28 payee and terms are FAIL (owner/legal), and 7.15 is hidden by design.
3. **AI help and some e-mail are off in production** (13.17 env parity). This waits on the owner and legal.
4. **The native apps are not in the stores** (J-17, BLOCKED on the owner's store accounts).
5. **Workers who are engaged but not members cannot be assigned training** (11.8, owner decision, RED #2816).

Not user-facing, but open:

- SEO-8: job board pages 2+ fold into page 1 (draft #2984).
- 13.1: the production walk network path (72 h verdict 2026-11-04).
- 2.24, 9.25, 10.20: their reasons are in the rows; the security items stay out of the public repository.

### First real user's feedback (2026-11-04)

Source: the first real user's own observations, with screenshots, relayed by the owner on 2026-11-04. They are
observations, not confirmed defects, until the evidence column says otherwise. No personal data is kept here.
Checked in Chrome on production signed out, by read-only production queries, and by local renders with stub
data (synthetic fixtures, no real account). Signed-in production proof needs a QA-SYNTHETIC walk. Nothing below
is resolved until its fix is merged, deployed and proven.

Classes: `REAL_DEFECT`, `UX_OR_NAV`, `UNCLEAR_EXPLANATION`, `NEW_FEATURE_SUGGESTION`, `UNPROVEN`.

| ID | Observation | Class | Evidence | Linked rows | State |
|---|---|---|---|---|---|
| UF-1 | Translating a job ad into English fails | `UNCLEAR_EXPLANATION` | Machine translation is off by design (8.3, 7.14 BLOCKED). Production: 121,465 of 121,465 active ads have `translation_status = unavailable`, 0 stored translations. For a member, every foreign-language ad offers "Translate into …"; every click answers "could not be translated right now" (local render reproduces it). Signed out: no button and no description; the ad's own title is shown as published (`/en/jobs/48478a31-…` shows "Tømrer") | 8.3, 7.14, 4.4 | **PASS on production for lt, en, ru**, build cfa33d65, real Chrome, signed in, on real Norwegian and Swedish ads (coordinator, 2026-11-04): the note shows in all three, 0 translate buttons. **de, nl, pl not checked on production.** Fix #3034; machine translation itself stays owner-gated (8.3, 7.14) |
| UF-2 | Imported job descriptions show HTML tags | `REAL_DEFECT` | Production, active ads: NAV 8,835 of 8,835 store the description as HTML (`<section>`, `<p>`, `<strong>`, `<li>`), 5,049 with entities; Arbetsförmedlingen 8 with tags, 215 with entities. The job page renders the stored string as text, so the tags are **escaped (no XSS)** but shown. Local render of a NAV-shaped ad: before = the raw `<section id="arb-aapningstekst"> <p>…` string, after = paragraphs and bullets | 4.4 | **PASS on production**, build af97d1b5, real Chrome, signed-in profile (coordinator, 2026-11-04). Norwegian ad e6b812d2: 0 visible tags, 0 raw entities, 16 bullets; its stored description still holds its HTML (read-only SQL). Swedish ad 923d7c2c: 0 visible tags, 0 raw entities; its stored text still holds entities. Fix #3033: plain-text reading in the member's read, the stored original verbatim. Repeatable walk step J-7: #3060, not run yet |
| UF-3 | CV import extracts only part of the data | `REAL_DEFECT` | Free parser on a synthetic CV: "Anglų B2, rusų gimtoji" gave Russian **B2** (level read from the whole line); "… rengimo centras" (training centre) filed as **work history**; the multi-line PDF layout (title / company / dates on separate lines) loses the title and the dates and uses the company as the title. The review shows no extraction summary and never shows the parser's per-item confidence; an item can only be confirmed or discarded (the language level is the one editable field) | 2.3, 2.5, 2.7, 2.9, 10.8 | OPEN until proven on production. Merged, seen locally on synthetic data: language level per language and training-centre case (#3035), multi-line layout (#3042), confidence line (#3044), unrecognised lines shown (#3045), training and education apart (#3054), editing a field before saving (#3055). What reaches the Living CV: an imported job read only "Darbuotojas", its title lost (#3084); a stated year printed as a full invented date ("2018-01-01", dates PR). Repeatable walk step P-6: #3060, not run yet |
| UF-4 | Sign-up takes too long | `UX_OR_NAV` | From a job ad (`/lt/auth/signup?next=/lt/jobs/…`): 3 social buttons or 3 fields (e-mail, password, repeat password), a password rule of 8+ characters with an uppercase letter, a digit and a special character, then onboarding step 1 (intent / role) and step 2 (name, country, profession; an institution for a learner). Searching jobs needs no account; employer, place and how to apply need one. Not needed to reach the ad's details: the repeated password (a show-password toggle exists), the role step when the person came from a job ad, and profession / country before the first look | 1.1, 1.4 | PROPOSAL (one journey): ad → account (e-mail + password or one social button) → straight back to the ad with the worker intent implied; name, country and profession asked later in context. Auth-core and onboarding touch: owner review first |
| UF-5 | Education institutions should be searchable | `NEW_FEATURE_SUGGESTION` | The institution is free text in three places (onboarding learner step, profile education 2.7, journal learning entry); no search exists. Institutions are already organizations with an education capability (ARCH-1: INSTITUTIONS node realised by existing capabilities) | 2.7, 11.1 | PROPOSAL: one combobox (the onboarding country combobox pattern) over public education organizations, always keeping "use what I typed"; the name stays stored as typed, an optional organization link is a later additive migration |
| UF-6 | Calendar MONTH / YEAR: what they mean | `UNCLEAR_EXPLANATION` | `/dashboard/planning`: the view chips (Darbotvarkė, Diena, Savaitė, Mėnuo, Metai) switch the view; local render: the year view shows 12 month tiles, each "N įrašų" ("N records"), opening that month; the month view is a 42-cell grid with a legend (journal filled / worked, not filled / confirmed). The year tile does not say what a record is. **No production walk opens the month or year view** (calendar-planning covers the agenda) | 3.14, 5.11 | OPEN: name what is counted on the year tile; add month/year steps to the calendar-planning walk. Correctness of the counts is `UNPROVEN` in production |
| UF-7 | "Jobs" vs "Job offers" is confusing | `UNCLEAR_EXPLANATION` | One public job-ad board, several names per locale. LT: nav "Darbo skelbimai", board heading "Laisvos darbo vietos", landing tile "Darbai", dashboard "Darbo galimybės". EN: "Jobs", "Open jobs", "Jobs & vacancies", "Work opportunities", and "Offers" (commercial proposals) next to them. Same pattern in ru, nl, de, pl. "Opportunities" is deliberately wider than job ads (A-13), but nothing says so | 4.4, 8.1 | PROPOSAL: one glossary decision per locale (nav label = board heading for job ads; "opportunities" explained as work, services and projects; "Offers" named as commercial offers). Copy across 6 locales and the board's SEO heading: owner copy decision |

## FAIL and BLOCKED triage (2026-11-04)

Owner order 2026-11-04, step 3. Every row that the combined audit view counts as FAIL (11) or BLOCKED (61) gets exactly one class. This sorts the rows; it changes no status. A row becomes PASS only on a production proof.

Classes:

- `USER_BLOCKER_WEB`: a real worker, employer, customer or agency cannot finish a core action on the web today without help or without an error.
- `OWNER_GATED`: waits on an owner, legal, billing, AI or e-mail decision or credential. Paid plans, AI help and e-mail stay off until security, legal and functional tests pass. Items already approved are not asked again.
- `INFRA`: hosting, operations or security; details stay in the private record.
- `OPTIONAL_OR_UNPLANNED`: not needed for a core scenario.
- `TEST_ONLY`: the test harness cannot prove it; the product is not shown to fail.

| Class | FAIL | BLOCKED | Total |
|---|---|---|---|
| `USER_BLOCKER_WEB` | 2 | 0 | 2 |
| `OWNER_GATED` | 4 | 44 | 48 |
| `INFRA` | 4 | 2 | 6 |
| `OPTIONAL_OR_UNPLANNED` | 2 | 13 | 15 |
| `TEST_ONLY` | 0 | 2 | 2 |
| **All** | **12** | **61** | **73** |

### USER_BLOCKER_WEB, ranked by how many people it reaches

1. **SR-1: the first `/jobs` search for a word that is not a profession name times out.** It reaches every visitor who types free text: signed out, workers and agencies. Profession words already redirect to the working profession filter. #3069 is live since 2026-11-04 and the first production reading is 970 ms; SR-1 stays FAIL, see SR-1 and SR-10.
   - GREEN, now: when the free-text read times out, show the honest message together with the profession filter and the nearest profession matches (the existing profession resolver), instead of a page with no jobs.
   - RED, in a new draft: the search index fix. #3020 was rolled back and #3024 was closed: after about 5 calls the cached generic plan took 16–26 s for 1–2 character terms. The new draft must carry the plan-cache proof that #3025 requires (at least 10 calls per term on one connection, under both auto and force_generic_plan).

No other FAIL or BLOCKED row stops a core web action today. The earlier list of real user blockers was: plan purchase, AI and e-mail, native apps, and training for non-members. Under this order those are `OWNER_GATED`, because each waits on an owner, legal or credential step that the order keeps off on purpose.

### Every row

| ID | Function / check | Status | Class | Reason | Evidence | Executor / next action |
|---|---|---|---|---|---|---|
| SR-1 | `/jobs` free text, cold first query | FAIL | `USER_BLOCKER_WEB` | a word that is not a profession name times out: the visitor gets "the job board did not answer in time" and no jobs | Chrome production check 2026-11-04, build `3a9bcdef`, desktop, signed out: `/lt/jobs?q=byggarbetare` 3.6 s to first byte and the timeout message; `lagerarbetare` 4.8 s. Profession words (`betonuotojas`, `plyteliu`) redirect to the profession filter and answer in 0.4–1.0 s | GREEN executor: honest timeout state. #3069 live 2026-11-04: first production search 970 ms, see the SR-1 row above; stays FAIL until SR-10 is fixed and the import readings are in |
| SR-10 | `/jobs` free text finds the ads that exist | FAIL | `USER_BLOCKER_WEB` | a visitor gets 0 or too few results for ads that exist, because only the occupation label is searched | `byggarbetare` 0 results with 12 live ads carrying it in the title (production, 2026-11-04) | J-13: cost comparison, then a fix for owner approval |
| 1.8 | Multi-capability organization | BLOCKED | `OWNER_GATED` | owner decision ORG-2 (one organization with several capabilities) | register row; no production test until the decision | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.10 | External profile links | BLOCKED | `OWNER_GATED` | per-company grant for external links, RED #2471 | RED draft #2471, not applied | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.27 | Org historical evidence import | BLOCKED | `OWNER_GATED` | owner decision ARCH-5 (organization history import) | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.28 | Historical consolidation | BLOCKED | `OWNER_GATED` | 165 historical dates wait for the owner OK on RED #2362 | RED draft #2362 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.30 | Voice Work Journal | BLOCKED | `OWNER_GATED` | voice journal needs a speech-to-text host; the typed journal works | typed journal: prod walk fresh-activation 41279196446 (J-1) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.37 | Subject refuses an imported record | BLOCKED | `OWNER_GATED` | owner decision ARCH-5; exists only as the blocker of 2.27 | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.18 | Employer data disclosure grant | BLOCKED | `OWNER_GATED` | employer disclosure grant, RED #2471 | RED draft #2471 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 4.22 | 3 free profile views + VIP | BLOCKED | `OWNER_GATED` | 3 free profile views + VIP: billing figures, RED #2474 | RED draft #2474 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.5 | Message translation | BLOCKED | `OWNER_GATED` | message translation is AI; the original text is shown and labelled | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 5.8 | Push | BLOCKED | `OWNER_GATED` | push needs the owner VAPID keys and a real delivery test; the channel is off by flag | migration 20261023190255 applied, 0 subscriptions (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 6.21 | /business/[slug] | BLOCKED | `OWNER_GATED` | public business page needs an owner-approved RED RPC | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.6 | Billing recovery cron | BLOCKED | `OWNER_GATED` | billing recovery cron: paid plans stay off; needs the owner VPS cron line + flag | #2696 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.8 | LMC credit ledger | BLOCKED | `OWNER_GATED` | LMC credit ledger: owner design, LMC owner-locked | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.9 | LMC top-ups, VIP, ai_plus, tiers | BLOCKED | `OWNER_GATED` | LMC top-ups, VIP, ai_plus, tiers: owner prices | registry NOT_BUILT | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.11 | Deferred plans | BLOCKED | `OWNER_GATED` | deferred plans: owner prices | registry NOT_BUILT | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.12 | AI cost metering | BLOCKED | `OWNER_GATED` | AI cost metering waits on the AI runtime (10.6) | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.14 | Vacancy translation entitlement | BLOCKED | `OWNER_GATED` | vacancy translation entitlement needs AI | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.15 | EUR 99 subscription checkout | BLOCKED | `OWNER_GATED` | EUR 99 checkout hidden by design during the pilot; VAT path RED #2685 | RED draft #2685 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.19 | Refunds and disputes | BLOCKED | `OWNER_GATED` | refunds and disputes: owner refund policy, then a TEST-mode walk | 0 events in production (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.20 | Invoices inside LM | BLOCKED | `OWNER_GATED` | in-app invoices: paid plans stay off; RED #2682 adds the plan name and amount | Stripe portal invoice exists (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.23 | LMC top-up | BLOCKED | `OWNER_GATED` | LMC top-up: owner packages, VAT, refund | registry NOT_BUILT | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.24 | LMC granted once per payment | BLOCKED | `OWNER_GATED` | LMC grant per payment: depends on 7.23 | registry NOT_BUILT | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.26 | LMC spend + reversal | BLOCKED | `OWNER_GATED` | LMC spend + reversal: depends on 7.23 | registry NOT_BUILT | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.27 | Free VIP for approved employers | FAIL | `OWNER_GATED` | free VIP for approved employers: RED #2474 | RED draft #2474 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.28 | Payee and terms | FAIL | `OWNER_GATED` | payee and terms: renewal, cancellation, refund and withdrawal clauses wait on owner/legal; paid plans stay off until then | production terms page (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 7.31 | Free + two paid tiers for workers AND for companies | BLOCKED | `OWNER_GATED` | free + two paid tiers: owner final tiers and prices (separate approval) | owner product goal 2026-11-01 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.3 | Machine translation | BLOCKED | `OWNER_GATED` | machine translation is AI; originals shown and labelled | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.5 | Nine priority launch markets | BLOCKED | `OWNER_GATED` | five more markets need about 9,400 strings each translated and reviewed; the six active locales are complete | catalog audit 2026-10-28 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.13 | Native app | BLOCKED | `OWNER_GATED` | native apps run against production; the store accounts are the owner's | rows 8.17 / 8.18 (Android, iOS on production) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.14 | App links | BLOCKED | `OWNER_GATED` | app links need the store accounts | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 8.15 | Mobile store release | BLOCKED | `OWNER_GATED` | store release needs the owner store accounts + ARCH-6 | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 9.16 | External referral API | BLOCKED | `OWNER_GATED` | external referral API needs partner tokens; signed-out callers get 401 as they should | row evidence: anonymous 401 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.4 | MCP scopes | BLOCKED | `OWNER_GATED` | MCP OAuth scopes: security RED, design draft #2923, owner decision X-2 | RED draft #2923 | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.5 | ChatGPT/Claude listings | BLOCKED | `OWNER_GATED` | ChatGPT / Claude directory listings: owner portals | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.6 | AI runtime | BLOCKED | `OWNER_GATED` | AI runtime off | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.7 | Conversation intent LLM | BLOCKED | `OWNER_GATED` | conversation intent LLM: depends on 10.6 | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.8 | CV AI structuring | BLOCKED | `OWNER_GATED` | CV AI structuring: depends on 10.6; free CV extraction works without AI | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.9 | Journal AI suggestions | BLOCKED | `OWNER_GATED` | journal AI suggestions: depends on 10.6 | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.10 | Explanation AI | BLOCKED | `OWNER_GATED` | explanation AI: depends on 10.6 | AI help stays off until security, legal and functional tests pass; the honest off state is proven by prod walk ai-off-honesty 40301607964 (2026-10-26, 13/13) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.21 | Eurostat import | BLOCKED | `OWNER_GATED` | Eurostat import has no scheduler; owner to allow the scheduled import | data dated 2026-07-15 (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.22 | the partner organization integration | BLOCKED | `OWNER_GATED` | partner organization integration: owner | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.24 | Self-hosted STT/translate | BLOCKED | `OWNER_GATED` | self-hosted speech/translation: owner deploy | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.25 | Cloudflare AI adapter | BLOCKED | `OWNER_GATED` | Cloudflare AI adapter: owner key | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 10.26 | OpenAI apps challenge | BLOCKED | `OWNER_GATED` | OpenAI apps challenge: owner token | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.8 | Training & certification register | FAIL | `OWNER_GATED` | training for engaged non-member workers: owner product decision, RED #2816; members can be assigned | prod walk company-governance 40687308231 (T-5 green for members) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 11.9 | Human-in-loop learning review | BLOCKED | `OWNER_GATED` | human-in-loop learning review: owner parked the nav door | register row | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 13.17 | Env parity after hosting move | FAIL | `OWNER_GATED` | AI and some e-mail are off after the hosting move; they stay off until security, legal and functional tests pass (owner + legal) | read-only check 2026-10-27 (row evidence) | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| SEO-10 | Country and city on signed-out job pages | BLOCKED | `OWNER_GATED` | scope approved by the owner 2026-11-03; the database function waits for the separate apply approval of RED #2993 (no new approval needed for the scope) | RED draft #2993, not applied | Owner: the decision in the Reason column. Then the coordinator applies or walks |
| 2.24 | Experience records + disputes | FAIL | `INFRA` | open moderation/security item EVID-6; the record and dispute flow keeps its earlier production proof | details in the private record | Coordinator: private record |
| 5.16 | Owner Telegram alerts | BLOCKED | `INFRA` | owner-only operations alerts; needs the owner bot token | register row; not a user feature | Coordinator: private record |
| 9.25 | CodeQL / dependency alerts | FAIL | `INFRA` | CodeQL / dependency alerts triaged | details in the private record | Coordinator: private record |
| 10.20 | Vacancy retention | FAIL | `INFRA` | vacancy retention purge fails closed on a permission item | dry run 39936626534; details in the private record | Coordinator: private record |
| 13.1 | VPS hosting + auto-deploy | FAIL | `INFRA` | runner-to-VPS network path; 72 h verdict due 2026-11-04 | #2911; details in the private record | Coordinator: private record |
| 13.9 | Supabase GitHub integration | BLOCKED | `INFRA` | Supabase GitHub integration: owner setting | register row | Coordinator: private record |
| 5.20 | User-defined automations | FAIL | `OPTIONAL_OR_UNPLANNED` | user-defined automations: a vision item, not built, no core journey needs it | vision §12/§19 | None now. Owner schedules it if wanted |
| 5.21 | SMS / WhatsApp channels | BLOCKED | `OPTIONAL_OR_UNPLANNED` | SMS / WhatsApp: a later channel that needs a paid provider | vision §11 | None now. Owner schedules it if wanted |
| 6.12 | Cross-border deals | BLOCKED | `OPTIONAL_OR_UNPLANNED` | cross-border deals module: not built; 6.6 contracts + 6.11 readiness may suffice (owner to say) | registry NOT_BUILT | None now. Owner schedules it if wanted |
| 6.13 | Orders goods purchase | BLOCKED | `OPTIONAL_OR_UNPLANNED` | goods purchase orders: not built; only organization plans take payments | registry NOT_BUILT | None now. Owner schedules it if wanted |
| 6.14 | Logistics | BLOCKED | `OPTIONAL_OR_UNPLANNED` | logistics: not built, depends on 6.13 | registry NOT_BUILT | None now. Owner schedules it if wanted |
| 6.22 | Housing / accommodation | BLOCKED | `OPTIONAL_OR_UNPLANNED` | housing: a vision item, owner scope first | vision §8 | None now. Owner schedules it if wanted |
| 6.23 | Service order rating, cancellation and dispute | BLOCKED | `OPTIONAL_OR_UNPLANNED` | service-order rating and dispute: not built; request, accept and withdraw work | prod walk marketplace 41729310761 (2026-11-03, 7f0f06583) | None now. Owner schedules it if wanted |
| 6.24 | Swipe-style B2C discovery feed | BLOCKED | `OPTIONAL_OR_UNPLANNED` | swipe discovery feed: lower-confidence pattern, owner to confirm | decision 0013 | None now. Owner schedules it if wanted |
| 7.30 | Invoices + work-acceptance acts from the Work Journal | BLOCKED | `OPTIONAL_OR_UNPLANNED` | invoices and acceptance acts from the journal: owner invoicing rules per country, then build | vision §10 | None now. Owner schedules it if wanted |
| 9.19 | Admin import sandbox | BLOCKED | `OPTIONAL_OR_UNPLANNED` | admin import sandbox: an optional admin flag, off and labelled | owner admin session 2026-10-25 (Chrome) | None now. Owner schedules it if wanted |
| 9.20 | Admin intelligence inspector | BLOCKED | `OPTIONAL_OR_UNPLANNED` | admin intelligence inspector: an optional admin flag, off and labelled | owner admin session 2026-10-25 (Chrome) | None now. Owner schedules it if wanted |
| 10.15 | Agents OS runtime | BLOCKED | `OPTIONAL_OR_UNPLANNED` | internal agents runtime: architecture only, owner AGENT-1..4 | registry NOT_BUILT | None now. Owner schedules it if wanted |
| 10.16 | AI agents as participants | BLOCKED | `OPTIONAL_OR_UNPLANNED` | AI agents as market participants: owner AGENT-1..4 | registry NOT_BUILT | None now. Owner schedules it if wanted |
| 11.10 | RPL equivalence structure | BLOCKED | `OPTIONAL_OR_UNPLANNED` | RPL equivalence structure: deferred under ARCH-2 until an assessor and requirement set are named | decision 0028 §D-15 | None now. Owner schedules it if wanted |
| SEO-8 | Job board page 2+ canonical | FAIL | `OPTIONAL_OR_UNPLANNED` | pages 2+ fold into page 1 for crawlers; no user action breaks, and the jobs still reach search engines through the sitemap | Chrome production check 2026-11-03; fix in draft #2984; waiver on main since #2997; the push is refused by the permission system | Owner: approve the push and `gh pr ready 2984`, or add a permission rule |
| 7.7 | Manual pilot grant (admin) | BLOCKED | `TEST_ONLY` | the walk has no admin session; the grant itself was used for the pilot (paid 2026-10-23) | register row | Coordinator: fix the walk harness, re-run |
| 8.9 | Public org profile | BLOCKED | `TEST_ONLY` | no organization has published a public profile, so the walk skips S-10; the product is not shown to fail | prod walk public-org-locales 40205429467 (S-10 skipped) | Coordinator: fix the walk harness, re-run |

The six re-runs of 2026-11-04 ran on build `d69327239`; their run ids are in "Latest production walk per spec".

### Open checks from the B2 / B6 code read (2026-11-04)

These came out of reading the code. Security details stay in the private record. No status changes here: a row moves only on a production proof.

| Item | Found | State | Next action |
|---|---|---|---|
| `/business/` website link (6.21) | The setter stores free text, so the link needed a check where it is rendered | fix in #3046 (GREEN); nothing published is affected | after merge and deploy: a production walk with a synthetic published profile |
| Personal offerings on `/business/` (6.21) | `service_offerings` has no organization column, so its read returns the owner's personal offerings | section removed in #3046; the read function is unchanged | RED draft: add `organization_id` to `service_offerings`, or narrow the read |
| Recurring order during the pilot pass (7.15) | Only the UI withheld the order; the route had no check | RED draft #3047, `needs-human-gate`; not merged, nothing enabled | owner approval of #3047 |
| Partner lead store (10.22) | Integration probe 41796163605 (2026-11-04 08:00 UTC): `UNREACHABLE`; 00:54 UTC was READY. The partner's site answered; its database check failed or took over 4 s | one failure; no later run at the time of writing | read the next scheduled run. If it fails again: the owner checks the partner's database |

## Whole-project audit by role and dimension (2026-11-04)

Owner order 2026-11-04: continue the audit beyond the six core tests, in this one register. Every row has a status, its evidence, the responsible executor and the next action.

**How to read it:**

- The rules of the combined audit view apply: PASS needs a named production walk run, a Chrome production check or a production job run. A pass in CI alone is NOT VERIFIED.
- These rows are **views over the function rows**, plus new checks. They overlap, so they are not added to the function total.
- A walk row names the latest run. Only the six 2026-11-04 walks are tied to one build (`d69327239`); the older runs prove the function on the build of their date.
- Measured on 2026-11-04 on builds `2afdfd8a` and `4c58f60a` (`/api/health`). Signed out unless a walk is named. Method: "How the 2026-11-04 rows were measured" above, plus a sweep of all 44 public paths at 390 px.
- Function rows that are PASS have one rule: the executor is the coordinator, and the next action is a re-walk only when a change puts that function at risk. All other function rows carry their executor and next action in "Every row" under the triage section (FAIL, BLOCKED) and in "NOT VERIFIED function rows" below.
- Security details stay in the private record.

### Summary per dimension

| Dimension | Rows | PASS | FAIL | BLOCKED | NOT VERIFIED |
|---|---|---|---|---|---|
| Real-user scenarios | 16 | 8 | 4 | 2 | 2 |
| UX at phone size | 5 | 3 | 2 | 0 | 0 |
| Roles and life stages | 38 | 22 | 4 | 7 | 5 |
| Search | 5 | 1 | 1 | 0 | 3 |
| CV, Journal, projects, HR, organization | 16 | 8 | 2 | 2 | 4 |
| Indexing and AEO | 25 | 9 | 7 | 1 | 8 |
| Mobile, languages, accessibility | 12 | 5 | 2 | 2 | 3 |
| Payments | 4 | 1 | 1 | 1 | 1 |
| Notifications | 4 | 2 | 0 | 1 | 1 |
| AI | 3 | 2 | 0 | 1 | 0 |
| Security | 3 | 2 | 1 | 0 | 0 |
| Delivery | 2 | 0 | 2 | 0 | 0 |
| **This section** | **133** | **63** | **26** | **17** | **27** |

Roles:

| Role | Rows | PASS | FAIL | BLOCKED | NOT VERIFIED |
|---|---|---|---|---|---|
| Worker | 7 | 5 | 0 | 2 | 0 |
| Learner | 5 | 3 | 0 | 1 | 1 |
| Job seeker | 7 | 3 | 3 | 1 | 0 |
| Employer | 6 | 4 | 1 | 0 | 1 |
| Customer | 4 | 2 | 0 | 2 | 0 |
| Agency | 2 | 1 | 0 | 0 | 1 |
| Education organization | 4 | 3 | 0 | 0 | 1 |
| Admin | 3 | 1 | 0 | 1 | 1 |

The SEO, GEO, internal search and UX/UI tables and the 288 function rows are counted under "Totals" in the combined audit view.

### Roles and life stages

| ID | Role / life stage | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| W-1 | Worker: new person, sign-up to first journal entry | PASS | prod walk fresh-activation 41279196446 (2026-11-01) | Coordinator: re-walk on risk. Sign-up length is UF-4 |
| W-2 | Worker: invited person, mailed link, accepts, first entry, deletes the account | PASS | prod walk invited-worker 41430482903 (2026-11-02) I-0..I-6 | Coordinator: re-walk on risk |
| W-3 | Worker: records work, employer confirms | PASS | prod walk journal-confirm 41478434884 (2026-11-02) | Coordinator: re-walk on risk |
| W-4 | Worker: Living CV grows from real work | PASS | prod walks living-cv-growth 41281984217, profile-cv-history 41282258795 (2026-11-01) | Coordinator: re-walk on risk |
| W-5 | Worker: takes records out (CSV, hours, gallery) | PASS | prod walk worker-records-exports 41312948857 (2026-11-01) | Coordinator: re-walk on risk |
| W-6 | Worker: disputes or refuses a record | BLOCKED | 2.37 waits on owner decision ARCH-5; 2.24 open item EVID-6 (private record) | Owner: ARCH-5. Then a GREEN executor builds and the coordinator walks |
| W-7 | Worker: native phone app | BLOCKED | 8.17 and 8.18 ran against production on 2026-11-02 (runs 41451882387, 41451829006); 8.15 not in the stores | Owner: store accounts (Google Play, Apple, EAS) |
| L-1 | Learner: joins by the institution's link | PASS | prod walk learning-practice 41668191663 (2026-11-03) L-2..L-5 | Coordinator: re-walk on risk |
| L-2 | Learner: finds a group and asks to join | PASS | prod walk cohort-join-request 41611766407 (2026-11-03) | Coordinator: re-walk on risk |
| L-3 | Learner: practice day is signed off and recognized | PASS | prod walk recognition-chain 41617507405 (2026-11-03) | Coordinator: re-walk on risk |
| L-4 | Learner moves to work: the same history continues into job search | NOT VERIFIED | no walk follows one person from learner to job seeker | Coordinator: add a walk step on the recognition-chain person |
| L-5 | Learner: earlier learning recognized as equivalent (RPL) | BLOCKED | 11.10, RED schema | Owner: decide the RPL structure |
| JS-1 | Job seeker: finds jobs by a known word, signed out | PASS | SR-2, SR-3 (Chrome 2026-11-04); prod walk jobs-search 41663385778 (2026-11-03) | Coordinator: re-walk on risk |
| JS-2 | Job seeker: first search for a new word | FAIL | SR-1: the visitor gets no jobs when the read times out | GREEN executor: honest timeout state with profession matches. #3069 live; see SR-1 and SR-10 |
| JS-3 | Job seeker: reads the imported ad | FAIL | UF-2: NAV ads show raw HTML tags (8,835 active ads) | Coordinator: assign #3033 (quality and CodeQL red), then Chrome check |
| JS-4 | Job seeker: translates a foreign ad | FAIL | UF-1: every member's click answers "could not be translated"; 0 stored translations | Coordinator: assign #3034. Owner: AI keys for real translation (8.3) |
| JS-5 | Job seeker: saved search and mailed alert | PASS | prod walk alert-mail 41488266687 (2026-11-02) | Coordinator: re-walk on risk |
| JS-6 | Job seeker: raises a hand and is contacted | PASS | prod walk company-chain 41672031864 (2026-11-03) C-1..C-4 | Coordinator: re-walk on risk |
| JS-7 | Job seeker: sees country and city before sign-in | BLOCKED | SEO-10, RED draft #2993 | Owner: apply approval. Coordinator applies |
| E-1 | Employer: sets up the organization, first need | PASS | prod walk fresh-activation 41279196446 (2026-11-01) | Coordinator: re-walk on risk |
| E-2 | Employer: sees candidates and contacts them | PASS | prod walk company-chain 41672031864 (2026-11-03) C-2, C-3 | Coordinator: re-walk on risk |
| E-3 | Employer: shortlist with internal notes | PASS | prod walk company-talent-history 41279265278 (2026-11-01) K-3, K-4 | Coordinator: re-walk on risk |
| E-4 | Employer: proposes dates, worker accepts | PASS | prod walk orders-bookings 41787683432 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| E-5 | Employer: decides to hire and closes the need | NOT VERIFIED | 4.30: decision and history UI not finished | GREEN executor: build the UI. Coordinator: walk |
| E-6 | Employer: buys a plan alone | FAIL | 7.28 payee and terms; 7.15 hidden by design during the pilot | Owner + legal: clauses and approval. Paid plans stay off until then |
| C-1 | Customer: record and a request in the own workspace | PASS | prod walk buyer-workspace 41785749357 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| C-2 | Customer: finds goods and services, asks the seller | PASS | prod walk marketplace 41790404575 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| C-3 | Customer: buys goods with payment | BLOCKED | 6.13 not built; RED #2713 | Owner: scope decision |
| C-4 | Customer: accepted request becomes a proposal | BLOCKED | RED draft #2946 | Owner: apply approval |
| A-1 | Agency: roster, client, shared need, offer, decision | PASS | prod walk agency-chain 41787046374 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| A-2 | Agency: documents readiness and client records (#3004) | NOT VERIFIED | applied and catalog-checked; no walk opens these two surfaces | Coordinator: add two steps to agency-chain |
| ED-1 | Education organization: programme, cohort, learner | PASS | prod walk learning-practice 41668191663 (2026-11-03) L-1..L-5 | Coordinator: re-walk on risk |
| ED-2 | Education organization: answers join requests | PASS | prod walk cohort-join-request 41611766407 (2026-11-03) J-3 | Coordinator: re-walk on risk |
| ED-3 | Education organization: signs off and recognizes practice | PASS | prod walk recognition-chain 41617507405 (2026-11-03) R-5, R-6 | Coordinator: re-walk on risk |
| ED-4 | Education organization: institution found by search | NOT VERIFIED | UF-5: the institution is free text in three places; no search exists | Owner: accept or decline the proposal in UF-5 |
| AD-1 | Admin: every operator page opens | PASS | prod walk admin-console 40688059945 (2026-10-28) | Coordinator: re-walk, the run is a week old |
| AD-2 | Admin: privacy requests and erasure | NOT VERIFIED | 9.4, 9.6: production data receipt 2026-10-19, no walk or Chrome check | Coordinator: state the evidence type the view accepts for a job run |
| AD-3 | Admin: import sandbox and intelligence inspector | BLOCKED | 9.19, 9.20 are off by flag | Owner: enable only if wanted |

### Search

| ID | Search | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| SCH-1 | Jobs | FAIL | SR-1 cold query FAIL, SR-4 paging FAIL, SR-10 accuracy FAIL; SR-2, SR-3, SR-5, SR-6 PASS | See SR-1, SR-4 and SR-10 |
| SCH-2 | Workers / candidates | NOT VERIFIED | SR-8: no walk searches people; `list_discoverable_worker_ids_v1` max 2,536 ms | Coordinator: add the walk step named in SR-8 |
| SCH-3 | Services and goods | PASS | SR-7: prod walk marketplace 41790404575 (2026-11-04); M-3, M-5 | Coordinator: re-walk on risk |
| SCH-4 | Orders | NOT VERIFIED | a customer's and a provider's order lists are walked (buyer-workspace B-2, orders-bookings), but searching inside them is not | Coordinator: say whether search is expected here; if so, add a step |
| SCH-5 | Organizations | NOT VERIFIED | SR-9: 16 calls in total, no walk | Coordinator: add the walk step named in SR-9 |

### CV, Work Journal, projects, HR and organization management

| ID | Area | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| CV-1 | CV import reads the file correctly | FAIL | UF-3: language levels and training centres misread. Fixes #3035, #3042, #3044 live on `07fd9fa7`; not yet proven on production | Coordinator: re-run profile-cv-history P-6 after the deploy, on a synthetic CV |
| CV-2 | Living CV shows evidence states | PASS | prod walk living-cv-growth 41281984217 (2026-11-01) | Coordinator: re-walk on risk |
| JRN-1 | Work Journal: record, correct, confirm | PASS | prod walk journal-confirm 41478434884 (2026-11-02), self-confirmation refused in step 1b | Coordinator: re-walk on risk |
| JRN-2 | Work Journal: a failed read is not "start your records" | NOT VERIFIED | #3013 merged 2026-11-04; a failure cannot be forced on production | Coordinator: accept the unit guard, or a read-only local render |
| JRN-3 | Unknown never shown as 0 | NOT VERIFIED | #3017 live on `07fd9fa7`; a failed read cannot be forced on production, so only its guards prove it | Coordinator: accept the guards, or a read-only local render |
| JRN-4 | Voice Work Journal | BLOCKED | 2.30, 5.15: no transcription host | Owner: hosting decision (deferred 2026-10-08) |
| PRJ-1 | Projects: stages, tasks, assignment, board | PASS | prod walk project-execution 41789372775 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| PRJ-2 | Project forecast | NOT VERIFIED | 3.34: forecast cron not installed on the VPS; needs a project with enough recorded work | Coordinator: install the cron (#2738), then walk |
| PRJ-3 | Overlap warning, alternatives, override | NOT VERIFIED | 3.35: UI flow unproven; RED #2795 | Owner: RED approval. Coordinator: walk |
| HR-1 | Roster, people import, on/offboarding, instructions, assets | PASS | prod walk org-roster 41318490491 (2026-11-01) R-1..R-6 | Coordinator: re-walk on risk |
| HR-2 | Approvals and document register | PASS | prod walk documents-approvals 41786102850 (2026-11-04, `d69327239`) | Coordinator: re-walk on risk |
| HR-3 | Planning, shifts | PASS | prod walks calendar-planning 41656893141 (2026-11-03), rota-repeat 40659497014 (2026-10-28) | Coordinator: re-walk on risk |
| HR-4 | Training assigned to engaged non-members | FAIL | 11.8, owner product decision, RED #2816 | Owner: decide. Coordinator applies |
| ORG-1 | Decisions and management approvals | PASS | prod walk company-governance 40687308231 (2026-10-28) D-1..D-5 | Coordinator: re-walk on risk |
| ORG-2 | One organization with several capabilities | BLOCKED | 1.8, owner decision ORG-2 | Owner: decide |
| ORG-3 | Isolation between organizations | PASS | prod walks org-roster 41318490491 R-7, search-support-privacy 41283989921 P-5 | Coordinator: re-walk on risk |

### Indexing, SEO, GEO, AEO

SEO and GEO checks are in their tables above; these rows add what those do not cover.

| ID | Check | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| IDX-1 | Crawlers can reach everything meant to be indexed | PASS | SEO-1, SEO-2, SEO-3: 264 + 54,222 + 270 URLs in sitemaps; all 264 and 55 shards fetched | Coordinator: re-check on a sitemap change |
| IDX-2 | What search engines have actually indexed, and real traffic | BLOCKED | Google: connected 2026-11-04, baseline in IDX-17. **Bing: no Webmaster Tools access**, so Bing index and traffic are unknown; public signs only (IDX-5, IDX-8) | **Owner: Bing Webmaster Tools, import from Search Console, then read access.** Coordinator re-reads Google after 7 and 28 days |
| IDX-3 | New pages are announced (IndexNow) | NOT VERIFIED | `lib/answer-engine/indexnow.ts` stays dormant without `INDEXNOW_KEY`; whether production has the key was not checked | Owner: provide the key if wanted |
| AEO-1 | Question pages are machine-readable answers | PASS | GEO-3: 270 pages; 30 sampled, Article + BreadcrumbList | Coordinator: re-check on risk |
| AEO-2 | An answer engine names and describes the product | NOT VERIFIED | a third-party web search did not surface the product. `/robots.txt`: OAI-SearchBot, PerplexityBot and Claude-SearchBot are not named, so allowed; GPTBot, ClaudeBot, Google-Extended and Applebot-Extended are named in the Cloudflare block. No answer engine was queried | Coordinator: repeat a fixed question set monthly, once GEO-6 is settled. Owner: confirm the Google-Extended choice |
| AEO-3 | One answer to "what is LabourMarket.ai" | NOT VERIFIED | The site now gives one definition (GEO-6, build `c99d56bc`). What an answer engine repeats is not measured | Coordinator: AEO-4 |

### UX/UI, mobile, languages, accessibility

| ID | Check | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| MOB-1 | Public pages on a phone | PASS | Playwright 390 px, 2026-11-04, all 44 public paths in lt: 0 sideways scroll, 0 page errors | Coordinator: re-check on a layout change |
| MOB-2 | Signed-in pages on a phone | PASS | prod walk mobile-surfaces 41317177981 (2026-11-01, 6/6) | Coordinator: re-walk on risk |
| MOB-3 | First-visit layout shift on a phone | FAIL | Lab only: UX-3, CLS 0.13 from the consent banner on 7 of 8 key pages, build `1206918d`. Search Console has no field data yet (IDX-17). Same run, 4x CPU, slow 4G: LCP 2.3 to 3.0 s on most pages, job page 7.3 s and pricing 4.6 s, each with a 2 s first byte in that run | Owner: choose how the banner renders |
| LNG-1 | Public text is translated | PASS | Playwright, 2026-11-04, 44 paths × lt, ru, nl, de, pl against en: the only identical text is 2 proper names per country page (EURES, Cedefop), 12 blocks per locale | Coordinator: re-check on a copy change |
| LNG-2 | Signed-in text is translated | NOT VERIFIED | 8.1: 6 locales × 25 routes on 2026-10-23; prod walk sectors-languages 40300823818 (2026-10-26) | Coordinator: re-run sectors-languages, the run is old |
| LNG-3 | The five further markets | BLOCKED | 8.5: about 9,400 missing keys per locale | Owner: activation decision |
| A11Y-1 | Public pages, axe WCAG A/AA | PASS | Playwright 390 px, 2026-11-04, build `07fd9fa7`: **44 of 44 public paths clean, 0 failing nodes** (55 nodes on `2afdfd8a` before #3030, #3038, #3039) | Coordinator: re-run on a design change. One locale (lt) and phone size only |
| A11Y-2 | Signed-in pages, axe | NOT VERIFIED | axe has never run on a signed-in page | Coordinator: add axe to the mobile-surfaces walk (test-only, GREEN) |

### Payments, notifications, AI, security, delivery

| ID | Check | Status | Evidence | Executor / next action |
|---|---|---|---|---|
| PAY-1 | Real pilot payment changes rights | NOT VERIFIED | 7.3, 7.5: pilot payment 2026-10-23, production data, no walk; failure and expiry unproven (7.18) | Coordinator: arm the pilot in Stripe TEST (7.4) so failure and expiry can be walked |
| PAY-2 | Plan purchase without help | FAIL | E-6, 7.28 | Owner + legal |
| PAY-3 | Pricing page is honest | PASS | Chrome 2026-11-04, `/en/pricing` signed out: prices confirmed, online activation not open, waitlist | Coordinator: re-check on a billing change |
| PAY-4 | VAT, invoices | BLOCKED | 7.29, 7.30; RED #2685, #2704 | Owner + legal |
| NTF-1 | In-app notifications | PASS | prod walk notifications-inapp 41312513056 (2026-11-01) | Coordinator: re-walk on risk |
| NTF-2 | E-mail: alerts and password reset | PASS | prod walks alert-mail 41488266687, mail-reset 41428606490 (2026-11-02) | Coordinator: re-walk on risk |
| NTF-3 | Push | BLOCKED | 5.8: 0 subscriptions; the channel is off by flag | Owner: VAPID keys and a real delivery test |
| NTF-4 | Weekly digest | NOT VERIFIED | 5.9: the Monday sweep wrote in-app digests on 2026-11-02; digest-setup 41584540254 failed on the harness | Coordinator: merge #2975, re-run digest-setup |
| AI-1 | With AI off, the product is honest | PASS | prod walk ai-off-honesty 40301607964 (2026-10-26) | Coordinator: re-walk, the run is old |
| AI-2 | AI functions themselves | BLOCKED | 10.6–10.10, 5.5, 8.3: no provider keys, kept off on purpose | Owner + legal: activation after security, legal and functional tests |
| AI-3 | Assistants over MCP and OAuth | PASS | prod walks mcp-chain 41589289076 (2026-11-03), mcp-oauth-client 41356233405, mcp-agents 41307643008 (2026-11-01) | Coordinator: re-walk on risk. Scopes: 10.4, owner X-2 |
| SEC-1 | Private pages refuse a signed-out visitor | PASS | Playwright 2026-11-04: 5 private routes answer 307 to the sign-in page | Coordinator: re-check on a routing change |
| SEC-2 | Public response headers | PASS | Playwright 2026-11-04: transport, framing, sniffing, referrer and permissions headers present | Coordinator: remaining item in 9.24 |
| SEC-3 | Open security items | FAIL | 2.24, 9.25, 10.20 stay open; details in the private record | Coordinator: private record |
| DEL-1 | A deploy run's commit is the commit it shipped | FAIL | twice on 2026-11-04 a run listed under one commit shipped the previous green one: 41783082125 listed `d69327239`, shipped `8126e693`; 41794146544 listed `4c58f60a8`, shipped `2afdfd8a`. Only `/api/health` is true | Coordinator: read the build from `/api/health` before every walk. GREEN executor: put the shipped commit in the run title |
| DEL-2 | Typecheck stays up on `main` | FAIL | out of memory in runs 41795459454 and 41790091398; a red run holds back its deploy | GREEN #3041 (auto-merge) |

### Real-user scenarios, end to end (2026-11-04)

Owner's unified command: judge each scenario by what a real person can actually do today. No real path means FAIL or BLOCKED, with the exact gap. These rows point at the rows above instead of repeating them. Signed-out checks ran in Chromium at 390 px on build `07fd9fa7`. Signed-in steps rest on the named production walks; no walk was dispatched for this audit. Production counts are aggregates and may include synthetic accounts.

| ID | Scenario: what a real user does | Status | Executor | PR / build | Proof | Remaining problem | Next concrete action |
|---|---|---|---|---|---|---|---|
| SC-1 | Learner or trainee joins a programme, records practice, gets it recognized | PASS | Coordinator | walk builds of 2026-11-03 | prod walks learning-practice 41668191663, cohort-join-request 41611766407, recognition-chain 41617507405 | no proof the history carries from learner to job seeker (L-4); institution is free text (UF-5) | Add the L-4 step to recognition-chain at the next planned run |
| SC-2 | Worker records work, an employer confirms it, the Living CV grows | PASS | Coordinator | walk builds of 2026-11-01..02 | prod walks journal-confirm 41478434884, living-cv-growth 41281984217 | CV import fixes (#3035, #3042, #3044) not proven on production (CV-1) | Run profile-cv-history once those are live; it is the walk this risk calls for |
| SC-3 | Person looking for work finds it fast, in their own words | FAIL | GREEN executor; coordinator for RED | SR-1 RED not applied; #3033, #3034 open | Chromium 390 px: `/lt/jobs?q=slaugytoj` first try 9.4 s, repeat 0.3–1.0 s. `slaugytojas` (nurse, Lithuanian) "0 found", while the Swedish word `undersköterska` gives 20 cards a page: search reads the ad's source language only. Profession filter works (SR-3) | a native word for a foreign-language ad finds nothing and says none exist; cold-query timeout; raw HTML in ads; translate button fails | Add care and common words to the profession word map (`public-vacancy-profession-match.ts`); assign #3033, #3034; new RED search draft |
| SC-4 | Self-employed specialist offers a service and customers find them | BLOCKED | Owner, then GREEN executor | 6.21 needs an owner-approved RED RPC | The path to publish exists: home door "Pasiūlyti" → sign-up → `/dashboard/services` (4 fields); prod walk marketplace 41790404575 M-2, M-5. Chromium: `/lt/services`, `/lt/marketplace` 404, `/lt/business/x` 404 | **a customer who is not signed in cannot find them; no public service page and none in the sitemap.** Onboarding has no self-employed door (role `freelancer` is hidden); no invoices (7.30); only 4 active offers in production | Owner: approve public service pages (6.21). GREEN: public service list and page, then a sitemap |
| SC-5 | Employer posts a need and gets people | PASS | Coordinator | build of 2026-11-03 | prod walk company-chain 41672031864 C-0b..C-4. Production: 100 of 248 worker profiles discoverable | direct worker search is unproven (SCH-2); a person must raise a hand first in the walked path | Add the SR-8 step to company-chain |
| SC-6 | Customer asks for a service and follows the request | PASS | Coordinator | `d69327239` | prod walks buyer-workspace 41785749357, marketplace 41790404575, orders-bookings 41787683432 | sign-up comes before seeing any offer; 4 active offers, 0 active listings in production, so a real customer mostly finds nothing | Same public list as SC-4; real supply is a growth task, not a code task |
| SC-7 | Contractor takes a subcontractor's team for a need | PASS | Coordinator | build of 2026-11-01 | prod walk brigade-formation 41350506578 B2B-1..B2B-4 | invoices and work-acceptance acts absent (7.30) | Owner: invoicing rules per country (7.30) |
| SC-8 | Subcontractor's people work and log hours inside the contractor's project | NOT VERIFIED | Coordinator | — | no walk follows hours from a subcontractor's team into another company's project | whether the chain works end to end is unknown | Add a step to brigade-formation; do not call it working until then |
| SC-9 | Recruitment agency: roster, client, shared need, offer, decision | PASS | Coordinator | `d69327239` | prod walk agency-chain 41787046374 | A-2 unproven | Add the two A-2 steps to agency-chain |
| SC-10 | Project, team and HR management in one company | PASS | Coordinator | `d69327239` and earlier | prod walks project-execution 41789372775, documents-approvals 41786102850, org-roster 41318490491, company-governance 40687308231, rota-repeat 40659497014 | forecast (PRJ-2), overlap flow (PRJ-3), training for non-members (HR-4) | Install the forecast cron; owner decision on #2816 |
| SC-11 | Vocational school runs a programme and signs off practice | PASS | Coordinator | build of 2026-11-03 | ED-1, ED-2, ED-3 | public institution profile (8.9) blocked | Owner: allow a public profile for the walk |
| SC-12 | A person's qualification is formally recognized | BLOCKED | Owner | RED schema 11.10; 11.9 | credentials are declared by the person (2.18); recognition is an institution's sign-off (recognition-chain). No equivalence structure, no check against a qualification register | a formal qualification cannot be verified here; the product must keep saying declared | Owner: RPL structure (11.10) |
| SC-13 | Anyone searches all services, signed out | FAIL | Owner, then GREEN executor | none | Chromium: no public service or market route (404 on 5 tried), none in the 264-URL sitemap; `/dashboard/services` redirects to sign-in; services are not a primary nav tab | the whole service side is invisible to visitors and search engines | Same public list as SC-4 |
| SC-14 | Family looks for home help or care | FAIL | Owner | none | Production subjects are `service_general`, `service_trade`, `service_creative`, `service_other`: no care subject. A service category is free text. No verification, safeguarding or trust rule for carers was found in the code. Jobs side: profession "Priežiūros darbuotojas" works, but `slaugytojas` finds 0 | **no real path.** A caregiver can type a free-text offer; a family must sign up and read an unfiltered list | Owner: decide whether care is in scope and its safeguarding rules. Do not launch care search without them |
| SC-15 | Older person or pensioner finds help | FAIL | Owner | none | "senjor", "pensinink", "pensioner" appear in no text of the lt and en message files. Sign-up needs e-mail, a password with 4 character rules and 2 onboarding steps. No phone or assisted route found | **no door and no wording for this person**; depends on SC-14 | Owner: decide scope; then one plain-language page and an assisted route |
| SC-16 | Pensioner wants to keep working | NOT VERIFIED | Coordinator | — | nothing stops the worker path (W-1), and no age filter was found; nobody has tested it with this person in mind. Inputs are 14 px | comfort for older eyes untested | A moderated test with one older person, not a walk |

### Critical scenarios, seven questions (2026-11-05)

Owner's order: the main criterion is that a person really reaches the goal. These rows add seven questions to SC-1..SC-16 and do not replace them. The goal column repeats the status of the SC row above, and that row stays the source.

**How to read it.** A production walk is a script in Playwright Chromium that already knows what to press. It proves the path exists and the result is stored. It cannot prove that a person knows what to press next, or that it works without help, so a walk alone never gives PASS in those columns. `NOT VERIFIED` means nobody has checked; it is not a pass. No value here comes from a real person in real Chrome yet. `not applicable` means there is no path to judge.

**Result today:** goal reached in 8 of 16 scenarios, 4 FAIL, 2 BLOCKED, 2 NOT VERIFIED. **Not one scenario has all seven questions answered, so none is a full PASS here.**

| ID | Goal reached | Steps to the result | Clear what to press next | Shows it is running | No duplicates | Clear errors | Input not lost | Works without an agent's help | Phone |
|---|---|---|---|---|---|---|---|---|---|
| SC-1 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-2 | PASS | NOT VERIFIED | NOT VERIFIED | Profile saves: PASS in the walk 41994411748, row in under 1 s (no person yet) | **FAIL**: `confirmCvEducationAction` still stores a repeat CV import twice. Profile forms fixed by #3089 and proven in that walk | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-3 | **FAIL** | 1 query, measured | NOT VERIFIED | NOT VERIFIED: first try 9.4 s | not applicable | **FAIL**: `slaugytojas` says "0 found" when matching ads exist | NOT VERIFIED | **FAIL**: the word a person uses finds nothing | 390 px Chromium: same FAIL |
| SC-4 | BLOCKED | Offer: home door, sign-up, 4 fields. Finding it signed out: no path | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **FAIL** for the customer: no public page | 390 px Chromium: 404 |
| SC-5 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-6 | PASS | Sign-up comes before seeing any offer | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-7 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-8 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-9 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-10 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-11 | PASS | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| SC-12 | BLOCKED | No path | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **FAIL**: no path | not applicable |
| SC-13 | **FAIL** | No path | **FAIL**: no door | not applicable | not applicable | **FAIL**: 404 on 5 routes tried | not applicable | **FAIL**: no path | 390 px Chromium: 404 |
| SC-14 | **FAIL** | No path | **FAIL**: no door | not applicable | not applicable | NOT VERIFIED | not applicable | **FAIL**: no path | NOT VERIFIED |
| SC-15 | **FAIL** | E-mail, password with 4 rules, 2 onboarding steps, then no door | **FAIL**: no door or wording | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | **FAIL**: no assisted route | NOT VERIFIED |
| SC-16 | NOT VERIFIED | Same as W-1, not counted | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Inputs are 14 px; older eyes untested |

**What finishes each scenario that isn't reached yet.** Done means proven the same way as the rest of this register.

| ID | Now | Concrete actions, in order | Who | Done when |
|---|---|---|---|---|
| SC-3 | FAIL | 1. Search the ad title as well as the occupation label (SR-10, RED, on the search lane). 2. Add care and common words to `public-vacancy-profession-match.ts` (GREEN). 3. Walk `jobs-search` with a step for `slaugytojas` | Search lane; GREEN executor; coordinator walks | `slaugytojas` finds the matching ads, and a first-time word answers without a timeout (SR-1) |
| SC-13 | FAIL | 1. Owner approves public service pages (6.21, RED RPC). 2. Build the public list, page and sitemap entries (GREEN). 3. A signed-out walk step | Owner, GREEN executor, coordinator | A signed-out visitor finds a service, and it is in the sitemap |
| SC-14 | FAIL | 1. Owner decides whether care is in scope, and its safeguarding rules. 2. If yes: care subject and a filter (GREEN). 3. A moderated test with one family | Owner first | A family reaches a checked offer. **Until then care search does not launch** |
| SC-15 | FAIL | 1. Owner decides scope, after SC-14. 2. One plain-language page and an assisted route. 3. A moderated test with one older person | Owner first | An older person gets help without an agent |
| SC-4 | BLOCKED | 1. Owner approves 6.21, the same step as SC-13. 2. A self-employed door in onboarding (role `freelancer` is hidden today). 3. Owner's invoicing rules per country (7.30) | Owner, GREEN executor | A specialist publishes, and a signed-out customer finds them |
| SC-12 | BLOCKED | 1. Owner decides the recognition structure (11.10, RED). 2. Build and walk it. Until then the product keeps saying "declared" | Owner | A qualification is checked against a named source |
| SC-8 | NOT VERIFIED | 1. Add a step to `brigade-formation`: hours from a subcontractor's team reach the contractor's project. 2. Run it under the lane rule | GREEN executor; coordinator walks | The step passes, or the gap is recorded as FAIL |
| SC-16 | NOT VERIFIED | 1. 16 px inputs (GREEN, UXC-1). 2. A moderated test with one older person; a walk cannot judge this | GREEN executor; owner arranges the test | That person reaches a first entry without help |

**The 123 functions with no browser proof stay in `## Chrome check queue`; they are not repeated here.** Its Journey column names the scenario or journey each one proves. `(area)` means the link comes only from the function's area and needs a human look. Groups E (already proven) and F (no browser can prove it) have no scenario check on purpose.

**What can close these, by risk:**

1. **A moderated test with one real person in real Chrome, desktop and phone:** SC-2, SC-3, SC-5, SC-6. It is the only thing that answers "clear what to press" and "works without help". Coordinator or owner: a production browser is not available to the UX/UI session.
2. **Walk steps, one at a time under the lane rule:** SC-8 (brigade-formation), L-4 (recognition-chain), A11Y-2 (mobile-surfaces). They close real gaps. No step is added or dispatched by this table.
3. **Owner scope first:** SC-4, SC-13, SC-14, SC-15. A walk cannot help until a door exists.

### UX in Chromium at phone size (2026-11-04)

Ordering and booking: E-4, C-1, C-2. Accessibility: A11Y-1, A11Y-2. Finding work: SC-3. Finding a worker: SC-5, SCH-2.

| ID | Check | Status | Executor | PR / build | Proof | Remaining problem | Next concrete action |
|---|---|---|---|---|---|---|---|
| UXC-1 | Simple sign-up | PASS | Coordinator | `07fd9fa7` | Chromium 390 px: 3 fields + 3 social buttons, each 44 px high, one h1; prod walk fresh-activation 41279196446 | first field at 358 px under the consent banner; 14 px inputs zoom on iOS; UF-4: the person still finds it long | GREEN: 16 px inputs |
| UXC-2 | Quick service offer | PASS | Coordinator | `d69327239` | home door to sign-up with the service page as the next step; prod walk marketplace 41790404575 M-2 | category is free text, so offers cannot be filtered | Owner: subject list for services |
| UXC-3 | Comfortable on a phone | FAIL | Owner; GREEN executor | `07fd9fa7` | Chromium 390 px, controls under 24 px high: `/lt` 22 of 55, `/lt/jobs` 18 of 49, `/lt/for-workers` 18 of 34, sign-up 3 of 15; text under 14 px: `/lt` 16 of 40. Axe target-size reports none, because inline links are exempt, so this is comfort and not a WCAG failure. CLS: MOB-3 | small links are hard for older or gloved hands | GREEN: raise footer and nav link hit areas after a visual check; owner: banner choice |
| UXC-4 | One navigation for all roles | PASS | Coordinator | build of 2026-11-01 | prod walk role-routes 41329744822 (5 roles); DS-4 | services and listings reached only through the market | Owner: decide whether services get a nav door |
| UXC-5 | Messages a person understands | FAIL | Owner; GREEN executor | #3034 open | UF-1 failing translate button, UF-6 unclear calendar records, UF-7 several names for one job board | same board under several names per locale | GREEN: one name after owner choice; merge #3034 |

### Index, language and AI-search state from public sources (2026-11-04)

Owner rule: a technical SEO PASS does not prove pages are indexed or get traffic.

| ID | Check | Status | Executor | PR / build | Proof | Remaining problem | Next concrete action |
|---|---|---|---|---|---|---|---|
| IDX-4 | Public job pages appear in Google | PASS | Coordinator | `07fd9fa7` | Google `site:labourmarket.ai/lt/jobs/`: 10 of 10 first-page results are the site's job pages. Google `site:labourmarket.ai`: home in 5 languages, pricing, jobs, about. No total is shown | share of 54,222 URLs indexed is unknown | IDX-2 |
| IDX-5 | Public pages appear in Bing | NOT VERIFIED | Coordinator | `07fd9fa7` | Bing `site:labourmarket.ai` answered "no results", yet the plain query `labourmarket.ai` listed 9 site pages, so `site:` is unreliable here. `labourmarket.ai jobs welder` shows `/en/jobs`; no job page seen in Bing | job pages in Bing unproven | IDX-2 |
| IDX-6 | Public service pages exist and can be indexed | FAIL | Owner, then GREEN executor | none | SC-13: 0 public service pages, 0 in sitemaps. 0 organizations have opted in to a public page. 4 active offers, 0 active listings in production. The only read that could list services is the personal one #3046 took off the public page; 6.21 is not approved | nothing for a search engine to index, and little to list | Owner: approve 6.21. Nothing is built around it |
| IDX-7 | Old host does not break an indexed link | FAIL | Owner (Cloudflare) | #3070 for the text | Chromium: `https://app.labourmarket.ai/lt/pricing` answers 402 "Deployment Paused" (Vercel). Bing lists that URL. `/llms.txt` no longer calls `app.` a redirect (#3070, build `90e47a29`) | the search result still leads to a dead page | Someone with Cloudflare access: set the `app` DNS record to Proxied, then a Redirect Rule: host equals `app.labourmarket.ai`, dynamic 301 to `concat("https://labourmarket.ai", http.request.uri.path)`, query kept. Check: `/lt/pricing` on `app.` answers 301 to the apex |
| IDX-8 | Found without the brand name | NOT VERIFIED | Coordinator | — | Bing, 2 unbranded queries (`darbo skelbimai suvirintojas`, `pagalba namuose senjorams paslaugos`): 0 of 10 results from the site each. Two queries prove little | real traffic unknown | IDX-2 gives real queries and clicks |
| LNG-4 | Required European languages | BLOCKED | Owner | 8.5 | Browser, build `439ba103`, 2026-11-07: `/lv`, `/fi`, `/sv`, `/no`, `/es`, `/fr`, `/it` all end on `/en` with 200 (#3116; they used to reach a 404 for `es` and `fr`). lt, en, ru, nl, de, pl are routed. These visitors get English, not their language. Live supply: **Sweden 46,022, Norway 8,457, no other country** | Sweden and Norway supply every ad, yet their languages are not offered | Recommendation: Swedish and Norwegian first, because every ad is theirs. Then Latvian and Estonian only with supply, since their country pages exist but hold no ads. Not Spanish or French: no supply. About 9,400 keys per locale. Owner decides |
| LNG-5 | Translated and original language kept apart | PASS | Coordinator | `07fd9fa7` | Chromium, job page on `/lt`: page `lang=lt`, the Swedish title carries `lang="sv"`, cards name the source language | one Swedish ad has 7 hreflang URLs with the same text | Coordinator: review the alternates when JobPosting or country data changes |

### Search visibility by stage and page type (2026-11-04)

Owner rule: a page is not done because CI passed or a sitemap answered 200. These are five separate stages. A technical fix proves only the first. Signed-out checks ran as Googlebot on `1206918d`, unless a row names a later build. Stage 2 to 5 cells stay NOT VERIFIED per page type: the Search Console baseline (IDX-17) gives totals, not a split by page type, and public `site:` samples do not fill them.

| Page type | Example | Status, noindex, canonical | Title, H1, description | Structured data | hreflang | In sitemap | 1 Technically ready | 2 Google discovered | 3 Google indexed | 4 Shown in results | 5 Organic traffic |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Job board page 1 | `/en/jobs` | 200, index, self | own, 1 H1, own | CollectionPage + ItemList | 7, reciprocal | yes | yes | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Job board page 2+ | `/en/jobs?page=2` | 200, index, canonical names page 1 | same as page 1 | CollectionPage | 7, names page 1 | no | **no: SEO-8** | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Job search or filter | `/en/jobs?profession=electrician` | 200, index, canonical names the board | same as page 1 | CollectionPage | 7 | no | yes, folds into the board by design | n/a | n/a | n/a | n/a |
| Job page | `/en/jobs/{id}` | 200, index, self | 12 of 12 titles differ; **1 description for all 12**; about 40 characters are the ad's own (IDX-10) | WebPage about an Occupation, no JobPosting (IDX-9) | 7, reciprocal, all self-canonical | yes, 54,479 | partly | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Closed or expired ad | expired 30 days, expired 1 day, deactivated | **404, noindex**, 3 of 3 | — | none | none | no | yes | n/a | n/a | n/a | n/a |
| Question page | `/en/questions/{slug}` | 200, index, self | own | Article + BreadcrumbList | 7, reciprocal | yes, 270 | yes | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Country page | `/en/labour-market/lt` | 200, index, self | own, description 77 characters | Organization + WebSite only | 7, reciprocal | yes, 36 | yes | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Professions, skills, for-* pages | `/en/professions` | 200, index, self | own; some too long (SEO-7) | Organization + WebSite only | 7 | yes, per locale | yes | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Company page | `/en/business/{slug}` | 404, noindex, for every slug: **0 organizations have opted in** | — | — | — | no | no pages exist | n/a | n/a | n/a | n/a |
| Service page | `/en/services`, `/en/marketplace` | 404, noindex | — | — | — | no | no pages exist: IDX-6 | n/a | n/a | n/a | n/a |
| Public specialist profile | `/en/profile/x`, `/en/p/x`, `/en/workers/x` | 404, noindex: no such route | — | — | — | no | none exists, by design | n/a | n/a | n/a | n/a |

| ID | Check | Status | Executor | PR / build | Proof | Remaining problem | Next concrete action |
|---|---|---|---|---|---|---|---|
| IDX-9 | JobPosting on job pages | FAIL | Owner decided 2026-11-05; RED executor next | none | **Owner's decision:** a valid public ad may show signed out: the employer name when confirmed for public view, the place at the precision allowed, the full approved public text, and pay, work type and terms when given and meant to be public. JSON-LD must match what a signed-out person sees. Never: non-public data, personal contacts, internal HR notes, private requirements, confidential documents. An undisclosed employer is never invented or published in JSON-LD; where Google's required fields lack reliable data, the ad gets no JobPosting. Emitted today: WebPage + Occupation, `datePublished` | not built. `get_public_vacancy_preview_v1` returns none of these fields, and the guards `public-anon-vacancy-boundary.test.ts` and `public-job-json-ld.ts` pin the old rule. **Privacy audit done 2026-11-05 (aggregates kept private):** a sample shows contact details and names in a substantial share of imported ad text, so full text cannot go public without a removal step and a legal answer. A clean pattern check doesn't prove an ad is safe. No RED is approved and no removal step is drafted | RED read function (separate approval, no migration under the 2026-11-05 merge approval), contact removal rule, `validThrough`, NAV licence duties, then the page and guards together |
| IDX-10 | Job pages have their own content | FAIL | Owner | none | 54,479 live ads. Sample of 12: 1 shared description. **34,209 (63%) have no catalogue profession**, so the heading is the publisher's Swedish or Norwegian words on every locale. **0 carry pay**. Each ad has 6 locale URLs, so about 327,000 near-identical URLs | Google may keep most as crawled but not indexed. Not measured yet | Wait for Search Console's Pages report. Then owner: sitemap rule (live, 180 days or younger, catalogue profession) and whether the description may name occupation and contract type. `jobs/[id]/page.tsx` is under a waiver |
| IDX-11 | Closed ads are not served as live | PASS | Coordinator | `1206918d` | Production: **66,271 ads** have the active flag but have expired. Three sampled pages answer 404 with noindex. The sitemap, search, counts and member read all filter on expiry (function definitions and `getPublicVacancyById`) | sitemap cache can list an ad for up to 1 hour after expiry. RLS policy `public_vacancies_read_active` checks only the flag | Owner decision: a data job that deactivates expired rows, which would also shrink the scans behind SR-1 |
| IDX-12 | Ad updates reach search engines | FAIL | Coordinator (RED) | #2996 draft | `list_public_vacancy_sitemap_v1` sends `published_at` as `lastmod`, so a changed ad shows no change | Google is not told about edits | Use `updated_at` when that function is next changed under RED review. Not worth its own migration |
| IDX-13 | Exact duplicate ads | PASS | Coordinator | `1206918d` | Read-only: 0 duplicate `content_hash` groups among live ads | the same job reposted with changed text is not detected | Revisit if Search Console reports duplicates |
| IDX-14 | Private pages cannot be indexed | PASS | Coordinator | #3071, `e762d6f0` | Signed out as Googlebot: `/dashboard`, `/dashboard/journal`, `/dashboard/services`, `/onboarding`, `/cv` 307 to sign-in; `/auth/*`, `/invite/*` and `/oauth/consent` noindex, nofollow (`/oauth/consent` said `index, follow` before #3071); `/design` and unknown routes 404 noindex. `robots.txt` disallows all of them and `/api/`. 0 private URLs in `sitemap.xml`. Job page and board payloads hold no employer, application link, description, city or coordinates field. Guard `trust-security-txt-noindex.test.ts` | Google still knows 3 blocked URLs by name (IDX-20), correctly blocked | Coordinator: re-check on risk |
| IDX-15 | Crawlers read metadata in the head | PASS | Coordinator | #3073, `20b866bd` | 11 pages per crawler: Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot **11 of 11 in `<head>`** (AI crawlers were 9 of 11). A normal browser still gets the streamed page: 9 of 11, as designed | — | Coordinator: re-check when Next is upgraded; `HTML_LIMITED_BOTS` keeps a copy of Next's list |
| IDX-19 | Lithuanian home page is its own canonical | NOT VERIFIED | Coordinator | #3075, `20b866bd` | URL Inspection of `/lt`: not indexed, **Google-selected canonical `/`**, declared `/lt`, last crawl 2026-11-03. Cause: `/` answered 307 to `/lt` for a request with no language. Stage 1 fixed on production: `/` with no language now answers **301 to `/lt`**, `no-store`. People keep the 307: de to `/de`, lt to `/lt`, en to `/en`, sv to `/en`, cookie ru to `/ru`, also over a de browser. Sign-up 200 | stages 2 to 5 unproven. Google has not re-read it | Coordinator: request reindexing of `/lt`. PASS only when Search Console shows `/lt` as canonical |
| IDX-20 | The other not-indexed URLs, read against production | FAIL | Owner for content; coordinator re-reads | none | **Proven near-duplicates:** `/lt/labour-market/ee` shares 94% of its sentences with `/lv` and 95% with `/lt`; `/nl/labour-market/nl` 95% with `/de`. **Proven thin:** `/lt/labour-market` has 85 words, mostly a link list. Sweden and Norway no longer say "coming soon": their cards link to the job board (#3079, `5b24826b`). **No defect served:** `/nl` (798 own words), `/ru/legal/legal-notice`, `/de/legal/data-access`: 200, self-canonical, own language. `/manifest.webmanifest` is JSON and should not be indexed. Blocked by robots, correctly: `/ru/dashboard/journal`, `/ru/dashboard/profile`, `app.`/de/auth/signup. `/lt/legal/terms`: 189 words, self-canonical, repeats company details of the legal notice; the cause of its status is not proven | country pages need real per-country facts. Filling them with the existing intros would add more duplicate text, so it was not done | Owner: what each country page may say. Coordinator: URL Inspection of `/lt/legal/terms`, re-read `/nl` after 7 days |
| LNG-6 | Coverage of the 24 EU languages and Norwegian | FAIL | Coordinator | none | Measured from the message files at `c9a58473`, table below. 5 EU languages are routed and complete (nl, de, lt, pl, en), plus Russian. 5 EU languages and Norwegian have a partial catalogue. Finnish has taxonomy only. 13 have nothing. `docs/LANGUAGE_MATRIX.md` holds older numbers from 2026-08-30 | the two markets that supply every ad have no language of their own. French, first-group by owner order, has no file. Native review is recorded for en and lt only | Order in the table. No locale goes live with thin content or without native review |
| LNG-7 | Translation pipeline without a paid API | NOT VERIFIED | Coordinator | none | Exists: `services/translate/` (self-hosted LibreTranslate: its README lists en, lt, lv, et, ru, pl, de, nl, da, nb, sv, uk, **not fr or fi**), `check-i18n-debt.ts`, the untranslated baseline guard. For ads: `public_vacancies.translations` keeps each rendering beside the untouched original, with source language, source hash, provider and model, and `status` can say `needs_review`. That is the owner's rule for ads already | no job translates catalogue files with placeholder, ICU and length checks (D-9, not started). Whether the LibreTranslate host is deployed is not verified. Its status on production needs a read. Machine output is a draft, never a finished language | Coordinator: build the batch tool. Owner or host: run LibreTranslate. Reviewers: native review per language |
| IDX-21 | Only pages with real value get indexed | FAIL | Coordinator after the 7-day read | none | 54,479 live ads × 6 locale URLs is about 327,000 URLs, and the text stays in the ad's original language on all 6. 34,209 ads (63%) have no catalogue profession, 20,270 do. Each ad's text is the same across locales. Page types with real content today: 30 or so public paths, 6 country pages, `/questions`. No page per profession, service or city exists | Google may leave most as crawled but not indexed. Search Console has not reported on them yet, so the size of the harm is not measured | **Proposal, not done:** after the Pages read on 2026-11-11, put in the sitemap one URL per ad (`/en/jobs/{id}`), live, 180 days or younger, with a catalogue profession: at most 20,270 URLs. Ads outside the rule stay reachable and useful, just not listed. Giving the other 34,209 a profession comes from the existing word lists and categorizer. Depends on #2996 |
| AEO-4 | AI-search visibility is tracked honestly | NOT VERIFIED | Coordinator | none | No measurement exists for ChatGPT, Gemini or Perplexity, so this register claims none. 2026-11-06: three AI-search queries did not show the site; a small sample, not a measure. **By owner's order, GEO and AEO are never PASS on metadata alone:** GEO-1 to GEO-5 and AEO-1 prove the site is readable, and nothing about being named. Cheap method: a fixed list of about 10 questions per priority market, asked by hand once a month on free tiers, recording: named or not, cited URL, what it said wrong. Bing Webmaster and Search Console remain the numbers for search | results are a small sample and vary between runs, so they show direction and nothing more | Coordinator: first panel after #3078 has been crawled |
| IDX-16 | Monitoring of search visibility | NOT VERIFIED | Coordinator | #3080, `182a2d73` | `ops/vps/lm-seo-watch.sh` is on main: a daily signed-out check of robots, sitemaps, 7 pages, redirects and private pages, about 20 public GET requests. One alert when a problem starts and one when it clears, through the mailbox the backup watchdog already uses. No paid service, no new outside channel, no database. Synthetic test 28 of 28 in CI. The Search Console and Bing API design is not built | **not installed on the VPS**, so nothing runs yet. It proves stage 1 only | Coordinator: install the script and `labourmarket-seo-watch.cron` as root. Owner: a read-only Google service account and a Bing key if API reads are wanted |
| IDX-17 | Search Console baseline, 2026-11-04 (stages 2 to 5, whole site) | PASS | Coordinator | read from Search Console by the coordinator | Sitemaps were never submitted before today; all three submitted today. `sitemap.xml` 264 discovered, `questions-sitemap.xml` 270, `jobs-sitemap.xml` index with 55 children and 0 pages counted so far. **Indexed 127, not indexed 31:** page with redirect 18, crawled but not indexed 7, blocked by robots.txt 3, Google chose another canonical 2, duplicate without a chosen canonical 1. **Last 90 days: 5 clicks, 323 impressions, CTR 1.5%, average position 9.6.** Top queries are brand or generic, all with 0 clicks. Core Web Vitals: **not enough field data**, so MOB-3 and UX-3 are lab numbers only | a PASS here means the baseline was read, not that visibility is good. 127 of about 55,000 listed URLs are indexed; job URLs were first submitted today | Re-read the jobs sitemap count and Pages report after 7 days, then 28. Read the URL lists for the 13 pages in the last four reasons |
| IDX-18 | Crawl load from the job sitemap submission | PASS | Coordinator | `1206918d` | Measured after submission. Job page: 15 fetched as Googlebot, 15 × 200, p50 230 ms, max 468 ms, 17 `get_public_vacancy_preview_v1` calls in that minute, so about one read per page. A sample call took 5.8 ms. Sitemap children: 12 fetches of 6 children, 42 to 262 ms, served from the 1-hour cache; edge logs over 6 hours show 55 of 55 sitemap reads 200. Postgres logs: 3 statement timeouts in the 6 hours, at 14:00 UTC; the search function returned 3 × 500 in the same 6 hours, the SR-1 path, not the sitemap | **a cold deep child is close to the limit:** the query at offset 54,000 took 3.6 s under `EXPLAIN ANALYZE`, against a 3 s anonymous timeout, because 66,271 expired rows are scanned and dropped. A miss would answer 503 with Retry-After, not 500. Full crawl means about 327,000 job URLs | Apply RED #2996 (keyset paging), then the expired-row data job (IDX-11). Watch this row as Google starts crawling |

### NOT VERIFIED function rows: executor and next action

| ID | Function | Evidence type today | Executor / next action |
|---|---|---|---|
| 1.2 | Google OAuth | production facts, no walk or Chrome check | Coordinator: a Chrome check of the Google door on a QA identity |
| 1.12 | Invitation / referral network | production facts, no walk or Chrome check | Coordinator: walk the referral link end to end |
| 1.13 | Transactional e-mail | production facts, no walk or Chrome check | Owner + legal: mail stays limited (13.17). Coordinator: walk after |
| 2.17 | ESCO taxonomy | not proven end to end | Owner: RED #2463 and quota |
| 2.36 | Profession-specific journal templates | not proven end to end | Coordinator: add a walk step for a profession template |
| 3.34 | Project forecast engine + recompute modes | not proven end to end | Coordinator: install the cron (#2738), then walk a project with enough recorded work |
| 3.35 | Commitment overlap -> warning -> alternatives -> override -> audit | not proven end to end | Owner: RED #2795. Coordinator: walk the flow |
| 3.36 | Company Living CV | not proven end to end | Owner: confirm the product shape |
| 4.8 | Anonymous public need intake | CI or isolated run | Coordinator: walk the anonymous intake in production |
| 4.29 | Interest->vacancy hand-off | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 4.30 | Candidate pipeline -> hire decision -> close need (+ agency commissions, agency-to-agency) | not proven end to end | GREEN executor: decision and history UI. Coordinator: walk |
| 5.9 | Weekly digest | CI or isolated run | Coordinator: merge #2975, re-run digest-setup |
| 5.14 | Command finder + voice | production facts, no walk or Chrome check | Coordinator: add a finder step to a walk |
| 5.15 | Voice as equal door | not proven end to end | Owner: voice host (deferred 2026-10-08) |
| 6.11 | Cross-border readiness | production facts, no walk or Chrome check | Coordinator: Chrome check of the public part |
| 6.16 | Commercial handoff to the partner organization | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 7.2 | Free organization limit 1 open need | CI or isolated run | Coordinator: a QA organization off the pilot, then walk the limit |
| 7.3 | Entitlement resolver | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 7.4 | Stripe TEST checkout/portal/webhook | optional scenario | Coordinator: arm the pilot in Stripe TEST (optional scenario) |
| 7.5 | Live charging | not proven end to end | Owner: self-serve stays off by decision |
| 7.13 | Plan-gated booking_requests | not proven end to end | Coordinator: a QA organization at its booking limit, then walk |
| 7.16 | Webhook signature verification | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 7.17 | No double charge / processing | production facts, no walk or Chrome check | Coordinator: close the 2 stale open checkout operations; name the run |
| 7.18 | Payment changes rights | not proven end to end | Coordinator: walk failure and expiry in Stripe TEST (7.4) |
| 7.21 | Billing portal for every billing manager | not proven end to end | Coordinator: a second billing manager in the walk |
| 7.22 | Paid-feature rights and limits | not proven end to end | Owner: #2474 and the limits. Coordinator: walk |
| 7.25 | LMC balance and history | not proven end to end | Coordinator: private record |
| 7.29 | VAT Stripe Tax | not proven end to end | Owner + legal: RED #2685 |
| 8.1 | UI localization | production facts, no walk or Chrome check | Coordinator: re-run sectors-languages |
| 8.17 | Android app (native) | production facts, no walk or Chrome check | Owner: Google Play account (8.15) |
| 8.18 | iOS app (native) | production facts, no walk or Chrome check | Owner: Apple account (8.15) |
| 9.4 | Privacy request intake | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 9.6 | GDPR erasure executor | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 9.8 | RLS on every table | production facts, no walk or Chrome check | Coordinator: a read-only catalog run, stated in the private record |
| 9.9 | Audit trail | CI or isolated run | Coordinator: private record |
| 9.10 | Rate limiting | production facts, no walk or Chrome check | Coordinator: private record |
| 9.17 | Internal supply feed | CI or isolated run | Coordinator: settle the intended readback cadence, then a job run |
| 9.22 | Env schema validation | production facts, no walk or Chrome check | Coordinator: private record |
| 9.23 | Security-definer governance | production facts, no walk or Chrome check | Coordinator: RED R-2, private record |
| 9.24 | Security incident handling | production facts, no walk or Chrome check | Coordinator: private record |
| 10.18 | Vacancy source SE | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 10.19 | Vacancy source NAV | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 10.23 | Agentai supply feed | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 12.2 | Labour-market intelligence | production facts, no walk or Chrome check | Coordinator: Chrome check; copy D-2 stays open |
| 12.5 | Public market facts | production facts, no walk or Chrome check | Coordinator: Chrome check against the database figure |
| 13.2 | Health probe + monitor | production facts, no walk or Chrome check | Coordinator: name the monitor's production run |
| 13.4 | Supabase capacity | CI or isolated run | Coordinator: read the plan and capacity, name the date |
| 13.6 | VPS cron bundle | production facts, no walk or Chrome check | Coordinator: name a production job run or Chrome check for it; the production data stays true |
| 13.7 | Migration safety + parity | production facts, no walk or Chrome check | Coordinator: name a production parity run |
| 13.8 | Migration ledger parity | production facts, no walk or Chrome check | Coordinator: name a production parity run |
| 13.10 | Quality gates | production facts, no walk or Chrome check | None: CI by nature; DEL-2 tracks its stability |
| 13.11 | E2E in CI | production facts, no walk or Chrome check | None: CI by nature |
| 13.12 | Executable product constitution | production facts, no walk or Chrome check | None: CI by nature |
| 13.13 | Feature-availability catalogue | not proven end to end | Coordinator: Chrome check of the catalogue's surfaces |
| 13.14 | Owner waivers / product gate | production facts, no walk or Chrome check | Coordinator: restore the live parity read for CI |
| 13.15 | Old-browser compatibility | production facts, no walk or Chrome check | Coordinator: a Chrome check on an old-browser profile |
| 13.16 | Browser crash reports | not proven end to end | Coordinator: find primary evidence or mark not built |

### EU language coverage, 24 official languages plus Norwegian (2026-11-05)

Measured from `apps/web/messages` at `c9a58473`. English has 15,360 keys and 1,460 taxonomy keys. **Real** means present, no `[EN]` marker, not identical to English. Identical text can be correct (names, short words), so routed languages under 100% are not defects by that alone. Journey columns group message namespaces by hand: Reg registration, Prof profiles, Serv services, Jobs job search, Ads, Ord orders, Proj projects, Err errors, Ntf notifications, Help. They do not cover e-mail templates, which are outside these files.

All routed languages share one set of rules: self-canonical URL, 7 hreflang (6 languages + x-default), in `sitemap.xml`, indexable. Unrouted `lv`, `et`, `fi`, `sv`, `no` redirect to English (307); `es`, `fr` go to `/en/es`, `/en/fr`, then 404 (LNG-4). Unrouted languages have no URL, canonical, hreflang or sitemap entry. Live ads on 2026-11-04: Sweden 46,022, Norway 8,457, no other country.

| Order | Language | Catalogue keys | Real | `[EN]` | Real % | Taxonomy real | Reg | Prof | Serv | Jobs | Ads | Ord | Proj | Err | Ntf | Help | Routed | Ads in its market |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | German `de` | 15,360 | 15,157 | 0 | 98.7 | 1,403 | 98 | 99 | 99 | 98 | 98 | 100 | 98 | 92 | 97 | 100 | yes | 0 |
| 1 | French `fr` | no file | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | 0 |
| 1 | Dutch `nl` | 15,360 | 15,101 | 0 | 98.3 | 1,386 | 99 | 98 | 100 | 98 | 97 | 99 | 98 | 90 | 97 | 99 | yes | 0 |
| 1 | Danish `da` | 5,914 | 4,412 | 1,301 | 28.7 | 208 | 15 | 21 | 2 | 38 | 56 | 50 | 30 | 41 | 3 | 0 | no | 0 |
| 1 | Swedish `sv` | 5,914 | 3,294 | 2,467 | 21.4 | 201 | 15 | 7 | 0 | 18 | 14 | 38 | 25 | 41 | 3 | 0 | no | **46,022** |
| 1 | Finnish `fi` | no file | 0 | - | 0 | 683 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | 0 |
| 1 | Polish `pl` | 15,360 | 15,258 | 0 | 99.3 | 1,437 | 99 | 99 | 100 | 99 | 99 | 100 | 99 | 97 | 99 | 100 | yes | 0 |
| 1 | Lithuanian `lt` | 15,360 | 15,286 | 0 | 99.5 | 1,451 | 99 | 99 | 100 | 99 | 100 | 100 | 100 | 92 | 99 | 100 | yes | 0 |
| 1 | Norwegian `no`, extra | 5,914 | 3,293 | 2,467 | 21.4 | 199 | 15 | 7 | 0 | 18 | 14 | 38 | 25 | 41 | 3 | 0 | no | **8,457** |
| 2 | Latvian `lv` | 5,914 | 3,239 | 2,543 | 21.1 | 203 | 15 | 7 | 0 | 18 | 15 | 38 | 25 | 41 | 3 | 0 | no | 0 |
| 2 | Estonian `et` | 5,914 | 3,213 | 2,560 | 20.9 | 202 | 15 | 7 | 0 | 18 | 15 | 38 | 25 | 41 | 3 | 0 | no | 0 |
| 2 | Spanish `es` | no file | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | 0 |
| source | English `en` | 15,360 | 15,360 | 0 | 100 | 1,460 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | 100 | yes | n/a |
| 3 | `bg`, `hr`, `cs`, `el`, `hu`, `ga`, `it`, `mt`, `pt`, `ro`, `sk`, `sl` | no file | 0 | - | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | no | 0 |

Order 1 is the owner's. Order 2 follows `PRIORITY_MARKETS` and ADR 0010; German, French and Dutch also serve Austria, Switzerland and Belgium. Russian is outside the 24: routed, 15,304 real keys, a worker language and not a market. `docs/LANGUAGE_MATRIX.md` also asks for Georgian, which is absent.

**Rules for every language:** user-entered ads are never rewritten as originals. Translations are stored apart, carry their origin, and are never shown as the employer's confirmed original. No paid translation API without approval. Native review before a language goes live. No locale is activated with thin content.

### Search plan by country (2026-11-05)

Stage 1 only: nothing here is proven in Google, Bing or AI answers. "Country page" is `/labour-market/{code}`, which exists for 6 markets, with near-duplicate text in at least 3 (IDX-20). Services: 4 private offers, 0 public listings, 0 public organizations, so **no market has public services to index**.

| Market | Language state | Live ads | Country page | First honest step |
|---|---|---|---|---|
| Sweden | `sv` 21%, not routed | 46,022 | none, card links to the board | Ads with a profession in the sitemap (IDX-21), JobPosting (IDX-9), then a page from real ad counts by profession and region |
| Norway | `no` 21%, not routed | 8,457 | none, card links to the board | Same as Sweden, after the NAV licence duties are read |
| Lithuania | complete | 0 | yes | Rewrite from real local facts. Worker sign-up, CV and employer posting are the honest offer. `/lt` canonical is awaited (IDX-19) |
| Germany, Netherlands, Poland | complete | 0 | yes | Replace near-duplicate country text with sourced facts. Ad work-abroad pages to SE and NO supply, in the reader's language |
| Latvia, Estonia | 21%, not routed | 0 | yes, in routed languages | Keep the pages only with their own facts. Language after order 1 |
| Denmark | `da` 29%, not routed | 0 | none, "coming soon" | Language first; no country page without supply |
| Finland | taxonomy only | 0 | none, "coming soon" | Catalogue first; no country page without supply |
| France, Belgium, Spain, Austria, Switzerland | fr, es none; de, nl complete | 0 | none, "coming soon" | No pages until there is supply or a real local offer |
| Other EU countries | none | 0 | none | Nothing to index now |

**By goal.** Work: the board and ads, under IDX-9, IDX-10, IDX-21. Workers and professions: `/professions` is one page; build per-profession pages only where ads or people exist (20,270 ads carry a profession; counts per profession decide). Subcontractors, teams, partners and local services: 6.21 with opt-in; nothing public until providers choose it. Learning and practice: `/skills` and the existing learning routes only. Registration, CV and posting: `/create-cv`, `/for-workers`, `/for-companies`, `/company-need` exist; measure them in Search Console first. AEO: `/questions` answers per market, with schema only where it matches the page. GEO: AEO-4.

**Owner's rule:** no thousands of near-identical thin pages. Only pages with real value get indexed. A profession, country or city page needs its own data, or it isn't built.

### Sweden and Norway first, then real supply elsewhere (2026-11-05)

**Owner's priority:** Swedish and Norwegian localization is high priority, planned together with growing real supply in other EU markets. Plan only: nothing activated, no feed integrated.

`sv` and `no` need about 12,000 keys and 75,000 words each, 459 of the keys legal text. Drafts can come from self-hosted LibreTranslate through a batch tool that protects placeholders (LNG-7). The real cost is native review, plus a qualified reviewer for legal text. Promotion is one row in `activeLocales` after full parity, and it adds 2 URLs per public page and per ad, so IDX-21 comes first. Order: sitemap rule, batch tool, public pages and sign-up, rest of the catalogue, legal text, parity in a PR with no route change, then an owner decision, Swedish first.

**Official job feeds, read at the source 2026-11-05 through a summarising tool. Reread terms before relying on them. No market has a verified open, free feed with full ad text.**

| Market | Feed | What it holds | Terms, as read |
|---|---|---|---|
| Lithuania | Employment Service `ldv` on data.gov.lt | Employer; short text; contact columns that must be excluded | Open, free, CC BY 4.0 per the EU catalogue |
| Poland | CBOP WebService, Ministry | Fields not confirmed | Free, signed terms; no modification, no outdated ads; night-time calls |
| Belgium, Wallonia | Forem on ODWB | Employer; summary and link | Open, free, CC BY-SA 4.0; aggregator use named |
| Latvia | NVA Vakances | A link and a registration number in the rows read | Open, free, CC0 1.0 |
| Finland | Job Market Finland API, KEHA | Fields not confirmed | Credentials on request; own-site display allowed, no passing on, source named, limits on marketing |
| Belgium, Flanders | VDAB APIs | All fields per a third party's copy of the terms | Partner agreement; unchanged content; employer opt-out. Not read at the source |
| France | API Offres d'emploi, France Travail | Not confirmed | Withdrawn pending a reuse review |
| Germany | HR-BA-XML only, by cooperation agreement | Not confirmed | Terms ban robots and reading interfaces for data collection |
| Denmark, Netherlands, Estonia, Spain (national), Austria, Switzerland, Brussels | No third-party ads feed found | - | Netherlands: none planned as of a 2020 answer. Austria: automated mechanisms banned. Switzerland: embedding needs consent |
| EURES | A vacancy API exists; who may use it isn't stated | Not confirmed | No third-party route found |

Evaluate in this order: Poland, Lithuania, Forem, Latvia, then Finland and VDAB; France, Germany, Denmark and EURES only owner to owner. No scraping. A lawyer should read licence scope over third-party text, share-alike, no-modification rules against translation, and the GDPR basis for contact persons and sole traders. Employers posting directly is real supply too and needs no licence.

## Identity, sign-up & organizations

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 1.1 | E-mail+password sign-up / sign-in | LIVE_VERIFIED | 2026-10-28 | isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-1..S-3 form sign-up worker/company/agency, S-4 existing address → sign-in, S-5 sign-out/sign-in; role-routes 39849107061; #2854 deployed f5c0e88f (sign-up skeleton LIVE; closed-invite / existing-address  | yes | self-serve sign-up through the form proven in CI only (no synthetic production accounts, owner rule) |
| 1.2 | Google OAuth | LIVE_VERIFIED | 2026-10-18 | owner Google sign-in 10-18/19; buttons x6 live | yes |  |
| 1.3 | Password reset | LIVE_VERIFIED | 2026-11-02 | prod walk mail-reset 41428606490 2026-11-02 2/2 (reset mail read from the real QA mailbox ~12 s → link → new password signs in; second reset: old password refused, new works); earlier: isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-6 reset mail → link → new password works, old refused (HTTP 400); profile-cv-history P-1 run 40166272659 10-25: reset form renders; mail delivery still unproven (SMTP) | yes | no repeatable production walk yet (D-4 mailbox walk #2903 pending the owner) |
| 1.4 | Onboarding + setup hub | LIVE_VERIFIED | 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh worker + fresh company onboarding (owner-created accounts); earlier: fresh-activation walks (owner-created accounts) PASS; invited-worker path: onboarding finds the invitation without the link (#2845, live 2e4ae2b4b), server settles the role and accepts after it (#2846, live 51a35183, mig… | yes | open: UF-4 (first real user 2026-11-04) |
| 1.5 | Multi-role identity | LIVE_VERIFIED | 2026-11-01 | prod walk role-routes 41280157502 2026-11-01 on 38bfb9d93 (5/5 roles); earlier: role-routes run 39783147517 (green) 10-22; 5 roles | yes |  |
| 1.6 | Organization creation + identity | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-[volume withheld] identity page shows Alfa's own record | yes |  |
| 1.7 | Organization verification | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): S-2 verification status shown, honest | yes |  |
| 1.8 | Multi-capability organization | BLOCKED | — | owner decision ORG-2 | unproven |  |
| 1.9 | Memberships, invitations, roles | LIVE_VERIFIED | 2026-11-02 | prod walk invited-worker 41430482903 2026-11-02 7/7 (the invited person registers without the link, proves the address by the mailed link, accepts on the network page, becomes a worker member; second accept and an unknown invitation refused); earlier: isolated CI walk signup-isolated (#2861/#2864/#2865, local Supabase, Chromium) 9/9 2026-10-28: S-9 invitation link → sign-up through it → stored accepted by that person; brigade-formation 39795574869 10-22 | yes | expired-invitation and project-linked invitation not walked in production |
| 1.10 | Workspace context + switching | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-7 — details in the private record; earlier: org-roster R-7 run 39969976834 10-23 | yes |  |
| 1.11 | Cross-org isolation | LIVE_VERIFIED | 2026-11-01 | prod walk worker-identity-split 41318189146 2026-11-01 on 681e6678f (5/5) — details in the private record; earlier: #2876 applied (ledger 20261028161106), verified in production 2026-10-28; earlier: worker-identity-split 39602569732 — isolation details in the private record (owner rule) | yes |  |
| 1.12 | Invitation / referral network | LIVE_VERIFIED | 2026-10-28 | #2855 (ledger 20261028081810) + #2858 (20261028091725) applied, verified, deployed a4cbc9b9; send ledger shows no duplicate recipient; earlier: 2026-10-27 production: partner referrals arrive through the referral door (pending join_platform with consent, latest 2026-10-27), are e-mailed (41 sent) an | yes |  |
| 1.13 | Transactional e-mail | LIVE_VERIFIED | 2026-10-28 | partner invitation mails delivered via the ledgered provider path (10-27/28); earlier: 2026-10-27 production: owner configured SMTP (LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp); [volume withheld] e-mails accepted by the provider 20:11-20:13 UTC (email_send_ledger_v1 [volume withheld], delivery_status | yes |  |
| 1.14 | Staff review notice | LIVE_VERIFIED | 2026-10-21 | staff-review-notice 39604913210 10-21 | yes |  |
| 1.15 | Org history before claim + claim | LIVE_VERIFIED | 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) H-1..H-6; earlier: company-talent-history run 40217117255 10-25: H-1 roster holds the unclaimed person card; H-2 offer saved (PATCH 200); H-3 employee accepts on the phone; H-4 roster reads linked (LT+EN); H-5 another org + another worker … | yes |  |

## Worker profile, Work Journal & Living CV

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 2.1 | Professional profile + narrative | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-3; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.2 | Work card availability/pay/locations | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-4; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes | **2026-11-06: Save on a page the browser translates killed the screen, with the row stored (real report 11-05); #3113 and #3114, walk availability-save 42207699886 on ae2cf083a, 20/20, translator DOM swap emulated in real Chrome, plus 5 other languages and the education and certificate forms. Real sign-out and new sign-in not walked; Chrome's own translator not run** |
| 2.3 | CV import confirm each fact | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-6; earlier: ai-off-honesty run 40191899327 10-25 (12/13 green): B-2 a CV file read deterministically into a proposal; nothing saved before confirm | yes | open: UF-3 (first real user 2026-11-04); **FAIL 2026-11-05: two tabs confirming the same CV education or certificate row at the same moment can store it twice.** Walk cv-import-duplicates 42098444964, real Chrome: confirmed once and re-imported (#3102) gave 1 row each, PASS; every parallel round sent 2 POSTs, each answered 201. Rows stored: 7 education from 4 titles, 5 certificate from 3 titles, from the cleanup's totals, because that run stopped before its own per-round counts and never reached the double click. No unique key on these tables; a migration is a separate owner decision. Cause: read, then insert, with nothing in the database between. Fix prepared 2026-11-06, unapplied and not proven on production, so the FAIL stands: a unique index and a per-person lock in a draft migration awaiting the owner. The review's confirms no longer re-render the whole page per row, the load that slowed run 42098444964 2026-11-06, walk 42208992447 on ae2cf083a after #3110: double click 1 action and 1 row, PASS; cleanup 0 rows left, PASS; parallel still 2 rows each, FAIL, until the RED draft #3111 is applied by owner decision. |
| 2.4 | Living CV / player card / EU export | LIVE_VERIFIED | 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: first journal entry reaches the Living CV; prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru); #2894 skill time + no-duration records (isolated tests); earlier: fresh-activation run 40546035425 2026-10-27 on 429b106bc (after #2837+#2838): worker journal entry -> Living CV exact vs own DB: entries=5 hours=35 m2=30, CV recorded=35 confirmed=0 (unconfirmed separated); 390 px no sid… | yes |  |
| 2.5 | Employment history | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-7; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.6 | Practice / volunteering | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-8; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.7 | Education records | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-9; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes | open: UF-5 suggestion (first real user 2026-11-04) |
| 2.8 | Achievements / declared certificates | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-10; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.9 | Languages | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-5; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.10 | External profile links | BLOCKED | — | RED #2471 | unproven |  |
| 2.11 | Requirement ledger | LIVE_VERIFIED | 2026-10-25 | requirements-countries run 40209522348 10-25 (9/9): R-1/R-2 DE+NL ledger reads have/missing (LT, EN, 390 px), no gate wording; R-3 signed-out + other org see none | yes |  |
| 2.12 | Skill catalogue + professions | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-11; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.13 | Deterministic recognition journal->skill | LIVE_VERIFIED | 2026-11-01 | prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru); #2894 skill involvement time (CI); earlier: #2885 merged 88a60b567: isolated skills chain K-1..K-7 (PASS_CI_ONLY); earlier: sectors-languages run 40083930868 10-24 | yes |  |
| 2.14 | Evidence tier ladder | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-12; earlier: profile-cv-history run 40182648408 10-25 (21/21 green) | yes |  |
| 2.15 | Free-label skill claims | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-13; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-13 claim saved and chip shown in place + on Living CV as self-declared (after #2754) | yes |  |
| 2.16 | Transversal capabilities | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-14; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-14 transversal capabilities read like other skills | yes |  |
| 2.17 | ESCO taxonomy | NOT_VERIFIED | — | quota / RED #2463 | unproven |  |
| 2.18 | Documents / credential validity | LIVE_VERIFIED | 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); earlier: documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 2.19 | Work Journal | LIVE_VERIFIED | 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: a fresh worker's first journal entry is saved and reaches the Living CV; prod walk journal-confirm 41281666555 2026-11-01 on 38bfb9d93 (3/3); #2893 night/split shifts + retried confirm (CI); #2895 own-entry correction over MCP/mobile LIVE over MCP — prod walk mcp-agents 41307643008 2026-11-01 on c3df7431d (10/10, A-9: entry recorded and corrected over MCP, one live version, spent token and replaced version refused). Reclassified 2026-11-01: the core journal is proven; the AI part is row 10.9; earlier: #2884 live 91a1a39c: work-context choice fix, verified on a production draft; earlier: ai-off-honesty run 40191899327 10-25 | yes | AI suggestions stay BLOCKED in 10.9 (owner AI keys); the honest off-state is proven |
| 2.20 | Manager review / confirm | LIVE_VERIFIED | 2026-11-02 | prod walk journal-confirm 41478434884 2026-11-02 on 4453e9d3a (4/4): the worker's own declaration is recorded and counted, the worker cannot record themselves as the independent confirmer, a different authorised manager approves and the entry leaves the queue, the Living CV gains exactly one confirmed entry with hours unchanged (decision 0028); DB: one live entry, one employer approval, no self row; earlier run 41467005959 failed on a host memory stall (approval stored), test bounded in #2948; owner decision 0028 resolves EVID-2 (self-declaration is lawful and labelled; only self-as-independent-confirmer is refused, enforced since 20261003150500); 2026-11-01 reconciled with product-truth: open integrity item (EVID-2); details in the private record; the earlier production proof below stays valid for what it covered; earlier: prod walk journal-confirm 41281666555 2026-11-01 on 38bfb9d93 (3/3); earlier: journal-confirm run 39788692498 (green) 10-22 | yes |  |
| 2.21 | Work verification 8 states | LIVE_VERIFIED | 2026-11-01 | prod walk work-verification 41280396705 2026-11-01 on 38bfb9d93 (6/6); #2895 correction door over MCP: prod walk mcp-agents 41307643008 2026-11-01 on c3df7431d (10/10, A-9: entry recorded and corrected over MCP, one live version, spent token and replaced version refused); earlier: prod walk work-verification run 40300016332 (2026-10-26): V-1..V-6 6/6 — sent to manager, review queue with authority only, changes requested, correction pending (counted once, correction card names the decision it answe… | yes |  |
| 2.22 | Photos / task evidence | LIVE_VERIFIED | 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) P-1; earlier: worker-records-exports run 40186822215 10-25 (8/8 green): P-1 a journal entry with a photo saved and shown on fresh load | yes |  |
| 2.23 | Hours metrics/allocations/timesheets | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-11 run 39968362991 10-23 | yes |  |
| 2.24 | Experience records + disputes | FAIL | 2026-11-01 | 2026-11-01 reconciled with product-truth: open RED moderation item (EVID-6); details in the private record; the earlier production proof below stays valid for what it covered; earlier: prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-15; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-15 experience records open with right of reply | yes |  |
| 2.25 | Work in numbers | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-17; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-17 work in numbers from own recorded work | yes |  |
| 2.26 | One continuous professional history | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-18; #2894 duration-pending records shown without hours, totals unchanged (CI); earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-18 one continuous history: one total, every hour once | yes |  |
| 2.27 | Org historical evidence import | BLOCKED | — | ARCH-5 owner | unproven |  |
| 2.28 | Historical consolidation | BLOCKED | — | owner OK on #2362 | unproven |  |
| 2.29 | Living CV potential capabilities | LIVE_VERIFIED | 2026-11-01 | prod walk living-cv-growth 41281984217 2026-11-01 on 38bfb9d93 (3/3, lt/en/ru); earlier: living-cv-growth run 39791708600 (green) 10-22 | yes |  |
| 2.30 | Voice Work Journal | BLOCKED | — | STT host (owner) | unproven |  |
| 2.31 | Journal hash chain | LIVE_VERIFIED | 2026-10-24 | journal-confirm run 40083466362 10-24 (3/3): worker records entry, employer approves, worker sees it confirmed on Living CV and Work in Numbers; DB: the walk's entries are hash_version 2 (chained); integrity guards prove… | yes |  |
| 2.32 | Counterparty review | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-16; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-16 counterparty review readable on both sides | yes |  |
| 2.33 | Gallery | LIVE_VERIFIED | 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) G-1/G-2 on the phone; earlier: worker-records-exports run 40186822215 10-25 (8/8 green): G-1/G-2 gallery shows the worker's own photos (390 px), other worker's gallery never carries them | yes |  |
| 2.34 | Journal + hours export | LIVE_VERIFIED | 2026-11-01 | prod walk worker-records-exports 41312948857 2026-11-01 on 7f8bfaa2a (8/8) E-1/E-2; earlier: worker-records-exports run 40186822215 10-25 (8/8 green): E-1/E-2 journal + hours CSV export downloads; another worker's export never carries this day; anonymous refused | yes |  |
| 2.35 | Discoverability consent | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-8; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-8 discoverability consent off/on persists | yes |  |
| 2.36 | Profession-specific journal templates | NOT_VERIFIED | 2026-11-01 | templates + migration exist (decision 0006; lib/journal/journal-templates.ts); no production proof yet | unproven | no production walk |
| 2.37 | Subject refuses an imported record | NOT_IMPLEMENTED | 2026-11-01 | architecture §1.6/§10 (ARCH-5); appears only as the blocker of 2.27 | no | owner decision ARCH-5, then build |

## Company operations & projects

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 3.1 | Company home | LIVE_VERIFIED | 2026-10-23 | owner session 10-23 the partner organization 1.6 s; role-routes 39783147517 | yes | large-org timing not measured |
| 3.2 | Projects | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-1 PASS; earlier: project-execution E-1 39798187544 10-22 | yes |  |
| 3.3 | Objects / sites | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-11 run 39968362991 10-23 | yes |  |
| 3.4 | Stages | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-3 PASS; earlier: project-execution run 40085615921 (green) 10-24 | yes |  |
| 3.5 | Tasks | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-4 PASS; earlier: project-execution run 40081437313 10-24: E-4 the walk starts and completes ITS OWN task (card matched by its own title inside main, after #2724) | yes |  |
| 3.6 | Worker->project assignment | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: prod walk project-execution 41295981934 2026-11-01 on 3b7eafbe4 green end to end (after #2897: the walk now waits for the assign answer; the assignment was stored all along); earlier: run 41283540387 on 38bfb9d93 E-5 FAIL (walk timing), project-execution E-5 run 39968362991 10-23 | yes |  |
| 3.7 | Brigades | LIVE_VERIFIED | 2026-10-22 | brigade-formation 39795574869 10-22 | yes |  |
| 3.8 | Team->project assignment | LIVE_VERIFIED | 2026-11-01 | prod walk brigade-formation 41350506578 2026-11-01 on 7c46946c3 (19/19, B2B-1..10: brigade offered and matched as one unit, handed into one team assignment, work recorded on it); product-truth journey link LIVE since #2917; details in the private record; earlier: brigade-formation run 39795574869 (green) 10-22 | yes |  |
| 3.9 | Readiness | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-7 run 39968362991 10-23 | yes |  |
| 3.10 | Defects / corrections | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-8 run 39968362991 10-23 | yes |  |
| 3.11 | Handover passport | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-9 run 39968362991 10-23 | yes |  |
| 3.12 | Project economics | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-10 run 39968362991 10-23 | yes |  |
| 3.13 | Operations board + export | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: prod walk project-execution 41283540387 2026-11-01 on 38bfb9d93 E-2 PASS (dates); earlier: project-execution E-2 run 39968362991 10-23: owner downloads the operations report | yes | outsider-refusal step E-13 still to re-run (spec fixed #2702) |
| 3.14 | Employer planning / calendar | LIVE_VERIFIED | 2026-10-21 | calendar-planning 39571666417 10-21 | yes | open: UF-6 (first real user 2026-11-04) |
| 3.15 | Absences / leave | LIVE_VERIFIED | 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | yes |  |
| 3.16 | Capacity / gap timeline | LIVE_VERIFIED | 2026-10-23 | owner session 10-23: workforce planning shows active team 2, capacity [volume withheld]-days, honest partial count | yes |  |
| 3.17 | Capacity reservation | LIVE_VERIFIED | 2026-11-03 | prod walk project-execution 41722638759 2026-11-03 on 7f0f06583 (passed); earlier: project-execution E-6 run 39968362991 10-23 | yes |  |
| 3.18 | Utilisation | LIVE_VERIFIED | 2026-10-26 | prod walk utilisation-planned-actual run 40295307338 (2026-10-26): U-0..U-3 8/8 — owner commits worker to dated project, committed days move on fresh load; EN + phone; employee and other org refused | yes |  |
| 3.19 | Planned vs actual | LIVE_VERIFIED | 2026-10-26 | prod walk run 40295307338 (2026-10-26): P-1..P-4 — three stages planned 5 days, started+finished; fresh load shows planned vs actual gap; EN + phone; other org + employee refused | yes |  |
| 3.20 | Shifts / rotas | LIVE_VERIFIED | 2026-10-28 | rota-repeat 40659497014; earlier: prod-qa-walk rota-repeat 40018016745 10-23 (5/5): weekly Mon/Wed/Fri + 2-on/1-off saved via Repeat UI, clash WARNS but saves (planned_collides), persists after reload, bands correct on worker calendar, cancel clears; DB:… | yes |  |
| 3.21 | Roster | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-1; earlier: org-roster R-1 39800182427 10-22 | yes |  |
| 3.22 | People import | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-2; earlier: org-roster run 40052543761 (green) 10-24 | yes | spec fault fixed #2667 |
| 3.23 | On/offboarding runs | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-3; earlier: org-roster R-3 run 39969976834 10-23 | yes |  |
| 3.24 | Approvals / workflows | LIVE_VERIFIED | 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); earlier: documents-approvals 40663181329; earlier: documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 3.25 | Management decisions + reviews | LIVE_VERIFIED | 2026-10-28 | company-governance 40687308231 (2026-10-28) D-1..D-5 green; prod walk company-governance run 40296167812 (2026-10-26): D-1..D-5 — decision draft, sent via approval template, approved in inbox, outcome persists RU + phone, employee and other org refused | yes |  |
| 3.26 | Instructions | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-5; earlier: org-roster run 40052543761 (green) 10-24 | yes |  |
| 3.27 | Company history + data quality | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-20; #2894 company period split (CI); earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-20 company history opens in Alfa workspace | yes |  |
| 3.28 | Manager chat answers | LIVE_VERIFIED | 2026-10-24 | manager-chat run 40054481359 10-24 (5/5) | yes |  |
| 3.29 | Organization documents register | LIVE_VERIFIED | 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); earlier: documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 3.30 | Company settings + help request | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-4; earlier: org-roster R-4 run 40052543761 10-24 (7/7): settings + help request | yes | 10-23 failure was a walk-spec defect (#2702) |
| 3.31 | Reporting / export | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-21; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-21 company report opens, export downloads | yes |  |
| 3.32 | Assets / tools | LIVE_VERIFIED | 2026-11-01 | prod walk org-roster 41318490491 2026-11-01 on 681e6678f (7/7) R-6; earlier: org-roster R-6 assets issue/return run 39969976834 10-23 | yes | D-2 fixed |
| 3.33 | Hours page | LIVE_VERIFIED | 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) H-1/H-2 company + agency; earlier: company-chain 39569833029 10-21; owner #2673 | yes |  |
| 3.34 | Project forecast engine + recompute modes | NOT_VERIFIED | 2026-11-01 | 2026-11-01: engine wired to the manager project page, computed on read (#2920, capability WRK-11); prod walks register-gaps 41366955536 G-4 (state insufficient_data) and project-execution 41408054477 E-12b 2026-11-02 (17/17; project A forecast state ok): the manager reads a computed forecast in production, labelled a forecast, not a fact; storage, recompute scheduler and cadence modes NOT wired (draft #2738); earlier: built (#2733, lib/forecast: engine, facts, history, scheduler, modes) but not wired to any screen; owner order 2026-10-24 | unproven | wire storage + recompute modes (#2738), then walk a project with enough recorded work |
| 3.35 | Commitment overlap -> warning -> alternatives -> override -> audit | NOT_VERIFIED | 2026-11-01 | architecture §5 J-TIME-FREEDOM; MCP calendar_conflicts_get exists; UI flow and override audit unproven; the recorded override of an acknowledged clash needs RED #2795 (clash-marker migration, owner) | unproven | flow + production walk |
| 3.36 | Company Living CV | NOT_VERIFIED | 2026-11-01 | owner order 2026-10-24; nearest: company history 3.27 | unproven | owner to confirm the product shape |

## Demand, jobs & matching

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 4.1 | Canonical demand intake | LIVE_VERIFIED | 2026-11-01 | prod walk fresh-activation 41279196446 2026-11-01 on 38bfb9d93: fresh company describes a need, visible where it lands; prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-0b; earlier: fresh-activation run 40546035425 2026-10-27 on 429b106bc (after #2837+#2838): brand-new company saves its first need (no plan limit) in 4 clicks; visible on company home 1280+390 px; scouting room for the need opens with… | yes |  |
| 4.2 | Demand != supply direction | LIVE_VERIFIED | 2026-10-25 | public-market-direction run 40186517027 (green) 10-25: demand vs supply direction on public market, LT/EN/RU at 390+1280 px; anon refused from scouting + journal export | yes |  |
| 4.3 | Worker opportunity board + interest | LIVE_VERIFIED | 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-1; earlier: company-chain C-1 run 40315387466 (success; replaces 39960149411, which concluded failure — register D-7) | yes |  |
| 4.4 | Public /jobs board | LIVE_VERIFIED | 2026-10-28 | jobs-search 40645813917 J-1..J-6 6/6 (board, filter, page bounds, job page, signed-in save → saved view → remove); earlier: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-4 public job board renders a vacancy count | yes | open: UF-1, UF-2, UF-7 (first real user 2026-11-04) |
| 4.5 | Matching engine both directions | LIVE_VERIFIED | 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-2: real fit band + skill basis on the board (#2889); prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-1; earlier: #2887 RED applied (ledger 20261029180012) + app e506e98b, verified in production; isolated job-fit 46/46 + compat 2/2; earlier: search-support-privacy run 40215640433 10-25 | yes | older needs await an owner-approved backfill |
| 4.6 | Team matching + team offer | LIVE_VERIFIED | 2026-11-01 | prod walk brigade-formation 41350506578 2026-11-01 on 7c46946c3 (19/19, B2B-1..10: brigade offered and matched as one unit, handed into one team assignment, work recorded on it); product-truth journey link LIVE since #2917; details in the private record; earlier: brigade-formation run 39795574869 (green) 10-22 | yes | pricing note fixed #2687 |
| 4.7 | B2B negotiation | LIVE_VERIFIED | 2026-10-22 | brigade-formation run 39795574869 (green) 10-22 | yes |  |
| 4.8 | Anonymous public need intake | PASS_CI_ONLY | 2026-10-30 | isolated public-need walk (signup-isolated 40833394554, #2883): anonymous intake stores one row; earlier: form renders | unproven | not walked in production |
| 4.9 | Saved searches + alerts | LIVE_VERIFIED | 2026-11-02 | prod walk alert-mail 41488266687 2026-11-02 on fa81b12fd (9/9, 390 px): work card set to Sweden + cleaner writes 3 job alerts in ~12 s and the alert e-mail reaches the QA mailbox; a saved search is stored with alerts on, reopens from the board and is deleted; saved-search MATCH alerts depend on live organization needs and were 0 in this run (not observed); product defect fixed on the way: the work-card save did not reset the alert throttle across bundled module copies (#2952); earlier: isolated saved-search walk (40833394554, #2883): search stored, match notification + alert mail delivered; earlier: worker-records-exports run 40186822215 S-1/S-2: saved searches save + reopen PASS; alert delivery not proven | unproven | not walked in production |
| 4.10 | Organizational supply discovery | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-2; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-2 Gama discovers supply for its need: candidates + available workforce | yes |  |
| 4.11 | Candidates / scouting | LIVE_VERIFIED | 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-2; earlier: fresh-activation run 40546035425 2026-10-27: scouting room for a brand-new company's own need opens, 48 candidates listed; earlier company-chain C-2 + U-1..U-3 run 39960149411 | yes |  |
| 4.12 | Shortlist + notes | LIVE_VERIFIED | 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) K-1..K-5; earlier: company-talent-history run 40187168804 10-25: K-1..K-5 green — need posted, worker raises hand, Gama shortlists with internal note (persists), worker + other org see nothing, note cleared + need closed with history | yes |  |
| 4.13 | Auto-match + receipt | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-3; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-3 the need carries its automatic-matching receipt | yes |  |
| 4.14 | Candidate drafts | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-5; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-5 candidate draft created, seen after reload, deleted | yes |  |
| 4.15 | Agency-client bridge | LIVE_VERIFIED | 2026-11-03 | prod walk agency-chain 41717112150 2026-11-03 on a10b6c47d (passed); earlier: agency-chain run 40357361254 2026-10-26: 8/8 incl. A-1b (saved offer on the agency home, list one click away) + cleanup: this run's and the earlier run's synthetic offers withdrawn - production check: the synthetic agenc… | yes |  |
| 4.16 | Interested-worker contact | LIVE_VERIFIED | 2026-11-01 | prod walk company-chain 41283188592 2026-11-01 on 38bfb9d93 (13/13) C-3/C-4; earlier: company-chain C-3/C-4 run 40315387466 (success; replaces 39960149411 — register D-7) | yes |  |
| 4.17 | Discoverability consent | DUPLICATE | 2026-11-01 | duplicate of 2.35 (same function); kept for history, NOT counted in the totals; earlier: prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-8; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-8 employer visibility off, persists, back on | yes |  |
| 4.18 | Employer data disclosure grant | BLOCKED | — | owner #2471 | unproven |  |
| 4.19 | Contact disclosure requests | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) M-4; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): M-4 contact-details ask pending, then withdrawn | yes |  |
| 4.20 | Discovery identity protection | LIVE_VERIFIED | 2026-10-24 | worker-identity-split run 40046311013 (green) 10-24 | yes |  |
| 4.21 | Person page name gating | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-5; earlier: search-support-privacy run 40199732022 10-25: P-5 an unrelated organization opens the worker's page and sees no name | yes |  |
| 4.22 | 3 free profile views + VIP | NOT_IMPLEMENTED | — | built only in RED draft #2474, not merged/applied | no | owner approval + figures |
| 4.25 | Admin matching workbench | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/matching workbench renders open needs beside supply (read path; no decision written) | yes |  |
| 4.26 | /match-preview public fit | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): C-1 signed out: match preview computes the fit, says AI explanation not generated (LT+EN, 390+1280) | yes |  |
| 4.28 | First-party supply declaration | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-6; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): P-[volume withheld] declares own supply, persists after reload, withdraws (data-intent check) | yes |  |
| 4.29 | Interest->vacancy hand-off | LIVE_VERIFIED | 2026-10-23 | prod DB 10-23: 3/3 consented hand-offs delivered ~2 s (partner 201/200); 10 non-consented withheld by design; cron 06:00 call 200 | yes |  |
| 4.30 | Candidate pipeline -> hire decision -> close need (+ agency commissions, agency-to-agency) | NOT_VERIFIED | 2026-11-01 | vision §6; lib/pipeline/candidate-pipeline-facts.ts exists; decision + history UI and agency parts missing | unproven | build decision/history UI; agency parts |

## Chat & communication

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 5.1 | Chat-first home | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-3 chat opens the door for a known sentence, says 'not understood' for an unreadable one | yes |  |
| 5.2 | Transcript persistence | LIVE_VERIFIED | 2026-11-01 | prod walk chat-continuity 41322286924 2026-11-01 on 4a5b45828: a question survives a brand-new session; a thread never shows in another workspace; earlier: chat-continuity 40662743591; earlier: chat-continuity run 40042455002 (green) 10-23 | yes |  |
| 5.3 | Single-use confirmations | LIVE_VERIFIED | 2026-10-21 | chat-confirm-once 39604342494 10-21 | yes |  |
| 5.4 | Conversations / threads | LIVE_VERIFIED | 2026-11-03 | prod walk agency-chain 41717112150 2026-11-03 on a10b6c47d (passed); earlier: agency-chain 39601269995 10-21 | yes |  |
| 5.5 | Message translation | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: A-4/A-5 original English words shown labelled 'no translation' on phone; outsiders refused; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #27… | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 5.6 | In-app notifications | LIVE_VERIFIED | 2026-10-25 | notifications-inapp runs 40012716741 (10-23) + 40204616787 (10-25), 8/8 green both | yes |  |
| 5.7 | E-mail notifications | LIVE_VERIFIED | 2026-11-02 | prod walk alert-mail 41488266687 2026-11-02 (A-2 per-kind e-mail consent stored; A-3 a non-invitation notification e-mail (job_alert) arrived in the QA mailbox ~1 s after the alert, linking to an alerted ad; A-4 the mailed link opens the public job page signed out); earlier: isolated notification walk (40833394554, #2883): per-kind e-mail consent stored, invitation_accepted mail delivered; earlier: SMTP live since 2026-10-27 (invitation mails delivered to the provider); a notification e-mail (non-invitation kind) not yet observed in the send ledger | unproven | not walked in production |
| 5.8 | Push | BLOCKED | — | #2712 merged; migration 20261023190255 applied (0 subscriptions, RLS on, no anon grant); channel OFF unless WEB_PUSH_ENABLED=true (code-verified) | unproven | owner: VAPID keys + real delivery test |
| 5.9 | Weekly digest | PASS_CI_ONLY | 2026-11-02 | 2026-11-02 07:00 UTC the Monday sweep ran in production and wrote in-app digests; no digest e-mail went out because no recipient had switched digest e-mail on (consent-first, default off) — the e-mail hop is unexercised, not broken (measurements in the private record); proof pending: digest-setup (Tue..Sun) + digest-check (Monday after 07:05 UTC) on the synthetic QA mailbox account; 2026-11-02 production: e-mail consent for the digest stored and this week's in-app digest row present (alert-mail 41488266687 A-6); the digest E-MAIL (Monday 07:00 UTC sweep, only for workers who did not visit that week) has not been observed in production — the send ledger shows no digest mail in 30 days; earlier: isolated digest walk (40833394554, #2883): one digest per week, mail delivered; earlier: search-support-privacy run 40215640433 S-4: the weekly digest's in-app channel control exists; a digest itself not seen (email needs SMTP) | unproven | by design a worker who visited that week gets the digest in-app only |
| 5.10 | Attention / activity centre | LIVE_VERIFIED | 2026-11-01 | prod walk notifications-inapp 41312513056 2026-11-01 on 7f8bfaa2a (8/8), incl. N-6 mark-all-read on the phone; earlier: notifications-inapp run 40204616787 10-25 (8/8 green): N-5 activity centre lists the same stored event as read; N-3/N-4 bell row opens the thread and stays read after reload; N-6 phone 'mark all read'; N-7 no role detour | yes |  |
| 5.11 | Worker calendar | LIVE_VERIFIED | 2026-10-23 | calendar-planning run 40007491242 (green) 10-23 | yes | open: UF-6 (first real user 2026-11-04) |
| 5.12 | Availability | LIVE_VERIFIED | — | owner session write+revert | yes |  |
| 5.13 | Booking request->accept->engagement | LIVE_VERIFIED | 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 (16/17; B-1 skipped: no synthetic customer identity, 6.4 has its own proof): need, hand raised, dates proposed, withdrawn + re-proposed, worker accepts on the phone, company opens the conversation, booking in the worker plan; earlier run 41311931938 stopped at O-4 on a test locator (fixed #2905/#2907, no product change); earlier: orders-bookings run 40361384432 2026-10-26: O-0..O-8 all green - need posted, hand raised, dates proposed, withdrawn + re-proposed, worker ACCEPTS on the phone, company sees it and opens the conversation, booking in the … | yes | the acknowledged-overlap path stays RED #2795 (constraint not relaxed); plain accept works |
| 5.14 | Command finder + voice | LIVE_VERIFIED | — | owner #2673/#2679 (finder only) | yes |  |
| 5.15 | Voice as equal door | NOT_VERIFIED | — | COM-8 corrected to PARTIAL/CODE_PROVEN (#2714): voice capture panel + turn policy exist | unproven | no prod voice walk |
| 5.16 | Owner Telegram alerts | BLOCKED | — | owner bot token | unproven |  |
| 5.17 | Support conversations | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-1; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-[volume withheld] opens a support conversation, finds it in own inbox | yes |  |
| 5.18 | Global dashboard search | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-2; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-2 global dashboard search finds the conversation and opens it | yes |  |
| 5.19 | Inbox report view | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-5; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-5 company review inbox + printable report | yes |  |
| 5.20 | User-defined automations | NOT_IMPLEMENTED | 2026-11-01 | vision §12, §19 item 7 | no | build |
| 5.21 | SMS / WhatsApp channels | NOT_IMPLEMENTED | 2026-11-01 | vision §11 (marked later) | no | owner: paid channel provider (separate approval) |

## Marketplace

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 6.1 | Service offerings + request loop | LIVE_VERIFIED | 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the walk-only fix #3028; the earlier run 41721656743 on the same build failed M-5 on a test race: the publish action was still queued when the walk closed the page); earlier: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-2, M-5, M-6; earlier: marketplace-goods-services run 40164310896 10-25: service made discoverable, requested by another org, accepted with a note, requester sees acceptance, both sides message | yes |  |
| 6.2 | Listings goods/rental/wanted | LIVE_VERIFIED | 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the walk-only fix #3028; the earlier run 41721656743 on the same build failed M-5 on a test race: the publish action was still queued when the walk closed the page); earlier: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-1, M-3, M-4; earlier: marketplace-goods-services run 40164310896 10-25 (14/14): private sale listing, company rental published as the company, private 'looking for' listing, discovery, cross-org Q&A thread; cleanup closed all synthetic listin… | yes |  |
| 6.3 | One discovery index | LIVE_VERIFIED | 2026-11-03 | prod walk marketplace 41729310761 2026-11-03 on 7f0f06583 (passed after the walk-only fix #3028; the earlier run 41721656743 on the same build failed M-5 on a test race: the publish action was still queued when the walk closed the page); earlier: prod walk marketplace 41284728549 2026-11-01 on 38bfb9d93 (6/6) M-3/M-5; earlier: marketplace-goods-services run 40164310896 10-25: listings and services found in the one market discovery | yes |  |
| 6.4 | Buyer workspace | LIVE_VERIFIED | 2026-11-03 | prod walk buyer-workspace 41713787541 2026-11-03 on a10b6c47d (10/10, B-3b the customer door from #3003 included); earlier: prod walk buyer-workspace 41480104268 2026-11-02 on 4453e9d3a (9/9): B-0..B-3 workspace, B-4 provider service, B-5 a non-customer discovers buying and becomes a customer through the shipped UI, B-6 finds the provider and requests it, B-7 390 px, B-8 no console error or 401/403; clean-up withdrew the request and paused the service; earlier: buyer-workspace run 40377604733 2026-10-26 (owner-created synthetic buyer): B-0 onboarding via shipped wizard, B-[volume withheld] record saves + reads back, B-2 DRAFT request listed once, B-3 390 px no sideways scroll; … | yes | open security/permission item — details kept out of the public repository (owner rule) |
| 6.6 | Proposals/contracts | LIVE_VERIFIED | 2026-11-03 | prod walk documents-approvals 41716118134 2026-11-03 on a10b6c47d (passed); earlier: documents-approvals 40152566232 10-25 (walk passed) | yes |  |
| 6.7 | Procurement | LIVE_VERIFIED | 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 P-1; earlier: orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes |  |
| 6.8 | Business trips | LIVE_VERIFIED | 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 T-1; earlier: orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes | fixed by #2706 (rpc .catch crash) |
| 6.9 | Finance records | LIVE_VERIFIED | 2026-11-03 | prod walk orders-bookings 41718546706 2026-11-03 on a10b6c47d (passed); earlier: prod walk orders-bookings 41321294873 2026-11-01 on 4a5b45828 F-1..F-4 (another organization export never carries the record); earlier: orders-bookings run 40361384432 2026-10-26 PASS (re-proven) | yes |  |
| 6.10 | Project-cost calculator | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-7 project-cost calculator computes a result | yes |  |
| 6.11 | Cross-border readiness | LIVE_VERIFIED | 2026-10-23 | live 10-23 public part | yes | copy D-2 |
| 6.12 | Cross-border deals | NOT_IMPLEMENTED | — | registry NOT_BUILT: cross-border deals module | no | owner: decide whether 6.6 contracts + 6.11 cross-border readiness suffice |
| 6.13 | Orders goods purchase | NOT_IMPLEMENTED | — | registry NOT_BUILT: goods purchase order lifecycle | no | depends on payments for goods (only org plans are armed); owner design |
| 6.14 | Logistics | NOT_IMPLEMENTED | — | registry NOT_BUILT: logistics/shipment/freight | no | depends on 6.13 |
| 6.16 | Commercial handoff to the partner organization | LIVE_VERIFIED | 2026-10-24 | prod DB: commercial_handoffs 7 delivered, last 2026-10-24 08:58 UTC | yes |  |
| 6.17 | CRM pipeline | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pipeline renders all demand sources by stage (read-only by design) | yes |  |
| 6.18 | Waitlist | LIVE_VERIFIED | 2026-11-01 | prod walk register-gaps 41357630136 2026-11-01 (3/3) G-1: real anonymous submit from the plan card stored, the same synthetic address again answers already-on-the-list (the stored row); earlier: modal + validation live; no real submit | yes |  |
| 6.19 | Team enquiries | LIVE_VERIFIED | 2026-11-01 | prod walk company-talent-history 41279265278 2026-11-01 on 38bfb9d93 (17/17) T-1..T-5; earlier: public-org-locales run 40205429467 10-25 S-8 PASS (team enquiry inbox renders for the owner) | yes |  |
| 6.20 | Value channels | LIVE_VERIFIED | 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-9 chat names the value channel for an offer (#2831 fixed the walk's page-offset read; product answered correctly in 40363282539 too) | yes |  |
| 6.21 | /business/[slug] | BLOCKED | — | RED RPC owner | unproven |  |
| 6.22 | Housing / accommodation | NOT_IMPLEMENTED | 2026-11-01 | vision §8, §19 item 4 | no | owner scope, then build |
| 6.23 | Service order rating, cancellation and dispute | NOT_IMPLEMENTED | 2026-11-01 | vision §7 | no | owner policy, then build |
| 6.24 | Swipe-style B2C discovery feed | NOT_IMPLEMENTED | 2026-11-01 | decision 0013 pattern 3 (lower confidence) | no | owner to confirm |

## Plans, billing & entitlements

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 7.1 | Plan catalogue + /pricing | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-2 /pricing plan cards honest for the billing state | yes |  |
| 7.2 | Free organization limit 1 open need | PASS_CI_ONLY | 2026-10-23 | brigade walk 10-12; pilot lifted limit 10-23; 2026-11-01: not walkable on the QA cast (its organization holds the pilot) — needs a free synthetic organization | unproven |  |
| 7.3 | Entitlement resolver | LIVE_VERIFIED | 2026-10-23 | pilot payment changed effective entitlements live 10-23 | yes |  |
| 7.4 | Stripe TEST checkout/portal/webhook | OPTIONAL_TEST | 2026-10-28 | billing-test-mode never executed: the pilot organization is not armed in Stripe TEST; production stays LIVE (owner 10-28) | — | extra TEST scenario; does not block launch and is not a payment defect |
| 7.5 | Live charging | NOT_VERIFIED | 2026-11-01 | 2026-11-01 reconciled with product-truth: pilot payment only; self-serve paid plan is not live (owner decision MKT-7); the earlier production proof below stays valid for what it covered; earlier: real Stripe LIVE payment, webhook fired, pilot plan activated (owner-confirmed) | yes |  |
| 7.6 | Billing recovery cron | BLOCKED | — | #2696 removed the GH cadence that hit nginx-404; recovery still needs the VPS cron line + BILLING_RECOVERY_ENABLED | unproven | owner VPS step |
| 7.7 | Manual pilot grant (admin) | BLOCKED | — | no admin session | unproven |  |
| 7.8 | LMC credit ledger | BLOCKED | — | owner design | unproven |  |
| 7.9 | LMC top-ups, VIP, ai_plus, tiers | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC top-ups, VIP media EUR 24.99, ai_plus, agency tiers, referral rates | no | owner prices; LMC owner-locked |
| 7.10 | 3 profile views + VIP | DUPLICATE | 2026-11-01 | duplicate of 4.22 (same function); kept for history, NOT counted in the totals; earlier: built in RED draft #2474 (3 free profile views + org VIP), not merged/applied | no | owner approval + figures |
| 7.11 | Deferred plans | NOT_IMPLEMENTED | — | registry NOT_BUILT: worker_plus, agency_pilot plans | no | owner prices |
| 7.12 | AI cost metering | BLOCKED | — | AI runtime off (10.6) | unproven |  |
| 7.13 | Plan-gated booking_requests | NOT_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25: S-6 PASS - bookings surface renders with no plan gate at rest; the gate at the plan limit itself not exercised | unproven | needs an org at its booking limit (synthetic Gama is on the pilot) |
| 7.14 | Vacancy translation entitlement | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: C-2 failed on a spec locator (two main elements); translation entitlement needs AI; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <… | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 7.15 | EUR 99 subscription checkout | BLOCKED | — | EUR 99 order hidden by design while the pilot pass is on; VAT path = RED #2685 (Stripe Tax) awaiting owner approval | unproven | owner: approve #2685 and decide when to show EUR 99 |
| 7.16 | Webhook signature verification | LIVE_VERIFIED | 2026-10-23 | 3 LIVE events verified 10-23 | yes |  |
| 7.17 | No double charge / processing | LIVE_VERIFIED | — | 3 live events, 0 dup event ids, UNIQUE(provider,event_id); 1 subscription row | yes | 2 stale open checkout ops |
| 7.18 | Payment changes rights | NOT_VERIFIED | 2026-10-23 | paid -> rights PASS (pilot 10-23) | unproven | missing evidence: payment failure or expiry -> rights withdrawn (TEST-mode failed payment scenario, or the pilot's own expiry 2026-11-22) |
| 7.19 | Refunds and disputes | BLOCKED | — | refund/dispute recorded only; 0 events in prod | unproven | owner refund policy + TEST walk |
| 7.20 | Invoices inside LM | NOT_IMPLEMENTED | — | in-app invoices/payment history not built (Stripe portal invoice exists; RED draft #2682 adds plan name+amount only) | no | build Stripe invoice read for the org |
| 7.21 | Billing portal for every billing manager | NOT_VERIFIED | 2026-10-23 | payer opened the Stripe portal (10-23) | unproven | missing evidence: a second billing manager of the same org opens the portal |
| 7.22 | Paid-feature rights and limits | NOT_VERIFIED | — | plan limits enforced for needs + bookings (pilot lifted the open-need limit live) | unproven | missing evidence: the other paid-feature limits (profile views #2474, VIP) are not built/applied |
| 7.23 | LMC top-up | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC one-time top-up (1 LMC = [amount withheld]) | no | owner: packages, VAT, refund; LMC owner-locked |
| 7.24 | LMC granted once per payment | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC grant tied to one confirmed payment | no | depends on 7.23 |
| 7.25 | LMC balance and history | NOT_VERIFIED | 2026-10-25 | lmc-csrf run 40210854856 10-25: chat 'Kiek turiu LMC?' door opens the balance section (LT/EN, 390 px), signed-out refused; both synthetic accounts read state=no_account honestly — a measured balance/history not yet seen | unproven | open security/permission item — details kept out of the public repository (owner rule) |
| 7.26 | LMC spend + reversal | NOT_IMPLEMENTED | — | registry NOT_BUILT: LMC spend + refund reversal (functions exist, no caller) | no | depends on 7.23 |
| 7.27 | Free VIP for approved employers | FAIL | — | admin grant invisible in live org workspace (registry BROKEN) | no | owner #2474 |
| 7.28 | Payee and terms | FAIL | — | live terms name seller UAB the partner organization but no renewal/cancellation/refund/14-day withdrawal clauses, and say legal info is 'being prepared' while the paid pilot is live; anon pricing says nothing can be boug… | no | owner/legal clauses (RED); meta-text removal in progress |
| 7.29 | VAT Stripe Tax | NOT_VERIFIED | — | RED draft #2685; sandbox scenarios PASS Stripe-side | unproven |  |
| 7.30 | Invoices + work-acceptance acts from the Work Journal | NOT_IMPLEMENTED | 2026-11-01 | vision §10, §19 item 5 (invoice, advance, credit note, acceptance act, accountant export) | no | owner: invoicing rules per country, then build |
| 7.31 | Free + two paid tiers for workers AND for companies | NOT_IMPLEMENTED | 2026-11-01 | owner product goal (2026-11-01); documented today: worker free only (+1 deferred), company free + one paid tier (amount in the private record) | no | owner: final tiers, limits and prices (separate approval); no pricing change before that |

## Languages & markets

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 8.1 | UI localization | LIVE_VERIFIED | 2026-10-23 | live 6 locales x 25 routes 10-23 after #2686 | yes | D-1 fixed |
| 8.2 | Multilingual work understanding | LIVE_VERIFIED | 2026-10-26 | prod walk sectors-languages run 40300823818 (2026-10-26): 11/11 — 5 sectors understood, saved and listed (lt/en/ru/en/pl); #2779 regression: generic place word names no site and the 6 hours stay with the masonry in lt/en… | yes |  |
| 8.3 | Machine translation | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: A-4 no machine translation, original kept and labelled; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <main> on job pages) | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 8.4 | Country labour-market pages | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-5 country labour-market page renders | yes |  |
| 8.5 | Nine priority launch markets | BLOCKED | 2026-10-28 | 2026-10-28 catalog audit: active locales lt/en/ru/nl/de/pl complete (15191 strings, 0 '[EN]' placeholders); inactive da/et/lv/no/sv are PARTIAL (5817 of 15191 keys) and 22-44% of their strings are '[EN]' placeholders (da… | unproven | Activating the 5 markets needs ~9400 missing keys per locale plus the [EN] placeholders translated and reviewed (owner: translation source/budget decision; zero paid AI policy) |
| 8.6 | Country requirement matrix | LIVE_VERIFIED | 2026-10-25 | requirements-countries run 40209522348 10-25: C-1/C-2 DE+NL matrices from the country index (LT, EN, 390 px) with europa.eu sources; C-[volume withheld] documents view with sources, no upload; C-4 signed-out refused | yes |  |
| 8.7 | Public answer engine + llms.txt | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-8 /llms.txt plain text naming the product | yes |  |
| 8.8 | SEO plumbing | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-9 robots, sitemap, canonical + hreflang to the apex | yes |  |
| 8.9 | Public org profile | BLOCKED | 2026-10-26 | public-org-locales run 40205429467 10-25: S-10 skipped honestly - no organization has a published public profile (production count 0, 2026-10-26); publishing the synthetic Alfa profile would put a test object on a public… | unproven | owner: allow a synthetic public profile for the walk, or wait for a real organization to opt in |
| 8.10 | Marketing site | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-1 landing + 4 marketing pages LT/EN/RU at 390 and 1280 | yes |  |
| 8.11 | Mobile web | LIVE_VERIFIED | 2026-11-01 | prod walk mobile-surfaces 41311144346 2026-11-01 on 7f8bfaa2a (6/6) and 41317177981 on 681e6678f (6/6, bookings page added to the hydration check): manager and worker daily surfaces at 390 px; mobile WEB only, the native apps are 8.17/8.18; earlier: mobile-surfaces run 40195784343 10-25 (5/5 green, after #2751/#2755/#2759): worker + manager at 390 px — 0 boxes past the edge on lt/ru dashboard, nl/de cv, hours, project operations (project-first), planning (notice in … | yes |  |
| 8.12 | PWA installability | LIVE_VERIFIED | 2026-10-25 | public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-10 every locale home links the manifest; served | yes |  |
| 8.13 | Native app | BLOCKED | 2026-10-30 | shared native client proven per platform in 8.17 (Android) and 8.18 (iOS) on production build 84cc2f85; earlier: ARCH-6 + store accounts | unproven |  |
| 8.14 | App links | BLOCKED | — | store accounts | unproven |  |
| 8.15 | Mobile store release | BLOCKED | 2026-10-30 | apps run against production (8.17 Android, 8.18 iOS); no store listing; earlier: no Play/App Store listing exists | unproven | owner store accounts (Google Play, Apple, EAS) + ARCH-6 |
| 8.16 | Language feedback | LIVE_VERIFIED | 2026-10-26 | public-org-locales run 40371836163 2026-10-26: S-12 the synthetic owner sends a language report from the account menu, sees 'Ačiū — pranešimas užfiksuotas'; DB: exactly 1 language_feedback row of this run (17:54 UTC, QA-… | yes |  |
| 8.17 | Android app (native) | LIVE_VERIFIED | 2026-11-02 | 2026-11-02 from `main` @bdb27bb88 against production (run 41451882387): sign-in, journal write + correction draft → confirm, messages list/open/reply draft (not sent), notifications list, jobs read, empty need refused; earlier: Android signed-in journey on production build 84cc2f85 (run 41014999978): sign-in, Today read, journal entry drafted + confirmed (row in DB), profile, jobs search, job opened (hand-off ok), empty need refused, sign-out; … | yes | not in Google Play (see 8.15) |
| 8.18 | iOS app (native) | LIVE_VERIFIED | 2026-11-02 | 2026-11-02 from `main` @bdb27bb88 against production (run 41451829006, attempt 2 of 2; attempt 1 lost the simulator screen after sign-in): sign-in, journal write + correction draft → confirm, messages list/open/reply draft (not sent), notifications list, jobs read; earlier: iOS signed-in journey on production build 84cc2f85 (run 41015011284, passed on attempt 2 of 2): sign-in, Today read, journal draft + confirm, profile, jobs search, job opened (hand-off ok), empty need refused, sign-out | yes | need submission not tested on iOS (open, owner decision); first attempt can stall on the system Save-Password sheet; not in the App Store (see 8.15) |

## Admin, privacy & security

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 9.1 | Superadmin console | LIVE_VERIFIED | 2026-10-28 | admin-console 40688059945 (2026-10-28) green: non-admins refused, operator pages render; owner admin session 2026-10-25 ~13:50 LT on build 3f552e0d (#2761): /lt/dashboard/admin renders all sections (buyer requests, privacy, sales pipeline, moderation, people, launch readiness), no error boundary; be | yes |  |
| 9.2 | Admin pilots/telemetry/league | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/pilots, /admin/telemetry and /admin/league render real data | yes |  |
| 9.3 | Admin user inspect | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25, read-only: /admin/users/<synthetic QA id> renders role, state, profile text, suggested skills, drafts with honest empty states | yes |  |
| 9.4 | Privacy request intake | LIVE_VERIFIED | 2026-10-19 | prod DB: erasure request received + executed via intake 2026-10-19 (receipt requested_at) | yes |  |
| 9.5 | GDPR export | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-2; earlier: search-support-privacy run 40199732022 10-25: P-[volume withheld] downloads own data bundle (measured, never read, deleted) | yes |  |
| 9.6 | GDPR erasure executor | LIVE_VERIFIED | 2026-10-19 | prod DB: privacy_erasure_receipts_v3 executed receipt 2026-10-19 15:23 UTC | yes |  |
| 9.7 | Worker row access identity split | LIVE_VERIFIED | 2026-10-21 | worker-identity-split 39602569732 10-21 | yes |  |
| 9.8 | RLS on every table | LIVE_VERIFIED | 2026-10-23 | prod catalog 10-23: 243/243 public tables RLS on; 15 no-policy tables sealed; anon probes 401/404 | yes | cleanup candidate backfill snapshot (RED) |
| 9.9 | Audit trail | PASS_CI_ONLY | 2026-10-30 | isolated walk 40833394554 (#2883) | unproven | open security/permission item — details kept out of the public repository (owner rule) |
| 9.10 | Rate limiting | LIVE_VERIFIED | 2026-10-23 | live 10-23: 6 anon POST /api/waitlist (non-JSON) -> 5x400 then 429 retry-after 600 (5/10 min) | yes | in-memory per instance; real-IP depends on VPS cloudflare.inc |
| 9.11 | Same-origin checks | LIVE_VERIFIED | — | prod build 711745d0 (waitlist 403, logout 303) + lmc-csrf run 40210854856 O-1..O-3: cross-origin transcript POST refused, same-origin validated (LT/EN/390), foreign Server Action POST aborted before lookup | yes |  |
| 9.12 | Legal pages | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-1; earlier: public-org-locales run 40205429467 10-25 (19 green, 2 skipped): U-6 legal pages render | yes |  |
| 9.13 | Personal location privacy | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) P-4; earlier: search-support-privacy run 40199732022 10-25: P-4 a preferred location's visibility changes, persists and is put back | yes |  |
| 9.14 | Telemetry / funnel | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/telemetry funnel renders real counts (90-day, admin + non-prod excluded) | yes |  |
| 9.15 | Search stacks | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-3; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-3 synthetic organization findable in the network directory (directory part) | yes |  |
| 9.16 | External referral API | BLOCKED | — | partner tokens; anon 401 PASS | unproven |  |
| 9.17 | Internal supply feed | PASS_CI_ONLY | 2026-10-23 | 401 anon; edge logs show authorized Agentai pulls 10-23 (readback 05:50, supply feed 06:02/08:32/11:01) | unproven | readback 1x/24 h vs 4/day intended |
| 9.18 | Public JSON APIs | LIVE_VERIFIED | 2026-11-01 | prod walk register-gaps 41357630136 2026-11-01 G-2 (green; details in the private record); earlier: /api/health public 200 ok; others authenticated by design | yes |  |
| 9.19 | Admin import sandbox | BLOCKED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_SANDBOX_ENABLED=1' (honest off state) | unproven | owner: enable flag if wanted |
| 9.20 | Admin intelligence inspector | BLOCKED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): renders 'disabled — set INTELLIGENCE_INSPECTOR_ENABLED=1' + source activation readiness | unproven | owner: enable flag if wanted |
| 9.22 | Env schema validation | LIVE_VERIFIED | — | zod env validation at load; deploy 39952179926 health=healthy, build 431385cf; rollback on unhealthy | yes | open security/permission item — details kept out of the public repository (owner rule) |
| 9.23 | Security-definer governance | LIVE_VERIFIED | 2026-10-23 | prod 10-23: anon SECURITY DEFINER set = allowlist 9/9; PUBLIC exec 0/589 | yes | 3 functions mutable search_path (RED R-2) |
| 9.24 | Security incident handling | LIVE_VERIFIED | — | live headers HSTS preload, CSP report-only, XFO DENY, nosniff, Referrer/Permissions-Policy; monitor issues + health probe + onRequestError + client-errors | yes | CSP has no report-uri |
| 9.25 | CodeQL / dependency alerts | FAIL | 2026-11-01 | 2026-11-01: triaged, details in the private record; earlier: #2879, #2880, #2881 merged | no | open security/permission item — details kept out of the public repository (owner rule) |

## MCP & AI agents

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 10.1 | MCP door 229 tools | LIVE_VERIFIED | 2026-11-01 | prod walk mcp-agents 41307643008 2026-11-01 on c3df7431d (10/10, A-9 — details in the private record); mcp-chain 39606986334; mcp-agents 10-23 | yes | tools/list 233 tools on c3df7431d; the row title's 229 predates #2889/#2895 |
| 10.2 | Agent scenarios over MCP | LIVE_VERIFIED | 2026-10-23 | mcp-agents 9/9 39885097311 10-23 | yes |  |
| 10.3 | OAuth 2.1 for MCP clients | LIVE_VERIFIED | 2026-11-02 | prod walk mcp-oauth-client 41354839810 2026-11-02 (6/6, from #2454 branch) | yes | #2454 (the spec) awaits owner merge; a security item is open (details in the private record) |
| 10.4 | MCP scopes | NOT_IMPLEMENTED | 2026-11-02 | registry NOT_BUILT: MCP OAuth scope enforcement | no | auth path = RED; design draft #2923; final set = owner decision X-2 |
| 10.5 | ChatGPT/Claude listings | BLOCKED | — | owner portals | unproven |  |
| 10.6 | AI runtime | BLOCKED | 2026-10-26 | ai-off-honesty run 40191899327 10-25: B-4 provider state shown as off; re-proven 2026-10-26 prod walk ai-off-honesty run 40301607964 13/13 (honest off state; #2771 one <main> on job pages) | unproven | AI provider keys (owner) — honest off-state proven, the AI function itself not |
| 10.7 | Conversation intent LLM | BLOCKED | — | 10.6 | unproven |  |
| 10.8 | CV AI structuring | BLOCKED | — | 10.6 | unproven |  |
| 10.9 | Journal AI suggestions | BLOCKED | — | 10.6 | unproven |  |
| 10.10 | Explanation AI | BLOCKED | — | 10.6 | unproven |  |
| 10.11 | Six agents without call site | LIVE_VERIFIED | — | decision implemented (#2765): country_readiness integrated, 5 duplicates retired, 0 uncalled agents; prod: anon Chromium (not_authenticated) + requirements-countries run 40209522348 C-5 signed-in -> ai_off, requirements … | yes |  |
| 10.13 | /dashboard/assist | LIVE_VERIFIED | 2026-10-25 | ai-off-honesty run 40191899327 10-25 (12/13 green): B-4 assist page states the AI provider state and that no text came from a model (LT+EN) | yes |  |
| 10.14 | Agents OS admin page | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/agent-os renders the agent register | yes |  |
| 10.15 | Agents OS runtime | NOT_IMPLEMENTED | — | registry NOT_BUILT: autonomous internal agents runtime | no | owner AGENT-1..4 decisions; ARCHITECTURE_ONLY |
| 10.16 | AI agents as participants | NOT_IMPLEMENTED | — | registry NOT_BUILT: AI agents as market participants (AI-4) | no | owner AGENT-1..4 decisions |
| 10.17 | External action receipts | LIVE_VERIFIED | 2026-10-23 | mcp-agents run 39885097311 (green) 10-23; audit_logs rows observed | yes |  |
| 10.18 | Vacancy source SE | LIVE_VERIFIED | 2026-10-23 | cursor 06:03 10-23; 49,731 live | yes |  |
| 10.19 | Vacancy source NAV | LIVE_VERIFIED | 2026-10-23 | cursor 07:27 10-23; 9,266 live | yes |  |
| 10.20 | Vacancy retention | FAIL | 2026-10-23 | dry run 39936626534 10-23 fails closed: service_role lacks SELECT on 2 protected-id tables; would purge 110,481/[volume withheld] | no | open security/permission item — details kept out of the public repository (owner rule) |
| 10.21 | Eurostat import | BLOCKED | — | gates on but no scheduler calls runEurostatImport; data from 07-15 | unproven | owner: allow scheduled import |
| 10.22 | the partner organization integration | BLOCKED | — | owner | unproven |  |
| 10.23 | Agentai supply feed | LIVE_VERIFIED | 2026-10-24 | prod edge logs 2026-10-24/25: rpc first_party_supply_feed_v1 200 x4 (last 09:32 UTC) = authorized feed pulls served; anon 401 (earlier probe) | yes |  |
| 10.24 | Self-hosted STT/translate | BLOCKED | — | owner deploy | unproven |  |
| 10.25 | Cloudflare AI adapter | BLOCKED | — | owner key | unproven |  |
| 10.26 | OpenAI apps challenge | BLOCKED | — | owner token | unproven |  |
| 10.27 | Maps | LIVE_VERIFIED | 2026-11-01 | prod walk search-support-privacy 41283989921 2026-11-01 on 38bfb9d93 (20 green, 2 planned skips) S-6; earlier: search-support-privacy run 40215640433 10-25 (20 green, 2 planned skips): S-6 map renders markers, no external geocoding call | yes |  |

## Education & learning

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 11.1 | Institution + learner link | LIVE_VERIFIED | 2026-10-21 | learning-practice 39601905282 10-21 | yes |  |
| 11.2 | Programmes / cohorts | LIVE_VERIFIED | 2026-11-03 | prod walk cohort-join-request 41611766407 2026-11-03 (6/6): an institution opens a group; a learner asks to join (own record stays declared); the request grants nothing and cannot be self-accepted; callers without authority (anon, worker, agency) are refused and read no request text; the institution's own authorised person accepts in two steps; the learner is a member (compass) — after #2959, #2977 (applied 2026-11-02 / 2026-11-03), #2979, #2983; earlier: 2026-11-02: learner self-request to join a cohort (owner decision 2026-11-02, decision 0028 J-12) built in RED draft #2959 (migration 20261102160000, scratch-PG proof 43/43), NOT applied; stays NOT_VERIFIED until the owner applies it and a production walk passes. 2026-11-01 reconciled with product-truth: product-truth: learners cannot join a cohort themselves (EDU-2, owner decision ARCH-3); the earlier production proof below stays valid for what it covered; earlier: learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.3 | Learning compass | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.4 | Practice capacity | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.5 | Learner outcomes | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.6 | Institution reporting + export | LIVE_VERIFIED | 2026-10-25 | learning-practice run 40154033299 (green) 10-25 | yes |  |
| 11.7 | Practice->competency recognition | LIVE_VERIFIED | 2026-11-03 | prod walk recognition-chain 41617507405 2026-11-03 (7 passed, R-3 skipped: learner already connected): the learner records a practice day in the training relationship; the institution's authorised person signs it off in its review queue; the institution picks THAT signed-off practice and records the competency recognition (assessor ≠ the learner's employer, conflict rule); the learner sees the recognition among their own. Earlier: 2026-11-02: D-15 design recorded in decision 0028 (recognition = separate assessor act on existing evidence, never automatic); no status change. 2026-11-01 reconciled with product-truth: product-truth: demonstrated capability is not recognised against a formal requirement (SKL-9); the earlier production proof below stays valid for what it covered; earlier: recognition-chain 39602983862 10-21 | yes |  |
| 11.8 | Training & certification register | FAIL | 2026-10-28 | company-governance 40687308231 (2026-10-28 12:28Z) green incl. T-5 — #2857 workspace scoping LIVE_VERIFIED; course register, assign, complete, see completed, retire all pass | yes | engaged non-member workers cannot be assigned training (owner product decision, RED #2816) |
| 11.9 | Human-in-loop learning review | BLOCKED | — | owner parked nav door | unproven |  |
| 11.10 | RPL equivalence structure | NOT_IMPLEMENTED | — | 2026-11-02: design recorded in decision 0028 §D-15 (procedure; structure stays deferred under ARCH-2 until the first assessor and requirement set are named). registry NOT_BUILT: RPL equivalence structure (ARCH-2) | no | owner, RED schema |

## Market intelligence

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 12.1 | Market map | LIVE_VERIFIED | 2026-10-23 | owner session 10-23: market map renders Leaflet tiles, markers, radius and location controls | yes |  |
| 12.2 | Labour-market intelligence | LIVE_VERIFIED | 2026-10-23 | live public 10-23 | yes | copy D-2 |
| 12.3 | /dashboard/intelligence | LIVE_VERIFIED | 2026-11-01 | prod walk profile-cv-history 41282258795 2026-11-01 on 38bfb9d93 (21/21) P-19; earlier: profile-cv-history run 40182648408 10-25 (21/21 green): P-19 intelligence page with method and sources | yes |  |
| 12.4 | Demand recognizer | LIVE_VERIFIED | 2026-10-23 | owner session 10-23 after #2690: LT need sentence recognises role, place (Vilniuje), experience, scope, start (nuo lapkričio) 5/21 | yes | duration-vs-headcount follow-up #2694 (auto-merge after regression tests); re-check after deploy; crews not representable yet (flagged) |
| 12.5 | Public market facts | LIVE_VERIFIED | 2026-10-23 | live 10-23 58,997 = DB | yes |  |
| 12.6 | Admin league / market | LIVE_VERIFIED | 2026-10-25 | owner admin session 2026-10-25 12:30 LT, read-only Chromium (Claude in Chrome): /admin/league + /admin/market render real supply/demand aggregates with n<5 flags | yes |  |

## Infrastructure & operations

| ID | Function | Status | Last checked | Evidence (PR / commit / run) | In production | Remaining issue |
|---|---|---|---|---|---|---|
| 13.1 | VPS hosting + auto-deploy | FAIL | 2026-11-01 | 2026-11-01: infrastructure finding and remediation #2911 + agentai#1226 (live 2026-11-01); details in the private record; 72 h verdict due 2026-11-04 before any status change; earlier: 10-28 recurrence: admin-console 40668817886 (worker page timeout) and company-governance 40678088257 (D-1 chunk load timeout, ChunkLoadError in the app log) while the server answered normally; deploys green; 10-28 intermittent inbound loss from GitHub-hosted networks, host healthy; earlier: external | no | REGRESSION-class infra: GitHub-runner → VPS inbound loss now fails production walks; provider network fault probable, not proven; Hostinger ticket pending owner |
| 13.2 | Health probe + monitor | LIVE_VERIFIED | — | live | yes |  |
| 13.3 | Prod QA walk harness | LIVE_VERIFIED | 2026-10-22 | role-routes run 39783147517 (green) 10-22 | yes |  |
| 13.4 | Supabase capacity | PASS_CI_ONLY | 2026-10-25 | Supabase org plan=pro (get_organization 2026-10-25) | unproven |  |
| 13.5 | Database backup | LIVE_VERIFIED | 2026-11-05 | First backup started by a merge: run 41981561592 2026-11-05 on `f8dbb2b3b`, 18.6 h after the previous one: restore drill exact (287 tables, 0 outside their window), Storage files 73/73, grants exact, 0 tables missing, both files `BACKUP_OK`, pair `20261105T063721Z`; the next run skipped as it should (41982931958). Earlier: full run 41824425911 on `51942af1d`: first stored dump with grants, grants exact, both files `BACKUP_OK`; it closed the failure issue #3058 by itself. Grants kept and proven (#3061): restore drill 41822877894 on main `51942af1d`: grants equal the source in 17 schema/kind groups, 287 tables compared, 0 outside their window, 0 missing; an injected extra grant failed the drill before shipping (41819279617). Manual full run 41815407585 2026-11-04 on `af97d1b54`: guard, backup and notify succeeded; 287 tables compared, 0 outside their window, 0 missing, schema objects exact; Storage files 66/66; both files `BACKUP_OK` from the VPS. Earlier: #3005: restore drill 41664420591 and full run 41665452921 2026-11-03 — scope public, auth, storage, supabase_migrations + Storage files + scheduled-job definitions; schema objects restored exactly, every table inside its source window, every Storage file by count and bytes; both encrypted files reach the VPS and decrypt; restore procedure in VPS_PRODUCTION_RUNBOOK §9.1.1; earlier: 2026-10-27 read-only: db-backup.yml stops at 'Require secrets' nightly since 10-18 (10-17 drills: permission denied); repo has VPS_DEPLOY_* but neither SUPABASE_ACCESS_TOKEN nor SUPABASE_BACKUP_DB_URL; 0 successful runs … | yes | Per part, 2026-11-05. PASS: start after Quality Gates on main, guard skip (41834401403, #3067); a backup started by a merge (41981561592); freshness job fresh path (41834401352); full backup + restore drill + shipping + stored grants (41824425911); grants proof and mismatch stop (41822877894, 41819279617); the failure issue closing (#3058). NOT VERIFIED: a backup started by the schedule (first slot since #3051 fired 2026-11-04 18:45 UTC, at least 3 h late, and the guard skipped it as it should, 41890262254; the 2026-11-05 00:28 UTC slot skipped too, 12 h after the last backup, 41941621226; measured over 7 days, frequent workflows lost 83-98% of slots and daily ones started 6-8 h late); the 26 h freshness job's stale path; the failure issue opening from a run on main; decrypting a stored file (last done 2026-11-03 on the VPS with its key; the check of today's file was refused to the agent session); the owner's offline key decrypting (never shown); a restore into a real Supabase project. VPS watchdog: NOT INSTALLED, on hold by the owner's order of 2026-11-05 (no root install; the 2026-11-04 approval no longer stands). A non-root variant is prepared for review only in draft #3104; installing it needs a separate owner approval. The owner approved an admin alert address; that it receives mail is not yet shown. Retention from the receiver, 2026-11-04: 4 dumps and 3 file bundles kept, 14-day rotation, 20,809 MB free, 366 MB a pair. No automatic off-site copy; a Backblaze plan is private and not activated (owner decision). Manual: encrypted files of 2026-11-03 on the owner's PC; Supabase managed backups (list not read). |
| 13.6 | VPS cron bundle | LIVE_VERIFIED | 2026-10-23 | prod data 10-23: all 4 VPS cron entries ran (handoffs 06:00, job-alerts, weekly digest Mon, erasure every 10 min); pg_cron booking expiry ran | yes | 1 erasure notice queued (no SMTP) |
| 13.7 | Migration safety + parity | LIVE_VERIFIED | 2026-10-23 | parity tool vs prod ledger 10-23 | yes |  |
| 13.8 | Migration ledger parity | LIVE_VERIFIED | 2026-10-23 | prod ledger 10-23: 396 match; all drift documented except ESCO fn applied with file only in open #2410 | yes | record/merge #2410 |
| 13.9 | Supabase GitHub integration | BLOCKED | — | owner | unproven |  |
| 13.10 | Quality gates | LIVE_VERIFIED | 2026-10-25 | Quality Gates on main run 40175733431 success 2026-10-25 | yes |  |
| 13.11 | E2E in CI | LIVE_VERIFIED | — | e2e-smoke 39950760373 on live build 431385cf: 32/32 | yes |  |
| 13.12 | Executable product constitution | LIVE_VERIFIED | — | quality 39950760135 product-truth green (111 caps, 28 nodes, 6 journeys) | yes |  |
| 13.13 | Feature-availability catalogue | NOT_VERIFIED | 2026-11-01 | 2026-11-01 code read: the catalogue's UI consumers (feature-availability-grid, role-catalogue-card) are rendered by no page, so it has no dashboard effect to walk (built, not connected); catalog guards green; effect only in signed-in dashboards, no prod walk | unproven |  |
| 13.14 | Owner waivers / product gate | LIVE_VERIFIED | — | product gate + self-test pass; waivers 35/35; live anon secdef gate PASS 589/9 | yes | live parity gate skipped: CI role lacks USAGE on supabase_migrations (owner GOV-1) |
| 13.15 | Old-browser compatibility | LIVE_VERIFIED | — | shim live | yes |  |
| 13.16 | Browser crash reports | NOT_VERIFIED | — | only a registry citation; no primary evidence recoverable | unproven |  |
| 13.17 | Env parity after hosting move | FAIL | 2026-10-27 | 2026-10-27 read-only: last real AI call gemini 2026-10-15 16:07; since then provider=disabled reason=mode_disabled (AI_PROVIDER_MODE not live) - 25 calls to 10-27; lifetime AI spend actual $0.16 (Oct $0.09/234 calls). In… | no | OWNER+LEGAL: AI off coincides with owner 10-15 Gemini personal-data restriction (needs billed key + AI_GEMINI_PAID_TIER_CONFIRMED=1 / DPA). SMTP: LM_SMTP_PASS + INVITE_EMAIL_PROVIDER=smtp via lm-env-set.sh |

## Function map data

Source for the interactive function map, added 2026-11-05. **Status, evidence and date still come only from the function rows above.** IDs are those row IDs.

How to read it:

- **Draft.** A description says what a function is for, not that it works. State is derived from the row's status: LIVE_VERIFIED = veikianti; PASS_CI_ONLY or NOT_VERIFIED = testuojama; BLOCKED or FAIL = užblokuota; NOT_IMPLEMENTED = planuojama, or kuriama if it has an open PR. OPTIONAL_TEST and DUPLICATE rows aren't counted.
- **Naršyklė** comes from keywords in the evidence column, not a row-by-row read: `eisena` = a browser walk in production (Playwright Chromium, synthetic users, not a person in Chrome), `savininkas` = the owner or a real user in a browser, `api` = production proof with no browser, `ne` = no browser named. Empty = not counted.
- **Poreikiai** means the function serves that need at least in part. A general function can serve a need that has no dedicated function, so a count here doesn't show the need is covered. `senjorai` has none.
- **Tikrinta**: `kodas` = its route was found in the code, not that the behaviour was confirmed there; `registras` = read from the register only. Empty cells mean not known.
- **Kaina** is `nenustatyta` unless the register or plan code states it.
- **Completion rule for the map:** veikianti and Naršyklė is `eisena` or `savininkas`, over all counted rows in that need, with a missing value counted as not done. Always show both numbers. The three measures above stay as they are.

Not filled yet: `Map: stages`. `Map: blockers` holds open PRs linked to function rows; forgotten items aren't linked yet. Open work is in [`COORDINATION_REGISTER.md`](COORDINATION_REGISTER.md) §7.

### Map: groups

| Group | Lietuviškai | Trumpai |
|---|---|---|
| 1 | Paskyra, registracija ir organizacijos | Kaip prisijungi ir kuriam darbui ar įmonei priklausai |
| 2 | Darbuotojo profilis, darbo žurnalas ir gyvas CV | Tavo darbo istorija ir įgūdžiai vienoje vietoje |
| 3 | Įmonės darbai ir projektai | Žmonės, valandos ir projektai |
| 4 | Poreikiai, darbo skelbimai ir atranka | Kaip žmogus ir darbas randa vienas kitą |
| 5 | Pokalbiai ir pranešimai | Bendravimas ir priminimai |
| 6 | Prekyvietė | Paslaugos ir prekės tarp žmonių ir įmonių |
| 7 | Planai ir mokėjimai | Kas nemokama, kas mokama ir kaip mokama |
| 8 | Kalbos ir rinkos | Kalbos, šalys ir programėlės |
| 9 | Administravimas, privatumas ir saugumas | Tavo duomenų apsauga ir administratoriaus darbas |
| 10 | Pagalbininkai ir dirbtinis intelektas | Pokalbių asistentai ir jų ribos |
| 11 | Mokymasis | Mokymo įstaigos, grupės ir pripažinimas |
| 12 | Rinkos žinios | Ką rodo darbo rinkos duomenys |
| 13 | Infrastruktūra ir veikimas | Kas palaiko sistemą veikiančią |

### Map: functions

| ID | Pavadinimas | Ką leidžia | Kam | Kur rasti | Poreikiai | Naršyklė | Kaina | Vykdytojas | Tikrinta |
|---|---|---|---|---|---|---|---|---|---|
| 1.1 | Registracija ir prisijungimas | Susikuri paskyrą ir prisijungi el. paštu bei slaptažodžiu. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/signup, /auth/login |  | eisena | nenustatyta |  | kodas |
| 1.2 | Prisijungimas per Google | Prisijungi viena paspaudimu su savo Google paskyra. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/login |  | savininkas | nenustatyta | Koordinatorius | kodas |
| 1.3 | Slaptažodžio atkūrimas | Pamiršęs slaptažodį gauni laišką ir nusistatai naują. | darbuotojas, ieškantis darbo, įmonė, agentūra | /auth/forgot-password |  | eisena | nenustatyta |  | kodas |
| 1.4 | Pirmieji žingsniai po registracijos | Po registracijos žingsnis po žingsnio nustatai, ko tau reikia. | darbuotojas, ieškantis darbo, įmonė, agentūra | /onboarding | pirmas-darbas,isidarbinimas,samdymas | eisena | nenustatyta |  | kodas |
| 1.5 | Keli vaidmenys vienoje paskyroje | Vienoje paskyroje gali būti ir darbuotojas, ir įmonės žmogus. | darbuotojas, įmonė, agentūra | /dashboard/account |  | eisena | nenustatyta |  | kodas |
| 1.6 | Įmonės paskyros sukūrimas | Sukuri savo įmonės ar organizacijos paskyrą. | įmonė, vadovas, agentūra | /dashboard/start/company | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 1.7 | Įmonės patikra | Įmonė patvirtinama, kad kiti ja galėtų pasitikėti. | įmonė, administratorius | /dashboard/admin/company-verification | samdymas | eisena | nenustatyta |  | kodas |
| 1.8 | Viena organizacija, keli veiklos tipai | Viena organizacija gali veikti keliose srityse vienu metu. | įmonė |  | verslo-valdymas | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 1.9 | Nariai, kvietimai ir vaidmenys | Pakvieti žmones į įmonę ir nustatai, ką kiekvienas gali daryti. | įmonė, vadovas | /invite/[token] | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 1.10 | Darbo erdvės perjungimas | Perjungi tarp savo asmeninės ir įmonės erdvių. | darbuotojas, įmonė, vadovas, agentūra | /dashboard |  | eisena | nenustatyta |  | kodas |
| 1.11 | Įmonių duomenų atskyrimas | Apsaugo, kad viena įmonė nematytų kitos įmonės duomenų. | sistema |  |  | api | nenustatyta |  | registras |
| 1.12 | Kvietimai ir rekomendavimas | Pakvieti pažįstamus prisijungti per savo nuorodą. | darbuotojas, įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 1.13 | Sistemos laiškai | Gauni svarbius laiškus apie savo paskyrą ir veiksmus. | darbuotojas, ieškantis darbo, įmonė |  |  | ne | nenustatyta | Savininkas ir teisininkas | registras |
| 1.14 | Pranešimas apie peržiūrą | Personalas gauna žinią, kai ką nors reikia peržiūrėti. | administratorius |  |  | eisena | nenustatyta |  | registras |
| 1.15 | Įmonės praeitis ir jos perėmimas | Perimi savo įmonės ankstesnius darbo įrašus. | įmonė, vadovas | /dashboard/company/history | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 2.1 | Profesinis profilis | Susirašai, kas esi ir ką moki dirbti. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | isidarbinimas,tobulejimas,pirmas-darbas | eisena | nenustatyta |  | kodas |
| 2.2 | Darbo kortelė | Nurodai, kada gali dirbti, kokio atlygio tikiesi ir kur. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | isidarbinimas,savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 2.3 | CV įkėlimas ir patvirtinimas | Įkeli CV ir patvirtini kiekvieną joje rastą faktą. | darbuotojas, ieškantis darbo | /cv | isidarbinimas,karjeros-keitimas,pirmas-darbas | eisena | nenustatyta |  | kodas |
| 2.4 | Gyvasis CV | Turi nuolat atsinaujinantį CV, kurį gali atsisiųsti. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /cv | isidarbinimas,tobulejimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 2.5 | Darbo patirtis | Surašai, kur dirbai ir ką darei. | darbuotojas, ieškantis darbo | /dashboard/profile | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 2.6 | Praktika ir savanorystė | Įrašai praktiką ir savanorystę kaip patirtį. | ieškantis darbo, besimokantis, darbuotojas | /dashboard/profile | pirmas-darbas,mokymasis | eisena | nenustatyta |  | kodas |
| 2.7 | Išsilavinimas | Pridedi savo mokslus ir kvalifikacijas. | darbuotojas, ieškantis darbo, besimokantis | /dashboard/profile | pirmas-darbas,mokymasis,isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.8 | Pasiekimai ir pažymėjimai | Pridedi pasiekimus ir savo nurodytus pažymėjimus. | darbuotojas, ieškantis darbo | /dashboard/profile | isidarbinimas,tobulejimas | eisena | nenustatyta |  | kodas |
| 2.9 | Kalbos | Nurodai, kokias kalbas moki ir kaip gerai. | darbuotojas, ieškantis darbo | /dashboard/profile | isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.10 | Nuorodos į kitus profilius | Prie profilio pridedi nuorodas į savo darbus kitur. | darbuotojas, savarankiškas specialistas |  | savarankiskos-paslaugos | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 2.11 | Reikalavimų sąrašas | Matai, ko dar trūksta, kad atitiktum darbo reikalavimus. | darbuotojas, ieškantis darbo |  | tobulejimas | eisena | nenustatyta |  | registras |
| 2.12 | Įgūdžių ir profesijų sąrašas | Pasirenki savo profesijas ir įgūdžius iš bendro sąrašo. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | isidarbinimas,tobulejimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 2.13 | Įgūdžių atpažinimas iš darbo žurnalo | Iš tavo darbo įrašų atpažįstama, ką moki. | darbuotojas, ieškantis darbo | /dashboard/journal | tobulejimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 2.14 | Įrodymų lygiai | Matai, kiek tavo įgūdis pagrįstas tikru darbu. | darbuotojas, ieškantis darbo, įmonė | /cv | tobulejimas,isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.15 | Savo įgūdžių pareiškimas | Įrašai įgūdį savais žodžiais, net jei jo nėra sąraše. | darbuotojas, ieškantis darbo, savarankiškas specialistas | /dashboard/profile | tobulejimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 2.16 | Bendrieji gebėjimai | Matai gebėjimus, kurie tinka daugelyje darbų. | darbuotojas, ieškantis darbo | /cv | karjeros-keitimas,tobulejimas | eisena | nenustatyta |  | kodas |
| 2.17 | Europos profesijų klasifikatorius | Profesijos ir įgūdžiai susiejami su Europos sąrašu. | sistema |  | isidarbinimas,karjeros-keitimas | ne | nenustatyta | Savininkas | registras |
| 2.18 | Dokumentai ir jų galiojimas | Laikai dokumentus ir matai, kada baigsis jų galiojimas. | darbuotojas, ieškantis darbo, įmonė | /dashboard/documents | isidarbinimas,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 2.19 | Darbo žurnalas | Kasdien užsirašai, ką padarei darbe. | darbuotojas, savarankiškas specialistas | /dashboard/journal | tobulejimas,projektai,isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.20 | Vadovo patvirtinimas | Vadovas peržiūri ir patvirtina tavo darbo įrašus. | vadovas, darbuotojas | /dashboard/inbox | isidarbinimas,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 2.21 | Darbo patvirtinimo būsenos | Matai, ar įrašą jau patvirtino, ar dar laukia. | darbuotojas, vadovas | /dashboard/journal | isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.22 | Nuotraukos ir darbo įrodymai | Prie įrašo pridedi nuotraukas, kad parodytum atliktą darbą. | darbuotojas, savarankiškas specialistas | /dashboard/gallery | savarankiskos-paslaugos,tobulejimas | eisena | nenustatyta |  | kodas |
| 2.23 | Valandos ir suvestinės | Matai savo valandas ir darbo laiko lapus. | darbuotojas, vadovas, įmonė | /dashboard/hours | projektai,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 2.24 | Patirties įrašai ir ginčai | Gali užginčyti įrašą, kuris tau atrodo neteisingas. | darbuotojas, vadovas |  | isidarbinimas | eisena | nenustatyta | Koordinatorius | registras |
| 2.25 | Darbas skaičiais | Matai savo darbo apimtis skaičiais. | darbuotojas, savarankiškas specialistas | /dashboard/work-in-numbers | tobulejimas | eisena | nenustatyta |  | kodas |
| 2.26 | Viena nuosekli profesinė istorija | Visa tavo darbo istorija sudėta į vieną vietą. | darbuotojas, ieškantis darbo | /dashboard/profile | isidarbinimas,karjeros-keitimas,tobulejimas | eisena | nenustatyta |  | kodas |
| 2.27 | Įmonės istorinių įrašų įkėlimas | Įmonė įkelia ankstesnius savo darbuotojų darbo įrašus. | įmonė, vadovas |  | verslo-valdymas | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 2.28 | Senų įrašų sujungimas | Seni dubliuoti darbo įrašai sujungiami į vieną. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 2.29 | Galimi, dar neįrodyti gebėjimai | Parodomi gebėjimai, kuriuos tikėtina turi. | darbuotojas, ieškantis darbo | /cv | karjeros-keitimas,tobulejimas | eisena | nenustatyta |  | kodas |
| 2.30 | Žurnalas balsu | Darbo žurnalą pasakai balsu, o ne rašai. | darbuotojas, savarankiškas specialistas | /dashboard/journal/voice | tobulejimas | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 2.31 | Žurnalo įrašų apsauga nuo keitimo | Apsaugo, kad praeities įrašai nebūtų slapčia pakeisti. | darbuotojas, vadovas, sistema |  |  | eisena | nenustatyta |  | registras |
| 2.32 | Kitos pusės atsiliepimas | Klientas ar partneris patvirtina arba įvertina atliktą darbą. | savarankiškas specialistas, klientas, vadovas | /dashboard/inbox/counterparty | savarankiskos-paslaugos,isidarbinimas | eisena | nenustatyta |  | kodas |
| 2.33 | Darbų galerija | Rodai savo atliktų darbų nuotraukas. | savarankiškas specialistas, darbuotojas | /dashboard/gallery | savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 2.34 | Žurnalo ir valandų atsisiuntimas | Parsisiunti žurnalą ir valandas faile. | darbuotojas, vadovas | /dashboard/hours | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 2.35 | Sutikimas būti randamam | Pats nusprendi, ar darbdaviai gali tave rasti. | darbuotojas, ieškantis darbo | /dashboard/privacy | isidarbinimas,samdymas | eisena | nenustatyta |  | kodas |
| 2.36 | Žurnalo šablonai pagal profesiją | Gauni žurnalo formą, pritaikytą tavo profesijai. | darbuotojas, savarankiškas specialistas |  | tobulejimas | ne | nenustatyta | Koordinatorius | registras |
| 2.37 | Įrašo atsisakymas | Žmogus gali atsisakyti apie jį įkelto įrašo. | darbuotojas |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 3.1 | Įmonės pradžia | Matai savo įmonės dienos vaizdą vienoje vietoje. | įmonė, vadovas | /dashboard/company | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.2 | Projektai | Sukuri projektą ir seki jo eigą. | įmonė, vadovas | /dashboard/projects | projektai,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.3 | Objektai ir vietos | Projektui priskiri objektą ar darbo vietą. | įmonė, vadovas |  | projektai | eisena | nenustatyta |  | registras |
| 3.4 | Projekto etapai | Projektą suskaidai į etapus. | įmonė, vadovas | /dashboard/projects/[id] | projektai | eisena | nenustatyta |  | kodas |
| 3.5 | Užduotys | Skiri užduotis ir seki, ar jos atliktos. | įmonė, vadovas, darbuotojas | /dashboard/tasks | projektai,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.6 | Darbuotojo skyrimas projektui | Paskiri žmogų dirbti konkrečiame projekte. | įmonė, vadovas | /dashboard/projects/[id] | projektai,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.7 | Brigados | Sudarai brigadą iš kelių žmonių. | įmonė, vadovas | /dashboard/company/people | projektai,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.8 | Brigados skyrimas projektui | Visą brigadą paskiri į projektą. | įmonė, vadovas |  | projektai | eisena | nenustatyta |  | registras |
| 3.9 | Projekto pasirengimas | Matai, ar viskas paruošta projektui pradėti. | įmonė, vadovas |  | projektai | eisena | nenustatyta |  | registras |
| 3.10 | Defektai ir taisymai | Užfiksuoji trūkumus ir pažymi, kada jie ištaisyti. | įmonė, vadovas |  | projektai | eisena | nenustatyta |  | registras |
| 3.11 | Perdavimo dokumentas | Užbaigus darbą parengi perdavimo dokumentą klientui. | įmonė, vadovas | /dashboard/projects/[id]/operations | projektai | eisena | nenustatyta |  | kodas |
| 3.12 | Projekto išlaidos ir pajamos | Matai, kiek projektas kainuoja ir kiek uždirba. | įmonė, vadovas |  | projektai,verslo-valdymas | eisena | nenustatyta |  | registras |
| 3.13 | Projekto operacijų lenta | Matai visus projekto darbus vienoje lentoje ir parsisiunti. | įmonė, vadovas | /dashboard/projects/[id]/operations | projektai | eisena | nenustatyta |  | kodas |
| 3.14 | Darbų planavimas ir kalendorius | Planuoji žmonių darbus kalendoriuje. | įmonė, vadovas | /dashboard/company/planning | verslo-valdymas,projektai | eisena | nenustatyta |  | kodas |
| 3.15 | Nebuvimai ir atostogos | Užsirašai ir patvirtini atostogas bei nebuvimus. | darbuotojas, vadovas, įmonė | /dashboard/absences | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.16 | Žmonių trūkumo laiko juosta | Matai, kada trūks žmonių. | įmonė, vadovas |  | verslo-valdymas,projektai | savininkas | nenustatyta |  | registras |
| 3.17 | Žmonių rezervavimas | Rezervuoji žmogaus laiką ateičiai. | įmonė, vadovas | /dashboard/company/planning | verslo-valdymas,projektai | eisena | nenustatyta |  | kodas |
| 3.18 | Užimtumas | Matai, kiek kiekvienas žmogus užimtas. | įmonė, vadovas | /dashboard/company/planning | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.19 | Planas ir faktas | Palygini suplanuotą darbą su atliktu. | įmonė, vadovas |  | verslo-valdymas,projektai | eisena | nenustatyta |  | registras |
| 3.20 | Pamainos ir grafikai | Sudarai pamainų grafiką. | įmonė, vadovas | /dashboard/company/planning | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.21 | Darbuotojų sąrašas | Matai visus savo įmonės žmones. | įmonė, vadovas | /dashboard/company/people | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.22 | Žmonių įkėlimas | Įkeli žmonių sąrašą iš failo. | įmonė, vadovas | /dashboard/company/people | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.23 | Priėmimas ir išleidimas iš darbo | Seki naujo darbuotojo įvedimą ir išėjimą. | įmonė, vadovas |  | verslo-valdymas,samdymas | eisena | nenustatyta |  | registras |
| 3.24 | Patvirtinimai ir procesai | Pateiktus prašymus patvirtini ar atmeti. | įmonė, vadovas |  | verslo-valdymas | eisena | nenustatyta |  | registras |
| 3.25 | Vadovo sprendimai | Užrašai sprendimus ir jų peržiūras. | vadovas |  | verslo-valdymas | eisena | nenustatyta |  | registras |
| 3.26 | Nurodymai | Darbuotojams išsiunti nurodymus. | vadovas, įmonė, darbuotojas | /dashboard/instructions | verslo-valdymas,projektai | eisena | nenustatyta |  | kodas |
| 3.27 | Įmonės istorija ir duomenų kokybė | Matai įmonės istoriją ir kur trūksta duomenų. | įmonė, vadovas | /dashboard/company/history | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.28 | Atsakymai vadovui pokalbyje | Vadovas pokalbyje paklausia apie savo įmonę ir gauna atsakymą. | vadovas, įmonė | pokalbis | verslo-valdymas | eisena | nenustatyta |  | registras |
| 3.29 | Įmonės dokumentų sąrašas | Saugai įmonės dokumentus vienoje vietoje. | įmonė, vadovas | /dashboard/documents | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.30 | Įmonės nustatymai ir pagalbos prašymas | Keiti įmonės nustatymus ir paprašai pagalbos. | įmonė, vadovas | /dashboard/company/settings | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.31 | Ataskaitos ir atsisiuntimas | Gauni ataskaitas ir jas parsisiunti. | įmonė, vadovas | /dashboard/reports | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.32 | Įrankiai ir turtas | Seki, kas turi kokį įmonės įrankį. | įmonė, vadovas | /dashboard/assets | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 3.33 | Valandų puslapis | Žiūri ir tvirtini žmonių valandas. | įmonė, vadovas, darbuotojas | /dashboard/hours | verslo-valdymas,projektai | eisena | nenustatyta |  | kodas |
| 3.34 | Projekto eigos prognozė | Prognozuojama, kada projektas baigsis. | įmonė, vadovas |  | projektai,verslo-valdymas | eisena | nenustatyta | Koordinatorius | registras |
| 3.35 | Persidengiančių įsipareigojimų įspėjimas | Gauni įspėjimą, kai žmogus paskirtas į du darbus vienu metu. | įmonė, vadovas |  | verslo-valdymas,projektai | ne | nenustatyta | Savininkas ir koordinatorius | registras |
| 3.36 | Įmonės gyvasis CV | Įmonė turi savo nuolat atsinaujinantį profilį. | įmonė, vadovas |  | verslo-valdymas | ne | nenustatyta | Savininkas | registras |
| 4.1 | Poreikio įvedimas | Įmonė vienodu būdu užrašo, kokių žmonių jai reikia. | įmonė, vadovas, agentūra | /dashboard/company/needs | samdymas,projektai | eisena | nenustatyta |  | kodas |
| 4.2 | Poreikis ir pasiūla atskirai | Skiriama, ko įmonė ieško ir ką žmogus siūlo. | sistema |  |  | eisena | nenustatyta |  | registras |
| 4.3 | Galimybių lenta darbuotojui | Matai tau tinkamas galimybes ir pasakai, kad domina. | darbuotojas, ieškantis darbo | /dashboard/opportunities | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 4.4 | Viešoji darbo skelbimų lenta | Be registracijos ieškai darbo skelbimų. | ieškantis darbo, darbuotojas | /jobs | isidarbinimas,pirmas-darbas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 4.5 | Žmonių ir darbų suderinimas | Siūlomi tinkami darbai žmonėms ir žmonės darbams. | ieškantis darbo, įmonė |  | isidarbinimas,samdymas | eisena | nenustatyta |  | registras |
| 4.6 | Komandos paieška ir pasiūlymas | Įmonė randa visą komandą ir jai pateikia pasiūlymą. | įmonė, agentūra |  | samdymas,projektai | eisena | nenustatyta |  | registras |
| 4.7 | Derybos tarp įmonių | Dvi įmonės susiderina sąlygas. | įmonė, agentūra |  | projektai,verslo-valdymas | eisena | nenustatyta |  | registras |
| 4.8 | Anoniminis poreikio pateikimas | Be registracijos įmonė palieka savo poreikį. | įmonė | /company-need | samdymas | ne | nenustatyta | Koordinatorius | kodas |
| 4.9 | Išsaugotos paieškos ir pranešimai | Išsaugai paiešką ir gauni žinią apie naujus skelbimus. | ieškantis darbo, darbuotojas | /jobs | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 4.10 | Pasiūlos paieška įmonėms | Įmonė ieško žmonių ir komandų pagal poreikį. | įmonė, vadovas | /dashboard/talent | samdymas | eisena | nenustatyta |  | kodas |
| 4.11 | Kandidatų paieška | Įmonė ieško tinkamų kandidatų. | įmonė, agentūra | /dashboard/candidates | samdymas | eisena | nenustatyta |  | kodas |
| 4.12 | Trumpasis sąrašas ir pastabos | Įmonė susideda kandidatus į sąrašą ir rašo pastabas. | įmonė, agentūra | /dashboard/company/scouting | samdymas | eisena | nenustatyta |  | kodas |
| 4.13 | Automatinis kandidatų parinkimas | Kandidatai parenkami automatiškai ir pateikiamas kvitas. | įmonė, agentūra |  | samdymas | eisena | nenustatyta |  | registras |
| 4.14 | Kandidatų juodraščiai | Įmonė paruošia kandidato pasiūlymą prieš išsiunčiant. | agentūra, įmonė |  | samdymas | eisena | nenustatyta |  | registras |
| 4.15 | Agentūros ir kliento ryšys | Agentūra susieja su klientu ir siūlo jam žmones. | agentūra, klientas |  | samdymas | eisena | nenustatyta |  | registras |
| 4.16 | Susisiekimas su susidomėjusiu žmogumi | Įmonė parašo žmogui, kuris pareiškė susidomėjimą. | įmonė, agentūra |  | samdymas | eisena | nenustatyta |  | registras |
| 4.17 | Sutikimas būti randamam | Pats nusprendi, ar tave gali rasti. | darbuotojas, ieškantis darbo | /dashboard/privacy | isidarbinimas |  | nenustatyta |  | kodas |
| 4.18 | Duomenų atskleidimas darbdaviui | Leidi konkrečiam darbdaviui matyti papildomus savo duomenis. | darbuotojas, ieškantis darbo |  | isidarbinimas | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 4.19 | Prašymai atskleisti kontaktus | Įmonė paprašo tavo kontaktų, o tu nusprendi. | darbuotojas, ieškantis darbo, įmonė |  | isidarbinimas,samdymas | eisena | nenustatyta |  | registras |
| 4.20 | Asmens apsauga paieškoje | Paieškoje žmogaus tapatybė nerodoma be jo leidimo. | sistema |  |  | api | nenustatyta |  | registras |
| 4.21 | Asmens vardo slėpimas | Žmogaus vardas rodomas tik gavus leidimą. | sistema | /dashboard/people/[workerId] |  | eisena | nenustatyta |  | kodas |
| 4.22 | Trys nemokami profilių peržiūrėjimai | Įmonė kelis profilius mato nemokamai, daugiau už papildomą planą. | įmonė |  | samdymas | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 4.25 | Derinimo valdymo skydas | Administratorius tikrina derinimo rezultatus. | administratorius | /dashboard/admin/matching |  | savininkas | nenustatyta |  | kodas |
| 4.26 | Viešas tinkamumo peržiūrėjimas | Be registracijos pamatai, ar tinki darbui. | ieškantis darbo, darbuotojas | /match-preview | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 4.28 | Pasiūlos pareiškimas | Įmonė ar žmogus pasako, ką gali pasiūlyti. | savarankiškas specialistas, įmonė |  | savarankiskos-paslaugos | eisena | nenustatyta |  | registras |
| 4.29 | Susidomėjimas virsta laisva vieta | Žmogaus susidomėjimas paverčiamas darbo vieta įmonėje. | įmonė, agentūra |  | samdymas | ne | nenustatyta | Koordinatorius | registras |
| 4.30 | Kandidatas, sprendimas, poreikio uždarymas | Nuo kandidato iki priėmimo sprendimo ir poreikio uždarymo. | įmonė, agentūra, vadovas |  | samdymas | ne | nenustatyta | Vykdytojas ir koordinatorius | registras |
| 5.1 | Pokalbio pradžia | Pradedi nuo pokalbio ir paprašai, ko reikia. | darbuotojas, ieškantis darbo, įmonė, vadovas | pokalbis | isidarbinimas,verslo-valdymas,savarankiskos-paslaugos | eisena | nenustatyta |  | registras |
| 5.2 | Pokalbio istorija | Pokalbis išlieka ir gali grįžti prie jo vėliau. | darbuotojas, įmonė | pokalbis |  | eisena | nenustatyta |  | registras |
| 5.3 | Vienkartiniai patvirtinimai | Svarbų veiksmą patvirtini vieną kartą. | darbuotojas, įmonė, vadovas | pokalbis |  | eisena | nenustatyta |  | registras |
| 5.4 | Žinutės ir gijos | Susirašinėji su kitais žmonėmis ir įmonėmis. | darbuotojas, įmonė, agentūra | /dashboard/communication |  | eisena | nenustatyta |  | kodas |
| 5.5 | Žinučių vertimas | Žinutė išverčiama, o originalas lieka matomas. | darbuotojas, įmonė | /dashboard/communication |  | eisena | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 5.6 | Pranešimai programoje | Matai naujus pranešimus programoje. | darbuotojas, ieškantis darbo, įmonė | /dashboard/activity |  | eisena | nenustatyta |  | kodas |
| 5.7 | Pranešimai el. paštu | Gauni svarbias žinias el. paštu. | darbuotojas, ieškantis darbo, įmonė |  |  | eisena | nenustatyta |  | registras |
| 5.8 | Pranešimai telefone | Gauni pranešimą į telefoną. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 5.9 | Savaitės apžvalga | Kas savaitę gauni trumpą apžvalgą el. paštu. | darbuotojas, ieškantis darbo, įmonė |  |  | eisena | nenustatyta | Koordinatorius | registras |
| 5.10 | Veiklos centras | Vienoje vietoje matai, kam reikia tavo dėmesio. | darbuotojas, įmonė, vadovas | /dashboard/activity | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 5.11 | Darbuotojo kalendorius | Matai savo darbus kalendoriuje. | darbuotojas, savarankiškas specialistas | /dashboard/planning | savarankiskos-paslaugos,projektai | eisena | nenustatyta |  | kodas |
| 5.12 | Prieinamumas | Nurodai, kada gali dirbti. | darbuotojas, savarankiškas specialistas, ieškantis darbo |  | isidarbinimas,savarankiskos-paslaugos | savininkas | nenustatyta |  | registras |
| 5.13 | Užsakymas, sutikimas, darbas | Gauni užsakymą, jį priimi ir pradedi darbą. | darbuotojas, savarankiškas specialistas, įmonė | /dashboard/bookings | savarankiskos-paslaugos,samdymas | eisena | nenustatyta |  | kodas |
| 5.14 | Greitoji paieška ir balsas | Greitai randi puslapį ar veiksmą, galima balsu. | darbuotojas, įmonė |  |  | savininkas | nenustatyta | Koordinatorius | registras |
| 5.15 | Balsas kaip lygiavertis būdas | Viską gali padaryti ir balsu. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas | registras |
| 5.16 | Įspėjimai savininkui | Savininkas gauna žinią per Telegram. | administratorius |  |  | ne | nenustatyta | Koordinatorius | registras |
| 5.17 | Pagalbos pokalbiai | Parašai pagalbos komandai. | darbuotojas, įmonė |  |  | eisena | nenustatyta |  | registras |
| 5.18 | Paieška skyriuje | Ieškai žmonių, projektų ir dokumentų vienoje vietoje. | darbuotojas, įmonė, vadovas |  |  | eisena | nenustatyta |  | registras |
| 5.19 | Gautų ataskaitų peržiūra | Matai gautas ataskaitas. | vadovas, įmonė | /dashboard/inbox/report | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 5.20 | Savos automatizacijos | Pats susikuri automatinius veiksmus. | įmonė, vadovas |  | verslo-valdymas | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 5.21 | SMS ir WhatsApp kanalai | Žinutes gauni per SMS ar WhatsApp. | darbuotojas, įmonė |  |  | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.1 | Paslaugos ir užklausų ratas | Siūlai paslaugas ir gauni užklausas. | savarankiškas specialistas, klientas | /dashboard/services | savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 6.2 | Skelbimai: prekės, nuoma, ieškau | Skelbi prekes, nuomą ar ko ieškai. | savarankiškas specialistas, klientas, įmonė | /dashboard/listings | savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 6.3 | Bendra paieška | Ieškai paslaugų ir skelbimų vienoje vietoje. | klientas, įmonė | /dashboard/listings | savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 6.4 | Pirkėjo erdvė | Kaip pirkėjas matai savo užklausas ir pasiūlymus. | klientas, įmonė | /dashboard/buyer | savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 6.6 | Pasiūlymai ir sutartys | Paruoši pasiūlymą ir sutartį klientui. | savarankiškas specialistas, įmonė | /dashboard/commercial | savarankiskos-paslaugos,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 6.7 | Pirkimai | Valdai pirkimus savo įmonėje. | įmonė, vadovas | /dashboard/finance | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 6.8 | Komandiruotės | Planuoji ir seki komandiruotes. | įmonė, vadovas, darbuotojas | /dashboard/finance | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 6.9 | Finansų įrašai | Matai įmonės finansų įrašus. | įmonė, vadovas | /dashboard/finance | verslo-valdymas | eisena | nenustatyta |  | kodas |
| 6.10 | Projekto kainos skaičiuoklė | Be registracijos apskaičiuoji projekto kainą. | klientas, įmonė, savarankiškas specialistas | /calculators/project-cost | projektai,savarankiskos-paslaugos | eisena | nenustatyta |  | kodas |
| 6.11 | Pasirengimas darbui užsienyje | Matai, ko reikia dirbti kitoje šalyje. | įmonė, darbuotojas |  |  | ne | nenustatyta | Koordinatorius | registras |
| 6.12 | Tarptautiniai sandoriai | Įmonės sudaro sandorius tarp šalių. | įmonė |  | verslo-valdymas | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.13 | Prekių užsakymai | Perki prekes per platformą. | klientas, įmonė |  | savarankiskos-paslaugos | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.14 | Logistika | Susitvarkai prekių pristatymą. | įmonė |  | verslo-valdymas | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.16 | Perdavimas partnerio organizacijai | Užklausa perduodama partnerio organizacijai. | įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 6.17 | Pardavimų eiga | Seki potencialių klientų eigą. | administratorius |  |  | savininkas | nenustatyta |  | registras |
| 6.18 | Laukiančiųjų sąrašas | Užsirašai gauti žinią, kai funkcija atsiras. | darbuotojas, įmonė |  |  | eisena | nenustatyta |  | registras |
| 6.19 | Komandos užklausos | Gauni komandos užklausas. | įmonė, agentūra | /dashboard/service-requests | samdymas | eisena | nenustatyta |  | kodas |
| 6.20 | Vertės kanalai | Parodomi keliai, kuriais žmogus gauna naudą iš platformos. | sistema |  |  | eisena | nenustatyta |  | registras |
| 6.21 | Viešas verslo puslapis | Verslas turi viešą savo puslapį. | įmonė, savarankiškas specialistas, klientas | /business/[slug] | savarankiskos-paslaugos | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 6.22 | Būstas | Susirandi nakvynę darbui. | darbuotojas, įmonė |  |  | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.23 | Paslaugos įvertinimas ir ginčai | Įvertini paslaugą, atšauki užsakymą ar paduodi skundą. | klientas, savarankiškas specialistas |  | savarankiskos-paslaugos | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 6.24 | Paslaugų srautas telefone | Naršai paslaugas braukdamas pirštu. | klientas |  | savarankiskos-paslaugos | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 7.1 | Planai ir kainų puslapis | Matai, kokie yra planai. | įmonė, darbuotojas, agentūra | /pricing |  | eisena | nenustatyta |  | kodas |
| 7.2 | Nemokamas planas: vienas atviras poreikis | Nemokamai gali turėti vieną atvirą poreikį. | įmonė |  | samdymas | ne | nemokama | Koordinatorius | registras |
| 7.3 | Planų teisių nustatymas | Žinoma, ką leidžia tavo planas. | sistema |  |  | savininkas | nenustatyta | Koordinatorius | registras |
| 7.4 | Bandomasis mokėjimas | Išbandomas mokėjimas be tikrų pinigų. | administratorius |  |  |  | nenustatyta | Koordinatorius | registras |
| 7.5 | Mokėjimas už planą | Įmonė už planą sumoka kortele. | įmonė |  |  | ne | mokama | Savininkas | registras |
| 7.6 | Mokėjimų įrašų atkūrimas | Pataisomi nepavykę mokėjimų įrašai. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.7 | Rankinis bandomojo plano suteikimas | Administratorius suteikia bandomąjį planą. | administratorius |  |  | ne | nenustatyta | Koordinatorius | registras |
| 7.8 | Kreditų sąskaita | Seki kreditų likutį. | įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.9 | Kreditų papildymas ir planų pakopos | Papildai kreditus ir renkiesi planą. | įmonė, agentūra |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.10 | Trys peržiūros ir VIP | Ta pati funkcija kaip 4.22, paliekama istorijai. | įmonė |  |  |  | nenustatyta |  | registras |
| 7.11 | Atidėti planai | Ateityje bus papildomi planai darbuotojams ir agentūroms. | darbuotojas, agentūra |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.12 | Dirbtinio intelekto kaštų skaičiavimas | Skaičiuojama, kiek kainuoja dirbtinio intelekto pagalba. | administratorius |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.13 | Užsakymų riba pagal planą | Plane nustatyta, kiek užsakymų gali turėti. | įmonė |  |  | eisena | nenustatyta | Koordinatorius | registras |
| 7.14 | Skelbimų vertimo teisė | Skelbimo vertimas priklauso nuo plano. | įmonė |  |  | eisena | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.15 | Metinė prenumerata | Įmonė užsisako mokamą planą. | įmonė |  |  | ne | mokama | Savininkas, paskui koordinatorius | registras |
| 7.16 | Mokėjimo pranešimo patikra | Tikrinama, ar mokėjimo žinia tikra. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 7.17 | Dvigubo apmokestinimo apsauga | Tavo kortelė nenurašoma du kartus už tą patį. | įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 7.18 | Mokėjimas keičia teises | Sumokėjus atsiranda teisės, nutrūkus mokėjimui jos dingsta. | įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 7.19 | Grąžinimai ir ginčai | Pinigų grąžinimas ar ginčo sprendimas. | įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.20 | Sąskaitos platformoje | Sąskaitas matai pačioje platformoje. | įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.21 | Atsiskaitymo portalas | Kiekvienas už mokėjimus atsakingas žmogus gali atidaryti portalą. | įmonė, vadovas | /dashboard/account |  | ne | nenustatyta | Koordinatorius | kodas |
| 7.22 | Mokamų funkcijų teisės ir ribos | Kiekviena mokama funkcija taikoma pagal plano ribas. | įmonė |  |  | ne | nenustatyta | Savininkas ir koordinatorius | registras |
| 7.23 | Kreditų pirkimas | Vienkartinis kreditų pirkimas. | įmonė |  |  | ne | mokama | Savininkas, paskui koordinatorius | registras |
| 7.24 | Kreditai po vieno mokėjimo | Už vieną mokėjimą kreditai suteikiami vieną kartą. | įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.25 | Kreditų likutis ir istorija | Matai savo kreditų likutį ir istoriją. | įmonė | pokalbis |  | eisena | nenustatyta | Koordinatorius | registras |
| 7.26 | Kreditų išleidimas ir grąžinimas | Išleidžiami ir grąžinami kreditai. | įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 7.27 | Nemokamas VIP patvirtintoms įmonėms | Patvirtinta įmonė gauna VIP nemokamai. | įmonė |  | samdymas | ne | nemokama | Savininkas, paskui koordinatorius | registras |
| 7.28 | Pardavėjas ir sąlygos | Matai, kas parduoda ir kokiomis sąlygomis. | įmonė | /legal/terms |  | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 7.29 | PVM skaičiavimas | Mokėjimuose skaičiuojamas PVM. | įmonė |  |  | ne | nenustatyta | Savininkas ir teisininkas | registras |
| 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | Iš darbo žurnalo parengiama sąskaita ir priėmimo aktas. | savarankiškas specialistas, įmonė |  | savarankiskos-paslaugos,verslo-valdymas | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 7.31 | Planai darbuotojams ir įmonėms | Planai abiem pusėms: nemokamas ir mokami. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.1 | Svetainės kalbos | Naudoji platformą savo kalba. | darbuotojas, ieškantis darbo, įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 8.2 | Darbas suprantamas keliomis kalbomis | Darbo aprašai suprantami keliomis kalbomis. | darbuotojas, ieškantis darbo, įmonė |  | isidarbinimas | eisena | nenustatyta |  | registras |
| 8.3 | Automatinis vertimas | Tekstas išverčiamas į tavo kalbą. | darbuotojas, ieškantis darbo, įmonė |  | isidarbinimas | eisena | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.4 | Šalių darbo rinkos puslapiai | Skaitai apie darbo rinką skirtingose šalyse. | ieškantis darbo, darbuotojas | /labour-market | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 8.5 | Devynios pirmosios rinkos | Platforma pritaikoma devynioms šalims. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.6 | Šalių reikalavimų lentelė | Matai, ko reikia dirbti konkrečioje šalyje. | ieškantis darbo, darbuotojas | /work-abroad | isidarbinimas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 8.7 | Viešas atsakymų puslapis | Randi atsakymus į dažniausius klausimus. | ieškantis darbo, darbuotojas, įmonė | /questions | isidarbinimas,pirmas-darbas,karjeros-keitimas | eisena | nenustatyta |  | kodas |
| 8.8 | Paieškos sistemų paruošimas | Svetainė tinkamai matoma paieškos sistemose. | sistema |  |  | eisena | nenustatyta |  | registras |
| 8.9 | Viešas įmonės profilis | Įmonė turi viešą savo profilį. | įmonė, klientas | /business/[slug] | samdymas | eisena | nenustatyta | Koordinatorius | kodas |
| 8.10 | Pristatymo svetainė | Perskaitai apie platformą prieš registruojantis. | ieškantis darbo, darbuotojas, įmonė, agentūra | /about |  | eisena | nenustatyta |  | kodas |
| 8.11 | Svetainė telefone | Naudoji platformą telefone. | darbuotojas, ieškantis darbo, įmonė |  |  | eisena | nenustatyta |  | registras |
| 8.12 | Įdiegimas telefone | Platformą įdedi į telefono pradžios ekraną. | darbuotojas, įmonė |  |  | eisena | nenustatyta |  | registras |
| 8.13 | Programėlė telefonui | Atskira programėlė telefone. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.14 | Nuorodos į programėlę | Nuoroda iš laiško atidaro programėlę. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.15 | Programėlių parduotuvės | Programėlė pasiekiama programėlių parduotuvėse. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 8.16 | Pastabos apie vertimą | Praneši, kad vertimas neteisingas. | darbuotojas, ieškantis darbo, įmonė, administratorius | /dashboard/admin/language-feedback |  | eisena | nenustatyta |  | kodas |
| 8.17 | Programėlė Android telefonui | Programėlė Android telefonui. | darbuotojas, įmonė |  |  | api | nenustatyta | Savininkas | registras |
| 8.18 | Programėlė iPhone | Programėlė iPhone telefonui. | darbuotojas, įmonė |  |  | api | nenustatyta | Savininkas | registras |
| 9.1 | Administratoriaus skydas | Administratorius valdo platformą. | administratorius | /dashboard/admin |  | eisena | nenustatyta |  | kodas |
| 9.2 | Bandymai, rodikliai, lyga | Administratorius seka bandymus ir rodiklius. | administratorius | /dashboard/admin/pilots |  | savininkas | nenustatyta |  | kodas |
| 9.3 | Naudotojo peržiūra | Administratorius pažiūri vieno naudotojo būseną. | administratorius | /dashboard/admin/users/[id] |  | savininkas | nenustatyta |  | kodas |
| 9.4 | Privatumo prašymai | Gali paprašyti savo duomenų ar jų ištrynimo. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy |  | ne | nenustatyta | Koordinatorius | kodas |
| 9.5 | Duomenų atsisiuntimas | Parsisiunti visus apie save laikomus duomenis. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy |  | eisena | nenustatyta |  | kodas |
| 9.6 | Duomenų ištrynimas | Tavo duomenys ištrinami, kai to paprašai. | darbuotojas, ieškantis darbo, įmonė | /dashboard/privacy |  | ne | nenustatyta | Koordinatorius | kodas |
| 9.7 | Darbuotojo duomenų skyrimas | Atskiriami žmogaus ir jo įmonės duomenys. | sistema |  |  | api | nenustatyta |  | registras |
| 9.8 | Duomenų prieigos taisyklės | Kiekvienas mato tik savo duomenis. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.9 | Veiksmų žurnalas | Svarbūs veiksmai užrašomi. | sistema, administratorius |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.10 | Užklausų ribojimas | Apsaugo nuo piktnaudžiavimo. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.11 | Užklausų kilmės patikra | Apsaugo nuo suklastotų užklausų. | sistema |  |  | eisena | nenustatyta |  | registras |
| 9.12 | Teisiniai puslapiai | Perskaitai sąlygas ir privatumo politiką. | darbuotojas, ieškantis darbo, įmonė | /legal/privacy |  | eisena | nenustatyta |  | kodas |
| 9.13 | Asmens vietos apsauga | Tavo tikslios vietos kiti nemato. | darbuotojas, ieškantis darbo |  |  | eisena | nenustatyta |  | registras |
| 9.14 | Naudojimo statistika | Administratorius mato, kaip naudojama platforma. | administratorius | /dashboard/admin/telemetry |  | savininkas | nenustatyta |  | kodas |
| 9.15 | Paieškos būdai | Skirtingos paieškos randa žmones, darbus ir paslaugas. | sistema |  |  | eisena | nenustatyta |  | registras |
| 9.16 | Rekomendavimo sąsaja | Išorinė sistema siunčia rekomendacijas. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 9.17 | Vidinis pasiūlos srautas | Vidinė sistema gauna pasiūlos duomenis. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.18 | Viešos duomenų sąsajos | Kitos svetainės gali gauti viešus duomenis. | sistema |  |  | eisena | nenustatyta |  | registras |
| 9.19 | Importo bandymų erdvė | Administratorius išbando importą. | administratorius | /dashboard/admin/import-sandbox |  | savininkas | nenustatyta | Niekas dabar; savininkas, jei norės | kodas |
| 9.20 | Stebėjimų tikrintuvas | Administratorius tikrina stebėjimus. | administratorius | /dashboard/admin/intelligence-observations |  | savininkas | nenustatyta | Niekas dabar; savininkas, jei norės | kodas |
| 9.22 | Aplinkos nustatymų patikra | Neleidžia paleisti sistemos su blogais nustatymais. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.23 | Duomenų bazės funkcijų kontrolė | Saugo, kad duomenų funkcijos nebūtų per laisvos. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.24 | Saugumo incidentų tvarkymas | Reaguojama į saugumo incidentus. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 9.25 | Saugumo perspėjimai | Stebimi saugumo perspėjimai apie kodą. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 10.1 | Atvira sąsaja dirbtinio intelekto programoms | Programa gali veikti tavo vardu su tavo leidimu. | darbuotojas, įmonė | MCP |  | eisena | nenustatyta |  | kodas |
| 10.2 | Dirbtinio intelekto scenarijai | Paruošti scenarijai dirbtinio intelekto programoms. | darbuotojas, įmonė | MCP |  | api | nenustatyta |  | kodas |
| 10.3 | Prisijungimas dirbtinio intelekto programoms | Programa saugiai gauna tavo leidimą. | darbuotojas, įmonė | MCP |  | api | nenustatyta |  | kodas |
| 10.4 | Dirbtinio intelekto leidimų sritys | Nustatai, ką programa gali daryti. | darbuotojas, įmonė | MCP |  | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 10.5 | Sąrašai dirbtinio intelekto parduotuvėse | Platforma rodoma dirbtinio intelekto programų sąrašuose. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.6 | Dirbtinio intelekto pagalba | Platforma naudoja dirbtinį intelektą pagalbai. | darbuotojas, įmonė |  |  | eisena | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.7 | Pokalbio ketinimų atpažinimas | Pokalbyje atpažįstama, ko nori. | darbuotojas, įmonė | pokalbis |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.8 | CV sutvarkymas dirbtiniu intelektu | Iš CV dirbtinis intelektas išrenka faktus. | darbuotojas, ieškantis darbo | /cv | isidarbinimas,karjeros-keitimas | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 10.9 | Žurnalo siūlymai | Žurnalo įrašui siūlomi patobulinimai. | darbuotojas | /dashboard/journal | tobulejimas | ne | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 10.10 | Paaiškinimai | Gauni paaiškinimą, kodėl taip pasiūlyta. | darbuotojas, įmonė |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.11 | Pagalbininkai be iškvietimo | Yra pagalbininkai, kurių dar niekas nekviečia. | sistema |  |  | eisena | nenustatyta |  | registras |
| 10.13 | Pagalbininko puslapis | Pasikalbi su pagalbininku. | darbuotojas, įmonė | /dashboard/assist |  | eisena | nenustatyta |  | kodas |
| 10.14 | Pagalbininkų valdymas | Administratorius valdo pagalbininkus. | administratorius | /dashboard/admin/agent-os |  | savininkas | nenustatyta |  | kodas |
| 10.15 | Pagalbininkų vykdymas | Pagalbininkai atlieka darbus patys. | administratorius |  |  | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 10.16 | Pagalbininkai kaip dalyviai | Pagalbininkas yra pokalbio dalyvis. | darbuotojas, įmonė |  |  | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 10.17 | Išorinių veiksmų kvitai | Gauni kvitą apie išorinį veiksmą. | darbuotojas, įmonė | MCP |  | api | nenustatyta |  | kodas |
| 10.18 | Skelbimai iš Švedijos | Platforma gauna skelbimus iš Švedijos. | ieškantis darbo, darbuotojas | foninis | isidarbinimas | ne | nenustatyta | Koordinatorius | registras |
| 10.19 | Skelbimai iš Norvegijos | Platforma gauna skelbimus iš Norvegijos. | ieškantis darbo, darbuotojas | foninis | isidarbinimas | ne | nenustatyta | Koordinatorius | registras |
| 10.20 | Senų skelbimų šalinimas | Pasenę skelbimai pašalinami. | ieškantis darbo, darbuotojas | foninis | isidarbinimas | api | nenustatyta | Koordinatorius | registras |
| 10.21 | Statistikos importas | Importuojama oficiali statistika. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.22 | Partnerio organizacijos sąsaja | Duomenys keičiasi su partnerio organizacija. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.23 | Agentūros pasiūlos srautas | Agentūros pasiūla patenka į platformą. | agentūra |  | samdymas | ne | nenustatyta | Koordinatorius | registras |
| 10.24 | Savo serverio vertimas | Vertimas veikia mūsų serveryje. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.25 | Debesų dirbtinis intelektas | Papildomas dirbtinio intelekto tiekėjas. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.26 | Programų konkursas | Dalyvavimas dirbtinio intelekto programų konkurse. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 10.27 | Žemėlapiai | Matai vietas žemėlapyje. | darbuotojas, ieškantis darbo, įmonė |  | isidarbinimas | eisena | nenustatyta |  | registras |
| 11.1 | Mokymo įstaiga ir besimokantysis | Mokymo įstaiga susieja su savo besimokančiais. | mokymo įstaiga, besimokantis | /dashboard/company/education | mokymasis | eisena | nenustatyta |  | kodas |
| 11.2 | Programos ir srautai | Mokymo įstaiga kuria programas ir grupes. | mokymo įstaiga | /dashboard/company/education | mokymasis | eisena | nenustatyta |  | kodas |
| 11.3 | Mokymosi kompasas | Matai, ką mokytis toliau. | besimokantis, darbuotojas, ieškantis darbo | /dashboard/learning | mokymasis,tobulejimas,karjeros-keitimas,pirmas-darbas | eisena | nenustatyta |  | kodas |
| 11.4 | Praktikos vietos | Įmonė pasiūlo vietų praktikai. | įmonė, mokymo įstaiga, besimokantis | /dashboard/company/education | mokymasis,pirmas-darbas | eisena | nenustatyta |  | kodas |
| 11.5 | Besimokančiųjų rezultatai | Matai, kaip sekasi besimokantiems. | mokymo įstaiga, besimokantis | /dashboard/learning | mokymasis | eisena | nenustatyta |  | kodas |
| 11.6 | Mokymo įstaigos ataskaitos | Mokymo įstaiga gauna ataskaitas. | mokymo įstaiga | /dashboard/reports | mokymasis | eisena | nenustatyta |  | kodas |
| 11.7 | Praktika virsta gebėjimu | Atlikta praktika parodo įgytą gebėjimą. | besimokantis, mokymo įstaiga | /dashboard/learning | mokymasis,pirmas-darbas,tobulejimas | eisena | nenustatyta |  | kodas |
| 11.8 | Mokymų ir pažymėjimų sąrašas | Laikai mokymus ir pažymėjimus vienoje vietoje. | besimokantis, darbuotojas, mokymo įstaiga | /dashboard/learning | mokymasis,tobulejimas | eisena | nenustatyta | Savininkas, paskui koordinatorius | kodas |
| 11.9 | Mokymosi peržiūra žmogaus akimis | Žmogus peržiūri mokymosi rekomendacijas. | besimokantis, mokymo įstaiga |  | mokymasis | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |
| 11.10 | Ankstesnio mokymosi pripažinimas | Pripažįstamas anksčiau įgytas mokymasis. | besimokantis, darbuotojas |  | mokymasis,karjeros-keitimas | ne | nenustatyta | Niekas dabar; savininkas, jei norės | registras |
| 12.1 | Rinkos žemėlapis | Matai, kur yra darbo ir žmonių. | darbuotojas, ieškantis darbo, įmonė | /dashboard/market-map | isidarbinimas,karjeros-keitimas,verslo-valdymas | savininkas | nenustatyta |  | kodas |
| 12.2 | Darbo rinkos žinios | Skaitai apie darbo rinką. | darbuotojas, ieškantis darbo, įmonė | /dashboard/intelligence | karjeros-keitimas,isidarbinimas | ne | nenustatyta | Koordinatorius | kodas |
| 12.3 | Žinių skydas | Žinias matai vienoje vietoje. | darbuotojas, įmonė, vadovas | /dashboard/intelligence | karjeros-keitimas,verslo-valdymas | eisena | nenustatyta |  | kodas |
| 12.4 | Poreikio atpažinimas | Atpažįstamas rinkos poreikis. | administratorius, įmonė | /dashboard/market/recognize | verslo-valdymas | savininkas | nenustatyta |  | kodas |
| 12.5 | Viešieji rinkos faktai | Matai viešus rinkos faktus. | ieškantis darbo, darbuotojas, įmonė | /labour-market | isidarbinimas,karjeros-keitimas | ne | nenustatyta | Koordinatorius | kodas |
| 12.6 | Administratoriaus rinkos puslapis | Administratorius mato rinkos vaizdą. | administratorius | /dashboard/admin/market |  | savininkas | nenustatyta |  | kodas |
| 13.1 | Svetainės talpinimas ir atnaujinimas | Svetainė pasiekiama ir atnaujinama be pertraukų. | sistema |  |  | eisena | nenustatyta | Koordinatorius | registras |
| 13.2 | Veikimo stebėjimas | Pastebima, kai svetainė neatsako. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.3 | Paruoštas patikrinimo paketas | Automatiškai išbandomi pagrindiniai naudotojo žingsniai. | sistema |  |  | eisena | nenustatyta |  | registras |
| 13.4 | Duomenų bazės talpa | Pasirūpinama, kad duomenys tilptų. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.5 | Atsarginės kopijos | Tavo duomenys turi atsarginę kopiją. | sistema |  |  | api | nenustatyta |  | registras |
| 13.6 | Reguliarūs foniniai darbai | Reguliariai atliekami foniniai darbai. | sistema | foninis |  | ne | nenustatyta | Koordinatorius | registras |
| 13.7 | Duomenų bazės pakeitimų patikra | Prieš keičiant duomenų bazę tikrinama, ar saugu. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.8 | Pakeitimų žurnalo suderinimas | Pakeitimų žurnalas atitinka tikrą būseną. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.9 | Ryšys su kodo saugykla | Duomenų bazė susieta su kodo saugykla. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.10 | Kokybės vartai | Prieš paskelbiant keitimą, jis tikrinamas. | sistema |  |  | api | nenustatyta | Nereikia (automatinė patikra) | registras |
| 13.11 | Automatinė naudotojo kelio patikra | Automatiškai išbandomi pagrindiniai žingsniai. | sistema |  |  | ne | nenustatyta | Nereikia (automatinė patikra) | registras |
| 13.12 | Produkto taisyklių patikra | Automatiškai tikrinama, ar laikomasi produkto taisyklių. | sistema |  |  | ne | nenustatyta | Nereikia (automatinė patikra) | registras |
| 13.13 | Funkcijų prieinamumo sąrašas | Aišku, kurios funkcijos jau paruoštos. | administratorius, sistema |  |  | api | nenustatyta | Koordinatorius | registras |
| 13.14 | Išimčių valdymas | Savininkas leidžia išimtis kokybės vartams. | administratorius |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.15 | Senų naršyklių palaikymas | Svetainė atsidaro ir senesnėje naršyklėje. | darbuotojas, ieškantis darbo, įmonė |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.16 | Naršyklės klaidų pranešimai | Sužinoma, kai tavo naršyklėje įvyko klaida. | sistema |  |  | ne | nenustatyta | Koordinatorius | registras |
| 13.17 | Aplinkos suderinimas po perkėlimo | Po serverio keitimo viskas sulyginama. | sistema |  |  | ne | nenustatyta | Savininkas, paskui koordinatorius | registras |

### Map: links

| From | To | Kind | Data |
|---|---|---|---|
| 1.2 | 1.1 | depends |  |
| 1.3 | 1.1 | depends |  |
| 1.4 | 1.1 | depends |  |
| 1.5 | 1.1 | depends |  |
| 1.6 | 1.1 | depends |  |
| 1.7 | 1.6 | depends |  |
| 1.9 | 1.6 | depends |  |
| 1.10 | 1.5 | depends |  |
| 1.15 | 1.6 | depends |  |
| 1.14 | 1.7 | depends |  |
| 1.12 | 1.1 | depends |  |
| 1.13 | 1.1 | depends |  |
| 2.1 | 1.1 | depends |  |
| 2.2 | 2.1 | depends |  |
| 2.3 | 2.1 | depends |  |
| 2.4 | 2.1 | depends |  |
| 2.5 | 2.1 | depends |  |
| 2.6 | 2.1 | depends |  |
| 2.7 | 2.1 | depends |  |
| 2.8 | 2.1 | depends |  |
| 2.9 | 2.1 | depends |  |
| 2.10 | 2.1 | depends |  |
| 2.11 | 2.12 | depends |  |
| 2.12 | 2.1 | depends |  |
| 2.13 | 2.19 | depends |  |
| 2.13 | 2.12 | depends |  |
| 2.14 | 2.13 | depends |  |
| 2.15 | 2.12 | depends |  |
| 2.16 | 2.12 | depends |  |
| 2.18 | 2.1 | depends |  |
| 2.19 | 1.1 | depends |  |
| 2.20 | 2.19 | depends |  |
| 2.20 | 1.9 | depends |  |
| 2.21 | 2.20 | depends |  |
| 2.22 | 2.19 | depends |  |
| 2.23 | 2.19 | depends |  |
| 2.24 | 2.19 | depends |  |
| 2.25 | 2.23 | depends |  |
| 2.26 | 2.19 | depends |  |
| 2.27 | 1.15 | depends |  |
| 2.28 | 2.27 | depends |  |
| 2.29 | 2.13 | depends |  |
| 2.30 | 2.19 | depends |  |
| 2.31 | 2.19 | depends |  |
| 2.32 | 2.19 | depends |  |
| 2.33 | 2.22 | depends |  |
| 2.34 | 2.23 | depends |  |
| 2.35 | 2.1 | depends |  |
| 2.36 | 2.19 | depends |  |
| 2.37 | 2.27 | depends |  |
| 3.1 | 1.6 | depends |  |
| 3.2 | 3.1 | depends |  |
| 3.3 | 3.2 | depends |  |
| 3.4 | 3.2 | depends |  |
| 3.5 | 3.4 | depends |  |
| 3.6 | 3.2 | depends |  |
| 3.6 | 3.21 | depends |  |
| 3.7 | 3.21 | depends |  |
| 3.8 | 3.7 | depends |  |
| 3.8 | 3.2 | depends |  |
| 3.9 | 3.2 | depends |  |
| 3.10 | 3.2 | depends |  |
| 3.11 | 3.2 | depends |  |
| 3.12 | 3.2 | depends |  |
| 3.13 | 3.2 | depends |  |
| 3.14 | 3.6 | depends |  |
| 3.15 | 3.21 | depends |  |
| 3.16 | 3.14 | depends |  |
| 3.17 | 3.14 | depends |  |
| 3.18 | 3.14 | depends |  |
| 3.19 | 3.14 | depends |  |
| 3.19 | 2.23 | depends |  |
| 3.20 | 3.14 | depends |  |
| 3.21 | 1.9 | depends |  |
| 3.22 | 3.21 | depends |  |
| 3.23 | 3.21 | depends |  |
| 3.24 | 3.21 | depends |  |
| 3.25 | 3.1 | depends |  |
| 3.26 | 3.21 | depends |  |
| 3.27 | 1.15 | depends |  |
| 3.28 | 5.1 | depends |  |
| 3.29 | 2.18 | depends |  |
| 3.30 | 3.1 | depends |  |
| 3.31 | 3.1 | depends |  |
| 3.32 | 3.1 | depends |  |
| 3.33 | 2.23 | depends |  |
| 3.34 | 3.2 | depends |  |
| 3.34 | 2.23 | depends |  |
| 3.35 | 3.14 | depends |  |
| 3.35 | 3.17 | depends |  |
| 3.36 | 3.1 | depends |  |
| 4.1 | 1.6 | depends |  |
| 4.3 | 4.5 | depends |  |
| 4.5 | 2.1 | depends |  |
| 4.5 | 4.1 | depends |  |
| 4.6 | 4.1 | depends |  |
| 4.7 | 4.1 | depends |  |
| 4.9 | 4.4 | depends |  |
| 4.10 | 4.28 | depends |  |
| 4.11 | 4.10 | depends |  |
| 4.12 | 4.11 | depends |  |
| 4.13 | 4.11 | depends |  |
| 4.14 | 4.11 | depends |  |
| 4.15 | 1.6 | depends |  |
| 4.16 | 4.3 | depends |  |
| 4.17 | 2.35 | depends |  |
| 4.18 | 2.35 | depends |  |
| 4.19 | 4.17 | depends |  |
| 4.21 | 4.20 | depends |  |
| 4.22 | 4.21 | depends |  |
| 4.26 | 2.1 | depends |  |
| 4.28 | 2.1 | depends |  |
| 4.29 | 4.3 | depends |  |
| 4.29 | 4.1 | depends |  |
| 4.30 | 4.12 | depends |  |
| 4.30 | 4.1 | depends |  |
| 5.2 | 5.1 | depends |  |
| 5.3 | 5.1 | depends |  |
| 5.5 | 5.4 | depends |  |
| 5.6 | 5.4 | depends |  |
| 5.7 | 1.13 | depends |  |
| 5.8 | 5.6 | depends |  |
| 5.9 | 5.7 | depends |  |
| 5.10 | 5.6 | depends |  |
| 5.11 | 5.12 | depends |  |
| 5.13 | 5.11 | depends |  |
| 5.14 | 5.1 | depends |  |
| 5.15 | 5.14 | depends |  |
| 5.19 | 2.20 | depends |  |
| 5.21 | 5.6 | depends |  |
| 6.1 | 2.1 | depends |  |
| 6.3 | 6.1 | depends |  |
| 6.3 | 6.2 | depends |  |
| 6.4 | 6.3 | depends |  |
| 6.6 | 6.1 | depends |  |
| 6.7 | 3.1 | depends |  |
| 6.9 | 3.1 | depends |  |
| 6.12 | 6.11 | depends |  |
| 6.13 | 6.2 | depends |  |
| 6.14 | 6.13 | depends |  |
| 6.19 | 4.6 | depends |  |
| 6.21 | 1.6 | depends |  |
| 6.23 | 6.1 | depends |  |
| 6.24 | 6.3 | depends |  |
| 7.2 | 7.3 | depends |  |
| 7.3 | 7.1 | depends |  |
| 7.5 | 7.3 | depends |  |
| 7.13 | 7.3 | depends |  |
| 7.14 | 7.3 | depends |  |
| 7.15 | 7.5 | depends |  |
| 7.16 | 7.5 | depends |  |
| 7.17 | 7.5 | depends |  |
| 7.18 | 7.5 | depends |  |
| 7.18 | 7.3 | depends |  |
| 7.19 | 7.5 | depends |  |
| 7.20 | 7.5 | depends |  |
| 7.21 | 7.5 | depends |  |
| 7.22 | 7.3 | depends |  |
| 7.23 | 7.5 | depends |  |
| 7.24 | 7.23 | depends |  |
| 7.25 | 7.8 | depends |  |
| 7.26 | 7.8 | depends |  |
| 7.27 | 7.3 | depends |  |
| 7.29 | 7.5 | depends |  |
| 7.31 | 7.1 | depends |  |
| 7.6 | 7.5 | depends |  |
| 7.12 | 10.6 | depends |  |
| 7.30 | 2.19 | depends |  |
| 8.2 | 8.1 | depends |  |
| 8.5 | 8.1 | depends |  |
| 8.9 | 1.6 | depends |  |
| 8.12 | 8.11 | depends |  |
| 8.14 | 8.13 | depends |  |
| 8.15 | 8.13 | depends |  |
| 8.17 | 8.13 | depends |  |
| 8.18 | 8.13 | depends |  |
| 8.16 | 8.3 | depends |  |
| 8.6 | 8.4 | depends |  |
| 8.8 | 8.10 | depends |  |
| 9.6 | 9.4 | depends |  |
| 9.5 | 9.4 | depends |  |
| 9.2 | 9.1 | depends |  |
| 9.3 | 9.1 | depends |  |
| 9.14 | 9.1 | depends |  |
| 9.19 | 9.1 | depends |  |
| 9.20 | 9.1 | depends |  |
| 9.16 | 1.12 | depends |  |
| 10.2 | 10.1 | depends |  |
| 10.3 | 10.1 | depends |  |
| 10.4 | 10.3 | depends |  |
| 10.17 | 10.1 | depends |  |
| 10.8 | 10.6 | depends |  |
| 10.9 | 10.6 | depends |  |
| 10.10 | 10.6 | depends |  |
| 10.7 | 10.6 | depends |  |
| 10.16 | 10.6 | depends |  |
| 10.14 | 10.15 | depends |  |
| 10.11 | 10.15 | depends |  |
| 10.18 | 4.4 | depends |  |
| 10.19 | 4.4 | depends |  |
| 10.20 | 4.4 | depends |  |
| 10.23 | 9.17 | depends |  |
| 10.5 | 10.1 | depends |  |
| 10.26 | 10.5 | depends |  |
| 11.2 | 11.1 | depends |  |
| 11.3 | 11.1 | depends |  |
| 11.4 | 11.1 | depends |  |
| 11.5 | 11.2 | depends |  |
| 11.6 | 11.5 | depends |  |
| 11.7 | 11.4 | depends |  |
| 11.7 | 2.19 | depends |  |
| 11.8 | 11.1 | depends |  |
| 11.9 | 11.7 | depends |  |
| 11.10 | 11.8 | depends |  |
| 12.1 | 12.2 | depends |  |
| 12.3 | 12.2 | depends |  |
| 12.4 | 12.2 | depends |  |
| 12.6 | 12.2 | depends |  |
| 13.3 | 13.1 | depends |  |
| 13.2 | 13.1 | depends |  |
| 13.5 | 13.4 | depends |  |
| 13.6 | 13.1 | depends |  |
| 13.8 | 13.7 | depends |  |
| 13.10 | 13.11 | depends |  |
| 13.12 | 13.10 | depends |  |
| 13.14 | 13.10 | depends |  |
| 13.17 | 13.1 | depends |  |
| 2.19 | 2.20 | data | žurnalo įrašai |
| 2.20 | 2.21 | data | patvirtinimo būsena |
| 2.19 | 2.23 | data | darbo valandos |
| 2.23 | 2.25 | data | valandos |
| 2.19 | 2.13 | data | darbo įrašų tekstas |
| 2.13 | 2.4 | data | atpažinti įgūdžiai |
| 2.3 | 2.4 | data | patvirtinti CV faktai |
| 2.5 | 2.26 | data | darbo patirtis |
| 2.19 | 2.26 | data | žurnalo įrašai |
| 2.27 | 2.26 | data | organizacijos pateikta istorija |
| 2.26 | 2.4 | data | profesinė istorija |
| 2.22 | 2.33 | data | nuotraukos |
| 2.35 | 4.10 | data | sutikimas būti randamam |
| 2.35 | 4.17 | data | sutikimas būti randamam |
| 2.1 | 4.5 | data | profilio duomenys |
| 2.2 | 4.5 | data | prieinamumas ir atlygis |
| 2.32 | 2.21 | data | kitos pusės patvirtinimas |
| 2.12 | 11.3 | data | įgūdžiai |
| 2.11 | 11.3 | data | trūkstami gebėjimai |
| 2.18 | 3.29 | data | dokumentai |
| 2.23 | 3.33 | data | valandos |
| 2.23 | 3.19 | data | faktinės valandos |
| 2.23 | 3.12 | data | valandos |
| 2.23 | 3.34 | data | įrašytos valandos |
| 2.23 | 3.31 | data | valandos ataskaitoms |
| 4.1 | 4.5 | data | poreikis |
| 4.5 | 4.3 | data | tinkami darbai |
| 4.5 | 4.11 | data | tinkami kandidatai |
| 4.3 | 4.29 | data | susidomėjimas |
| 4.29 | 4.30 | data | laisva vieta |
| 4.11 | 4.12 | data | kandidatai |
| 4.12 | 4.30 | data | trumpasis kandidatų sąrašas |
| 4.13 | 4.12 | data | parinkti kandidatai |
| 4.1 | 4.6 | data | poreikis |
| 4.6 | 6.19 | data | komandos pasiūlymas |
| 4.28 | 4.10 | data | pasiūla |
| 4.4 | 4.9 | data | skelbimai |
| 4.9 | 5.7 | data | pranešimai apie naujus skelbimus |
| 4.9 | 5.6 | data | pranešimai apie naujus skelbimus |
| 10.18 | 4.4 | data | skelbimai |
| 10.19 | 4.4 | data | skelbimai |
| 10.18 | 12.2 | data | skelbimų duomenys |
| 4.1 | 12.4 | data | įmonių poreikiai |
| 4.14 | 4.15 | data | kandidato pasiūlymas |
| 4.16 | 5.4 | data | žinutė žmogui |
| 4.19 | 5.4 | data | kontaktų prašymas |
| 4.30 | 12.2 | data | uždaryti poreikiai |
| 3.14 | 3.19 | data | planas |
| 3.6 | 3.14 | data | paskyrimai |
| 3.15 | 3.14 | data | nebuvimai |
| 3.5 | 3.13 | data | užduotys |
| 3.22 | 3.21 | data | žmonių sąrašas |
| 3.21 | 3.6 | data | žmonės |
| 3.7 | 3.8 | data | brigada |
| 3.17 | 3.35 | data | rezervacijos |
| 3.14 | 3.34 | data | planas |
| 3.20 | 3.14 | data | pamainos |
| 3.2 | 3.13 | data | projektai |
| 3.4 | 3.5 | data | etapai |
| 3.2 | 3.4 | data | projektas |
| 3.10 | 3.11 | data | defektai |
| 3.9 | 3.11 | data | pasirengimas |
| 3.27 | 3.31 | data | istorija |
| 3.28 | 5.1 | data | atsakymai |
| 5.13 | 5.11 | data | priimti užsakymai |
| 5.12 | 5.11 | data | prieinamumas |
| 5.12 | 4.5 | data | prieinamumas |
| 5.4 | 5.6 | data | žinutės |
| 5.6 | 5.7 | data | pranešimai |
| 5.6 | 5.9 | data | pranešimai |
| 5.1 | 2.19 | data | pokalbiu įrašyti darbai |
| 5.1 | 5.3 | data | veiksmai patvirtinimui |
| 5.19 | 3.31 | data | ataskaitos |
| 5.5 | 5.4 | data | vertimai |
| 8.3 | 5.5 | data | vertimai |
| 8.3 | 7.14 | data | vertimai |
| 6.1 | 6.3 | data | paslaugos |
| 6.2 | 6.3 | data | skelbimai |
| 6.3 | 6.4 | data | paslaugų paieška |
| 6.1 | 6.6 | data | užklausa |
| 6.6 | 6.9 | data | sutartys ir pasiūlymai |
| 6.9 | 3.12 | data | išlaidos |
| 6.10 | 6.6 | data | kainos skaičiavimas |
| 6.1 | 5.13 | data | užklausos |
| 6.19 | 5.13 | data | komandos užklausos |
| 6.8 | 6.9 | data | komandiruočių išlaidos |
| 6.7 | 6.9 | data | pirkimų išlaidos |
| 7.1 | 7.3 | data | planai |
| 7.5 | 7.18 | data | mokėjimai |
| 7.5 | 7.3 | data | mokėjimo būsena |
| 7.16 | 7.5 | data | patvirtinti mokėjimai |
| 7.3 | 7.2 | data | plano ribos |
| 7.3 | 7.13 | data | plano ribos |
| 7.3 | 7.14 | data | plano teisės |
| 7.3 | 7.22 | data | plano teisės |
| 7.23 | 7.8 | data | kreditai |
| 7.8 | 7.25 | data | kreditų likutis |
| 7.26 | 7.8 | data | kreditų judėjimas |
| 7.24 | 7.8 | data | kreditai |
| 7.15 | 7.31 | data | prenumerata |
| 1.7 | 7.27 | data | patvirtinta įmonė |
| 7.5 | 7.17 | data | mokėjimų įrašai |
| 9.4 | 9.5 | data | duomenų prašymas |
| 9.4 | 9.6 | data | duomenų prašymas |
| 9.14 | 9.2 | data | naudojimo statistika |
| 9.9 | 9.1 | data | veiksmų žurnalas |
| 9.17 | 4.10 | data | vidinė pasiūla |
| 9.18 | 8.7 | data | viešos duomenys |
| 9.13 | 4.21 | data | vietos privatumas |
| 10.1 | 10.2 | data | programos įrankiai |
| 10.3 | 10.4 | data | leidimai |
| 10.4 | 10.17 | data | leidimų sritys |
| 10.6 | 10.8 | data | dirbtinio intelekto pagalba |
| 10.6 | 10.9 | data | dirbtinio intelekto pagalba |
| 10.6 | 10.10 | data | dirbtinio intelekto pagalba |
| 10.6 | 10.7 | data | dirbtinio intelekto pagalba |
| 10.8 | 2.3 | data | CV faktai patvirtinimui |
| 10.9 | 2.19 | data | žurnalo siūlymai |
| 10.23 | 4.10 | data | agentūros pasiūla |
| 10.20 | 4.4 | data | aktualūs skelbimai |
| 11.1 | 11.2 | data | mokymo įstaigos ir besimokantys |
| 11.2 | 11.5 | data | programos ir srautai |
| 11.5 | 11.6 | data | rezultatai |
| 11.4 | 11.7 | data | praktika |
| 11.7 | 2.13 | data | įgyti gebėjimai |
| 11.7 | 2.12 | data | įgyti įgūdžiai |
| 11.8 | 2.8 | data | pažymėjimai |
| 11.3 | 11.8 | data | mokymosi poreikis |
| 11.9 | 11.7 | data | žmogaus peržiūra |
| 11.10 | 11.8 | data | pripažintas mokymasis |
| 12.5 | 8.4 | data | rinkos faktai |
| 12.5 | 12.1 | data | rinkos faktai |
| 12.2 | 12.3 | data | žinios |
| 8.4 | 8.6 | data | šalių duomenys |
| 1.9 | 3.21 | data | nariai |
| 1.15 | 2.27 | data | įmonės istorija |
| 1.1 | 1.4 | data | paskyra |
| 1.6 | 1.7 | data | įmonės duomenys |
| 1.12 | 1.1 | data | kvietimas |
| 1.9 | 2.20 | data | vaidmenys |

### Map: journeys

| Journey | Lietuviškai | Step | Functions |
|---|---|---|---|
| J-1 | Darbuotojas prisijungia, pradeda ir mato gyvą CV | 1 | 1.1 |
| J-1 | Darbuotojas prisijungia, pradeda ir mato gyvą CV | 2 | 1.4 |
| J-1 | Darbuotojas prisijungia, pradeda ir mato gyvą CV | 3 | 2.19 |
| J-1 | Darbuotojas prisijungia, pradeda ir mato gyvą CV | 4 | 2.4 |
| J-2 | Vadovas patvirtina žurnalo įrašą, ir jis atsiranda CV | 1 | 2.20 |
| J-2 | Vadovas patvirtina žurnalo įrašą, ir jis atsiranda CV | 2 | 2.21 |
| J-2 | Vadovas patvirtina žurnalo įrašą, ir jis atsiranda CV | 3 | 2.31 |
| J-3 | Darbuotojas randa poreikį ir susisiekia su įmone | 1 | 4.3 |
| J-3 | Darbuotojas randa poreikį ir susisiekia su įmone | 2 | 4.16 |
| J-3 | Darbuotojas randa poreikį ir susisiekia su įmone | 3 | 5.4 |
| J-4 | Viešoji darbo paieška | 1 | 4.4 |
| J-4 | Viešoji darbo paieška | 2 | 4.29 |
| J-5 | Įmonė prisijungia ir randa kandidatus | 1 | 1.6 |
| J-5 | Įmonė prisijungia ir randa kandidatus | 2 | 4.1 |
| J-5 | Įmonė prisijungia ir randa kandidatus | 3 | 4.11 |
| J-5 | Įmonė prisijungia ir randa kandidatus | 4 | 4.12 |
| J-5 | Įmonė prisijungia ir randa kandidatus | 5 | 4.16 |
| J-6 | Įmonė pakviečia žmogų | 1 | 1.9 |
| J-6 | Įmonė pakviečia žmogų | 2 | 1.4 |
| J-7 | Projektas, valandos ir ataskaita | 1 | 3.2 |
| J-7 | Projektas, valandos ir ataskaita | 2 | 3.6 |
| J-7 | Projektas, valandos ir ataskaita | 3 | 3.3 |
| J-7 | Projektas, valandos ir ataskaita | 4 | 2.23 |
| J-7 | Projektas, valandos ir ataskaita | 5 | 3.13 |
| J-8 | Poreikis, datos ir darbuotojo sutikimas | 1 | 5.13 |
| J-9 | Agentūra pasiūlo žmones klientui | 1 | 4.15 |
| J-9 | Agentūra pasiūlo žmones klientui | 2 | 4.28 |
| J-10 | Brigada siūloma kaip vienas vienetas | 1 | 3.7 |
| J-10 | Brigada siūloma kaip vienas vienetas | 2 | 4.6 |
| J-10 | Brigada siūloma kaip vienas vienetas | 3 | 4.7 |
| J-11 | Prekė ar paslauga: paskelbta, rasta, užsakyta | 1 | 6.1 |
| J-11 | Prekė ar paslauga: paskelbta, rasta, užsakyta | 2 | 6.2 |
| J-11 | Prekė ar paslauga: paskelbta, rasta, užsakyta | 3 | 6.3 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 1 | 11.1 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 2 | 11.2 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 3 | 11.3 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 4 | 11.4 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 5 | 11.5 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 6 | 11.6 |
| J-12 | Mokymo įstaiga, grupė, praktika, kompetencija | 7 | 11.7 |
| J-13 | Pirkėjas ir paslaugos teikėjas | 1 | 6.4 |
| J-13 | Pirkėjas ir paslaugos teikėjas | 2 | 6.1 |
| J-14 | Įmonė perka planą be pagalbos | 1 | 7.1 |
| J-14 | Įmonė perka planą be pagalbos | 2 | 7.5 |
| J-14 | Įmonė perka planą be pagalbos | 3 | 7.15 |
| J-14 | Įmonė perka planą be pagalbos | 4 | 7.28 |
| J-15 | Pranešimas apie tinkamą darbą be prisijungimo | 1 | 4.9 |
| J-15 | Pranešimas apie tinkamą darbą be prisijungimo | 2 | 5.7 |
| J-15 | Pranešimas apie tinkamą darbą be prisijungimo | 3 | 5.9 |
| J-16 | Pamiršai slaptažodį | 1 | 1.3 |
| J-17 | Programėlės įdiegimas iš parduotuvės | 1 | 8.15 |
| J-17 | Programėlės įdiegimas iš parduotuvės | 2 | 8.17 |
| J-17 | Programėlės įdiegimas iš parduotuvės | 3 | 8.18 |
| J-18 | Tavo duomenų eksportas ir ištrynimas | 1 | 9.4 |
| J-18 | Tavo duomenų eksportas ir ištrynimas | 2 | 9.5 |
| J-18 | Tavo duomenų eksportas ir ištrynimas | 3 | 9.6 |
| J-19 | Augimas: galimi įgūdžiai ir mokymosi kryptis | 1 | 2.29 |
| J-19 | Augimas: galimi įgūdžiai ir mokymosi kryptis | 2 | 11.3 |

### Map: blockers

| Blocker | Lietuviškai | Affects | Who |
|---|---|---|---|
| OI-4 | Bandomojo plano rodymas (#2682) | 7.4, 7.20 | savininkas, paskui koordinatorius |
| OI-5 | Išsaugotų darbų sąrašas rodomas teisingai (#2642) | 4.4 | savininkas, paskui koordinatorius |
| OI-8 | Mokėjimo apsauga bandomuoju laikotarpiu (#3047) | 7.4, 7.15 | savininkas, paskui koordinatorius |
| OI-13 | Senų skelbimų šalinimo apsauga (#2693) | 10.20 | savininkas, paskui koordinatorius |
| OI-14 | Pagalbininkų prisijungimo testas (#2454) | 10.3 | savininkas, paskui koordinatorius |
| OI-27 | Įmonė skiria mokymus darbuotojams (#2816) | 11.8 | savininkas, paskui koordinatorius |
| OI-28 | Užimtumo konflikto fiksavimas (#2795) | 3.35, 5.13 | savininkas, paskui koordinatorius |
| OI-29 | Darbuotojų matomumas pagal nutylėjimą (#2747) | 2.35, 4.17 | savininkas, paskui koordinatorius |
| OI-30 | Skelbimo uždarymo būsena (#2746) | 6.2 | savininkas, paskui koordinatorius |
| OI-31 | Skelbimų filtras pagal šalį (#2209) | 4.4 | savininkas, paskui koordinatorius |
| OI-48 | Leidimų aprašymai paprastais žodžiais (#2924) | 10.3, 10.4 | savininkas, paskui koordinatorius |
| OI-49 | Pagalbininkų prieigos apimtis (#2923) | 10.4 | savininkas, paskui koordinatorius |
| OI-50 | Kasdienė augimo ataskaita (#2886) | 9.14 | savininkas, paskui koordinatorius |
| OI-52 | Naudotojo valdomi leidimai (#2812) | 10.3, 10.4 | savininkas, paskui koordinatorius |
| OI-54 | Prekių pirkimo užklausos (#2713) | 6.13 | savininkas, paskui koordinatorius |
| OI-55 | Pagalbininkų leidimų sritys (#2707) | 10.4 | savininkas, paskui koordinatorius |
| OI-56 | Įmonės sąskaitos mokėjimų skiltyje (#2704) | 7.20 | savininkas, paskui koordinatorius |
| OI-57 | PVM pažadas ir tekstas (#2701) | 7.29 | savininkas ir teisininkas |
| OI-58 | PVM ir sąskaitų tvarkymas (#2685) | 7.15, 7.29 | savininkas, paskui koordinatorius |
| OI-60 | Trys nemokami profilių peržiūrėjimai (#2474) | 4.22, 7.10, 7.22, 7.27 | savininkas, paskui koordinatorius |
| OI-61 | Nuorodos į profilius tik su leidimu (#2471) | 2.10, 4.18 | savininkas, paskui koordinatorius |
| OI-62 | Profesijų klasifikatoriaus sutvarkymas (#2463) | 2.17 | savininkas, paskui koordinatorius |
| OI-67 | Istorinių datų ištaisymas (#2362) | 2.28 | savininkas, paskui koordinatorius |
| OI-70 | Projekto sąskaitų eiga (#2203) | 3.12, 7.30 | savininkas, paskui koordinatorius |
| OI-73 | Biuro profesijų katalogas (#1577) | 2.12 | savininkas, paskui koordinatorius |
| OI-101 | Balso atpažinimo paleidimas (#2198) | 2.30, 5.15 | savininkas, paskui koordinatorius |

## Chrome check queue

Priority queue for the 123 functions with no browser proof named in their evidence (owner order 2026-11-05). Ordered by real user impact: core journeys, then money and privacy, then the rest. Status still comes only from the function rows. Scenarios are referenced by J-n and SC-n, not rewritten here.

| Group | Meaning | Functions |
|---|---|---|
| A | Core journeys, can run now | 11 |
| B | Money and privacy, can run now | 5 |
| C | Rest, can run now | 1 |
| D | Waits: blocked or not built, core and money first | 66 |
| E | Already proven in a browser | 8 |
| F | A browser can't prove it | 32 |

**So the real gap is smaller and different from 123:** 8 already had browser proof that the keyword count missed, 32 can't be proven in a browser, 66 can't be tested until they're unblocked or built, and **17 can be checked now.**

How it's tested:

- **existing walk / walk, new step:** Playwright Chromium against production with the synthetic cast, dispatched by the coordinator through `prod-qa-walk.yml`. This is not a person in Chrome.
- **Chrome signed out:** a real browser with no account; no walk budget, no writes.
- **QA account in a real browser isn't offered.** Agents don't enter production passwords. Anything signed in goes through a walk, or the owner does it in their own Chrome.

**What fits:** 12 walks cover groups A to C. Earlier runs of 10 of those specs took 18 s to about 6 min; `requirements-countries` and `public-market-direction` have no run among the last 400. With setup and the 3 min gap, allow up to about 12 min each, so about 2.5 h of walk time in total. That's a quarter of the 48-a-day budget and fits in one day under the lane rule (one walk at a time, never during a deploy or import, §1.7a). Spread them at no more than 2 an hour in a quiet period: Quality Gates is active on `main` about 20% of the time, and a merge can start a deploy. Seven of them need a new step first, so they follow small test PRs. Estimate only; per-walk load wasn't measured.

| Order | Function | Name | Group | How | Walk | Journey | Note |
|---|---|---|---|---|---|---|---|
| 1 | 1.13 | Sistemos laiškai | A | existing walk, record it | mail-reset | J-16 | Run 41428606490 read the real QA mailbox; no new run |
| 2 | 1.11 | Įmonių duomenų atskyrimas | A | existing walk | company-governance | SC-10 | Browser side of isolation; the API walk stays too |
| 3 | 4.20 | Asmens apsauga paieškoje | A | walk, new step | company-talent-history | SC-5 | Company sees a masked person |
| 4 | 1.12 | Kvietimai ir rekomendavimas | A | walk, new step | invited-worker | J-6 | Synthetic invitation only |
| 5 | 2.36 | Žurnalo šablonai pagal profesiją | A | walk, new step | journal-confirm | SC-2 | Profession template in the journal |
| 6 | 4.8 | Anoniminis poreikio pateikimas | A | walk, new step | register-gaps | SC-6 | Writes one row; the walk must remove it |
| 7 | 4.29 | Susidomėjimas virsta laisva vieta | A | walk, new step | jobs-search | J-4 | Screen only; no hand-off to the real partner |
| 8 | 6.11 | Pasirengimas darbui užsienyje | A | existing walk, plus Chrome signed out | requirements-countries | SC-6 (area) | Public part |
| 9 | 8.1 | Svetainės kalbos | A | existing walk, plus Chrome signed out | public-org-locales | SC-3 (area) | All active languages |
| 10 | 12.2 | Darbo rinkos žinios | A | existing walk, plus Chrome signed out | public-market-direction | SC-3 (area) |  |
| 11 | 12.5 | Viešieji rinkos faktai | A | existing walk, plus Chrome signed out | public-market-direction | SC-3 (area) |  |
| 12 | 9.4 | Privatumo prašymai | B | existing walk | search-support-privacy | J-18 |  |
| 13 | 7.2 | Nemokamas planas: vienas atviras poreikis | B | walk, new step | fresh-activation | J-5 | Needs an organization without the pilot; the QA cast's holds it |
| 14 | 9.9 | Veiksmų žurnalas | B | walk, new step | admin-console | J-18 (area) | Screen only; detail in the private record |
| 15 | 7.28 | Pardavėjas ir sąlygos | B | Chrome signed out |  | J-14 | Read the live terms; stays FAIL until legal text exists |
| 16 | 9.24 | Saugumo incidentų tvarkymas | B | Chrome signed out |  | J-18 (area) | Response headers on public pages |
| 17 | 13.16 | Naršyklės klaidų pranešimai | C | read the code first |  | SC-10 (area) | Only a citation so far; may not exist |
| 18 | 4.30 | Kandidatas, sprendimas, poreikio uždarymas | D | walk once unblocked |  | SC-5 | Waits; see its row |
| 19 | 3.35 | Persidengiančių įsipareigojimų įspėjimas | D | walk once unblocked |  | SC-10 | Waits; see its row |
| 20 | 3.36 | Įmonės gyvasis CV | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 21 | 2.10 | Nuorodos į kitus profilius | D | walk once unblocked |  | SC-2 (area) | Waits; see its row |
| 22 | 4.18 | Duomenų atskleidimas darbdaviui | D | walk once unblocked |  | SC-5 (area) | Waits; see its row |
| 23 | 2.27 | Įmonės istorinių įrašų įkėlimas | D | walk once unblocked |  | SC-2 (area) | Waits; see its row |
| 24 | 2.28 | Senų įrašų sujungimas | D | walk once unblocked |  | SC-2 (area) | Waits; see its row |
| 25 | 2.37 | Įrašo atsisakymas | D | new walk once it exists |  | SC-2 (area) | Not built |
| 26 | 6.21 | Viešas verslo puslapis | D | walk once unblocked |  | SC-4 | Waits; see its row |
| 27 | 4.22 | Trys nemokami profilių peržiūrėjimai | D | new walk once it exists |  | SC-5 (area) | Not built |
| 28 | 2.17 | Europos profesijų klasifikatorius | D | walk once unblocked |  | SC-2 (area) | Waits; see its row |
| 29 | 5.15 | Balsas kaip lygiavertis būdas | D | walk once unblocked |  | SC-5 (area) | Waits; see its row |
| 30 | 2.30 | Žurnalas balsu | D | walk once unblocked |  | SC-2 (area) | Waits; see its row |
| 31 | 7.5 | Mokėjimas už planą | D | walk once unblocked |  | J-14 | Waits; see its row |
| 32 | 7.6 | Mokėjimų įrašų atkūrimas | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 33 | 7.7 | Rankinis bandomojo plano suteikimas | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 34 | 7.8 | Kreditų sąskaita | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 35 | 7.9 | Kreditų papildymas ir planų pakopos | D | new walk once it exists |  | J-14 (area) | Not built |
| 36 | 7.11 | Atidėti planai | D | new walk once it exists |  | J-14 (area) | Not built |
| 37 | 7.12 | Dirbtinio intelekto kaštų skaičiavimas | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 38 | 7.15 | Metinė prenumerata | D | walk once unblocked |  | J-14 | Waits; see its row |
| 39 | 7.18 | Mokėjimas keičia teises | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 40 | 7.19 | Grąžinimai ir ginčai | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 41 | 7.20 | Sąskaitos platformoje | D | new walk once it exists |  | J-14 (area) | Not built |
| 42 | 7.21 | Atsiskaitymo portalas | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 43 | 7.22 | Mokamų funkcijų teisės ir ribos | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 44 | 7.23 | Kreditų pirkimas | D | new walk once it exists |  | J-14 (area) | Not built |
| 45 | 7.24 | Kreditai po vieno mokėjimo | D | new walk once it exists |  | J-14 (area) | Not built |
| 46 | 7.26 | Kreditų išleidimas ir grąžinimas | D | new walk once it exists |  | J-14 (area) | Not built |
| 47 | 7.27 | Nemokamas VIP patvirtintoms įmonėms | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 48 | 7.29 | PVM skaičiavimas | D | walk once unblocked |  | J-14 (area) | Waits; see its row |
| 49 | 7.30 | Sąskaitos ir priėmimo aktai iš žurnalo | D | new walk once it exists |  | J-14 (area) | Not built |
| 50 | 7.31 | Planai darbuotojams ir įmonėms | D | new walk once it exists |  | J-14 (area) | Not built |
| 51 | 1.8 | Viena organizacija, keli veiklos tipai | D | walk once unblocked |  | J-1 (area) | Waits; see its row |
| 52 | 5.8 | Pranešimai telefone | D | walk once unblocked |  | SC-5 (area) | Waits; see its row |
| 53 | 5.16 | Įspėjimai savininkui | D | walk once unblocked |  | SC-5 (area) | Waits; see its row |
| 54 | 5.20 | Savos automatizacijos | D | new walk once it exists |  | SC-5 (area) | Not built |
| 55 | 5.21 | SMS ir WhatsApp kanalai | D | new walk once it exists |  | SC-5 (area) | Not built |
| 56 | 6.12 | Tarptautiniai sandoriai | D | new walk once it exists |  | SC-6 (area) | Not built |
| 57 | 6.13 | Prekių užsakymai | D | new walk once it exists |  | SC-6 (area) | Not built |
| 58 | 6.14 | Logistika | D | new walk once it exists |  | SC-6 (area) | Not built |
| 59 | 6.22 | Būstas | D | new walk once it exists |  | SC-6 (area) | Not built |
| 60 | 6.23 | Paslaugos įvertinimas ir ginčai | D | new walk once it exists |  | SC-6 (area) | Not built |
| 61 | 6.24 | Paslaugų srautas telefone | D | new walk once it exists |  | SC-6 (area) | Not built |
| 62 | 8.5 | Devynios pirmosios rinkos | D | walk once unblocked |  | SC-3 (area) | Waits; see its row |
| 63 | 8.13 | Programėlė telefonui | D | walk once unblocked |  | J-17 | Waits; see its row |
| 64 | 8.14 | Nuorodos į programėlę | D | walk once unblocked |  | J-17 | Waits; see its row |
| 65 | 8.15 | Programėlių parduotuvės | D | walk once unblocked |  | J-17 | Waits; see its row |
| 66 | 9.16 | Rekomendavimo sąsaja | D | walk once unblocked |  | J-18 (area) | Waits; see its row |
| 67 | 10.4 | Dirbtinio intelekto leidimų sritys | D | new walk once it exists |  | SC-10 (area) | Not built |
| 68 | 10.5 | Sąrašai dirbtinio intelekto parduotuvėse | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 69 | 10.7 | Pokalbio ketinimų atpažinimas | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 70 | 10.8 | CV sutvarkymas dirbtiniu intelektu | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 71 | 10.9 | Žurnalo siūlymai | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 72 | 10.10 | Paaiškinimai | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 73 | 10.15 | Pagalbininkų vykdymas | D | new walk once it exists |  | SC-10 (area) | Not built |
| 74 | 10.16 | Pagalbininkai kaip dalyviai | D | new walk once it exists |  | SC-10 (area) | Not built |
| 75 | 10.21 | Statistikos importas | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 76 | 10.22 | Partnerio organizacijos sąsaja | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 77 | 10.24 | Savo serverio vertimas | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 78 | 10.25 | Debesų dirbtinis intelektas | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 79 | 10.26 | Programų konkursas | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 80 | 11.9 | Mokymosi peržiūra žmogaus akimis | D | walk once unblocked |  | SC-1 (area) | Waits; see its row |
| 81 | 11.10 | Ankstesnio mokymosi pripažinimas | D | new walk once it exists |  | SC-1 (area) | Not built |
| 82 | 13.9 | Ryšys su kodo saugykla | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 83 | 13.17 | Aplinkos suderinimas po perkėlimo | D | walk once unblocked |  | SC-10 (area) | Waits; see its row |
| 84 | 3.16 | Žmonių trūkumo laiko juosta | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 85 | 3.19 | Planas ir faktas | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 86 | 5.12 | Prieinamumas | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 87 | 5.14 | Greitoji paieška ir balsas | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 88 | 9.3 | Naudotojo peržiūra | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 89 | 12.1 | Rinkos žemėlapis | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 90 | 12.4 | Poreikio atpažinimas | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 91 | 7.3 | Planų teisių nustatymas | E | already has browser proof |  |  | Owner session or named walk that keywords missed; refresh only if the page changes |
| 92 | 6.16 | Perdavimas partnerio organizacijai | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 93 | 7.16 | Mokėjimo pranešimo patikra | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 94 | 7.17 | Dvigubo apmokestinimo apsauga | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 95 | 8.17 | Programėlė Android telefonui | F | no browser can prove it |  |  | native app, proven on a device |
| 96 | 8.18 | Programėlė iPhone | F | no browser can prove it |  |  | native app, proven on a device |
| 97 | 9.6 | Duomenų ištrynimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 98 | 9.7 | Darbuotojo duomenų skyrimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 99 | 9.8 | Duomenų prieigos taisyklės | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 100 | 9.10 | Užklausų ribojimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 101 | 9.17 | Vidinis pasiūlos srautas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 102 | 9.22 | Aplinkos nustatymų patikra | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 103 | 9.23 | Duomenų bazės funkcijų kontrolė | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 104 | 9.25 | Saugumo perspėjimai | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 105 | 10.2 | Dirbtinio intelekto scenarijai | F | no browser can prove it |  |  | MCP, no screen |
| 106 | 10.3 | Prisijungimas dirbtinio intelekto programoms | F | no browser can prove it |  |  | MCP, no screen |
| 107 | 10.17 | Išorinių veiksmų kvitai | F | no browser can prove it |  |  | MCP, no screen |
| 108 | 10.18 | Skelbimai iš Švedijos | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 109 | 10.19 | Skelbimai iš Norvegijos | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 110 | 10.20 | Senų skelbimų šalinimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 111 | 10.23 | Agentūros pasiūlos srautas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 112 | 13.2 | Veikimo stebėjimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 113 | 13.4 | Duomenų bazės talpa | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 114 | 13.5 | Atsarginės kopijos | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 115 | 13.6 | Reguliarūs foniniai darbai | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 116 | 13.7 | Duomenų bazės pakeitimų patikra | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 117 | 13.8 | Pakeitimų žurnalo suderinimas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 118 | 13.10 | Kokybės vartai | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 119 | 13.11 | Automatinė naudotojo kelio patikra | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 120 | 13.12 | Produkto taisyklių patikra | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 121 | 13.13 | Funkcijų prieinamumo sąrašas | F | no browser can prove it |  |  | no page shows it |
| 122 | 13.14 | Išimčių valdymas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
| 123 | 13.15 | Senų naršyklių palaikymas | F | no browser can prove it |  |  | Server or data; keeps its own proof |
