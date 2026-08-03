> **HISTORICAL, POINT-IN-TIME AUDIT — DO NOT UPDATE IN PLACE.**
> Audit date **2026-08-02** · base commit `c05a4802` · source `audit/w14-analytics-kpi` @ `81904b46`.
> Findings are frozen exactly as written and were **not** re-scored against later work.
> Closed since this audit: **P0-1** by PR #984 (`d3ab92b3`), **P0-2** (the code half) by PR #987 (`d79a627f`), **P0-3** by PR #990 (`0849d609`).
> Slice **W14-11** is no longer owner-blocked: `20260714150000_ai_runs_audit_v1` was applied to production on 2026-08-03.
> Current state → [post-merge production readiness baseline 2026-08-03](./post-merge-production-readiness-baseline-2026-08-03.md).
> Restored to `main` on 2026-08-03 (docs-only, content unaltered).

---

# W14 — Analytics & KPI, read-only audit

- **Worktree:** `C:\Users\Mano\Documents\labourmarketai-w14-audit`
- **Branch:** `audit/w14-analytics-kpi`
- **Base:** `origin/main` @ `c05a48026b945c14a42a76a34cb1c90ce9113e87`
- **Date:** 2026-08-02
- **Mode:** READ-ONLY. No code, migration, test or config file was modified. No build, no DB, no Supabase MCP, no Playwright, no production access.
- **Scope:** worker / employer / organization / marketplace / platform KPI, charts, player-card analytics, production metrics, usage & cost, conversion, retention, liquidity, reliability, moderation, disputes, revenue/margin **surfaces only**.
- **Out of scope, deliberately not analysed:** Stripe, billing, plans, pricing, payment methods, credits, spending limits. Where a metric surface touches billing it is named and skipped.

> **App root note.** There is no `apps/web/src`. The Next.js app is `apps/web/{app,components,lib,content,messages}`. All paths below are absolute.

---

## 0. Executive verdict

The product's **in-product** analytics are, with three exceptions, honest: numbers come from real rows, zeros are shown as zeros, and an unusually strong guard corpus (`apps/web/lib/guards/`) actively forbids ratings, trust scores and fabricated verdicts. The failures are not "fake numbers in the dashboard" — they are:

1. **Charts were destroyed by a render-site deletion, not by a query or a gate** (A-13, confirmed at commit level).
2. **The public landing renders an undisclosed AI "confidence" percentage from a literal constant** — the single most misleading number in the product.
3. **Employer analytics essentially do not exist**, and **marketplace liquidity is not measured at all**.
4. **AI usage/cost is fully computed and then dropped on the floor** — the table is not applied and nothing reads it.
5. **The "39 metrics" catalogue is 0/39 wired**, and it does not exist on `main` at all.

| Domain | Verdict |
|---|---|
| Worker / Player Card analytics | **FULL** (best surface in the product) |
| Employer / company analytics | **MISSING** (one exception: workforce planning = FULL) |
| Organization-scoped analytics | **PARTIAL** — profile-scoped, not org-scoped |
| Marketplace liquidity | **MISSING** |
| Platform / admin KPI | **FULL** but admin-only and window-inconsistent |
| Conversion funnel | **FULL** |
| Retention / churn / cohort | **MISSING** |
| Reliability / no-show / cancellation | **MISSING** |
| Moderation / disputes | **BLOCKED_BY_W6_PROD_MIGRATION** |
| Usage & cost | **DEAD** (collected, computed, dropped) |
| Revenue / margin surfaces | **STUB** (0/39 computable; billing-gated, out of scope) |
| Public marketing stats | **MISLEADING** (3 surfaces) |

---

## 1. Metric catalogue

Every metric surfaced anywhere in the product, grouped by audience.

### 1.1 Worker — Player Card (`components/app/worker-player-card.tsx`)

| # | Metric | Surface line |
|---|---|---|
| W-01 | Declared skills count | `apps/web/components/app/worker-player-card.tsx:451-457` |
| W-02 | Candidate skills count | `:458-464` |
| W-03 | Evidence entries (journal) count | `:465-471` |
| W-04 | Attention instructions count | `:472-478` |
| W-05 | Readiness `met/total` (6 binary signals) | `:302-308`, `:320` |
| W-06 | Journal-supported skills count | `:412-422` |
| W-07 | Confirmed skill badges | `:391-402` |
| W-08 | Evidence timeline, 12 calendar months | `:433-436` |
| W-09 | Skill-evidence bars (per-skill record counts) | `:437-443` |
| W-10 | Work-history time band | `:447` |
| W-11 | Documents valid / expiring | `:519-529` |
| W-12 | "Response from others" (manager confirmations) | `:530-543` |
| W-13 | Latest evidence date | `:590-605` |
| W-14 | Salary thermometer (€) | `:548-587` |
| W-15 | Experience counts (positive / negative / disputed) | `apps/web/components/app/experience-counts-block.tsx:62-90` |

### 1.2 Employer / company

| # | Metric | Surface line |
|---|---|---|
| E-01 | Active workers | `apps/web/app/[locale]/dashboard/company/page.tsx:347` |
| E-02 | Pending invitations | `:364-367` |
| E-03 | Org members | `:368` |
| E-04 | Members with review enabled | `:370` |
| E-05 | Entries pending review | `:372` |
| E-06 | Projects count | `:375` |
| E-07 | Gallery photo count per project | `:213-220` |
| E-08 | Ops counts grid (pending/accepted/members/review) | `:945-972` |
| E-09 | Worker readiness signals per worker | `:351-363`, `:1184` |
| E-10 | Manager evidence (reviewed / actions / confirmations / corrections / rejections) | `:378`, `:1113` |
| E-11 | Company readiness band | `:922-933` |
| E-12 | Required / available / shortfall headcount, shortfall hours, coverage %, risk level, risk date | `apps/web/app/[locale]/dashboard/company/planning/page.tsx:350-428` |
| E-13 | Per-month coverage bars | `:511-530` |
| E-14 | Missing-skill chips | `:434-455` |

### 1.3 Platform / admin

| # | Metric | Surface line |
|---|---|---|
| P-01 | Overview KPIs: profiles, profiles w/o `profile_text`, companies, skill claims | `apps/web/app/[locale]/dashboard/admin/page.tsx:87-105`, `:199-219` |
| P-02 | Acquisition funnel — 8 stage counts | `apps/web/lib/admin/conversion-funnel.ts:29-36`, rendered `admin/telemetry/page.tsx:198-275` |
| P-03 | 4 conversion rates | `conversion-funnel.ts:130-160` |
| P-04 | utm_source breakdown | `conversion-funnel.ts:162-165` |
| P-05 | Time-to-first-value median + p75 | `apps/web/lib/admin/pilot-metrics.ts:85-184`, rendered `:279-354` |
| P-06 | Task completion summary (started/success/error/abandoned/avgMs) | `admin/telemetry/page.tsx:117-163`, `:377-428` |
| P-07 | Top 20 error codes | `:166-178`, `:430-452` |
| P-08 | Recent 200 raw events | `:454-535` |
| P-09 | Agent-OS: 24h events, 24h errors, `google_oauth_start`, `journal_save_success` | `apps/web/app/[locale]/dashboard/admin/agent-os/page.tsx:78,83,129,134` |
| P-10 | Supply cells (workers per profession × country, + confirmed sub-count) | `apps/web/lib/admin/market-analysis.ts:79-129` |
| P-11 | Demand cells (requests per country × role) | `:132-154` |
| P-12 | Country gaps (demand vs supply, side-by-side counts) | `:156-171` |
| P-13 | Market rate averages | `:173-207` |
| P-14 | Launch signals (workers, companies, verified companies, open demands, interest signals) | `apps/web/lib/admin/launch-signals.ts:52-67` |
| P-15 | Readiness overview (pending docs, docs missing/blocked, companies by state) | `apps/web/lib/admin/readiness-overview.ts:63-96` |
| P-16 | Bookings by status histogram | `:98-105` |
| P-17 | Moderation queue size | `apps/web/lib/trust/experience-records.ts:315-341` |
| P-18 | Dispute queue size | `:344-370` |
| P-19 | CRM pipeline stage counts | `apps/web/lib/crm/pipeline.ts:68,195`, rendered `admin/pipeline/page.tsx:124` |
| P-20 | League table | `apps/web/lib/admin/league.ts:66` |

### 1.4 Intelligence

| # | Metric | Surface line |
|---|---|---|
| I-01 | 10 observation metric keys (4 salary, 2 demand, 4 Eurostat) | `apps/web/lib/intelligence/metric-keys.ts:37-51` |
| I-02 | Company demand intelligence | `apps/web/lib/intelligence/intelligence-read.ts:422-426` |
| I-03 | Skills-demand model (role×geo, skill×geo, cohort-floored) | `apps/web/lib/intelligence/skills-demand-model.ts:90+` |

### 1.5 Public marketing (numbers a visitor sees)

| # | Metric | Surface line |
|---|---|---|
| M-01 | AI answer "Confidence" 86% / 74% / 68% | `apps/web/components/app/market-map/landing-scenario.ts:211,223,235` → `components/marketing/hero-live-demo.tsx:274` |
| M-02 | City demand weights ("Rotterdam 9") | `landing-scenario.ts:111-134,148-166,182-196` → `hero-live-demo.tsx:290-295` |
| M-03 | "Best matching person" profile: 14 records / 3 skills / 7 years | `apps/web/messages/en.json` `landing.hero.previewValue.*` → `hero-live-demo.tsx:336-351` |
| M-04 | Player-card showcase sample series | `apps/web/components/marketing/player-card-showcase.tsx:31,57-74,102-104` |
| M-05 | Demand preview: headcount 8, ranked matches 47, score 88 | `apps/web/content/placeholders.ts:922,925,974` |
| M-06 | Agency pool: 86 workers, 31 active, trade split | `content/placeholders.ts:943-953` |
| M-07 | FIFA-style OVR 92 + 6 stat bars | `content/placeholders.ts:419,428` → `components/app/player-card.tsx` |
| M-08 | Labour-market country statistics (5 figures) | `apps/web/lib/labour-market/evidence.ts:69,86,94,103,112` |
| M-09 | Public status line "PR #18 — BLOCKED (issue #32)" | `messages/en.json` `vision.controlRoom.pr18*` → `components/marketing/labour-market-os-map.tsx:332-333` |

### 1.6 Usage / cost

| # | Metric | Surface line |
|---|---|---|
| U-01 | AI input/output tokens per run | `apps/web/lib/ai/runtime/providers/anthropic.ts:115-116`, `openai.ts:103-104`, `gemini.ts:108-109`, `xai.ts:97-98` |
| U-02 | Actual USD cost per run | `apps/web/lib/ai/runtime/model-pricing.ts:53`, applied `apps/web/lib/ai/run-agent.ts:287-301` |
| U-03 | AI runs today (budget counter) | `apps/web/lib/ai/runtime/audit-store.ts:185` |

---

## 2. Source-of-truth table

| Metric | Table / column / query | Evidence |
|---|---|---|
| W-01..W-04, W-06, W-07, W-13 | `worker_skills`, `journal_entries`, `profile_skill_claims` via the player-card reader | `apps/web/lib/player-card/player-card.ts:86,335,426` |
| W-05 | Pure derivation over 6 already-loaded card fields | `apps/web/lib/player-card/readiness.ts:41-59` |
| W-08 | `journal_entries.created_at` bucketed to 12 UTC months | `apps/web/lib/player-card/evidence-visuals.ts:94-116` |
| W-09 | journal→skill link rows counted per slug; tier from `deriveEvidenceTier` | `evidence-visuals.ts:140-185` |
| W-10 | engagement rows, `startedAt`/`endedAt`; undated rows counted, never placed | `evidence-visuals.ts:196-253` |
| W-11 | `worker_documents` | `apps/web/lib/player-card/labels.ts:104-117` |
| W-12 | `journal_entry_confirmations` count → `managerConfirmations` | `apps/web/lib/profile/trust-signals.ts:25,61`; `labels.ts:122-125` |
| W-14 | `workers.salary_min_eur/max_eur` + `market_rate_averages`, averaged | `apps/web/lib/market/thermometer.ts:34-56`, `thermometer-data.ts:65-97` |
| W-15 | RPC `get_experience_counts` on `experience_records` | `apps/web/lib/trust/experience-records.ts:195-222` |
| E-01..E-08 | `company_workers`, `company_worker_invitations`, `engagement_contexts`, `projects`, journal photos | `apps/web/lib/company/company-workers.ts`, `lib/operations/org-members.ts:101-107`, `lib/company/project-context.ts:32-35` |
| E-09 | `worker_skills`, `journal_entries`, gated reviewable set | `apps/web/lib/company/worker-readiness.ts:41-58` |
| E-10 | `journal_entry_confirmations` where `confirmer_id = auth.uid()` | `apps/web/lib/operations/manager-evidence.ts:44-47` |
| E-11 | **No query.** Derived from 5 company columns | `apps/web/lib/company/company-readiness.ts:44-67` |
| E-12..E-14 | `customer_requests`, `projects`, `project_worker_assignments`, `workers`, `worker_skills`, `worker_professions`, `worker_documents`, `profile_skill_claims`, `worker_languages` | `apps/web/lib/workforce/workforce.ts:20-46`; pure math in `lib/workforce/capacity-model.ts`, `gap-timeline.ts` |
| P-01 | `profiles`, `companies`, skill claims (`count:'exact', head:true`) | `admin/page.tsx:87-105` |
| P-02..P-08 | **`pilot_events`** | `conversation-funnel.ts:88-91` (5000-row cap), `pilot-metrics.ts:111-115` (8000-row cap), `admin/telemetry/page.tsx:85` (200-row cap) |
| P-09 | `pilot_events` 24h windows | `admin/agent-os/page.tsx:78,83,129,134` |
| P-10..P-13 | `worker_professions`+`professions`+`workers`, `worker_skills(verified=true)`, `customer_requests`, `market_rate_averages` | `apps/web/lib/admin/market-analysis.ts:79-86,132-134,175-181` |
| P-14 | `workers`, `companies`, `customer_requests`, `demand_interest_signals` | `launch-signals.ts:52-67` |
| P-15, P-16 | `worker_documents`, `companies`, `booking_requests.status` | `readiness-overview.ts:63-105` |
| P-17, P-18 | `experience_records.moderation_status` / `.dispute_status` | `lib/trust/experience-records.ts:319,348` |
| I-01 | Static registry (10 keys) | `apps/web/lib/intelligence/metric-keys.ts:37-51` |
| I-02 | `customer_requests` in a time window, **no owner/org predicate** | `apps/web/lib/intelligence/intelligence-read.ts:422-426` |
| M-01..M-03 | **TypeScript / JSON literals** | `landing-scenario.ts:211,223,235`; `messages/en.json` |
| M-04..M-07 | **`content/placeholders.ts` registry, `status:"placeholder"`** | `content/placeholders.ts:419,428,922,943,974` |
| M-08 | Static, but each figure carries source · figure date · region · last-checked | `lib/labour-market/evidence.ts:69-112` |
| U-01..U-03 | Would write `ai_runs`; **table not applied to production** | `apps/web/lib/ai/runtime/audit-store.ts:154`; `docs/APPLIED_LEDGER.md:398` |

---

## 3. Real vs placeholder matrix

Classification per the required taxonomy. **A number rendered from a constant is MISLEADING, not FULL.**

| Metric | Verdict | Justification |
|---|---|---|
| W-01..W-04 | **FULL** | Real counts, plain zeros, each tile navigates to the surface it counts (`worker-player-card.tsx:155-184`) |
| W-05 | **FULL** | 6 real binary signals; explicitly not a rating (`readiness.ts:3-13`); missing pillars named to the user |
| W-06..W-11, W-13 | **FULL** | Real rows; honest absence states |
| W-09 bar length | **PARTIAL** | Real counts, but bar width uses a hard-coded absolute denominator `EVIDENCE_SCALE_MAX = 20` (`skill-evidence-chart.tsx:41`, applied `:144`). Defensible and documented (`:20-33`), the exact count is always printed, and it replaced a worse relative scale — but it is still a product constant shaping a user-visible bar. |
| W-12 | **FULL** | Real `journal_entry_confirmations` count; empty state is words, not a zero |
| W-14 | **FULL** | Renders a number only when both formula components exist; otherwise names the missing one (`worker-player-card.tsx:574-585`) |
| W-15, P-17, P-18 | **BLOCKED_BY_W6_PROD_MIGRATION** | All read `experience_records` / `get_experience_counts` from `supabase/migrations/20260802120000_experience_records_v1.sql`, which is not applied. Degrades to `needs_migration` (`lib/trust/experience-records.ts:204-206`) — honest, but the metrics are empty in production today. |
| E-01..E-10 | **FULL** | Real reads, count-gated display |
| E-11 | **PARTIAL** | Real company columns but zero query; a derived band, not a measurement |
| E-12..E-14 | **FULL** | Real composed reads; headcount provenance split into user-entered / system-suggested / confirmed (`planning/page.tsx:382-411`) |
| P-01..P-16, P-19, P-20 | **FULL** | Every number traces to a real query |
| P-06..P-08 | **PARTIAL** | Real data, but aggregated over the **last 200 rows only** while P-02/P-05 use 5000/8000-row windows — presented side-by-side on one page with no statement that the windows differ (`admin/telemetry/page.tsx:85` vs `conversion-funnel.ts:88`, `pilot-metrics.ts:111`) |
| I-01 | **FULL** | Honest registry, guarded (`metric-keys.test.ts:16`) |
| I-02 | **MISLEADING** | See P0-3 — for an admin viewer this card aggregates every tenant's demand and labels it as the viewer's own company demand |
| I-03 | **FULL** | Cohort-floored, privacy-guarded |
| **M-01** | **MISLEADING** | `confidence: 0.86` is a literal rendered as "86%" with no qualifier, while the source comment at `landing-scenario.ts:73-74` claims it is "Derived here from how much the underlying signal actually supports the answer — never a decorative number". That comment is false. |
| **M-02** | **MISLEADING** | Bare unlabelled integers ("Rotterdam 9") rendered as if measured |
| **M-03** | **MISLEADING** | A fabricated person captioned "Best matching person"; the "Demonstration" badge is 100+ lines away at `hero-live-demo.tsx:453` |
| M-04 | **STUB** | Fabricated but disclosed inline: "An example card with illustrative data — not a real person" (`player-card-showcase.tsx:150`) |
| M-05, M-06 | **STUB** | Placeholder registry, wrapped in `ExamplePreviewFrame` ("Example" chip) |
| M-07 | **STUB** | Placeholder OVR 92 + 6 stat bars; visible "Placeholder" marker (`player-card.tsx:135`). Flagged by the repo's own guard as the "PRE-ALPHA FIFA" surface (`lib/guards/fit-not-rating.test.ts:62,69`) |
| M-08 | **FULL** | Static but sourced with provenance — the honest pattern |
| M-09 | **MISLEADING** | A frozen PR number and a "BLOCKED" status on a public page; stale by construction |
| U-01, U-02 | **DEAD** | Computed correctly, then dropped: `ai_runs` not applied (`docs/APPLIED_LEDGER.md:398`), persistence is best-effort and never throws (`audit-store.ts:158-170`), and **zero readers** exist (`grep "ai_runs" apps/web/app apps/web/components` → 0 hits) |
| U-03 | **DEAD** | Same table |
| Business Health 39 metrics | **STUB / MISSING** | See §6 |
| Marketplace liquidity | **MISSING** | See §7 |
| Retention / churn / cohort | **MISSING** | No retention metric exists anywhere. `returnVisitDetected` (`lib/telemetry/funnel-events.ts:69`) is emitted but never aggregated. Every "cohort" hit in the tree is the k-anonymity privacy floor (`lib/intelligence/privacy.ts`, `confidence.ts:30-33`), not a retention cohort. |
| Reliability / no-show / cancellation rate | **MISSING** | Only status enum values named `cancelled` and a raw histogram (`readiness-overview.ts:98-105`) — counts, no denominator, no rate |
| Revenue / margin surfaces | **STUB** | 0/39 computable; predominantly billing-gated, out of scope per the brief |

### Every hard-coded number a user actually sees

| Value | Location | Rendered? |
|---|---|---|
| `0.86` / `0.74` / `0.68` → 86% / 74% / 68% | `apps/web/components/app/market-map/landing-scenario.ts:211,223,235` | **YES** — landing hero, `hero-live-demo.tsx:274` |
| 17 city weights + 9 region intensities | `landing-scenario.ts:111-134,148-166,182-196` | **YES** — `hero-live-demo.tsx:290-295` |
| "14" / "3" / "7", "Jonas P.", "Electrician · Vilnius" | `apps/web/messages/en.json` `landing.hero.previewValue.*`, `previewName`, `previewRole` | **YES** — `hero-live-demo.tsx:336-351` |
| `[3,4,2,0,3,1,2,0,3,2,2,1]`, `evidenceEntries: 23`, `managerConfirmations: 7`, skill counts 9/6/4 | `apps/web/components/marketing/player-card-showcase.tsx:31,57-74,102-104` | **YES** — landing, disclosed |
| `headcount: 8`, `rankedMatches: 47`, `score: 88`, breakdown 92/86/84/90 | `apps/web/content/placeholders.ts:922,925,974,977-980` | **YES** — `/for-companies` |
| `poolSize: 86`, 22/18/15/17/14, active 31 / pending 9 / available 46 | `content/placeholders.ts:943-953` | **YES** — `/for-agencies` |
| `ovr: 92`, `SKL:95 REL:94 SPD:88 SAF:96 ADP:87 TRS:93` | `content/placeholders.ts:419,428` | **YES** — `/for-workers` |
| `75.8`, `46`, `55.6`, `22 / 27`, `1.83M` | `apps/web/lib/labour-market/evidence.ts:69,86,94,103,112` | **YES** — sourced, honest |
| `EVIDENCE_SCALE_MAX = 20` | `apps/web/components/app/player-card/skill-evidence-chart.tsx:41` | **YES** — shapes every skill bar |
| 30-point LCG series, `gapPct: -12`, country intensities 92→53, skill scores 94→70 | `content/placeholders.ts:1038-1103` | **NO** — orphaned (`MarketPulse` has no importer) |
| 11 `ovr` values 88..89 | `content/placeholders.ts:987-997` | **NO** — `DraftBoard` orphaned |
| Live-map intensities 53–91, ticker events, counter cycles 312/319/327/336 | `content/placeholders.ts:205-213,625-684` | **NO** — `LiveMap`, `LiveTicker`, `MarketCounters` all orphaned |

**Negative results, verified:** no `Math.random()` feeds any displayed value (only `lib/auth/oauth-trace.ts:42` and `lib/telemetry/task.ts:66`, both id generation). No numeric fallbacks of the `?? 87` / `|| 4.5` shape exist — every `?? 0` found is a genuine zero-default. No `MOCK_` / `DEMO_` / fixture constant reaches a render path. No `TODO`/`FIXME` in any analytics file.

**Governance note:** `content/placeholders.ts:2-6` mandates that no component inline a fake number — everything must route through the registry. **M-01 through M-04 violate that rule**, inlining their numbers in `landing-scenario.ts` and `player-card-showcase.tsx`. A prior remediation note at `placeholders.ts:658-660` records that `"318K"`/`"1,180"` cycles "overstated scale by ~1000× and are removed" — direct precedent for M-01/M-03.

---

## 4. Chart inventory

**There is no charting library.** `apps/web/package.json:41-57` — no recharts, chart.js, visx, nivo, d3, echarts or tremor. Only `framer-motion`, `leaflet`, and build-time `topojson-client`/`world-atlas`. Every visualization is hand-rolled inline SVG or CSS-width divs.

### 4.1 Real-data charts, reachable (9)

| Chart | File | Export | Rendered at | Data | Empty | Loading | Error |
|---|---|---|---|---|---|---|---|
| EvidenceTimelineChart | `apps/web/components/app/player-card/evidence-timeline-chart.tsx` | `:37` | `worker-player-card.tsx:433`; hosts: `dashboard/journal/page.tsx:717`, `workspace/player-card-result.tsx:129`, `marketing/player-card-showcase.tsx:137` | props ← `evidence-visuals.ts:94` | **YES** `:46-61` | via host `:83` | via host `:93` |
| SkillEvidenceChart | `.../skill-evidence-chart.tsx` | `:77` | `worker-player-card.tsx:437` | props ← `evidence-visuals.ts:140` | **YES** `:93-108` | via host | via host |
| WorkHistoryTimeline | `.../work-history-timeline.tsx` | `:29` | `worker-player-card.tsx:447` | props ← `evidence-visuals.ts:196` | **YES** `:36-54` (returns `null` when fully empty, `:39`) | via host | via host |
| ReadinessRing | `apps/web/components/app/readiness-ring.tsx` | `:34` | `worker-player-card.tsx:302` | props | **NO** — `total===0` silently renders `0/0` (`:59`, `:102`) | no | no |
| MarketPulseBoard | `apps/web/components/app/market-pulse-board.tsx` | `:20` | `admin/market/page.tsx:103` | real aggregates | **YES** ×4 `:59,108,146,179` | no | no |
| ProjectStageGantt | `apps/web/components/app/project-stage-gantt.tsx` | `:22` | `dashboard/projects/[id]/operations/page.tsx:324` | props ← `lib/projects/stage-gantt` | **YES** `:25-36` | no | no |
| CapacityBar | `apps/web/app/[locale]/dashboard/company/planning/page.tsx` | local `:185` | same page `:511-530` | props | no | no | no |
| LabourMarketWorldMap | `apps/web/components/app/labour-market-world-map.tsx` | `:92` | `dashboard/market-map/page.tsx:304` | real reads `:95-101`; layout constants only `:77-86` | per-zone `dataState` `:89-90,119-123` | no | no |
| MarketMap (Leaflet) | `apps/web/components/app/market-map/market-map.tsx` | — | `workspace/market-drilldown.tsx:168` (→ `?result=market`); also landing `hero-live-demo.tsx:457` with scripted data | props | — | — | — |

### 4.2 Placeholder-fed charts (10)

| Chart | File | Data source | Rendered? | States |
|---|---|---|---|---|
| SupplyDemandChart | `apps/web/components/app/supply-demand-chart.tsx:25` | `content/placeholders.ts:1080-1103` (seeded LCG, `gapPct:-12`) | **ORPHANED** — only importer is `marketing/market-pulse.tsx:32`, which has no importer | **none** |
| RegionalHeatmap | `.../regional-heatmap.tsx:14` | `placeholders.ts:1038-1051` | **ORPHANED** | **none** |
| SkillsDemandList | `.../skills-demand-list.tsx:18` | `placeholders.ts:1066-1078` | **ORPHANED** | **none** |
| RecentMatchesFeed | `.../recent-matches-feed.tsx:18` | `placeholders.ts:1104+` | **ORPHANED** | **none** |
| MiniDraftCard | `.../mini-draft-card.tsx:28` | `placeholders.ts:1227` | **ORPHANED** (`DraftBoard` unimported) | **none** |
| MarketMoment | `apps/web/components/marketing/market-moment.tsx:28` | coordinates hard-coded `:43-53` | **ORPHANED** — and `tests/e2e/pr-i-reality-landing.spec.ts:57` asserts its testid is visible | **none** |
| AgencyPoolPreview | `apps/web/components/app/agency-pool-preview.tsx:7` | `placeholders.ts:1213` | **LIVE** `/for-agencies` `:46` | **none** |
| CompanyScoreRing | `.../company-score-ring.tsx:37` | placeholder via `demand-preview-card.tsx:50` | **LIVE** `/for-companies` `:48` | **none** |
| OVRRing | `.../ovr-ring.tsx:27` | `placeholders.ts:419` via `player-card.tsx:140` | **LIVE** `/for-workers` `:46` | **none** |
| HeroLiveDemo confidence meter | `apps/web/components/marketing/hero-live-demo.tsx:63` | `landing-scenario.ts:211,223,235` | **LIVE** landing `page.tsx:62` | phase machine only, no data states |

### 4.3 Orphaned visualization components (zero import sites)

`components/app/live-map.tsx:40`, `live-world-map.tsx:48`, `live-ticker.tsx:10`, `market-counters.tsx:23`, `marketing/market-pulse.tsx:10`, `marketing/draft-board.tsx`, `marketing/market-moment.tsx:28`, plus the generated `world-geo.ts` / `europe-geo.ts` consumed only by the two dead maps. All are frozen-but-retained by `apps/web/lib/guards/landing-freeze.ts:29,30,32,33,50,53,54`.

### 4.4 Empty / loading / error coverage summary

- **Empty state:** 5 of 9 real charts have one (EvidenceTimeline, SkillEvidence, WorkHistory, MarketPulseBoard, ProjectStageGantt). **ReadinessRing has none** and silently renders `0/0`. **None of the 10 placeholder-fed charts has any state handling at all.**
- **Loading + error:** exist in exactly **one** place in the entire product — `apps/web/components/app/workspace/player-card-result.tsx:79-96` (`player-card-loading` `:83`, `player-card-error` `:93`).

---

## 5. Player-card analysis

**Verdict: FULL. This is real professional analytics, not decorative widgets — and it is the only surface in the product that meets that bar.**

Evidence:

- Three genuine charts driven by pure, unit-tested derivers over already-fetched real rows: `apps/web/lib/player-card/evidence-visuals.ts:94` (12-month bucketing), `:140` (per-skill record counts), `:196` (time-band placement). The honesty contract is written into the file header at `:18-26`: zero months are real zeros, never smoothed; skills with no evidence keep `entries: 0`; undated engagements are counted separately rather than invented onto the timeline; "nothing here produces a score, a rating, a rank or a tier of the person."
- The card refuses to duplicate itself: `worker-player-card.tsx:247-248` removes from the text list every engagement the time band already placed, so no fact is stated twice.
- Rows that cannot name where the work happened are dropped rather than padded with a placeholder noun (`:231-233`).
- Every counter tile is a real navigation target to the surface it counts (`:155-184`) — no dead numbers.
- Trust signals are deliberately *not* advertised: `:257-258` documents the "silent-trust rule" (no gold confirmation ring on the self-view), and `:384-386` removes the green "verified" glow.
- Guard coverage is real: `apps/web/lib/guards/player-card-visualizations.test.ts:122` forbids `OvrRing`, `trust_score` and `opportunityScore` in the card; `player-card-premium-complete.test.ts:72` pins the reputation empty-state expression; `:78` asserts `OvrRing` never appears in `worker-player-card.tsx`.

**Defects found on the card:**

1. `ReadinessRing` has a **hard-coded English `aria-label`** in a six-locale product: `apps/web/components/app/readiness-ring.tsx:70` — `` aria-label={`Readiness: ${met} of ${total} signals met`} ``. Every other string on the card is resolved through `buildPlayerCardLabels`. Screen-reader users in LT/DE/NL/PL/RU get English.
2. `ReadinessRing` has **no zero state**: `:59` computes `frac = 0` when `total === 0` and `:102` prints `0/0` in the ring centre — a verdict-shaped rendering of an absence.
3. `EVIDENCE_SCALE_MAX = 20` (`skill-evidence-chart.tsx:41`) is a hard-coded denominator shaping every bar. Well-reasoned and documented (`:20-41`), the exact count always prints, and it was introduced to fix a worse relative scale — but it remains a product constant a user cannot see.

**The FIFA card is a different component and is NOT the Player Card.** `apps/web/components/app/player-card.tsx` + `ovr-ring.tsx` render OVR 92 and six stat bars from `content/placeholders.ts:419,428` on the public `/for-workers` page. The repo's own guard names it the "PRE-ALPHA FIFA" surface (`lib/guards/fit-not-rating.test.ts:62,69`). It is disclosed with a visible "Placeholder" marker (`player-card.tsx:135`) but it is the strongest rating-shaped artefact still reachable by a real visitor.

---

## 6. Check 5 — does the worker surface rename evidence into reputation?

**Verdict: NO at the user-visible layer; the internal identifier is misleading but the guard corpus holds.**

- The internal field is named `reputation*` (`worker-player-card.tsx:81-84`, `labels.ts:121-127`) and its value is `card.managerConfirmations` — i.e. **a count of evidence confirmations**. On the naming alone this is exactly the forbidden rename.
- But the **rendered** copy is honest. `apps/web/messages/en.json`:
  - `playerCard.reputationLabel` = **"Response from others"** — not "Reputation".
  - `playerCard.reputationValue` = "{count} of your records marked as accurate" — a record count, explicitly.
  - `playerCard.reputationEmpty` = "Nobody has marked anything on your records yet." — an absence in words, never a zero as a verdict.
  - `playerCard.reputationHint` = "Real manager or client responses only. **No overall human score.**"
- No stars: `lib/guards/experience-records-migration.test.ts:78` — "sentiment is binary — no stars, no numbers, no neutral". `lib/guards/marketplace-no-fake-no-payment.test.ts:21` bans `rating|review|stars?` repo-wide on marketplace surfaces.
- No general trust score: `lib/guards/fit-not-rating.test.ts:74` bans `trust_score|profile_strength|overall_score|person_score|worker_rating|company_rating|global_score|human_score`. `lib/guards/w5-live-profile.test.ts:129-135` asserts no W5 code reads the dormant legacy `trust_score` column (which still exists in the type mirror at `apps/web/lib/supabase/types.ts:987`).
- No fraud signal as verdict: no `fraudScore`/`riskScore` exists outside guard denylists (`lib/guards/document-centre.test.ts:211`, `project-operations-centre.test.ts:209`).

**Residual risk (P2):** the identifier `reputation*` is one careless refactor away from becoming a visible label. The i18n key names are `playerCard.reputationLabel` etc., so a future translator or a locale file edit could re-title the block "Reputation" without touching any guarded file.

---

## 7. Checks 6 & 7 — employer analytics and marketplace liquidity

### 7.1 Employer analytics — MISSING

There is **no** employer analytics surface. Verified absences: no time-to-fill, no applications-received rate, no response rate, no offer-acceptance rate, no aggregate pipeline funnel, no hiring-velocity metric. `apps/web/lib/employer/**` does not exist (only `lib/company/employer-company-context.ts`).

What the company dashboard renders instead is **operational counts** (E-01..E-11 in §1.2) — all real, all useful, none of them analytics. `apps/web/app/[locale]/dashboard/company/page.tsx` is 1280 lines and its entire numeric content is the counter re-use listed in §2.

**Two exceptions worth protecting:**
- **Workforce planning (`dashboard/company/planning`) is genuine employer analytics — FULL.** Required vs available headcount, shortfall in people and hours, coverage %, risk level and risk date, per-month coverage bars, missing-skill chips (`planning/page.tsx:350-455`, `:511-530`), composed from nine real reads in `lib/workforce/workforce.ts:20-46` with pure computation in `capacity-model.ts` / `gap-timeline.ts`. It even splits headcount provenance into user-entered / system-suggested / confirmed (`:382-411`).
- **Per-candidate pipeline stage** exists at `dashboard/company/scouting/page.tsx:511-584`, but there is **no stage-count rollup for the employer** — `stageCounts` exists only in `lib/crm/pipeline.ts:68,195` and is consumed only by the admin page `admin/pipeline/page.tsx:124`.

### 7.2 Marketplace liquidity — MISSING

**No liquidity metric exists.** No fill rate, no match rate, no time-to-match, no unfilled-demand measure, no request→booking conversion. A grep for `no_results|zero_results|zeroResults|emptySearch` across `lib/`, `components/`, `app/` returns **nothing** — zero-result searches are not tracked.

The closest artefacts, all admin-only and none a ratio:

- `apps/web/lib/admin/market-analysis.ts:156-171` — `countryGaps`, the **only** supply/demand juxtaposition in the codebase, and deliberately two side-by-side counts rather than a ratio. Rendered `market-pulse-board.tsx:141-171` with a warning tone when `supplyWorkers === 0` (`:157-159`).
- `apps/web/lib/admin/readiness-overview.ts:98-105` — `bookingsByStatus`, a raw histogram: counts, no denominator, no rate.
- `apps/web/lib/market/thermometer.ts:34-56` — a **price** signal, not liquidity.

**The raw material exists and is unused.** `demand_interest_signals` records interested / reviewed / contacted / withdrawn per (request, worker) at `lib/opportunities/interest.ts:116,149,190,294` and `lib/scouting/scouting.ts:246`. Nothing computes a rate from it. Likewise `FUNNEL_EVENTS.bookingAccepted` / `bookingDeclined` exist (`lib/telemetry/funnel-events.ts:83-84`) but appear in **neither** `FUNNEL_STAGES` nor `TTV_VALUE_EVENTS` — no booking conversion rate is computed anywhere.

---

## 8. Check 8 — is there ONE canonical KPI catalogue?

**No. There are at least six competing catalogues, and the largest one is not on `main`.**

| Catalogue | Location | Size | On `main`? |
|---|---|---|---|
| `INTELLIGENCE_METRIC_KEYS` — self-described as "ONE machine-readable list of every observation metric the platform actually represents today" (`:2-8`) | `apps/web/lib/intelligence/metric-keys.ts:37-51` | 10 | **YES** |
| `FUNNEL_EVENTS` — the platform's live measurement vocabulary | `apps/web/lib/telemetry/funnel-events.ts:24-85` | 40 events | **YES** |
| `FUNNEL_STAGES` + derived rates | `apps/web/lib/admin/conversion-funnel.ts:29-36`, `:130-155` | 8 + ~5 | **YES** |
| TTV definition | `apps/web/lib/admin/pilot-metrics.ts:41-52` | 2 start + 4 value events | **YES** |
| Admin "Overview KPIs" band | `apps/web/app/[locale]/dashboard/admin/page.tsx:58,506` | 8 per `docs/owner/mega_sprint_v2_merge_report.md:69` | **YES** |
| **Business Health `METRICS`** | `apps/web/lib/commercial/business-health.ts:134-279` | **39** | **NO** — branches `feat/business-health-engine-v1`, `feat/canonical-usage-cost-event-model-v1` only |
| `BUSINESS_HEALTH_FEEDS` — a partial restatement of the 39 | `apps/web/lib/telemetry/usage-cost-event-model.ts:400-423` | 22 mappings | **NO** |

`metric-keys.ts:2-8` claims to be the single list; it covers 10 observation metrics and none of the funnel, KPI or business-health domains. **The canonical-catalogue claim is false on its own terms.**

---

## 9. Check 9 — the "39 metrics" document, exact wired count

### Location

- **`docs/product/business-health-engine-v1.md:281`** — `| Metrics defined | **39** (6 revenue · 5 unit-economics · 3 margin · 12 cost · 6 LMC · 6 adoption · 1 composite) |`
- **`docs/architecture/usage-cost-event-model-v1.md:33`** — "39 metrics defined, **0 computable**; 26 blocked purely by missing collectors"
- Machine half: **`apps/web/lib/commercial/business-health.ts:134`** — `export const METRICS`, exactly 39 `m(...)` entries at `:136-279`, pinned in CI by `apps/web/lib/guards/business-health-gate.test.ts:288`.

### **Neither file exists on `main` / `audit/w14-analytics-kpi`.** Both live only on the unmerged branches `feat/business-health-engine-v1` (commit `caedf851`, PR #897) and `feat/canonical-usage-cost-event-model-v1` (PRs #898/#899). Read via `git show <branch>:<path>`.

### Exact wired-vs-unwired count

# **0 of 39 are wired to real data.**

Two independent confirmations:

1. The document's own tally, `docs/product/business-health-engine-v1.md:282-285`:
   - Computable today: **0**
   - Blocked by a missing collector: **26**
   - Blocked by an owner decision only: **5**
   - Computable once activity exists: **8**
2. `docs/architecture/usage-cost-event-model-v1.md:33` states the same 0/39, and defines the event model's success criterion as feeding exactly those 26.

**Plus a third reason the count is 0 even on the branch:** 5 of the 12 declared data sources are marked MISSING at `business-health.ts:62-76` — `ai_runs`, `usage_events`, `infrastructure_billing`, `marketing_spend`, `stripe_charges`. And `ai_runs` — the one source the in-scope cost metrics depend on — is **not applied to production** (`docs/APPLIED_LEDGER.md:398`, "HUMAN GATE: do NOT apply without explicit owner OK").

### Per-metric status

Metrics 1–14, 26–35, 37, 39 are revenue / margin / LMC / subscription metrics that depend on `stripe_charges`, `billing_subscriptions`, `lmc_*` or `marketing_spend`. **Per the audit brief these touch billing — noted and skipped.** Their status is uniformly *not computable*: the source is MISSING or the metric is `blockedBy` an owner decision (MOD-01, MOD-09, MOD-13/14, MOD-20).

The **in-scope (usage/cost) subset — 13 metrics** — with status:

| # | code | `business-health.ts` line | Declared inputs | Status |
|---|---|---|---|---|
| 11 | `acpu` | `:178` | `usage_events`, `infrastructure_billing`, `profiles` | **UNWIRED** — 2 of 3 sources MISSING |
| 15 | `cost_total` | `:198` | `usage_events`, `infrastructure_billing` | **UNWIRED** — both MISSING |
| 16 | `cost_ai` | `:202` | `ai_runs` | **UNWIRED** — source MISSING; table not applied to prod |
| 17 | `cost_storage` | `:206` | `infrastructure_billing`, `usage_events` | **UNWIRED** |
| 18 | `cost_api` | `:209` | `usage_events`, `infrastructure_billing` | **UNWIRED** |
| 19 | `cost_email` | `:212` | `usage_events`, `infrastructure_billing` | **UNWIRED** |
| 20 | `cost_ocr` | `:214` | `usage_events` | **UNWIRED** |
| 21 | `cost_maps` | `:216` | `usage_events` | **UNWIRED** |
| 22 | `cost_search` | `:218` | `usage_events`, `infrastructure_billing` | **UNWIRED** |
| 23 | `cost_voice` | `:220` | `usage_events` | **UNWIRED** |
| 24 | `cost_video` | `:222` | `usage_events`, `infrastructure_billing` | **UNWIRED** |
| 25 | `cost_infrastructure` | `:224` | `infrastructure_billing` | **UNWIRED** |
| 36 | `top_cost_features` | `:263` | `usage_events`, `ai_runs`; blocked MOD-17 | **UNWIRED** + owner-gated |
| 38 | `top_ai_consumers` | `:271` | `ai_runs` | **UNWIRED** |

*(14 rows: 13 pure cost/usage plus `acpu`, the one unit-economics metric whose blocker is a usage collector rather than billing.)*

**Classification of the whole catalogue: `STUB`** — 39 metric definitions, 8 warning rules (`business-health.ts:492`), 8 score components (`:567`), a 16-field CEO dashboard model (`business-health-engine-v1.md:200-203`), all pinned by CI tests, and **not one number.** The cost subset is additionally `OWNER_GATED` (the `ai_runs` migration) and out-of-reach on `main`.

---

## 10. Check 10 — usage/cost: collected and used, or collected and dropped?

**Two different answers for two different pipelines.**

### Funnel/task telemetry — COLLECTED AND USED (FULL)

- Real insert into `public.pilot_events`: `apps/web/lib/telemetry/actions.ts:180`.
- ~100 emit call sites: 47 direct `trackFunnel`, 9 via `event={...}` props, 39 `recordEvent`, 4 task lifecycle, 1 server-side.
- Six readers: `admin/telemetry/page.tsx:85`, `lib/admin/conversion-funnel.ts:88`, `lib/admin/pilot-metrics.ts:111`, `admin/agent-os/page.tsx:78,83,129,134`, plus two CLI scripts (`scripts/generate-activation-report.ts:122`, `scripts/generate-pilot-owner-brief.ts:97-113`).
- No feature flag, no env gate — emission is unconditional. `isNonProductionHost()` (`task.ts:200-208`) only *labels* preview events (`:223`); the reader filters them (`conversion-funnel.ts:104`).
- Table + RLS: `supabase/migrations/0020_pilot_events.sql:31-79` (append-only; SELECT `using (public.is_admin())` at `:72-73`); anon insert grant `20260702150000_pilot_events_anon_insert_grant.sql:24`; service-role read `20260702200000_..._report_read.sql:29-31`.
- A prior bug is documented in place at `actions.ts:165-170`: a chained `.select()` made PostgREST issue `INSERT … RETURNING`, hit the admin-only SELECT policy, and **silently dropped all non-admin telemetry in production**. Fixed (insert-only).

**Losses within this pipeline (DEAD / PARTIAL):**

- **2 declared events are never emitted:** `dashboard_viewed` (`funnel-events.ts:48`) and `first_action_card_viewed` (`:49`).
  - `dashboard_viewed` is worse than dead: `apps/web/lib/conversation/action-registry.ts:326` sets `telemetryEvent: E.dashboardViewed`, and the guard `apps/web/lib/guards/activation-funnel-telemetry.test.ts:256-260` asserts that file "is the surviving `dashboard_viewed` emitter". **It is not an emitter.** The `telemetryEvent` field (declared `action-registry.ts:78`) is read by nothing at runtime — the entire column of the action registry is inert metadata, and the guard passes on a substring match, not on behaviour.
- **3 metadata keys are silently discarded** by the allowlist at `actions.ts:217` (`ALLOWED_METADATA_KEYS`, `:62-94`): `template` (`components/app/journal-entry-composer.tsx:1036`), `mode` (`:1911`), `outcome` (`:896`). Those events land with empty metadata.
- `stepTask` and `abandonTask` are exported (`task.ts:138`, `:178`) and **never called** — dead API.
- Ledger drift: all three `pilot_events` migrations are live in production but have **no row** in `docs/APPLIED_LEDGER.md` (drift notice at `:19-30`; corroborated `docs/audits/labourmarketai-functional-reality-matrix-v1.md:224,226`).

### AI usage/cost — COLLECTED AND DROPPED (DEAD)

Instrumentation is complete and correct:
- Token capture per provider: `lib/ai/runtime/providers/anthropic.ts:115-116`, `openai.ts:103-104`, `gemini.ts:108-109`, `xai.ts:97-98`.
- USD cost: `lib/ai/runtime/model-pricing.ts:29,53`; attached at `lib/ai/run-agent.ts:287-301`.
- Persistence: `lib/ai/runtime/audit-store.ts:154` → `ai_runs`.
- Table: `supabase/migrations/20260714150000_ai_runs_audit_v1.sql:46` with `estimated_cost_usd` `:67`, `actual_cost_usd` `:68`, admin-only SELECT `:96`, service-role insert only `:106`.

**Three compounding reasons nothing survives:**
1. **The migration is not applied.** `docs/APPLIED_LEDGER.md:398` — Deferred, "HUMAN GATE: do NOT apply without explicit owner OK". Confirmed again at `:371`. Every `persistAiRunAudit` call therefore console-errors and returns false.
2. **The write is best-effort and never throws** (`audit-store.ts:158-170`) — the failure is invisible to the caller.
3. **There is no reader.** `grep -rn "ai_runs" apps/web/app apps/web/components` → **zero hits**. No admin cost dashboard exists; `admin/billing/` does not query it. Even if the migration were applied, the only consumer would be `countAiRunsTodayBestEffort` (`:185`), a budget counter, not a report.

*(Additionally `AI_PROVIDER_MODE` defaults to `disabled` at `apps/web/lib/env.ts:83`, so the pipe is doubly dormant — but that is a config state, not the defect.)*

---

## 11. Check 11 — admin-metric leakage to non-admins

**Verdict: no leak found. The gate is sound but structurally thin.**

- **Structural gate:** `apps/web/app/[locale]/dashboard/admin/layout.tsx:31` — `await requireSuperadmin(locale)` covers every `/[locale]/dashboard/admin/*` page. Implementation `apps/web/lib/auth/superadmin.ts:91-105`, dual signal (`profiles.active_role='admin'` OR a `profile_roles` row) at `:69-79`. Fails closed on a profile read error (`:53-55`).
- **Defence in depth:** all 22 admin pages call `requireSuperadmin` again; the analytics-relevant ones at `admin/market/page.tsx:40`, `admin/telemetry/page.tsx:53`, `admin/page.tsx:76`, `admin/agent-os/page.tsx:50`, `admin/pipeline/page.tsx:65`, `admin/pilots/page.tsx:29`, `admin/league/page.tsx:28`, `admin/readiness/page.tsx:21`.
- **Middleware does NOT role-gate admin.** `apps/web/middleware.ts:83` — `REQUIRES_AUTH = ["/dashboard", "/onboarding", "/cv"]` is authentication only. Not a hole today because the RSC layout is fail-closed, but the middleware is not part of the admin gate.
- **No admin aggregate is imported by a non-admin page.** `market-pulse-board.tsx:7-8` and `admin-launch-board.tsx:3-4` are `import type` only; `lib/crm/pipeline.ts:30` and `lib/staffing/candidate-pool.ts:22` are consumed solely by admin pages.
- **No API route returns a platform aggregate without a check.** All 7 routes verified: `dashboard-search/route.ts:28-36` (401 + RLS), `professions/[professionId]/skills/route.ts:27-34`, `workers/[workerId]/skills/route.ts:26-32` (401 + `ownsWorker` 403), `waitlist/route.ts` (anon insert, rate-limited `:29-38`), and three non-aggregate billing/cv routes.
- **Every service-role read in `lib/admin/` is preceded by an explicit `isSuperadmin()`:** `launch-readiness.ts:134` before `:135`, `company-need-intakes.ts:166/197` before `:168/210`, `billing-actions.ts:42/72` before `:25`.
- **RLS backstop:** `pilot_events_select using (public.is_admin())` (`supabase/migrations/0020_pilot_events.sql:72-73`) means even a bypassed page gate returns zero telemetry rows.

**Latent defects (not leaks today):**

1. `apps/web/lib/trust/experience-records.ts:315-340` — `listModerationQueue()` has **no admin check of its own** and hardcodes `isAuthor: false` at `:338`. Under RLS a non-admin caller would get their *own* authored submissions mislabelled as "written about me". Only caller today is `admin/page.tsx:137`.
2. **The widest real lever is `is_employer()`, not the admin gate.** `public.is_employer()` = `profiles.active_role in ('company','agency')` (`supabase/migrations/0003_multi_role.sql:101-107`), and it appears in `workers_select` (`0001_initial_schema.sql:421-422`), `worker_skills_select` (`:451-453`) and `worker_professions_select` (`0008:79-85`). **Any user who switches their active role to `company` or `agency` can read the entire worker table and reconstruct the `market-analysis.ts` supply aggregate themselves** — even though the admin page is closed to them. This is a pre-existing platform decision, not a W14 regression, but it makes the admin-only framing of P-10/P-12 partly cosmetic.
3. `platform_skill_aggregates_select using (true)` (`supabase/migrations/0013_work_journal_m1.sql:317`) — platform-wide skill aggregates readable by anyone authenticated.

---

## 12. Check 12 — organization scope on analytics queries

**Verdict: PARTIAL — the platform is profile-scoped, not org-scoped, and one surface actively misreports because of it.**

- **`organizations_select using (true)`** confirmed at **`supabase/migrations/0013_work_journal_m1.sql:327`**. Writes are closed (`:328`, `organizations_write_admin`). Cross-referenced as deliberately unchanged at `supabase/migrations/20260802160000_org_membership_revocation_v1.sql:97`.
- **No `GRANT`/`REVOKE` on `public.organizations` exists anywhere in `supabase/migrations/`.** With Supabase's default public-schema grants plus `using (true)`, the org directory is readable by every authenticated session and plausibly by `anon`. **I could not verify the effective grant without DB access** — this needs `\dp public.organizations`.
- **`organization_members` does not exist.** Zero `from("organization_members")` hits. Membership runs through `engagement_contexts` (`0013:332-334`), scoped `profile_id = auth.uid() or manages_organization(organization_id) or is_admin()`.

**Aggregates missing an org predicate:**

1. **`apps/web/lib/intelligence/intelligence-read.ts:422-426` — `getCompanyDemandIntelligence()`.** Selects `customer_requests` with only `.gte("created_at", windowStart).limit(500)`. **No `profile_id`, no `company_id`, no `organization_id` filter.** Rendered on two **non-admin** pages: `app/[locale]/dashboard/intelligence/page.tsx:8` and `app/[locale]/dashboard/company/planning/page.tsx:6`. Two consequences:
   - For a normal company user it is safe only by accident of RLS (`customer_requests_select` scopes to `profile_id = auth.uid()`, `supabase/migrations/0028_customer_requests.sql:70-71`).
   - **For an admin viewer the same policy's `or public.is_admin()` branch fires, so the card silently aggregates every tenant's demand and presents it as the viewer's own company demand intelligence.** That is a MISLEADING metric, on a non-admin surface, produced by an admin's own elevated read.
   - It is profile-scoped, so a co-owner or manager of the same organization sees **none** of the org's requests.
2. `apps/web/lib/buyer/admin-request-review.ts:84-88` — `customer_requests` with no filter (admin page only).
3. `apps/web/lib/demand/demand-drafts.ts:252-257` — `getDemandDraftCounts()` counts drafts with no owner filter; comment at `:250-251` explicitly delegates to RLS.
4. `apps/web/lib/pipeline/candidate-pipeline-facts.ts:72-76` and `apps/web/lib/projects/operations-centre.ts:152-155` — `booking_requests` filtered by `.in("worker_id", …)` only. RLS (`20260613100100_booking_requests.sql:76-83`) is `owner_id = auth.uid()`-scoped, i.e. **another manager in the same org sees none of the org's bookings**.

**Correctly org-scoped, for contrast:** `apps/web/lib/workforce/workforce.ts:160-186` resolves owned orgs then `.or("company_id.eq.…,organization_id.in.(…)")`; `lib/company/project-context.ts:33-34`; `lib/projects/operations.ts:99,139,163,201`.

**Cannot verify without the DB:** the body of the SECURITY DEFINER RPC `project_position_salary_avg` (called at `apps/web/lib/market/thermometer-data.ts:94-97`). Its definition is not present in `supabase/migrations/`; whether its sample scoping leaks other workers' salaries is **unverified**.

---

## 13. Checks 13 & 14 — mobile usability, accessibility, chart states

### Accessibility

**Good:**
- `evidence-timeline-chart.tsx:85-86` — `role="img"` + localized `aria-label`; axis labels live in HTML (`:133`, `aria-hidden`) so they never distort with the SVG, and alternate labels hide below `sm` (`:139`) rather than overlapping.
- `skill-evidence-chart.tsx:135` — `aria-label` on the list; the exact count is printed as text beside every bar (`:152-156`), so the bar is redundant encoding and a screen reader loses nothing.
- `work-history-timeline.tsx:76-77` — `role="img"` + `aria-label`; decorative layers `aria-hidden` (`:80`, `:126`, `:141`).
- `skill-evidence-chart.tsx:178` — drill-down links carry `min-h-[2.75rem]` and a visible focus ring.
- `planning/page.tsx:196-197` — `CapacityBar` has `role="img"` + `aria-label`.
- `market-pulse-board.tsx:49,176` — icons correctly `aria-hidden`; the bar widths are decorative because the counts are rendered as text.

**Defects:**
- **`apps/web/components/app/readiness-ring.tsx:70` — hard-coded English `aria-label`** in a six-locale product (P1; see §5).
- `market-pulse-board.tsx` bar spans (`:90-96`, `:128-134`) carry no `aria-hidden`; screen readers will announce empty elements between the real numbers. Cosmetic (P2).
- The 10 placeholder-fed charts (§4.2) have **no** state handling and, in the four live cases, no `role`/`aria-label` on the meters at all.

### Mobile usability

**Good:** `worker-player-card.tsx:429-430` (`grid gap-3 lg:grid-cols-2` — charts stack on a phone), `:450` (`grid-cols-2 sm:grid-cols-4`), `:518` (`sm:grid-cols-2`); `evidence-timeline-chart.tsx:84` (`h-20 w-full sm:h-24`); `skill-evidence-chart.tsx:199` (legend stacks below `sm`); `:149` (`line-clamp-2 min-w-0` prevents long skill names blowing out the row).

**Defects (all P2, all admin surfaces):**
- **`apps/web/app/[locale]/dashboard/admin/market/page.tsx:182`** — a 4-column supply table, `className="w-full border-collapse text-sm"`, **no `overflow-x-auto` wrapper**. Will overflow the viewport at 375px.
- **`apps/web/app/[locale]/dashboard/admin/market/page.tsx:235`** — same defect, 3-column demand table.
- **`apps/web/app/[locale]/dashboard/admin/telemetry/page.tsx:385`** — task-completion table with no overflow wrapper. (The recent-events table at `:454` *does* have one — `overflow-x-auto` — so the omission at `:385` is an inconsistency, not a house style.)

### Chart empty / loading / error states

Summarised in §4.4. Headline: **loading and error states exist in exactly one file in the entire product** (`components/app/workspace/player-card-result.tsx:79-96`). Every other chart — including all five admin/company real-data charts — renders a server component with no error boundary of its own.

### The four hollow `?result=` panels

`apps/web/lib/conversation/result-registry.ts` registers 9 results, **all** with `dataReadiness: "real"` (type at `:85`; entries at `:118,127,136,145,165,186,194,202,246`). `canRenderInline()` (`:303-307`) returns true whenever readiness is `"real"` and the context matches. But `apps/web/components/app/workspace/result-body.tsx:138-190` implements only **five** renderers — `opportunities`, `market`, `player-card`, `calendar`, `experiences`.

Therefore `journal` (`:127`), `project` (`:186`), `evidence` (`:194`) and `invoice` (`:246`) **bypass the honest fallback block** at `result-body.tsx:98-114` (which carries the "open the full screen" button) and land in the `default` branch at `:184-189`, rendering only `<p data-testid="result-body-pending">` — **no data and no route escape**. The registry's own doctrine at `:296-302` ("an unverified result is NOT hidden — they still reach the working screen through `advancedRoute`") is defeated for exactly these four. Classification: **STUB**.

Related: `resultForAction` is first-match-wins (`:278`), and both `journal` and `invoice` list `worker.log-work`, so `invoice` is unreachable except by a hand-typed `?result=invoice`.

---

## 14. Check 3 — why did the charts disappear? RENDERER, not query, not feature gate.

**Root cause identified at commit level.**

`apps/web/components/app/supply-demand-chart.tsx` (the product's only supply/demand line chart) is imported by exactly one file, `apps/web/components/marketing/market-pulse.tsx:6`, rendered at `:32`. `MarketPulse` was rendered on the landing page — and was **deleted from the render list**, not gated and not broken:

```
$ git show 0f06be13 -- "apps/web/app/[locale]/(marketing)/page.tsx"
-import { DraftBoard } from "@/components/marketing/draft-board";
-import { MarketPulse } from "@/components/marketing/market-pulse";
-      <DraftBoard />
-      <MarketPulse />
```

Commit `0f06be13` = **"Owner visual acceptance 2026: P0 fixes, chat-first IA, Player Card projection, landing rebuild (#919)"**. The replacement comment left in place at `page.tsx:195-196` states the reasoning: *"DraftBoard and MarketPulse (interior dashboards re-rendered as brochure)"*.

Removing the host orphaned four charts in one commit — `SupplyDemandChart`, `RegionalHeatmap`, `SkillsDemandList`, `RecentMatchesFeed` — plus `MiniDraftCard` via `DraftBoard`. None of them was deleted; all five still compile, still have their placeholder data, and have **zero render path**.

This is recorded in the repo's own traceability file as **finding A-13**:

> `docs/owner-goals/owner-visual-acceptance-traceability-2026.md:98` — "**Etapas PAŠALINO vienintelę produkto duomenų vizualizaciją iš visų owner-visible paviršių.** `SupplyDemandChart` importuojamas tik iš `market-pulse.tsx`; `MarketPulse` išimtas iš landing PR #919… Chart bibliotekos `package.json` nėra." Status: **ATVIRA — pirmas prioritetas**.

A second, independent deletion happened at commit **`c5e129f6`** ("ARCHITECTURE CONSOLIDATION v1 — 11 orphaned modules removed", #911), which deleted `apps/web/components/ui/Sparkline.tsx` and `apps/web/components/ui/Stat.tsx` outright as "orphaned".

**Partial recovery:** commit `51a78d6e` ("feat(card): §5.2 Premium Player Card — real charts from real rows, one canonical component (#923)") created the three player-card charts that are today the product's only real-data visualizations on a worker-visible surface. The repo now explicitly ring-fences them — `docs/product/LABOURMARKETAI_CANONICAL_COMPONENT_MAP.md:23`: "**NELIESTI** — ką tik atkurti po A-13", and risk R3 at `:53` warns that Player Card consolidation "yra tiksliai ta operacija, kuri A-13 metu sunaikino" the charts.

**Conclusion for check 3:** the cause was **render-site removal during a UI consolidation** — the chart components, their data plumbing and their placeholder feeds were all left intact and working. No query broke. No feature gate was introduced. `git log --diff-filter=D --name-only -- "*chart*"` returns **nothing**: not one file with "chart" in its name was ever deleted.

---

## 15. P0 / P1 / P2 findings

### P0-1 — Landing renders an undisclosed AI "confidence" percentage from a literal, and the code comment lies about it — **MISLEADING**

- `apps/web/components/app/market-map/landing-scenario.ts:211,223,235` → `confidence: 0.86 / 0.74 / 0.68`
- Rendered at `apps/web/components/marketing/hero-live-demo.tsx:274` — `{Math.round(scenario.confidence * 100)}%`, `data-testid="hero-confidence"`, plus a meter bar at `:267`
- The source comment at `landing-scenario.ts:73-74` claims the value is *"Derived here from how much the underlying signal actually supports the answer — never a decorative number."* **It is a literal.**
- The only mitigation is a "Demonstration" badge at `hero-live-demo.tsx:453`, ~180 lines away in the DOM from the number.
- Not covered by any existing landing-honesty guard (`lib/guards/public-no-fake-claims.test.ts`, `public-evidence-integrity.test.ts`, `fit-not-rating.test.ts`, `landing-freeze.ts`).

**Failure scenario:** a prospective employer lands on the homepage, sees "Where are electricians needed now? … **86% Confidence**", and reasonably concludes the platform has a working confidence model over real supply data. It has neither. If that visitor becomes a paying pilot and later discovers the number was a hard-coded `0.86`, every other number the product shows them — including the honest ones — becomes suspect. `content/placeholders.ts:658-660` records that this exact class of defect ("overstated scale by ~1000×") has already required a public remediation once.

### P0-2 — AI usage and cost are computed and thrown away — **DEAD**

- Tokens captured (`lib/ai/runtime/providers/anthropic.ts:115-116` + 3 siblings), USD computed (`lib/ai/runtime/model-pricing.ts:53`, `lib/ai/run-agent.ts:287-301`), write attempted (`lib/ai/runtime/audit-store.ts:154`).
- `ai_runs` is **not applied to production** (`docs/APPLIED_LEDGER.md:398`, `:371`).
- The write is best-effort and never throws (`audit-store.ts:158-170`) — the failure is silent.
- **Zero readers:** `grep -rn "ai_runs" apps/web/app apps/web/components` → 0 hits.

**Failure scenario:** AI features are switched on for a pilot. Every run computes its own cost, fails to persist it, and logs an error nobody reads. At the end of the month there is no per-feature, per-user or per-model cost attribution — the only available number is the aggregate provider invoice. `cost_ai`, `top_cost_features`, `top_ai_consumers` and `acpu` (4 of the 39) remain permanently uncomputable, and the `AI_DAILY_RUN_BUDGET` guard (`audit-store.ts:185`) silently counts zero, so the budget cap does not bind.

### P0-3 — `getCompanyDemandIntelligence` has no owner predicate; for an admin it cross-aggregates every tenant — **MISLEADING / cross-org**

- `apps/web/lib/intelligence/intelligence-read.ts:422-426` — `customer_requests` selected with only `.gte("created_at", …).limit(500)`.
- Rendered on **non-admin** pages: `app/[locale]/dashboard/intelligence/page.tsx:8`, `app/[locale]/dashboard/company/planning/page.tsx:6`.
- Safety depends entirely on `customer_requests_select` (`supabase/migrations/0028_customer_requests.sql:70-71`), whose second branch is `or public.is_admin()`.

**Failure scenario:** an operator with an admin role opens `/dashboard/company/planning` to check a customer's workforce plan. The demand-intelligence card silently returns *every tenant's* `customer_requests` for the window and labels the result as that company's demand signal. The operator reports a shortfall figure to the customer that is built from the customer's competitors' data. Nothing in the UI indicates the scope changed. Separately, because the predicate is profile-based rather than org-based, a legitimate co-manager of the same organization sees **zero** demand — the same code is simultaneously too wide and too narrow.

### P1-1 — Charts are one render-site edit away from vanishing again, and five still have no host — **DEAD**

- Root cause and commit proof in §14 (`0f06be13`, PR #919).
- Still orphaned today: `supply-demand-chart.tsx:25`, `regional-heatmap.tsx:14`, `skills-demand-list.tsx:18`, `recent-matches-feed.tsx:18`, `mini-draft-card.tsx:28`, `market-moment.tsx:28`, plus `live-map.tsx:40`, `live-world-map.tsx:48`, `live-ticker.tsx:10`, `market-counters.tsx:23`.
- No guard asserts that any chart component has a render path. `landing-freeze.ts` freezes them *as orphans*.
- `tests/e2e/pr-i-reality-landing.spec.ts:57` asserts `market-moment` is visible; nothing renders it.

**Failure scenario:** W14 (or any future consolidation) touches `worker-player-card.tsx` to unify the card — exactly the operation `docs/product/LABOURMARKETAI_CANONICAL_COMPONENT_MAP.md:53` names as risk R3 — and drops one of the three chart mounts at `:433/:437/:447`. Type-check passes, every unit test on the pure derivers passes, `player-card-visualizations.test.ts` passes (it asserts what the chart must *not* contain, not that it is mounted), and the product silently loses its only real data visualization for the second time.

### P1-2 — Employer analytics do not exist; marketplace liquidity is not measured — **MISSING**

- §7.1 and §7.2. No time-to-fill, no fill rate, no match rate, no request→booking conversion, no zero-result tracking.
- The raw material is already collected and unused: `demand_interest_signals` (`lib/opportunities/interest.ts:116,149,190,294`), `FUNNEL_EVENTS.bookingAccepted`/`bookingDeclined` (`lib/telemetry/funnel-events.ts:83-84`, in no funnel stage list).

**Failure scenario:** the owner is asked by a pilot customer "how fast do you fill a role, and what fraction of my requests get filled?" There is no answer anywhere in the product, and no query can be written after the fact for the historical period, because no fill event is defined. The two-sided marketplace cannot report the one number that determines whether it is a marketplace.

### P1-3 — Four `?result=` panels claim `dataReadiness: "real"` and render nothing, with no route escape — **STUB**

- `lib/conversation/result-registry.ts:127` (`journal`), `:186` (`project`), `:194` (`evidence`), `:246` (`invoice`) — all `"real"`.
- `canRenderInline()` `:303-307` therefore returns true; `result-body.tsx:138-182` has no case for them; they hit `default` at `:184-189` → `result-body-pending` only.
- They bypass the honest fallback at `:98-114`, which is the only thing that offers `advancedRoute`.

**Failure scenario:** a worker asks the chat to log work. `resultForAction` (`:278`) resolves `worker.log-work` to `journal`. The Context Panel opens, shows one grey "pending" sentence, and offers **no** way to reach `/dashboard/journal`. The canonical chat-first flow dead-ends on its single most important worker action.

### P1-4 — `ReadinessRing` aria-label is hard-coded English; the ring has no zero state — **PARTIAL**

- `apps/web/components/app/readiness-ring.tsx:70` — `` aria-label={`Readiness: ${met} of ${total} signals met`} ``
- `:59` `frac = 0` when `total === 0`; `:102` renders `0/0` in the ring centre.
- Every other string on the card resolves through `buildPlayerCardLabels` (`lib/player-card/labels.ts`).

**Failure scenario:** a Lithuanian or Polish screen-reader user on the Player Card — the product's flagship worker surface — hears an English sentence in the middle of an otherwise fully localized card. This is also an i18n-guard blind spot: the repo's i18n guards scan for missing message keys, not for English literals inside `aria-label`.

### P1-5 — `dashboard_viewed` has no emitter, and the guard that "protects" it verifies inert metadata — **DEAD**

- `lib/telemetry/funnel-events.ts:48` declares it; `lib/conversation/action-registry.ts:326` sets `telemetryEvent: E.dashboardViewed`; **the `telemetryEvent` field is read by nothing at runtime** (declared `action-registry.ts:78`; grep across `app/`, `components/`, `lib/` finds only declarations and one test assertion).
- `lib/guards/activation-funnel-telemetry.test.ts:256-260` asserts `action-registry.ts` "is the surviving `dashboard_viewed` emitter" — a substring match on a file that does not emit.
- `first_action_card_viewed` (`funnel-events.ts:49`) is likewise never emitted.
- Historical prod rows exist (`docs/audits/labourmarketai-functional-reality-matrix-v1.md:158`, `dashboard_viewed:15`) from the deleted `/dashboard/advanced` surface, so the metric looks alive in the data while being dead in the code.

**Failure scenario:** anyone computing activation from `dashboard_viewed` reads 15 historical events, sees a plausible non-zero number, and concludes activation collapsed — when in fact the emitter was deleted with `/dashboard/advanced` (commit `7a4babba`). A green guard test actively reinforces the wrong conclusion.

### P2-1 — Admin analytics tables overflow on mobile

`admin/market/page.tsx:182` and `:235`, `admin/telemetry/page.tsx:385` — tables with no `overflow-x-auto` wrapper. `admin/telemetry/page.tsx:454` shows the correct pattern.

### P2-2 — The telemetry page mixes three different aggregation windows without saying so

`admin/telemetry/page.tsx:85` reads 200 rows for panels 3–5; `conversion-funnel.ts:88` reads 5000 for panel 1; `pilot-metrics.ts:111` reads 8000 for panel 2. All six panels sit on one page with no window disclosure.

### P2-3 — Three telemetry metadata keys are silently dropped

`lib/telemetry/actions.ts:217` (allowlist `:62-94`) discards `template` (`journal-entry-composer.tsx:1036`), `mode` (`:1911`), `outcome` (`:896`).

### P2-4 — `listModerationQueue` has no admin check and hardcodes `isAuthor: false`

`lib/trust/experience-records.ts:315-340`, specifically `:338`. Latent: the only caller today is `admin/page.tsx:137`.

### P2-5 — Public `/vision` page renders a frozen internal status

`messages/en.json` `vision.controlRoom.pr18Label` / `pr18Status` = "PR #18 — journal security layer" / "BLOCKED (issue #32)" → `components/marketing/labour-market-os-map.tsx:332-333`. Stale by construction.

### P2-6 — `reputation*` identifiers survive behind honest copy

`worker-player-card.tsx:81-84`, `labels.ts:121-127`, i18n keys `playerCard.reputation*`. The rendered strings are correct today (§6); the key names invite a future regression that no guard would catch.

### P2-7 — `dataReadiness: "real"` on `experiences` is contingent on an unapplied migration

`lib/conversation/result-registry.ts:244` (justified at `:239-243` on the grounds that absence renders a distinct `unavailable` state). Metrics W-15, P-17, P-18 are **BLOCKED_BY_W6_PROD_MIGRATION** and render empty in production today.

### P2-8 — Company readiness band is a derivation presented among measurements

`lib/company/company-readiness.ts:44-67` — no query; computed from 5 company columns and rendered alongside real counts at `dashboard/company/page.tsx:922-933`.

### Not defects — verified and cleared

- `20260802150000_booking_atomic_double_booking_v1.sql` creates **no table**; it replaces `respond_booking_request` v1/v2/v3. **No metric reads it**; non-application is a write-path race defect, not a blank metric. `readiness-overview.ts:98` reads the pre-existing `booking_requests` table.
- `20260802160000_org_membership_revocation_v1.sql` creates only `end_org_membership_v1`. **No metric reads it.** `memberCount`/`reviewCount` (`dashboard/company/page.tsx:368-370`) read `engagement_contexts`, which predates it — the counts render fine, they simply cannot decrease via the UI (`lib/operations/org-membership.ts:114-121` maps `42883` → `needs_migration`).
- No `Math.random()` feeds any displayed value.
- No numeric fallback of the `?? 87` shape exists.
- The `?result=market` panel is cross-tenant **by design** and safe: `lib/market-map/market-result.ts:65-69` has no org filter, but `job_demands_select` (`supabase/migrations/0001_initial_schema.sql:518-526`) limits non-owners to `status='open'` + authenticated + public/agencies_only visibility.

---

## 16. Recommended W14 slice plan

Small, independently mergeable, ordered by value-per-risk. Each slice is one PR.

| Slice | Title | Scope | Depends on |
|---|---|---|---|
| **W14-1** | Kill the fabricated confidence percentage | Remove or honestly re-label M-01/M-02/M-03. Either delete the `confidence` field from `landing-scenario.ts` or move the number behind an explicit "illustrative" chip adjacent to the value. Fix the false comment at `landing-scenario.ts:73-74`. Add a guard extending `public-no-fake-claims.test.ts` that fails on any inline numeric literal rendered as `%` in `components/marketing/**`. | none |
| **W14-2** | Chart render-path guard | New guard test: every component matching `*chart*`/`*-ring*`/`*timeline*` under `components/` either has ≥1 non-test import site or is explicitly listed in `landing-freeze.ts` as retired. Fail the build otherwise. Also fix `tests/e2e/pr-i-reality-landing.spec.ts:57`, which asserts an unrendered testid. | none |
| **W14-3** | Close the four hollow results | Add renderers (or flip `dataReadiness` to `"unverified"`) for `journal`, `project`, `evidence`, `invoice` in `result-body.tsx`. Flipping readiness is the one-line safe option: it restores the honest fallback + `advancedRoute` button. Also resolve the `worker.log-work` first-match collision at `result-registry.ts:278`. | none |
| **W14-4** | Player-card a11y + zero state | Localize `readiness-ring.tsx:70` through `buildPlayerCardLabels`; add a `total === 0` branch. Add a guard banning English literals in `aria-label` under `components/app/player-card/**`. | none |
| **W14-5** | Marketplace liquidity v1 | First real liquidity metric from data already collected: request→interest→booking conversion over `demand_interest_signals` + `booking_requests`. Add `bookingAccepted`/`bookingDeclined` to `FUNNEL_STAGES`. Admin surface first. | none |
| **W14-6** | Employer analytics v1 | Promote `stageCounts` (`lib/crm/pipeline.ts:68`) to an employer-scoped rollup; add time-to-fill from `booking_requests` timestamps. **Must be org-scoped, not profile-scoped** — see W14-7. | W14-7 |
| **W14-7** | Org scope on analytics reads | Add an explicit org/company predicate to `intelligence-read.ts:422-426` (P0-3) and to the `booking_requests` reads at `candidate-pipeline-facts.ts:72-76` and `operations-centre.ts:152-155`. Do **not** rely on RLS for scope where an admin branch exists. | none |
| **W14-8** | Telemetry truth-up | Emit `dashboard_viewed` + `first_action_card_viewed` for real, or delete both from `FUNNEL_EVENTS`. Rewrite `activation-funnel-telemetry.test.ts:256-260` to assert a real emit call, not a substring. Add `template`/`mode`/`outcome` to `ALLOWED_METADATA_KEYS`. Remove the unused `stepTask`/`abandonTask`. | none |
| **W14-9** | Telemetry window honesty + mobile | State the aggregation window on each telemetry panel; add `overflow-x-auto` to `admin/market/page.tsx:182,235` and `admin/telemetry/page.tsx:385`. | none |
| **W14-10** | One canonical KPI catalogue | Decide whether `metric-keys.ts` or a new registry is canonical; make every catalogue in §8 either derive from it or declare itself a sub-registry. Guard the claim at `metric-keys.ts:2-8` so it is true. | W14-5, W14-6 |
| **W14-11** *(OWNER_GATED)* | AI cost visibility | Apply `20260714150000_ai_runs_audit_v1.sql` (**human gate — owner OK required**), then add the first reader: a cost-by-model/by-feature admin panel. Unblocks `cost_ai`, `acpu`, `top_cost_features`, `top_ai_consumers`. | owner approval |
| **W14-12** *(OWNER_GATED)* | Unblock moderation/dispute metrics | Apply `20260802120000_experience_records_v1.sql` (**owner gate**). Unblocks W-15, P-17, P-18. Fix `listModerationQueue` `isAuthor: false` (`experience-records.ts:338`) and add an explicit admin check. | owner approval |
| **W14-13** | Retire the FIFA surface | Remove or replace `player-card.tsx` + `ovr-ring.tsx` on `/for-workers`, the last rating-shaped artefact a visitor can reach. `lib/guards/fit-not-rating.test.ts:62,69` already names it. | W14-1 |

**Explicitly NOT in W14:** anything touching the Business Health 39 (billing-gated, out of scope), and any consolidation of `worker-player-card.tsx` — risk R3 (`docs/product/LABOURMARKETAI_CANONICAL_COMPONENT_MAP.md:53`) says that is exactly the operation that caused A-13.

---

## 17. File-conflict map

Files a W14 slice would touch that other open work also touches.

| File | W14 slice | Also touched by | Conflict risk |
|---|---|---|---|
| `apps/web/lib/conversation/result-registry.ts` | W14-3 | **W6** (`experiences` entry `:202-245`, promoted `dataReadiness` at `:244`) | **HIGH** — W6 owns lines `:202-245`; W14-3 edits `:127,186,194,246`. Adjacent, same file. Sequence W14-3 after W6 lands, or restrict W14-3 to `result-body.tsx`. |
| `apps/web/components/app/workspace/result-body.tsx` | W14-3 | W6 (`ExperiencesResult` case `:169-182`) | **MEDIUM** — different switch cases; mechanical merge. |
| `apps/web/components/app/worker-player-card.tsx` | W14-4 (indirect) | **W5** (evidence drill-down), any Player Card consolidation | **HIGH** — explicitly ring-fenced ("NELIESTI", `LABOURMARKETAI_CANONICAL_COMPONENT_MAP.md:23`). W14-4 should touch only `readiness-ring.tsx` + `lib/player-card/labels.ts`, never this file. |
| `apps/web/lib/player-card/labels.ts` | W14-4 | W5, W6 | **MEDIUM** — additive (one new label group). |
| `apps/web/lib/intelligence/intelligence-read.ts` | W14-7 | Intelligence stack | **MEDIUM** — `:422-426` is a self-contained function. |
| `apps/web/lib/pipeline/candidate-pipeline-facts.ts` | W14-7 | **W12** (booking/calendar), W8 (employer journey) | **HIGH** — W12 owns the booking response path; W14-7 edits the read predicate at `:72-76`. Coordinate. |
| `apps/web/lib/projects/operations-centre.ts` | W14-7 | W12 | **MEDIUM** — `:152-155` only. |
| `apps/web/lib/telemetry/funnel-events.ts` | W14-5, W14-8 | Any slice adding an event | **MEDIUM** — append-only list; two W14 slices both append. Land W14-8 before W14-5. |
| `apps/web/lib/telemetry/actions.ts` | W14-8 | — | **LOW** — allowlist is append-only. |
| `apps/web/lib/guards/activation-funnel-telemetry.test.ts` | W14-8 | — | **LOW** |
| `apps/web/lib/admin/conversion-funnel.ts` | W14-5, W14-9 | — | **MEDIUM** — two W14 slices; W14-5 adds stages, W14-9 adds window disclosure. Sequence. |
| `apps/web/app/[locale]/dashboard/admin/telemetry/page.tsx` | W14-9 | — | **LOW** |
| `apps/web/app/[locale]/dashboard/admin/market/page.tsx` | W14-9 | — | **LOW** |
| `apps/web/lib/crm/pipeline.ts` | W14-6 | W8 (employer journey) | **HIGH** — W8 owns the employer surface; W14-6 promotes `stageCounts` out of admin. Must be co-designed with W8. |
| `apps/web/lib/trust/experience-records.ts` | W14-12 | **W6** (owns this file entirely) | **HIGH** — do not touch outside W6. W14-12 should be a W6 follow-up, not a W14 slice. |
| `supabase/migrations/20260714150000_ai_runs_audit_v1.sql` | W14-11 | Migration ratchet baseline | **HIGH** — applying it moves the pinned baseline and collides with W6/W9/W12's own gated migrations. Owner gate + ledger update required. |
| `apps/web/content/placeholders.ts` | W14-1, W14-13 | Landing-freeze baseline | **MEDIUM** — `lib/guards/landing-freeze-baseline.json` must be regenerated in the same commit. |
| `apps/web/components/app/market-map/landing-scenario.ts` | W14-1 | Landing/hero work | **MEDIUM** |
| `apps/web/lib/guards/landing-freeze.ts` + `landing-freeze-baseline.json` | W14-1, W14-2, W14-13 | Any landing change | **HIGH** — three W14 slices touch the same baseline file. Land W14-1 → W14-2 → W14-13 strictly in order. |
| `apps/web/lib/intelligence/metric-keys.ts` | W14-10 | Intelligence stack | **MEDIUM** |

**Cross-cutting sequencing constraints:**
1. W14-1 → W14-2 → W14-13 share `landing-freeze-baseline.json`; strictly serial.
2. W14-8 → W14-5 share `funnel-events.ts`.
3. W14-7 → W14-6 (org scope must exist before employer analytics is built on it).
4. W14-3 must not land concurrently with an open W6 slice touching `result-registry.ts:202-245`.
5. W14-11 and W14-12 are migration-applying and therefore owner-gated; they also interact with the migration ratchet pinned baselines that W6/W9/W12 already contend for.

---

## 18. Confirmation that NO code was modified

No product code, migration, test or config file was created, edited or deleted. No commit, push, PR, merge or deploy was performed. No build, package install, dev server, Playwright run, vitest run, Supabase CLI command or database query was executed. No Supabase MCP tool was called. No other worktree and no canonical repo was touched.

The only write performed by this audit is this document.

```
$ cd C:\Users\Mano\Documents\labourmarketai-w14-audit
$ git rev-parse --abbrev-ref HEAD
audit/w14-analytics-kpi

$ git rev-parse HEAD
c05a48026b945c14a42a76a34cb1c90ce9113e87

$ git status --short
?? docs/audits/w14-analytics-kpi-audit.md
```

*(Before this document was written, `git status --short` produced no output at all — the worktree was clean at the audit base commit. The single `??` entry above is this uncommitted audit file, left uncommitted as instructed.)*

---

## 19. What could NOT be verified without running the app or the DB

Stated explicitly rather than guessed:

1. **Effective table-level `GRANT`s.** No `grant`/`revoke` on `public.organizations` appears anywhere in `supabase/migrations/`. Whether `organizations_select using (true)` is reachable by `anon` depends on Supabase's default public-schema grants. Needs `\dp public.organizations`. Same for `platform_skill_aggregates`.
2. **Actual production migration state.** All BLOCKED_BY_* classifications are inferred from the DRAFT / human-gate headers, `docs/APPLIED_LEDGER.md`, and the code's own `needs_migration` branches — not from the database. `docs/APPLIED_LEDGER.md:19-30` documents a 26-migration drift where migrations are applied but unrecorded, so the ledger is not authoritative in either direction.
3. **The body of `project_position_salary_avg`** (SECURITY DEFINER, called at `apps/web/lib/market/thermometer-data.ts:94-97`). Its definition is not in `supabase/migrations/`. Whether its sample scoping leaks other workers' salaries is **unknown**.
4. **Whether the four hollow `?result=` panels are reachable in practice.** `context-panel.tsx:318` passes the kind through and `use-result-param.ts` validates against `isResultKind`, so they *appear* reachable, but the URL was not exercised.
5. **Runtime RLS behaviour.** Query shapes were read; no policy was executed against real rows for any role.
6. **Rendered mobile layout.** Overflow findings in §13 are read from Tailwind classes (absence of `overflow-x-auto` on a multi-column table), not from a rendered viewport. No screenshot evidence was captured — no browser was run.
7. **Whether `ExperiencesResult` renders a genuinely distinct `unavailable` state**, which is the stated justification for `dataReadiness: "real"` at `result-registry.ts:239-243`. The component was not read in full.
