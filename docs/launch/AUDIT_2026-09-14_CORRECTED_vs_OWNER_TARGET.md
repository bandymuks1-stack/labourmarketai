# CORRECTED AUDIT — measured against the OWNER TARGET ARCHITECTURE

| Field | Value |
|---|---|
| **Date** | 2026-09-14 |
| **Measured against** | [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md) V1.1 §1.2 — the 28-node target graph |
| **Revised** | 2026-09-14, after owner decision **ARCH-1 (APPROVED)**. All 28 nodes are now measured; the four previously-unmeasured nodes have real verdicts (§2) |
| **Supersedes** | the *completion matrix and conclusions* of `AUDIT_CHECKPOINT_2026-09-14_end-to-end.md`. **Its seven defects are preserved in full** (§4) — none was erased because a register was stale |
| **Status** | Audit only. No product code, schema, RLS, migration or owner gate touched |

---

## 0. WHY THE PREVIOUS AUDIT'S CONCLUSION DOES NOT SURVIVE

The #1739 audit closed with: *"not missing features — missing proof that what
exists works, and missing users."*

**That conclusion is withdrawn.** It was measured against an architecture
pasted into a chat prompt, because no repository document contained one. It
compared the code to itself — the capability register against the code the
register describes — and a self-referential comparison cannot find a missing
feature by construction.

Measured against the owner target instead, the picture inverts:

> **Of the 24 target nodes that the product graph measures at all, exactly ONE
> is BUILT_AND_CONNECTED. Twenty-two are PARTIAL and one is MISSING outright.
> Four further target nodes are not measured by anything.**

This is an architecture-completeness problem *and* a proof problem. The
previous conclusion was half right and the wrong half was load-bearing.

---

## 1. NODE-BY-NODE AGAINST THE 28-NODE TARGET

Computed from `product-graph.ts` × `capability-register.ts`, with the four
#1739 reclassifications applied (MKT-5, MKT-6, WRK-8, WRK-10 are reachable and
wired — verified, see §4.1).

Legend: **G** built+usable · **P** partial · **M** missing · **B** built-not-connected · **X** blocked · **A** architecture-only

| # | Target node | caps | G | P | M | B | X | A | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PEOPLE | 7 | 4 | 2 | 0 | 0 | 1 | 0 | PARTIAL |
| 2 | REAL WORK | 8 | 4 | 4 | 0 | 0 | 0 | 0 | PARTIAL |
| 3 | SKILLS | 5 | 3 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 4 | EXPERIENCE | 4 | 1 | 3 | 0 | 0 | 0 | 0 | PARTIAL |
| 5 | EVIDENCE | 4 | 2 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 6 | QUALIFICATIONS | 6 | 1 | 5 | 0 | 0 | 0 | 0 | PARTIAL |
| 7 | ORGANIZATIONS | 5 | 1 | 3 | 0 | 0 | 1 | 0 | PARTIAL |
| 8 | COMPANIES | 4 | 1 | 3 | 0 | 0 | 0 | 0 | PARTIAL |
| 9 | AGENCIES | 3 | 2 | 1 | 0 | 0 | 0 | 0 | PARTIAL |
| **10** | **INSTITUTIONS** | 4 | 3 | 1 | 0 | 0 | 0 | 0 | PARTIAL — strongest of the four |
| 11 | TEAMS / BRIGADES | 2 | 0 | 1 | 1 | 0 | 0 | 0 | PARTIAL |
| 12 | PROJECTS | 6 | 5 | 0 | 0 | 1 | 0 | 0 | PARTIAL |
| 13 | SITES / OBJECTS | 2 | 0 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 14 | TASKS / WORK STAGES | 3 | 3 | 0 | 0 | 0 | 0 | 0 | **BUILT_AND_CONNECTED** |
| 15 | SERVICES | 4 | 1 | 3 | 0 | 0 | 0 | 0 | PARTIAL |
| 16 | AVAILABILITY | 4 | 1 | 3 | 0 | 0 | 0 | 0 | PARTIAL |
| 17 | TIME | 4 | 1 | 2 | 1 | 0 | 0 | 0 | PARTIAL |
| 18 | CAPACITY | 4 | 0 | 1 | **3** | 0 | 0 | 0 | PARTIAL — barely |
| **19** | **SUPPLY** | 4 | 2 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 20 | CURRENT DEMAND | 5 | 3 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 21 | FUTURE DEMAND | 3 | 0 | 0 | **3** | 0 | 0 | 0 | **MISSING** |
| **22** | **MATCHING** | 3 | 1 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 23 | EDUCATION / TRAINING | 8 | 4 | 3 | 0 | 1 | 0 | 0 | PARTIAL |
| **24** | **RECOGNITION / RPL** | 3 | **0** | 3 | 0 | 0 | 0 | 0 | PARTIAL — **no fully-built capability at all** |
| 25 | COUNTRIES / JURISDICTIONS | 2 | 0 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 26 | MOBILITY | 2 | 1 | 1 | 0 | 0 | 0 | 0 | PARTIAL |
| 27 | MARKET SIGNALS | 3 | 1 | 2 | 0 | 0 | 0 | 0 | PARTIAL |
| 28 | COMMERCIAL OPPORTUNITIES | 4 | 1 | 1 | 0 | 0 | 1 | 1 | PARTIAL |

**Corrected capability totals (106 registered):** BUILT_AND_USABLE **38**
(was 34 — the four #1739 corrections) · PARTIAL **55** · MISSING **6** ·
BLOCKED **3** · BUILT_NOT_CONNECTED **2** · ARCHITECTURE_ONLY **2**.

### The two structural readings

**FUTURE DEMAND is MISSING outright.** All three of its capabilities — DEM-8
saved searches/alerts, CAL-9 utilisation/FTE, CAL-10 planned-vs-actual learned
duration — are MISSING at every layer. This is not a proof gap. **CAL-10 is the
learning loop of the canonical flywheel**: without it, "better forecasts →
better benchmarks" has no mechanism, and the flywheel in §1.2 of the target is
an open arc, not a wheel.

**CAPACITY is PARTIAL only on a technicality** — 3 of its 4 capabilities are
MISSING (CAL-7 reservation, CAL-9, CAL-10). Its one surviving capability,
CAL-4, is the gap timeline, which #1739 found collapses UNKNOWN into NOT-MET
(§4.3). The node is closer to broken than to partial.

---

## 2. THE FOUR NODES ARCH-1 ADDED — now measured

**RESOLVED 2026-09-14. Owner decision ARCH-1: APPROVED.** INSTITUTIONS,
SUPPLY, MATCHING and RECOGNITION/RPL are first-class nodes.

They were never unimplemented — their capabilities existed, filed under other
nodes. What was absent was the architectural representation, and the cost of
that absence was precise: `product-graph-journeys.test.ts` protects a node by
failing when it loses its last live capability, and **a concept with no node
cannot lose its last capability.** The one mechanism this repository built to
stop silent narrowing was blind to four of the twenty-eight things it protects.

Each node was given EXISTING capability ids. **Nothing was created** — no
table, no route, no component, no server action, no migration — per the
owner's explicit limit (canonical §1.9).

| Node | Realized by | Verdict | What the node now protects |
|---|---|---|---|
| INSTITUTIONS | EDU-1, EDU-2, EDU-3, EDU-6 | **PARTIAL** (3 built, 1 partial) | The strongest of the four. `J-INSTITUTION-OUTCOME` had a journey and no node; both exist now |
| SUPPLY | DEM-2, DEM-9, ORG-8, CAL-3 | **PARTIAL** (2 built, 2 partial) | **SEP-4 (DEMAND ≠ SUPPLY) now has a structural expression.** The separation the market-direction defect violates was previously enforced by review alone |
| MATCHING | DEM-5, DEM-6, DEM-3 | **PARTIAL** (1 built, 2 partial) | Matching was filed as a property of demand — vacancy-ranking, the job-board reduction in structural form. It is now its own node in both directions |
| RECOGNITION / RPL | SKL-9, SKL-10, EDU-4 | **PARTIAL — and the weakest node in the graph: ZERO fully-built capabilities** | The SEP-6 boundary. SKL-9's model exists with a hardcoded `false` input (§4.4), SKL-10 deliberately writes nothing into the skill ladder, EDU-4 is a student path. Nothing here completes |

**Two deliberate exclusions**, both to protect a separation rather than to
inflate a node:

- **SKL-2** (deterministic journal → skill recognition) is NOT under
  RECOGNITION. It recognises DEMONSTRATED CAPABILITY; the node is about
  RECOGNISED EQUIVALENCE against a formal requirement. One node holding both is
  the SEP-6 collapse.
- **RECOGNITION is not QUALIFICATIONS.** The latter holds and validates
  credentials a person already has; the former is the act of converting
  evidence into standing.

**What ARCH-1 changed in the numbers:** nothing improved. 24 measured nodes
became 28, and the four arrived as PARTIAL — one of them with no fully-built
capability at all. That is the correct outcome: the decision made an
already-existing gap *visible and guarded*, and a reconciliation that had
improved the score would have been the suspicious one.

Enforced by `lib/guards/owner-target-architecture.test.ts`: the four must exist
as nodes, `PRODUCT_GRAPH.length` must be 28, every capability they name must
already be in the register, and RECOGNITION may not absorb SKL-2.

---

## 3. DISTRIBUTION AGAINST §1.8 — the sixth surface set

| Surface | Class | State |
|---|---|---|
| Web / PWA | **BUILT_AND_CONNECTED** | Installability defect fixed 2026-09-14 (PNG 192/512 + maskable, generator, guard). Was silently un-installable |
| Vendor-neutral MCP | **BUILT_AND_CONNECTED** | Current revision `2026-07-28` served: `server/discover`, per-request version, cache directives, CORS. Was pinned to a superseded revision |
| ChatGPT app | **OWNER_GATED** | Code ready; blocked on Supabase OAuth 2.1 AS + domain verification |
| Claude connector | **OWNER_GATED** | Code ready; blocked on Team/Enterprise org + a complete privacy policy |
| iOS / App Store | **EXTERNAL_RELEASE_GATED** | Config + association ready; Apple account, icon art, declarations, screenshots |
| Android / Google Play | **EXTERNAL_RELEASE_GATED** | Same, plus Play account and signing key; **Android runtime never proven** |

Distribution was absent from the entire authority stack before this
reconciliation — `PRODUCT_CONSTITUTION` and `PLATFORM_DOCTRINE` contain zero
references to any of the six. It is now §1.8 of the canonical architecture.

---

## 4. #1739 DEFECTS — ALL SEVEN PRESERVED, NONE ERASED

Reconciliation did not dissolve a single finding. Each is restated with its
class under the new scheme.

**4.1 Four `BUILT_NOT_CONNECTED` rows are reachable and wired** — MKT-5
procurement and MKT-6 trips on `/dashboard/finance` (17 server actions);
WRK-8 defects and WRK-10 economics on `projects/[id]/operations`. Both
disconnection guards are vacuous (`capability-register.test.ts:272` skips on
`coreModule === null`; `:311` iterates an empty `surfaces`; all six rows carry
both). → **DUPLICATED_OR_PARALLEL / register defect.** Corrections applied to
the matrix above; the register file itself is not edited by this docs-only
reconciliation.

**4.2 The Verified CV overstates a person's evidence trail** —
`trust-signals.ts:48` counts journal entries with no `deleted_at` /
`superseded_by` filter. Production: 65 counted, **46 live**, 4 workers
affected. Feeds `dashboard/profile` and `cv-export/verified-cv.ts`. →
**BROKEN.** Highest-priority non-gated defect: it is the only one currently
misinforming a real user, on the document that leaves the platform.

**4.3 Two `languageLevelSatisfies`; the second collapses UNKNOWN into NOT-MET**
— `capacity-model.ts:176` returns `boolean` where canonical
`match-criteria-v2.ts:243` returns `boolean | null`. Feeds
`totalHeadcountShortfall`. → **BROKEN (SEP-7)**, and it sits on the CAPACITY
node that §1 already shows as the weakest in the graph.

**4.4 SKL-9 (RPL) recorded MISSING; the SEP-6 model exists and is consumed** —
only non-test producer hardcodes `false` (`worker-project-access.ts:299`). →
**PARTIAL / inert bridge**, blocker is **ARCH-2** (policy), not engineering.

**4.5 Parity snapshot 5 rows stale** (273 vs 278) — a documented 2026-08-23
defect recurring. → **BROKEN (governance).**

**4.6 CI has no database** — 5 of 95 e2e specs run, auth-gated routes
inverted; 642 of 867 guards assert over source text; 0 component tests. →
**HUMAN_PROOF_REQUIRED / infrastructure gap.** This is the root cause of
17/106 HUMAN_UI_PROVEN.

**4.7 68 of 141 `lib` subsystems carry no register anchor**; two admin routes
have zero references of any kind. → **BUILT_NOT_CONNECTED (register
incompleteness).** §2 above is the same defect one level up: the register
under-describes the product in both directions.

---

## 5. CORRECTED COMPLETION MATRIX — full product

| Class | Count | Contents |
|---|---|---|
| **BUILT_AND_CONNECTED** | 38 caps · **1 of 28 nodes** (TASKS) · 2 surfaces | The one fully-standing node is TASKS/WORK STAGES |
| **PARTIAL** | 55 caps · **26 of 28 nodes** | The overwhelming majority of the product. RECOGNITION/RPL is the weakest — zero fully-built capabilities |
| **MISSING** | 6 caps · **1 node** (FUTURE DEMAND) | DEM-8, CAL-7, CAL-8, CAL-9, CAL-10, WRK-6. *(The four unrepresented nodes are resolved — ARCH-1.)* |
| **BUILT_NOT_CONNECTED** | 2 caps + 2 orphan routes + 68 unanchored subsystems | EDU-5 `/dashboard/learning`, WRK-9 handover |
| **DUPLICATED_OR_PARALLEL** | 2 real divergences | `languageLevelSatisfies`; journal live-filter across 34 readers, 23 omitting it |
| **BROKEN** | 4 | Trust/CV count · capacity language gap · 2 vacuous guards · stale parity snapshot |
| **OWNER_GATED** | **11** | PER-11, ORG-2, EVID-2, EVID-6, MKT-7, GOV-1 + ARCH-2…ARCH-6. **ARCH-1 resolved.** |
| **EXTERNAL_RELEASE_GATED** | 2 surfaces | App Store, Google Play |
| **HUMAN_PROOF_REQUIRED** | **89 of 106** | Only 17 capabilities are HUMAN_UI_PROVEN |

---

## 6. REVISED DEPENDENCY-ORDERED PATH

### Phase 0 — truth (blocks the meaning of everything downstream)
1. ~~**ARCH-1**~~ ✅ **DONE 2026-09-14** — approved and implemented by reuse;
   all 28 nodes guarded.
2. Apply the four register reclassifications (§4.1) and remove the two vacuous
   guard escapes. *1 window.*
3. Refresh the parity snapshot; resolve **ARCH-3** (is zero usage broken?).
   *0.5 window + owner.*

### Phase 1 — the defects on a real user's screen
4. §4.2 trust/CV live-entry filter — one shared predicate, three call sites, a
   guard that executes the reader. *1–2 windows.*
5. §4.3 `languageLevelSatisfies` convergence with an explicit `null` decision.
   *0.5–1 window.*

### Phase 2 — the verification floor
6. **A database in CI.** Unblocks everything downstream and converts ~90 dead
   specs into the first real end-to-end proof. *4–7 windows realistic; 10–14
   conservative — the 90 specs have not executed in a long time.*

### Phase 3 — architecture completion (NEW — this is what #1739 missed)
7. **CAL-10 planned-vs-actual → learned duration.** The flywheel's learning
   loop. Everything in Phase 3 depends on it. *4–8 windows.*
8. **CAL-7 capacity reservation** (must warn, never prohibit — SEP-2).
   *2–4 windows.*
9. **CAL-9 utilisation/FTE** — depends on 7. *2–3 windows.*
10. **DEM-8 saved searches / alerts** — closes FUTURE DEMAND. *2–3 windows.*
11. **WRK-6 team→project assignment** — schema change, owner-gated.
12. **RPL write path** — gated on **ARCH-2**.

### Phase 4 — distribution
13. Mobile remainder + Android runtime proof. *2–4 windows.*
14. Everything else is owner credentials and external review.

---

## 7. AGENT EXECUTION TIME — revised

One window ≈ one focused session ending in a merged PR.

| Track | Optimistic | Realistic | Conservative |
|---|---|---|---|
| Phase 0 truth | 1 | 2 | 4 |
| Phase 1 user-visible defects | 1 | 2–3 | 5 |
| Phase 2 database in CI | 2 | **4–7** | 10–14 |
| Phase 3 architecture completion | 8 | **14–22** | 35+ |
| Phase 4 distribution (agent half) | 2 | 3–4 | 6 |
| Register→reality sweep, 55 PARTIAL rows | 2 | 4–6 | 10 |

**Production-complete WEB, to the owner target** — not to "what exists works":
**optimistic 16, realistic 29–44, conservative 70+ windows.**
The previous estimate of 12–18 was for a *narrower target* and stands only for
"make what exists provable".

**Mobile as currently scoped:** 2–4. Scope beyond that is **ARCH-6**.

**Store-submission-ready:** 2–4 agent windows, then owner-gated absolutely.

**Fully connected final architecture (all 28 nodes):** **45–75 realistic**,
constrained by decision sequencing — CAL-9 depends on CAL-10, CAL-10 depends on
CAL-7, and WRK-6 and the RPL write path are owner-gated today (ARCH-2, ARCH-4,
ARCH-5). ARCH-1 is resolved, so all 28 nodes now exist and are guarded; that
removed an unknown from the estimate without removing any work from it.

**Assumptions:** each window ends in a merged GREEN-class PR; no RED migration
without an owner gate; nothing in the 90 unrun e2e specs needs a schema change.
**Weakest assumption remains Phase 2** — 90 specs that have not run in CI are
90 unknowns, and every estimate after it moves with them.

---

## 8. THE PLAIN ANSWER, CORRECTED

**Is it a missing-feature problem?** **Yes — and also a proof problem.** One of
24 measured target nodes is fully built and connected. FUTURE DEMAND is missing
entirely, CAPACITY is three-quarters missing, and the flywheel's learning loop
(CAL-10) does not exist, which means the product cannot yet improve its own
forecasts — the mechanism the target architecture is built around.

**What #1739 got right, and it still stands:** the product has almost no users
(57 profiles, 46 live journal entries, 0 teams, 0 cohort members, 0 evidence
imports against 89,021 ingested vacancies); several capabilities recorded as
broken are merely unused; no P0 security defect exists; and nothing has been
walked signed-in by a human.

**What it got wrong:** it concluded from those facts that features were not the
problem. That conclusion could not have been reached from a real target
comparison, and this audit is the comparison it lacked.
