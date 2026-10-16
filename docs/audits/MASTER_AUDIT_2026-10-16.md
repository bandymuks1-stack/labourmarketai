# MASTER PRODUCT, ENGINEERING & COMMERCIAL AUDIT — 2026-10-16

| Field | Value |
|---|---|
| **Baseline** | `main` = `8e8d1bf04` (fix(test): mark each Vitest run's temp dir…, #2423). Branch `claude/labourmarketai-audit-997c87` sat exactly on it. |
| **Scope** | Whole repository, read against the canonical architecture ([`OWNER_TARGET_ARCHITECTURE_V1`](../OWNER_TARGET_ARCHITECTURE_V1.md)), the doctrine, the constitution and decisions 0006–0024. Eight pillar sweeps + security sub-sweeps + two research passes, all read-only; six repair branches afterwards. |
| **What this session could NOT do** | Reach production: the Supabase MCP server timed out at connect, and Vercel has the account **blocked** since 2026-10-15 (`health-probe` fails on `main`; every PR shows "Account is blocked"). Every production claim below is therefore taken from the repository, the ledger snapshot, the GitHub record and prior-session memory, and is marked as such. No migration was applied; nothing was deployed; no PR was merged. |
| **Deliverables** | A. [`docs/product/PRODUCT_MASTER_SPEC.md`](../product/PRODUCT_MASTER_SPEC.md) · B–D, H and the research summaries: this file · E–G: [`docs/launch/GROWTH_AND_ROADMAP_2026-10-16.md`](../launch/GROWTH_AND_ROADMAP_2026-10-16.md) |

---

## 0. Executive summary

**The product is far more built than it is proven, and far more honest than most of its documentation says.** Of 111 registered capabilities 34 are usable and 69 partial; the two headline journeys the register still marks broken (J-TIME-FREEDOM override, brigade-as-unit) have their code merged and the only open question is the production ledger. The security posture is strong where it matters (RLS-first, append-only ledgers, consent ledger, no third-party trackers, default-deny AI egress). Workers have no paid gate anywhere.

**Three findings change the owner's picture:**

1. **Live Stripe charging is armed** (since 2026-09-05) while the live webhook → entitlement path has never fired. The inventory said "test mode, nothing has ever run". A trial can convert to a real €99 charge today. (§3 B-1/B-2; owner decision N-1.)
2. **Privacy refusals were counted as AI runs and costed as spend** — enough refusals block the one AI task the gate allows, and month-end spend included phantom runs. Fixed in PR branch 2.
3. **Three honest-copy statements were false against the code** (the privacy notice over-describes what Gemini receives; the cookie page omits attribution storage; the chat told a produce seller "there is no channel" while the goods board accepted the listing). Fixed in branches 3 and 5.

**Verdict: NOT READY** for an unattended public launch today, for reasons that are mostly outside the code: hosting is blocked, the live payment path is unproven, the erasure executor is unapplied with a real request due ~2026-11-14, and no human has walked the authenticated product in production since the last deploy. The code itself is **READY WITH BLOCKERS** (§8).

---

## 1. Verification record (exactly what ran)

All commands ran on this worktree with `node_modules` freshly installed (`pnpm install --frozen-lockfile`, exit 0).

| Check | Command | Result on `main` 8e8d1bf04 | Result on the integration of all six fix branches |
|---|---|---|---|
| Typecheck | `pnpm -F web typecheck` | **0 errors** | **0 errors** |
| Lint | `pnpm -F web lint` | **0 errors**, 75 warnings | **0 errors** |
| Unit + guard tests | `pnpm -F web test` | **29,870 passed, 4 skipped, 34 todo; 3 failed** — all three were 5 s timeouts under full-machine load (`lib/cv/extract.test.ts` DOCX, `lib/ops/product-metrics.test.ts` directory walk, `lib/timesheet-import/ooxml-fallback.test.ts`); each **passes in isolation** (re-run individually, including the DOCX test). Not product defects; a test-robustness note (§3 LOW-7). | **29,904 passed; 8 failed** on the first integration run: 2 = the same timeouts; 6 = three guard files pinning the OLD wording/contract (`no-gamification-terms` and `public-mechanism` on the new privacy copy — "switched on" and "formulate" are banned words; `t07-stadium` pinning the server-midnight day). All six were fixed on their branches (commits `a8516857e`, `98d4fbaaa`) and those guard files re-run green (253 and 233 tests). No product regression. |
| Build | `pnpm -F web build` | not run on bare main (CI delegates the build to Vercel) | **exit 0** on the integration tree (compiled in 7.6 min; twice) |
| Placeholder, fit-signal, pilot-honesty, pricing-honesty, plain-language, constitution, primary-route smoke, public-SEO indexing, i18n-debt ratchet, product-truth `--check`, migration-safety | the `quality.yml` steps, run locally | — | **all exit 0** on the integration tree |
| Product gate | `node .github/scripts/product-gate.mjs` | — | reports 47 pre-existing waived surfaces as "not waived — this run is not a PR"; the waivers are bound to PR numbers by design, so a local run always says this. No new surface is introduced by any branch. |
| Per-branch targeted suites | `vitest run <pillar dirs>` | — | journal + capabilities 2,116; AI/communication/staffing 904; marketplace/services 1,216; i18n/seo/public-copy 1,405; privacy/admin 393; projects/time/company 1,347 — all green |
| End-to-end, DB-executed RLS, production walk | — | **not possible** (no DB, no hosting) | — |

The three timeouts and CI-vs-local parity note: CI's `quality` job passes on `main` (the latest `quality` run on 8e8d1bf04 is green); the local machine was running eight concurrent audit agents during the suite.

---

## 2. Product Reality Matrix (deliverable B)

Legend: **Intended** = APPROVED target · **Current** = what the register and code say · **Verified** = the strongest evidence level reached (HUMAN-UI-PROVEN > PRODUCTION-DATA-PATH > TEST-PROVEN > CODE-EXISTS) · Defects reference §3.

| Pillar | Intended state | Current implementation | Verified | Confirmed defects | Missing capabilities | Improvement opportunities |
|---|---|---|---|---|---|---|
| **Work Journal** | One append-only record per real work event with date, time, client, project, site, works, materials, equipment, expenses, photos, documents, counterparty confirmation; chat-first; historical continuity; calendar/capacity | ONE write core for web/chat/MCP; atomic RPC; dedupe; project attribution rule; chat intake persists durations; supersede/soft-delete; counterparty review doors; self-confirmation refused at DB; org-supplied records with subject refusal; two import chains; calendar as projection | HUMAN-UI-PROVEN (entry, journal→skills→CV, counterparty confirm walk 10-11) | J-1 future date (HIGH, fix in #2432); J-2 hash chain not verifiable (MED, RED); J-3 language = UI locale (MED, fix in #2432); J-4 start/end dropped (MED, fix in #2432); J-5 ghost fallback (LOW, fix in #2432); J-6 worker may delete confirmed skill links (LOW, RED) | materials/equipment/expenses as universal fields (archetype-only today); documents as evidence attachments; >1 photo; batch reversal for xlsx import; DB-executed RLS tests | Make the first journal entry the activation (today: "add skills"); day-plausibility already exists — surface it on save |
| **Living CV** | Grows from real activity; evidence provenance; public/private with consent; multilingual; mobile; employer discovery by permission | /cv own-only, print-to-PDF, EU view, tailored mode, growth horizon, potential skills at read time; discovery through `can_view_worker` | HUMAN-UI-PROVEN (import chain), TEST-PROVEN (potential) | none new | share/public proof link (`visibility_scope` always closed); consent to name a confirmer; potential section on the CV document; server-side PDF; original-language-only text | Consented public Living CV page = the single strongest growth asset (§ growth) |
| **Company / Team OS** | Daily operational value: projects, sites, tasks, assignment, scheduling, calendars, conflicts, capacity, hours, evidence, progress, communication, reports, forecasting, cross-company | Authority projection; fail-closed workspace switch; teams with consent-only membership and unit offers; projects full lifecycle + trace + CSV + handover; tasks with advisory dependencies; commitment detection → warning → alternatives → override receipt; roster conflicts; approvals engine; agency bridge; procurement; agreements | PRODUCTION-DATA-PATH (brigade chain 10-12), HUMAN-UI-PROVEN (B2B negotiation 10-11) | C-1 register marks two journeys BROKEN whose code exists (HIGH truth); C-2 project count 0 on failure (MED, fix in #2437); C-3 stadium server-midnight + 0 on failure (MED, fix in #2437); C-4 capacity ignores bookings/trips/absences/plans (MED, open); C-5 stale ORG-2 assessment (LOW); C-6 end-assignment gate (LOW, fix in #2437); C-8 dead agency_workers reads (LOW) | override receipts never read into forecasting; agency commissions; plain company as a project unit (only teams); project P&L / plan-vs-actual; pending-decisions count on the company home; journal → hours page link | Feed the five commitment sources into the capacity model (C-4) — the one change that makes "who is free" agree with "who is committed" |
| **Universal Marketplace** | Employment, temp/permanent, subcontracting, services, goods, second-hand, B2B, team offers, individual trade, international | Five listing domains + publish policy; services + requests; team offers; federated discovery; enquiry → conversation; public business page; public job board (no JobPosting); value-channel verdicts | HUMAN-UI-PROVEN (listings/services walks), PRODUCTION (Option C applied 10-07) | M-1 goods refused by chat (HIGH, fix in #2434); M-2 failed read = empty (MED, fix in #2434); M-3 federated vacancies carry no country for members (MED, open); M-4 EUR default (fix in #2434); M-5 ISO text input for country (LOW); M-6 radius label (fix in #2434); M-7 seek-goods kind (fix in #2434) | route distance; distance on listings; logistics cost; conditions; delivery/pickup; currency on offerings/requests; condition attribute; photos; trader/private flag; "I need goods" NL reading; country filter on public board (RED #2209) | Cross-border field set as one coherent listing extension (owner decision N-2) |
| **Cross-border** | Both parties see city, country, straight-line and route distance, shipping implications, logistics cost, currency, conditions; private addresses protected | Country model (all ISO, currencies, zones), city coordinates for ~9 of 17 markets, haversine in matching only, Waze deep link never to a home, NAV NO + SE ingestion live | TEST-PROVEN | M-3; M-6 (fix in #2434) | everything in the "Missing" cell above except country and straight-line | — |
| **AI** | One AI, chat as control layer; no fake AI; default-deny egress; measurable value only | 14 agents, 13 task types, 10 call sites, deterministic router (71 intents) first; honest off-states; grant-gated egress; cost ledger; MCP door 229 tools | PRODUCTION (60 runs/7 d, 83 × 429) | AI-1 refusals counted and costed (HIGH, fix in #2433 — chain-path matcher corrected after review); AI-2 monitor blind to 429s (MED, PR #2419); AI-3 human_review_state unresolvable (MED); AI-4 anon preview wrote ledger rows (MED, fix in #2433); AI-5/6/7 LOW | money cap; per-org cost view; LibreTranslate host; router-miss sampling | Make market explanation deterministic; remove six registered agents with no call site |
| **Monetization** | 1 LMC = €1; free tier real; worker never pays to apply; employer premium = discovery/contact/shortlist/communication/visibility | Stripe live €99 org plan enforced via open-needs limit; LMC ledger strong but all flags false and no app caller | PRODUCTION (live customers exist), webhook path NEVER observed | B-1 live armed by public literal (HIGH, RED); B-2 webhook unproven (HIGH, owner); B-3 money RPC revoke unapplied (MED, RED); B-4 no uniqueness on payment reference (MED, RED); B-5/B-8 stale docs (fixed here); B-6 "test-checkout" naming (LOW); B-7 no expiry cron (LOW) | metering for declared boundaries; worker/agency plans; catalogue prices | Decide N-1 first |
| **Privacy / GDPR** | Consent, minimization, notices, deletion, export, retention, audit | Consent ledger; export v3; request intake + review; ai_runs redaction; no trackers; egress gate; erasure v2 drafted | TEST-PROVEN; local PG16 for #2426 | G-1 notice over-describes Gemini (HIGH, fix in #2436); G-2 storage undisclosed (HIGH, fix in #2436); G-3 export withholds messages (MED, RED); G-4 export unthrottled/unaudited (MED); G-5 no DSR due date (MED, fix in #2436); G-6 allowedFields unenforced (MED); G-7 retention unenforced (MED, owner); G-8 admin reads unaudited (MED); G-9..12 LOW | request channel for people without accounts; Art. 16/18/21 types; completion notice; runbook for #2426 | Amend #2426 per §5 before approval |
| **UX / public surface** | Three-second clarity; universal, positive; progressive disclosure; mobile; accessibility | Landing frozen by owner; 84 dashboard routes; role gates centralised; 6 locales at parity; 3 sitemaps; honest llms.txt; Expo app CI-built | HUMAN-UI-PROVEN (prod walks through 10-12) | U-1 unmatched language → LT (HIGH, fix in #2435); U-2 x-default LT (HIGH, fix in #2435); U-3 "not just a job search" on /about (HIGH, fix in #2435); U-4/5 dead negative copy (MED); U-6 LANGUAGE_MATRIX stale; U-7 unused three.js deps; U-8 framer-motion on LCP; U-10 39k near-duplicate job pages; U-11 empty /questions in sitemap; IA-1..4; A11Y-1 focus lost after send, no dashboard skip link, 115 border-only focus styles, contrast fails on muted/30–60 | sv/no locales; public profiles; profession × country pages | Landing rewrite proposal (owner-gated by the freeze) in the growth doc |
| **Distribution** | Six surfaces, one capability layer | Web/PWA; Android/iOS built in CI; MCP door current revision | CI-PROVEN | — | store accounts, signing, App Links env, QA password (all owner) | — |

---

## 3. Engineering audit — confirmed defects by severity (deliverable C)

Status: **FIXED** = in a repair branch of this audit (§4) · **OPEN-GREEN** = code-only, not yet done · **RED** = needs a migration/policy/secret and the owner gate · **OWNER** = an action only the owner can take. Paths are under `apps/web/` unless stated.

### CRITICAL
None confirmed. (A "CRITICAL" would be data loss, a cross-tenant leak or a live charge without consent. None was found in code; B-1 is HIGH because the charge path is consented through Stripe's own checkout.)

### HIGH

| Id | Where | Defect | Evidence | Status |
|---|---|---|---|---|
| B-1 | `lib/billing/config-core.ts:67,118-150`, `config.ts:34-46`, `readiness.ts` | Live Stripe is armed by a code constant + an env value equal to the public literal `approved-by-owner`; the DB flag `live_payments_enabled` is read by nothing | `docs/launch/MASTER_COMPLETION_MAP_2026-09-05.md:30,112` (live session, live customer); grep of `live_payments_enabled` → `lmc-flags.ts` only | RED + OWNER (N-1) |
| B-2 | `app/api/billing/webhook/route.ts`; recovery workflow inert | Live webhook → entitlement never observed (0 events); only user-driven `/api/billing/refresh` reconciles | memory 10-11 "0 webhooks"; `OWNER_ACTION_QUEUE_2026-09-02.md:27` | OWNER (register endpoint, run smallest live charge + refund) |
| AI-1 | `lib/ai/run-agent.ts`, `run-agent-server.ts`, `runtime/audit-store.ts:351-360`, `runtime/org-run-cap.ts:75-80`, `lib/usage/usage-cost-store.ts:157-172` | Egress refusals persisted without a block reason → counted by both budgets; costed with an estimate for a model that never ran | code; #2419 commit message | **FIX IN PR** (branch 2, see §4) |
| J-1 | `lib/journal/journal-write-core.ts:573-574`, composer date input, MCP draft | Future `work_date` accepted on composer/chat/MCP (only document drafts refused) — FACT ≠ FORECAST | code | **FIX IN PR** (branch 1, see §4) |
| M-1 | `lib/value-channels/eligibility.ts:184-252`, chat, 6 locale keys | Chat refuses lawful goods / tells produce sellers "no channel" while the goods board is live (TEST B fails) | code vs `market-model.ts` | **FIX IN PR** (branch 3, see §4) |
| C-1 | `lib/product-gate/journey-register.ts:238-242,370-374` | Register marks the override step and brigade-as-unit BROKEN with reasons that no longer describe the code | `override-keep-core.ts`, 20261003150100, 20261012110000/180000 merged | OWNER (ledger read) then docs |
| U-1 | `lib/i18n/routing.ts`, middleware | Unrouted-language first visit lands on Lithuanian | next-intl fallback | **FIX IN PR** (branch 4, see §4) |
| U-2 | `lib/seo/metadata.ts:126` | `x-default` = `/lt` on all public pages and ~39k job URLs | code | **FIX IN PR** (branch 4, see §4) |
| U-3 | `messages/*.json` `about.lede` | Indexed /about defines the product by negation (§7.1) | code | **FIX IN PR** (branch 4, see §4) |
| G-1 | `messages/*.json` `legal.privacy.sections[7]` | Notice says Gemini translates messages/ads and reads intents; code sends only public market stats today | `task-routing.ts:456`, `data-egress.ts:13-14` | **FIX IN PR** (branch 5, see §4) |
| G-2 | `lib/telemetry/attribution.ts:25`, `task.ts:32`, cookie page | Attribution + session storage undisclosed | code | **FIX IN PR** (branch 5, see §4) |

### MEDIUM

| Id | Where | Defect | Status |
|---|---|---|---|
| J-2 | `journal-write-core.ts:609-620`, `actions.ts:218-228`, RPC 0017 | Hash chain mixes an unstored timestamp (not recomputable), client supplies `hash_prev`, no unique index, head definition differs from supersede. **Raised to HIGH by the security sweep (SEC-3, §6): a worker can insert forged hashes via PostgREST.** | RED (hash + prev in a BEFORE INSERT trigger, `verify_journal_chain_v1`, unique `(worker_id, hash_prev)`) |
| J-3 | `journal-write-core.ts:508`, `actions.ts:119` | `original_language` = raw UI locale; invalid → raw insert failure | **FIXED** (validated) — deeper fix (detect text language) OPEN-GREEN |
| J-4 | `lib/conversation/worklog-extract.ts:12-16` | start/end/break never reach the record | **FIX IN PR** (§4) |
| B-3 | `supabase/migrations/20261006100300…` | Revoke of `authenticated` EXECUTE on the money RPCs — **CLOSED 2026-10-16 (evening): production read shows `authenticated` has no EXECUTE on any of the six; the migration is applied** | closed |
| B-4 | `lmc_record_purchase_v1` | No uniqueness on external payment reference | RED |
| B-5 | `docs/CAPABILITY_INVENTORY.md` MKT-7 rows | "test mode; nothing has ever run" is false | **FIXED** (this docs PR) |
| AI-2 | `lib/ops/product-monitor.ts:56,116-118` | AI monitor counts only schema failures; 429s invisible | OPEN (merge PR #2419, GREEN) |
| AI-3 | `runtime/task-routing.ts` policies, `audit-store.ts:258` | `human_review_state = pending` can never be resolved (append-only, no reader) | OPEN-GREEN (record the UI confirm as its own audit row, or drop the semantics) |
| AI-4 | `lib/staffing/match-preview-actions.ts:98-115` | Anonymous surface wrote audit + ledger rows for an always-refused task | **FIX IN PR** (§4) |
| M-2 | `lib/marketplace/listings.ts`, `service-requests.ts`, `lib/services/service-offerings.ts` | Non-absent errors → `{ ok, rows: [] }` | **FIXED** (`unavailable`) |
| M-3 | `lib/marketplace/federation-model.ts:253-254,370-371` | Federated vacancies carry no country even for members | OPEN-GREEN (member reader) |
| C-2 | `lib/projects/map.ts:47-66` | Project card "0 people" on a failed read | **FIX IN PR** (§4) |
| C-3 | `lib/projects/stadium.ts:40-44,56,82` | Server-midnight day; 0 on failure | **FIX IN PR** (§4) |
| C-4 | `lib/workforce/workforce.ts:589-598` | Capacity model sees only dated project assignments | OPEN-GREEN |
| G-3 | `lib/privacy/personal-relations.ts:574-649` | Export withholds messages and the subject's own requests | RED (subject-safe RPC) |
| G-4 | `dashboard/privacy/export/route.ts:21-40` | Full export unthrottled and unaudited | OPEN-GREEN |
| G-5 | `20260706150000`, `lib/admin/privacy-requests.ts` | No DSR due date / overdue flag | **FIXED** (queue) |
| G-6 | `runtime/task-routing.ts` `allowedFields` | Declarative only; no runtime pick | OPEN-GREEN |
| G-7 | `docs/legal/data-retention-matrix-v1.md` vs code | Retention enforced only for `ai_runs` | OWNER then RED |
| G-8 | admin privacy/export reads | No audit row for admin reads of personal data | OPEN-GREEN |
| U-4/5 | `messages/*` dead `hero.*`, `landing.workers.i5` ("eleven languages"), `opportunities.noWorkType.body`, `workers.profile.bullets.1` | Negative framing / false capability claim in catalog (unreferenced or dashboard) | OPEN-GREEN |
| U-6 | `docs/LANGUAGE_MATRIX.md` | 5 routed / 10,263 leaves vs 6 / 14,892 | OPEN (docs) |
| U-7 | `package.json` | `three`, `@react-three/fiber`, `@types/three` imported by nothing | OPEN chore (lockfile regeneration failed locally on a store error; do it in a clean install) |
| U-8/9 | `components/marketing/reveal.tsx`, `two-sides-lifecycle.tsx` | framer-motion static on the landing path | OPEN-GREEN (CSS + IntersectionObserver); `optimizePackageImports` **FIXED** |
| U-10 | `(marketing)/jobs/[id]/page.tsx:87,119-125` | ~39k pages share one description, occupation-only title | OPEN-GREEN (structured description) |
| U-11 | `lib/answer-engine/registry.ts` (0 approved) | Empty /questions hub in sitemap + llms.txt | OPEN-GREEN (gate on published count) |
| IA-1 | `components/app/company-setup-form.tsx:255-256,~325` | Country and contact e-mail asked again after onboarding | OPEN-GREEN |
| IA-2 | `lib/worker/work-card-state.ts:77-134` | First worker ask is "add skills", not a journal entry | PROPOSED (product) |
| IA-3 | `company-model-screen.tsx:46-61` vs `organization-doors.ts:51-60` | "market" means two routes; two calendar routes | OPEN-GREEN |
| IA-4 | `components/marketing/work-lifecycle-section.tsx:26` | Public pages link to the admin-only sample preview `/dashboard/talent` | OPEN-GREEN |
| A11Y-1 | `conversation/chat/composer.tsx:168-173,287` | Focus lost after send; border-only focus; no IME guard | OPEN-GREEN |
| A11Y-2 | `components/app/dashboard-chrome.tsx:157,178`; 7 marketing pages | No dashboard skip link; duplicate `#main-content` | OPEN-GREEN |
| A11Y-3 | `text-text-muted/30…/60`, `brand-violet` on ink-800 | Contrast below 4.5:1 (1.6–3.2; 4.19) | OPEN-GREEN |
| SEC-1 | signup, `/api/waitlist`, `/api/cv/extract`, AI actions | All app-side limiters are per-instance memory; no CAPTCHA | OPEN-GREEN (Turnstile needs an owner key) + OWNER (Supabase Auth limits) |
| SEC-2 | `lib/mcp` bearer | Bearer token = full user session; scope limitation is RED #2336 | RED |

### LOW

| Id | Where | Defect | Status |
|---|---|---|---|
| J-5 | `journal-write-core.ts:440-452` | Legacy fallback compensation result discarded | **FIX IN PR** (§4) |
| J-6 | `20260602120000:69` | Worker may delete own `journal_entry_skills` rows with `status='confirmed'` | RED |
| J-7 | `OWNER_TARGET_ARCHITECTURE_V1.md:631,639` | EVID-2 and ARCH-5 listed open though code closes them | OWNER (ledger) then docs |
| J-8 | `messages/{lv,et,no,da,sv}.json` | 227/275 journal keys missing (inactive locales) | — |
| B-6 | `app/api/billing/test-checkout` | Named "test" but creates LIVE sessions | OPEN-GREEN |
| B-7 | — | `lmc_expire_lots_v1` has no scheduler | OPEN (workflow stub) |
| B-8 | `lmc-canonical-commercial-catalogue-v1.md:146,164` | "nothing decided" vs approved €0/€0/€99 | OPEN (docs) |
| AI-5 | `runtime/config.ts:75-79` | `AI_API_KEY` fallback makes gemini "live" with a foreign key | OPEN-GREEN |
| AI-6 | `providers/gemini.ts:41` | Undefined alias → `models/undefined` URL | OPEN-GREEN |
| AI-7 | `lib/ai/README.md`, `registry.ts:5,44` | Stale counts | OPEN (docs) |
| M-5 | `marketplace-listings-section.tsx:694-702` | Free 2-letter ISO input; raw codes displayed | OPEN-GREEN |
| C-5 | `lib/product-gate/organization-roles.ts:239-256` + guard | ORCHESTRATION_ASSESSMENT stale vs register | OWNER then docs |
| C-7 | comments | Fixed | **FIX IN PR** (§4) |
| C-8 | `lib/agency/agency-workers.ts:130`, `pool.ts:116` | Dead reads of a never-granted table | OPEN-GREEN (retire) |
| G-9 | `20260711130000:399,547` | Withdrawal rows hard-code `'lt'` | RED |
| G-10 | same `:235,572,618` | "current" compares version not hash | RED |
| G-11 | `middleware.ts` | No runtime/region pin | OPEN-GREEN |
| G-12 | several `console.error(..., error)` | Raw PostgrestError objects logged | OPEN-GREEN |
| U-12..16 | professions page inline locale map; hero `grid-cols-3`; 9 icon buttons < 44 px; manifest without shortcuts; no `loading.tsx` on marketing/auth/business | — | OPEN-GREEN |
| LOW-7 | `lib/cv/extract.test.ts`, `lib/ops/product-metrics.test.ts`, `lib/timesheet-import/ooxml-fallback.test.ts` | 5 s default timeout too tight for real-parser tests on a loaded machine | OPEN-GREEN (`testTimeout` on the three) |
| LOW-8 | repo workspace | 30 worktrees registered (guard blocks new ones at 20); `C:\lmw-1815`, `C:\lmw-cons`, `C:\lmw-integ`, `C:\lmw-time` are forbidden locations; `fix/cc/worktime-timezone-v1` is merged (#2159) and prunable | OWNER (cleanup per the workspace policy; never `--force`) |

---

## 4. Repair programme (deliverable D)

Six isolated branches, each green on typecheck, lint and its pillar suites, each pushed, **none merged** and **auto-merge not enabled** (the owner's brief: do not merge to main without approval). All are GREEN class (no migrations).

| # | Branch | Commit | Fixes | Tests added / changed |
|---|---|---|---|---|
| 1 | `fix/cc/audit-journal-fact-integrity` — [#2432](https://github.com/bandymuks1-stack/labourmarketai/pull/2432) | `7f2e9d564` | J-1, J-3, J-4, J-5 | `work-date.test.ts` (core pin), `intake-work-time.test.ts` (span metrics), new `journal-fact-integrity.test.ts` |
| 2 | `fix/cc/audit-ai-refusals-never-count` — [#2433](https://github.com/bandymuks1-stack/labourmarketai/pull/2433) | `587cb1cbf` | AI-1, AI-4 | new `runtime/egress-precheck.test.ts` (pure rule + source pins); translation tests mock the pre-check; cost-accounting guard pin updated |
| 3 | `fix/cc/audit-marketplace-goods-honesty` — [#2434](https://github.com/bandymuks1-stack/labourmarketai/pull/2434) | `040ff6eb7` | M-1, M-2, M-4, M-6, M-7, NAV channel | `eligibility.test.ts` fixtures A/A′ |
| 4 | `fix/cc/audit-international-entry` — [#2435](https://github.com/bandymuks1-stack/labourmarketai/pull/2435) | `96a824692` | U-1, U-2, U-3, U-9 | new `lib/i18n/entry-locale.test.ts` |
| 5 | `fix/cc/audit-privacy-notice-honesty` — [#2436](https://github.com/bandymuks1-stack/labourmarketai/pull/2436) | `e2787ed42` + `a8516857e` | G-1, G-2, G-5 | new `lib/privacy/dsr-deadline.test.ts`; queue test updated |
| 6 | `fix/cc/audit-company-unknown-not-zero` — [#2437](https://github.com/bandymuks1-stack/labourmarketai/pull/2437) | `a1a0eab6d` + `98d4fbaaa` | C-2, C-3, C-6, C-7 | new `lib/time/day-start-instant.test.ts` |
| 7 | `docs/cc/master-audit-2026-10-16` | this | master spec, this audit, growth/roadmap, inventory MKT-7 truth | — |

**Integration proof:** the six branches merge cleanly (`tmp/audit-integration-2026-10-16`, local only, deleted after the run). On that tree: typecheck 0, lint 0 errors, `next build` exit 0, every `quality.yml` static gate exit 0 (placeholders, fit-signal, pilot-honesty, pricing-honesty, plain-language, constitution, primary-route smoke, public-SEO indexing, i18n-debt ratchet, product-truth `--check`, migration-safety GREEN), full Vitest 29,904 passed with the 8 failures explained in §1 (2 timeouts + 6 guard pins since fixed on their branches).

**What remains unresolved after these PRs:** everything marked OPEN-GREEN, RED or OWNER in §3. The OPEN-GREEN items are ordered in the roadmap (§G of the growth document) by user impact.

---

## 5. PR #2426 (GDPR erasure executor v2) — review notes for the owner

Do **not** apply as drafted. The catalog-driven design, dry run and append-only receipt are right; five amendments are needed first:

1. **Cascades need a decision too.** FKs with `ON DELETE CASCADE` are executed without a registry row (MIG:241-248). `journal_entries.worker_id` cascades and has no delete trigger (RLS-only append-only; SECURITY DEFINER bypasses it), so a worker's whole journal and its confirmations would vanish silently — those are the employer's legal working-time evidence. `billing_customers` / `billing_subscriptions` also cascade, deleting the Stripe mapping while Stripe keeps the customer.
2. **Stated scope limits:** single-column FKs onto `profiles`/`workers` only; e-mail/name columns (`invitations.invited_email`, `waitlist.email`, request contacts, message bodies), jsonb beyond one `audit_logs` LIKE scan, and `ai_runs.output_excerpt` (profile set NULL, excerpt survives) are outside; no static guard fails when a new person reference is added.
3. **`usage_cost_events.profile_id` SET NULL is blocked by its own BEFORE UPDATE trigger** → every account with AI usage fails "cascade failed". Fail-closed, but not listed as a dependency.
4. **Confirmation is a static word ("ERASE")**, not a state-bound single-use token (decision 0024); the GET rehearsal takes an ACCESS EXCLUSIVE lock on every render with the query param.
5. **Outside the database:** `auth.audit_log_entries` untouched; storage scan is `owner_id`-only (server-side uploads have NULL owner — a path-prefix scan is missing); Stripe, e-mail provider and Gemini retention not addressed; **no production runbook** (apply via MCP, who clicks, where the receipt goes, how the Art. 12 reply is produced).

The open request (filed 2026-10-14) is due about **2026-11-14**.

---

## 6. Security posture — static Supabase/PostgreSQL sweep (no live catalog)

Method of the delegated sweep: a Node extractor over all 401 migrations (tables, RLS, policies, grants, FKs, indexes), a SECURITY DEFINER grant simulator (last definition wins, grants replayed in file order), file-by-file reading of the newest 40 migrations, and application-side greps. No DB connection; "applied in production" is not knowable statically (the parity snapshot is from 2026-09-08, ~130 migrations old — refresh it via read-only MCP `list_migrations`).

**Strong (confirmed by reading):**
- **RLS coverage is total:** 240 live tables, 0 without `enable row level security`, 384 policies; the 9 tables with RLS and no policy are intentional function-only/service tables.
- **No wide write policy.** The only `with check (true)` is the throttled anonymous `waitlist` insert; every anonymous write path has DB-enforced ceilings since 20260829130000. The 11 `using (true)` policies are all SELECT on reference/taxonomy tables. No `to anon` SELECT policy on any table; anon table grants are exactly two INSERTs.
- **Explicit-grant model:** no `ALTER DEFAULT PRIVILEGES`, no `ON ALL TABLES/FUNCTIONS`; production `pg_default_acl` empty (documented).
- **SECURITY DEFINER discipline:** 562 effective functions, **562/562 pin `search_path`**; the anon/PUBLIC-executable set equals the 9 entries of `lib/security/anon-secdef-allowlist.ts` exactly; zero `<> auth.uid()` null-guard bugs in client-executable bodies; the 9 RPCs that take a client-supplied organization id all gate on membership/management.
- **Tenant isolation on the sensitive tables** (profiles, workers via `can_view_worker`, journal_entries, customer_requests, conversations, organization_roles, engagement_contexts, worker_documents, consents, billing, audit_logs, ai_runs) is scoped or admin/service-only; helper predicates are definer, pinned, `auth.uid()`-bound, granted to `authenticated` only.
- **Views:** 3 of 4 `security_invoker`; the one definer view carries its own `auth.uid()` predicate.
- **Storage:** all 6 buckets private, MIME + size limits, paths scoped by `auth.uid()` folder or org membership; `getPublicUrl` has zero occurrences; reads are short signed URLs.
- **Application layer:** one service-role factory behind `server-only`; every call site behind a signature, cron secret, superadmin gate or server-resolved subject; every `/api/*` route authenticates itself (guard-pinned); the MCP door runs tools as the caller's own RLS client.

**Findings from the sweep** (merged into §3 numbering as SEC-3..SEC-15):

| Id | Sev | Where | Finding | Class |
|---|---|---|---|---|
| SEC-3 (= J-2, raised to HIGH) — RED draft [#2439](https://github.com/bandymuks1-stack/labourmarketai/pull/2439), local proof 15/15 | HIGH | `journal-write-core.ts:602-620`; `20261003150700…:379-384` (`create_journal_entry_full` inserts `p_hash_prev`/`p_hash_self` verbatim); direct INSERT policy 20260530130000:47 + grant 0013:417 | Hash chain is client-computed over an unstored timestamp, `hash_prev` never verified server-side; a worker can insert via PostgREST with forged values (the e2e `integrated-fixes.spec.ts:301` already does). Doctrine §3.3 says server-side. No `verify_journal_chain` exists. | RED: BEFORE INSERT trigger deriving both hashes from stored columns and the worker's head; `verify_journal_chain_v1` |
| SEC-4 (= B-3) | closed | `20261006100300…` | **Applied in production** (`has_function_privilege` read 2026-10-16 evening: authenticated = false on all six money RPCs) | closed |
| SEC-5 | MED | `0013:417`, `20261006100400…` | `journal_entries` has no UPDATE/DELETE/TRUNCATE refuse trigger (RLS + narrow grants only; 10 definer RPCs legitimately update it) | RED: trigger allowing only `deleted_at/superseded_by/updated_at` + review columns; `revoke truncate` |
| SEC-6 | MED | `0001_initial_schema.sql:269-280,625-630` | `audit_logs` mutable by admin policy; no refuse trigger; lacks before/after, ip, ua (doctrine §3.4) | RED |
| SEC-7 | MED | `20260612091000…:217-225` | Worker can hard-delete journal evidence photos (`owner delete` storage policy); `document-files` and `evidence-media` use orphan-only delete, this bucket does not | RED (storage policy) |
| SEC-8 (= SEC-1) | MED | `lib/security/rate-limit.ts:24-32,151-161` | Per-instance limiter keyed on the first `x-forwarded-for` hop (spoofable); limits multiply across cold instances | GREEN: shared counter (Postgres RPC) behind the same API, trusted IP only |
| SEC-9 (= B-7) | MED | `20260720190000…:1421` | `lmc_expire_lots_v1` never scheduled → expired credit stays spendable | GREEN cron route or RED pg_cron |
| SEC-10 (= G-7) | MED | expire_* admin functions; privacy intake | Expiry sweeps unscheduled; erasure defined, not enforced (81 profiles undeletable) | RED (#2235, #2426 after amendments) |
| SEC-11 | MED latent | `20261012100000_assistant_transcript_v1.sql:158` | `v_owner <> auth.uid()` fails open when `auth.uid()` is NULL (same shape as the 2026-07-22 P0); unreachable today (EXECUTE authenticated only). Production body confirmed with `pg_get_functiondef`. | RED draft [#2440](https://github.com/bandymuks1-stack/labourmarketai/pull/2440) |
| SEC-12 | LOW | `20261006100000…:108-111` | work_hour_allocations UPDATE `using` not narrowed like the new `with check` (pre-fix forged rows stay editable) | RED or data audit |
| SEC-13 | LOW | `20261007100000…:168-173` | evidence-media subject select branch lacks `link_method = 'worker_confirmed'` | RED |
| SEC-14 | LOW | `20260808140000…:154` | `ai_runs_retention_health()` executable by every authenticated user, reads cron health | GREEN (gate with `is_admin()`) |
| SEC-15 | LOW | `auth/logout/route.ts:59` (GET), `dispatch.ts:101` + `confirmable.ts:29` (service-role key reused as HMAC material when `CONVERSATION_TOKEN_SECRET` unset), `api/referrals/external/v1/route.ts:46` (partner-slug oracle), `request_organization_claim_v1` unthrottled (SUSPECTED), `20261007180000…:103` trigger not idempotent, anon-allowlist header says "four" (nine) | Nuisance / hygiene | GREEN |

**Migration hygiene:** 0 naming violations, 0 duplicate versions; 69 migrations without a rollback file — all 36 legacy `000N` files plus the 33 pre-policy files before `20260612130000` (the README declares rollbacks forward-only from there; all 332 later files are paired, 0 orphan rollbacks); forward DROPs only in 0003, 20260530120000 (no executable zero-row assert) and 20260728114353 (clean start); 26 top-level data UPDATEs in 23 files, all idempotent; the newest 40 reviewed one by one — 38 human-gated RED, 2 GREEN, all with rollbacks; one order dependency (20261003151500 after 20261003151100).

**Index gaps (all GREEN, `create index concurrently`):** FK columns used in policies or hot subqueries without an index — `invitations.organization_id` / `project_id` / `(organization_id, accepted_by_profile_id)` (team-offer consent subquery), `contact_disclosure_requests.organization_id`, `performance_reviews.organization_id`, `marketplace_listings.organization_id`, `billing_checkout_operations.organization_id`, `training_skill_links.organization_id`, `ai_runs.profile_id`, `work_hour_allocations.journal_entry_id`, `journal_entry_review_submissions.worker_id`, `team_assignments.task_id`, `customer_requests.drafted_by`, `contracts.customer_request_id`, `commercial_handoffs.request_id`, `team_demand_offers.{offered_by,responded_by,assignment_id}`, `team_demand_offer_terms.{proposed_by,decided_by}`, `competency_recognitions.{assessed_by,supersedes_id}`, `organization_evidence_media.imported_by_profile_id`, `assistant_message_attachments.message_id`, `historical_consolidation_decisions.{canonical_project_id,decided_by,reverted_by}`, `confirmation_spends.spent_by`, `lmc_transactions.actor_profile_id`, `company_memberships.invited_by`, `pilot_participants.profile_id`, `organization_people.linked_worker_id`, `evidence_import_rows.organization_person_id`. Core RLS columns are indexed.

Still open from the earlier list: bearer scope (SEC-2, RED #2336); the live secdef and parity CI gates inactive without `SUPABASE_DB_URL` (GOV-1); the production service-role key in 5 GitHub workflows (owner).

## 7. Research summaries (kept separate from confirmed defects)

### 7.1 Agent skills (Vercel) — evaluation
`vercel-labs/skills` is the **CLI** (MIT, 35k stars, pushed 2026-10-09, runtime deps `tar` + `yaml`, telemetry to skills.sh disabled by `DISABLE_TELEMETRY=1`); it ships one skill, `find-skills` (prompt-only, nudges an agent to self-install — reject). The library is `vercel-labs/agent-skills` (9 skills). Fit for the eight needs: Next/React performance → **`vercel-react-best-practices` (adopt, global install, prompt-only, zero cost, no duplication)**; mobile → `vercel-react-native-skills` (conditional, pushes a FlashList dependency); Vercel cost audit → `vercel-optimize` (owner decision: 90 local scripts + paid Observability Plus + a linked CLI). **No fit** for Supabase security, TypeScript/testing, Playwright, accessibility (web-design-guidelines is already installed), international SEO, marketplace architecture or growth analytics — the existing local skills and the repo's own gates cover them. Reject `deploy-to-vercel` (uploads a tarball to a third-party endpoint), `vercel-cli-with-tokens` (reads tokens from `.env`), `writing-guidelines` (conflicts with the honesty-copy voice), `react-view-transitions` (Next 16). Install only with `-g` so one copy at `~/.agents/skills` serves every project; never without `-g` in this public repo (it would commit `.agents/`, a junction and a lockfile). Owner command: `DISABLE_TELEMETRY=1 npx skills@1.7.2 add vercel-labs/agent-skills --skill vercel-react-best-practices -g -a claude-code -y`.

### 7.2 Competitor intelligence (two sourced passes; URLs in the growth document §E.6)
- **No competitor in LT, the Nordics, DACH or Benelux offers a worker-owned, counterparty-confirmed work record.** LinkedIn verifies identity and employer affiliation (free), dropped test-based skill badges in 2024, and its Services Marketplace runs on invited 5-star reviews; Upwork/Fiverr/Freelancer hold platform-locked ratings; MyHammer/Werkspot/Mittanbud sell leads; Deputy/Connecteam/Planday own the timesheet (the worker loses it on leaving); Glassdoor (merged into Indeed on 2026-07-01) is one-directional anonymous opinion with a documented anonymity failure (2024) and a 2026 study showing reviews drifting positive without workplace change; Remote OK / We Work Remotely ($299 per post) win on simplicity, programmatic tag pages, open feeds with a link-back clause and e-mail alerts; Wonderin.ai is a US consumer auto-apply resume tool with no counterparty confirmation and no employer side.
- **Lawful demand data sources, ranked:** Arbetsförmedlingen JobTech (SE, CC0, no key) > Užimtumo tarnyba (LT, CC BY 4.0, daily) > NAV pam-stilling-feed (NO, token held, remove withdrawn ads immediately) > Työmarkkinatori (FI, organisation activation) > VDAB (BE, partnership agreement) > EURES (partner status via the LT NCO). Avoid the unofficial Bundesagentur API (BA threatened legal action), UWV (no API), Jobindex (no public API), scrapers.
- **Legal flags:** Platform Work Directive transposition 2026-12-02 (stay a tool, never algorithmic control); DAC7 (personal services reportable from the first euro if the platform knows the consideration — keep payments off-platform or get counsel first); DSA Art. 30 / Omnibus trader-vs-private flag on every goods/services listing; Norway's agency-hire ban in the Oslo region (subcontracting legal); Sweden's 24-month rule (entreprenad exempt).
- **Verifiable demand:** Lithuania issued >100k PD A1 in 2024 and ~7,100 Lithuanian posted construction workers were in Sweden in 2025; DE 41.3k unfillable skilled construction posts, NL 28.5k vacancies (71% hard to fill), SE 1 in 4 recruitment attempts fails, BE 75 shortage construction occupations.

---

## 8. Production readiness verdict (deliverable H)

**NOT READY** — as a whole product in its current operational state. **READY WITH BLOCKERS** — for the code on `main` plus the six repair branches.

Evidence for NOT READY (each is a single, nameable blocker):
1. **Hosting is blocked** (Vercel "Account is blocked" since 2026-10-15; `health-probe` failing). Owner-only.
2. **Live payments are armed but unproven** (B-1, B-2): no webhook has ever been received; the recovery cron is inert.
3. **A real erasure request is due ~2026-11-14** and the executor is unapplied and needs amendments (§5).
4. **No human has walked the authenticated product on the deployed build since #2421** (the last prod walks are 10-12/10-13); CI has no database, so 5 of 95 e2e specs run.
5. **Two live security CI gates are inactive** (GOV-1) and the AI monitor is blind to provider failures (AI-2, PR #2419 unmerged).
6. **The journal's tamper-evidence claim is unsupported until the hash chain moves server-side** (SEC-3, RED) — the legal-proof spine of the product.

Checks required **after hosting is restored**, in order:
1. `GET /api/health` on the apex reports the expected `build` (the deploy actually happened — Vercel quota silently skips).
2. Merge the six GREEN branches one at a time (quality + migration-safety green), verify `build` after each.
3. Production prod-qa walk (the sanctioned `prod-qa-*` chain, synthetic worker `qa.worker+goal3`) through: signup → onboarding → first journal entry with a past date (J-1), a chat entry "nuo 8 iki 17, 30 min pertrauka" (J-4 metrics present), a goods sentence in the chat (M-1 opens the board), the listings page under a forced read error (M-2 copy), `/sv` and an `Accept-Language: sv` root visit (U-1), `curl -I` for `x-default` (U-2), the privacy and cookie pages (G-1/G-2), an admin privacy queue row with a due date (G-5), a project card and stadium after a forced read failure (C-2/C-3).
4. Read `ai_runs` for the last 24 h: no row with `blocked_reason IS NULL` whose `provider_failure` starts with `unsupported: data egress gate`; `usage_cost_events` has no `status='error'` rows from refusals (AI-1).
5. Owner decision N-1; if live stays armed: register the live webhook, run the smallest live charge + refund, set `BILLING_RECOVERY_*`.
6. Read the production ledger for 20261003150100, 20261003150500, 20260915180000, 20261007150000/20261012110000/20261012180000 and 20261006100300; then correct the journey register, EVID-2/ARCH-5 and the ORCHESTRATION_ASSESSMENT in one docs PR.
7. Add the read-only `SUPABASE_DB_URL` secret (GOV-1) so the live secdef and parity gates arm.
8. Approve or amend #2426; apply via MCP `apply_migration`; execute the open request with the receipt; send the Art. 12 reply.
9. Merge #2419; confirm the monitor opens an issue on the next Gemini 429.

---

## 8a. Evening addendum (2026-10-16, after the owner's post-audit programme)

Production became readable (Supabase MCP). Measured: 3 live Stripe customers, 3 checkout operations (1 expired, 2 still `open` because no webhook ever arrived), 0 subscriptions, 0 webhook events; all seven LMC flags false; 20261006100300 **applied** (B-3/SEC-4 closed); 20261003150100, 20261003150500, 20260915185038, 20261007150000, 20261012110000, 20261012180000 **applied** (C-1, EVID-2, ARCH-5 become docs corrections); `append_assistant_message` body confirmed (SEC-11 → #2440). Query plans on the policy-related FK columns show seq scans over ≤ 79 rows — no index needed now.

Programme outputs: independent review of #2432–#2438 (two REQUEST CHANGES, both fixed and pushed; one nit fixed); RED drafts #2439 (journal integrity, PostgreSQL 16 adversarial proof 15/15 after three proof-driven fixes), #2440 (transcript null guard), #2441 (Stripe second owner act), #2442 (erasure v3, proof 71/71, legal list L-1…L-15); GREEN #2444 (confirmation tokens signed only with `CONVERSATION_TOKEN_SECRET`). The owner decision sheet is `docs/launch/OWNER_DECISION_SHEET_2026-10-16.md`.

## 9. Owner decisions required (consolidated)

| Id | Decision | Why now |
|---|---|---|
| N-1 | Is live Stripe charging intended before the webhook proof? If not: remove `STRIPE_LIVE_ACTIVATION` from Vercel (→ `stripe_live_blocked`). If yes: webhook + smallest live charge/refund + recovery cadence. | A trial can convert to a real €99 charge today (B-1/B-2). |
| N-2 | Which cross-border fields become required on listings and offers (route distance labelled, logistics cost, currency, conditions, trader/private flag, delivery/pickup)? | The owner's brief requires them; none exist; they are one coherent RED extension. |
| N-3 | Promote `sv` and `no` before or after the first Nordic customer? (~9.2k keys + 2.5k `[EN]` each) | U-1/U-2 now land unmatched visitors on English; Swedish/Norwegian UI is the next step for the two largest corridors. |
| N-4 | Amend and approve #2426 (§5) and name who executes the 2026-11-14 request. | Statutory deadline. |
| ~~N-5~~ | **Closed:** 20261006100300 is applied in production (grant read 2026-10-16 evening). | — |
| N-6 | Resolve ARCH-3 (is zero usage a broken journey?) so "5 broken links" becomes a usable backlog. | C-1 and the register's honesty. |
| N-7 | Workspace hygiene: remove merged/stale worktrees and the forbidden `C:\lmw-*` directories per the policy (never `--force`). | 30 worktrees; the guard blocks new ones at 20. |
| N-8 | Adopt `vercel-react-best-practices` globally (zero cost) — yes/no. | §7.1. |
| N-9 | Approve the RED journal integrity set: server-side hash chain (SEC-3), UPDATE/DELETE refuse trigger on `journal_entries` (SEC-5), orphan-only delete for journal photos (SEC-7), `audit_logs` immutability (SEC-6) — **drafted as [#2439](https://github.com/bandymuks1-stack/labourmarketai/pull/2439), adversarial PostgreSQL 16 proof 15/15 PASS**. | The product's legal-proof promise rests on them. |

Plus the standing open set: PER-11, ORG-2, EVID-6, GOV-1, ARCH-6, AGENT-1..4, COM-6, COM-8, MDD-01..14, E6, and the `needs-human-gate` PR queue listed in the master spec §14.
