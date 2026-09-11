# ChatGPT ↔ Claude Code Execution Protocol

Status: OWNER-APPROVED EXECUTION BRIDGE (2026-09-11)

## Purpose

Use GitHub as the shared, auditable coordination surface between the owner, ChatGPT and Claude Code so LabourMarket.ai can be advanced continuously toward the owner's canonical product vision without repeatedly reconstructing intent from individual prompts.

This protocol adds an execution bridge. It does not replace `CLAUDE.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/PLATFORM_DOCTRINE.md`, the canonical product vision, product locks, guards, CI, or owner decisions.

## Roles

### Owner (DI)
Owns product intent, priorities, irreversible decisions and final product acceptance. Natural-language corrections from the owner are product evidence and must be reconciled with canonical architecture rather than reduced to a narrow feature request.

### ChatGPT — product/architecture review authority
Translates owner intent into bounded execution objectives and acceptance criteria; reviews repository evidence, diffs, PRs and CI against canonical product intent; identifies gaps/regressions; and issues the next bounded correction or implementation objective. ChatGPT does not silently override canonical doctrine or unresolved owner decisions.

### Claude Code — repository execution authority
Reads repository truth, implements the bounded objective, tests it, records evidence, commits/pushes according to repository policy, and returns a precise execution receipt. Claude must not reinterpret a bounded task as permission to narrow the overall product.

## Mandatory bootstrap for every material product slice

1. Run `node .github/scripts/product-truth.mjs`.
2. Read `CLAUDE.md` and relevant sections of `AGENTS.md`.
3. Read `docs/ARCHITECTURE.md`.
4. Read `docs/PLATFORM_DOCTRINE.md` where applicable.
5. Read `docs/product/LABOURMARKET_AI_CANONICAL_PRODUCT_VISION.md`.
6. Read the relevant product lock/constitution referenced by those files.
7. Search for existing implementation before creating anything new.
8. Classify the work as CONNECT / FIX / EXTEND / REPLACE / NEW. Prefer CONNECT and FIX.
9. State affected canonical journeys, truth sources, evidence/provenance boundaries, privacy/security boundaries and existing guards.
10. If required private capability truth is unavailable, state that explicitly and proceed cautiously; never reconstruct private truth from guesses.

## Continuous execution loop

OWNER INTENT
→ canonical reconciliation
→ bounded objective
→ repository pre-flight
→ implementation
→ local verification
→ commit/push/PR according to repository policy
→ CI/evidence receipt
→ ChatGPT review against owner intent + architecture
→ correction/next highest-value broken link
→ repeat

The loop ends only when the objective's acceptance criteria are evidenced or a genuine human/owner gate is reached. A passing build alone is not product completion.

## Execution rules

- Preserve working structures, data, interfaces, workflows, security and extension points. Changes are additive by default.
- Never create a duplicate capability merely because an existing one is incomplete or hard to find.
- Never substitute mock/fake success for a real backend action or production truth.
- Never treat UI presence as evidence that a workflow works end-to-end.
- Do not stop at an intermediate implementation merely to report progress when the next safe step is executable.
- Do not invent owner decisions. Genuine ambiguity with material product consequences is a human gate.
- RED-class operations remain governed by existing repository human-gate policy.
- Production evidence and historical Work Journal evidence are not scratch data.
- Keep provenance and the distinctions between user claim, inference, verified evidence, credential/document evidence and employer/client confirmation.

## Work Journal / professional intelligence quality bar

The Work Journal is not a notes diary. It is a primary professional evidence and operational intelligence source. Any Work Journal slice must preserve the chain:

real activity + date/time/duration + context/project/location
→ activities/work packages
→ skills/capabilities actually used
→ evidence/provenance
→ cumulative hours/frequency/recency by skill and context
→ professional history / Living CV
→ analytics showing where time and capability are concentrated
→ evidence-backed growth/adjacency opportunities
→ matching to real demand
→ outcome/new evidence.

The user must be able to understand at a glance how many hours were worked, what was done, which skills were used, where/for whom/in what context, how those skills accumulate over time, which capabilities dominate activity, and where evidence indicates potential to deepen or expand activity. ESCO may provide standardized semantic mapping/interoperability but must not become a human ranking score.

## Completion receipt required from Claude Code

Every material slice ends with a machine-readable-ish receipt in the final response and, when appropriate, the PR body:

OBJECTIVE — exact bounded objective
CLASS — CONNECT | FIX | EXTEND | REPLACE | NEW
TRUTH — canonical sources consulted
CHANGED — files/capabilities changed
DATA — migrations/schema/data impact, or NONE
EVIDENCE — tests, build, screenshots/walkthrough, real rows/API proof as applicable
JOURNEYS — canonical journey links repaired/affected
REGRESSION — guards run and result
SECURITY — auth/RLS/privacy/secrets impact
CI — status/checks
COMMIT — SHA
PR — number/link or NONE
REMAINING — concrete unmet acceptance criteria, or NONE
BLOCKER — genuine external/human dependency, or NONE
NEXT — highest-value safe next step

Do not write `DONE` when REMAINING is non-empty.

## ChatGPT review contract

ChatGPT reviews receipts and repository evidence using two separate gates:

1. Engineering gate: did the change pass required tests/security/migration/CI constraints and avoid regressions?
2. Product gate: does a real user now receive the owner-intended end-to-end outcome, with real data/evidence and understandable UX?

If engineering is green but product is incomplete, the next instruction is a correction/continuation, not acceptance.

## Handoff command

When the owner says to continue autonomous project execution, Claude Code should treat this file plus canonical repository authorities as persistent execution context and continue the highest-value safe unfinished link within the currently authorized objective. It must not broaden into unrelated roadmap work merely to stay busy.
