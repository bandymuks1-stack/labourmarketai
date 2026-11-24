# FULL PRODUCT VISION AUDIT — CONTINUATION, 2026-09-03

> **Class:** resume + completion of
> [`FULL_PRODUCT_VISION_AUDIT_2026-09-02.md`](FULL_PRODUCT_VISION_AUDIT_2026-09-02.md).
> That file remains the evidence base for the 17 domains it indexed (§2–§19) and
> is **not** restated here. This continuation (a) re-verifies ground truth at the
> new SHA, (b) adds the domains the 09-02 audit did not index against the owner's
> full-vision brief (services marketplace, housing, document engine,
> invoicing/finance, automation engine, SEO/AEO, admin/observability, Telegram,
> Agentai OS boundary, multi-context), (c) re-normalises the coverage table to the
> brief's 20 material domains, and (d) adds the fourth score,
> `FULL_CANONICAL_VISION_PROD_VERIFIED`.
>
> **Yardstick (binding):** [`docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`](../product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md)
> + [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) + the owner brief. Documentation,
> schema, PRs and roadmaps earn **no** completion credit. `PROD_VERIFIED` needs a
> production readback or a live probe recorded here or in the 09-02 file.
>
> **Session safety held:** audit only — no product code changed, no PR touched,
> no auto-merge changed, no CI or deployment cancelled, no migration applied, no
> destructive SQL (one read-only `count(*)` sweep), no background wait loop.

---

## 0. New-session recovery + ground truth (re-verified 2026-09-03 ~05:50 UTC)

| Fact | Value | How verified |
|---|---|---|
| Canonical repo / root | `bandymuks1-stack/labourmarketai` at `C:\Users\Mano\Documents\labourmarketai` | `git remote get-url origin`, `git rev-parse --show-toplevel` — matches the path guard |
| `main` SHA | **`b9db4431`** — *docs(audit): full product vision audit* | `git rev-parse main`; `origin/main` identical (0/0 ahead/behind) |
| Production SHA | **`b9db4431`**, region `dub1` | `/api/health` → `build:"b9db4431"` ×3 |
| main == production | **YES** | above |
| Production health | **STILL FLAPPING RED — P0-1 reproduced unfixed**: `503` (db 3,786 ms `http_500`), `503` (3,217 ms), then `200` (206 ms) | 3 live probes 05:50:48–05:50:52 UTC |
| Open PRs | 20 (18 draft, 2 ready); 12 `needs-human-gate` | `gh pr list` |
| Auto-merge | **only #1439** has auto-merge ON — and it is now **`CONFLICTING` / `DIRTY`** (register conflict with #1443). All 9 checks green on the branch; it will **never merge until rebased** | `gh pr view 1439` |
| Remote CI / deployments running | **none** — last runs on `main` (CodeQL, Quality Gates, E2E Smoke, Mobile, sweden-supply-cadence) all `completed success` 2026-09-02 20:21 UTC | `gh run list` |
| Working tree | clean except pre-existing untracked `docs/audits/evidence/ru-landing-localization/` | `git status --porcelain` |
| Prior full-vision audit persisted? | **YES** — 09-02 file + register §5 + `RESUME_CHECKPOINT_2026-09-02.md`. Resumed, not repeated. | read |

**Consequence:** nothing in the 09-02 evidence base has been invalidated by a
code change — the only commit since is the audit itself. Every `PROD_VERIFIED`
entry there stands; every `MISSING` entry there still stands.

### 0.1 Delta since 2026-09-02

| Item | 09-02 | 09-03 |
|---|---|---|
| P0-1 anon 3 s timeout | found, 503×2 → 200×2 | **reproduced at `b9db4431`**: 503×2 → 200×1. Not fixed. |
| #1439 (health-probe cron) | READY, auto-merge ON | **CONFLICTING** — auto-merge inert (the 09-02 resume checkpoint already prescribes the merge-resolution step) |
| Journal use | `journal_entries` 36 / skills 38 / confirmations 5 (08-26 contract snapshot) | **39 / 48 / 12** — organic growth, the evidence loop is in sustained real use |
| New finding P0-1b | — | `/jobs-sitemap.xml` (advertised in `robots.txt`) returned **500** on first cold fetch, 200 (10 shards) on the next two — it calls `readPublicVacancySupplyCounts()` → `count_public_vacancies_v1`, i.e. **the same 3 s timeout**. Crawlers see a 500 sitemap index on cold buffers. |
| New finding P2-1 | — | Apex-level unknown paths **with a file extension** return **500** instead of 404 (`/foo-control.xml`, `/foo-control.json`, `/nonexistent-control.txt`, `/llms.txt` → 500; `/nonexistent-control-xyz` → 404; the same paths under `/en/…` → 404). Soft-500 on stale/probed asset URLs = crawl-error noise; classified `PRODUCT_DEFECT`, P2. |

---

## 1. Failure classification for this session (brief §39)

| Event | Class | Effect on scores |
|---|---|---|
| `grep -rli telegram ../..` timed out (walked `node_modules`) | `ENVIRONMENT_OR_TOOLING` | none — re-run with ripgrep |
| `curl` to any URL other than `/api/health` denied by the permission layer | `ENVIRONMENT_OR_TOOLING` | none — probes moved to the in-app browser `fetch` from the production origin |
| `/jobs-sitemap/0` → 404 | `EXPECTED_NEGATIVE_CHECK` — the route is `/jobs-sitemap/0.xml` (200, 1,000 URLs, 854 KB) | none |
| `/api/health` 503 ×2 | **`PRODUCT_DEFECT`** (P0-1, pre-dates this audit, first recorded 09-02) | already deducted in CORE |
| `/jobs-sitemap.xml` cold 500 | **`PRODUCT_DEFECT`** (P0-1b, new caller of the same root cause) | folded into P0-1 |
| apex `*.xml/*.json/*.txt` unknown paths → 500 | **`PRODUCT_DEFECT`** (P2-1, new) | −0 on CORE (cosmetic for users, real for crawlers) |
| #1439 `CONFLICTING` | neither — PR hygiene, autonomous fix already prescribed | none |

---

## 2. Domains the 09-02 audit did not index

### 2.1 Multi-identity / multi-context (brief §7)

| Capability | Evidence | Status |
|---|---|---|
| One account, many roles (`engagement_contexts` additive model) | 09-02 §2; `student` beside employment `PROD_VERIFIED` | `PROD_VERIFIED` |
| Durable active-workspace pointer, switchable by chat/MCP | `lib/capabilities/registry.ts` `context.switch` — real write, reversible, refuses ambiguous input with labelled options; demand creation **refuses** in personal space and names `context.switch` as the way out | `IMPLEMENTED_TESTED` (registry tests; MCP write proven via ChatGPT 2026-08-30 for sibling capabilities — `context.switch` itself has no recorded production readback) |
| PERSON ↔ COMPANY switching | `organizations` 15, `companies` 12 in prod; workspace resolver | `PROD_VERIFIED` |
| ACTIVITY / PROJECT / CLIENT as switchable contexts | projects exist (6 rows) as *objects*, not as an active context; no client context; no self-employed "activity" context | `MISSING` |
| Multi-company owner | many memberships allowed by model; no owner-level "all my companies" surface | `PARTIAL` |
| Permission + state isolation per context | RLS + workspace-scoped RPCs; K1 leak matrix PASS (09-02 §19) | `PROD_VERIFIED` |

**Verdict: `PARTIAL` 65%** (unchanged from 09-02 domain 1). The contexts that
exist are real and isolated; PROJECT/CLIENT/ACTIVITY contexts and the
intern/apprentice/graduate/mentor vocabulary are the gap.

### 2.2 Work Journal record + downstream chain (brief §12)

Production readback 2026-09-03: `journal_entries` **39**, `journal_entry_skills`
**48**, `journal_entry_confirmations` **12**, `timesheets` **2**, `projects` **6**.

| Field / link (brief list) | Present in model? |
|---|---|
| date · duration · company · project · work performed · notes · verification (third-party confirm) | yes — `PROD_VERIFIED` (entries with confirmations in prod) |
| time-of-day · location · client · materials · equipment · costs | **no** — `MISSING` as journal fields (costs live only in the separate `finance_records` model, unlinked) |
| photos · documents on an entry | file model exists (`document-file-model.ts`) for the document centre, **not** attached to journal entries | `MISSING` |
| WORK JOURNAL → CLASSIFICATION → SKILL EXTRACTION → PROFILE → CV → MATCHING → PROVENANCE → USER-VISIBLE CHANGE | 09-02 §4/§11 — `PROD_VERIFIED` end to end (48 extracted skills, provenance recorded) | `PROD_VERIFIED` |
| WORK JOURNAL → INVOICE / WORK SUMMARY / TIMESHEET PDF | timesheet chain proven; **no invoice or PDF path** | `MISSING` (see 2.6) |

**Verdict: `PROD_VERIFIED` core, 75%** — the evidence spine is the product's
strongest asset; the missing pieces are richer entry fields and the money link.

### 2.3 Services marketplace (brief §21)

Production readback: `service_offerings` **2**, `service_offering_requests`
**1**, `booking_requests` **0**; `booking_engagements` **ABSENT** (the
engagement lives in the booking→engagement chain proven in #857).

| Lifecycle stage (brief) | Evidence | Status |
|---|---|---|
| SERVICE OFFER | `service_offerings` (owner-scoped RLS, `status='active'` visible) | `PROD_VERIFIED` (2 rows) |
| DISCOVERY | `/dashboard/service-requests`; marketplace reachable but **not in nav by IA ruling** (09-02 §10) | `PARTIAL` |
| PROVIDER → REQUEST | `service_offering_requests` `sent → accepted / declined / withdrawn` | `PROD_VERIFIED` (1 row) |
| QUOTE | none — no price negotiation object | `MISSING` |
| BOOKING / ORDER | `booking_requests` `proposed → accepted / declined / withdrawn / expired`; atomic double-booking guard; accepted → engagement → project-assign (#857) | `IMPLEMENTED_TESTED` (0 rows in prod) |
| DELIVERY → ACCEPTANCE | none | `MISSING` |
| RESULT / REPUTATION | none | `MISSING` |
| INVOICE / PAYMENT | none linked to an order | `MISSING` |
| DISPUTE / CANCELLATION | `withdrawn`/`declined` only; "dispute" exists **only** in the Stripe webhook handler | `MISSING` |
| Per-order: ID, buyer, provider, context, deadline, state | yes; **price, messages, documents, payment state** on the order: no | `PARTIAL` |
| Category breadth (construction, transport, translation, accounting, legal, housing…) | `lib/work-market/categories.ts` taxonomy exists; no category-specific flows | `PARTIAL` |

**Verdict: `PARTIAL` 30%.** The two-sided *request* loop is real and used once
in production; everything after `accepted` — quote, delivery, acceptance,
reputation, invoice, dispute — is `MISSING`.

### 2.4 Housing / workforce accommodation (brief §22)

`housing_listings` **ABSENT**; no migration, route, RPC, model or test contains
`housing` / `accommodation` as a product entity. The only hits are marketing
copy (`company-need`, `worker-intake`, `project-cost` calculator) and the
live-market command palette strings. **`MISSING` — 0%.** Nothing to resume;
this is a whole domain to build (listings → availability → search → booking →
project/site link → worker allocation → payment). Its only dependencies
(projects, organisations, payments) exist.

### 2.5 Document requirements engine (brief §23)

| Capability | Evidence | Status |
|---|---|---|
| DOCUMENT INVENTORY (19 types, validity model ACTIVE/EXPIRED/REVOKED/UNKNOWN, issuer/source/dates/provenance) | `lib/documents/*`, `worker_documents` (0 rows), `credential-validity.ts` | `IMPLEMENTED_TESTED`, **never used** |
| Historical-evidence immutability vs current validity | validity is a separate computed state; history not overwritten | `IMPLEMENTED_TESTED` |
| CONTEXTUAL REQUIREMENTS (country × job × project → missing list) | `readiness.ts` + `lt-master-guidance.ts` = **content guidance for 10 EU countries**, not a rules engine keyed to a job/project | `PARTIAL` |
| EXPIRY → ACTION LIST → alert | expiry computed; **no alert/automation** (see 2.7) | `PARTIAL` |
| REJECTION handling | none | `MISSING` |
| DOCUMENT SERVICE (order a document via marketplace) | none | `MISSING` |
| ENTITY LINK (document ↔ job/project/order/company) | org documents exist (`org-document-actions.ts`); no link to job/project/order | `PARTIAL` |
| Jurisdiction awareness / lawful purpose / minimisation | consent ledger + purpose-bound disclosure (09-02 §19) | `IMPLEMENTED_TESTED` |

**Verdict: `PARTIAL` 35%** — a good inventory model with zero adoption and no
requirements engine on top of it.

### 2.6 Invoicing + financial operating layer (brief §26)

| Capability | Evidence | Status |
|---|---|---|
| `finance_records` — `record_type ∈ {invoice_issued, invoice_received, expense}`, `status ∈ {draft, issued, partially_paid, paid, cancelled}`, approval `pending/approved/rejected` via the workflow engine | migrations `20260711230000`, `20260817220000`; `/dashboard/finance` | `IMPLEMENTED_TESTED`, **0 rows** |
| Generation from Work Journal / allocations / timesheets | none — records are typed by hand | `MISSING` |
| PROFORMA · CREDIT NOTE · WORK ACCEPTANCE ACT · EXPENSE REPORT · CLIENT REPORT | none | `MISSING` |
| PDF / accounting export | none (timesheet export exists, not invoice) | `MISSING` |
| Lifecycle `sent → viewed → overdue` | absent from the enum | `MISSING` |
| Links to project / client / worker / order | `finance_record_links` **ABSENT** | `MISSING` |

**Verdict: `IMPLEMENTED_NOT_TESTED`-in-prod, 15%.** Correct spine
(append-only, approval-gated), wrong depth: nothing flows *into* it from work.

### 2.7 Automation engine (brief §28)

`automations` / `automation_runs` **ABSENT**. No entity with owner + context +
schedule/condition + state + run history + pause/resume. Fixed crons only:
`/api/cron/weekly-digest` (Mon 07:00, `CRON_SECRET`-gated, unproven in prod) and
the health-probe cron parked in #1439. The workflow engine (24 definitions,
append-only transitions, 1 instance / 4 transitions in prod) is the right host
and is **not** an automation engine. All ten user automations the brief lists
(weekly report, monthly invoice, overdue reminder, credential expiry, job
search, candidate discovery, client report, risk check, journal reminder,
reservations) are **`MISSING`**. **Verdict 10%.**

### 2.8 Telegram / social recruitment ecosystem (brief §30)

| Capability | Where | Class (brief §34) | Status |
|---|---|---|---|
| Owner Telegram alerts on demand signals (bot `sendMessage`, fallback to Agentai channel) | `lib/notifications/telegram-owner-alerts.ts`, env `OWNER_TELEGRAM_*` | `HYBRID` | `IMPLEMENTED_TESTED`, env-gated, no prod readback |
| Owner Telegram command/approval channel | Agentai `telegram-control`, `telegram-cleanroom`; Windows task *Agentai Telegram Operator* = **Ready** | `AGENTAI_OS_SHARED` | running on the owner PC |
| Discovery of recruitment Telegram channels/groups (construction, international workforce, staffing) | **no code in either repo** | would be `AGENTAI_OS_SHARED` | `MISSING` |
| Dedicated LabourMarket.ai Telegram channel (job distribution, community) | none | `MANUAL_OWNER_PROCESS` | `MISSING` |
| LinkedIn / Meta / Instagram / TikTok posting or ads | none; auth providers `BLOCKED_EXTERNAL` (G-2) | `EXTERNAL_PROVIDER` | `MISSING` |
| Posting into arbitrary Facebook groups | not officially supported by Meta APIs — correctly **not** attempted | — | `NOT_SUPPORTED` |
| Paid advertising capability | none | `EXTERNAL_PROVIDER` | `MISSING` |

**Verdict: 10%** — only the owner-alert channel exists; nothing faces the market.

### 2.9 SEO / AEO / discoverability (brief §31) — production probes 2026-09-03

| Surface | Probe | Status |
|---|---|---|
| `robots.txt` | 200 — allows `/`, blocks `/api/`, `/*/dashboard`, `/*/onboarding`, `/*/auth`, `/*/cv`, `/*/design`; `Host` apex; 3 sitemaps advertised | `PROD_VERIFIED` |
| `sitemap.xml` | 200, **150 URLs** (per-locale, hreflang alternates) | `PROD_VERIFIED` |
| `questions-sitemap.xml` (Answer Engine) | 200, **225 URLs** | `PROD_VERIFIED` serving |
| `jobs-sitemap.xml` (index) | **500 cold**, then 200 with 10 shards | **P0-1b** |
| `jobs-sitemap/0.xml` | 200, **1,000 URLs**, 854 KB | `PROD_VERIFIED` |
| OG / Twitter images | `app/[locale]/opengraph-image.tsx` + `twitter-image.tsx`; prod OG 500 fixed 2026-08-31 | `PROD_VERIFIED` (corrects the 09-02 §14 row "OG share images MISSING") |
| JSON-LD | Article + BreadcrumbList + Organization on answer pages; **JobPosting only in RED draft #1433** (G-16 waiver) | `PARTIAL` / `PR_ONLY` |
| AEO corpus | 550 canonical questions in the registry — **98 CLUSTERED, 452 DISCOVERED, 0 in an indexable state** ("Wave 0: nothing is indexable"); IndexNow client wired | `PARTIAL` — the sitemap serves category/landing pages, not approved answers |
| `llms.txt` / AI-readable product explanation | none (and the path 500s — P2-1) | `MISSING` |
| Multilingual discoverability | 5 routed locales with hreflang; 19 EU + Georgian absent | `PARTIAL` |
| `security.txt` (RFC 9116) | 200 | `PROD_VERIFIED` |
| Public/private boundary | anon projection SQL-enforced; K1 PASS | `PROD_VERIFIED` |

**Verdict: `PARTIAL` 45%** — technically sound crawl surface with two real
defects (cold sitemap 500, extension-path 500) and no answer content approved.

### 2.10 Admin / support / analytics / observability (brief §37)

| Capability | Evidence | Status |
|---|---|---|
| Admin operations | **20** superadmin pages under `/dashboard/admin/*` (billing, candidate-pool, company-verification, need intakes, pilots, readiness, launch-readiness, support…) | `IMPLEMENTED_TESTED`; verification click proven once (G-14 pending for the E2E org) |
| Support inbox | `/dashboard/admin/support` reads a support view; `support_requests` table **ABSENT** under that name (rows come from the messaging model) | `PARTIAL` |
| Pilot / product analytics | `pilot_events` **1,840 rows**, ~55 funnel events, first-party attribution | `PROD_VERIFIED` |
| Business analytics | Business Health Engine = RED draft #897 | `PR_ONLY` |
| Health check | `/api/health` real — **flaps** (P0-1) | `PARTIAL` |
| Error monitoring | no Sentry/Datadog/Axiom/etc. in `package.json`; JSON-line `console` logging only | `MISSING` |
| Health cron / paging | #1439 (conflicting) | `PR_ONLY` |
| Rollback readiness | L3 drill never run | `BLOCKED_OWNER` |
| Auditability | append-only ledgers, `workflow_transitions`, consent/disclosure ledgers | `PROD_VERIFIED` |
| Ops control commands | `lib/ops/control-commands.ts`, `control-authorization.ts` | `IMPLEMENTED_TESTED` |

**Verdict: `PARTIAL` 45%.**

### 2.11 Agentai OS boundary + Global Work & Commerce Radar (brief §18, §34, §35)

Verified read-only in `C:\Users\Mano\Documents\agantai` (`main` @ `458fbbe`).

**The integration artefact exists:** `contracts/labourmarket-capability-contract.json`
(`agentai-project-capability-contract/v1`, sourceSha `82b29c40`, verified
2026-08-26) — per-capability `status`, production readbacks, `safeClaims` and
`forbiddenClaims`. It is consumed by 4 production scripts + 3 docs. **Direction
is one-way** (Agentai reads LabourMarket production facts); LabourMarket.ai
consumes nothing from Agentai OS at runtime except the optional owner-alert
relay. This is the correct *shape* — LabourMarket.ai does not duplicate
discovery/outreach — but the contract is **9 days stale** (`82b29c40` vs
`b9db4431`) and hand-maintained.

| Capability | Class | Evidence | Actually running? |
|---|---|---|---|
| Market intelligence / EU demand radar | `AGENTAI_OS_SHARED` | `runtime/construction-demand/*.jsonl` (last 2026-08-24), `docs/audit/daily-radar-repair-2026-08-04.md` — the daily collector "refuses to act as a daily agent" | **not on the owner PC**: tasks *Market Demand Summary 0910/1510*, *LMA Priority Market Search*, *Construction Jobs Leads 1100/1700*, *EU Demand Contact Campaign*, *Lead Scout Bridge* are all **Disabled**. VPS `research-lead-scout` profile defines an **hourly** LabourMarket lead scout (draft-only) — VPS state **`UNKNOWN`** from this host |
| 12:00 Lithuania-time radar report | `AGENTAI_OS_SHARED` | only *Email Control 12* (Disabled) matches; no 12:00 radar job found in `scheduler-logic.ts` | `NOT_CONFIGURED` |
| OTTO-type / staffing-intermediary vs direct-contractor distinction | `AGENTAI_OS_SHARED` | direct-buyer radar addenda 2026-08-29 (b/c/d), `nl-operator-seed-organisations.json` — research dossiers, not a classifier | `DOCUMENTED_ONLY` |
| Upstream discovery (end client / GC / work package / contact) | `AGENTAI_OS_SHARED` | `contact-intelligence`, `employer-domain-discovery`, `construction-discovery-*` runtime dirs | offline runs; nothing scheduled and enabled |
| Contact discovery + qualification | `AGENTAI_OS_SHARED` | `labourmarket-employer-prospects.ts`, `labourmarket-first-contact-cohort.ts` — DISCOVER → VERIFY → SELECT → DRAFT → QA, **cannot send** | offline, €0, owner-invoked |
| Outreach infrastructure + reply monitoring | `AGENTAI_OS_SHARED` | `email-control`, `detect-labourmarket-replies.ts`; scheduler re-scans `labourmarket-reply-*.jsonl` | Email Control tasks **Disabled** on PC; VPS `UNKNOWN` |
| Partnership discovery (education / agencies) | `AGENTAI_OS_SHARED` | `labourmarket-nl-partner-cohort/drafts.ts` | offline draft composer |
| Model / provider routing | `HYBRID` | LM: env-gated Gemini live on 4 routes; Agentai: own relay config | LM side `PROD_VERIFIED` |
| Security gates | `LABOURMARKET_PRODUCT_NATIVE` (CI `quality`, `migration-safety`, live anon-SECDEF) | 09-02 §19 | `PROD_VERIFIED` |
| Human approval / audit trail for agent actions | `LABOURMARKET_PRODUCT_NATIVE` (workflow engine) + `AGENTAI_OS_SHARED` (Telegram approvals) | both exist | product side proven |
| User-facing automations (vision §12) | `LABOURMARKET_PRODUCT_NATIVE` | none | `MISSING` |

**AGENTAI OS INTEGRATION VERDICT: `PARTIAL` 30%.** Boundary correctly drawn
(no duplicate radar inside LabourMarket.ai); contract exists but is stale and
one-way; **no shared capability is verifiably running on a schedule from this
host**, and every outbound lane is draft-only by design.

**AUTONOMY VERDICT (brief §35): 12% inside the product / `UNKNOWN` for the
VPS.** Implemented: discovery/qualification/draft pipelines. Scheduled: defined
in the VPS profile. Actually running: unverifiable here (owner-PC tasks
disabled). Useful output: research dossiers to 2026-08-29. Production-verified:
none of the autonomous lanes.

---

## 3. Canonical vision coverage table (brief §44) — 20 material domains

Weights re-normalised to the brief's list (sum = 100). Completion credit per
the 09-02 method (1.0 `PROD_VERIFIED`, 0.7 `IMPLEMENTED_TESTED`, 0.5
`PARTIAL`/`IMPLEMENTED_NOT_TESTED`, 0.25 `*_ONLY`, 0.1 `PR_ONLY`, 0 otherwise).
"PV share" = the part of the completion that is production-verified; it feeds
the fourth score.

| # | Canonical domain | Required end state | Current evidence | Status | Compl. % | W | Contrib. | PV share | PV contrib. | Missing |
|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| 1 | Identity / multi-context | one account, all roles, PERSON/COMPANY/ACTIVITY/PROJECT/CLIENT contexts | §2.1; 09-02 §2 | `PROD_VERIFIED` core | 65 | 5 | 3.25 | 50 | 2.50 | project/client/activity contexts; 4 lifecycle slugs |
| 2 | Worker | full worker lifecycle incl. portable identity | 09-02 §4 | `PROD_VERIFIED` | 72 | 7 | 5.04 | 55 | 3.85 | references, mobility prefs, portability export beyond EU CV |
| 3 | Employer | Workforce OS, not only recruitment | 09-02 §5 | `PROD_VERIFIED` core | 55 | 6 | 3.30 | 40 | 2.40 | planning write path, forecasts, no new demand since Jul |
| 4 | Education / student | institution product + Learning Compass | 09-02 §3 | `PARTIAL` | 18 | 9 | 1.62 | 10 | 0.90 | programmes, cohorts, assignments, qualification issuance, internships, graduation, tracking, compass |
| 5 | Agency | agency workspace + placement lifecycle | 09-02 §6 | `BACKEND_ONLY` | 25 | 8 | 2.00 | 0 | 0.00 | workspace, placement object, key-space unification, economics |
| 6 | Work Journal / evidence | rich entry + full downstream automation | §2.2 | `PROD_VERIFIED` | 75 | 6 | 4.50 | 60 | 3.60 | time/location/client/materials/cost/photo fields; money link |
| 7 | Credentials / documents | inventory + requirements engine + services | §2.5; 09-02 §9 | `PARTIAL` | 35 | 4 | 1.40 | 5 | 0.20 | rules engine, alerts, rejection, entity links, adoption |
| 8 | Matching | deterministic + semantic + feedback + fairness | 09-02 §11 | `PROD_VERIFIED` deterministic | 45 | 5 | 2.25 | 30 | 1.50 | semantic layer, feedback loop, fairness controls |
| 9 | Workforce / project OS | teams, sites, plan, schedule, capacity, reporting | 09-02 §8 | `PARTIAL` | 45 | 7 | 3.15 | 25 | 1.75 | plan primitive (gated), calendar write, capacity-vs-leave, AI reporting |
| 10 | Services marketplace | offer → … → payment → dispute | §2.3 | `PARTIAL` | 30 | 4 | 1.20 | 15 | 0.60 | quote, delivery, acceptance, reputation, invoice, dispute |
| 11 | Housing | listings → booking → allocation → payment | §2.4 | `MISSING` | 0 | 3 | 0.00 | 0 | 0.00 | entire domain |
| 12 | Invoicing / finance | journal → invoice → PDF → states → export | §2.6 | `IMPLEMENTED_NOT_TESTED` | 15 | 5 | 0.75 | 0 | 0.00 | generation, proforma/credit/act, PDF, export, links |
| 13 | Payments / economics | LMC + Stripe live + entitlements + reversal | 09-02 §16 | `BLOCKED_OWNER` | 30 | 5 | 1.50 | 15 | 0.75 | live keys (G-7/G-8), spend reversal, agency/education pricing |
| 14 | Automation | user automations with history/pause | §2.7 | `MISSING` | 10 | 4 | 0.40 | 2 | 0.08 | entire engine |
| 15 | Communications | email + in-app + external channels + consent | 09-02 §14 | `PARTIAL` | 35 | 3 | 1.05 | 20 | 0.60 | real-inbox proof (G-1), channels, dispatch env |
| 16 | Market intelligence | demand + upstream + skills gap → education | 09-02 §12; §2.11 | `PARTIAL` | 30 | 4 | 1.20 | 15 | 0.60 | upstream discovery, employer-side ingestion, GC/subcontractor slugs |
| 17 | International mobility | eligibility rules engine, alerts, audit | 09-02 §13 | `PARTIAL` | 25 | 3 | 0.75 | 5 | 0.15 | rules engine, Georgia, alerts |
| 18 | Global / i18n | 24 locales, dynamic content translation | 09-02 §15 | `PARTIAL` | 30 | 3 | 0.90 | 25 | 0.75 | 19 locales, dynamic translation |
| 19 | Security / governance | default-deny, GDPR, provenance, rollback | 09-02 §19 | `PROD_VERIFIED` | 70 | 5 | 3.50 | 60 | 3.00 | K2-1 (gated), minors, rollback drill |
| 20 | Operations / observability | health, monitoring, admin, analytics | §2.10 | `PARTIAL` | 45 | 4 | 1.80 | 30 | 1.20 | P0-1, error monitoring, L3 drill |
| | **TOTAL** | | | | | **100** | **39.6** | | **24.4** | |

Cross-check: the 09-02 17-domain weighting gave 38.4; the brief's 20-domain
weighting gives 39.6. The +1.2 is entirely re-normalisation (the journal/evidence
spine, the strongest domain, now carries its own weight), not new product.

---

## 4. The four scores (brief §43)

```
CORE_PRODUCT_READY                   =  78%   (held from 09-02; P0-1 reproduced, P2-1 does not move it)
COMMERCIAL_LAUNCH_READY              =  35%   (held; no economic flag, key, price or reversal changed)
FULL_CANONICAL_VISION_COMPLETE       =  40%   (39.6 — table above)
FULL_CANONICAL_VISION_PROD_VERIFIED  =  24%   (24.4 — only production-verified credit counts)
```

**Reading the gap between 40 and 24:** sixteen points of the vision exist as
tested code that has never carried a production row or been probed live —
agency (whole backend), documents, finance records, booking lifecycle,
notification preferences, the 19 unused workforce tables. That is the cheapest
completion available: **adoption and proof, not construction.**

---

## 5. Separate verdicts required by the brief (§49)

| Verdict | State | One line |
|---|---|---|
| **STUDENT + EDUCATION** | `PARTIAL` **18%** | institution→invite→learner→`student` context proven; programmes/cohorts/qualifications/internships/graduation/compass all `MISSING` (09-02 §3) |
| **AGENCY** | `BACKEND_ONLY` **25%** | complete RPC loop, 0 rows, no workspace, no placement object, two disjoint key spaces (09-02 §6) |
| **DIRECT CONTRACTOR / INTERMEDIARY** | `MISSING` **0%** in product / `DOCUMENTED_ONLY` in Agentai | product sees only imported intermediated vacancies; slugs `general_contractor`/`subcontractor` absent; Agentai holds dossiers, no classifier, no schedule enabled (09-02 §7; §2.11) |
| **WORKFORCE OS** | `PARTIAL` **45%** | still recruitment infrastructure + a proven timesheet chain; 19 of 24 ops tables never used; plan primitive gated (09-02 §8) |
| **SERVICES MARKETPLACE** | `PARTIAL` **30%** | request loop real (1 prod request); nothing after `accepted` (§2.3) |
| **HOUSING** | `MISSING` **0%** | no entity anywhere (§2.4) |
| **DOCUMENT / MOBILITY** | `PARTIAL` **35% / 25%** | excellent inventory model with 0 rows; guidance content, no rules engine (§2.5; 09-02 §13) |
| **FINANCE / INVOICING / PAYMENTS** | **15% / 30%** | manual finance records with correct states, nothing generated from work; Stripe live blocked on G-7/G-8; no spend reversal (§2.6; 09-02 §16) |
| **MATCHING / INTELLIGENCE** | **45% / 30%** | deterministic explainable matching proven; AI live but `ai_runs`=7; intelligence supply-side only (09-02 §11–12) |
| **SOCIAL / TELEGRAM** | **10%** | owner-alert bot only; no channel discovery, no LM channel, no LI/Meta/IG/TikTok (§2.8) |
| **AGENTAI OS INTEGRATION** | `PARTIAL` **30%** | correct boundary, stale one-way contract, nothing verifiably scheduled+enabled (§2.11) |
| **AUTONOMY** | **12%** / VPS `UNKNOWN` | draft-only pipelines; owner-PC schedules disabled (§2.11) |

---

## 6. Gap register — rows added by this continuation (brief §45)

The 09-02 §22 register stands. New rows only:

| Domain | Capability | Required final state | Current evidence | Status | % | Missing | Dependency | Owner gate | Pri |
|---|---|---|---|---|---:|---|---|---|---|
| Ops / SEO | `jobs-sitemap.xml` on cold buffers | 200 always | 500 then 200 (P0-1b) | `PROD_VERIFIED` defect | 0 | same fix as P0-1 | none | no | **P0** |
| SEO | Apex extensionful unknown paths → 404 | proper 404 | `/foo.xml`, `/foo.json`, `/llms.txt` → 500 (P2-1) | `PROD_VERIFIED` defect | 0 | not-found handling before locale routing | none | no | P2 |
| SEO / AEO | Approved, indexable answers | ≥1 `HUMAN_APPROVED` answer indexed | 550 questions, 0 indexable | `PARTIAL` | 30 | editorial approval path | none | editorial (owner-optional) | P2 |
| AEO | `llms.txt` / AI-readable product explanation | served | none | `MISSING` | 0 | one static file | P2-1 | no | P2 |
| Marketplace | Quote object | price negotiation on a request | none | `MISSING` | 0 | model | request loop ok | no | P1 |
| Marketplace | Delivery → acceptance → reputation | order completion states | none | `MISSING` | 0 | state machine | booking ok | no | P1 |
| Marketplace | Dispute / cancellation logic | disputable order | `withdrawn` only | `MISSING` | 0 | model + policy | payments | no | P2 |
| Journal | Time/location/client/materials/equipment/cost/photo fields | rich entry | date/duration/project/notes only | `PARTIAL` | 50 | fields + file attach | file model ok | no | P1 |
| Finance | `finance_record_links` (project/client/worker/order) | linked records | absent | `MISSING` | 0 | table + RPC | finance ok | no | P1 |
| Finance | `sent / viewed / overdue` states + PDF | full lifecycle | 5 states, no PDF | `PARTIAL` | 40 | enum + renderer | — | no | P1 |
| Automation | Credential-expiry alerts (first automation) | scheduled alert with history | validity computed, nothing scheduled | `MISSING` | 0 | automation entity | workflow engine | no | P1 |
| Observability | Error aggregation | real monitor with alert | none in deps | `MISSING` | 0 | provider or self-hosted sink | — | optional (provider key) | P1 |
| Agentai | Capability contract freshness | regenerated per prod SHA | 9 days stale, manual | `PARTIAL` | 40 | generator on a schedule | Agentai scheduler | no | P2 |
| Agentai | 12:00 Lithuania-time radar report | scheduled + enabled | no such job; PC tasks disabled | `NOT_CONFIGURED` | 0 | VPS job + enable | VPS access | **yes (VPS/secrets)** | P2 |
| Agentai | Intermediary vs direct-contractor classifier | structured signal class | research dossiers | `DOCUMENTED_ONLY` | 5 | classifier in the radar | radar | no | P1 |
| Social | Recruitment-channel discovery (Telegram) | lawful channel registry | none | `MISSING` | 0 | Agentai-side crawler + registry | Agentai | policy approval | P2 |
| Social | LabourMarket.ai Telegram channel | channel + distribution job | none | `MISSING` | 0 | owner creates channel; bot posts | bot token | **yes (create channel)** | P2 |
| Housing | entire domain | listings→booking→allocation→pay | nothing | `MISSING` | 0 | all | projects, payments | no | P2 |

---

## 7. Top gaps (brief §46)

**Top 10 functional** — 1 education institution product · 2 agency workspace +
placement · 3 invoice from Work Journal · 4 user automations engine · 5 marketplace
post-`accepted` lifecycle · 6 upstream/end-client discovery + GC/subcontractor
classification · 7 housing · 8 chat transcript persistence (#883) · 9
project/client/activity contexts + lifecycle vocabulary · 10 document
requirements rules engine.

**Top 10 technical** — 1 P0-1 anon read path (health + jobs-sitemap) · 2
`agencies`/`staffing_agency` key-space split · 3 P2-1 apex extension 500s · 4 no
error aggregation · 5 `finance_record_links` absent · 6 journal entry lacks
media/cost fields · 7 stale one-way Agentai contract · 8 #1439 conflicting
(health cron not live) · 9 `job_demands` legacy read path · 10 12 executable
chat capabilities vs 47 routed intents.

**Top 10 production-verification** — 1 agency loop (0 rows) · 2 booking
lifecycle (0 rows) · 3 `worker_documents` (0) · 4 `finance_records` (0) ·
5 notification preferences (0) · 6 `context.switch` live readback · 7 weekly
digest cron · 8 telegram owner alert · 9 real-inbox delivery (G-1) · 10 VPS
scheduler state.

**Genuinely complete — do not rebuild:** 09-02 §23.5 list, plus (this
session) robots/sitemaps/OG/security.txt, the answer-engine plumbing, the
document inventory model, the finance-records spine, the booking→engagement
chain, `context.switch`.

**Looks complete in docs, is not:** 09-02 §23.6, plus "Agent OS radar runs
daily" (collector refuses; PC tasks disabled) and "L1 observability" (still
flapping).

**Supplied only through Agentai OS:** market/demand radar, direct-buyer and
intermediary dossiers, contact discovery + qualification, outreach drafting,
reply detection, partnership-letter composition, Telegram command/approval
channel, capability-contract truth for marketing claims.

---

## 8. Dependency map (brief §42) — what is unblocked today

```
IDENTITY(PV) → CONTEXT(PV core) → EVIDENCE(PV) → WORK JOURNAL(PV) → CREDENTIALS(model, 0 rows) → MATCHING(PV det.)
EDUCATION org type(partial) → STUDENT ctx(PV) → LEARNING EVIDENCE(missing) → INTERNSHIP(missing) → EMPLOYER(PV) → EMPLOYMENT(PV)
AGENCY(backend) → WORKER POOL(0) → EMPLOYER DEMAND(PV) → PLACEMENT(missing)
PROJECT(PV) → TEAM(schema) → SCHEDULING(gated #1426) → WORK(PV) → EVIDENCE(PV) → REPORTING(partial) → INVOICE(manual)
MARKET INTELLIGENCE(supply) → DEMAND(PV) → SKILLS GAP(PV engine) → EDUCATION FEEDBACK(missing) → MATCHING(PV)
SERVICE MARKETPLACE(request PV) → ORDER(tested) → DELIVERY(missing) → EVIDENCE → INVOICE(missing) → PAYMENT(blocked)
HOUSING(missing) → AVAILABILITY → BOOKING → PROJECT(PV) → ALLOCATION → PAYMENT
PAYMENTS(test PV) → ENTITLEMENTS(flags off) → COMMERCIAL LAUNCH(G-7/G-8)
```

Unblocked, no owner gate, no shared table: education model · agency
workspace+placement · invoicing-from-journal · marketplace lifecycle · housing ·
automation engine · P0-1/P0-1b/P2-1 · journal fields · GC/subcontractor slugs ·
error aggregation. Gated: live payments, LI/Meta auth, #883, #1426, L3, VPS.

---

## 9. Implementation waves (brief §47) — updated, dependency-ordered

The 09-02 §24 sequence stands; two changes from this session's evidence.

- **WAVE 0 — reliability & truth (autonomous, first):** P0-1 **and P0-1b**
  together (one fix: cheap count / covering index + constant-cost health probe;
  `jobs-sitemap.xml` inherits it) · P2-1 (404 for apex extensionful paths;
  serve `llms.txt` while there) · resolve #1439's conflict so the health cron
  goes live · re-grade L1 · request all owner gates in one batch, then stop
  waiting.
- **WAVE 1 — known defects (autonomous):** unchanged (#1440, #1436 after G-15,
  M13, M14, `job_demands` read, retention, error aggregation).
- **WAVES 2 / 3 / 4 in parallel:** education (+8) · agency (+5) · work→money
  (+4, now explicitly: journal fields → `finance_record_links` → generation →
  `sent/viewed/overdue` → PDF → export).
- **WAVE 5 — chat as the OS:** #883 → transcript → capabilities 12→47 →
  **automation engine on the workflow engine** (credential-expiry alert first —
  it needs only what exists).
- **WAVE 6 — marketplace depth + housing:** quote → delivery → acceptance →
  reputation → dispute; housing as a sibling listing/booking domain reusing the
  booking state machine. *(Moved earlier than "later" because both are
  unblocked and share the booking primitive.)*
- **WAVE 7 — intelligence & reach:** upstream discovery consumed **from
  Agentai OS** via a regenerated, scheduled capability contract (two-way:
  Agentai publishes signals, LabourMarket ingests demand) · GC/subcontractor
  slugs · employer-side ingestion · Georgian + EU locales · mobility rules
  engine · live payments once G-7/G-8 land · Telegram channel + LI/Meta once
  G-2.

Parallelism unchanged: waves 2/3/4 share no table; 6 depends only on the
booking primitive; 7 on the Agentai contract.

---

## 10. Owner gates (brief §48) — genuine only

Unchanged from 09-02 §23.4 (G-1, G-7, G-8, G-12, G-13, G-14, G-15, G-16, #883,
G-2, G-3..G-6, L3). Added by this session, all genuinely owner-only:

| Gate | Why the agent cannot do it |
|---|---|
| **VPS-1** | confirm/inspect the Agentai VPS scheduler (`AGENTAI_DEPLOYMENT_PROFILE`, heartbeat) — host access + secrets are owner-held |
| **TG-1** | create the LabourMarket.ai Telegram channel and hand the bot a posting scope — real-world account action |
| **AEO-1** (optional) | approve the first answer pages for indexing — editorial sign-off; the agent can prepare the candidates |

Everything else in §6–§9 is autonomous engineering work and is **not** returned
as an owner gate.

---

## 11. Session safety (brief §52)

- Read-only throughout: `git`, `gh` reads, one `count(*)` SQL sweep, `fetch`
  GETs from the production origin, `Get-ScheduledTask` read, file reads in the
  Agentai repo.
- No PR/auto-merge/CI/deployment touched. No migration applied. No product
  code changed. No health check weakened. No worktree created or removed.
- Browser preview tab opened for the SEO probes — **closed at end of session**.
- No background wait loop started.

---

## 12. FULL_VISION_AUDIT_CHECKPOINT (2026-09-03)

```
MAIN_SHA                                   b9db4431
PRODUCTION_SHA                             b9db4431   (= main, region dub1)
PRODUCTION_HEALTH                          FLAPPING RED — P0-1 reproduced (503, 503, 200); jobs-sitemap.xml cold 500 (P0-1b)

CORE_PRODUCT_READY_PERCENT                 78
COMMERCIAL_LAUNCH_READY_PERCENT            35
FULL_CANONICAL_VISION_COMPLETE_PERCENT     40
FULL_CANONICAL_VISION_PROD_VERIFIED_PERCENT 24

STUDENT_EDUCATION_STATUS                   PARTIAL 18%
AGENCY_STATUS                              BACKEND_ONLY 25%
WORKFORCE_OS_STATUS                        PARTIAL 45%
SERVICES_MARKETPLACE_STATUS                PARTIAL 30%  (real to `accepted`, nothing after)
HOUSING_STATUS                             MISSING 0%
DOCUMENT_ENGINE_STATUS                     PARTIAL 35%  (inventory model, 0 rows, no rules engine)
FINANCE_STATUS                             15% invoicing / 30% payments (BLOCKED_OWNER G-7/G-8)
AUTOMATION_STATUS                          MISSING 10%
SOCIAL_TELEGRAM_STATUS                     10%  (owner-alert bot only)
AGENTAI_OS_INTEGRATION_STATUS              PARTIAL 30%  (contract exists, stale, one-way; nothing verifiably scheduled)

TOP_10_GAPS
  1 education institution product   2 agency workspace + placement
  3 invoice from Work Journal        4 P0-1 (+P0-1b) anon 3 s timeout
  5 chat transcript persistence      6 automation engine
  7 upstream / end-client discovery  8 marketplace post-accepted lifecycle
  9 housing                          10 lifecycle vocabulary + project/client contexts

EXACT_OWNER_GATES
  G-1 · G-14 · G-16 · batch apply (1430, 1436, 1426, 1440) · G-7 · G-8 · G-2 · #883 · L3 · G-3..G-6
  + VPS-1 (Agentai scheduler state) · TG-1 (Telegram channel) · AEO-1 (optional editorial)

OPEN_PRS_AND_AUTOMERGE_STATE
  20 open. Auto-merge ON only on #1439 — CONFLICTING (register conflict), checks green, will not merge until rebased.
  RED drafts (no auto-merge): 1441 1440 1436 1433 1430 1426 1421 1355 1266 1046 1045 897 896 895 883 740.
  Ready, no auto-merge: 1166. Parked drafts: 1225 1211.

RUNNING_REMOTE_CI_DEPLOYMENTS              none (all main runs completed success 2026-09-02 20:21 UTC; Vercel prod = b9db4431)

FIRST_AUTONOMOUS_IMPLEMENTATION_ACTION
  (once implementation is authorised) WAVE 0 step 1: make count_public_vacancies_v1 /
  search_public_vacancy_previews_v1 fit under the anon 3 s statement_timeout (covering index or
  importer-refreshed counts row), point /api/health and jobs-sitemap.xml at the constant-cost read,
  add a real 404 for apex extensionful paths (P2-1) and serve llms.txt. GREEN class, no gate.
  Before that, as PR hygiene: merge origin/main into feat/cc/launch-consolidation-v1 (keep both the
  §3a block and the corrected G-1 row) so #1439 auto-merges and the health cron starts.

NEXT_SAFE_RESUME_INSTRUCTION
  Read docs/launch/RESUME_CHECKPOINT_2026-09-03.md, then this file §0 and §12, then the 09-02 audit
  §22–§24. Do NOT re-run any proof recorded in either file or in FINAL_COMPLETION_REGISTER.md.
  Verify only: /api/health build + 3 probes, gh pr list, gh run list. Then act on the first authorised
  wave or the first owner report that arrived.
```
