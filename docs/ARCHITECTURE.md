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
