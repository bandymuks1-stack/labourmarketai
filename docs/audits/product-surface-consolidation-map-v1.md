# Product Surface Consolidation Map v1

| Field | Value |
|---|---|
| Date | 2026-07-28 |
| Branch | `feat/product-surface-consolidation-map-v1` |
| Scope | **Inventory + map only.** Nothing was fixed, merged, moved, renamed or deleted. No PC-0x finding was patched |
| Method | Every `apps/web/app/[locale]/**/page.tsx` (118) parsed for: role gate, redirect-alias status, registry membership, size, form/chat presence, declared purpose |
| Gate | Real consolidation may begin **only after human approval of this map** |

---

## 0. Two corrections to the previous audit (`product-constitution-audit-v1.md`)

Reading every route instead of a sample changed two findings. Both make the
picture **better**, and leaving them uncorrected would have sent the first
consolidation wave at the wrong target.

| Previous claim | Verified reality | Consequence |
|---|---|---|
| **PC-01 (P1):** `/dashboard/visual-os` is a second primary surface | It is `requireSuperadmin`-gated and redirects non-admins. **No user can reach it.** Same for `/dashboard/visual-os/agency` and `/dashboard/talent` | PC-01 drops from **P1 to P3** and becomes an *internal-surface* question, not a chat-first violation |
| **PC-02 (P2):** sample data at a `/dashboard/*` route | Same route, same gate — the sample data is behind admin auth | PC-02 drops to **P3** |

Everything else in that audit stands. The registry-absence facts were correct;
the severity was not.

---

## 1. What counts as a product surface

A **product surface** is a route a real user can reach and perceive as a place.
Not a file, not a component.

| Class | Count | Treatment |
|---|---|---|
| Redirect aliases (no UI of their own) | **6** | Not surfaces. Listed for completeness |
| Admin / internal (`requireSuperadmin`) | **25** | Internal surfaces — out of the user-facing map |
| **User-visible product surfaces** | **87** | The subject of this map |
| **Total routes** | **118** | |

**Already-consolidated (the 6 aliases)** — proof the pattern works:
`/dashboard/agency` → company · `/dashboard/agency/pool` → company ·
`/dashboard/assistant` → chat root · `/dashboard/marketplace` → map ·
`/dashboard/player-card` → CV · `/dashboard/start/agency` → company setup.

---

## 2. Inventory by group

Columns: **route · purpose · who uses it · in production · duplicates · could be chat · remove · merge · priority.**
`In prod` = reachable by a real user today. `Chat?` = could the job be done inside the conversation.

### 2.1 CHAT & CONVERSATION

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard` | The conversation-first home | all | yes | — | **is chat** | no | no | — |
| `/dashboard/communication` | Thread list with counterparties | all | yes | partial: inbox | no — person-to-person threads are not the assistant | no | no | — |
| `/dashboard/communication/[id]` | One thread | all | yes | — | no | no | no | — |
| `/dashboard/assist` | "AI assistance centre" | all | yes | **yes — a second AI surface** | **yes** | no | **→ `/dashboard`** | **P1** |
| `/design/conversation` | Dev preview of the chat UI | dev | dev only | — | n/a | no | → internal | P3 |

### 2.2 JOURNAL

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/journal` | The work journal (1 238 lines) | worker | yes | — | partly — entries already start in chat | no | no | — |
| `/dashboard/journal/voice` | Voice entry mode (56 lines) | worker | yes | **same function, different input** | yes | no | **→ `/dashboard/journal`** | **P2** |

### 2.3 MARKET & OPPORTUNITY

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/market-map` | Live market map — primary market surface | all | yes | — | no — genuinely spatial | no | no | — |
| `/dashboard/opportunities` | Worker opportunity board (1 112 lines) | worker | yes | overlaps map + listings | partly — "show me fitting work" is a question | no | no (keep as the worker board) | P3 |
| `/dashboard/listings` | Work-resource listings (82 lines) | all | yes | **yes — map + opportunities** | yes | no | **→ map / opportunities** | **P2** |
| `/dashboard/market/recognize` | Offer–Demand recognition entry (25 lines) | all | yes | thin entry point | **yes** | **yes** | → chat intent | **P2** |
| `/dashboard/intelligence` | Market intelligence workspace | company | yes | overlaps map | partly | no | no | P3 |
| `/work-opportunities` | Public opportunity list | anon | yes | mirrors `/dashboard/opportunities` for logged-out | no | no | no | — |

### 2.4 INBOX / INCOMING DECISIONS

The single biggest fragmentation in the product: **six surfaces for "something
arrived and needs my decision".**

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/inbox` | Incoming items | company | yes | **yes** | yes | no | **→ ONE decisions surface** | **P1** |
| `/dashboard/inbox/quick` | Quick triage (98 lines) | company | yes | **yes** | **yes** | **yes** | → same | **P1** |
| `/dashboard/inbox/report` | Review report preview | company | yes | overlaps reports | no | no | → reports | P2 |
| `/dashboard/service-requests` | Marketplace request loop | provider | yes | overlaps inbox | yes | no | → same decisions surface | **P1** |
| `/dashboard/bookings` | Incoming booking proposals | worker | yes | overlaps inbox | yes | no | → same decisions surface | **P1** |
| `/dashboard/candidates` | Candidate/provider drafts | company | yes | overlaps inbox + scouting | yes | no | → same | P2 |

### 2.5 IDENTITY, EVIDENCE & SETTINGS

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/profile` | Living work identity (1 000 lines) | all | yes | — | partly | no | no | — |
| `/dashboard/account` | Settings only | all | yes | overlaps privacy | no | no | no | — |
| `/dashboard/privacy` | Canonical privacy control | all | yes | **settings-shaped** | no | no | **→ `/dashboard/account`** | **P2** |
| `/dashboard/documents` | Document & work-proof centre | all | yes | overlaps gallery | no | no | no | — |
| `/dashboard/gallery` | Personal photo evidence | worker | yes | **yes — documents** | no | no | **→ `/dashboard/documents`** | **P2** |
| `/dashboard/network` | "Mano tinklas" — declared a SUB-surface | all | yes | — | partly | no | no | P3 |
| `/cv` (public) | Verified CV / PDF export (688 lines) | all | yes | — | no | no | no | — |

### 2.6 COMPANY & WORK EXECUTION

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/company` | Company workspace (1 264 lines) | company | yes | — | no | no | no | — |
| `/dashboard/company/planning` | Workforce planning zone | company | yes | overlaps `/dashboard/planning` | partly | no | review vs planning | P2 |
| `/dashboard/company/scouting` | Scouting (886 lines) | company | yes | overlaps candidates | yes | no | review | P2 |
| `/dashboard/company/projects/new` | "Create project context" (42 lines) | company | yes | — | **yes** | **yes** | → chat intent | **P2** |
| `/dashboard/projects` | Manager map | company | yes | — | no | no | no | — |
| `/dashboard/projects/[id]` | Project visualisation | company | yes | — | no | no | no | — |
| `/dashboard/projects/[id]/operations` | Project operating centre | company | yes | — | no | no | no | — |
| `/dashboard/planning` | THE canonical calendar | all | yes | vs company/planning | no | no | no | — |
| `/dashboard/tasks` | Work tasks | all | yes | — | partly | no | no | — |
| `/dashboard/assets` · `/dashboard/absences` · `/dashboard/instructions` | Assets · leave · instructions | company | yes | — | partly | no | no | P3 |
| `/dashboard/activity` | Unified activity centre | all | yes | overlaps inbox group | no | no | review with 2.4 | P2 |
| `/dashboard/advanced` | Module hub (917 lines) | all | yes | **a second navigation system** | no | no | **decide: keep as the one escape hatch, or fold** | **P1** |

### 2.7 SETUP & ONBOARDING

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/onboarding` | First-run | new | yes | overlaps start | **yes** | no | **→ chat** | **P1** |
| `/dashboard/start` | Activity setup hub | new | yes | **yes — onboarding** | **yes** | no | → chat | **P1** |
| `/dashboard/start/buyer` | Buyer setup | new | yes | **yes** | **yes** | no | → chat | **P1** |
| `/dashboard/start/company` | Company setup | new | yes | **yes** | **yes** | no | → chat | **P1** |

*(`/dashboard/start/agency` is already an alias — the pattern is proven.)*

### 2.8 COMMERCE & FINANCE

| Route | Purpose | Who | In prod | Duplicates | Chat? | Remove | Merge | Prio |
|---|---|---|---|---|---|---|---|---|
| `/dashboard/commercial` | Commercial CRM (44 lines) | company | yes | overlaps finance | partly | no | review | P3 |
| `/dashboard/finance` | Finance records | company | yes | — | no | no | no | — |
| `/dashboard/services` | Provider service offerings | provider | yes | overlaps listings | partly | no | review | P3 |
| `/dashboard/reports` | Reports hub | all | yes | — | no | no | no | — |
| `/dashboard/reports/evidence` | Evidence report | all | yes | — | no | no | no | — |

### 2.9 PUBLIC / MARKETING (33 surfaces)

`/` · `/about` · `/vision` · `/pricing` · `/for-workers` · `/for-companies` ·
`/for-agencies` · `/professions` · `/skills` · `/questions` (+`/[slug]`,
`/category/[category]`) · `/labour-market` (+`/[country]`) · `/work-abroad` ·
`/worker-intake` · `/company-need` · `/match-preview` ·
`/calculators/project-cost` · `/business/[slug]` · `/cv` · `/[...rest]` ·
7 × `/legal/*` · 4 × `/auth/*` · `/design`, `/design/text-first` (dev).

**Verdict: out of scope for chat-first consolidation.** These are acquisition,
legal and auth surfaces; a conversation is not their job. The only actions:
`/design*` → internal (P3); `/worker-intake` + `/company-need` are intake forms
that **should hand off to chat once logged in** (P3, review).

---

## 3. CANONICAL SURFACE MAP

### 3.1 MUST REMAIN (the canonical spine)

| Surface | Why it is canonical |
|---|---|
| `/dashboard` | The conversation. A-01 |
| `/dashboard/journal` | The work record; the one place proof accumulates |
| `/dashboard/planning` | THE calendar |
| `/dashboard/communication` (+ thread) | Person-to-person threads — not the assistant |
| `/dashboard/profile` · `/dashboard/account` | Identity · settings |
| `/dashboard/documents` | Evidence centre |
| `/dashboard/market-map` | Genuinely spatial |
| `/dashboard/opportunities` | The worker board |
| `/dashboard/company` (+ `projects`, `projects/[id]`, `operations`) | Company workspace + execution |
| `/dashboard/tasks` · `/finance` · `/reports` (+ evidence) | Execution, money, proof |
| `/dashboard/assets` · `/absences` · `/instructions` · `/network` · `/intelligence` · `/services` · `/commercial` | Domain surfaces, kept pending §2 reviews |
| All public/legal/auth surfaces | Acquisition and compliance |

### 3.2 MUST BE MERGED

| From | Into | Axiom | Prio |
|---|---|---|---|
| `/dashboard/assist` | `/dashboard` | A-01, A-08 | **P1** |
| `/dashboard/inbox` + `/inbox/quick` + `/bookings` + `/service-requests` + `/candidates` | **ONE decisions surface** (or the chat + activity centre) | A-08 | **P1** |
| `/onboarding` + `/start` + `/start/buyer` + `/start/company` | The conversation | A-04, A-01 | **P1** |
| `/dashboard/journal/voice` | `/dashboard/journal` | A-08 | P2 |
| `/dashboard/listings` | map / opportunities | A-08 | P2 |
| `/dashboard/gallery` | `/dashboard/documents` | A-08 | P2 |
| `/dashboard/privacy` | `/dashboard/account` | A-08 | P2 |
| `/dashboard/inbox/report` | `/dashboard/reports` | A-08 | P2 |

### 3.3 MUST BE REMOVED (replaced by a chat intent)

| Surface | Size | Replacement |
|---|---|---|
| `/dashboard/market/recognize` | 25 lines | chat intent "recognise this offer/demand" |
| `/dashboard/company/projects/new` | 42 lines | chat intent "create a project" |
| `/dashboard/inbox/quick` | 98 lines | the merged decisions surface |

### 3.4 BECOME INTERNAL ONLY

`/dashboard/visual-os` · `/dashboard/visual-os/agency` · `/dashboard/talent`
(already superadmin-gated — the action is to state that in the registry, not to
change behaviour) · `/design` · `/design/conversation` · `/design/text-first`.

### 3.5 THE ONE OPEN ARCHITECTURAL DECISION

**`/dashboard/advanced` (917 lines) is the whole question.** It is the second
navigation system. Three coherent options — this map does not choose:

| Option | Consequence |
|---|---|
| **A. Keep** as the single documented escape hatch | Status quo; two nav systems remain, honestly labelled |
| **B. Fold** its cards into `/dashboard` chat context | Truest to A-01; largest single piece of work |
| **C. Demote** to a module index reachable only from chat | Middle path; removes it as a parallel *home* |

Every P1 merge above depends on this answer, so it is the **first** decision.

---

## 4. If the map were executed

| Metric | Today | After |
|---|---|---|
| Routes | 118 | ~104 |
| User-visible surfaces | 87 | **~73** |
| "Incoming decision" surfaces | 6 | **1** |
| Setup surfaces | 4 | **0** (chat) |
| AI surfaces | 2 | **1** |
| Journal surfaces | 2 | 1 |

**~14 surfaces removed or merged; the chat becomes the only entry for setup,
AI help and recognition.**

---

## 5. Sequence (one plan, not per-screen patches)

| Wave | Content | Blocked by |
|---|---|---|
| **0** | Owner decides §3.5 (`/dashboard/advanced`) | — |
| **1** | Setup → chat (`onboarding`, `start*`) | Wave 0 |
| **2** | ONE decisions surface (inbox family + bookings + service-requests + candidates) | Wave 0 |
| **3** | `assist` → `/dashboard` | Wave 1 |
| **4** | Small merges: journal/voice, gallery, privacy, listings, inbox/report | — |
| **5** | Remove the three thin routes (§3.3) | Waves 1–2 |
| **6** | Mark internal surfaces in the registry (§3.4) | — |

Each wave lands as its own PR with declarations in the surface registry, so the
Product Gate (PR #900) records what changed and why.

---

## 6. What a human must decide

1. **§3.5** — the `/dashboard/advanced` option. Everything else waits on it.
2. Whether the merged decisions surface is a **route** or lives **inside chat**.
3. Whether `/dashboard/opportunities` and `/dashboard/intelligence` stay separate from the map.
4. Whether `/dashboard/company/planning` and `/dashboard/planning` are one calendar.
5. Whether `/dashboard/commercial` and `/dashboard/services` survive as separate surfaces.

---

*Map only. No surface was changed, merged, moved, renamed or deleted by this
work. Consolidation begins only after explicit human approval of §3 and §5.*
