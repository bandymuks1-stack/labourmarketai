# OPPORTUNITY REALIZATION LOCK V1 — CANONICAL PRODUCT BOUNDARY AND FLYWHEEL

| Field | Value |
|---|---|
| Status | **BINDING product doctrine.** The reference against which future features, UX, copy, AI prompts, matching, pricing and agent work are checked |
| Source | **Owner directive, 2026-08-14** (canonical product + Sweden worker loop goal), recorded here 1:1 where quoted |
| Position | Under `PRODUCT_UNIVERSE_LOCK_V2` (world architecture) and beside `PRODUCT_VISION_LOCK_V1` (the twelve elements). **Nothing here removes or reinterprets either — this document locks the product BOUNDARY and the value FLYWHEEL** |
| Machine half | `docs/PRODUCT_CONSTITUTION.md` §12 axiom **A-13**; pinned phrases verified by `apps/web/scripts/check-constitution.ts` |
| Enforced by | `.github/scripts/product-gate.mjs` + `apps/web/lib/guards/product-gate.test.ts` + `apps/web/lib/guards/universal-canonical-definition.test.ts` |

## Authority order

```
PRODUCT_UNIVERSE_LOCK_V2      ← world architecture
  ├─ PRODUCT_VISION_LOCK_V1    (the twelve elements, under the four pillars)
  ├─ OPPORTUNITY_REALIZATION_LOCK_V1   (this document — boundary + flywheel)
  └─ PRODUCT_CONSTITUTION       (axioms + Product Gate)
      └─ everything else
```

`PLATFORM_DOCTRINE` remains supreme for technical/legal safety only.

---

## 1. What LabourMarket.ai is NOT (internal boundary — never public copy)

LabourMarket.ai is **not**:

- merely a job board;
- merely a recruitment platform;
- merely a CV builder;
- merely an employer ATS;
- merely a freelancer marketplace;
- merely a services marketplace;
- merely a workforce ERP;
- merely a Work Journal;
- merely an AI chatbot;
- merely a labour-market data portal.

Every one of those can be a **capability or acquisition surface inside** the
system. None of them is the product boundary. Any plan, PR, prompt or copy
change that reduces the product to one of these categories is a doctrine
violation, regardless of how locally reasonable it looks.

**Public-copy constraint (restated from constitution §7.1, binding):** this
negation list is INTERNAL doctrine vocabulary. Public product identity is
stated **positively and universally** — never by negation ("not just X",
"not a Y platform" are forbidden in public copy).

**ADR-0008 reconciliation (binding):** recruitment is a **core function** of
the system — job search, worker search and hiring flows are permanent parts of
the loop, and the platform never positions itself *against* recruitment. The
boundary rule above says recruitment is **not the boundary**, not that it is
unwelcome. `docs/DECISIONS/0008-universal-labour-market-os.md` and this
document are two halves of the same rule.

## 2. Canonical product principle

> LabourMarket.ai helps people and organizations expand the opportunities to
> use their capabilities, work, services, capacity, products and other
> legitimate economic output.

Information accumulated through **actual activity** — capabilities, completed
work, created results, services, availability and supporting evidence — allows
the system to understand increasingly well **what the user or organization can
offer**. That understanding must be returned to the user as practical value:
better-fitting work · customers · orders · projects · buyers · workers ·
teams · contractors · demand · useful sales/realization channels · other
legitimate economic opportunities.

**Semantic anchor (owner text, 1:1):**

> **Parodyk, ką sugebi ir nuveiki. LabourMarket.ai padės rasti daugiau
> galimybių tai realizuoti.**

Localized copy may adapt this naturally rather than translate literally, but
must preserve the meaning: *show what you can do and have done; the system
helps you find more opportunities to realize it.*

**The broader canonical promise (adapt naturally per locale):** LabourMarket.ai
helps expand your activity and **earning opportunities**. Your capabilities,
completed work, created results, services and supporting evidence help the
system understand what you can offer and find more relevant work, orders,
customers, buyers and other opportunities.

**Forbidden promises:** guaranteed income, guaranteed employment, guaranteed
hiring outcomes. Always "earning opportunities", never guaranteed earnings.

**Never human worth:** LabourMarket.ai understands and matches capabilities,
activity, supply, results and demand. It does **not** assign a person's value
or worth (constitution §10, `docs/CONTEXTUAL_FIT_SIGNALS.md`). No universal
score, no rating of a human being, no gamified human-value mechanics — not
even as concept visuals.

## 3. The canonical flywheel (product invariant)

```
CAPABILITIES · ACTIVITY · COMPLETED WORK · RESULTS ·
SERVICES / PRODUCTS / CAPACITY · EVIDENCE
        ↓
WORK JOURNAL / ACTIVITY HISTORY
        ↓
BETTER STRUCTURED UNDERSTANDING OF WHAT THE PERSON
OR ORGANIZATION CAN OFFER
        ↓
BETTER MATCHING AGAINST REAL DEMAND
        ↓
WORK · ORDERS · CUSTOMERS · BUYERS · PROJECTS ·
WORKERS · CONTRACTORS · OTHER RELEVANT OPPORTUNITIES
        ↓
NEW REAL ACTIVITY / RESULT
        ↓
BACK INTO ACTIVITY HISTORY → progressively better opportunity discovery
```

This loop is a **product invariant**. Features that break it into unrelated
silos (a CV silo, a marketplace silo, a journal silo, a chatbot silo) are
architecture defects. The user-visible meaning is always:

> MORE USEFUL ACTIVITY CONTEXT → BETTER UNDERSTANDING → BETTER OPPORTUNITIES.

Never: MORE DATA → HIGHER HUMAN SCORE.

Concrete code anchors of the loop as of 2026-08-14 (informative, not
normative): journal intake (`lib/journal/actions.ts` + skill pipeline
`lib/journal/skill-pipeline.ts`) → `worker_skills` with evidence tiers
(`lib/evidence/evidence-tier.ts`) → match subject (`lib/opportunities/worker-subject.ts`,
`lib/market/match-subject.ts`) → the one match engine (`lib/market/match-v1.ts`)
→ worker board / scouting / recommendations. Match **status** derives from raw
capability coverage; **evidence confidence travels beside it and is never
multiplied in** (owner directive 2026-08-09).

## 4. The two mandatory product tests

Every relevant architecture or UX decision must survive BOTH tests.

### TEST A — Sweden ~7,000 jobs

A worker must NOT have to manually browse thousands of listings to obtain
value. The system progressively turns worker context (capabilities,
preferences, availability, location/mobility, language, Work Journal history,
completed work, evidence) into increasingly useful matching against the real
Swedish supply. The same inventory must become MORE useful to a user as the
system learns more relevant information about their activity. Public copy
never states a fixed inventory count that will go stale — use wording like
"thousands of current opportunities" only while the verified count supports it.

### TEST B — Grandmother's cucumbers

A non-technical person must be able to express something as simple as *"I have
30 kg of cucumbers from my garden and I want to sell them"* without
understanding marketplaces, lead generation, B2B, taxonomy, listing schemas,
matching engines or sales funnels. The system understands the offer, asks only
for genuinely necessary information, identifies appropriate and **lawful**
realization paths, and helps move toward actual demand — or states honestly
that no channel exists yet (`CHANNEL_GATED` / `LEGAL_CHECK_REQUIRED` verdicts
in `lib/value-channels/`). Unsupported commerce functionality is never faked
to make the test visually pass.

## 5. Search and matching stay inside the core loop

Job search, worker search, customer search, order/project search,
contractor/team search, service demand and buyer/demand discovery are **not
disposable acquisition features**. They are one half of the continuous loop.
The system supports the symmetry:

```
I NEED SOMETHING  → INQUIRY
I CAN OFFER SOMETHING → OFFER
OFFER ↔ INQUIRY
```

Where the existing architecture has more precise entities
(`customer_requests` kinds, vacancies, service offerings, marketplace
listings, value statements), those are preserved — no global rewrite around
generic Offer/Inquiry entities.

## 6. Work Journal is a core value-accumulation layer

The Work Journal is never a timesheet, never mandatory bureaucracy, and never
a silo. It captures useful information about real activity over time (text,
completed work, project/object context, duration where relevant, capabilities,
results, photos, documents). Provenance stays explicit — self-recorded,
journal-supported, counterparty-confirmed — and a technical record or photo is
**never automatically represented as legally verified proof** (Legal Rights &
Control doctrine, `docs/PLATFORM_DOCTRINE.md`).

**Return-on-contribution rule (UX law):** where technically and semantically
justified, a meaningful Journal contribution returns **visible, truthful**
value to the user — e.g. which work history it extended, or which
opportunities it affected. Only claims that are actually computed may be
shown. Fake percentages, fake match improvements, fake skill growth and
gamified scores are forbidden (§5 / §10 of the constitution).

## 7. Organizations: recurring operational value, not episodic hiring

Hiring is episodic; daily operational value is recurring. The employer /
organization side of the flywheel — work reports, team/project/object
progress, planning, calendar, workload/capacity, staffing forecasts, hours and
work evidence, worker/contractor search, customer/order discovery — is a
permanent part of the product. Worker-acquisition pushes must never distort
the architecture around workers only.

## 8. Metrics direction

The product optimizes for **meaningful active workspaces and recurring
economic activity**, not raw registrations. Funnel telemetry must be able to
measure the full loop (campaign visit → matching started → useful
opportunities viewed → signup → enrichment → journal contribution → matching
refreshed → save/apply/open → return visit → repeat activity), privacy-safely
and first-party. Existing production KPI definitions are extended, never
silently replaced.

## 9. Referenced by / must stay linked

- `docs/PRODUCT_CONSTITUTION.md` — §7.2 (architectural consequence) and §12
  (axiom **A-13** cites this file)
- `docs/product/PRODUCT_UNIVERSE_LOCK_V2.md` · `docs/product/PRODUCT_VISION_LOCK_V1.md`
- `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`
- `docs/product/labour-market-os-constitution-v1.md`
- `docs/product/general-labour-market-platform-principle.md` +
  `docs/product/public-trust-positioning.md` (how this becomes public copy
  without negation)
- `docs/CONTEXTUAL_FIT_SIGNALS.md` (never human worth) ·
  `docs/PLATFORM_DOCTRINE.md` §19 (fit, not rating)
- `docs/product/journal-proof-engine-v1.md` · `docs/product/living-cv-contract-v1.md`
- `docs/PROJECT_VISION.md` §2 and `docs/DECISIONS/0008-universal-labour-market-os.md`
  (reconciled in §1 above — recruitment is a core function, not the boundary)
