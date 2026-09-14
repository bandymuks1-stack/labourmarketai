# OWNER TARGET ARCHITECTURE V1 — THE SINGLE SOURCE OF TRUTH

| Field | Value |
|---|---|
| **Version** | V1.1 |
| **Date** | 2026-09-14 (V1.1 — ARCH-1 resolved same day) |
| **Status** | **ACTIVE — THE canonical architecture. Read this first, before any other architecture, product, vision or completion document.** |
| **Sources** | Owner text 2026-09-07 (`PRODUCT_CONSTITUTION` §14–16) + owner text 2026-09-14 (§1.2 below) + **owner decision ARCH-1, 2026-09-14 (APPROVED)**, reconciled. Every earlier owner lock is preserved, not replaced |
| **Supersedes as ENTRY POINT** | `docs/ARCHITECTURE.md` (now SUPPORTING — navigation and process), `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` (now SUPPORTING — one vertical) |
| **Machine halves** | `apps/web/lib/product-gate/*.ts` — see §9 |
| **Enforced by** | `apps/web/lib/guards/owner-target-architecture.test.ts` |

---

## 0. WHY THIS FILE EXISTS

On 2026-09-14 the owner asked one question: *which exact document is the current
canonical final architecture?* There was no answer. The repository holds **925
markdown files**, of which **dozens** claim canonical, binding or authoritative
status, and the most recent full audit (#1739) was measured against **an
architecture pasted into a chat prompt**, because no repo document contained it.

That is not a documentation problem. It is the mechanism by which this product
gets narrowed: an agent reads a real, sincere, owner-authored document that is
merely *incomplete*, and everything the document omits stops being anybody's
business.

Three specific failures made this unavoidable:

1. **Two files both called themselves the entry point.** `CLAUDE.md` names
   `docs/ARCHITECTURE.md` as "the ONE canonical architecture entry point" and,
   four lines later, `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md`.
2. **Three different graphs described the same product** (§2.4), all
   machine-enforced, none identical.
3. **The supersession registry was empty.** `docs/ARCHITECTURE.md` §10 says
   "when you find a document that conflicts, add a header pointing here" and
   then lists nothing — so every superseded document still reads as current.

This file fixes the entry point and the registry. It adds no owner authority of
its own: §1 is owner text, §2–8 reconcile owner texts that already existed, and
§10 records what is *not* decided rather than deciding it.

---

## 1. THE TARGET ARCHITECTURE

> **TARGET is not STATUS.** This section says what the product IS, as agreed.
> It is unaffected by what is built. Missing code never weakens §1; existing
> code never silently redefines it. Current status lives in §11, separately and
> deliberately.

### 1.1 What it is

A **living global labour/work graph** — one connected system, not a set of
modules, and not an AI-driven module suite. Every future capability is an
extension of this one world.

**LabourMarket.ai is NOT** a job board, a recruitment site, a staffing
marketplace, a CV builder, a Work Journal, a timesheet application, a workforce
planner, an evidence database, a qualification platform, a booking calendar, an
ATS, a CRM, an ERP, an HR system, a student portal, a freelancer marketplace, a
project tool, a magazine, or an AI chatbot. **Each of those is ONE EDGE of the
graph below.** A task may work on one edge; it may never redefine the product
as that edge.

### 1.2 The canonical graph (owner text, recorded 1:1)

**Owner text, 2026-09-07** (`PRODUCT_CONSTITUTION` §14):

> PEOPLE ↔ REAL WORK ↔ SKILLS ↔ EXPERIENCE ↔ EVIDENCE ↔ QUALIFICATIONS ↔
> ORGANIZATIONS ↔ COMPANIES ↔ AGENCIES ↔ TEAMS/BRIGADES ↔ PROJECTS ↔
> SITES/OBJECTS ↔ TASKS/WORK STAGES ↔ SERVICES ↔ AVAILABILITY ↔ TIME ↔
> CAPACITY ↔ CURRENT DEMAND ↔ FUTURE DEMAND ↔ EDUCATION/TRAINING/RECOGNITION ↔
> COUNTRIES/JURISDICTIONS ↔ MOBILITY ↔ MARKET SIGNALS ↔ COMMERCIAL
> OPPORTUNITIES.

**Owner text, 2026-09-14** (this session, recorded 1:1):

> PEOPLE ↔ REAL WORK ↔ SKILLS ↔ EXPERIENCE ↔ EVIDENCE ↔ QUALIFICATIONS ↔
> ORGANIZATIONS/COMPANIES ↔ AGENCIES ↔ INSTITUTIONS ↔ TEAMS/BRIGADES ↔
> PROJECTS/SITES/TASKS ↔ SERVICES ↔ AVAILABILITY/TIME/CAPACITY ↔ SUPPLY/DEMAND
> ↔ MATCHING ↔ EDUCATION/RPL ↔ MOBILITY/JURISDICTIONS ↔ MARKET
> SIGNALS/OPPORTUNITIES, with chat/AI as the universal control layer and with
> person/company/agency/institution journeys working together rather than as
> separate products.

**THE RECONCILED TARGET GRAPH — the union of both, 28 nodes.** Nothing from
2026-09-07 is removed; the later text names four things the earlier one left
implicit, and per this repository's own precedence rule (*"where an older owner
requirement is broader, the older one stands; where the newer text is clearer,
the newer text governs"*) both stand together.

| # | Node | Provenance |
|---|---|---|
| 1 | PEOPLE | both |
| 2 | REAL WORK | both |
| 3 | SKILLS | both |
| 4 | EXPERIENCE | both |
| 5 | EVIDENCE | both |
| 6 | QUALIFICATIONS | both |
| 7 | ORGANIZATIONS | both |
| 8 | COMPANIES | both |
| 9 | AGENCIES | both |
| 10 | **INSTITUTIONS** | **ARCH-1 APPROVED 2026-09-14.** Implicit before as an organization type and as `J-INSTITUTION-OUTCOME`; now a first-class node in `product-graph.ts`, realized by EDU-1/2/3/6 |
| 11 | TEAMS / BRIGADES | both |
| 12 | PROJECTS | both |
| 13 | SITES / OBJECTS | both |
| 14 | TASKS / WORK STAGES | both |
| 15 | SERVICES | both |
| 16 | AVAILABILITY | both |
| 17 | TIME | both |
| 18 | CAPACITY | both |
| 19 | **SUPPLY** | **ARCH-1 APPROVED 2026-09-14.** Present only in flywheel prose before; its absence as a node WAS the market-direction defect in structural form (SEP-4). Realized by DEM-2/DEM-9/ORG-8/CAL-3 |
| 20 | CURRENT DEMAND | both |
| 21 | FUTURE DEMAND | both |
| 22 | **MATCHING** | **ARCH-1 APPROVED 2026-09-14.** Present only in the value chain before; filed under demand it was vacancy-ranking, which is the job-board reduction. Realized by DEM-5/DEM-6/DEM-3 |
| 23 | EDUCATION / TRAINING | both |
| 24 | **RECOGNITION / RPL** | named "RECOGNITION" 2026-09-07, "RPL" 2026-09-14 — **the same node**. **ARCH-1 APPROVED**: distinct from QUALIFICATIONS (holding/validating credentials); this node is the ACT of recognising. Realized by SKL-9/SKL-10/EDU-4 |
| 25 | COUNTRIES / JURISDICTIONS | both |
| 26 | MOBILITY | both |
| 27 | MARKET SIGNALS | both |
| 28 | COMMERCIAL OPPORTUNITIES | both |

**Value chain:** REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH
→ EXECUTION → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION.

**Flywheel:** real historical work + new real work + verified evidence + project
results + supply + demand → better labour data → better skill understanding →
better matching → better planning → better forecasts → better benchmarks →
better commercial intelligence → more organizations → more real work data.

### 1.3 Chat / AI is the universal control layer — and is NOT a graph node

One AI. One conversation. AI is the primary operator: it holds the dialogue,
understands the goal, performs the action, opens the context it needs, closes
it, and returns to the conversation. **There may be no second AI and no
equivalent parallel control method** (`PRODUCT_UNIVERSE_LOCK_V2`, owner text
2026-07-28).

Chat is therefore a **surface over the whole graph**, not a node in it — the
same reason `platform` and `communication` are deliberately not nodes. Treating
the conversation as the product is reduction #11 (§2).

### 1.4 Contextual, non-exclusive multi-role identity

The fundamental entity is an **ACTOR**, never a role. One person is
simultaneously an employee of one company, an owner of another, a student of an
institution, a member of a brigade, assigned to a project, available for another
opportunity, a provider, and a client. **These are relationships and contexts,
never mutually exclusive identities** (`PRODUCT_CONSTITUTION` §14).

`organizationType` says what the ORGANIZATION is. `relationship` says how the
person stands in it. Neither is the person's participation MODE. A
company-type organization does not make its employee an employer, and deriving
the mode from the workspace list would reclassify a real person's role from data
that does not carry it (SEP-5).

### 1.5 Freedom, reality constraints, and authorized override

The product models reality; it does not constrain human agency.
**A commitment is not a prohibition. A time overlap is not unavailability.**

The permanent loop is: **detect → explain → warn → show alternatives → the
authorized actor decides → explicit override → audit receipt.**

Block only for: law, safety, authorization, another person's rights, or a
genuine hard technical constraint. Nothing else.

### 1.6 Historical ingestion and provenance

Real work did not begin when the product did. History enters through import,
and **every imported fact carries its origin**: source, importing actor,
reconciliation decision, preview, commit, readback, and a reversal path.

An imported record is a claim by the importer, never a fact about the subject
by itself. **The subject can see what an organization recorded about them and
may refuse it** — the refusal path is an owner gate (§10.6), and until it
exists the capability is incomplete rather than absent from the target.

### 1.7 Autonomous execution with human authorization and audit

The product may act on its own behalf, and every autonomous act carries: an
authorizing human or an authority explicitly delegated by one; a recorded
decision; an audit receipt; and a reversal path where the act is reversible.

**AI agents are first-class work subjects** — a work subject may be a human, an
AI agent, or a team (`ARCHITECTURE.md` §5.1, owner direction 2026-08-27).
Autonomy never manufactures authority: an agent may not approve, merge, resolve
an owner gate, or settle a legal declaration.

### 1.8 Distribution — six surfaces, one capability layer

**NEW to canonical governance, 2026-09-14.** Before this file, no document in
the authority stack mentioned how the product reaches a person:
`PRODUCT_CONSTITUTION` and `PLATFORM_DOCTRINE` contain **zero** references to
the App Store, Google Play, PWA, MCP, ChatGPT or Claude connectors.

The product is complete only when it is reachable on all six:

| # | Surface | Contract |
|---|---|---|
| 1 | **Web / PWA** | Installable. The manifest's raster icons are an installability requirement, not decoration |
| 2 | **Android / Google Play** | Native client + Play listing |
| 3 | **iOS / App Store** | Native client + App Store listing |
| 4 | **ChatGPT app** | Over MCP |
| 5 | **Claude connector / Directory** | Over MCP |
| 6 | **Vendor-neutral MCP** | Any other MCP client, on the current published revision |

**The binding rule: ONE canonical capability layer, never per-platform business
logic.** Every surface is an ADAPTER over `apps/web/lib/capabilities/` and the
same domain cores the web server actions call. A second implementation of a
domain rule for one platform is the defect, whatever it enables.

Vendor neutrality is architectural, not diplomatic: no surface may receive a
capability the others structurally cannot. Which LLM providers the platform
itself uses internally is a different concern entirely.

---

### 1.9 A node is a claim about MEANING, not a licence to build (ARCH-1, 2026-09-14)

The owner approved the four nodes with an explicit limit, recorded here
verbatim in substance:

> *This is an architectural/semantic decision, not authorization to create four
> duplicate modules, routes, databases or UI sections. Reuse and connect
> existing capabilities first. Implement new structures only where the
> corrected evidence-based gap analysis proves they are genuinely missing.*

**What was therefore done, and it is the whole change:** each new node was
given EXISTING capability ids. Nothing was created — no table, no route, no
component, no server action, no migration.

| Node | Realized by (all pre-existing) |
|---|---|
| INSTITUTIONS | EDU-1 institution capability + learner link · EDU-2 programmes/cohorts/members · EDU-3 learner outcomes · EDU-6 institution reporting |
| SUPPLY | DEM-2 demand/supply semantic boundary · DEM-9 organizational supply discovery · ORG-8 agency↔client bridge · CAL-3 availability (the worker-side half) |
| MATCHING | DEM-5 matching engine (20 criteria, both directions) · DEM-6 team matching · DEM-3 worker opportunity board + interest |
| RECOGNITION / RPL | SKL-9 qualification recognition/RPL/equivalence · SKL-10 training & certification register · EDU-4 learning compass |

A capability may belong to several nodes; that was already the pattern
(WRK-1 under COMPANIES and PROJECTS, SKL-8 under QUALIFICATIONS and COUNTRIES).
Multi-attribution is how one product carries two decompositions without
duplicating either.

**Two deliberate exclusions, both to protect a separation:**

- **SKL-2** (deterministic journal → skill recognition) is NOT under
  RECOGNITION. It recognises DEMONSTRATED CAPABILITY; this node is about
  RECOGNISED EQUIVALENCE against a formal requirement. Putting them under one
  node is exactly the SEP-6 collapse — demonstrated capability silently
  satisfying a formal requirement.
- **RECOGNITION is not QUALIFICATIONS.** QUALIFICATIONS is holding and
  validating credentials a person already has (SKL-7, SKL-8, PER-9, PER-13).
  RECOGNITION is the ACT of converting evidence into standing. They share a
  domain and not a meaning.

**What this changes in practice:** nothing renders differently and no user sees
a new screen. What changes is that `product-graph-journeys.test.ts` now fails
if any of these four loses its last live capability — the silent-narrowing
protection the audit found was structurally blind to four of twenty-eight
things it was meant to protect.

---

## 2. THE ELEVEN REDUCTIONS — each is one edge, never the product

| Reduction | What adopting it would require |
|---|---|
| a job board | treating CURRENT DEMAND as the only demand, and vacancies as the only supply-meeting object |
| a recruitment site | collapsing EVIDENCE and EXPERIENCE into a candidate record |
| a staffing marketplace | reading an agency's declared capacity as its need (the market-direction defect) |
| a CV builder | letting the person's own declaration be the only evidence tier |
| a Work Journal | dropping SUPPLY, DEMAND and CAPACITY as first-class nodes |
| a timesheet application | reducing REAL WORK to hours, losing skills, photos and verification state |
| a workforce planner | turning COMMITMENT into PROHIBITION and forecasts into facts |
| an evidence database | removing the paths from evidence to matching and planning |
| a qualification platform | letting a formal requirement be the only route to deployability |
| a booking calendar | making TIME a store instead of a projection |
| an AI chatbot | treating the conversation as the product rather than one universal surface over the graph |

---

## 3. THE EIGHT SEPARATIONS THAT MAY NEVER COLLAPSE

Each has collapsed before in this codebase. They are binding.

| Id | Separation |
|---|---|
| SEP-1 | FACT ≠ DERIVED ≠ FORECAST |
| SEP-2 | COMMITMENT ≠ PROHIBITION |
| SEP-3 | EVIDENCE ≠ VERIFICATION |
| SEP-4 | DEMAND ≠ SUPPLY |
| SEP-5 | IDENTITY ≠ ROLE |
| SEP-6 | DEMONSTRATED CAPABILITY ≠ FORMAL QUALIFICATION ≠ RECOGNISED EQUIVALENCE ≠ VALID CREDENTIAL ≠ MISSING REQUIREMENT |
| SEP-7 | UNKNOWN ≠ ZERO ≠ FAILED ≠ NOT_MEASURED |
| SEP-8 | DATA EXISTS ≠ REACHABLE ≠ VISIBLE ≠ ACTIONABLE ≠ CORRECTLY INTERPRETED |

**SEP-7 and SEP-8 are the two that this repository keeps re-breaking**, in both
directions. An unknown dressed as a zero and a zero dressed as an unknown are
the same defect. A capability recorded as unreachable that is reachable is the
same defect as one recorded as reachable that is not.

---

## 4. THE FOUR PILLARS AND TWELVE ELEMENTS (owner text 2026-07-28, preserved)

The graph in §1.2 is the DOMAIN decomposition. The owner's UX/product
decomposition, unchanged and still binding, is:

**Four pillars:** 1. AI Conversation · 2. Avatar · 3. World Map · 4. Work
Journal. Everything else is an extension of these four.

**Twelve elements:** AI Conversation · User Avatar · Market World Map · Objects
· Organizations · Projects · Teams · Work Journal · Skills · Reputation ·
Documents · Communication.

**Two views, one product — not two products.** Every graph node names its world
element and a guard checks that mapping is real. When a change appears to serve
one decomposition and damage the other, that is the signal to stop, not to pick.

**World Map is a platform, not a screen.** A new object type must be
REGISTERED, never require redesigning the map. *If installing a new object type
requires changing World Map architecture, the architecture is wrong.*

---

## 5. THE FOUR ACTOR CLASSES AND THE SIX JOURNEYS

Person, Company/Employer, Employment Agency and Institution are **one connected
system**, not four products. Cross-actor flows are the point, not an integration.

Six permanent journey contracts, ids fixed forever
(`apps/web/lib/product-gate/journey-register.ts`):

| Id | Chain |
|---|---|
| `J-WORKER-EVIDENCE` | Real work → journal → evidence → verification → living profile → capability |
| `J-COMPANY-EXECUTION` | People → project/site → assignment → capacity → need → supply → execution → report → verified history |
| `J-AGENCY-SUPPLY` | Declare workforce supply → discoverable to authorized demand → demand → match → assignment |
| `J-INSTITUTION-OUTCOME` | Programme → cohort → person → practice/work → evidence → competency → qualification → employer demand → outcome |
| `J-IMPORT-HISTORY` | Source → parse → reconciliation → preview → commit → readback → provenance → reversal |
| `J-TIME-FREEDOM` | Commitment → overlap detection → warning → alternatives → authorized decision → override → audit → actual result → learning |

**A route rendering is not a journey working.** A link claiming `LIVE` whose
capabilities are not live in the capability register fails CI.

---

## 6. PRECEDENCE RULE (binding)

```
1. PLATFORM_DOCTRINE                  ← supreme for technical/legal SAFETY only
                                        (security, RLS, migrations, evidence,
                                        translations, canonical structures)

2. THIS FILE (OWNER_TARGET_ARCHITECTURE_V1)
                                      ← WHAT the product is; the entry point

3. The owner locks, all still binding, all detail UNDER this file:
     PRODUCT_UNIVERSE_LOCK_V2 · PRODUCT_VISION_LOCK_V1 ·
     WORLD_STATE_UX_ARCHITECTURE_V1 · ORGANIZATION_ROLE_ORCHESTRATION_V1 ·
     OPPORTUNITY_REALIZATION_LOCK_V1 · UNIFIED_WORLD_MODEL_V1 ·
     OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04

4. PRODUCT_CONSTITUTION               ← axioms A-01..A-14, Product Gate,
                                        §14–17 (the source of §1.2, §3, §5)

5. docs/DECISIONS/*                   ← numbered owner decisions

6. Everything else
```

**How to apply it, in order:**

1. **Safety wins.** If the doctrine forbids it, it does not ship, whatever any
   architecture document says.
2. **This file defines scope.** If a lower document narrows the product below
   §1, this file wins and the lower document is stale — record it in §9.
3. **Breadth wins between owner texts.** Where an older owner requirement is
   BROADER, the older one stands. Where a newer text is CLEARER about the same
   thing, the newer governs. Nothing owner-authored is deleted to resolve a
   conflict.
4. **Code never redefines an owner decision.** An implementation that
   contradicts §1 is a defect in the implementation, recorded as such — never a
   reason to edit §1.
5. **Missing code never weakens the target.** A node with no capability is a
   gap in §11, not a smaller product.
6. **A genuine owner-policy ambiguity is never resolved by an agent.** It goes
   to §10 and stops there.

---

## 7. THE TWO REVIEW QUESTIONS (binding, unchanged)

Before any significant change, both:

- **(A) Did we break something that worked?**
- **(B) Did we make impossible something the architecture previously allowed?**

A change can pass every test and still fail (B). That is an architecture
regression and it is the one this apparatus exists to catch.

The canonical architecture is the **minimum known possibility space, not its
maximum boundary.**

---

## 8. WHAT IS NOT MACHINE-CHECKABLE (honest limits)

This file is enforced by a guard, and the guard can only check structure: that
the nodes are enumerated, that the registry in §9 matches the filesystem, that
no second file claims to be the entry point.

It **cannot** check that the product actually is this. In particular:

- that a person can complete a journey — only a human walkthrough shows that;
- that a number shown to a user is true;
- that a capability recorded as live is live *for a real person*, not just
  reachable in the import graph;
- whether an owner decision in §10 has been made outside the repository.

**A green suite is TEST_PROVEN and nothing more.** As of 2026-09-14, 17 of 106
registered capabilities are HUMAN_UI_PROVEN.

---

## 9. DOCUMENT REGISTRY — ACTIVE / SUPPORTING / SUPERSEDED

**Nothing is deleted.** Provenance is preserved. This registry exists so that no
second document reads as the canonical architecture.

### ACTIVE — binding, current

| Document | Role |
|---|---|
| **`docs/OWNER_TARGET_ARCHITECTURE_V1.md`** (this file) | **THE architecture. Entry point.** |
| `docs/PLATFORM_DOCTRINE.md` | Supreme for technical/legal safety |
| `docs/PRODUCT_CONSTITUTION.md` | Axioms, Product Gate, §14–17 |
| `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` | World architecture, four pillars |
| `docs/product/PRODUCT_VISION_LOCK_V1.md` | The twelve elements |
| `docs/product/WORLD_STATE_UX_ARCHITECTURE_V1.md` | UX architecture |
| `docs/product/ORGANIZATION_ROLE_ORCHESTRATION_V1.md` | One organization, many roles |
| `docs/product/OPPORTUNITY_REALIZATION_LOCK_V1.md` | Product boundary + flywheel (A-13) |
| `docs/product/UNIFIED_WORLD_MODEL_V1.md` | Canonical world data model |
| `docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md` | Interaction + execution rules |
| `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md` | Product scope and reach (LT) |
| `docs/DECISIONS/*.md` | Numbered owner decisions |
| `docs/CAPABILITY_INVENTORY.md` | Capability register, human half |
| `docs/launch/DISTRIBUTION_SURFACE_READINESS_2026-09-14.md` | Distribution status (§1.8) |
| `docs/mobile/STORE_RELEASE_READINESS_2026-09-13.md` | Store gates |
| `AGENTS.md`, `CLAUDE.md` | HOW agents work — never WHAT the product is |

### SUPPORTING — still useful, NOT the architecture

| Document | Why it is not canonical | Keep for |
|---|---|---|
| `docs/ARCHITECTURE.md` | Says of itself: *"a navigation and status document, not a replacement… adds no new authority of its own except §5 and §6."* Its §2 graph is **narrower than §1.2** — no agencies, no qualifications, no availability/time/capacity, no countries — and carries `CAPITAL/INVESTORS` and `FUTURE SKILLS`, which appear in no other graph | §5 owner directions (5.1–5.7), §6 extensibility contract, §7 process |
| `docs/ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` | 53 lines describing **one vertical** (person → contexts → journal → CV) as though it were the architecture. `CLAUDE.md` named it beside `ARCHITECTURE.md`, creating the two-entry-point problem | The universal-journal direction |
| `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` | Strategic context for the above | Rationale |
| `docs/CAPABILITY_INVENTORY.md` §6 snapshot | A dated snapshot, not a target | Reasoning, owner queue |
| `docs/launch/*CHECKPOINT*.md` | Session state, true at their date | Continuity |
| `docs/audits/**` | Point-in-time findings | Evidence |
| `docs/product/*-contract-v1.md` | Feature-level contracts under §1 | Detail |

### SUPERSEDED AS ARCHITECTURE — historical evidence only

| Document | Status |
|---|---|
| `LABOURMARKET_AI_PREMIUM_FULL_PROJECT_COMPLETION_MASTER_COMMAND_V2.md` | Root-level, 2013 lines, self-declared *"canonical owner execution command"*, referenced by no instruction file, contains a machine-specific local path. **Historical.** |
| `LABOURMARKET_AI_FUNCTIONAL_COMPLETION_MASTER_REPORT_2026-08-17.md` | Completion report for a train that closed 2026-08-18. **Historical.** |
| `LABOURMARKET_AI_WORK_OS_VECTICUM_COMPLETION_REPORT.md` | Same train, 2026-08-17. **Historical.** |
| `docs/reconciliation/FULL_PRODUCT_RECONCILIATION_2026-09-07.md` | Superseded as reconciliation by this file. |
| Any document asserting a product graph other than §1.2 | Superseded on that point only. |

**Rule for the future:** a new architecture direction **extends this file**. It
never spawns a competing one. If a change cannot be expressed as an extension
of §1, that is the signal to raise an owner decision (§10), not to write a
second architecture.

---

## 10. UNRESOLVED OWNER DECISIONS — no agent may settle these

Six carried forward, plus four surfaced by this reconciliation.

| Id | Decision |
|---|---|
| **PER-11** | Apply a split `external_profiles_v1` carrying only the one table its live UI needs, or retire the section |
| **ORG-2** | Migrate the seven gates to `organization_roles`, or keep the industry lock deliberately |
| **EVID-2** | Block self-confirmation in `review_journal_entry`, or rely on the weaker classification |
| **EVID-6** | The v1 select policy resolves `moderation_status` to the RECORD's status and hands the experience author a reply moderation has not published. Correcting it is a schema change (RED) |
| **MKT-7** | Two independent owner acts arm real charging |
| **GOV-1** | Add a READ-ONLY `SUPABASE_DB_URL` GitHub Actions secret. Two live security gates stay inactive without it |
| ~~**ARCH-1**~~ | ✅ **RESOLVED — APPROVED by the owner, 2026-09-14.** INSTITUTIONS, SUPPLY, MATCHING and RECOGNITION/RPL are first-class nodes. All 28 are now in `product-graph.ts` and guarded. The decision was explicitly *architectural/semantic, not authorization to create four duplicate modules, routes, databases or UI sections* — see §1.9 for what that means in practice. |
| **ARCH-2** *(new)* | **Who may assert a RECOGNISED EQUIVALENCE (RPL)?** The SEP-6 decision model is built and consumed; its only non-test input is hardcoded `false`. The blocker is a policy question — which actor, on what evidence, with what audit — not engineering |
| **ARCH-3** *(new)* | **Is zero usage a broken journey?** `EDU-2` is classed BROKEN for zero cohort members while `WRK-6` calls the identical fact *"a human fact and not a code gap"*. One standard must go. Until then, "10 broken links" mixes missing code with missing users and is not a usable backlog number |
| **ARCH-4** *(new)* | **Employer-side team matching** — opening `get_team_capability_summary_v1` beyond owner/manager/admin is a disclosure decision, not a wiring task |
| **ARCH-5** *(new)* | **The subject's right to refuse an imported record** (§1.6). RED — no INSERT policy admits a subject and no SECURITY DEFINER function writes for one. Note when prioritising: `organization_evidence_records` currently holds **0 rows** |
| **ARCH-6** *(new)* | **Distribution scope for mobile.** The phone ships a 6-screen record-and-review slice against 72 web routes. Which further capabilities the native clients must carry before "complete" is a product decision, not a parity gap to close by default |

---

## 11. CURRENT IMPLEMENTATION STATUS — measured, and NOT part of the target

> Nothing in this section may be used to edit §1. It is a snapshot of distance
> from the target, dated 2026-09-14, and it is expected to change.

**Production reality** (`gorgitwvdzxbnaxhrsrw`, read-only SQL, 2026-09-14):
89,021 public vacancies · 81 engagement contexts · 65 journal entries (46 live)
· 57 profiles · 17 organizations · 9 projects · 5 conversations · 2 experience
records · 1 programme · 1 cohort · **0** teams, cohort members, evidence
imports, defects, budgets, procurement inquiries, business trips.

**Node coverage against §1.2** and the corrected completion matrix live in
[`docs/launch/AUDIT_2026-09-14_CORRECTED_vs_OWNER_TARGET.md`](launch/AUDIT_2026-09-14_CORRECTED_vs_OWNER_TARGET.md).

**Verification honesty:** typecheck 0, lint 0 errors, build 0, 22,753 unit
tests passing — and CI has **no database**, so 5 of 95 e2e specs run and the
entire authenticated product has no automated end-to-end proof. 642 of 867
guard files assert over source text without executing product code. A green
suite here means less than it looks like.

---

## 12. PROCESS — what an agent must do before changing anything

1. Read this file.
2. Run `node .github/scripts/product-truth.mjs`.
3. Identify which of the 28 nodes and which of the six journeys the change
   touches.
4. Answer **both** review questions in §7, in writing, in the PR.
5. Check the change against the eleven reductions (§2) and the eight
   separations (§3).
6. If the change needs something in §10, **stop and ask the owner.**
7. If the change cannot be expressed as an extension of §1, **stop and ask** —
   do not write a second architecture.
