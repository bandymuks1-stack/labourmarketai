# LABOURMARKET-MASTER-MAP

The one-page public map: what LabourMarket.ai is and how its four living documents are kept true.
Companion documents: [FUNCTIONAL-AUDIT](LABOURMARKET-FUNCTIONAL-AUDIT.md) (what really works) ·
[IMPROVEMENT-OPPORTUNITIES](LABOURMARKET-IMPROVEMENT-OPPORTUNITIES.md) (critical review) ·
[EXECUTION-ROADMAP](LABOURMARKET-EXECUTION-ROADMAP.md) (what to do, in which order).

**Public-safe by design.** Production data, security evidence, internal architecture and known defects live in
the owner's private registry, never here. **Living document:** it is rewritten when a capability changes
state, and `apps/web/lib/guards/master-map-register-sync.test.ts` fails CI when the register snapshot
below no longer matches the capability register.

> Register snapshot: 111 capabilities — BUILT_AND_USABLE 34 · PARTIAL 70 · BUILT_NOT_CONNECTED 1 · BLOCKED 2 · ARCHITECTURE_ONLY 2 · MISSING 1 · RETIRED 1

Last full audit: 2026-10-18 (main `fb741339a`).

---

## 1. What LabourMarket.ai is

One labour/work graph (28 nodes, `docs/OWNER_TARGET_ARCHITECTURE_V1.md`):

```
REAL WORK → EVIDENCE → CAPABILITY → CAPACITY → DEMAND → MATCH → EXECUTION → VERIFIED RESULT → LIVING HISTORY → BETTER DECISION
```

It must never be narrowed into a job board, recruitment site, staffing marketplace, CV builder, timesheet
app, workforce planner, evidence database, qualification platform, booking calendar or chatbot — each is
one edge of the graph (`node .github/scripts/product-truth.mjs`).

## 2. Architecture, boundaries, fragility and incidents

**Public-safe summary (owner decision 2026-10-21).** The detailed version — architecture, modules, data and access boundaries, delivery, single points of failure, blast-radius modules and the incident log (`labourmarket-master-map-v2.md`) — lives in the owner's PRIVATE Agentai OS Internal Brain (`docs/internal-brain/projects/`). Earlier versions of this file in the public history are superseded by it. Ask the owner for access; do not reconstruct it here.

## 9. How to keep this map true

1. When a capability changes state, update `apps/web/lib/product-gate/capability-register.ts` and the
   snapshot line at the top of this file in the same PR (the sync guard enforces it).
2. When a production walk proves or breaks a feature, update its row in the owner's PRIVATE functionality
   registry (Agentai OS Internal Brain), then regenerate the public counts in FUNCTIONAL-AUDIT with
   `node .github/scripts/registry-summary.mjs --registry <private file>` (guarded by
   `lib/guards/functional-registry-summary.test.ts`). Since 2026-10-21 the public repository keeps only that summary.
3. When the owner decides, move the item in the EXECUTION-ROADMAP and record the decision under `docs/DECISIONS/`.
4. The owner's interactive **Product Master Map** (value chain, journeys, commercial model, priorities) is a VIEW of
   these documents, never a second source: regenerate it with
   `python .github/scripts/product-map/build.py <private registry file> <out.html> <sha> [private-facts.json]`
   after every FUNCTIONAL-AUDIT change. Production numbers come only from the private facts file.
