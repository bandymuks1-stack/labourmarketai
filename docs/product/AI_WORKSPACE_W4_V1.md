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
