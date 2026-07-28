# UX CLEANUP & SINGLE WORKSPACE — PHASE 1 AUDIT + IMPLEMENTATION BLUEPRINT

| Field | Value |
|---|---|
| Status | **Audit + blueprint only.** No code changed, no UI changed, no PR, no migration |
| Measured against | `main` @ `ac31db60`, 2026-07-28 |
| Authority | `WORLD_STATE_UX_ARCHITECTURE_V1` (AI-first) · `UNIFIED_WORLD_MODEL_V1` · `ENTITY_BEHAVIOR_MODEL_V1` · `PRODUCT_CONSTITUTION` |
| Goal | One continuous workspace: **AI Conversation + World Map + Context Panel**, instead of navigating pages |

## What was actually measured

Every number below is counted from the codebase, not estimated.

| Measure | Count |
|---|---|
| Screens (`page.tsx` under `app/[locale]`) | **118** |
| — dashboard screens | **79** (22 admin, 57 product) |
| — marketing / public | 27 |
| — auth · onboarding · cv · business · invite · catch-all | 9 |
| — dev-only (`/design/*`) | 3 |
| Dialog / modal components | **8** |
| Native blocking `window.confirm()` call sites | **3** |
| Inline two-step confirm widgets | **11** |
| Components containing a `<form>` / `onSubmit` | **53** (+12 in pages) |
| `router.push()` / `redirect()` call sites | **61** |
| Redirect-only alias pages | **7** |
| Advanced modules in the module registry | **25** |
| Core nav destinations | **4** (chat → journal → planning → messages) |
| Product dashboard routes in **no** nav and **no** registry | **27** |
| Routes with **zero** inbound links anywhere | **3** |
| Context Panel components today | **0 — it does not exist** |
| World Map entity kinds | **3, a closed union** |

**Two facts frame everything below.** The Context Panel **does not exist yet**, and the World Map is a closed
3-kind union that cannot render a fourth thing without an architecture change (`E.7` / `B.6`). So this blueprint
is ordered to make the *enabling* work come first; everything else is sequenced behind it.

---

## 1. FULL UX INVENTORY — the verdict in one table

Every screen gets **exactly one** verdict. The partition was verified mechanically: 118 routes in, 118 out,
zero double-classified.

| Verdict | All screens | Of the 57 **product dashboard** screens |
|---|---|---|
| **REMOVE** | 14 | 11 |
| **MERGE** | 16 | 14 |
| **MOVE TO CONTEXT PANEL** | 24 | 24 |
| **MOVE TO WORLD MAP** | 7 | 7 |
| **SIMPLIFY** | 6 | 0 |
| **KEEP** | 51 | **1** |
| | **118** | **57** |

The 51 KEEPs are almost entirely **outside the workspace by definition**: 27 marketing screens, 21 admin
sub-screens, 2 password-recovery screens - and `/dashboard` itself.

**The headline: 57 product dashboard screens become 1 workspace** (plus 7 panel views and 1 map layer).

---

## 2. NAVIGATION GRAPH — today

```
                     ┌──────────────────────────── PUBLIC (27) ───────────────┐
                     │ (marketing)/* → pricing, professions, questions/*, …   │
                     └───────────────┬───────────────────────────────────────┘
                                     │ signup / login (4 auth screens)
                                     ▼
                          /onboarding ──► /dashboard/start ──► start/company
                                     │                    ├──► start/buyer
                                     │                    └──► start/agency (alias)
                                     ▼
                    ┌────────────────────────────────────────────┐
                    │  /dashboard   (chat-first root, PR #864)   │  ◄── the only AI surface
                    └───────┬───────────────────────┬────────────┘
                            │ CORE NAV (4)          │ "Advanced" escape hatch
              ┌─────────────┼─────────┬─────────┐   ▼
              ▼             ▼         ▼         ▼   /dashboard/advanced ──► 25 MODULES
          journal       planning  communication │       ├── opportunities, tasks, bookings
              │                                 │       ├── projects → [id] → operations
              └── journal/voice (0 inbound)     │       ├── company → planning, scouting, projects/new
                                                │       ├── documents, assets, absences, finance
                                                │       ├── services, service-requests, listings
                                                │       ├── network, market-map, intelligence
                                                │       └── reports → evidence
                                                │
                                          27 ROUTES REACHABLE FROM NOWHERE
                                          (no nav, no registry): advanced, buyer,
                                          candidates, gallery, inbox/*, instructions,
                                          learning, market/recognize, privacy,
                                          player-card, start/*, talent, visual-os/*, …
```

**What the graph shows.** There is one AI surface and **two competing navigation systems** behind it
(core nav + the Advanced module registry), plus a third population of 27 screens that belong to neither.
The deepest legitimate chain is **5 levels**: `/dashboard → advanced → projects → [id] → operations`.
The action registry then adds a *fourth* way in: 30 conversation actions, each with a required
`advancedRoute`, 9 of which still execute as a deep link — the AI itself navigates the user to a page.

---

## 3. POPUP INVENTORY

"Popup" = transient, non-blocking overlay.

| # | Component | What it does | Verdict | Justification |
|---|---|---|---|---|
| P-1 | `header-search.tsx` | Global search overlay | **MERGE** into the AI composer | The conversation *is* the search box. A separate search overlay is the "separate Search screen" the world-state lock forbids |
| P-2 | `notification-panel.tsx` | Notification list overlay | **MOVE TO CONTEXT PANEL** | Notifications are world-state changes; the panel is where state lives. Nothing here needs to interrupt |
| P-3 | `language-feedback-widget.tsx` | Report a translation issue | **KEEP** | Meta-feedback about the product, not work. Correctly peripheral and rarely opened |
| P-4 | `opportunity-compare.tsx` | Compare opportunities side by side | **MOVE TO WORLD MAP** | Comparing opportunities is inherently spatial + attribute-based; it is a map selection with a comparison view, not an overlay |
| P-5 | `MobileSheet.tsx` | Generic mobile bottom sheet | **KEEP (infrastructure)** | Not a surface — the responsive container the Context Panel will reuse on small screens |
| P-6 | `waitlist-modal.tsx` | Marketing waitlist capture | **KEEP** | Public funnel, outside the workspace |

## 4. MODAL INVENTORY (blocking) + CONFIRMATION AUDIT

| # | Component / site | Verdict | Justification |
|---|---|---|---|
| M-1 | `journal-entry-edit-launcher.tsx` (+ `window.confirm` discard) | **SIMPLIFY** | Editing a journal entry is inline editing of an entity. Blocking modal + a second native "discard?" prompt = **two** interruptions for one edit |
| M-2 | `quick-confirm-batch.tsx` | **MOVE TO CONTEXT PANEL** | Batch confirmation is agenda work. It belongs in the panel beside the conversation, not on top of it |
| M-3 | `journal-entry-row.tsx` — `window.confirm(deleteConfirm)` | **SIMPLIFY** | Native blocking dialog. Replace with the inline two-step pattern already used in 11 components |
| M-4 | `worker-trade-profile.tsx` — `window.confirm(removeConfirm)` | **SIMPLIFY** | Same defect, same fix |
| M-5 | 11 inline two-step confirm widgets | **KEEP as the standard** | This is already the right pattern: reversible, non-blocking, in place. It should become **the only** confirmation mechanism |

**The duplicate-confirmation finding.** Three mechanisms coexist for one job: native `window.confirm` (3 sites),
custom modals (2), and inline two-step (11). The action registry adds a **fourth** — a four-level
`ConfirmationTier` (`read` / `reversible_write` / `important_write` / `strong_irreversible`). Two of these
must go. **Keep**: the registry's tier as the *policy*, the inline two-step as the *only rendering*.

---

## 5. PAGE INVENTORY — all 118 screens classified

### 5.1 The workspace root — KEEP (1)

| Route | Verdict | Justification |
|---|---|---|
| `/dashboard` | **KEEP — this is the workspace** | Already chat-first (PR #864). It becomes the single workspace shell that hosts Conversation + Map + Panel |

### 5.2 REMOVE (14)

| Route | Verdict | Justification |
|---|---|---|
| `/dashboard/gallery` | **REMOVE** | **0 inbound links anywhere.** Photo viewing belongs to the entity that owns the photos |
| `/dashboard/journal/voice` | **REMOVE** | **0 inbound links.** Voice is an input mode of the composer, never a destination |
| `/dashboard/assistant` | **REMOVE** | Redirect-only alias with **0 inbound links**. `/dashboard` is the assistant |
| `/dashboard/marketplace` | **REMOVE** | Redirect-only alias; the map is the marketplace |
| `/dashboard/player-card` | **REMOVE** | Redirect-only alias → profile. One entity, one view |
| `/dashboard/agency`, `/dashboard/agency/pool` | **REMOVE** (2) | Redirect-only aliases. An agency is an organization **role**, not a section (`ORGANIZATION_ROLE_ORCHESTRATION_V1`) |
| `/dashboard/commercial` | **REMOVE** | Redirect-only alias |
| `/dashboard/start/agency` | **REMOVE** | Redirect-only alias |
| `/dashboard/visual-os`, `/dashboard/visual-os/agency` | **REMOVE** (2) | A second primary surface — audit finding PC-01, and A-01's exact prohibition. Superadmin-gated, so removal costs no user anything |
| `/design/conversation`, `/design/text-first`, `/design` | **REMOVE from the product** (3) | Dev-only preview routes shipped in the app. Move to Storybook/dev-only or delete |

### 5.3 MERGE (16) — absorbed into a surviving surface

| Absorbed route(s) | Survivor | Justification |
|---|---|---|
| `/cv` | `/dashboard/profile` → Person view | Two surfaces edit the **same worker object**; `PLAYER_CARD_MINIMUM_CONTRACT` already defines one contract for it (`player-card` is a redirect alias → REMOVE) |
| `/dashboard/start`, `start/company`, `start/buyer`, `/onboarding` (4) | the conversation | Four setup surfaces asking what the AI can ask in dialogue. A-04: a wizard is a conversation that forgot it could talk |
| `inbox/quick`, `inbox/report`, `tasks`, `activity` (4) | `/dashboard/inbox` → Agenda | Four queues for one backlog; tasks and activity are the same list at two time offsets |
| `company/planning` | `/dashboard/planning` | Same function split by actor type — the exact special-case-per-type the behavior lock forbids |
| `projects/[id]/operations` | `projects/[id]` | A tab of an entity, not a route level. Removes the deepest chain in the product |
| `company/projects/new` | the conversation | A creation form the AI can drive |
| `/dashboard/advanced` | the workspace | The "escape hatch" **is** the second navigation system; its 25 modules become panel/map views |
| `/dashboard/candidates` | `/dashboard/talent` → map | Two people-search screens over one query |
| `/dashboard/services`, `/dashboard/listings` (2) | `/dashboard/service-requests` → map | Three list pages over one marketplace |

### 5.4 MOVE TO CONTEXT PANEL (24)

The Context Panel shows **the active entity and what can be done to it now**. Everything here is an entity
detail view or an agenda — never a place you "go".

| Routes | Panel view | Justification |
|---|---|---|
| `/dashboard/profile` (merged), `/dashboard/people/[workerId]` | **Person** | The AI opens an *Entity*, never a Worker screen (`UNIFIED_WORLD_MODEL_V1` E.8) |
| `/dashboard/projects`, `/dashboard/projects/[id]` | **Project** | Same |
| `/dashboard/company` | **Organization** | Same |
| `/dashboard/bookings`, `/dashboard/opportunities` | **Engagement** | Both are states of one relationship between person and demand |
| `/dashboard/documents`, `/dashboard/assets` | **Document / Object** | Entity attachments (`documents`, `media` are common entity attributes) |
| `/dashboard/absences`, `/dashboard/finance` | **Person / Organization timeline** | Time and money are entity `timeline` facts |
| `/dashboard/journal` | **Journal (pinned panel view)** | The journal is the world's history; it stays first-class but is a panel, not a page |
| `/dashboard/communication`, `communication/[conversationId]` | **Conversation** | Messages already are the conversation — a second messaging screen next to the AI chat is duplication |
| `/dashboard/instructions` | **Person/Project instruction thread** | An instruction is a message about an entity |
| `/dashboard/tasks`, `/dashboard/activity`, `/dashboard/inbox*` (merged) | **Agenda** | The one work queue |
| `/dashboard/learning`, `/dashboard/intelligence`, `/dashboard/assist` | **Insight strip** | Read-only insights about the active entity; they have no reason to be destinations |
| `/dashboard/reports`, `/dashboard/reports/evidence` | **Reports view** | A rendering of entity history |
| `/dashboard/account`, `/dashboard/privacy` | **Settings drawer** | Settings, not work. Keep reachable, remove from the work surface |

### 5.5 MOVE TO WORLD MAP (7)

The World Map shows **entities in space and their relationships** — and, per the lock, must not know
*what kind* of thing it is drawing.

| Route | Justification |
|---|---|
| `/dashboard/market-map` | **This becomes the workspace's map layer itself**, not a destination |
| `/dashboard/network` | Relationships between entities = the map's edges |
| `/dashboard/talent` | People in space, filtered by demand (`candidates` merges in first — two screens, one query) |
| `/dashboard/service-requests` | Supply and demand as map objects (`services` + `listings` merge in first — three list pages over one marketplace) |
| `/dashboard/company/scouting` | Search for people = a map query with filters |
| `/dashboard/buyer` | A role-scoped view of the same market |
| `/dashboard/market/recognize` | Recognition of a demand in the market = a map interaction |

### 5.6 SIMPLIFY (6)

| Route | Justification |
|---|---|
| `/dashboard/admin` (hub) | Keep the console, flatten the 21 sub-routes behind one searchable index |
| `/business/[slug]` | Public entity profile — keep, but render from the same Entity view as the panel |
| `/invite/[token]` | Keep; strip to a single accept action, no intermediate screens |
| `/auth/login`, `/auth/signup` | Keep; the 2-step confirm widgets here should use the standard inline pattern |
| `/[...rest]` | Catch-all — ensure it routes into the workspace, not a dead end |

### 5.7 KEEP unchanged (51)

- **27 marketing screens** — public funnel, deliberately page-based, outside the workspace. SEO and legal
  pages must remain independently addressable.
- **2 password-recovery screens** — pre-workspace (`login` / `signup` are SIMPLIFY).
- **21 admin sub-screens** — an **operator console**, not the user's world. The AI-first rules govern the product
  surface; internal tooling is explicitly out of scope and stays page-based.
- `/dashboard` — the workspace itself.

> The admin **hub** is counted under SIMPLIFY, so it is excluded from this 51.

---

## 6. CONTEXT PANEL — the specification this implies

The panel is **one component with N entity views**, not N screens.

```
┌─ WORKSPACE ─────────────────────────────────────────────────────────┐
│  ┌────────────────────────┐  ┌──────────────────────────────────┐  │
│  │   AI CONVERSATION      │  │          WORLD MAP               │  │
│  │   (the only input)     │  │   entities, drawn BY TYPE        │  │
│  │                        │  │                                  │  │
│  ├────────────────────────┤  ├──────────────────────────────────┤  │
│  │                    CONTEXT PANEL                              │  │
│  │  active entity · its timeline · its relationships ·           │  │
│  │  the actions available NOW · the agenda                       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
     ▲ the AI changes World State; all three redraw. No navigation.
```

**Panel views required (7, replacing 24 screens):** Entity (person / organization / project / document —
*one* view driven by `entity_type`), Agenda, Journal, Conversation, Insights, Reports, Settings.

**Hard rule from the locks:** the panel must not switch on entity type with bespoke logic — it renders the
**common entity attributes** and the **behaviors bound** to that entity in the current context
(`behaviorsFor(entityType, context)`). A new entity type must need **no panel change**.

## 7. WORLD MAP — what it must become

Today: `SPATIAL_ENTITY_KINDS` is a **closed 3-value union** (`person_presence`, `company_territory`,
`project_location`) and the source states *"The three kinds NEVER share a rendering contract."*

Required: render **any** entity by type, from `entities` + `entity_relationships`, with one contract.
This is `E.7` in the Unified World Model, `B.6` in the Behavior Model and §4 of the Universe Lock —
**one job named by three locks**. Seven screens move onto it once it exists — ten, counting the three
that merge in first.

## 8. SINGLE WORKSPACE PROPOSAL

**One route: `/dashboard`.** One shell. Three regions. Zero page transitions for work.

| Before | After |
|---|---|
| 57 product dashboard screens | **1 workspace** + 7 panel views + 1 map |
| 2 navigation systems + 27 unlisted routes | **0 navigation** — the AI changes World State |
| 4 confirmation mechanisms | **1** (inline two-step, tiered by the registry) |
| 8 dialogs / modals | **2** (mobile sheet infra, language feedback) |
| 61 `router.push` / `redirect` sites | **~10**, all outside the workspace (auth, public, invite) |
| deepest chain: 5 levels | **1** |
| 30 actions each requiring an `advancedRoute` | `advancedRoute` becomes **optional**, then removed |

**Entry rule after Phase 1:** a URL still addresses an entity (`/entity/[id]` — deep links, sharing and SEO
survive), but *inside* a session the user never leaves the workspace.

---

## 9. PRIORITY IMPLEMENTATION PLAN

Ordered so that nothing is built before the thing it depends on, and so each slice is independently shippable
and reversible. Every slice that adds or changes a surface needs a `SurfaceDeclaration`; slices before the map
platform exists will need an owner-approved **`transitionalWaiver`** (readiness fields only, auto-expiring).

| # | Slice | Depends on | Risk | Why first |
|---|---|---|---|---|
| **U.0** | **Delete the 14 REMOVE routes** (3 have zero inbound links; 8 are redirect-only aliases) | — | **very low** | Pure subtraction. No user can reach most of them. Shrinks the surface before anything is rebuilt |
| **U.1** | **Collapse the 4 confirmation mechanisms to 1** — kill 3 `window.confirm`, convert M-1/M-2 to inline two-step | — | low | Independent of architecture; immediate honesty + UX win |
| **U.2** | **Merge the duplicate identity surfaces** (profile + cv + player-card → one Person view) | — | medium | Highest-value MERGE: 3 editors of one object, contract already exists |
| **U.3** | **Merge the 4 onboarding/start surfaces into the conversation** | U.1 | medium | Removes the largest wizard cluster; A-04 already forbids it |
| **U.4** | **Build the Context Panel shell** with the Entity view (one view, type-driven) | U.2 | **high** | The first genuinely new component. Nothing else can move until it exists |
| **U.5** | Move the **Agenda** (tasks + activity + 3 inboxes) into the panel | U.4 | medium | Biggest per-screen reduction: 5 → 1 |
| **U.6** | Move Journal · Conversation · Insights · Reports · Settings into panel views | U.5 | medium | Mechanical once U.4/U.5 land |
| **U.7** | **`E.7` / `B.6` — make the World Map a platform**: render entities by type, one contract | U.4 | **high** | The single largest piece of work; three locks name it; 10 screens wait on it |
| **U.8** | Move the 7 map candidates onto the map | U.7 | medium | Collapses discovery entirely |
| **U.9** | Make `advancedRoute` optional; drive the last 9 `deep_link` actions inline | U.4, U.6 | medium | The point at which **the AI stops choosing pages** |
| **U.10** | Remove `/dashboard/advanced` and the second nav system | U.5–U.9 | medium | Only safe once every module has a home |
| **U.11** | Introduce `/entity/[id]`, retire per-type detail routes | U.7, U.9 | high | Finishes the model; keeps deep links working |

**Sequencing note.** U.0–U.3 need **no** new architecture and can start immediately — they are pure cleanup and
merging. U.4 and U.7 are the two real builds. Everything after U.7 is mostly deletion.

**Definition of done for Phase 1 (U.0–U.3):** 14 routes gone, 1 confirmation mechanism, 2 identity surfaces
become 1, 4 onboarding surfaces become 0 — with **no new architecture required** and no gate waiver needed.

---

## What this audit deliberately does not do

It does not redesign anything, does not choose visual treatments, and does not touch the admin console or the
public marketing funnel. It also does not assume the Context Panel or the map platform exist — both are
recorded as unbuilt, and the plan is ordered around that fact rather than around it.

*No code was changed, no UI was modified, no PR was created, nothing was migrated.*
