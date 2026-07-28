# SINGLE WORKSPACE SPECIFICATION V1 — CANONICAL USER EXPERIENCE

| Field | Value |
|---|---|
| Status | **BINDING.** The implementation reference for all future UI work |
| Supersedes | every ad-hoc screen layout; nothing here may be reinterpreted per feature |
| Authority above it | `PLATFORM_DOCTRINE` (technical/legal) → `WORLD_STATE_UX_ARCHITECTURE_V1` → `PRODUCT_UNIVERSE_LOCK_V2` → `PRODUCT_VISION_LOCK_V1` → `PRODUCT_CONSTITUTION` |
| Model it renders | `UNIFIED_WORLD_MODEL_V1` (Entity) + `ENTITY_BEHAVIOR_MODEL_V1` (Behavior) |
| Input inventory | `docs/audits/ux-cleanup-single-workspace-blueprint-v1.md` |
| Contains | No code, no UI change, no PR, no implementation |

---

## 0. THE ONE-SENTENCE SPEC

**There is one workspace at one route; the AI changes World State; every region redraws itself; the user never
navigates.**

Everything in this document is a consequence of that sentence. Where a detail here appears to contradict it,
the sentence wins and the detail is a bug in this document.

### 0.1 Non-negotiable invariants

| # | Invariant | How it is checked |
|---|---|---|
| I-1 | One primary surface. No second dashboard, no module shell | Product Gate `second_dashboard` |
| I-2 | The AI never navigates the user. It writes World State | `AI_MAY_NEVER_CHANGE = page, route, workspace` |
| I-3 | No component writes World State directly except through a declared transition | §8 transition table |
| I-4 | The Context Panel never switches on entity type with bespoke logic | `behaviorsFor(entityType, context)` |
| I-5 | The World Map does not know what kind of thing it draws | `ENTITY_BEHAVIOR_MODEL_V1`, map renders by type |
| I-6 | Popups are forbidden by default (§12) | Product Gate `undeclared_surface` + popup policy |
| I-7 | No unlabeled placeholder data, ever | Doctrine §18 / §7 |
| I-8 | Every label is an i18n key; no inline copy | existing i18n guard |

---

## 1. CORE PRINCIPLES

1. **AI-first, not chat-first and not map-first.** The conversation is the *input method* of an operating
   system, not a feature. The map is the *view*, not a destination.
2. **The workspace is continuous.** Regions appear, expand and fill — they never replace one another.
3. **State is singular.** One `WorldState` object. Every region is a pure function of it.
4. **The AI is the operator.** It sets goals and proposes actions; the human confirms what matters.
5. **Everything is an Entity.** Person, organization, project, job, worksite, document, AI agent — one model,
   one inspector, one map, one timeline.
6. **Behavior is contextual.** What can be done to an entity depends on the entity *and the context*, and is
   resolved from the behavior registry — never from a `switch` on type.

---

## 2. THE ELEVEN REGIONS

Every named region maps onto **exactly one** of the nine World State slots already locked in
`WORLD_STATE_UX_ARCHITECTURE_V1`. **This specification introduces no new state.**

| # | Region | Reads slot | Writes (via transition) | Kind |
|---|---|---|---|---|
| R-1 | **AI Conversation** | `conversation_state`, `ai_goal` | all | fixed |
| R-2 | **World Map** | `map_state`, `selected_entities`, `active_filters` | `active_entity`, `selected_entities` | fixed |
| R-3 | **Context Panel** | `context_panel`, `active_entity` | `active_actions` | collapsible |
| R-4 | **Entity Inspector** | `active_entity` | `active_actions` | **the Context Panel's primary view** — not a second panel |
| R-5 | **Timeline** | `active_entity`, `map_state.timeRange` | `map_state.timeRange` | collapsible |
| R-6 | **Quick Actions** | `active_actions` | executes an action | inline (in R-1 and R-3) |
| R-7 | **Notifications** | `conversation_state.unread` | `active_entity` | Status Area affordance → panel view |
| R-8 | **Global Search** | — | `active_entity`, `active_filters` | command surface (⌘K) |
| R-9 | **Status Area** | `ai_goal`, connection, role | — | fixed |
| R-10 | **Avatar** | `active_avatar` | `active_avatar` | fixed |
| R-11 | **Activity Feed** | `active_entity` | `active_entity` | Context Panel view |

**Three of the eleven are views, not regions** (R-4, R-7, R-11). Making them separate panels would recreate the
multi-surface product this replaces.

---

## 3. DESKTOP LAYOUT

### 3.1 Canonical geometry

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ▸ STATUS AREA (R-9)          [ ⌘K Global Search (R-8) ]        Avatar (R-10) ▾    │ 48px, fixed
├───────────────────────┬──────────────────────────────────────┬───────────────────┤
│                       │                                      │                   │
│  AI CONVERSATION      │           WORLD MAP  (R-2)           │  CONTEXT PANEL    │
│  (R-1)                │                                      │  (R-3)            │
│                       │   entities rendered BY TYPE          │                   │
│  ┌─ history ───────┐  │   clusters · layers · relationships  │  ┌ Inspector ───┐ │
│  │ …               │  │                                      │  │ Entity (R-4) │ │
│  │ AI message      │  │        ○──────○   selected           │  │ Timeline tab │ │
│  │  ▸ Quick Action │  │       ╱                              │  │ Related      │ │
│  │  ▸ Quick Action │  │      ○     ◎ active entity           │  │ Documents    │ │
│  └─────────────────┘  │                                      │  │ Activity(R11)│ │
│  ┌─ composer ──────┐  │                                      │  │ Actions (R-6)│ │
│  │ ▌               │  │                                      │  └──────────────┘ │
│  └─────────────────┘  │                                      │                   │
│                       ├──────────────────────────────────────┤                   │
│                       │  TIMELINE (R-5)  ◀── collapsible ──▶ │                   │
├───────────────────────┴──────────────────────────────────────┴───────────────────┤
│  min 320 / def 420 / max 560       fluid, min 480            min 320 / def 400 / max 560
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Region behaviour

| Region | Fixed | Collapsible | Resizable | Min / Default / Max |
|---|---|---|---|---|
| Status Area | ✅ | ❌ | ❌ | 48px height |
| AI Conversation | ✅ **never fully hidden** | to 56px rail | ✅ drag | 320 / 420 / 560 |
| World Map | ✅ | ❌ (it is the canvas) | — fills remainder | ≥480 |
| Context Panel | ❌ | ✅ to 0 | ✅ drag | 320 / 400 / 560 |
| Timeline | ❌ | ✅ to 32px handle | ✅ vertical | 32 / 140 / 320 |

**The conversation may never be fully hidden.** Collapsing it to a rail keeps the composer reachable in one
keystroke. A layout where the AI is not present is not this product.

Panel sizes persist per user in `context_panel.layout`; they are **presentation**, not World State semantics.

### 3.3 Responsive behaviour

| Width | Layout |
|---|---|
| ≥1440 (`xl`) | Three columns as drawn; Timeline expanded by default |
| 1024–1439 (`lg`) | Three columns; Timeline collapsed to handle; panel default 360 |
| 768–1023 (`md`) | **Two columns**: Conversation + (Map ⇄ Panel toggled by `context_panel.mode`) |
| <768 (`sm`) | Mobile workspace (§4) |

Breakpoints follow existing usage (`sm` 471 uses, `md` 105, `lg` 75) — no new scale is introduced.

### 3.4 Keyboard navigation

The workspace is fully operable without a pointer. **No shortcut opens a page.**

| Keys | Action | Writes |
|---|---|---|
| `⌘K` / `Ctrl K` | Global Search / command finder | `active_entity` or `active_filters` |
| `⌘/` | Focus composer | — |
| `⌥1` `⌥2` `⌥3` | Focus Conversation / Map / Panel | — |
| `[` / `]` | Collapse / expand Conversation / Panel | — |
| `⌘T` | Toggle Timeline | — |
| `↑ ↓ ← →` (map focused) | Move between entities (roving tabindex) | `active_entity` |
| `Enter` | Open focused entity in the Inspector | `active_entity` |
| `Space` | Add/remove from multi-selection | `selected_entities` |
| `⌘Enter` | Confirm the pending action | executes |
| `Esc` | Clear selection → clear filter → collapse panel (in that order) | `selected_entities`, `active_filters` |
| `⌘Z` | Undo last reversible action | inverse transition |

`Esc` never "closes a dialog", because there are no dialogs.

### 3.5 Accessibility (binding)

- **Landmarks:** `<main>` = Map, `<aside aria-label="conversation">`, `<aside aria-label="context">`,
  `<header>` = Status Area. Exactly four landmarks; screen-reader users get a stable mental model.
- **Live regions:** AI messages `aria-live="polite"`; action results `aria-live="assertive"` only when they
  changed the world.
- **Focus:** never trapped — no modals means no traps. Region focus is restored on collapse/expand.
- **Map:** every entity is a `role="button"` in a roving-tabindex grid with a text alternative
  (`name · type · status`), so the map is usable without sight of it. The map is **not** the only path to any
  action — the same entity is always reachable from Search and the Conversation.
- **Motion:** all transitions honour `prefers-reduced-motion` (already handled in `globals.css`); reduced
  motion means *instant*, never *broken*.
- **Targets:** ≥44×44 CSS px for anything clickable, including map nodes at default zoom.
- **Contrast:** ≥4.5:1 text, ≥3:1 for entity fills against the map surface.

---

## 4. MOBILE WORKSPACE (<768px)

### 4.1 Geometry

```
┌─────────────────────────────┐   The SAME workspace, one region at a time.
│ Status (R-9)   ⌘K   Avatar  │   State is shared; only presentation changes.
├─────────────────────────────┤
│                             │
│      ACTIVE REGION          │   Conversation (default) │ Map │ Panel
│                             │
│                             │
├─────────────────────────────┤
│   ▁▁▁ Context Panel peek ▁▁▁│  ← MobileSheet, 3 detents: peek 88px / half / full
├─────────────────────────────┤
│  [ 💬 Chat ] [ 🗺 Map ] [ ▤ ]│  bottom bar, 3 MODES — not 4 destinations
└─────────────────────────────┘
```

### 4.2 Rules

| Concern | Rule |
|---|---|
| **Bottom navigation** | Exactly **three modes**: Chat · Map · Panel. They switch *presentation*, never route. The URL does not change |
| **Panel behaviour** | Reuses the existing `MobileSheet`. Three detents: peek (88px, shows entity name + primary action), half, full. Peek is always visible when an entity is active |
| **Conversation** | Default mode on open. Composer docked above the bottom bar; keyboard push resizes, never covers |
| **Map** | Full-bleed. Tap = select (peek rises). Long-press = multi-select. Pinch = zoom; the map never navigates |
| **Context switching** | Switching modes **preserves** scroll position, selection and draft text. Returning to Chat shows the same thread with the AI's latest turn |
| **Timeline** | A horizontal strip inside the Panel view on mobile — never a fourth mode |
| **Notifications** | A badge on the Status Area; opening pushes the Panel to `notifications` view |

Mobile has **no** feature that desktop lacks, and loses **no** capability — only simultaneity.

---

## 5. ENTITY INTERACTION

Every interaction below is a **World State transition**. No interaction navigates.

| # | User does | State delta | Regions that redraw | Notes |
|---|---|---|---|---|
| E-1 | **Click an entity** | `active_entity = id` | Panel (Inspector), Map (highlight), Timeline | Single source of "what am I looking at" |
| E-2 | **Double-click** | `active_entity = id`, `map_state.focus = id`, `context_panel.expanded = true` | Map (zoom-to-fit), Panel (full) | A shortcut for *focus*, never a new window |
| E-3 | **Open details** | `context_panel.view = "inspector"`, `context_panel.expanded = true` | Panel | Identical result to E-1 + expand. There is no detail *page* |
| E-4 | **Ask the AI about it** | `ai_goal = {verb: "explain", entity: id}` | Conversation (AI turn), Panel (may highlight) | The entity is passed as context automatically; the user never re-states it |
| E-5 | **Change filters** | `active_filters[dim] = value` | Map (re-query), Panel (counts), Timeline (range) | **No Apply button** — forbidden by the lock (`FORBIDDEN_COMMIT_CONTROLS`) |
| E-6 | **Change country** | `active_filters.location = country` | Map (fit bounds), Panel, Conversation (AI acknowledges) | Same mechanism as any other filter dimension |
| E-7 | **Change salary** | `active_filters.salary = range` | Map (entities fade in/out), Panel (counts) | Filters are *dimensions*, already enumerated in `KNOWN_WORLD_STATE_DIMENSIONS` |
| E-8 | **Change timeline** | `map_state.timeRange = range` | Timeline, Map (temporal filter), Panel (history window) | Time is a filter over the same entities, not a different screen |
| E-9 | **Change project** | `active_entity = projectId`, `active_filters.project = projectId` | all four | "Switching project" is selecting an entity — not switching workspace |

**The rule that makes this coherent:** the user never *opens* anything. They *select*, *filter* or *ask*, and
the workspace redraws.

---

## 6. AI INTERACTION

### 6.1 The six AI acts

| Act | What the AI may do | What it may never do |
|---|---|---|
| **Ask a question** | Add a turn; propose typed answer chips | Block the UI |
| **Propose an action** | Emit `active_actions[]` from the registry | Invent an action not in the registry |
| **Perform an action** | Execute after tier-appropriate confirmation | Execute `strong_irreversible` without explicit confirm |
| **Wait for confirmation** | Show an inline confirm affordance | Open a modal |
| **Update World State** | Write any slot | Change page, route or workspace |
| **Report a result** | Add a turn + update regions | Report an unmeasured value as zero (A-12) |

### 6.2 Confirmation policy — ONE mechanism

The four mechanisms found in the audit collapse to one: **inline two-step confirmation**, tiered by the
registry's existing `ConfirmationTier`.

| Tier | Rendering | Undo |
|---|---|---|
| `read` | none — runs immediately, result card | n/a |
| `reversible_write` | runs immediately; result card carries **Undo** | `⌘Z`, 30s |
| `important_write` | inline confirm row in the conversation; `⌘Enter` confirms | Undo where the entrypoint allows |
| `strong_irreversible` | inline confirm row **plus** typed/explicit affirmation, and the consequence stated in words | none — say so before, not after |

`window.confirm()` is **forbidden**. Blocking modals are **forbidden**.

---

## 7. WORLD STATE

### 7.1 The shape (the nine locked slots — no additions)

```
WorldState {
  active_avatar      : EntityId            // who is acting
  active_entity      : EntityId | null     // what is being looked at
  selected_entities  : EntityId[]          // multi-selection
  active_filters     : { [dimension]: value }
  ai_goal            : { verb, entity?, params? } | null
  context_panel      : { view, expanded, layout }
  map_state          : { center, zoom, layers[], timeRange, focus }
  conversation_state : { thread, pending, unread }
  active_actions     : ActionProposal[]    // ids from the action registry only
}
```

### 7.2 Transition law

```
        ┌──────────┐  intent   ┌──────────────┐  proposal  ┌───────────────┐
 USER ─►│  REGION  │──────────►│      AI      │───────────►│ WORLD STATE   │
        └──────────┘           └──────────────┘            └───────┬───────┘
             ▲                                                     │ single broadcast
             │                                                     ▼
             │                        ┌────────────┬────────────┬────────────┐
             └────────────────────────┤ CONVERSAT. │  MAP       │  PANEL     │  TIMELINE
                        re-render     └────────────┴────────────┴────────────┘
```

Three laws:
1. **Single writer per transition.** A transition is an atomic delta; two regions never write the same slot in
   one frame.
2. **No region reads another region.** They read World State only.
3. **Every transition is named and enumerable** (the tables in §5, §6 and §7.4). An unnamed state change is a
   defect.

### 7.3 Sequence — AI proposes, human confirms, world changes

```mermaid
sequenceDiagram
    participant U as User
    participant C as Conversation
    participant AI as AI Orchestrator
    participant WS as World State
    participant R as Map / Panel / Timeline

    U->>C: "book Jonas for the Vilnius site next week"
    C->>AI: intent + active_entity + active_filters
    AI->>WS: ai_goal = {verb:"book", entity:"person:jonas"}
    WS-->>R: redraw (Jonas highlighted, site focused)
    AI->>WS: active_actions = [worker.propose-booking]  %% id from the registry
    WS-->>C: render inline confirm (important_write)
    U->>C: ⌘Enter
    C->>AI: confirm(actionId, token)
    AI->>AI: server re-checks role + preconditions + token
    AI->>WS: apply result → active_entity, timeline event, panel view
    WS-->>R: single broadcast; all regions redraw
    AI->>C: result card + Undo affordance
```

### 7.4 Every transition (canonical list)

| Transition | Trigger | Slots written | Reversible |
|---|---|---|---|
| `SELECT_ENTITY` | click / Enter / search / AI | `active_entity` | ✅ |
| `MULTI_SELECT` | Space / long-press / lasso | `selected_entities` | ✅ |
| `FOCUS_ENTITY` | double-click / AI focus | `map_state.focus`, `context_panel.expanded` | ✅ |
| `SET_FILTER` | filter control / AI / search | `active_filters[dim]` | ✅ |
| `CLEAR_FILTERS` | Esc / AI | `active_filters` | ✅ |
| `SET_TIME_RANGE` | Timeline drag / AI | `map_state.timeRange` | ✅ |
| `SET_AI_GOAL` | user message / AI plan | `ai_goal` | ✅ |
| `PROPOSE_ACTIONS` | AI | `active_actions` | ✅ |
| `EXECUTE_ACTION` | confirm | domain write + `conversation_state`, entity slots | tier-dependent |
| `SET_PANEL_VIEW` | tab / AI / notification | `context_panel.view` | ✅ |
| `TOGGLE_REGION` | keyboard / drag | `context_panel.expanded`, layout | ✅ |
| `SWITCH_AVATAR` | avatar menu | `active_avatar`, clears `active_entity` | ✅ |
| `RECEIVE_EVENT` | server push | `conversation_state.unread`, timeline | n/a |

---

## 8. CONTEXT PANEL — specification

### 8.1 Views (7 — replacing 24 screens)

| View | Shows | Source |
|---|---|---|
| **Inspector** (default) | the active entity | common entity attributes + bound behaviors |
| **Agenda** | what needs doing now | merged inbox/tasks/activity |
| **Journal** | the world's history as written by people | journal entries |
| **Conversation** | message threads about the entity | conversations |
| **Insights** | AI observations, trust, learning | read-only |
| **Reports** | rendered history / evidence | derived |
| **Settings** | account, privacy, preferences | not work — kept out of the work surface |

### 8.2 Inspector sections (fixed order, all optional-by-emptiness)

```
┌ Entity header ─────────────────────────────┐
│ [avatar/icon]  Name            status chip │  ← name, status
│ type · location · owner                    │  ← entity_type, location, owner
├ Quick Actions (R-6) ───────────────────────┤  ← behaviorsFor(type, context)
│ [ primary ] [ secondary ] [ ⋯ ]            │
├ Timeline (R-5, compact) ───────────────────┤  ← timeline
├ Related entities ──────────────────────────┤  ← relationships (predicate-grouped)
│  employs → 12 · works_on → 3 · located_at  │
├ Documents & media ─────────────────────────┤  ← documents, media
├ Activity feed (R-11) ──────────────────────┤  ← history
└ Extensions ────────────────────────────────┘  ← extensions (type-specific, DECLARED not coded)
```

**Sections render from the entity's common attributes.** A new entity type adds **no** section and **no**
branch: unknown/empty attributes simply do not render. This is invariant I-4, made concrete.

### 8.3 Panel rules

| Concern | Rule |
|---|---|
| Tabs | The 7 views, as a single row; overflow into `⌥` menu. Tab state lives in `context_panel.view` |
| Expand/collapse | Three states: hidden (0), default (400), expanded (560). Never a separate window |
| History | Panel keeps a **back stack of `active_entity`** (max 20). `⌘[` goes back — this is *entity* history, not browser history |
| Related entities | Grouped by relationship **predicate**, each row selects that entity (E-1). Traversal never leaves the workspace |
| Documents | Inline preview; download is an action, not a page |
| Actions | Only ids present in `active_actions`; disabled actions state **why** (unmet precondition), never silently hide |
| Timeline | Compact strip; clicking an event sets `map_state.timeRange` around it |

---

## 9. WORLD MAP — specification

| Concern | Rule |
|---|---|
| **Entity rendering** | One contract for all types: position, type glyph, status ring, label. The renderer receives `entity_type` as **data** and looks up a registered visual — it must never `switch` on type (this is `E.7`/`B.6`) |
| **Selection** | Click = `SELECT_ENTITY`. The active entity gets a persistent ring; hover is preview-only and writes nothing |
| **Multi-selection** | Space / long-press / lasso → `selected_entities`. The Panel switches to a comparison summary; actions apply to the set when the behavior allows it |
| **Clustering** | Automatic by density and zoom. A cluster is itself selectable and shows a type breakdown; it never hides an entity without saying how many |
| **Layers** | Toggleable, in `map_state.layers`: entities · relationships · territories · demand heat · time. Layers are declarative registrations, not code branches |
| **Filters** | The map renders `active_filters` continuously. Filtered-out entities **fade**, they do not vanish, so the user sees the effect of their filter |
| **Routing** | Geographic routing between entities (worker → worksite) is a **layer**, drawn from `entity_relationships` — not a separate feature |
| **Relationship visualization** | Edges drawn per predicate with a legend; edge density is capped per zoom with an honest "+N more" |
| **Empty result** | Says what was filtered out and offers to relax the narrowest dimension. Never an empty canvas with no explanation |

---

## 10. TIMELINE — specification

One component, four sources, all of them entity history.

| Source | Rendered as | Origin |
|---|---|---|
| Entity history | dots on the entity's lane | `history` attribute |
| Project history | phases as bars | project entity timeline |
| Organization history | engagements as bands | organization entity timeline |
| **AI actions** | distinct marker, always attributable | action ledger |
| Notifications | small ticks | events |
| Documents | paperclip markers at their moment | `documents` |

Rules: the timeline is a **filter over the same entities** (`map_state.timeRange`), never a separate dataset;
AI-performed actions are visually distinguishable from human ones — the user must always be able to see what
the AI did; the future is rendered but visually distinct from the past.

---

## 11. QUICK ACTIONS · NOTIFICATIONS · SEARCH · STATUS · AVATAR

| Region | Specification |
|---|---|
| **Quick Actions (R-6)** | Chips rendered from `active_actions`, which come **only** from the action registry. Max 3 primary + overflow. Each carries its confirmation tier. Appear in the conversation (proposed by AI) and in the Inspector (available on the entity) — the same list, two placements |
| **Notifications (R-7)** | A badge in the Status Area. Opening sets `context_panel.view = "notifications"`. **Never a popover that steals focus.** Nothing notifies twice |
| **Global Search (R-8)** | `⌘K`. Searches **entities**, not pages — results are entities, actions and filters. Selecting an entity performs `SELECT_ENTITY`; selecting a filter performs `SET_FILTER`. The existing `command-finder` is the seed |
| **Status Area (R-9)** | Left: what the AI is doing right now (`ai_goal` in words, with a live indicator) and connection state. It is the honest answer to "is something happening?" |
| **Avatar (R-10)** | Identity + role context. Switching avatar is `SWITCH_AVATAR` and **clears `active_entity`** — you cannot look at another persona's active object by accident. Roles are shown as *roles*, never as separate apps |

---

## 12. POPUP POLICY (final)

> **The default answer is NO.**

A popup, modal, dialog, drawer-over-content or alert may exist **only** if it passes all four tests, in
writing, in the surface declaration:

| # | Test |
|---|---|
| T-1 | It cannot be a **Context Panel view** — because it is not about the active entity |
| T-2 | It cannot be an **inline component** — because it does not belong beside its trigger |
| T-3 | It cannot be an **AI conversation turn** — because a question in words would lose information |
| T-4 | It cannot be a **World State transition** — because nothing about the world changed |

Failing any test ⇒ it is not a popup, it is one of the four things above.

**The permitted list (exhaustive):**

| Allowed | Why it passes |
|---|---|
| `MobileSheet` | Infrastructure — the mobile presentation of the Context Panel, not a surface |
| Language feedback widget | Meta-feedback about the product itself, not about the world |
| OS-level surfaces (file picker, permission prompt, print) | Not ours to render |

Everything else found in the audit — global search overlay, notification panel, batch confirm, journal edit
launcher, opportunity compare, and all 3 `window.confirm` sites — becomes a panel view, an inline component or
a conversation turn. **`window.confirm` / `alert` are banned outright.**

---

## 13. DESIGN SYSTEM

### 13.1 Spacing

4px base (Tailwind scale). Only these steps: **4 · 8 · 12 · 16 · 24 · 32 · 48**. Region gutters 16;
section padding 16; item rhythm 8. Anything else needs a reason in review.

### 13.2 Component hierarchy

```
PRIMITIVES   Button · Input · Select · Badge · Card · Avatar · LiveDot · MobileSheet   (exists)
    ▲ never know about World State
COMPOSITES   EntityHeader · ActionChipRow · RelationshipList · TimelineStrip · EventRow
    ▲ pure props
VIEWS        Inspector · Agenda · Journal · Conversation · Insights · Reports · Settings
    ▲ read World State, dispatch transitions
REGIONS      Conversation · Map · ContextPanel · Timeline · StatusArea
    ▲ layout only
WORKSPACE    the single shell
```

A primitive that imports World State is a defect. A region that contains domain logic is a defect.

### 13.3 Interaction rules

| Rule | Detail |
|---|---|
| One primary action per view | Everything else is secondary or overflow |
| Hover previews, click commits | Hover **never** writes state |
| No Apply / Search / Go buttons | The world reacts continuously (`FORBIDDEN_COMMIT_CONTROLS`) |
| Destructive actions state the consequence before, not after | And are never the default focus |
| Every disabled control explains itself | Unmet precondition, named |

### 13.4 Animation

Use the existing motion tokens: `--motion-instant` · `--motion-fast` · `--motion-base` · `--motion-slow`,
easing `--motion-ease-out` / `--motion-ease-spring`.

| Purpose | Token | Note |
|---|---|---|
| State echo (selection, filter) | `fast` | The user must *see* that their input landed |
| Region resize / collapse | `base` | Motion explains where things went |
| Map fit / zoom | `base`, ease-out | Never spring on spatial data — it reads as instability |
| Entering data | `instant` | Data never animates in; only *chrome* animates |

`prefers-reduced-motion` ⇒ every duration becomes `instant`. Nothing loses meaning without motion.

### 13.5 Loading · error · empty

| State | Rule |
|---|---|
| **Loading** | Skeletons **in place**, preserving final geometry. No spinner that blocks a region; the workspace never goes blank. The Status Area says what is loading |
| **Error** | Inline, at the thing that failed, in plain language, with the retry that actually helps. Never a toast that disappears before it is read. Never "something went wrong" alone |
| **Empty** | Explain *why* it is empty (usually a filter), and offer the one action that helps. **Never fabricated sample data** — doctrine §18/§7. A `preview`/`concept` marker is required if anything non-live is shown |
| **Partial / unmeasured** | Show it as unmeasured, never as zero (A-12) |

---

## 14. IMPLEMENTATION ROADMAP

Each phase is **independently deployable**, **reduces technical debt**, and is behind the existing gates.
Phases map to `U.*` in the UX blueprint.

| Phase | Contains | Debt removed | Needs new architecture? | Gate |
|---|---|---|---|---|
| **W1 — Subtract** | U.0 delete 14 dead routes; U.1 one confirmation mechanism | −14 routes, −3 `window.confirm`, −2 modals | **No** | no declaration needed (removals) |
| **W2 — Merge duplicates** | U.2 identity (cv→profile); U.3 onboarding (4→conversation) | −5 routes, −2 duplicate editors of one object | **No** | declarations for the survivors |
| **W3 — Panel shell** | U.4 Context Panel + Inspector (type-driven), R-6/R-7/R-11 as views | replaces the notion of "detail page" | **Yes — the first real build** | declaration + `transitionalWaiver` (readiness only) |
| **W4 — Panel views** | U.5 Agenda (5→1); U.6 Journal/Conversation/Insights/Reports/Settings | −19 routes | No (rides W3) | declarations |
| **W5 — Map platform** | U.7 = `E.7` = `B.6`: render entities by type, one contract | kills the closed 3-kind union + per-type rendering | **Yes — the largest build** | declaration; **waiver expires here automatically** |
| **W6 — Map views** | U.8 move 7 (+3 merged) discovery screens onto the map | −10 routes | No | declarations |
| **W7 — AI stops navigating** | U.9 `advancedRoute` optional; last 9 deep links inline | removes the AI's page-choosing | No | — |
| **W8 — One shell** | U.10 remove `/dashboard/advanced` + the second nav system | −1 nav system, −25 module routes | No | — |
| **W9 — One address** | U.11 `/entity/[id]`; retire per-type detail routes | finishes the Unified World Model | Yes | declaration |

**Ordering rule:** W1 and W2 can start today and need nothing from the locks stack. W3 and W5 are the only
genuine builds; everything after W5 is mostly deletion. **The transitional waiver introduced in the locks
stack exists exactly for W3→W5 and expires by itself when W5 lands.**

### 14.1 Definition of done for the workspace

- one route renders the workspace;
- `router.push` / `redirect` survive **only** outside it (auth, public, invite);
- zero blocking dialogs in the product surface;
- the Context Panel renders an entity type it has never seen, with no code change;
- the World Map renders a newly registered entity type, with no code change;
- every action the AI offers executes **inside** the workspace.

---

*Specification only. No code was written, no UI was modified, no PR was created, nothing was implemented.*
