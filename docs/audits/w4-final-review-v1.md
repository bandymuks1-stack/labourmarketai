# W4 — FINAL VERIFICATION REPORT

| Field | Value |
|---|---|
| Scope | Verification of PR #912 (W4) on top of PR #909 (W3). **No W5.** |
| Branch | `feat/cc/w4-ai-workspace` |
| Merge | **not requested** — this report is the input to that decision |
| Deploy | none |
| Migrations | none, and none proposed by this review |

---

## §1 — World State audit

**Question: does every supported intent write ONLY World State, and can the AI navigate?**

Swept every module in the AI-workspace surface (`lib/ai-workspace/*`,
`lib/world-state/*`, `components/app/world-state/*`) and every file W4 touched,
for `useRouter` · `router.push` · `router.replace` · `redirect(` ·
`permanentRedirect` · `<Link` · `href=` · `window.location` · `history.pushState`
· `navigate(`.

**Occurrences found: 3 files, and only one was real.**

| Where | What | Verdict |
|---|---|---|
| `lib/ai-workspace/*` (5 files) | — | **clean**, zero occurrences |
| `lib/world-state/*` (8 files) | — | **clean**, zero occurrences |
| `components/app/world-state/*` (3 files) | — | **clean**, zero occurrences |
| `lib/guards/w3-context-panel.test.ts`, `lib/guards/w4-ai-workspace.test.ts` | the guard patterns themselves | not code |
| `components/app/conversation/chat/conversation-chat.tsx:745` | `router.push(chip.id.slice(5))` | **pre-existing** (rebuild W4/W5 era), reached only by a `link:` chip |

### ✗ FINDING A1 — navigation by proxy (FIXED)

The sweep for routing *constructs* was passing while the AI could still navigate,
because a workflow can hand the chat a **`link:` chip id** and the chat turns it
into `router.push`. `runFindWorkers` did exactly that:

```ts
chips: [{ id: "link:/dashboard/company/scouting", … }]   // ← left the workspace
```

That contradicted the owner's "no navigation from AI", the surface declaration's
`usableWithoutLeavingWorkspace: true`, and W4's own claim that the layer cannot
navigate. My original guard could not see it — it read the module for routing
syntax, and there was none.

**Fixed:** the chip is removed. The workflow now ends with an honest line —
*"Scouting for one of these does not run inside the workspace yet, so I stop
here rather than send you somewhere"* — in all 11 locales. A new guard checks
the **emission site** (`id:`/`chipId:` immediately followed by `link:`) across
the workflows and all three panel resolvers, and was proven by negative control
(injecting the chip fails it; removing it passes).

**Nothing is lost:** the employer's scouting surface is still one tap away from
the greeting's existing (non-AI) starter chip.

**After the fix, every chip the AI can emit is in-workspace:** `logwork`,
`profile`, `agenda`, `f:company.create-demand` — all handled inside the
conversation.

---

## §2 — Filter consistency

**Question: one canonical pipeline, no duplicated or hidden ranking?**

| Symbol | Call sites (non-test) | Verdict |
|---|---|---|
| `deriveJobRecommendations` | defined once; called **only** in `lib/opportunities/recommendations.ts` (unfiltered cached path + filtered path) | one ranking |
| `applyDiscoveryFilters` | `recommendations.ts` (AI path) · `dashboard/opportunities/page.tsx` (the board's own URL filters) — the **same** canonical function | one filter implementation |
| `needMatchesFilters` | only inside `applyDiscoveryFilters` | — |
| board / matches use cases | `ai-workspace/workflows.ts`, `conversation/find-work.ts`, `world-state/job-context-server.ts`, `dashboard/opportunities/page.tsx` — all through `loadWorkerOpportunityBoard` / `loadWorkerOpportunityMatches` | one entry |

**No alternative ranking path. No hidden search.** The three other callers of the
`list_open_demand_for_workers` RPC (`communication-eligibility`, `cv-export/tailored`,
`opportunities/interest`) re-run the *visibility* pipeline for eligibility checks
— none of them ranks, filters or displays opportunities. `lib/search/*` is the
universal dashboard command palette, unrelated to job search.

**Order is correct:** filters are the derivation's INPUT —
`deriveJobRecommendations(applyDiscoveryFilters(board, filters), …)` — so a
narrowing is never applied to an already-cut top-N. Guard-pinned.

---

## §3 — The `assigned = 0` case: ROOT CAUSE FOUND

**Reproduced deterministically** against the local stack, as the company user
(`aaaaaaaa-…-2`), on a project with one `status='active'` assignment:

| Step | Result |
|---|---|
| `can_manage_project(project)` | **true** |
| `project_worker_assignments` row visible | **yes** (1 row) |
| `workers` row visible | **yes** |
| **`profiles` row visible** | **NO — 0 rows** |
| The resolver's actual join shape | **0 rows** |

### Exact cause

`lib/projects/operations.ts:84` (`readActiveAssignments`) selects:

```
assigned_at, worker:workers!inner(id, profile_id, display_name, profiles!inner(full_name))
```

and the only SELECT policy on `profiles` is:

```sql
profiles_select:  (id = auth.uid()) OR is_admin()
```

An employer can **never** read another person's `profiles` row — by design
(§4 default-closed, §20 privacy). The `!inner` modifier therefore drops the whole
assignment row before it reaches the application layer.

The bitter detail: the code **already has** the fallback this breaks —
`profiles.full_name ?? workers.display_name ?? profile_id.slice(0,8)`, with a
`hasRealName` flag. The inner join makes that fallback unreachable. The join
exists only to fetch an **optional display name**.

### Classification

- **Not** RLS on the assignment table · **not** a cache · **not** stale World
  State · **not** the W4 resolver.
- **Pre-existing defect** in a canonical read, surfaced (not caused) by W4.

### Blast radius — six surfaces, all pre-existing

`getProjectOperations` feeds: the operations screen, the operations centre,
`projects/stadium`, the operations **report route**, the premium hub, and (new)
the W4 project panel. Two sibling reads carry the same pattern:
`lib/projects/projects.ts:87` (`listProjectAssignments`) and
`lib/instructions/instructions.ts:146`.

**Consequence:** every employer-facing "assigned workers" list is empty for
employers today (admins excepted). The W4 panel is the first surface that made
it visible.

### Not fixed here, deliberately

The mission says fix if reproducible, document root cause if outside W4. It is
**both** reproducible and outside W4, and every available fix needs an owner
decision (see Owner decision 2). Changing a canonical read used by six surfaces,
or an RLS policy, inside a "final verification" pass would be exactly the kind of
quiet scope expansion this review exists to catch.

---

## §4 — Intentionally unsupported requests (complete register)

### 4a. World State dimensions the AI recognises but cannot filter on

Recognised and **named out loud** — never silently dropped
(`UNSUPPORTED_DIMENSIONS`, guard-pinned).

| Dimension | Why unsupported | Required data source | Planned implementation |
|---|---|---|---|
| **salary / pay** | No pay field in `DiscoveryFilterState`. Pay lives in the optional `structured_v2.compensation` projection, present only when the company filled it AND the MP-3 RPC widening is applied — filtering on it would silently hide every demand that simply did not state pay | `customer_requests.payload.structured_v2.compensation` (+ the public projection) | a `pay` filter dimension once enough demands carry compensation; must distinguish "below your floor" from "not stated" |
| **language** | No language field on the need. `language_requirement` exists on `customer_requests` but is free text, not a closed set | a normalised language + level enum on the demand | needs the demand intake to capture language as structured data first |
| **employment type** (full/part-time) | `engagement_form` exists in `structured_v2` but is not in the canonical filter set, and coverage is unknown | `structured_v2.engagement_form` | add to `DiscoveryFilterState` once coverage is measured |
| **radius / distance** | The platform holds **zero worker coordinates** by design (§20 — a person's exact point is not representable). City-tier matching is what exists | consented worker location precision | blocked on an owner consent decision, not on code |

### 4b. Owner example sentences that are only partly supported

| Sentence | What it does | Why not more |
|---|---|---|
| *"Show my approved hours"* | states that **no approved-hours ledger exists** and gives confirmed-entry figures | the product records `journal_entry_confirmations`, not hours approval. Inventing an hours number is forbidden (§7) and dangerous — it could be shown to an employer |
| *"Prepare this week report"* | canonical standing figures via `getReportsView` | no period-scoped report read exists; the copy says what it is rather than implying a week window |
| *"Compare these candidates"* | routes to the scouting readback, which ranks candidates with their reasons | no canonical multi-candidate comparison read; building one would create a second ranking path |
| *"Find workers"* | lists the company's real demands, then stops | scouting runs against ONE demand and there is no `demand` entity resolver yet, so results cannot land in the panel — and after A1 the AI will not route the person out instead |

### 4c. Entity types the workspace cannot open

Registered: `job`, `project`. **Not** registered: `person`, `organization`,
`document`, `task`, `booking`, `training`, `event`, `team`. Each is one
resolver module + one registration line + one allowlist entry; none needs an
architecture change (proven by `project` in W4).

---

## §5 — World State contract

**Question: do conversation, workspace, context panel and recommendations consume
exactly the same World State? Any secondary state?**

| Consumer | How it reads World State | Verdict |
|---|---|---|
| Conversation (`messages.tsx`) | `useWorldStateOptional()` → `state.activeEntity` for the selected-card highlight | same state |
| Conversation send handler | `AiWorkspaceBridge` → `openEntity` / `closeEntity` only | same state, narrow surface |
| Context Panel | `useWorldState()` → `state.contextPanel` | same state |
| Recommendations | filters are **not** in World State — see B1 | **gap** |

**One provider, one reducer, one context.** No second store, no duplicate
selection state, no `localStorage`, no URL state. The panel's local `useState`
holds *fetched payloads*, not world facts.

### ✗ FINDING B1 — the AI does not persist filters into World State (NOT fixed; owner decision)

`change_world_state` is **never dispatched in production code**. The AI reads
dimensions from a sentence and passes them to the search for that turn only;
`activeFilters` stays `{}`.

Consequences:
- a follow-up ("…and with housing") cannot compose with the previous narrowing;
- W6's map, when it subscribes to World State, will not see what the AI filtered;
- the phase claim "the AI writes World State" is true for `active_entity`,
  `context_panel` and `conversation_state` — **not** for `active_filters`.

**Not fixed**, because persistence is a product decision, not a bug: do filters
accumulate across turns? When do they clear? Silently persisting them would make
a later unrelated search quietly narrower — worse than the current behaviour.
See Owner decision 1. Every misleading comment claiming W4 writes this slot has
been corrected in code.

### ✗ FINDING B2 — `active_actions` was claimed as written (FIXED)

The slot is *cleared* by the reducer but never *set*: the panel renders actions
from the resolver payload. `SLOTS_WRITTEN_IN_W3` overstated this. Renamed to
`SLOTS_WRITTEN_IN_PRODUCTION` and corrected to the four slots really written.
Keeping one source (the payload) is right; the slot stays unwritten rather than
becoming a second copy that could disagree.

---

## §6 — Cleanup

| Check | Result |
|---|---|
| `console.*` / `debugger` | **none** |
| `TODO` / `FIXME` / `XXX` / `HACK` | **none** |
| Commented-out code | **none** |
| Dead exports | **1 found → removed** |
| Stale comments | **4 found → corrected** |

### ✗ FINDING C1 — dead server action (FIXED)

`describeAppliedFilters` was exported from `workflows.ts` and called by nothing.
Because that module is `"use server"`, an unused export is not merely dead code —
it is a **reachable server-action endpoint** with no caller. Removed, along with
its now-unused `activeFilterEntries` import.

### Stale comments corrected

- `change_world_state` — "(W4 uses it; W3 does not)" → it does not; now states
  the real position and why.
- `active_filters` slot — "The AI writes dimensions in W4" → still unwritten.
- `ai_goal` slot — "(W4 owns the AI operator)" → still unwritten.
- The filters test title — "W4 writes these" → "nothing writes it yet".

---

## Verification after the fixes

| Check | Result |
|---|---|
| `pnpm -F web typecheck` | 0 errors |
| `pnpm -F web lint` | 0 errors (20 pre-existing warnings) |
| `pnpm -F web test` | **778 files / 12 582 tests** pass |
| New guard negative control | injecting a `link:` chip **fails** it; removing it passes |
| `pnpm -F web build` | clean |
| E2E — worker session | 7 pass, 1 correctly skipped |
| E2E — company session | 2 pass (re-run after the chip removal) |

---

## Issues fixed in this review

1. **A1** — the AI could navigate out of the workspace via a `link:` chip. Chip
   removed, honest line in its place across 11 locales, new emission-site guard
   proven by negative control.
2. **B2** — `active_actions` was declared as written when nothing writes it.
   Corrected to the four slots really written.
3. **C1** — a dead exported server action (`describeAppliedFilters`) removed.
4. Four stale comments that claimed W4 behaviour it does not have.

## Remaining known limitations

1. **Filters do not persist into World State** (B1) — per-turn only.
2. **Employer "assigned workers" lists are empty** (§3) — pre-existing, six
   surfaces, root cause identified exactly.
3. Salary / language / employment / radius remain unfilterable (§4a).
4. "Compare candidates", week-scoped reports, and in-workspace scouting are not
   implemented (§4b).
5. Only `job` and `project` can be opened as entities (§4c).

## Owner decisions required

1. **Should AI filters persist in World State across turns?**
   *Recommend:* persist, with the panel showing the active filters and a way to
   clear them — otherwise W6's map cannot reflect what the person asked for.
   Cost: one dispatch call plus a visible "active filters" affordance.
2. **How to fix the employer assignment blindness (§3)?**
   *Recommend option A:* change `profiles!inner(full_name)` →
   `profiles(full_name)` (a LEFT join) in the three reads. No RLS change, no new
   grant, no data exposure — an unreadable profile simply returns `null` and the
   existing `display_name` → id-prefix fallback does its job. Option B (grant
   employers read access to assigned workers' profiles) is an RLS change,
   RED-class, and grants strictly more than the display name needs.
   **Both are outside W4 and neither was applied.**
3. **Does "Find workers" stopping at the demand list read as broken?** If so, the
   next step is a `demand` entity resolver so scouting results open in the panel
   — that is W5-shaped work and was **not** started.

## Confirmation

- **W5 has NOT been started.** No W5 file, branch, or scaffold exists; the only
  changes in this pass are the four fixes above, their guard, their copy, and
  this report.
- **No merge.** **No deploy.** **No migration.** The local stack is stopped.
