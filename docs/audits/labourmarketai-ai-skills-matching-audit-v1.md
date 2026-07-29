# Labourmarket.ai — AI, Skills Recognition & Matching audit v1

| Field | Value |
|---|---|
| Date | 2026-07-22 |
| Repo | `C:\Users\Mano\Documents\labourmarketai` |
| Branch / HEAD | `main` @ `664b9ab9` (clean tree) |
| Production | https://labourmarket.ai |
| Supabase prod ref | `gorgitwvdzxbnaxhrsrw` |
| Audit loop | LOOP 4 — AI, Skills Recognition & Matching |
| Mode | READ-ONLY. No commits, no pushes, no migrations, no source edits. Supabase MCP used for `SELECT` only. This file is the single artifact written. |

## Method

1. Static read of every AI-ish module: `apps/web/lib/ai/**`, `apps/web/lib/structuring/**`,
   `apps/web/lib/journal/**`, `apps/web/lib/cv/**`, `apps/web/lib/market/**`,
   `apps/web/lib/market/recognition/**`, `apps/web/lib/intelligence/**`,
   `apps/web/lib/taxonomy/**`.
2. Caller tracing — for every recogniser / agent / model, grep for real production call sites in
   `app/`, `components/`, `lib/` (tests excluded) to separate *shipped* from *declared*.
3. Read-only SQL against prod for the taxonomy / usage counts (every SQL statement is reproduced
   verbatim below its table).
4. **Executed the real recogniser** against 30 hand-written cross-sector inputs via
   `npx tsx --tsconfig apps/web/tsconfig.json` on a scratchpad probe importing
   `recognizeSkills`, `classifyEntryRecognition`, `extractProfileSkillClaims`,
   `deriveJournalRecognition` directly. No repo file was created; results are quoted verbatim in
   §5. This is behavioural evidence, not a reading of intent.

Every claim below carries a `file:line` or a SQL result. Where something could not be verified it
is listed in §10.

---

## 1. AI feature inventory

### 1.1 The headline truth about "AI"

**No LLM is called in production today, and none has ever been called.** The runtime is OFF by
construction, not by accident:

- `apps/web/lib/env.ts:41` — `AI_PROVIDER_MODE: z.enum(["disabled","mock","live"]).default("disabled")`.
- `apps/web/lib/ai/runtime/config-core.ts:113-116` — any mode other than `mock`/`live` returns
  `{ state: "disabled", reason: "mode_disabled" }`.
- `config-core.ts:126-128` — `live` **without** a non-empty key silently returns `disabled`
  (`missing_api_key`), so the runtime can never go live by half-configuration.
- `apps/web/lib/ai/runtime/providers/disabled.ts:12-20` — returns `{ status:"disabled", reason }`
  for every request. No key read, no network, no SDK import.
- `.env.example:34` sets `AI_PROVIDER_MODE=disabled`; no `AI_*` variable exists in any `.env.local`.
- **Prod DB proof:** the audit table does not exist, so no run was ever recorded.

```sql
select to_regclass('public.ai_runs') as ai_runs;
-- → ai_runs = null   (migration 20260714150000_ai_runs_audit_v1.sql committed, NOT applied)
```

Consequence: **100 % of what a user experiences as "recognition", "matching" and "intelligence"
today is deterministic lexicon + regex + set arithmetic.** That is defensible and, for this
product, arguably better than an LLM — but it must be described honestly, and §7 shows two places
where the UI over-claims.

### 1.2 Feature table

Legend — **R** = real & shipped, **D** = declared only (code exists, no production caller),
**G** = gated (shipped but inert because a flag/table/data is missing).

| # | Feature | State | Model or rules? | Inputs | Outputs | Confidence | Explainability shown | Fallback / errors | Privacy (data leaving) | Tests | What the user actually sees |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Journal skill recognition (`recognizeSkills`) | **R** | Rules. Lexicon `lib/structuring/keywords.ts` (177 sectored rows / 1 187 needles) + `synonyms.ts` + 9 offline language packs. `skill-recognition.ts:198-281` | Free text | ≤ 4–8 slugs, tier `exact/synonym/fuzzy` | 3 literal tiers, `skill-recognition.ts:171-176` | Yes — `matchedText` shown as "found: <word>" (`journal-entry-composer.tsx:2365`, key `journal.reasonFound`) | Empty list; never throws | **None** — pure, no IO | `skill-recognition.test.ts` (232 l), `skill-recognition-lt-sentences.test.ts`, `cross-sector-recognition.test.ts` | Skill chips with the matched word and a "weak match" note for fuzzy (`:2376-2381`) |
| 2 | Journal derivation pipeline (`deriveJournalRecognition`) | **R** | Rules, 5 lanes | Entry text + declared slugs + rejections | recognized / fuzzy / ambiguous / claim / rejected / unresolved + coverage | Inherited tiers | Yes — per-fragment `outcomes[]`, zero-silent-loss invariant `journal-recognition.ts:476-484` | `emptyJournalRecognition()` on failure (`:168-185`) | None | `journal-recognition.test.ts`, `journal-recall-integrity.test.ts`, `journal-cross-sector-corpus.test.ts` | Grouped cards: Recognised / Choose / Your words / Unresolved |
| 3 | **Auto-persist of recognised skills** | **R** | Rules | recognized (exact/synonym) slugs not yet declared | `worker_skills` INSERT | Hardcoded `confidence_bin:'yellow'` | **No** — write happens server-side without a confirm step | `ignoreDuplicates` upsert; write failures counted | None | `skill-pipeline.test.ts`, `journal-pipeline-canonical.test.ts` | A new skill appears on the CV after saving an entry — see F-3 |
| 4 | Capability-claim extractor | **R** | Rules. 56 LT-labelled dictionary rows / ~627 needles, `lib/profile/skill-claim-extractor.ts:78+` | Journal + profile narrative | Claim labels ("your own words") | none (all equal) | Yes — `reason` needle | Empty array | None | `skill-claim-extractor.test.ts` (496 l) | Chips the worker confirms into `profile_skill_claims` |
| 5 | Recognition tiers (`classifyEntryRecognition`) | **R** | Rules, 3 tiers | Entry text | `auto_signal` / `candidate_suggestion` / `manual_only` | tier name | Partly | manual fallback | None | `recognition-tiers.test.ts` | Which composer block renders |
| 6 | `recognizeUniversal` (23 rules, 14 domains) | **R (thin)** | Rules | Entry text | suggestions + unmapped + quantities | 3 levels | Yes (`reason`) | `needsMoreDetail` | None | `universal-recognition.test.ts` | Only via `lib/work-entry/entry-skill-review.ts:104` |
| 7 | New-skill / similar-skill suggestions | **R** | Rules, `new-skill-suggestions.ts` (415 l) | Entry text | candidate slugs | — | Yes | none offered | None | `new-skill-suggestions.test.ts` | "Similar skills — you choose" block |
| 8 | CV text extraction | **R** | **Libraries, not AI**: `unpdf` (PDF) `cv/extract.ts:71-78`, `mammoth` (DOCX) `:80-87`, `TextDecoder` (TXT) `:107` | Uploaded file ≤ 5 MB | Raw text | — | — | throw → `{kind:"failed"}` `:112-115`; empty → `{kind:"empty"}` `:110`; HTTP 422 both ways | Stored nowhere; route logs no bytes | `extract.test.ts`, `cv-upload-truth.test.ts` | Extracted text pre-filled into the profile composer |
| 9 | CV structured parse | **R** | Rules. LT/EN/RU/DE/NL lexicons, `cv/structured-parse.ts:100-186` | CV text | dates, employers, education, certs, languages, salary | — | Section evidence | Bounded (400 lines / 300 chars / 20 items) | None | `structured-parse.test.ts` | Editable proposal rows |
| 10 | AI CV structuring (`worker_profile` agent) | **G** | Would be LLM (claude-opus-4-8 default) | `{ bio }` ≤ 8 000 chars | headline, skill claims, roles | forced `confidence:"low"` `cv-ai-structuring-actions.ts:119-178` | envelope `evidence_refs` | `{status:"off"}` `:59` → UI renders nothing | **Would send the whole CV/profile text** | `evals/worker-agents.test.ts` | Nothing today |
| 11 | AI journal suggestions (`work_journal` agent) | **G** | Would be LLM, routed to haiku, $0.05/20 s (`task-routing.ts:186-200`) | `{ rawText }` ≤ 8 000 | tasks, tools, possible skills | envelope | Confirm / Correct / Discard chips | `{status:"off"}` → one grey line, key `journal.aiSuggest.offNote` | **Would send raw journal text** | `journal-proof-engine.test.ts:91` | A manual "Suggest from this entry" button that returns "nothing new to suggest" |
| 12 | `company_need` agent | **G** | Would be LLM | company free text ≤ 8 000 + docs | draft vacancy | envelope | — | disabled | Would send full company brief | evals | Nothing today |
| 13 | `matching_explanation` agent | **G** | Would be LLM | need + candidate facts | fit summary | envelope | — | `explanationStatus:"disabled"` | Would send need text | evals | Route `lib/staffing/match-preview-actions.ts:1-8` is marked **DEPRECATED — FROZEN LEGACY FORK** |
| 14 | `skill_evidence`, `country_readiness`, `document_assistant`, `booking_risk`, `admin_risk`, `support_onboarding`, `translation_copy` | **D** | — | — | — | — | — | — | — | evals only | **Nothing — 7 of 11 registered agents have zero production callers** |
| 15 | Older `lib/ai/provider.ts` seam | **D** | — | — | — | — | — | `noop-provider.ts:30-45` always disabled | — | — | Nothing; only caller `estimate-clarify-actions.ts:37` returns DISABLED first |
| 16 | Worker↔need matching (`matchWorkerToNeed`) | **R** | Rules. Weighted skill-set coverage, `match-v1.ts:411-421` | need skills, subject skills+facts | status, %, reasons, gaps, blocking | evidence-weighted coverage | **Yes** — `reasons[]`/`gaps[]` + `components/app/match-tier-explanation.tsx` | eligibility false + explicit blockers | None | ~197 cases across `match-v1.test.ts`, `match-priorities.test.ts`, 8 guard files | Ranked candidate cards with chips |
| 17 | Team matching | **R** | Rules, `match-team-v1.ts:133-140` | team + need | coverage status | ratio bands | Yes | `insufficient_data` | None | `match-team-v1.test.ts` (16 cases, **construction-only fixtures**) | Team fit card |
| 18 | Salary thermometer | **R** | Rules: mean of two averages, `thermometer.ts:52-55` | position avg + market avg | € score | `insufficient_data` names the missing side | Yes | honest empty | None | `s4-thermometer-market.test.ts` | € band or "not enough data" |
| 19 | Salary benchmark model | **G** | Rules, `intelligence/salary-model.ts` | `market_rate_averages` | comparison | `basis_unknown` when gross/net unknown | Yes | `insufficient_data` + `missingCodes` | None | `intelligence` tests | **Always "insufficient data" — the table has 0 rows (SQL below)** |
| 20 | Skills-demand model | **R (thin)** | Rules, 90-day aggregate of the tenant's own `customer_requests` (17 rows in prod) | own demand rows | demand counts | cohort thresholds | Yes | privacy-suppressed below cohort | None | tests | Company planning page |
| 21 | Skills-gap model | **D** | Declared `preferredTier:"deterministic"`, `maxEstimatedCostUsd: 0` (`task-routing.ts:201-235`); **no registered agent** | — | — | — | — | — | — | — | Nothing |
| 22 | Market intelligence observations | **R (macro only)** | Imported Eurostat rows | — | 4 macro metrics | `confidence` column | Trust cards | fail-soft on missing table | Public official data | `observation-validation.test.ts` | 76 rows, LT/PL/DE + EU aggregate (SQL in §3.4) |
| 23 | ESCO typeahead | **R** | Prefix `ILIKE 'q%'`, alphabetical, limit 10, `taxonomy/esco-autocomplete.ts:44-51`. Flag ON `lib/config/esco.ts:12` | typed prefix + locale | ≤ 10 labels | none | EU attribution line rendered | flag off / 42P01 → empty list | Reads prod table only | `esco-taxonomy.test.ts` | An autocomplete in `skill-clarify-form.tsx` and `structure-need-form.tsx` |
| 24 | `recognizeIntent` (market recognize page) | **R** | Rules, 21 regex field rules `recognition/missing-fields.ts:34-235` | pasted offer/demand text | recognised + missing fields | readiness label | Yes | honest "missing" list | None | `recognition-v1.test.ts` (20 cases) | `/dashboard/market/recognize` |
| 25 | `recognizeJobDemand`, `explainTopMatches`, `classifyParticipation`, `buildWeeklyPublicDigest`, `buildPrivateProgressMessage` | **D** | Rules | — | — | — | — | — | — | `recognition-v1.test.ts` | **Nothing — no production caller** |

---

## 2. Is any LLM actually called? — the provider truth

| Question | Answer | Evidence |
|---|---|---|
| Is an LLM called in prod? | **No** | `config-core.ts:113-116`, `.env.example:34`, `to_regclass('public.ai_runs') = null` |
| Can it go live by accident? | **No** | `config-core.ts:123-128` — unknown provider or empty key both fall back to `disabled` |
| Default model if switched on | `claude-opus-4-8` | `config-core.ts:58` |
| Cost / safety guards | timeout 30 s (clamp 1–120 s) `:103`; retries 2 (0–5) `:104`; max output 2 000 tok (256–8 000) `:105`; daily budget 500 `:106`; per-task USD ceilings `task-routing.ts:142-331` | all clamped, cannot be removed by env |
| Daily budget actually enforced? | **No, today** | `audit-store.ts:179-202` returns `null` when `ai_runs` is missing → `run-agent-server.ts:38-41` leaves `runsToday` undefined → `run-agent.ts:206` guard never fires |
| Audit trail if switched on | `ai_runs` table — **unapplied**; `persistAiRunAudit` catches and returns `false` (`audit-store.ts:148-170`) | fails **soft**, not closed |
| What would leave the system | Raw journal text and raw CV/profile text, verbatim, inside `JSON.stringify(request.input)` | `providers/anthropic.ts:84-100`; identical shape `openai.ts:71-77`, `gemini.ts`, `xai.ts` |
| Is field minimisation enforced? | **No — declarative only** | `task-routing.ts:132-140` `NEVER_NEEDED` list is never applied by `run-agent.ts`; enforcement is by convention in each input builder |

**Plain statement for the owner:** skill recognition is deterministic and lexicon-based. It matches
folded (diacritic-stripped) substrings of 1 187 curated needles in LT/EN/RU plus 9 offline language
packs (DE 285, NL 242, PL 233, SV 213, ET 211, LV 210, DA 209, FI 209, NO 206 exact needles across
52–61 slugs each). It has three confidence tiers, a 1-edit fuzzy tier with a leading-character
guard (`skill-recognition.ts:243`), and two hand-written false-positive blockers (floor-cleaning
`:56-75`, power-tool-vs-electrician `:96-104`).

---

## 3. SECTOR NEUTRALITY — the quantitative evidence

### 3.1 `professions` — 49 rows

```sql
select sector, count(*) as n, count(*) filter (where is_active) as active,
       count(esco_uri) as with_esco, string_agg(slug, ', ' order by slug) as slugs
from public.professions group by sector order by n desc;
```

| Sector | Rows | % of 49 | Slugs |
|---|---:|---:|---|
| **construction** | **18** | **36.7 %** | builder, carpenter, concrete_worker, crane_operator, drywaller, electrician, foreman, general_laborer, heavy_equipment_operator, mason, painter, plumber, rebar_worker, roofer, site_engineer, site_manager, tiler, welder |
| hospitality_food | 5 | 10.2 % | baker, barista, cook, kitchen_helper, waiter |
| retail_sales | 4 | 8.2 % | call_centre_agent, customer_service_specialist, merchandiser, sales_assistant |
| beauty_services | 3 | 6.1 % | barber, hairdresser, nail_technician |
| agriculture | 2 | 4.1 % | farm_worker, gardener |
| cleaning_facility | 2 | 4.1 % | cleaner, laundry_worker |
| education | 2 | 4.1 % | teacher, translator |
| other | 2 | 4.1 % | event_organizer, safety_specialist |
| repair_maintenance | 2 | 4.1 % | auto_mechanic, handyman |
| transport_logistics | 2 | 4.1 % | driver, warehouse_worker |
| manufacturing | 2 | 4.1 % | furniture_assembler, production_worker |
| office_admin | 2 | 4.1 % | office_administrator, receptionist |
| hr_recruitment | 1 | 2.0 % | recruiter |
| **it_software** | **1** | **2.0 %** | software_developer |
| **care_health** | **1** | **2.0 %** | caregiver |

All 49 are `is_active = true`. **All 49 have `esco_uri = NULL`.**

### 3.2 `skills` — 153 rows

```sql
select category, count(*) as n, count(*) filter (where is_active) as active,
       count(esco_uri) as with_esco, string_agg(slug, ', ' order by slug) as slugs
from public.skills group by category order by n desc;
```

Rolled up to the sectors the audit brief asked about:

| Target sector | Categories | Skills | % of 153 | Professions | Notable absences |
|---|---|---:|---:|---:|---|
| **Construction** | finishing 16, machinery 11, supervision 10, electrical 7, carpentry 6, concrete 6, general 5, welding 5, roofing 5, plumbing 5, masonry 4, steel 4, hvac 2, insulation 2, safety 1, scaffolding 1, demolition 1, glazing 1, formwork 1, earthworks 1 | **94** | **61.4 %** | 18 | — |
| Logistics / transport | logistics.warehouse 6, logistics.driving 3 | 9 | 5.9 % | 2 | freight forwarding, dispatch, customs, ADR |
| Hospitality | hospitality.kitchen 4, hospitality.service 3 | 7 | 4.6 % | 5 | front office, sommelier, banqueting |
| Administration | office.admin 5, office.finance 1 | 6 | 3.9 % | 2 | payroll, legal admin, procurement |
| Cleaning / facility | cleaning.general 3, textile 1, outdoor 1, hospitality 1 | 6 | 3.9 % | 2 | — |
| Retail | sales.retail 3, sales.service 2 | 5 | 3.3 % | 4 | visual merchandising, e-commerce, stock control |
| **IT** | it.software 2, it.design 1, it.support 1 | **4** | **2.6 %** | **1** | devops, data, security, cloud, mobile, ERP, networking |
| Manufacturing | production 2, assembly 1, equipment 1 | 4 | 2.6 % | 2 | CNC, machining, welding-in-production, maintenance tech, lean/QA |
| Agriculture | animals 1, farming 1, gardening 1 | 3 | 2.0 % | 2 | crop spraying, machinery, forestry, greenhouse |
| Beauty | hair 2, nails 1 | 3 | 2.0 % | 3 | cosmetology, massage |
| Repair | vehicles 1, equipment 1, general 1 | 3 | 2.0 % | 2 | HGV mechanic, electronics |
| **Healthcare** | care.support 2 (childcare, elderly-care), care.safety 1 (first-aid) | **3** | **2.0 %** | **1** | **nursing, care assistant, phlebotomy, pharmacy, lab, dental, physio, paramedic — none exist** |
| **Education** | teaching 1, languages 1 | **2** | **1.3 %** | 2 | pedagogy, SEN, early years, VET, e-learning |
| HR | admin 1, recruitment 1 | 2 | 1.3 % | 1 | — |
| **Creative** | creative.design 1 (graphic-design); it.design web-design arguably 1 more | **1–2** | **0.7–1.3 %** | **0** | **photography, video, audio, copywriting, marketing, illustration, 3D, UX — none exist; no creative profession at all** |
| Events | events.setup 1 | 1 | 0.7 % | 1 | — |
| **Self-employed / informal** | — | **0** | **0 %** | 0 | no "sole trader", "own business", "cash-in-hand", "family help" rows |

**Totals: construction 94 / 153 skills (61.4 %) and 18 / 49 professions (36.7 %). The other 14
sectors share 59 skills (38.6 %) — an average of 4.2 skills each, versus 94 for construction.**
All 153 skills are active; **all 153 have `esco_uri = NULL`.**

### 3.3 The recognition lexicon has the same shape

Counted programmatically from `apps/web/lib/structuring/keywords.ts` (`asSector(...)` blocks,
`SKILL_HINTS_LT`):

| Sector tag in lexicon | Rows | Needles | RU needles |
|---|---:|---:|---:|
| **construction** | **80** | **402** | 154 |
| other (7 cross-sector abilities + **10 construction trade professions** + 16 non-construction professions + 4 dupes) | 37 | 166 | 59 |
| transport_logistics | 11 | 87 | 27 |
| hospitality_food | 7 | 63 | 19 |
| cleaning_facility | 6 | 85 | 26 |
| office_admin | 6 | 50 | 16 |
| it_software | 5 | 49 | 12 |
| retail_sales | 5 | 55 | 15 |
| manufacturing | 4 | 31 | 10 |
| agriculture | 3 | 48 | 9 |
| care_health | 3 | 35 | 11 |
| repair_maintenance | 3 | 45 | 14 |
| beauty_services | 3 | 31 | 11 |
| education | 2 | 18 | 3 |
| hr_recruitment | 2 | 22 | 7 |
| **TOTAL** | **177** | **1 187** | **393** |

Attributing the 10 construction-trade profession rows inside `other` back to construction gives
**90 / 177 lexicon rows (50.8 %) construction**. RU coverage is good and even: 176 / 177 rows carry
at least one Cyrillic needle.

The most skewed single structure is `WORK_DIRECTION_HINTS_LT` (`keywords.ts:444-454`): **5 of 5
rows are construction trades** (tiler, concrete_worker, electrician, plumber, carpenter), so
"work direction" detection can only ever return a construction answer.

`lib/structuring/sectors.ts:20-35` defines 15 sector keys and states construction is "one sector
among many, never the default" (`:8-10`) — the *registry* is neutral; the *data* is not.

### 3.4 ESCO is loaded at scale but not connected to anything

```sql
select (select count(*) from public.professions) professions_total,
       (select count(*) from public.professions where esco_uri is not null) professions_esco_linked,
       (select count(*) from public.skills) skills_total,
       (select count(*) from public.skills where esco_uri is not null) skills_esco_linked,
       (select count(*) from public.esco_occupations) esco_occupations,
       (select count(*) from public.esco_skills) esco_skills,
       (select count(*) from public.esco_labels) esco_labels,
       (select count(distinct locale) from public.esco_labels) esco_locales,
       (select count(*) from public.esco_occupation_skills) esco_occ_skills;
```

| professions | linked | skills | linked | esco_occupations | esco_skills | esco_labels | locales | occ↔skill edges |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 49 | **0** | 153 | **0** | 3 039 | 13 939 | 1 045 186 | 28 | 126 051 |

ESCO labels exist in 28 locales (en 134 455 … uk 17 066; **no `ru` locale in ESCO**). The
occupation↔skill graph has 126 051 edges covering the whole European labour market — and **none of
it is wired to the product's own 153 skills / 49 professions.**

The consequence is concrete and mechanical: `lib/market/need-skills.ts:110-133` builds an
ESCO-URI→slug bridge from `skills.esco_uri` (`lib/scouting/scouting.ts:169`,
`lib/admin/matching-workbench.ts:224`). Because that column is 100 % NULL, the bridge map is always
empty, so `mapped.length` is always 0 and every ESCO-picked demand falls through to free-text
recognition (`need-skills.ts:130-133`). Similarly the ESCO typeahead in
`components/app/skill-clarify-form.tsx:57-66` submits only `name="label"` — the `conceptId` is
discarded, so an ESCO pick lands in `skill_candidate_clarifications.label` as plain text (that
table has no `esco_uri` column at all).

**This is the single largest unrealised asset in the product: a 1.04 M-row, 28-language,
sector-complete taxonomy sits in prod doing nothing, while the shipped catalogue is 61 %
construction.**

### 3.5 Live data mirrors the skew

```sql
select s.category, count(*) as linked_worker_skills
from public.worker_skills ws join public.skills s on s.id = ws.skill_id
group by 1 order by 2 desc;
```

**26 of 33 `worker_skills` rows (78.8 %) are construction categories.** Non-construction: cleaning 2,
agriculture 1, education 1, it 1, sales 1, events 1.

```sql
select 'worker_skills.source' k, coalesce(source,'(null)') v, count(*) n from public.worker_skills group by 2
union all select 'worker_skills.verified', verified::text, count(*) from public.worker_skills group by 2
union all select 'profile_skill_claims.status', coalesce(status,'(null)'), count(*) from public.profile_skill_claims group by 2;
```

| Key | Value | n |
|---|---|---:|
| worker_skills.source | self_declared | 18 |
| worker_skills.source | work_journal | 13 |
| worker_skills.source | manager_confirmed | 2 |
| worker_skills.verified | false | 31 |
| worker_skills.verified | true | 2 |
| profile_skill_claims.status | self_declared | 27 |

```sql
select (select count(*) from public.market_intelligence_observations) observations,
       (select count(*) from public.market_rate_averages) market_rate_rows,
       (select count(*) from public.customer_requests) customer_requests,
       (select count(*) from public.candidate_skills) candidate_skills_rows;
-- → observations = 76, market_rate_rows = 0, customer_requests = 17, candidate_skills_rows = 0
```

Eurostat observations in prod are **macro only** — `labour.employment_rate`,
`labour.unemployment_rate`, `labour.job_vacancy_rate`, `labour.cost_index_yoy` for LT / PL / DE +
EU aggregate. Nothing occupation-level, nothing salary-level. `market_rate_averages` is empty, so
the salary benchmark model returns `insufficient_data` for every worker on every page it is
mounted (`app/[locale]/dashboard/opportunities/page.tsx:42`, `app/[locale]/dashboard/page.tsx:60`).

---

## 4. Matching assessment

### 4.1 Is it real matching or keyword overlap?

It is **weighted set-intersection over skill ids, plus a rule-based blocker/cap layer**. Not an
LLM, not a learned ranker, but also not naive keyword overlap — the skill ids are resolved
first and the evidence tier is weighted:

```ts
// apps/web/lib/market/match-v1.ts:89-93
const EVIDENCE_WEIGHT: Record<EvidenceTier, number> = {
  manager_confirmed: 1.0, work_journal: 0.7, self_declared: 0.4,
};
// :411-421  weightedMatched += EVIDENCE_WEIGHT[tier];
//           evidenceWeightedCoverage = weightedMatched / skillFit.needTotal
// :1317-1328 >= 0.8 strong | >= 0.5 possible | else weak; hard block caps to weak
// :1330      eligible = !hardBlock && blocking.length === 0
```

Base coverage percentage: `fit.ts:60` `Math.round(matchedUris.length / need.length * 100)`, and
`fit.ts:47-48` returns `null` (no percentage at all) when the need is unstructured — an honest
refusal rather than a fabricated score.

**Ranking comparator** `match-v1.ts:316-327`: status → `skillFit.pct` → confirmed-match count →
availability rank `{available:3, busy:2, unknown:1, unavailable:0}`.

### 4.2 Criterion-by-criterion

| Criterion | Implemented? | Reachable in production? | Evidence |
|---|---|---|---|
| Skills overlap | Yes — the only thing that moves the % | Yes | `fit.ts:55-60`, `match-v1.ts:360-365` |
| Evidence tier weighting | Yes | Yes | `match-v1.ts:89-93, 411-421` |
| Geography — **haversine distance** | Yes, real formula | **No — dead code** | `match-v1.ts:194-208`; gated at `:476-493` on `need.lat/lng/radiusKm` + `subject.lat/lng`, and **no production read layer sets any of them**: `need-from-request.ts:49-64`, `opportunities/opportunity-need.ts:24-31`, `match-subject.ts:216-243`. Only tests exercise it (`guards/location-matching.test.ts`, `matching-market-scenarios.test.ts:223`) |
| Geography — city string equality | Yes | Worker board only (`opportunities/worker-subject.ts:157`); **never in company scouting** (`match-subject.ts:216-243` sets no city) | `match-v1.ts:494` |
| Geography — country / mobility | Yes | Yes | `match-v1.ts:502-522` |
| Languages (flat list) — **hard block** | Yes | Yes | `match-v1.ts:591-621` |
| Languages (CEFR A1..native) | Yes | Yes | `match-criteria-v2.ts:227-250`, wired `match-v1.ts:809-860` |
| Availability (status + start window) | Yes | Yes | `match-v1.ts:571-588`, `match-criteria-v2.ts:178-197` |
| Salary — structured v2 with 15 % negotiable band | Yes | Yes | `match-criteria-v2.ts:120, 147-166` |
| Salary — legacy ceiling | Yes | No — `payOfferedEurMax` never populated | `match-v1.ts:624-648` vs `need-from-request.ts:49-64` |
| **Documents / permits / visa / A1** | **No** | — | zero hits for `document|permit|visa` in `match-v1.ts` / `match-criteria-v2.ts`; `MatchCriterionId` union `match-criteria-v2.ts:41-61` has no document criterion. Documents exist only as a *detected text topic* (`recognition/missing-fields.ts:216-224`) and a risk flag (`risk-flags.ts:31`) — never scored |
| Experience / seniority | Yes, but only if the demand author set a tier | Partly | `match-v1.ts:1195-1242` |
| Licence categories / own vehicle / own tools | Yes | Yes | `match-v1.ts:867-1032` |
| Night / weekend / overtime | Yes | Yes | `match-v1.ts:1072-1187` |
| Accommodation | Yes (soft cap) | Only via structured_v2 | `match-v1.ts:651-664, 1249-1314` |
| Profession relatedness (Jaccard ≥ 0.2) | Yes | Yes | `match-v1.ts:552-553`, `taxonomy/profession-skills.ts:92-100` |

### 4.3 Explainability

Genuinely good. Two channels:

- `reasons[]` / `gaps[]` (`match-v1.ts:225-248`) rendered as chips in
  `app/[locale]/dashboard/company/scouting/page.tsx:572-598`, i18n `scouting.reason.*` (12 keys) /
  `scouting.gap.*` (7 keys).
- Contract-v2 tiers `blocking` / `strengths` / `negotiables` / `missingFacts` rendered by the shared
  `components/app/match-tier-explanation.tsx:76-146`, mounted on the worker board
  (`opportunities/page.tsx:1024-1027`) and admin workbench (`admin/matching/page.tsx:400-403`).
  Missing facts render as "X has not stated Y" (`:124-146`) — an honest unknown, not a penalty.

### 4.4 Zero-match behaviour

No fabricated candidate, no fake score anywhere:

| Surface | Empty state | Key |
|---|---|---|
| Company scouting, no filters | `data-testid="scouting-empty"` | `scouting.noCandidates` (`messages/en.json:7097`) |
| Company scouting, filters on | clear-filters link | `scouting.filters.noMatches` (`:7245`) |
| Need not structured | `data-testid="scouting-not-structured"` | `scouting.notStructured` (`:7095`) |
| Worker board, none | CTA → `/dashboard/profile` | `opportunities.approvedEmptyTitle/Body/Cta` (`:7925-7927`) |
| Worker board, filtered to zero | reset button | `opportunities.discovery.emptyFiltered.*` (`:7837-7841`) |

### 4.5 Rare skills, multi-sector workers

- A rare skill outside the 153-row catalogue cannot become a `worker_skills` row at all. It lands
  in `profile_skill_claims` (free label) or `skill_candidate_clarifications`. Neither is used by
  `matchWorkerToNeed` — `match-subject.ts` reads `worker_skills` only. **A worker whose real trade
  is not in the 153 rows is unmatchable by design.** `candidate_skills` has 0 rows in prod.
- Multi-sector workers are handled correctly at recognition time (probe row `Mixed` in §5 returned
  `programming + driving + tiling` from one entry), but matching is single-need so cross-sector
  breadth neither helps nor hurts.

### 4.6 Discriminatory ranking risk

No protected attribute is read by any scorer. `MatchSubject` (`match-v1.ts:140-190`) has no name,
DOB, gender, nationality or photo. `lib/scouting/scout-safe-view.ts:78, 114-115` explicitly strips
`displayName`/`headline`; `match-team-v1.ts:56-57` and `recognition/types.ts:134` document that ids
are opaque. Residual risks in §7.2.

---

## 5. Robustness — what the code actually does

Rows marked **[probe]** were executed against the real recogniser
(`recognizeSkills` / `classifyEntryRecognition` / `deriveJournalRecognition`); output is verbatim.

| Input | What the code does | Evidence |
|---|---|---|
| Empty / whitespace entry | `recognizeSkills` returns `[]` at `skill-recognition.ts:202`; tier = `manual_only` `recognition-tiers.ts:56-63` | **[probe]** `Empty → tier=manual_only, skills=-, caps=-` |
| Nonsense (`asdf qwerty zzz`) | No match, no invented skill | **[probe]** `Nonsense → tier=manual_only` |
| **LT without diacritics** | `foldText` strips diacritics from *both* sides (`normalize.ts:52-60`), so diacritic-free text matches. **But needle stems are inflection-specific**, so recall differs by form: `Muriau` misses the `mūrij`→`murij` needle while `Murijau` hits it | **[probe]** `"Muriau siena ir tinkavau fasada"` → `plastering` only; `"Murijau siena"` → `bricklaying`; `"Mūrijau sieną"` → `bricklaying` + capability `Mūrijimas`. **The diacritic folding works; the morphology does not.** |
| RU (Cyrillic) journal text | Same single dictionary, 393 Cyrillic needles across 176/177 rows | `keywords.ts:41-50`; **[probe]** `Nurse/RU "Медсестра, ставила уколы…"` → 0 skills, capability `Slauga / vaikų priežiūra` only |
| EN journal text | Same dictionary + `SKILL_SYNONYMS` | **[probe]** `Welder/EN` → `tig-welding(exact)` + `welding-blueprint(synonym)` |
| **IT work described in plain language** | Nothing recognised in EN | **[probe]** `"Refactored the payment service and deployed a hotfix to production."` → `tier=manual_only, skills=-, caps=-`. LT `"Programavau nauja funkcija"` works (`programming/exact`) |
| **Healthcare work** | EN and RU produce **zero skills**; LT produces the *wrong* skill | **[probe]** `"Slaugiau ligonius, matavau kraujospūdį ir leidau vaistus"` → `elderly-care(exact, matched "Slaugiau")` **auto-persisted**; the entry was about medication and blood pressure, i.e. nursing, and the catalogue has no nursing skill |
| **Teaching work** | Nothing at all in EN or LT despite a `teaching` slug existing | **[probe]** `"Taught a maths lesson to year 7 and marked homework"` → `manual_only`, 2/2 fragments unresolved; `"Mokiau vaikus matematikos"` → same |
| **Manufacturing work** | Nothing | **[probe]** `"Operated the CNC lathe and ran quality checks on 400 parts"` → `manual_only`, 2/2 unresolved |
| **Hospitality (idiomatic)** | Nothing | **[probe]** `"Prepped mise en place and plated 80 covers during dinner service"` → `manual_only`, 2/2 unresolved. Plain `"Cooked 80 meals in the restaurant kitchen"` works (`cooking/exact` via "kitchen") |
| **Creative work** | Nothing, and worse — see F-2 | **[probe]** `"Edited a 3 minute promo video and colour graded the footage"` → `manual_only`, 1/1 unresolved. `"Photographed a wedding and edited the photos"` → **`welding-blueprint (fuzzy, matched "wedding")`** |
| **Logistics (past-tense verb)** | False positive | **[probe]** `"Picked 240 orders and loaded two trucks"` → **`packaging (fuzzy, matched "Picked")`**; the correct `order-picking` slug only fires on the literal phrase `"order pick"` — **[probe]** `"Order picking in the warehouse, forklift, pallets"` → 4 correct exact hits |
| Ambiguous LT ("ploviau grindis") | Cleaning-context guard suppresses `flooring` | `skill-recognition.ts:56-75`; **[probe]** → 0 skills, capability `Valymo darbai` |
| "elektriniai įrankiai" (power tools) | Guard suppresses `electrical-install` | `skill-recognition.ts:96-104` |
| `filled` / `helped` in EN prose | Blocklisted from the fuzzy tier | `skill-recognition.ts:111` |
| First-letter typo | Rejected — fuzzy requires the first char to match | `skill-recognition.ts:243` |
| Duplicate skill across fragments | Deduped; provenance merged into the strongest survivor | `journal-recognition.ts:397-427` |
| Unmatched but meaningful fragment | Becomes an `unresolved` outcome; a loud `console.error` fires if the zero-silent-loss invariant ever breaks | `journal-recognition.ts:384-392, 476-484` |
| Corrupt / encrypted PDF | Parser throw swallowed → `{kind:"failed"}` → HTTP 422 `code:"failed"`; no bytes logged | `cv/extract.ts:112-115`, `app/api/cv/extract/route.ts:65-70` |
| **Scanned / image-only PDF** | Does **not** throw — `unpdf` returns empty text → `{kind:"empty"}` → HTTP 422 `code:"empty"`. **There is no OCR anywhere in the repo** | `cv/extract.ts:110` |
| File > 5 MB | Rejected twice (Content-Length pre-check, then byte check) | `extract.ts:31, 98`; route `:32-35, 48-50` |
| **CV without diacritics** | Skill folding is fine, but `cv/structured-parse.ts` does **not** call `foldText`. Patterns requiring exact diacritics silently miss: `šved` (Swedish), `pažymėjim` (certificate), `išsilavinimas` / `pasiekimai` (section headers), `šiuo metu`, `išvykti` | `structured-parse.ts:100-186` vs `structuring/normalize.ts:52-60` |
| Unknown language code from AI (if live) | Dropped rather than stored | `cv-ai-structuring-actions.ts:145` |
| Unknown education slug from AI (if live) | Coerced to `"other"` | `cv-ai-structuring-actions.ts:136-138` |

---

## 6. Hallucination / false-attribution risk

### 6.1 Can the system assert a skill the worker never claimed? — **Yes, in one path.**

`apps/web/lib/journal/skill-pipeline.ts:483-500` inserts `worker_skills` rows for every
**exact/synonym**-recognised active slug the worker has not already declared, with **no confirm
step**:

```ts
// skill-pipeline.ts:485-500
const toAdd = resolved.filter((r) => !inputs.declaredSlugs.has(r.slug));
const rows = toAdd.map((r) => ({
  worker_id: worker.id, skill_id: r.id,
  verified: false, source: "self_declared", confidence_bin: "yellow",
}));
await sb.from("worker_skills").upsert(rows, { onConflict: "worker_id,skill_id", ignoreDuplicates: true });
```

The gate is `strong = r.via === "exact" || r.via === "synonym"` (`journal-recognition.ts:264-266`).
Fuzzy hits are correctly held back as confirmable candidates — **[probe]** confirmed:
`Photographer/EN` produced `candidates=[fuzzy_skill:welding-blueprint]` and
`AUTO-PERSISTED=[ ]`. But **[probe]** `Nurse/LT` produced
`AUTO-PERSISTED=[elderly-care/exact]` — a nurse's medication entry silently wrote an
`elderly-care` skill onto her CV. The worker never typed "elderly care"; a lexicon substring did.

Three aggravating details:
1. `source` is written as `"self_declared"` even though the source was a machine reading of journal
   text (`:493`). The provenance column lies about how the row got there.
2. The system-wide doctrine reproduced at `keywords.ts:2-4` and `universal-recognition.ts:11-13`
   says "suggestions are NEVER facts — the worker confirms each one". That is true for claims,
   ambiguous readings and fuzzy hits, and **false for exact/synonym hits**.
3. Because the healthcare/IT/education/creative catalogue is 1–4 skills deep, an exact hit in those
   sectors is far more likely to be a *near*-miss mapped onto the only available slug
   (nursing → `elderly-care`) than in construction where the catalogue is 94 deep.

### 6.2 Is AI output presented as fact without explanation? — **No AI output exists.** But two
deterministic outputs are presented more confidently than they deserve.

**(a) The confidence dot is decorative.** `lib/journal/confidence.ts:34-38`:

```ts
export function binFor(score: number): ConfidenceBin {
  if (score === 0) return "red";
  if (score < 30) return "green";
  return "yellow";
}
```

Note the ordering is already odd (green for a *lower* score than yellow). More importantly the bin
that reaches the UI is not computed from the score at all — `skill-pipeline.ts:496` and
`skill-pipeline-actions.ts:322` write the literal `"yellow"`, while `computeConfidence` only ever
runs inside `confirm-actions.ts:92-105`. Prod proves it never ran:

```sql
select confidence_bin, confidence_score, count(*) n, max(last_recompute_at) mx
from public.worker_skills group by 1,2;
-- green | 0 | 2  | null
-- yellow| 0 | 11 | null
-- red   | 0 | 20 | null
```

**All 33 rows have `confidence_score = 0` and `last_recompute_at = NULL`, yet 13 render a non-red
dot.** `components/app/cv-engagement-cards.tsx:28-32` maps `yellow → bg-state-warning` and
`green → bg-state-success`, so a worker's CV shows amber/green "confidence" for skills with zero
evidence and zero recomputation.

**(b) The provenance badge renders a raw i18n key.** `cv-engagement-cards.tsx:146-150` calls
`t("verified")` and `t("declared")` in the `journal.cv` namespace. That namespace contains only
five keys:

```
messages/{lt,en,ru}/journal.json → cv: { journalBacked, present, primary, skills, title }
```

`journal.cv.verified` and `journal.cv.declared` **do not exist in any of the 12 locales**. A legacy
copy exists at `messages/en.json:6551-6554`, but `lib/i18n/request.ts:33-41` spreads the base file
first and then assigns `journal: journal.default`, which **replaces** the whole namespace — the
legacy block is dead. next-intl v4 therefore falls back to the key path, so a manager-confirmed
skill is labelled `✓ journal.cv.verified` and a self-declared skill `journal.cv.declared` on the
worker's CV. The existing guard `lib/guards/skill-verification-provenance.test.ts:43-55` only
asserts `cv.journalBacked`, so it passes.

### 6.3 What is genuinely well built

- Zero-silent-loss invariant with a loud console error (`journal-recognition.ts:476-484`).
- Two hand-audited false-positive blockers with documented real-world causes
  (`skill-recognition.ts:43-75`, `:77-104`).
- Fuzzy tier guarded four ways: min token length 6, min stem length 6, edit distance ≤ 1,
  first-character must match (`skill-recognition.ts:37-41, 243`), plus a token blocklist (`:111`).
- Every match carries `matchedText` so the UI can always say *why* (`journal.reasonFound`).
- `high_risk_verified` tier is always blocked as `needs_human_confirmation`
  (`task-routing.ts:497-510`).
- `skill_evidence` agent makes `manager_or_client_confirmed` structurally impossible in its schema
  (`registry/agents/skill-evidence.ts:20-28`).
- No protected attribute anywhere in ranking (§4.6).

---

## 7. Risks

### 7.1 Hallucination / false attribution
See F-2 and F-3. Severity is amplified by catalogue thinness outside construction.

### 7.2 Bias
- **Language as a hard block** (`match-v1.ts:612-618`, `:845-852`) sets `eligible:false` with no
  proportionality test. This is the classic nationality proxy in EU labour law. There is no field
  asking whether the language is genuinely job-essential.
- **Freshness demotion ranks before fit** — `lib/scouting/scouting.ts:271-275` sorts
  `freshnessDemotionRank(...)` **before** `compareMatches(...)`, so a dormant profile loses to a
  fresher one regardless of skill fit, and this factor is **not** in `reasons[]` (only a badge at
  `scouting/page.tsx:455-461`).
- **Structural sector bias** — §3. A construction worker is matchable to 94 skills; a nurse to 3, a
  designer to 1. Recall failure is invisible: the worker just never appears in results.
- `experience_years` is age-correlated but only evaluated when the demand author tiers it
  (`match-v1.ts:1197`).

### 7.3 Privacy
- **Today: excellent.** Recognition, matching, CV parsing and the confidence model are all pure and
  local. `cv/extract.ts` stores nothing; the route logs no bytes. No third-party call exists.
- **If the AI runtime is switched on:** raw journal text (≤ 8 000 chars) and the entire CV/profile
  text (≤ 8 000 chars) would be serialised verbatim into the provider prompt
  (`providers/anthropic.ts:84-100`). The `NEVER_NEEDED` minimisation list
  (`task-routing.ts:132-140`) is **declarative only** and is never enforced by `run-agent.ts`.
- **If switched on with `ai_runs` unapplied:** no audit row is written (`audit-store.ts:148-170`
  fails soft) **and the daily-run budget is silently unenforced** (`run-agent-server.ts:38-41` →
  `run-agent.ts:206`). That is an uncapped external spend + an unlogged export of user text.

---

## 8. Findings

### F-1 — ESCO (1.04 M labels, 28 languages, 126 k occupation↔skill edges) is loaded in prod but linked to nothing

- **Problem.** `professions.esco_uri` and `skills.esco_uri` are NULL on 100 % of rows. Every
  ESCO→slug bridge in the product is therefore an empty map, and every ESCO typeahead pick is
  reduced to a plain text label.
- **Evidence.** SQL §3.4 (`professions_esco_linked = 0`, `skills_esco_linked = 0`,
  `esco_labels = 1 045 186`). Bridge builders: `lib/scouting/scouting.ts:162-169`,
  `lib/admin/matching-workbench.ts:217-224`; consumer `lib/market/need-skills.ts:110-133`.
  Typeahead discards `conceptId`: `components/app/skill-clarify-form.tsx:57-66`,
  `components/app/esco-typeahead.tsx:83-100`.
- **Affected user.** Every worker and employer outside construction; anyone using the typeahead.
- **Paths.** `apps/web/lib/market/need-skills.ts`, `apps/web/lib/scouting/scouting.ts`,
  `apps/web/lib/admin/matching-workbench.ts`, `apps/web/lib/taxonomy/esco-autocomplete.ts`,
  `apps/web/components/app/skill-clarify-form.tsx`, `supabase/migrations/20260610130100_esco_uri_refs.sql`.
- **Business impact.** The one asset that would make the product credibly sector-neutral in one
  step is inert. Sales cannot claim EU-standard taxonomy coverage.
- **Risk.** HIGH (strategic), LOW (technical safety).
- **Fix.** (a) Populate `skills.esco_uri` / `professions.esco_uri` for the 202 existing rows via a
  curated mapping reviewed by the owner — never auto-mapped. (b) Persist `conceptId` from the
  typeahead into `skill_candidate_clarifications` / `candidate_skills` (needs a column). (c) Use
  `esco_occupation_skills` to propose profession→skill expansions for uncovered sectors.
- **Acceptance.** `select count(*) from skills where esco_uri is not null` ≥ 140; a demand created
  through the ESCO typeahead yields `source = 'esco_mapped'` in `need-skills.ts:118-127`; a guard
  test asserts the bridge map is non-empty in a seeded fixture.
- **Dependencies.** Owner sign-off on the ESCO licence/attribution (already rendered at
  `lib/config/esco.ts:14-15`); a migration to add `esco_uri`/`esco_concept_id` to the clarification
  tables.
- **Effort.** M (2–4 d for a–b; the mapping review is the long pole).
- **Suggested loop.** Loop 5 (taxonomy / data).

### F-2 — Skill recognition fails silently for healthcare, education, manufacturing, hospitality-idiom, creative and English IT

- **Problem.** For six of the twelve sectors in the brief the recogniser returns **nothing** on
  ordinary work descriptions, so the entry becomes 100 % `unresolved` and the worker's CV never
  grows. Two cases return an actively wrong construction skill.
- **Evidence.** §5 probe, verbatim: `Teacher/EN` → `manual_only`, 2/2 unresolved;
  `Teacher/LT` → same; `Manufacturing/EN` ("Operated the CNC lathe") → 2/2 unresolved;
  `Hospitality/EN` ("mise en place / 80 covers") → 2/2 unresolved; `Creative/EN` (video editing) →
  1/1 unresolved; `IT/EN` ("Refactored the payment service") → nothing;
  `Nurse/EN` and `Nurse/RU` → zero skills. Wrong answers: `Photographer/EN`
  ("Photographed a wedding") → `welding-blueprint (fuzzy, "wedding")`; `Logistics/EN` ("Picked 240
  orders") → `packaging (fuzzy, "Picked")`. Root cause is catalogue depth (§3.2: healthcare 3
  skills, education 2, creative 1) and lexicon depth (§3.3: education 18 needles vs construction
  402).
- **Affected user.** Every non-construction worker — i.e. the majority of the addressable market.
- **Paths.** `apps/web/lib/structuring/keywords.ts:51-367`,
  `apps/web/lib/profile/skill-claim-extractor.ts:78+`,
  `apps/web/lib/structuring/language-packs/core-slugs.ts`,
  `supabase/migrations/20260704120000_universal_profession_skill_catalogue.sql`.
- **Business impact.** The product looks construction-only because, behaviourally, it is. A nurse or
  teacher who tries it once gets an empty result and does not return. This is exactly the owner's
  stated concern, now measured.
- **Risk.** HIGH.
- **Fix.** Deepen the catalogue and lexicon for the six failing sectors to at least the depth
  currently given to logistics (9 skills / 87 needles): healthcare (nursing, care assistant,
  medication administration, wound care, patient handling, phlebotomy), education (lesson planning,
  assessment, classroom management, SEN, early years), manufacturing (CNC, machining, assembly line,
  maintenance, QA), hospitality (front office, service, bar, banqueting), creative (photography,
  video editing, graphic design, copywriting, social media), IT-EN (add EN needles for deploy,
  refactor, code review, testing, incident). Do it as a **data** change plus lexicon rows — no new
  matching code. Prefer sourcing the labels from ESCO (F-1) rather than hand-writing them.
- **Acceptance.** A new guard corpus (extend `lib/structuring/cross-sector-journal-recognition.test.ts`)
  with ≥ 5 realistic LT + EN + RU entries per sector for all 12 brief sectors, asserting ≥ 1 correct
  recognised slug or capability label and **zero** cross-sector false positives; the six sectors
  above must reach ≥ 80 % non-unresolved fragments.
- **Dependencies.** F-1 (ESCO source), a catalogue seed migration, `messages/*/skill-names.json`
  updates for all 12 locales (currently 153/153 complete — keep it that way).
- **Effort.** L (1–2 weeks including translation review).
- **Suggested loop.** Loop 5, then a dedicated recognition-quality loop.

### F-3 — Exact/synonym matches are written to the worker's CV with no confirmation, and mislabelled `self_declared`

- **Problem.** The pipeline auto-inserts `worker_skills` for exact/synonym recognitions. The worker
  is never asked. The stored `source` says `self_declared`, which is untrue — the worker declared
  nothing; a substring matched.
- **Evidence.** `apps/web/lib/journal/skill-pipeline.ts:483-500` (quoted in §6.1); gate at
  `apps/web/lib/journal/journal-recognition.ts:264-266`. Probe: `Nurse/LT` →
  `AUTO-PERSISTED=[elderly-care/exact]` from an entry about medication and blood pressure. Prod:
  13 of 33 `worker_skills` rows carry `source = 'work_journal'` (§3.5), so the path is live.
  The doctrine this contradicts is stated at `keywords.ts:2-4` and `universal-recognition.ts:11-13`.
- **Affected user.** Every worker who writes a journal entry; most damaging outside construction
  where the nearest available slug is a poor fit.
- **Paths.** `apps/web/lib/journal/skill-pipeline.ts`, `skill-pipeline-actions.ts`,
  `journal-recognition.ts`, `apps/web/lib/journal/skill-source-apply.ts`.
- **Business impact.** A CV that asserts skills the worker never claimed is a trust and (for a
  regulated care role) a safety problem. It also undermines the "nothing is verified without a
  human" story that the rest of the product tells well.
- **Risk.** HIGH.
- **Fix.** Either (a) route exact/synonym recognitions through the same confirm step the fuzzy and
  claim lanes already use, or (b) keep auto-add but write `source:'work_journal'` (never
  `self_declared`), surface an explicit "added from your entry — remove?" affordance, and exclude
  auto-added rows from `EVIDENCE_WEIGHT` until confirmed. (b) is the smaller change and preserves
  the current UX.
- **Acceptance.** A guard test asserts no `worker_skills` row is created with
  `source='self_declared'` from the journal pipeline; a probe entry in a non-construction sector
  produces a *candidate*, not a row; existing 13 `work_journal` rows are unaffected.
- **Dependencies.** None (no migration needed for option b).
- **Effort.** S (1–2 d).
- **Suggested loop.** Loop 6 (trust/verification).

### F-4 — The confidence dot on the CV is decorative and can never be right

- **Problem.** `confidence_bin` is written as a hardcoded literal, never derived from
  `confidence_score`. `computeConfidence` runs only on manager confirmation and has never run in
  prod. The UI colours the dot from the literal.
- **Evidence.** `apps/web/lib/journal/skill-pipeline.ts:496` and `skill-pipeline-actions.ts:322`
  write `confidence_bin: "yellow"`; `apps/web/lib/journal/confirm-actions.ts:92-105` is the only
  caller of `computeConfidence`; `apps/web/lib/journal/confidence.ts:34-38` would return `"red"`
  for score 0. Prod SQL (§6.2): all 33 rows `confidence_score = 0`, `last_recompute_at = NULL`, yet
  2 green + 11 yellow. Render: `components/app/cv-engagement-cards.tsx:28-32, 118-123`.
  Secondary: the bin ordering itself is inverted (green = `< 30`, yellow = `>= 30`).
- **Affected user.** Every worker viewing their CV; every manager reading it.
- **Paths.** `apps/web/lib/journal/confidence.ts`, `skill-pipeline.ts`, `skill-pipeline-actions.ts`,
  `confirm-actions.ts`, `components/app/cv-engagement-cards.tsx`,
  `app/[locale]/dashboard/profile/page.tsx:334-347`.
- **Business impact.** A visible trust signal that is not backed by any computation. If an employer
  ever relies on it, the platform is asserting confidence it does not have.
- **Risk.** MEDIUM-HIGH.
- **Fix.** Either derive the bin at read time from the real inputs (entries, confirmations,
  recency) and delete the stored literal, or remove the dot from the CV until the recompute job
  exists. Also fix the inverted `binFor` bands (`red < green < yellow` reads backwards; make it
  `red` → `amber` → `green` ascending).
- **Acceptance.** A guard test asserts `confidence_bin` is never written as a literal outside
  `computeConfidence`; `binFor` has an ascending-quality mapping with a unit test per band; no
  worker_skills row can have `confidence_bin != binFor(confidence_score)`.
- **Dependencies.** None for the read-time derivation; a backfill for the 33 existing rows if the
  stored column is kept.
- **Effort.** S (1 d) for read-time derivation.
- **Suggested loop.** Loop 6.

### F-5 — The CV provenance badge renders a raw i18n key in all 12 locales

- **Problem.** `journal.cv.verified` and `journal.cv.declared` do not exist in any locale file, so
  next-intl falls back to the key path. Workers see `✓ journal.cv.verified` / `journal.cv.declared`
  on their CV.
- **Evidence.** `components/app/cv-engagement-cards.tsx:146-150` calls `t("verified")` / `t("declared")`
  in namespace `journal.cv` (`:55`). `messages/{lt,en,ru,pl,de,nl,da,no,sv,fi,et,lv}/journal.json`
  → `cv` has exactly 5 keys: `journalBacked, present, primary, skills, title`. A dead legacy copy
  sits at `messages/en.json:6551-6554` but `lib/i18n/request.ts:33-41` replaces the whole `journal`
  namespace. The existing guard `lib/guards/skill-verification-provenance.test.ts:43-55` only checks
  `cv.journalBacked`, so CI is green. Prod has 39 `engagement_contexts` rows, so the component does
  render.
- **Affected user.** Every worker with an engagement context — the CV is the flagship surface.
- **Paths.** `apps/web/components/app/cv-engagement-cards.tsx`, `apps/web/messages/*/journal.json`,
  `apps/web/lib/guards/skill-verification-provenance.test.ts`.
- **Business impact.** The single most visible trust badge on the product's showcase screen is
  broken text.
- **Risk.** MEDIUM (cosmetic, but on the highest-visibility surface).
- **Fix.** Add `cv.verified` and `cv.declared` to all 12 `messages/*/journal.json`; extend the
  existing guard to assert every `t("…")` literal used in `cv-engagement-cards.tsx` resolves in
  every locale.
- **Acceptance.** Guard asserts all three provenance keys present in 12/12 locales; a browser check
  on `/dashboard/profile` shows translated badges.
- **Dependencies.** None.
- **Effort.** XS (2 h).
- **Suggested loop.** Loop 7 (i18n/copy) or fold into F-4.

### F-6 — 7 of 11 registered AI agents, and 5 of 6 recognition helpers, have no production caller

- **Problem.** Substantial declared surface with zero user benefit. It reads as "we have AI" while
  nothing runs.
- **Evidence.** No `runAiAgent` call site outside these five: `cv-ai-structuring-actions.ts:58`,
  `worker-intake-actions.ts:40`, `journal-ai-suggestions-actions.ts:55`,
  `company-need-actions.ts:39`, `match-preview-actions.ts:96` (that file is headed
  **"⛔ DEPRECATED — FROZEN LEGACY FORK"** at `:1-8`). Unreferenced agents: `skill_evidence`,
  `country_readiness`, `document_assistant`, `booking_risk`, `admin_risk`, `support_onboarding`,
  `translation_copy`. Unreferenced recognition helpers: `recognizeJobDemand`, `explainTopMatches`,
  `classifyParticipation`, `buildWeeklyPublicDigest`, `buildPrivateProgressMessage` — used only by
  `lib/market/recognition/recognition-v1.test.ts`. The older `lib/ai/provider.ts` seam is
  permanently noop (`noop-provider.ts:30-45`).
- **Affected user.** None directly; the maintenance and honesty cost is the owner's.
- **Paths.** `apps/web/lib/ai/registry/agents/*.ts`, `apps/web/lib/market/recognition/*.ts`,
  `apps/web/lib/ai/provider.ts`, `apps/web/lib/ai/noop-provider.ts`.
- **Business impact.** Confuses any future audit or investor review about what the product does.
- **Risk.** LOW.
- **Fix.** Either wire the two or three that carry real value (`skill_evidence`,
  `country_readiness`) or move the rest behind an explicit `docs/ai/PLANNED_AGENTS.md` and delete
  the dead recognition helpers.
- **Acceptance.** Every file under `lib/ai/registry/agents/` either has a production caller or is
  listed in a planned-agents doc; a guard test enforces the invariant.
- **Effort.** S.
- **Suggested loop.** Loop 8 (cleanup).

### F-7 — Haversine distance matching is dead code; company scouting has no city signal at all

- **Problem.** A correct haversine implementation exists and is never reachable, because no
  production read layer populates `lat`/`lng`/`radiusKm`. In company scouting the subject builder
  does not even set `city`, so geography degrades to country-string equality.
- **Evidence.** `apps/web/lib/market/match-v1.ts:194-208` (formula), gated at `:476-493`.
  `lib/market/need-from-request.ts:49-64` — the canonical demand→need builder — sets no
  `lat`/`lng`/`radiusKm`. `lib/opportunities/opportunity-need.ts:24-31` likewise.
  `lib/market/match-subject.ts:216-243` sets neither `lat`/`lng` nor `city`.
  `distanceKm`/`radiusKm` appear outside `match-v1.ts` only in
  `lib/guards/location-matching.test.ts` and `matching-market-scenarios.test.ts:223`.
- **Affected user.** Employers filtering by travel distance; workers who would commute.
- **Paths.** as above.
- **Business impact.** "Matched by distance" cannot be claimed. Cross-border matching is
  country-granular only.
- **Risk.** MEDIUM.
- **Fix.** Populate `lat`/`lng`/`radiusKm` in `need-from-request.ts` from the demand's location, and
  `city`/`lat`/`lng` in `match-subject.ts` from the worker's stated location; or delete
  `distanceKm` and stop implying distance matching.
- **Acceptance.** A demand with a radius returns a distance-based `reasons[]` entry in a seeded
  integration test; `scouting` produces `city_match` for a same-city worker.
- **Dependencies.** Whether the demand form captures coordinates at all (not verified — §10).
- **Effort.** M.
- **Suggested loop.** Loop 3 or a dedicated matching loop.

### F-8 — Documents / work permits / visas are never scored, despite being a stated risk field

- **Problem.** No document, permit, visa or A1 criterion exists in the matching engine. For
  cross-border EU labour — the product's core use case — this is the criterion most likely to make
  a match unworkable in reality.
- **Evidence.** Zero hits for `document|permit|visa` in `match-v1.ts` / `match-criteria-v2.ts`; the
  `MatchCriterionId` union at `match-criteria-v2.ts:41-61` has no document member. Documents appear
  only as a recognised text topic (`lib/market/recognition/missing-fields.ts:216-224`) and a risk
  flag (`risk-flags.ts:31`).
- **Affected user.** Every third-country-national worker and every employer hiring across borders.
- **Paths.** `apps/web/lib/market/match-criteria-v2.ts`, `match-v1.ts`,
  `lib/market/recognition/missing-fields.ts`.
- **Business impact.** Matches are presented as eligible that a compliance officer would reject.
- **Risk.** MEDIUM-HIGH.
- **Fix.** Add a `documents` criterion to the v2 contract as a `missingFacts`-first tier (never a
  silent block): required-document list on the need vs held-document metadata on the subject,
  surfaced as "X has not stated Y" rather than a hard block until the data is reliable.
- **Acceptance.** `MatchCriterionId` includes a document criterion; a need requiring a permit
  produces a `missingFacts` entry for a subject with no permit metadata; no candidate is hard
  blocked on documents in v1.
- **Dependencies.** `worker_documents` schema and RLS (not audited in this loop).
- **Effort.** M.
- **Suggested loop.** Dedicated matching loop.

### F-9 — Recognition of a *demand* only knows 10 countries and 6 currencies

- **Problem.** The location rule in the market-recognition regex set is hardcoded to Nordic/Baltic
  countries, so a demand in ES/FR/IT/PT/IE/BE/AT/CH/CZ is reported as "location missing" even when
  clearly stated. The currency set excludes GBP/CHF/CZK/HUF/RON.
- **Evidence.** `apps/web/lib/market/recognition/missing-fields.ts:50-52` (10-country pattern),
  `:99` (currency set). The only recognition fixture is `SHIP_CARPENTER` — a Norwegian shipyard
  role (`recognition/recognition-v1.test.ts:18-20`) — so the gap is invisible to CI.
- **Affected user.** Employers in most of the EU; the `/dashboard/market/recognize` surface.
- **Paths.** `apps/web/lib/market/recognition/missing-fields.ts`,
  `apps/web/lib/market/recognition/recognition-v1.test.ts`.
- **Business impact.** Expansion beyond the Nordic/Baltic corridor silently degrades.
- **Risk.** MEDIUM.
- **Fix.** Replace the country regex with an ISO-3166 name/alpha-2 list across the product locales;
  extend the currency set; add non-Nordic fixtures.
- **Acceptance.** A Spanish and a French demand both recognise `location`; fixtures cover ≥ 6
  countries and ≥ 3 sectors.
- **Effort.** S.
- **Suggested loop.** Loop 3 or the matching loop.

### F-10 — If the AI runtime is switched on, spend is uncapped and nothing is logged

- **Problem.** The daily-run budget guard depends on a count from `ai_runs`. That table does not
  exist in prod, `countAiRunsTodayBestEffort` returns `null`, and the guard is skipped entirely.
  Audit persistence also fails soft. So "switch on AI" today means uncapped external calls plus an
  unlogged export of user journal/CV text.
- **Evidence.** `apps/web/lib/ai/runtime/audit-store.ts:179-202` (returns `null` on error),
  `apps/web/lib/ai/run-agent-server.ts:38-41` (`if (counted !== null) runsToday = counted`),
  `apps/web/lib/ai/run-agent.ts:206` (`opts.runsToday !== undefined` gate),
  `audit-store.ts:148-170` (persist catches and returns `false`).
  `supabase/migrations/20260714150000_ai_runs_audit_v1.sql:1-4` is headed
  "DRAFT — needs-human-gate — DO NOT APPLY automatically". Prod: `to_regclass('public.ai_runs') = null`.
  Prompt contents: `providers/anthropic.ts:84-100`. Minimisation list is declarative only:
  `task-routing.ts:132-140` is never applied in `run-agent.ts`.
- **Affected user.** The owner (spend) and every worker (unlogged text export).
- **Paths.** as above.
- **Business impact.** A single env change could produce unbounded cost with no audit trail.
- **Risk.** HIGH *conditional on activation*; LOW today.
- **Fix.** Make activation fail-closed: if `cfg.state === "live"` and `ai_runs` is absent, refuse to
  dispatch (`run-agent.ts` should treat `runsToday === null` as `budget_exceeded`, not as
  "unknown"). Enforce `prohibitedFields` at dispatch. Apply `20260714150000` before any live flip.
- **Acceptance.** A unit test asserts `runAiAgent` returns `blocked/budget_unavailable` when the
  audit count is `null` and state is `live`; a test asserts a prohibited field in `input` is
  rejected.
- **Dependencies.** Owner gate on applying `20260714150000`.
- **Effort.** S.
- **Suggested loop.** Must precede any AI-activation loop.

### F-11 — `market_rate_averages` is empty, so the salary intelligence surfaces are permanently "insufficient data"

- **Problem.** Two dashboard surfaces mount a salary benchmark that can never produce a number.
- **Evidence.** `select count(*) from public.market_rate_averages` → **0**.
  `lib/intelligence/intelligence-read.ts:66-105` reads that table;
  `getWorkerSalaryIntelligence` `:296-386` is mounted at
  `app/[locale]/dashboard/opportunities/page.tsx:42` and `app/[locale]/dashboard/page.tsx:60`.
  Eurostat observations exist (76 rows) but are macro-only — `labour.employment_rate`,
  `labour.unemployment_rate`, `labour.job_vacancy_rate`, `labour.cost_index_yoy` for LT/PL/DE + EU.
- **Affected user.** Every worker checking pay expectations.
- **Business impact.** A prominent card that always says "not enough data" reads as a broken
  product.
- **Risk.** MEDIUM.
- **Fix.** Either seed owner-curated `market_rate_averages` rows for the top professions/countries,
  or hide the card until data exists (`intelligence-read.ts` already degrades honestly, so this is
  a presentation decision).
- **Acceptance.** Either ≥ 1 benchmark renders for a seeded profession+country, or the card is not
  mounted when the table is empty.
- **Effort.** S (hide) / M (seed).
- **Suggested loop.** Loop 5 or an intelligence loop.

### F-12 — LT morphology, not diacritics, is the recognition recall limit; CV section parsing is not diacritic-folded

- **Problem.** Two separate, smaller recall issues. (a) Needle stems are inflection-specific, so
  `Muriau` misses while `Murijau` hits — this is a morphology gap, and the code comment at
  `skill-recognition.ts:9-11` implies diacritic-free LT "still matches", which is only half true.
  (b) `cv/structured-parse.ts` never calls `foldText`, so several CV patterns require exact
  diacritics.
- **Evidence.** **[probe]** `"Muriau siena ir tinkavau fasada"` → `plastering` only;
  `"Murijau siena"` → `bricklaying`; `"Mūrijau sieną"` → `bricklaying`. Folding itself is correct:
  `lib/structuring/normalize.ts:52-60`. CV side: `cv/structured-parse.ts:100-186` contains
  `šved`, `pažymėjim`, `išsilavinimas`, `pasiekimai`, `šiuo metu`, `išvykti` with no folding.
- **Affected user.** Lithuanian workers typing quickly or on a non-LT keyboard.
- **Paths.** `apps/web/lib/structuring/keywords.ts`, `apps/web/lib/cv/structured-parse.ts`.
- **Business impact.** Silent under-recognition on the primary market's primary language.
- **Risk.** MEDIUM.
- **Fix.** (a) Add the common inflected stems for the top LT needles (or shorten stems where the
  false-positive risk is measured to be acceptable — every change needs a corpus test).
  (b) Route `structured-parse.ts` matching through `foldText`.
- **Acceptance.** A LT corpus test with both diacritic and non-diacritic spellings of the top 30
  needles reaches ≥ 95 % parity; a diacritic-free LT CV yields the same section detection as the
  accented version.
- **Effort.** S–M.
- **Suggested loop.** Recognition-quality loop (with F-2).

### F-13 — Freshness demotion outranks fit and is not explained

- **Problem.** `lib/scouting/scouting.ts:271-275` sorts `freshnessDemotionRank(...)` before
  `compareMatches(...)`, so a stale profile is ranked below a fresher one regardless of skill fit,
  and the factor never appears in `reasons[]`.
- **Evidence.** `lib/scouting/scouting.ts:271-275`; UI badge only at
  `app/[locale]/dashboard/company/scouting/page.tsx:455-461`.
- **Affected user.** Workers who do not log in often — disproportionately those in physical trades
  and those without good phone access.
- **Business impact.** The best-fitting candidate can be invisible for a reason the employer is
  never told.
- **Risk.** MEDIUM.
- **Fix.** Either move freshness below fit in the comparator, or emit it as an explicit
  `reasons[]`/`gaps[]` code so the explanation matches the ranking.
- **Acceptance.** A guard test asserts every factor that affects sort order has a corresponding
  entry in `reasons[]` or `gaps[]`.
- **Effort.** S.
- **Suggested loop.** Matching loop.

### F-14 — Language is a hard eligibility block with no proportionality gate

- **Problem.** A missing required language sets `hardBlock = true` → `eligible: false`. There is no
  field asking whether the language is genuinely essential, and language requirements are a
  well-known nationality proxy under EU equal-treatment law.
- **Evidence.** `apps/web/lib/market/match-v1.ts:591-621` and `:809-860` (CEFR path via
  `match-criteria-v2.ts:286-344`).
- **Affected user.** Migrant workers — the product's core demographic.
- **Business impact.** Legal exposure if the platform is characterised as automating a
  discriminatory filter; also loses genuinely capable candidates.
- **Risk.** MEDIUM-HIGH (legal), MEDIUM (product).
- **Fix.** Downgrade language from `blocking` to `negotiables`/`missingFacts` unless the demand
  author explicitly marks it job-essential (the `authorMarked` provenance badge already exists at
  `match-tier-explanation.tsx:66-68`), and log that assertion.
- **Acceptance.** Language only produces `hardBlock` when `authorMarked === true`; a test covers
  both paths; the UI shows why the language was treated as essential.
- **Dependencies.** A demand-form field for "language is essential because…".
- **Effort.** S–M.
- **Suggested loop.** Matching loop, with legal review.

### F-15 — Team matching has no non-construction test fixture

- **Problem.** `match-team-v1.test.ts` uses only `bricklaying`, `concrete-works`, `scaffolding`,
  `plumbing`. Any sector-neutrality regression in team matching is invisible.
- **Evidence.** `apps/web/lib/market/match-team-v1.test.ts` (16 cases, all construction slugs). By
  contrast `lib/guards/matching-market-scenarios.test.ts:130-253` is genuinely cross-sector
  (warehouse, kitchen, cleaning, auto repair, office, customer service) and is the best existing
  guard.
- **Risk.** LOW-MEDIUM.
- **Fix.** Add 3–4 non-construction team scenarios (warehouse crew, kitchen brigade, cleaning team).
- **Acceptance.** ≥ 30 % of team-matching fixtures are non-construction.
- **Effort.** XS.
- **Suggested loop.** Fold into F-2's corpus work.

---

## 9. Findings summary

| ID | Finding | Risk | Effort | Loop |
|---|---|---|---|---|
| F-1 | ESCO loaded (1.04 M labels) but 0 % linked to the 202 local rows | HIGH | M | 5 |
| F-2 | Recognition returns nothing for healthcare / education / manufacturing / hospitality-idiom / creative / IT-EN | HIGH | L | 5 + recognition |
| F-3 | Exact/synonym hits auto-write `worker_skills`, mislabelled `self_declared` | HIGH | S | 6 |
| F-4 | Confidence dot is a hardcoded literal; all 33 rows have score 0 | MED-HIGH | S | 6 |
| F-5 | `journal.cv.verified` / `.declared` missing in all 12 locales → raw keys on the CV | MED | XS | 7 |
| F-6 | 7/11 AI agents + 5 recognition helpers have no production caller | LOW | S | 8 |
| F-7 | Haversine dead; scouting has no city signal | MED | M | matching |
| F-8 | Documents / permits / visas never scored | MED-HIGH | M | matching |
| F-9 | Demand recognition knows 10 countries, 6 currencies | MED | S | 3 / matching |
| F-10 | AI activation would be uncapped and unlogged | HIGH (conditional) | S | pre-activation |
| F-11 | `market_rate_averages` empty → salary card permanently "insufficient data" | MED | S–M | 5 |
| F-12 | LT morphology recall gap; CV parse not diacritic-folded | MED | S–M | recognition |
| F-13 | Freshness demotion outranks fit and is unexplained | MED | S | matching |
| F-14 | Language is a hard block with no proportionality gate | MED-HIGH | S–M | matching + legal |
| F-15 | Team matching has no non-construction fixture | LOW-MED | XS | recognition |

---

## 10. What could not be verified

1. **Live browser behaviour.** No page was loaded against production. F-5 (raw i18n keys) and F-4
   (dot colours) are inferred from code + prod data and should be confirmed with one screenshot of
   `/dashboard/profile` for a worker with an engagement context.
2. **Whether the demand form captures coordinates at all.** F-7's fix depends on it; only the
   need-*builder* was audited, not the form.
3. **`worker_documents` schema, RLS and content.** Out of scope for this loop; F-8's fix depends on it.
4. **next-intl v4 exact missing-key behaviour in this deployment.** No custom `onError` /
   `getMessageFallback` exists in the repo, so the library default (log + render key path) applies,
   but this was not observed at runtime.
5. **Whether Eurostat rows are refreshed on a schedule.** The importer
   (`apps/web/scripts/eurostat-import.ts`) is a manual CLI requiring `EUROSTAT_SOURCE_ENABLED=on`,
   which is set nowhere in the repo; the 76 rows have `captured_at` between 2026-03-20 and
   2026-07-02, so something wrote them, but no scheduler was found.
6. **Real-world recall percentages.** The §5 probe used 30 author-written inputs, not a sampled
   corpus of genuine worker entries. The direction of the result is unambiguous; the exact
   percentages are not statistically grounded.
7. **`skill_candidate_clarifications` (6 rows) and `journal_entry_skills` (26 rows) content** — row
   counts were read, individual rows were not inspected (they contain worker free text).
8. **Whether any of the 12 locales' `skill-names.json` translations are accurate** — only presence
   was verified (153/153 skills and 49/49 professions present in all 12 locales, which is genuinely
   good coverage).
