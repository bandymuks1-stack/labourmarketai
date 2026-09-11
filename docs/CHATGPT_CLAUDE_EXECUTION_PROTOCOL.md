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
→ review against owner intent + architecture
→ correction/next highest-value broken link
→ repeat.

The loop ends only when the objective's acceptance criteria are evidenced or a genuine human/owner/external gate is reached. A passing build, merge, deployment, receipt, PR closure, or intermediate production proof alone is not product completion.

### Non-stall invariant

For an owner-authorized autonomous objective, Claude Code MUST NOT stop merely because an intermediate PR was merged, CI passed, a receipt was emitted, or a useful production slice was proven.

Evaluate the receipt state as follows:

- `REMAINING = NONE` and all objective acceptance gates are evidenced → the objective may complete.
- `REMAINING != NONE` and `BLOCKER = NONE` → the objective is still ACTIVE. Continue automatically with the highest-value safe remaining link inside the same authorized objective.
- `BLOCKER` is a genuine RED/human/external dependency → stop and request only the minimum decision/input required.
- A remaining item outside the authorized objective → record it without broadening scope.

`BLOCKER = NONE` + non-empty `REMAINING` is therefore a continuation signal, not a handoff to the owner and not permission to wait for another prompt.

Do not write or imply `awaiting the next objective`, `awaiting instructions`, `DONE`, or equivalent while the current authorized objective still has safe in-scope remaining acceptance work.

Closing an issue or writing `Closes #...` is allowed only when the objective acceptance criteria are actually complete. A PR that delivers one slice of an objective must not close the objective when `REMAINING` is non-empty.

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
- Optimize for owner-visible product outcomes, not PR count, commit count, document count or agent activity.
- Prefer one working branch and one coherent final PR per bounded objective when technically and safely practical.
- Do not create `HANDOFF_*`, `CHECKPOINT_*`, `REPORT_*`, `zz-*`, probe, scratch or similar repository files merely to record progress. Temporary investigation artifacts stay outside the repository and are removed when finished.

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

A receipt is a checkpoint/evidence object, not automatically a stop signal. After emitting an intermediate receipt, continue when the non-stall invariant requires continuation.

### Receipt classification fields (v2, optional but expected under the worker)

`REMAINING` mixes three kinds of work that the continuation state machine must
keep apart. When a slice runs under the Agentai OS objective worker, also fill:

REMAINING_SAFE — items an agent can do now under repository policy, or NONE
REMAINING_GATED — items that need an owner decision, each with the EXACT decision the owner must make, or NONE
HUMAN_ACCEPTANCE — items only a human can verify (a real-user walk, a visual acceptance), or NONE
BLOCKER_CLASS — NONE | OWNER_GATE | EXTERNAL | RETRYABLE

State consequences (kept by the worker, not by the owner): `REMAINING_SAFE`
non-empty → the objective stays ACTIVE and resumable, whatever else is listed.
`REMAINING_SAFE = NONE` with `HUMAN_ACCEPTANCE` non-empty → ACCEPTANCE_PENDING,
never COMPLETE. `REMAINING_SAFE = NONE` with `REMAINING_GATED` non-empty →
OWNER_GATE. A `RETRYABLE` blocker (transient API/CI/tooling failure) is retried
with backoff and is never reported as an owner decision.

### Stale-gate rule

Before recording any owner gate or blocker, verify it against the live state it
depends on (the migration ledger, merged PRs, applied migrations, existing
identities, existing files). A gate that was resolved elsewhere is not a gate.
Budget, context size, CI still running, a missing test, a missing readback or a
disconnected UI are never owner gates. On 2026-09-11 seven receipts carried
"#1355 owner-gated slug↔ESCO bridge" three days after the linkage had been
applied to production (ledger `20260908082301`); that class of error is what
this rule prevents.

## ChatGPT review contract

ChatGPT reviews receipts and repository evidence using two separate gates:

1. Engineering gate: did the change pass required tests/security/migration/CI constraints and avoid regressions?
2. Product gate: does a real user now receive the owner-intended end-to-end outcome, with real data/evidence and understandable UX?

If engineering is green but product is incomplete, the next instruction is a correction/continuation, not acceptance.

## Local continuous-worker requirement

GitHub is the coordination/evidence surface, but GitHub alone cannot type into a local Claude Code terminal. True unattended continuation therefore requires a local worker/orchestrator running on the owner's machine (or another explicitly authorized execution host).

That worker should:

1. identify the currently owner-authorized objective;
2. invoke Claude Code in the correct repository/worktree;
3. require the bootstrap and execution protocol;
4. let Claude implement/test/commit/PR under repository policy;
5. parse the execution receipt;
6. if `REMAINING != NONE` and `BLOCKER = NONE`, invoke the next iteration automatically within the same objective;
7. stop on RED/human/external blocker or completed acceptance gates;
8. enforce a bounded iteration/time/failure budget so infrastructure failures cannot create an infinite retry loop;
9. never bypass repository safety, owner gates, secrets policy, spending authorization, migration rules or outreach authorization;
10. keep a durable per-objective state (ACTIVE / CONTINUE / RETRYABLE_FAILURE / EXTERNAL_BLOCKER / OWNER_GATE / ACCEPTANCE_PENDING / COMPLETE / STOPPED_BY_SAFETY_BUDGET / STOPPED_BY_OWNER) so that a budget stop with safe work remaining is RESUMABLE and is never recorded as "waiting for the owner"; the next approved worker invocation resumes from that state without the owner restating the objective.

The local worker is orchestration only. It must not duplicate product truth, invent priorities, or become a second product architecture authority. Agentai OS is the preferred cross-project home for this orchestration capability; LabourMarket.ai keeps only the minimal project-side execution contract/integration required to participate.

## Handoff command

When the owner says to continue autonomous project execution, Claude Code should treat this file plus canonical repository authorities as persistent execution context and continue the highest-value safe unfinished link within the currently authorized objective. It must not broaden into unrelated roadmap work merely to stay busy.
