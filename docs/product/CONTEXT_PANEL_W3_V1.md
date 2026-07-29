# CONTEXT PANEL — W3

| Field | Value |
|---|---|
| Phase | **W3** of the owner's W3–W8 execution plan (2026-07-29) |
| Governing lock | [`WORLD_STATE_UX_ARCHITECTURE_V1`](./WORLD_STATE_UX_ARCHITECTURE_V1.md) — the Context Panel is one of the three workspace parts |
| Baseline | `main @ 5eddebac` |
| Declaration | `apps/web/lib/product-gate/surface-registry.ts` (the registry's first entry) |
| Migrations | **none** |
| Class | **RED by design** — the declaration answers `reflectedOnMap: false`, so the Product Gate reports `PRODUCT_REVIEW_REQUIRED`. See §5. |

---

## 1. What the owner asked for, and what shipped

> W3 — Context Panel: always available · contextual · understands the current
> entity · understands the current task · understands the current conversation ·
> supports inline actions · replaces unnecessary pages · no duplicated navigation.

| Requirement | What shipped | Real? |
|---|---|---|
| always available | The panel is a permanent part of the workspace: the right column from `lg`, a dock under the composer on a phone. It is never empty — with nothing selected it shows the person's own work context. | yes |
| contextual | Two modes, both driven by World State: `work_context` and `entity`. | yes |
| understands the current entity | Selecting an opportunity writes `active_entity`; the panel resolves it through the canonical marketplace use case and shows the demand's real facts, requirements, history and actions. | yes |
| understands the current task | With no selection it renders the Context Intelligence Engine's output over the canonical Time Engine read: what covers today, real conflicts, overdue tasks, the next deadline, and at most two next steps. | yes |
| understands the current conversation | `conversationState.aboutEntity` moves with the selection, so the panel and the conversation can never disagree about the subject. The AI *acting* on that scope is W4. | partly — see §4 |
| supports inline actions | The canonical `WorkerInterestButton`, plus recommendation actions that dispatch into the conversation's existing chip handler. The panel owns no write path. | yes |
| replaces unnecessary pages | Selecting a demand no longer needs `/dashboard/opportunities`. **No route was deleted** — only the `job` entity has a resolver, so the per-domain detail pages are not yet replaceable. | partly — see §4 |
| no duplicated navigation | The panel contains no link, no route and no router. The guard asserts it. | yes |

## 2. The architecture

```
        ┌──────────────── WORLD STATE ────────────────┐
        │  active_entity · context_panel ·            │
        │  conversation_state · active_actions        │   ← W3 writes these
        │  active_filters · ai_goal · map_state       │   ← W4 / W6 write these
        └───────┬─────────────────────────┬───────────┘
                │                         │
        AI Conversation             Context Panel
     (selection + actions)      (entity | work context)
```

| File | What it is |
|---|---|
| `lib/world-state/world-state.ts` | The runtime World State + a pure reducer. Slot names are **imported** from the lock, never restated. The action alphabet is the lock's `AI_OPERATOR_ACTIONS` — there is no action that could navigate. |
| `lib/world-state/entity-context.ts` | The panel's typed payload, one section per `CONTEXT_PANEL_CONTENT` entry, plus the resolver registry. |
| `lib/world-state/job-context-model.ts` | Pure: canonical `OpportunityCard` → panel model. Emits recommendation **codes**, no copy. |
| `lib/world-state/job-context-server.ts` | Localizes that model. Reads **only** through `loadWorkerOpportunityBoard`. |
| `lib/world-state/work-context-server.ts` | The no-selection state, over `buildWorkContext` / `deriveNextBestActions`. |
| `lib/world-state/resolvers.ts` | The registration point. `job` today; a second type is one line. |
| `lib/world-state/context-actions.ts` | The two read entrypoints. |
| `components/app/world-state/world-state-provider.tsx` | The state, mounted. |
| `components/app/world-state/context-panel.tsx` | The panel. Renders; computes nothing. |

## 3. Honesty rules this slice holds

- **Nothing is computed here.** The match, its §19 basis, the matched/missing
  skills and the next action all arrive decided by the canonical engine. No
  score, no percentage, no generated prose, no LLM anywhere in this path.
- **Every recommendation states its basis.** A next step whose reason cannot be
  named would be the fabricated AI doctrine §7 forbids, so `basis` is a required
  field, not an optional one.
- **Unknown reads as unknown.** A fact the company never stated renders "not
  stated" in muted type; an absent capability says which one; a failed read says
  it failed. An empty panel body is never used to mean "there is nothing".
- **Contact stays on-platform.** The panel states that contact happens through
  LabourMarket.ai instead of rendering contact details it must not have.
- **The verified badge keys on a real signal** (`route_status`), never on copy.

## 4. What W3 did NOT do

Recorded so the next phase starts from facts, not from optimism:

- **The map is not in the workspace.** `/dashboard/market-map` is still a
  separate surface. The selection lives in World State so W6 subscribes to it
  rather than rewriting anything.
- **The AI does not yet act on the selection.** Asking "does this company
  provide housing?" about the open entity is W4. W3 only makes the selection a
  shared fact.
- **`active_filters` and `map_state` are typed and unwritten.** W4 and W6 own
  them. The guard pins that claim, so a half-built filter engine cannot appear
  here quietly.
- **No route was retired.** Only `job` resolves, so the per-domain detail pages
  are still the only way to open a person or a project. `WORKSPACE_ASSESSMENT`
  therefore still records `objectClickOpensPage: true` and the verdict stays
  `still_page_based`. Half a workspace is not a workspace.
- **Only the worker side.** A company selecting a candidate needs a `person`
  resolver — a registration, not an architecture change.

## 5. Why this PR is a human gate

The declaration answers **`reflectedOnMap: false`**, because the map is not part
of the workspace until W6. That is the true answer; `true` would be a
fabrication of exactly the kind the four locks exist to catch. It carries an
owner-approved `transitionalWaiver` naming that one field, citing enabling step
**E.7**, and the waiver **expires by itself**: the Product Gate computes E.7's
arrival from the code (`SPATIAL_ENTITY_KINDS` ceasing to be a closed union), so
when W6 ships, the waiver becomes a hard error until it is removed and the
answer becomes a real yes.

The gate therefore reports `PRODUCT_REVIEW_REQUIRED`. That is the constitution
working, not CI breaking.

## 6. Verification

| Check | Result |
|---|---|
| `pnpm -F web typecheck` | 0 errors |
| `pnpm -F web lint` | 0 errors (19 pre-existing warnings) |
| `pnpm -F web test` | **776 files / 12 546 tests** pass |
| `pnpm -F web build` | clean |
| `node .github/scripts/product-gate.mjs --self-test` | 19/19 detectors fire |
| Authenticated E2E, real local stack | `tests/e2e/w3-context-panel.spec.ts` — 3/3 pass |
| Screenshots | `docs/audits/evidence/w3-context-panel/` (desktop light + dark, phone) |

Two defects were found by the verification itself and fixed before this
document was written:

1. the panel's **first paint was an empty body** (the render proof caught it) —
   `loading` now starts true, so it says "reading" instead of implying nothing;
2. the demand's **city was captioned "Country"** (the screenshot caught it) —
   the panel now has its own `fieldLocation` caption in all 11 locales.

Guards: `lib/guards/w3-context-panel.test.ts` (18 assertions) and
`lib/guards/w3-context-panel-render.test.ts` (a real DOM render proof).
