# CHAT-FIRST DASHBOARD — measurement, verdict, target composition

Pinned at `origin/main` `779357aa`. Every number below is from a real painting
Chromium against the local stack. Evidence:
`docs/audits/evidence/w7-ux-audit/{worker,company}-dashboard-home-{1440,375}.png`
and `measurements-{worker,company}.json`.

## 1. Verdict

**`CHAT_STRUCTURALLY_FIRST · VISUALLY_SECOND_ON_FIRST_LOAD · NAVIGATION_ABSENT`**

The owner's concern is real but the cause is not the map. `/dashboard` is
already one full-viewport `ConversationChat`; there is no card control room and
no competing hero panel. Three separate things break the chat-first feeling:

1. a static profile card owns the top 60 % of the first fold (worker identity);
2. the right rail takes 24 % of the desktop width to show 40 px of content;
3. there is **no navigation at all** on the surface.

## 2. Measured composition — worker, 1440×900

| element | x / y | size | share |
|---|---|---|---|
| header | 0 / 0 | 1440 × 65 | — |
| chat column (`conversation-thread`) | 0 / 65 | **1088 × 835** | **75.6 % of width** |
| context panel (`aside`) | 1088 / 65 | **352 × 835** | 24.4 % of width |
| ├ content inside the panel | — | **40 px** | **4.8 % of the panel's height** |
| `personal-workspace-intro` | — / 198 | 702 × **341** | 38 % of the fold |
| `msg-greeting` | — / **567** | 736 × 68 | greeting begins at **63 % down** |
| `msg-assistant` | — / 641 | 736 × 80 | |
| `composer-input` | — / **732** | 632 × 52 | **primary intent field at 81 % down** |
| `<a>` elements | — | **0** | |

Chat *is* three times the panel. But the conversation's own content —
greeting, chips, composer — occupies **y 567→793, i.e. the bottom 25 % of the
fold**, and 1088 − 736 = 352 px of the chat column is empty margin. Combined
with the 352 px rail that is **704 px of the 1440 px width carrying nothing.**

## 3. Measured composition — worker, 375×812

| element | y | h |
|---|---|---|
| `personal-workspace-intro` | −135 (already scrolled past the top) | **574 = 71 % of the viewport** |
| `msg-greeting` | 485 | 89 |
| `msg-assistant` | 580 | 105 |
| `composer-input` | **705** | 52 |
| `context-panel` (docked, collapsed) | 757 | 55 |

The composer's bottom edge is 757 — flush against the docked panel.

**Layout-shift defect (P1-5).** The intro streams in after the shell
(`SpineStream` pattern, deliberate per #1011). Sampling `composer-input.y`
every 300 ms after reload:

```
t=0 … 3000 ms → y = 510
t=3300 ms      → y = 705
```

The primary input field is interactive at y=510 for ~3 s and then **drops
195 px**. A user who taps where the field was lands on a chat chip. The dev
server inflates the absolute delay; the *ordering* — shift after interactivity,
not before — is a product property, not a dev artefact.

## 4. Measured composition — company, 1440×900

| element | y | size |
|---|---|---|
| `msg-greeting` | 388 | 736 × 136 |
| chips (`create-demand`, `candidates`, `projects`) | 481 | 44 tall |
| `composer-input` | 545 | 632 × 52 |
| `workspace-map` | 108 | **319 × 272** |
| `workspace-map-unmapped` | 344 | 319 × 36 |
| `context-panel-work` | 396 | 319 × 40 |

Better than the worker (no intro card → greeting at 43 % instead of 63 %), and
the map does render. But the `<h1>` is **"Labas, Dev. Kuo šiandien galiu
padėti?"** — a person's first name, on an organisation workspace. The active
organisation ("Dev Construction") appears **only** in the 162 px header chip.
Nothing in the main column tells the user that "Reikia darbuotojų" will create a
demand *for Dev Construction*.

## 5. Navigation — the decisive defect (P0-2)

`/lt/dashboard`, worker identity, full DOM enumeration:

- `<a>` elements: **0**
- buttons: workspace chip, quick-search, locale, notifications, avatar, 3 intro
  actions, 3 chat chips, attach, send, panel expand, feedback FAB
- opening the avatar menu adds exactly four destinations: *Profilis*, *Mano
  kortelė*, *Mano CV*, *Nustatymai*
- opening quick-search shows only "GREITA PAIEŠKA / Ctrl ⌘ K" — no suggestions

`lib/config/navigation.ts` already computes `CORE_NAV_IDS = [overview,
journal_text_first, planning, communication]`, `dashboard/layout.tsx` resolves
their labels into `nav`, and `DashboardChrome` forwards `nav` to
`ConversationHeader`, which uses **only `nav.chat`** — as the `aria-label` of the
back arrow. The 5-item nav the source comments describe is not rendered
anywhere.

Consequence: from the product's own home a person cannot see that a calendar, a
message inbox, a map or a network exists. Everything a chat-first product
promises to make reachable is reachable only by already knowing it is there.

## 6. Target composition

Keep the current structure — chat left, panel right — and fix the four things
that break it. This is deliberately *not* a redesign.

### Desktop (≥ lg)

```
┌──────────────────────────────────────────────┬──────────────────┐
│ header: logo · WORKSPACE CHIP · CORE NAV     │ search · bell · D│  ← nav added
├──────────────────────────────────────────────┼──────────────────┤
│                                              │ CONTEXTUAL       │
│  ACTIVE CONTEXT LINE                         │ INTELLIGENCE     │
│  "Asmeninė erdvė" / "Dev Construction"       │                  │
│                                              │ • map (only when │
│  ── conversation ──                          │   it has data;   │
│  greeting                                    │   expandable)    │
│  starter chips                               │ • attention      │
│  [ composer ]            ← above 50 % of fold│ • today          │
│                                              │                  │
│  readiness card, COLLAPSED to one line       │ panel COLLAPSES  │
│  until the person opens it                   │ when it has < 2  │
│                                              │ real items       │
└──────────────────────────────────────────────┴──────────────────┘
```

Rules this encodes:
- the composer must sit **above the vertical midpoint** on first paint;
- the readiness block is one line + disclosure, not a 341 px card;
- the panel **collapses to a rail** when it carries fewer than two real items,
  returning its 352 px to the conversation;
- the active context is stated **in the column the user is reading**, not only
  in the header chip;
- dangerous/creating actions name their organisation in the label or the
  confirmation ("Sukurti poreikį — Dev Construction").

### Mobile (< lg)

- greeting + composer inside the first 60 % of the viewport;
- readiness collapsed by default (it is 71 % of the screen today);
- **reserve the intro block's space before it streams in**, so the composer
  cannot move after interactivity (fixes P1-5);
- the docked panel stays a 55 px handle; opening the map opens it full-screen
  (see `MAP_STRATEGIC_PRODUCT_MODEL.md`).

## 7. Slices

| id | scope | files | risk |
|---|---|---|---|
| **CF-1** | render the already-computed core nav in `ConversationHeader` (and the `panel` shell) | `conversation-header.tsx` + a nav item list | low — labels and routes already exist |
| **CF-2** | collapse the readiness card to one line + `<details>` on both breakpoints; reserve its height before it streams | `conversation-thread.tsx` / the intro component | medium |
| **CF-3** | collapse the context panel to a rail when it has < 2 items; give the map an explicit expand control | `context-panel.tsx` | medium |
| **CF-4** | state the active context in the main column; name the organisation in creating-action labels and confirmations | chat intro + chip labels | low, copy-heavy |

**CF-1 is the only one implemented in this window** — it is the largest
usability gain per line changed, it changes no business logic, and it renders
data the layout already produces. CF-2/3/4 are documented and left for a
layout slice with its own before/after proof.
