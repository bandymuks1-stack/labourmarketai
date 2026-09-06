# LabourMarket.ai — CANONICAL ARCHITECTURE ENTRY POINT

> **Status:** CANONICAL BASELINE. Start here.
> **Owner decision:** 2026-08-27 (consolidation + extensibility directive).
> **This is a navigation and status document, not a replacement.** The
> authority hierarchy below already existed and is unchanged. Per the
> architecture-change process, a new owner direction EXTENDS the canonical
> architecture — it never spawns a competing one.

If you are an agent or a contributor about to change anything, read this file
first, then the specific authority it points you at.

---

## 0. WHY THIS FILE EXISTS

The repository holds 113 product/architecture documents. They are not
contradictory so much as **unnavigable**: a new contributor could not tell
which document is current, which is historical, and where a recent owner
decision was recorded. That is how architecture gets accidentally narrowed —
not by disagreement, but by someone reasonably reading the wrong file.

This file is the single obvious starting point. It adds no new authority of
its own except §6 (the extensibility contract) and §5 (sections the owner
added on 2026-08-27 that no earlier document contained).

---

## 1. AUTHORITY ORDER (unchanged, recorded here for findability)

```
PLATFORM_DOCTRINE                     ← supreme for technical/legal SAFETY only
                                        (security, migrations, RLS, evidence,
                                        translations, canonical structures)

PRODUCT_UNIVERSE_LOCK_V2              ← world architecture
  ├─ PRODUCT_VISION_LOCK_V1             (the twelve elements, four pillars)
  ├─ OPPORTUNITY_REALIZATION_LOCK_V1    (product boundary + value flywheel, A-13)
  ├─ ORGANIZATION_ROLE_ORCHESTRATION_V1 (one organization, MANY roles)
  ├─ OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04 (interaction + execution rules, §5.5)
  └─ PRODUCT_CONSTITUTION               (axioms + Product Gate)
      └─ everything else
```

`LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` (LT) defines agreed product
SCOPE and direction; where it and the doctrine differ, **the doctrine keeps
the stricter option** and the vision defines the reach.

`CLAUDE.md` and `AGENTS.md` govern HOW agents work. This file and the locks
above govern WHAT the product is.

---

## 2. WHAT LABOURMARKET.AI IS

A **Living Labour Market** — not a job board, ATS, HR SaaS, CV generator,
student portal, freelancer marketplace, project tool, chatbot or investment
platform. Any of those may be a *surface* inside the product; none of them is
the product.

It continuously represents, understands and connects:

```
PEOPLE ↔ REAL ACTIVITY ↔ EVIDENCE ↔ SKILLS/CAPABILITIES ↔ EXPERIENCE
       ↔ EDUCATION ↔ WORK ↔ SERVICES ↔ TEAMS ↔ ORGANIZATIONS
       ↔ NEEDS ↔ VACANCIES ↔ PROJECTS ↔ TASKS/OBJECTS ↔ OPPORTUNITIES
       ↔ MOBILITY ↔ MARKET SIGNALS ↔ FUTURE SKILLS ↔ CAPITAL/INVESTORS
```

**The shared operating loop, everywhere:**

```
SIGNAL → NEED → MATCH → EVIDENCE → ACTION → OUTCOME → LEARNING
```

---

## 3. THE INVARIANTS THAT MUST SURVIVE EVERY CHANGE

| # | Invariant | Why |
|---|---|---|
| I-1 | **One person, many contexts** | student / employee / freelancer / founder / volunteer / project participant are relationships and states of the SAME person, held simultaneously. Never duplicate the human. |
| I-2 | **One organization, many capabilities** | a school that also employs people is one organization with two capabilities. Never return to a mutually exclusive type. |
| I-3 | **Original evidence is immutable** | derived claims never rewrite the record they came from. Facts, inferred candidates and confirmed claims stay distinguishable. |
| I-4 | **No overclaiming** | participation ≠ leadership · attendance ≠ organizing · discussion ≠ successful negotiation · membership ≠ coordination · exposure ≠ competence. |
| I-5 | **A profile is a projection of evidence** | never a self-written claim. |
| I-6 | **Opportunity ≠ vacancy** | jobs, projects, practice, education, services, customers, teams, mobility, cooperation, future capital. |
| I-7 | **Deterministic first** | matching and extraction must work without generative AI. AI is an infrastructure layer inside workflows, never a prerequisite. |
| I-8 | **No internal vocabulary in the UI** | no slugs, table names, role ids or governance terms reach a normal user. |
| I-9 | **Formal employment is never a gate** | a person with no job history may still have a strong evidence-backed profile. |
| I-10 | **Privacy outranks cost** | an unsafe provider route is refused and rerouted, never "tried anyway". |

---

## 4. THE LOOPS (all three must work; education is ADDITIVE, not a replacement)

**A. PERSON / WORKER (established core)**
```
register → onboard → profile → Work Journal → evidence → skills/capabilities
  → Living Profile / Living CV → matching → opportunities → interest/action
  → outcome → new evidence → stronger profile → better opportunities
```

**B. EMPLOYER (established core)**
```
organization → employer capability → "tell us who/what you need"
  → structured need → requirements → discovery → evidence-based matching
  → ranked shortlist → interest/review → contact/action → work relationship
  → evidence/outcome
```

**C. EDUCATION (canonical since 2026-08-27, additive)**
```
institution → capabilities → learner relationship
  → study/practice/project activity → Journal evidence → capabilities
  → Living CV → opportunities → practice/project/employer connection
  → outcome → new evidence
```

Education does not replace A or B. It extends the same person model, the same
Journal, the same Living CV and the same matching.

---

## 5. SECTIONS ADDED 2026-08-27 (no earlier document contained these)

### 5.1 AI agents / digital workers as first-class work subjects

The subject model must be architecturally capable of representing **human, AI
agent, human+AI team, multi-agent team** through the same evidence-first
philosophy — while preserving the legal and semantic distinction between a
human and an AI system. **An AI agent is never a legal human identity.**

An agent subject may hold: agent identity, provider/model/version metadata,
organization/project relationships, tasks, Work Journal, evidence, reviews,
outcomes, capabilities, performance history, human supervision, acceptance /
rejection, regressions, cost, provenance.

```
REAL TASK → EXECUTION → ARTIFACT/CHANGE → REVIEW → ACCEPTANCE/REJECTION
  → OUTCOME → EVIDENCE → CAPABILITY HISTORY → AI LIVING PROFILE
```

An agent must not establish competence by claiming it. *"I can do enterprise
architecture"* is not evidence; reviewed work is. Provider/model identity stays
**metadata** — never architect around one vendor.

**Status:** architecture recorded, extension path preserved. **Not implemented,
and deliberately not now** — it must not delay the external pilot.

### 5.2 Historical work-report import

Years of real historical work reports must eventually become real Journal
evidence, not archived documents.

```
ORIGINAL REPORT → IMMUTABLE SOURCE → PROVENANCE → PARSING → NORMALIZATION
  → PERSON / ORGANIZATION / PROJECT / ACTIVITY RESOLUTION → DEDUPLICATION
  → STRUCTURED JOURNAL → EVIDENCE → SKILLS → EXPERIENCE → OUTCOMES
  → HUMAN VERIFICATION WHERE REQUIRED → LIVING CV → ANALYTICS / MATCHING
```

Every derived fact must trace back to its source. Never invent missing people,
dates, companies, projects, outcomes or skills; ambiguous records are marked
for review. The same framework must later serve other organizations.

**Status:** architecture recorded. A reviewed importer on a small
representative sample comes **after** the pilot closes — never bulk ingestion
first.

### 5.3 Living Profile is not human-only

Living Profile generalizes to **PERSON · AI AGENT · TEAM · ORGANIZATION ·
PROJECT**, sharing the evidence/outcome/provenance foundation while keeping
subject-specific attributes separate. Do not force all subjects into identical
fields.

### 5.4 Education, learners and practice

Recorded as canonical (see §4C). A student's defensible evidence includes
studies, school and university work, vocational training, practice,
internships, projects, laboratory tasks, competitions, workshops,
certifications, volunteering, presentations, reports, research, team
participation and real practical work. **Absence of formal employment must
never render as "no experience" or an empty profile.**

### 5.5 Owner Master Execution Contract (2026-09-04) — interaction + execution rules

Owner text recorded 1:1 in
[`docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md`](product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md).
It **extends** the locks above (nothing removed). What it adds that no earlier
document stated as a binding rule:

| Rule | Meaning for implementation |
|---|---|
| **Shared canonical action backbone** (owner clarification 2026-09-04) | The canonical dispatcher / authorization / domain execution / persistence / audit / state-readback path is the ONE action backbone. CONVERSATION enters it through `NATURAL LANGUAGE → INTENT → CONTEXT → MISSING DATA where required → AUTHORIZATION → CANONICAL ACTION/DISPATCHER → DOMAIN EXECUTION → REAL STATE CHANGE → AUDIT/PROVENANCE → STATE READBACK → RESULT` (proven by #1466). **Chat-first, NOT chat-only:** direct visual / inline interactions (dragging a worker or team on the Project Field, selecting an object on the World Map, acting from an Attention item, a pinned My Space shortcut, confirming a proposed movement, comparing candidates visually, manipulating a timeline, approving evidence, a minimal inline form) are legitimate when they are the more natural human interaction. They enter the SAME backbone with an explicit structured action + context and are never forced through the natural-language router — and they never create a parallel domain executor, authorization path, or a second Person / Company / Project / Demand / Skills / Document / Work Journal / Matching / Communication / Report truth. "Move Team A from X to Y next week" said in chat and dragged on the field resolve to the SAME proposed movement, what-if, authorization, consequence calculation, confirmation and persisted state. See the backbone diagram below. |
| **Four cooperating layers over one state** | CONVERSATION (control) · WORLD (see reality) · MY SPACE (pins = references to canonical entities/actions/views, never duplicated state) · ATTENTION (what changed / why it matters / what to do). Refines `WORLD_STATE_UX_ARCHITECTURE_V1` (AI Conversation · World Map · Context Panel): My Space and Attention are content of the same workspace, not new screens. |
| **Active context ≠ role tunnel** | Active context answers "on whose behalf am I acting?" It never locks the product to one role. A company holds MANY capabilities at once (`ORGANIZATION_ROLE_ORCHESTRATION_V1`, I-2); classification may shape authorization, suggestions, compliance and matching, never erase a legitimate capability. The 2026-09-04 production drift (an agency workspace reduced to three agency chips) is the named failure. |
| **Starters are suggestions, not navigation** | Suggestion chips are a SMALL set derived from signals (context, unfinished actions, attention state, recent/frequent use, pins, current project, real demand, next action) — not a fixed per-role menu, never a product boundary, never a substitute for the router. |
| **Ordinary-human-usable is the acceptance bar** | A journey is complete only when a new person, without instructions, states a need in their own words and obtains a real persisted result with an obvious next action. "Go to X, open Y" in normal use = not complete. |
| **Matching continues after "no"** | `GAP → WHY → CONSEQUENCE → SOLUTION → WHO CAN HELP → TIME/COST → ACTION`, at person / team / project / company / education / market level. Marketplace is the gap-fulfilment layer of the same world. |
| **Documents are first-class** | have / valid / expires / missing / required / why / for what / by when / who can issue / who can help / next — with immutable evidence kept apart from current validity. |
| **Communication translation ≠ language capability** | a translated conversation never satisfies a language requirement in matching. |
| **Agentai OS boundary** | external discovery / radar / outreach / provider routing live in Agentai OS behind an explicit bridge; LabourMarket.ai owns identity, evidence, demand, matching, journeys and product interaction. `DEMAND VALIDITY ≠ OUTREACH ELIGIBILITY`. |
| **Execution engine** | RECOVER → CONNECT → IMPLEMENT → TEST → DEPLOY → PROD VERIFY → OBSERVE → FIX → CONTINUE, driven by a completion queue; owner gates only for genuine owner-only decisions (§31); the checkpoint of §35 is `docs/launch/RESUME_CHECKPOINT_<date>.md`. |
| **Scale is a permanent, system-wide constraint** (owner, 2026-09-05 — contract §1b) | Every layer must be able to grow to ≥1M people and the far larger graph they create (millions of records, relationships, history) WITHOUT rebuilding the canonical Person / Company / Project / security / action / evidence / matching / conversation architecture: bounded reads, indexable paths, pagination / cursors, no N+1, no platform-scale client filtering, default-deny RLS never traded for speed, LLMs given only the minimum authorized context, scoped realtime, object storage, observability. Applied silently in design and review (question C beside A and B in §7); no speculative infrastructure, no separate scale module; escalate only a genuine redesign-level blocker or a paid capacity decision. |
| **Conversation → Gemini proposer** (owner approval 2026-09-05) | The deterministic router stays the floor. ONLY a sentence it cannot read goes to the approved Gemini runtime under ONE task-scoped egress grant, which may propose ONLY an existing `INTENT_REGISTRY` id; the proposal runs the SAME handler, so context resolution, authorization, the dispatcher, executors and readback are unchanged. Telemetry names the resolution (deterministic / llm), never the sentence. |

```
                         ┌─ CONVERSATION            natural language → intent/context
                         ├─ WORLD / MAP / FIELD     structured visual action + context
HUMAN INTENT ────────────┼─ MY SPACE                canonical shortcut/action reference
                         ├─ ATTENTION               contextual canonical action
                         └─ DIRECT VISUAL / INLINE  structured action + context
                                      │
                                      ▼
                         ONE CANONICAL ACTION BACKBONE
                                      │
                         AUTHORIZATION / POLICY
                                      │
                         CANONICAL DOMAIN EXECUTOR
                                      │
                         REAL CANONICAL STATE
                                      │
                         AUDIT / PROVENANCE
                                      │
                         STATE READBACK
                                      │
                         ALL DEPENDENT REPRESENTATIONS UPDATE
```

CONVERSATION = CONTROL · WORLD = SEE / MANIPULATE REALITY · MY SPACE = FAST
PERSONAL ACCESS · ATTENTION = WHAT NEEDS ACTION — over ONE CANONICAL WORLD.
Never build two implementations of a business action. This clarification is
not a licence for a dashboard framework, widget system or ERP menu.

Where this contract and an older owner text differ in **reach**, the broader
requirement stands (§6). Where they differ in an **interaction or execution
rule**, the 2026-09-04 text governs. `PLATFORM_DOCTRINE` remains supreme for
technical/legal safety.

---

### 5.6 Delegated authority · bulk import · contribution/evidence graph · AI-agent Living CV (owner direction, window 6, 2026-09-06)

Owner direction recorded in `product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md` §1c.
Full inventory (scope matrix, pipeline stages, reuse tables, SQL sketches, RED list):
[`product/delegated-authority-and-evidence-graph-contract-v1.md`](product/delegated-authority-and-evidence-graph-contract-v1.md).
This section is the canonical direction; it EXTENDS §5.1–5.3 (nothing removed) and
composes with `audits/external-assistant-gateway-gap-audit-2026-09-02.md`.

**Principles (binding for every stage):**

| Principle | Meaning |
|---|---|
| One person, many contexts | one `profiles` identity acts in many organizations / projects / roles; delegation never creates a second identity or a per-client datastore |
| Real activity only | every fact enters as a recorded action of a named actor; suggestions (CV extraction, recognition, LLM proposals) are never facts until confirmed (`confirmed-suggestions-foundation.md`) |
| Living Profile = derivation | the profile is read from evidence rows (journal, allocations, confirmations, documents); nothing writes "the profile" directly |
| Actor ≠ recorder | who the fact is ABOUT, who RECORDED it, and THROUGH WHAT (browser, connected assistant, import, agent) are three columns, never one. Today only `work_hour_allocations.entered_by` and `journal_entry_metrics.source` separate them; delegated writes record the user alone (contract §A) |
| Work Unit | GOAL → CONTRIBUTION → DELIVERABLE → OUTCOME → EVIDENCE → BENEFICIARIES, mapped onto `work_tasks` · `journal_entries` / `work_items` / `allocations` · `journal_entry_tasks` · `project_clients` (contract §C) — no new evidence store |
| Company → worker authority | a company records, corrects and confirms only inside its own engagement / membership (RLS `manages_organization`); it never edits a person's own words (`original_text` is immutable; corrections supersede) |
| Delegated AI is vendor-neutral | ChatGPT, Claude, any MCP host, a future agent = equal adapters over ONE capability registry; identity from ONE resolver; capability scopes (not client names) decide what may be written; `SEND_EXTERNAL_MESSAGE` stays DENY |
| Bulk historical import has no side effects | SOURCE (immutable file, sha256) → DRAFT → NORMALIZE → RECONCILE (human decides ambiguity) → PREVIEW → COMMIT (one atomic batch) → REVERSIBLE (batch superseded, never deleted). No invitation, e-mail, approval request or automation may fire from an import — proven for the XLSX importer today (contract §B) and to be pinned by a guard |
| Corrections / merge / rollback | non-destructive only: `correction_of` / `superseded_by`, batch supersede, alias records; a merge keeps both originals |
| AI data-quality assistance | AI may flag duplicates, gaps, inconsistencies and propose; a human confirms; AI never raises an evidence class (`provenance.ts` rule 2) |
| AI / agent Living CV | an agent is an `ai_agent` actor owned by one organization; CAPABILITY ≠ IDENTITY — provider / model / version are run provenance (`ai_runs`), competence comes only from reviewed tasks (contract §D); no agent marketplace |
| Multi-contributor attribution | PRIMARY / CONTRIBUTORS / SUPERVISOR / APPROVER / BENEFICIARY per Work Unit; today one worker per entry |
| Privacy / visibility | `visibility_scope` vocabulary exists (`closed|team|org|client_report|public_proof_link`) and RLS forces `closed` on insert — widening is an explicit, per-row, human act; a manager never reads worker documents |
| Natural opportunity discovery | evidence feeds matching (`worker_skills` roll-up); no scoring of people, no rating system |
| Research direction | PRODUCT · LONGITUDINAL DATA · RESEARCH · FORECAST · COUNTERFACTUAL stay separate artefacts; only the first two exist (contract §F); research reads redacted rows under a named consent purpose |

**Staged roadmap (each stage is a journey PR; GREEN/RED per the merge envelope; none of it before launch week closes except Stage 0):**

| Stage | Deliverable | Class | Reuses |
|---|---|---|---|
| 0 — now | direction recorded (this section); ONE safe action: stamp `recorded_via` on delegated journal writes (contract §A precedent `source_document_file` / `extractor_version`) | GREEN, no migration | `journal_entry_metrics` (free `metric_slug`) |
| 1 — recorder everywhere | `caller.transport` / client id threaded to every capability write; `work_hour_allocations.source='assistant'` (open vocabulary); conversation dispatcher passes the same | GREEN | existing columns |
| 2 — capability scopes | OAuth consent lists capability scopes (`profile:read`, `journal:write`, …) mapped to registry ids; connected-apps page shows them; a client without the scope is refused at the door | RED (auth-core) | `auth.oauth_consents.scopes`, `connected-apps.ts` |
| 3 — reversible import batches | workbook registered as `document_files` (sha256) before preview; `import_batches` + `import_batch_id`; batch supersede; alias records for people/sites; guard: importer imports no emitter | RED (new table + RLS) + GREEN column | `register_document_file_v1`, `resolve-entities.ts`, `correction_of` |
| 4 — Work Unit + attribution | `work_tasks.deliverable_text/outcome_text/significance` (GREEN); `journal_entry_contributors` (RED); roll-up as a bounded READ | GREEN + RED | `work_tasks`, `journal_entry_tasks`, `review_evidence_links` |
| 5 — AI agent actor | `profiles.actor_type`; agent membership; agent journal + human confirmation; Living CV shows last validation | RED | `ai_runs`, `usage_cost_events`, `entity-model.ts` |
| 6 — company operational assistant | read capabilities first (workers, projects, document status), then writes behind Stage 2 scopes; timesheets only through Stage 3 | GREEN (reads) / RED (scoped writes) | capability registry bridges (`conversationActionId`) |
| 7 — research export | consent purpose row; redacted longitudinal export; forecast / counterfactual only as labelled derived artefacts, never in product rows | RED (consent) | `privacy_consent_*`, `ai_runs` retention |

Review questions A and B (§7) apply to every stage; question C (scale, §5.5) is
answered by bounded reads and indexed batch / entry keys in the sketches.

---

## 6. THE EXTENSIBILITY CONTRACT (binding, owner directive §62–71)

> **The canonical architecture is the minimum known product possibility space
> — NOT its maximum boundary.**

Everything enumerated in this repository represents *known required
capabilities*, not the ceiling. Actors, roles, relationships, opportunity
classes, evidence types, workflows, markets, languages and matching dimensions
are **open lists**.

**The rule:** `PRESERVE WHAT EXISTS → ADD WHAT IS NOW KNOWN → KEEP EXTENSION
POINTS → ALLOW FUTURE EXPANSION.`

Replacement is permitted only with evidence that the new architecture
preserves or improves all required existing behaviour, plus an explicit
migration/compatibility strategy.

### 6.1 Two separate review questions for every significant change

| | Question | Passes unit tests? |
|---|---|---|
| **A. Regression** | Did we break something that worked? | caught by tests |
| **B. Architectural narrowing** | Did we make impossible something the architecture previously allowed or intentionally left open? | **NOT caught by tests** |

A change can be fully green and still fail B. **B is a real architecture
regression.**

### 6.2 Known narrowing failure modes (reject these in review)

- multi-role organizations collapsed back into one role
- assuming every person is an employee
- assuming every opportunity is a vacancy
- assuming every activity belongs to an employer
- assuming every learner is employed
- assuming every team is all-human
- assuming matching is only Person↔Job
- assuming today's languages are the only ones that matter
- assuming every project already has funding
- assuming AI agents can never be market participants
- hardcoding today's actor/relationship taxonomy as exhaustive

### 6.3 The MVP trap

MVP means *implement less now*. It does **not** mean *design so the system can
only ever do less*. For every P0/P1 ask: **"Does this solve the current
requirement while preserving the broader possibility space?"** If no, redesign
before merging.

When choosing between a locally simpler implementation that closes future
possibilities and a slightly more general one that preserves them, **prefer the
general one** unless security, correctness, performance or demonstrated
complexity says otherwise. Do not build speculative features — but do not
architect them out of existence.

---

## 7. PROCESS FOR FUTURE AGENTS (binding)

Before any change:

```
1. READ THIS FILE + the authority it points to
2. IDENTIFY affected domains
3. IMPACT / DEPENDENCY analysis
4. CHECK whether the capability already exists   ← doctrine §2 canonical check
5. IMPLEMENT ADDITIVELY
6. SECURITY / MIGRATION review                    ← doctrine §4
7. REGRESSION test  (question A)
8. NARROWING review (question B, §6.1)
9. E2E where the change is materially user-facing
10. UPDATE the capability map (§8)
```

**No local task may silently redefine global product architecture.**

When a new owner direction arrives: inspect this baseline, decide whether it
extends / clarifies / genuinely replaces, preserve valid invariants, add the
capability, record the decision here, update the gap map. *Canonical* means
**current authoritative baseline**, not frozen.

---

## 8. CAPABILITY INVENTORY & GAP MAP

Maintained in [`docs/CAPABILITY_INVENTORY.md`](CAPABILITY_INVENTORY.md) —
derived from code and production, not from documentation.

Classification: `IMPLEMENTED+PROVEN` · `IMPLEMENTED+UNPROVEN` · `PARTIAL` ·
`MISSING` · `DEFERRED` · `OWNER-GATED` · `ENVIRONMENT-GATED`.

---

## 9. NO DESTRUCTIVE CLEANUP

Do not drop tables or remove compatibility structures because they look
unused. Record them as `DEAD` / `DUPLICATE` / `LEGACY` / `RETIREMENT
CANDIDATE`. Destructive cleanup is separately owner-gated. **Do not "simplify"
the product by deleting future extension points.**

---

## 10. HISTORICAL / SUPERSEDED DOCUMENTS

Nothing is deleted. Documents that predate a later owner decision remain as
evidence of how the product got here. When you find one that conflicts with
this baseline, add a header pointing here rather than rewriting or removing it.
