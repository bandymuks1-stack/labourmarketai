# AI WORKSPACE — W4

| Field | Value |
|---|---|
| Phase | **W4** of the owner's W3–W8 execution plan |
| Governing lock | [`WORLD_STATE_UX_ARCHITECTURE_V1`](./WORLD_STATE_UX_ARCHITECTURE_V1.md) §5 step **0.5.2** — "the AI writes World State instead of navigating" |
| Builds on | **W3** ([`CONTEXT_PANEL_W3_V1.md`](./CONTEXT_PANEL_W3_V1.md), PR #909) — stacked, because W4 writes the World State W3 introduced |
| Migrations | **none** |
| New routes | **none** |
| New UI components | **none** — every answer renders through the existing message + chip mechanisms |

---

## 1. What shipped, against what was asked

> "AI becomes the primary interface. The user should achieve goals by talking,
> not by navigating pages."

| Owner requirement | What shipped | Real? |
|---|---|---|
| understands current **workspace** | `getWorkspaceContext` — the `engagement_contexts` spine + the active-organization pointer | yes |
| understands current **entity** | World State `activeEntity` (W3); the AI reads and writes it | yes |
| understands current **company** | the active workspace when it is an organization | yes |
| understands current **project** | the ONE assigned project band covering today (exactly-one rule) | yes |
| understands current **conversation** | World State `conversationState.aboutEntity` | yes |
| understands current **Work Journal** | last entry day + count, from the canonical Time Engine projection | yes |
| understands current **permissions** | held roles, read fail-closed; `permissionsKnown` distinguishes "none" from "unread" | yes |
| **executes workflows** | seven: find work · skill gap · journal · figures · open project · find workers · context readback | yes |
| **explains WHY** | `explanation.why` is a REQUIRED contract field, and quotes the person's own words | yes |

### The owner's example sentences

| Sentence | What happens | Honest? |
|---|---|---|
| "I want work in Germany" | reads `country` out of the sentence, filters the board through the canonical discovery filters, and says what it narrowed on | yes |
| "What skills am I missing?" | counts the skills the visible demands require and the profile lacks, most-demanded first | yes |
| "Show my approved hours" | **says the platform keeps no approved-hours ledger** and gives the confirmed-entry figures it really has | yes — see §3 |
| "Prepare this week report" | the canonical reports figures for the acting side | partly — the read is standing figures, not a week window |
| "Show my latest journal" | the person's real recent entries from the Time Engine projection | yes |
| "Find workers" | the company's real demands (scouting runs per demand, so it never scouts for a need nobody picked) | yes |
| "Find employers" | the same canonical opportunity search | yes |
| "Open this project" | writes `active_entity` — the Context Panel opens it, **no navigation** | yes |
| "Compare these candidates" | routes to the same scouting readback, which ranks candidates with their reasons | partly — see §5 |

## 2. The architecture

```
  sentence
     │
     ├─ classifyIntent()            deterministic, no LLM (existing router, extended)
     │
     ├─ readWorldState()            words → canonical filter dimensions, with matchedText
     │
     └─ workflow                    ONE canonical use case per workflow
            │
            ├─ answer  ─────────────► existing message + chips
            └─ open-entity ─────────► World State `open_object` ─► Context Panel (W3)
```

| File | What it is |
|---|---|
| `lib/ai-workspace/world-state-language.ts` | PURE. Sentence → filter dimensions. Inflection-aware stems, longest match wins, every match carries the words that produced it. |
| `lib/ai-workspace/vocabulary-server.ts` | The words the AI knows, built from the canonical catalogues and the person's own board facets. |
| `lib/ai-workspace/ai-context.ts` | The seven context facts, canonical reads only, `unknown` as a first-class value. |
| `lib/ai-workspace/workflow-contract.ts` | PURE. The result shapes — `why` is required, not optional. |
| `lib/ai-workspace/workflows.ts` | The seven workflows. No query, no table, no ranking, no writes. |
| `lib/world-state/project-context-server.ts` | The `project` Context Panel resolver — W3's second entity type. |
| `lib/auth/held-roles.ts` | A fail-closed role read for context (distinct from the dispatcher's fail-open default, on purpose). |

### One ranking path, not two

Filtering happens **inside** `getWorkerJobRecommendations`, before `deriveJobRecommendations`:

```ts
deriveJobRecommendations(applyDiscoveryFilters(boardOpportunities, filters), seen, now)
```

Filtering an already-ranked top-3 would silently drop matches the person explicitly
asked for, and the result would still look plausible. With no filters the
request-cached result is returned untouched, so every existing surface behaves
byte-identically.

### Registration proved

W3 claimed a new entity type is a registration, not an architecture change. W4 is
the first test of that claim by a second type. The bill: one resolver module, one
line in `resolvers.ts`, one allowlist entry. The panel, World State, the
conversation and the map did not change.

## 3. The honesty decisions

- **"Approved hours" does not exist, and the assistant says so.** The platform
  records manager-confirmed journal entries, not an hours ledger. Deriving an
  hours figure from entry counts would be a fabricated number that someone might
  put in front of an employer. The refusal is real copy in all 11 locales and a
  guard asserts it.
- **Dimensions with no filter are named, never dropped.** Pay, language,
  employment type and radius have no canonical filter today, so the AI says "I
  cannot filter by pay yet" instead of ignoring the words. `UNSUPPORTED_DIMENSIONS`
  makes that testable.
- **A value the board does not contain is understood, not applied.** Asking for
  Norway when no Norwegian demand is visible returns "nothing there is visible to
  you — these countries are", not an unexplained empty list.
- **Permissions are never guessed.** The role read fails closed, and
  `permissionsKnown` lets the assistant say "I could not read your permissions"
  rather than assert an empty set.
- **Ambiguity is asked about.** Two projects that could be meant produces a
  question, not a pick.
- **No LLM.** The whole layer is deterministic — the doctrine's always-on floor.

## 4. Verification

| Check | Result |
|---|---|
| `pnpm -F web typecheck` | 0 errors |
| `pnpm -F web lint` | 0 errors (20 pre-existing warnings) |
| `pnpm -F web test` | **778 files / 12 581 tests** pass |
| `pnpm -F web build` | clean |
| Authenticated E2E — worker session | 7 pass, 1 correctly skipped (personal space) |
| Authenticated E2E — company session | 2 pass |
| Screenshots | `docs/audits/evidence/w4-ai-workspace/` |

Two defects were found by the verification and fixed before this document existed:

1. **"I want work in Germany" classified as `unknown`** — the router had no
   pattern for stating a goal (only for commanding a search). The owner's
   flagship example fell through to the fallback.
2. **"Open this project" classified as `unknown`** — the pattern matched the
   LT/DE stem `projekt` but not the English spelling `project`.

Guards: `lib/guards/w4-ai-workspace.test.ts` (17 assertions) and
`lib/ai-workspace/world-state-language.test.ts` (14 unit tests).

### Local fixture note

To exercise the workflows the local stack was seeded with a verified company, a
submitted demand, partial worker skills, and a live project with one active
assignment. With that fixture the project panel reported `assigned: 0` while an
active assignment row existed — the canonical operations read (the same one the
operations screen uses) returned zero under that session's RLS. The panel
faithfully renders what the canonical read returns, so this is a question about
the pre-existing operations read, not about W4's resolver. Recorded here rather
than smoothed over.

## 5. What W4 did NOT do

- **"Compare these candidates" is not a comparison view.** It routes to the
  scouting readback, which ranks candidates with their reasons. A real
  side-by-side comparison has no canonical read behind it yet, and inventing one
  would mean a second ranking path.
- **"Prepare this week report" is not week-scoped.** `getReportsView` returns
  standing figures. The copy says what it is; a week window needs a real
  period-scoped read.
- **Scouting is not run automatically.** "Find workers" lists the company's real
  demands and stops, because scouting runs against ONE demand and attaching a
  candidate list to the wrong need is worse than no list.
- **The map is still not in the workspace.** W6.
- **`salary` / `language` / `employment` / `radius` remain unfilterable** — named,
  not implemented.
- **W1–W3 were not touched**, other than the two additive extension points W4
  needed: the entity-type registry gained `project`, and the recommendations use
  case gained an optional `filters` argument.

## 6. Pre-merge patch (owner-approved)

Two changes landed after the final review, both approved before merge:

**Employer assignment blindness — fixed.** `profiles!inner(full_name)` →
`profiles(full_name)` at the three sites that read the optional display name:
`lib/projects/operations.ts`, `lib/projects/projects.ts`,
`lib/instructions/instructions.ts`. No RLS change, no new grant, no additional
profile data. Proof in §8.

**World State filters — extension point prepared, behaviour unchanged.** See §7.

## 7. W6 EXTENSION POINT — persistent filters

Recorded so W6 does not have to re-derive it. Nothing below is wired; the
behaviour today is per-turn filtering, unchanged by this patch.

| Piece | State today | What W6 does |
|---|---|---|
| The slot | `WorldState.activeFilters` exists, typed, always `{}` | becomes the single source of the active narrowing |
| The transition | `worldStateReducer` handles `change_world_state` (set + clear), unit-tested | dispatched instead of ignored |
| The dispatcher | `WorldStateContextValue.dispatch` already exposes it | no new context, no new store, no type change |
| The producer | `runFindWork` computes `reading.filters` and passes them to that ONE search | dispatches per entry **before** searching |
| The consumer (search) | `findWorkForChat(filters)` takes them as an argument | reads `state.activeFilters` |
| The consumer (map) | — | subscribes to the same slot; this is why filters must live in World State rather than in a function argument |
| The consumer (panel) | shows the selected entity only | can render the active filters + a way to clear them |

**The open product question W6 must answer first:** when do filters clear? A
narrowing that silently survives into an unrelated later question is worse than
today's behaviour, which is exactly why this patch did not enable it. Options:
clear on an explicit "show everything", clear when the objectType changes, or
always show them with a one-tap clear.

**Deliberately no unused code was added** for this. An exported-but-uncalled
setter in a `"use server"` or provider module is a reachable surface with no
caller — the same defect the review removed (`describeAppliedFilters`).

## 8. Verification of the assignment fix

Run through the REAL PostgREST path as the employer (`dev.company@local.test`),
against a project with one `status='active'` assignment:

| # | Query | Result |
|---|---|---|
| A | old shape, `profiles!inner(full_name)` | **0 rows** — the assignment is dropped (the bug) |
| B | new shape, `profiles(full_name)` | **1 row**, with `"profiles": null` |
| C | `GET /profiles?select=id,full_name,email` | **1 row — the employer's OWN profile only** |
| D | `GET /profiles?id=eq.<the assigned worker>` | **0 rows** — still unreadable |

So: the assignment is visible, the profile is not, and RLS was not touched.
`profiles` arrives as `null` because PostgREST applies the policy to the
embedded resource — a left join asks, it does not grant.

**The fallback is now reachable.** With `profiles: null` and this fixture's
`display_name: null`, `readActiveAssignments` resolves
`full_name ?? display_name ?? profile_id.slice(0,8)` to the id prefix **and sets
`hasRealName: false`**, which `deriveWorkerOps` turns into an honest
`missing: ["name"]` signal. Before the fix the whole row vanished and the
manager saw "0 assigned"; now they see the assignment, correctly flagged as
lacking a display name.

**Product note for the owner:** employers will see assigned workers labelled by
id prefix until the worker sets `workers.display_name` — the field that exists
for exactly this purpose. That is the privacy model working, not a defect.
