# V10 VALUE→DEMAND CHECKPOINT + OWNER RETURN PACKAGE
# LABOURMARKET_AI_V10_REAL_VALUE_TO_DEMAND_COMMERCIAL_LAUNCH_REPORT

TIME: 2026-08-13/14 (session continuous). ORIGIN_MAIN: d2e16448 → post-#1154.
MERGED_PRS this train: #1154 (channel registry + eligibility + discovery + corrections).
Session cumulative (V8W4+V9+V10): #1147-#1154, 8 PRs, all same-day. MIGRATIONS: none since
window start (baseline 199). DEPLOYMENTS: Vercel auto per merge, all green.

## PRODUCTION_TRUTH (VERIFIED_DB 2026-08-13 evening)
users 36 (5/7d) · orgs 13 · journal 36 · inquiries 17 · privacy requests 0 ·
active Swedish vacancies 7088 (fresh 06:13Z; decays without cadence config) ·
service_offerings 2 rows LIVE · marketplace_listings table LIVE (0 rows) ·
bookings/engagements/absences/notifications/ai_runs 0 · DB 500 MB (esco_labels 408 MB).

## GRANDMOTHER_TEST (V10 §34 — real unit outputs)
A "30 kg agurkų" = **PARTIAL / CHANNEL_GATED + LEGAL_CHECK_REQUIRED** — understood (30 kg,
her words echoed as claim), asks only material missing info, names plainly what must be legally
checked (home-grown food sale rules), states nothing was saved. No lawful produce channel could
be integrated in V10 without inventing source permission — per §34 this is the honest verdict,
not a fake PASS.
USER CORRECTION: "Ne 30, o 300 kg" → updated to 300 kg (unit inherited), no duplicate, no
silent action, refusals cannot be routed around via correction.

## CROSS_DOMAIN_TESTS (§35, real outputs)
B pallets 500 (unit not invented) → CHANNEL_RESTRICTED (work-bounded category truth)
C excavator 3 days → **CAN_ROUTE → marketplace listing rental/machinery (REAL internal channel)**
D translation PL→LT → **CAN_ROUTE → service offering (REAL internal channel, table live w/ 2 rows)**
E electrician 2 days → CAN_ROUTE → availability + open inquiries (V9, regression green)
F four welders → CAN_ROUTE → pre-filled inquiry → live matching chain (V9, regression green)
Adversarial: weapons/pharma/alcohol/tobacco (LT/EN/RU) → UNSUPPORTED everywhere, refusal,
no alternatives, interpretation dropped.

## STATUS BLOCKS
VALUE_ROUTER: SHIPPED (#1152+#1154) — deterministic, 5 locales, claim-framed.
CHANNEL_REGISTRY: SHIPPED — 3 live internal channels + governed external supply entry;
  externals source-gated by construction; no goods buyer channel active (none has terms evidence).
LEGAL_ROUTING: bounded 5-verdict eligibility SHIPPED; no legal conclusions invented.
RETENTION: unchanged — package A ready (docs/legal/retention-decision-package-v1.md), LEGAL gate.
DELETION: phases 1+2 live (#1151); 3-4 OWNER+LEGAL gated.
ESCO: plan v2 SHIPPED this train — owner directive honoured: NO language deletion; revised
  actions B1 typeahead index/query fix (+perf, ±disk), B1b preferred-only partial variant,
  B2 drop unused surrogate pkey (-39 MB), B3 hot/cold split WITHOUT deletion (-~170 MB,
  capability intact). All RED → OWNER_GATED. v1's language-prune withdrawn.
LANGUAGES: matrix updated (V10 §23 surfaces incl. VALUE ROUTER row: 5 routed locales).
AI_PROVIDER: Package C decision matrix ready (O1 disabled / O2 local self-host recommended
  first / O3 Anthropic paid / O4 DeepL) — O3/O4 = new commitment → OWNER_GATED.
PRICING: candidate tables final-form in package B/D; OWNER_GATED. ECONOMICS: NOT_ENOUGH_EVIDENCE
  (input table stands; O2 activation would generate real telemetry).
BILLING: TEST architecture code-complete; metering still MISSING (named prerequisite);
  CONFIGURATION_GATED on Stripe TEST creds. No production money.
PUBLIC_TRUST: no new public value-realization claims published — §33 honoured (feature is
  auth-side; public copy untouched this train).

## OWNER RETURN PACKAGE
A — RETENTION: 3 decisions + 3b, doc ready. STILL #1.
B — ESCO: docs/operations/esco-storage-optimization-plan.md (v2, no-language-deletion);
  recommend order B2 → B1(/B1b) → B3-only-if-pressure; confirm Supabase plan headroom.
C — AI PROVIDER: docs/commercial/ai-provider-decision-package-v1.md; recommend O2 local first
  (no legal gate, real cost telemetry), then O3 evaluation with data.
D — PRICING: docs/commercial/pricing-decision-package-v1.md (worker/employer/LMC tables +
  economics inputs + 5 technical prerequisites incl. metering).
E — PAYMENTS: TEST=CONFIGURATION_GATED (Stripe creds+price ids); LIVE additionally needs
  metering build + Terms clauses + pricing approval. Exact activation steps in package.
F — VALUE CHANNELS: implemented = internal demand board / marketplace listings / service
  offerings; gated = external goods/buyer channels (need terms-reviewed governance rows —
  next high-value integrations: local produce/farm-market directories IF owner sources
  permission evidence; B2B buyer boards similarly). Category widening (pallets/materials)
  = owner product decision.

## GATES REGISTER
OWNER: retention rolling-deletes approval semantics; ESCO B1/B2/B3 migrations; pricing;
  live payments; AI provider O3/O4; marketplace category widening; external goods channels;
  jobs-list unification; deletion phases 3-4.
LEGAL: retention 1/2(+3b); Terms payment clauses; home-grown produce channel rules (named,
  not decided).
CONFIG: Sweden cadence (2 secrets+2 vars); Stripe TEST; INVITE_EMAIL_*; AI_LOCAL_* (if O2).
SOURCE: any external goods/buyer channel (no permission evidence exists → source-gated).
BLOCKED_EXTERNAL: authed browser proofs (owner/tester session).

## TERMINAL VERDICTS (§46)
CORE_PLATFORM = READY (VERIFIED_LOCAL 15,214 tests + VERIFIED_PRODUCTION public surfaces)
RECRUITMENT = FOUNDATIONAL+LIVE (VERIFIED_LOCAL chain; 17 inquiries VERIFIED_DB;
  full-chain usage WORKING_BUT_UNUSED)
EMPLOYER_DAILY_OS = COMPLETE (V8; HIRINGS=0 PASS; authed proof BLOCKED_EXTERNAL)
WORKER_JOURNEY = READY (5 routed locales)
VALUE_INTENT = SHIPPED, VERIFIED_LOCAL (real fixture outputs)
CHANNEL_REGISTRY = SHIPPED, VERIFIED_LOCAL (3 live internal + governed external)
GOODS_OUTPUT_REALIZATION = PARTIAL — equipment/machinery CAN_ROUTE (real channel);
  produce LEGAL_DECISION_REQUIRED + SOURCE_GATED; generic goods CHANNEL_RESTRICTED (honest)
SERVICE_REALIZATION = SHIPPED (CAN_ROUTE to live service offerings) — VERIFIED_LOCAL+VERIFIED_DB
CAPACITY_REALIZATION = PARTIAL BY DESIGN (availability fields, not dated-window object;
  inverted window retrieval still the named next primitive)
GRANDMOTHER_CUCUMBERS_TEST = PARTIAL / CHANNEL_GATED (honest per §34 — understanding/
  structure/eligibility/corrections PASS; lawful produce channel requires owner-sourced
  permission evidence)
CROSS_DOMAIN_VALUE_REALIZATION = PASS on one shared architecture (6 fixtures, 0 domain forks)
EXTERNAL_JOB_SUPPLY = LIVE (VERIFIED_DB; cadence CONFIGURATION_GATED)
LABOUR_MARKET_INTELLIGENCE = PARTIAL (Eurostat pipeline live; vacancy aggregates not yet
  wired to landing — unchanged, no fake counts anywhere)
LANGUAGE_ACCESSIBILITY = PARTIAL (5 routed READY; 6 catalog NOT ROUTED; matrix current)
ESCO_STORAGE = OWNER_GATED (plan v2, languages preserved)
TRUST = READY minus declared pendings · RETENTION = LEGAL_DECISION_REQUIRED
DELETION = PARTIAL (1+2 live; 3-4 gated by design) · AI_PROVIDER = OWNER_GATED (matrix ready)
PRICING = OWNER_GATED · ECONOMIC_SAFETY = NOT_ENOUGH_EVIDENCE
BILLING_TEST_MODE = CONFIGURATION_GATED (code-complete; metering prerequisite named)
PAYMENTS = OWNER_GATED · PUBLIC_LAUNCH = LEGAL_DECISION_REQUIRED (retention) →
  READY_FOR_OWNER_ACTIVATION

## NORTH-STAR TEST (§47)
"Turiu/Galiu/Ieškau/Man reikia/Noriu parduoti" → understood (1), no forms before value (2),
only material questions (3), claim≠verified framing (4), lawful channel or honest gate (5),
real next action (6), user controls corrections + confirmations (7), zero internal taxonomy
required (8). VERDICT: YES for the shipped scope, proven by 6 fixtures + corrections +
adversarial refusals — with the produce channel gap honestly gated, not faked.

NEXT EXACT STEP: owner package A-F decisions; highest-leverage next build after owner input:
(1) dated capacity object + inverted window retrieval, (2) metering foundation,
(3) first terms-reviewed external goods channel.
