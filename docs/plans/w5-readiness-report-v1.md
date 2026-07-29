# W5 READINESS REPORT v1

**Status:** READINESS ONLY — **no W5 implementation, no merge, no deploy.**
**Date:** 2026-07-29
**Baseline probed:** `origin/main` @ `5eddebac` + PR #909 (W3) + PR #912 (W4) + PR #910 → #911 → #913 (hygiene stack)
**References:** `docs/audits/w4-final-review-v1.md` · `docs/product/CONTEXT_PANEL_W3_V1.md` · `docs/product/AI_WORKSPACE_W4_V1.md` · `docs/plans/ai-runtime-consolidation-plan-v1.md`

---

## 0. TWO PREMISES IN THE BRIEF DO NOT HOLD

Stated first because the rest of the report depends on them.

| Brief says | Reality | Evidence |
|---|---|---|
| *"Rebase W5 work onto latest main **after merges**"* | **No merges have happened.** `origin/main` is still `5eddebac` (W1+W2, PR #908). PRs #909, #910, #911, #912 and #913 are all still OPEN. | `git log origin/main -1`; `gh pr list --state open` |
| *"Rebase **W5 work**"* | **No W5 work exists to rebase.** No W5 branch, file or scaffold anywhere in the repo or on the remote. | `git branch -a \| grep -i w5` → nothing. `docs/audits/w4-final-review-v1.md:308`: *"W5 has NOT been started. No W5 file, branch, or scaffold exists"* |

**What was done instead** — the question the brief was actually reaching for: *if W5 is built on W4, does it land on a tree where everything still passes?* That is answerable today, and it was answered by building the integration the merges would produce (§1).

### 0.1 The branch topology as it actually stands

```
origin/main (5eddebac)
├── #909  feat/cc/w3-context-panel          W3 — Context Panel          [product stack]
│    └── #912  feat/cc/w4-ai-workspace      W4 — AI workspace           ← W5 builds here
├── #910  fix/cc/p0-stabilization-v1        P0 stabilization            [hygiene stack]
│    └── #911  feat/cc/architecture-consolidation-v1
│         └── #913  feat/cc/ai-consolidation-phase-0-3-v1   AI Phases 0–3
└── 25 other open PRs (billing/commercial stack, dependabot, older gated work)
```

Two **independent** stacks off one unmoved `main`. W5 sits on the product stack; the AI guards it must satisfy live on the hygiene stack. Nothing forces them to be compatible — so that was tested.

---

## 1. INTEGRATION PROBE — the merge W5 would inherit

A throwaway local branch `probe/cc/w5-integration-probe` was created at W4's head and the hygiene stack's head merged into it. **Not pushed. Not a PR.** It exists only to answer the compatibility question.

### 1.1 Conflicts — TASK 1

| Check | Result |
|---|---|
| `git merge origin/feat/cc/ai-consolidation-phase-0-3-v1` into W4 | **ZERO CONFLICTS** |
| Files reconciled | 31 changed, 3,249 insertions, 1,323 deletions |
| Overlap risk that did **not** materialise | The hygiene stack deleted `lib/config/intents.ts` while W4 rewrote `lib/conversation/intent-router.ts` (+91 lines). They touch different modules; W4 never imported the deleted one. |

### 1.2 Full verification on the integrated tree — TASKS 2 & 3

| Subsystem | Command | Result |
|---|---|---|
| Whole tree | `pnpm -F web typecheck` | ✅ **clean** |
| **Architecture guards** | `pnpm exec vitest run lib/guards` | ✅ **555 files / 9,904 tests — all pass** |
| **AI runtime guards from PR #913** | `ai-runtime-boundary`, `ai-task-routing`, `ai-provider-boundary`, `estimate-clarify-assist`, `ai-readiness`, `no-direct-llm-client-call` | ✅ **6 files / 63 tests pass** |
| **World State** + **Context Panel** | `lib/world-state`, `w3-context-panel.test.ts` | ✅ pass |
| **AI workspace (W4)** | `lib/ai-workspace`, `w4-ai-workspace.test.ts` | ✅ pass (173 tests with the above) |
| **Recommendation pipeline** | `lib/opportunities`, `lib/market` | ✅ **12 files / 174 tests pass** |

**The PR #913 AI guards remain green after integration — TASK 3 answered, and with a stronger result than expected.** `lib/ai-workspace/` (W4's 1,127-LOC layer) imports **nothing at all** from `lib/ai/` — verified by `git grep` over the W4 branch. The names collide; the code does not. W4's "AI workspace" is the deterministic workflow layer, entirely separate from the AI runtime, so the new boundary guard has nothing to object to.

### 1.3 The one real blocker

| Gate | Result |
|---|---|
| `product-gate` on the integrated tree | ❌ **PRODUCT_REVIEW_REQUIRED — merge blocked** |

```
components/app/world-state/context-panel.tsx
  [not_reflected_on_map]      A-01 — "reflectedOnMap" is false        (certainty: certain)
  [transitional_waiver_in_use] A-09 — waived until E.7 / B.6 ship     (certainty: review)
```

**This is W3's pre-existing human gate, not a defect and not something W5 introduces** — the identical two violations block PR #909 today. It is a deliberate owner decision point: the Context Panel is not reflected on the map, and A-01 requires that it be. **W5 cannot merge until the owner resolves it**, because W5's work lands on top of the same file.

### 1.4 Honest note on local test flakiness

The first full guard run on the integrated tree reported 7 failures; the second reported **0 failures across 9,904 tests**. Every one was a 5,000 ms timeout under machine contention (four worktrees), not an assertion failure — the same pre-existing flake documented in `architecture-consolidation-v1` §8. Individually the affected files pass in 3–6 s. **CI on a clean runner is the arbiter**, and it is green on every stack's own PR.

---

## 2. W5 IMPLEMENTATION CHECKLIST — TASK 4

W5's scope, from `docs/audits/w4-final-review-v1.md:303`: *"the next step is a `demand` entity resolver so scouting results open in the panel — that is W5-shaped work and was **not** started."*

### 2.1 Demand Entity Resolver

The registration mechanism already exists and is guard-enforced. W3 registered `job`; W4 registered `project` and paid *"this line, its resolver module, and the allowlist entry"* — nothing else moved. **W5 pays the same bill or the architecture is wrong.**

- [ ] **D1** — Create `apps/web/lib/world-state/demand-context-server.ts`, modelled on `project-context-server.ts` (118 LOC) rather than `job-context-server.ts` (241 LOC); the project resolver is the leaner, more recent pattern.
- [ ] **D2** — Add exactly two lines to `lib/world-state/resolvers.ts`: `registerEntityContextResolver("demand", resolveDemandContext)` and `"demand"` in `REGISTERED_ENTITY_TYPES`. **A third change to that file is a design failure, not a W5 task.**
- [ ] **D3** — Read **only** through a canonical use case. For the employer/agency side that is `listCompanyDemands()` in `lib/scouting/scouting.ts`, and `runScouting()` for candidates. The resolver must run **no query, name no table, call no RPC and rank nothing** — pinned by `w3-context-panel.test.ts` *"the server half reads through the canonical use case only"* and `w4-ai-workspace.test.ts` *"no workflow queries, names a table, or writes"*.
- [ ] **D4** — ⚠ **Decide `job` vs `demand` explicitly and write the decision down.** Both resolve rows of `customer_requests`. `job` is that row as a **worker** sees it, authorized through `loadWorkerOpportunityBoard`. `demand` is the same row as its **owner** sees it, authorized through `listCompanyDemands`. Same table, different authorization path, different facts. **If this is not stated deliberately, W5 creates the exact duplicate-object defect axiom A-02 forbids.**
- [ ] **D5** — Populate the `EntityContextView` sections the lock requires (`ContextFact`, `ContextRequirement`, `ContextHistoryEntry`, `ContextRelated`, `ContextRecommendation`, `ContextAction`), honouring `CONTEXT_RECOMMENDATION_LIMIT = 2`.
- [ ] **D6** — An unauthorized or unknown demand id must return `{ kind: "unavailable", reason }` — never an empty panel implying the entity has nothing to show (`w3-context-panel.test.ts` *"an unregistered type degrades honestly instead of rendering emptiness"*).

### 2.2 Context Panel integration

- [ ] **C1** — **Zero changes to `components/app/world-state/context-panel.tsx`.** The panel has no per-type branch and must not gain one (guard: *"the panel has no per-type branch — it renders the resolved view"*). If W5 needs a panel edit, the resolver is wrong.
- [ ] **C2** — The panel performs no action of its own; it dispatches into the chat (guard: *"the panel performs no action of its own"*). Every `ContextAction` W5 emits must route through the existing chat handler.
- [ ] **C3** — Never a dialog, never modal, no commit/Apply control.
- [ ] **C4** — Copy for the new sections in **all 11 locale files**, following the repo's `[EN] …` convention for the 6 inactive locales. W4 added 84 keys × 11 files; budget similarly.

### 2.3 Workspace-only navigation

- [ ] **N1** — Selecting a scouting result **writes World State**; it must not `router.push`. Guards: `w3-context-panel.test.ts` *"selecting a match writes World State instead of opening a page"*, `w4-ai-workspace.test.ts` *"cannot navigate — the AI changes World State, never the page"* and *"never offers a chip that navigates out of the workspace"*.
- [ ] **N2** — Do **not** add a nav entry. `CORE_NAV_IDS` is `["overview", "journal_text_first", "planning", "communication"]`; Product Constitution A-03 names `lib/config/navigation.ts` CORE_NAV_IDS as the machine gate against *"a second parallel navigation system"*.
- [ ] **N3** — Known pre-existing hole, do not widen: `conversation-chat.tsx:745` still does `router.push(chip.id.slice(5))` for `link:` chips. `w4-final-review-v1.md:31` classifies it as pre-existing. **W5 must not emit a `link:` chip.**

### 2.4 World State interaction

- [ ] **W1** — `conversationState.aboutEntity` moves with the selection so panel and conversation can never disagree about the subject (`CONTEXT_PANEL_W3_V1.md`).
- [ ] **W2** — Respect the exactly-one rule for the active entity (`w4-ai-workspace.test.ts` *"the active project follows the exactly-one rule"*).
- [ ] **W3g** — `active_filters` and `map_state` are typed and unwritten; `CONTEXT_PANEL_W3_V1.md:81` assigns them to **W4 and W6**. **W5 must not write them.**
- [ ] **W4g** — Every W5 answer carries an `explanation.why` — a required field of the workflow contract, not an optional nicety.
- [ ] **W5g** — A dimension the world cannot honour is **named, never silently dropped** (`w4-ai-workspace.test.ts` supported/unsupported disjoint sets).

### 2.5 Acceptance criteria

W5 is done when **all** of these hold:

1. A scouting result opens in the Context Panel; the URL does not change and no page is pushed.
2. `resolvers.ts` grew by exactly two lines; `context-panel.tsx` is unchanged.
3. `REGISTERED_ENTITY_TYPES` and the registrations remain in sync both ways (guard-enforced).
4. An unauthorized demand id yields the honest `unavailable` state, verified with a second account.
5. Every new user-visible string exists in all 11 locale files; `check:i18n-debt` stays within baseline.
6. A new `lib/guards/w5-*.test.ts` pins W5's own invariants, including a **self-test proving each detector fires** (repo convention).
7. `product-gate` returns GREEN for W5's own diff, or the new surface is declared in `surface-registry.ts` with all five answers. *(The inherited A-01/A-09 block from §1.3 is separate and owner-owned.)*
8. The `job` vs `demand` decision (D4) is written into `docs/product/` — not left implicit.

### 2.6 Regression checklist

Run on W5's branch **and** on the integration probe:

- [ ] `pnpm -F web typecheck` — clean
- [ ] `pnpm exec vitest run lib/guards` — **9,904+ tests**, no assertion failures *(timeouts under local contention are not failures; re-run or trust CI)*
- [ ] `pnpm exec vitest run lib/world-state lib/ai-workspace lib/opportunities lib/market` — pass
- [ ] The six AI guards from PR #913 — pass
- [ ] `w3-context-panel.test.ts` + `w4-ai-workspace.test.ts` — pass, **unmodified**. Editing a W3/W4 guard to make W5 pass is a scope violation; if one legitimately must change, that is an owner decision.
- [ ] `check:primary-route-smoke` — 46 routes, 0 blocking
- [ ] `check:i18n-debt` — within baseline
- [ ] `placeholders:check` — OK
- [ ] `product-gate` — no NEW violation beyond the inherited A-01/A-09
- [ ] Playwright: `w3-context-panel.spec.ts` and `w4-ai-workspace.spec.ts` still pass; add `w5-*.spec.ts` with screenshot evidence, matching W3/W4 practice
- [ ] `git grep` proof that `lib/world-state/` and any new W5 module import **nothing** from the legacy AI island

---

## 3. DEPENDENCIES ON FUTURE WORK — TASK 5

**Identified, not implemented.**

| # | Dependency | On what | Effect on W5 | Recommended handling |
|---|---|---|---|---|
| 1 | **A-01 map reflection** | W6 (map platform) | **Hard merge blocker today.** The Context Panel is not reflected on the map; `product-gate` blocks. `CONTEXT_PANEL_W3_V1.md:94` says `true` would be a lie until W6 | **Owner decision required before W5 can merge.** Not a W5 task |
| 2 | **A-09 transitional waiver** | E.7 / B.6 | Second `product-gate` violation, owner-approved as a human gate | Same as #1 |
| 3 | **`active_filters` / `map_state`** | W4 / W6 own the writes | W5 must **not** write them even where it would be convenient | Leave unwritten; assert it in the W5 guard |
| 4 | **Employer→worker profile display names** | RLS decision deferred by W4 | `w4-final-review-v1.md:295` — employers cannot read assigned workers' `profiles.full_name`; the demand panel will show id-prefix fallbacks. Option A (`profiles!inner` → `profiles`) is safe; Option B is an RLS change | **Do not touch RLS in W5.** Accept the fallback, or take Option A as its own reviewed slice |
| 5 | **`link:` chip navigation hole** | W4-era, unowned | `conversation-chat.tsx:745` pushes a route | Do not emit `link:` chips; leave the hole for its own fix |
| 6 | **Hygiene stack merge order** | PRs #910 → #911 → #913 | W5 built on W4 alone will not have the AI boundary guards. Integration is proven clean (§1), but **only if the hygiene stack merges** | Merge the hygiene stack **before** or **independently of** W5; do not rebase W5 onto it mid-flight |
| 7 | **Owner-gated migrations** | 8 draft migrations | If the demand panel wants `agency_clients` or `company_locations` facts, they are absent in production | Use only tables that exist; degrade honestly per the repo's `needs-migration` pattern |
| 8 | **`main` has not moved** | 30 open PRs | Every stack is diverging from an unmoved `main` | Merge decisions are the owner's; W5 should start from W4's head, not from `main` |

---

## 4. GO / NO-GO

| Question | Answer |
|---|---|
| Is the code ready for W5 to be built on? | **YES.** Zero merge conflicts, clean typecheck, 9,904 guard tests pass, all AI guards green, no legacy-AI coupling in the W3/W4 layers |
| Is W5 ready to **merge** when built? | **NO — and not for a W5 reason.** The inherited A-01/A-09 product gate blocks W3, W4 and anything above them until the owner rules |
| Is the W5 scope well defined? | **YES**, with one decision the owner or architect must make first: **`job` vs `demand` (D4)** |
| Should W5 start now? | **Owner's call.** The technical path is clear; the merge path is not |

---

## 5. WHAT WAS NOT DONE

No W5 code, scaffold, branch or file was created. No merge. No deploy. No migration. No rebase of any existing branch — the integration probe is a **local, unpushed** throwaway branch (`probe/cc/w5-integration-probe`) kept only so the owner can reproduce §1. No guard, test or product file on any existing stack was modified.
