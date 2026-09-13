# 0016 — Owner execution principle: delivery over legacy constraints

Date: 2026-09-13 · Status: **OWNER DECISION, recorded 1:1** · Applies to every implementation task; complements decision 0015 (A-14) and `docs/PRODUCT_CONSTITUTION.md` "Change control".

## Owner text (verbatim)

> OWNER EXECUTION PRINCIPLE — DELIVERY OVER LEGACY CONSTRAINTS
>
> The primary objective is to reach the intended, owner-usable, coherent end-to-end LabourMarket.ai product as quickly as safely possible.
>
> Governance and the product constitution exist to protect that objective, not to freeze historical implementations.
>
> Rules:
>
> 1. DO NOT duplicate existing functionality, modules, data models, workflows, or product surfaces.
>
> 2. ALWAYS reuse or extend an existing capability when it can correctly implement the approved product intent without degrading UX, architecture, security, maintainability, or extensibility.
>
> 3. HOWEVER, when an owner-approved, previously agreed, or clearly documented product decision cannot be properly realized with the existing implementation, you MAY add the necessary:
>    - capability,
>    - component,
>    - view,
>    - route,
>    - workflow,
>    - data extension,
>    - integration,
>    - or other smallest coherent product structure.
>
> 4. Do not force a new product requirement into an unsuitable old page or workflow merely because that structure already exists.
>
> 5. New does not mean duplicate.
> A new capability is justified when it completes, improves, or correctly realizes the agreed product vision and there is no equivalent existing capability that can do so properly.
>
> 6. Prefer EXTEND / CONNECT / IMPROVE over NEW.
> Use NEW only when the missing product responsibility is genuinely distinct or cannot be coherently expressed by extending what exists.
>
> 7. Never create parallel implementations of the same responsibility.
>
> 8. Never sacrifice the core LabourMarket.ai product idea merely to satisfy an obsolete implementation constraint.
>
> 9. If a constitution clause blocks a necessary implementation of already-approved owner intent, do not silently work around it. Identify the exact conflict and propose the smallest constitution amendment required. Owner intent governs the product direction; the constitution protects its coherent implementation.
>
> 10. Optimize for shortest path to a real, production-usable end-to-end result — not for the smallest diff, maximum reuse, number of pages avoided, number of PRs produced, or compliance with historical UI structures.
>
> For the current Numbers/Journal decision, apply this principle now. Determine the correct product responsibility first, reuse everything that should remain shared, add only what is genuinely missing, and continue implementation without restarting the project or creating another planning cycle.
>
> Do not stop merely because an old guard conflicts with the required product evolution. Escalate only the exact owner-gated architectural decision; continue all safe non-conflicting work.

## How it binds implementation

- The machine half of rule 9 is Product Constitution **A-14** (decision 0015): a genuinely distinct user job / graph edge is declared with `distinctSurface`; convenience or duplicate pages stay RED; the gate reports excused readiness answers as notices, never silently.
- Rules 1, 5 and 7 are already held by A-02 / A-08 (`duplicate_action`, canonical-paths and dashboard-duplicate guards). Nothing here loosens them.
- A guard that pins a legacy composition is updated deliberately, with the retired expectation named in the commit body — never deleted, never weakened on a security or honesty rule (`docs/ARCHITECTURE.md` §7 review question B).
- Applied first to Work in Numbers: case B, own station `/dashboard/work-in-numbers`, the reader / model / components / checks flow / copy / capability all shared with the journal, the CV, the chat and the organization pages; no redirect alias, no `?view=` branch.
