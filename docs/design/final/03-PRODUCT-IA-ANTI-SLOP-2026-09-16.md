# LABOURMARKET.AI — PRODUCT UX / INFORMATION ARCHITECTURE CORRECTION (2026-09-16)

Status: **OWNER DIRECTIVE, GLOBAL** ("OWNER PRODUCT UX / IA CORRECTION" +
"ADMIN / OPERATIONS SURFACE" + "GLOBAL ANTI-AI-SLOP PRODUCT CONSTITUTION",
all 2026-09-16). Additive to `00-FROZEN-DESIGN-CONTRACT.md` (§2.2 WORLD →
FIELD → CONTEXT/OBJECT; §2.6 C1 projects in time × capacity; §1.5 no
destructive change) and to `01-WORKER-MOBILE-IA-2026-09-13.md` (the worker's
three tabs, unchanged here). Where this document and the frozen contract
differ, the frozen contract wins. Where this document and the canonical
architecture (`docs/OWNER_TARGET_ARCHITECTURE_V1.md`) differ, the
architecture wins — this document decides *what a human sees where*, never
what the graph is.

Owner acceptance rule this document exists to satisfy:

> RICH SYSTEM UNDERNEATH + SIMPLE HUMAN MODEL ABOVE. Not: simple UI by
> deleting product capability. REMOVE THE BRAND — if the product could still be
> mistaken for a generic AI/SaaS template, the work is not done.

---

## 0. The core UX model (owner, verbatim in substance)

| Layer | Role |
|---|---|
| **CHAT** | Universal natural-language front door. Understands intent, opens or *prepares* the canonical domain context. Never the only navigation. |
| **DOORS** | Persistent direct navigation for the major real-world contexts of the active workspace. |
| **WORKFLOW** | Guided outcome, not database administration. |
| **AI / AUTOMATION** | Interpret, structure, connect, deduplicate, detect contradictions, prepare missing structures, explain uncertainty. |
| **HUMAN** | Confirms consequential ambiguity / commitment only (rule §5: A–E). |

First screen of any context shows only: current state · what needs attention ·
primary next actions · doors to deeper areas.

---

## 1. Surface inventory (one bounded pass — major production surfaces)

Columns: USER CONTEXT · REAL JOB · CANONICAL OBJECT · CURRENT PATTERN ·
ANTI-SLOP VIOLATION · REUSE TARGET · CLASS. "Lines" = `page.tsx` length on
`main` `bfdbdf53`, a structural signal for capability aggregation, not a
verdict on its own.

### 1.1 Organization context (employer · agency · institution — one workspace)

| Route | Job | Object | Current pattern (lines) | Violation | Target | Class |
|---|---|---|---|---|---|---|
| `/dashboard/company` | "What is happening in my organization, what needs me, where do I go" | ORGANIZATION (home field) | 1,709 lines, ~25 stacked sections: demand wizard, readback, decisions strip, capabilities, people import, roster, learners, programmes, public demand, claims, agency mode, clients, bridges, readiness, ops counts, connections, evidence card, pilot note, brigades, invite, workers, recorded work, evidence import, objects, gallery, readiness rows, members, lifecycle, public profile, help, scouting bridge | **GIANT PAGE** (capability dump); in-page anchor "control bar" pretends to be navigation; six domains on one scroll | Becomes **DABAR**: header · home field (C1: projects in time × capacity · missing · needs you · partners — already a control field) · decisions strip · primary actions · **organization doors** | GREEN — split |
| *(new)* `/dashboard/company/people` | Who works with us, who is free, who needs attention, bring people in | PERSON ↔ ORGANIZATION (roster, membership, brigade) | — | — | Composition of the EXISTING sections moved out of the hub: workers + invitations, recorded work, brigades, people import, roster readback, readiness, members, lifecycle, manager evidence | GREEN — new door, declared in the surface registry |
| *(new)* `/dashboard/company/needs` | Ask for people / offer capacity; see what I already asked; matching is one door further | DEMAND (customer_requests, direction) | wizard was section 1 of the hub | — | The canonical intake wizard + readback + claimable intakes + public demand (agency/institution) + scouting bridge, moved verbatim | GREEN — new door |
| `/dashboard/company/scouting` | Candidates, matching, supply, interest | DEMAND → MATCH | 1,126 lines; already object-led (per-demand rows) | acceptable; reached from Needs | KEEP; linked from Needs and the Dabar home field | KEEP |
| `/dashboard/projects` (manager branch) | Sites/projects, who is on them, stages | PROJECT / SITE | 282 lines; map → arena → draft | none structural | **EXTEND** with objects/sites register + project gallery (both were only reachable inside the hub) | GREEN — extend |
| `/dashboard/company/planning` | Workforce in time, availability, clashes | TIME × PEOPLE | 765 lines | acceptable | KEEP; door "Kalendorius" | KEEP |
| *(new)* `/dashboard/company/partners` | Clients (agency), agency connections (client side) | CLIENT / PARTNER relationship | inside the hub | — | Agency mode card + clients + agency bridge (agency) · client bridge (company) moved verbatim | GREEN — new door, shown only when the relationship exists or the org is an agency |
| *(new)* `/dashboard/company/education` | Programmes, cohorts, learners, employer demand for them | PROGRAMME ↔ PERSON | inside the hub | — | Learners + programmes + public demand (institution) moved verbatim; door only for `training_provider` | GREEN — new door |
| *(new)* `/dashboard/company/history` | Bring historical reality in; see what was imported; correct it | EVIDENCE (organization_evidence_records, import sessions) | inside the hub as `#evidence-import-zone` | chat "noriu įkelti istorinius duomenis" → *hours form* dead end ("first create an object") | The ONE evidence import engine as the canonical **historical import door**; the hours-grid import stays a *format* of it; chat routes here | **P0** GREEN — new door + routing fix + automation |
| *(new)* `/dashboard/company/settings` | Identity, verification, what we do, public profile, help | ORGANIZATION | inside the hub | — | Next actions · readiness · capabilities · public profile · tier-1 warning · help request · profile link, moved verbatim | GREEN — new door |
| `/dashboard/hours` | Today's quick hours entry; timesheet grid import | WORK (allocations) | 70 lines; `states.noObjects` dead end | **P0 dead end** — asks the human to create objects the file already names | Keep as the operator's daily surface; the no-objects state now opens the historical import (which prepares objects from evidence) and the objects register | GREEN |
| `/dashboard/company/projects/new` | Create a project | PROJECT | 41 lines | none | KEEP | KEEP |

### 1.2 Person context (worker) — already corrected 2026-09-13, verified only

| Route | Pattern | Verdict |
|---|---|---|
| `/dashboard` (ŠIANDIEN) | one primary action · today · open items | KEEP (IA 01) |
| `/dashboard/journal`, `/work-in-numbers`, `/profile`, `/cv`, `/opportunities`, `/gallery` | stations of the one loop | KEEP (IA 01); `/opportunities` at 1,861 lines and `/journal` at 1,855 are the next progressive-disclosure candidates — **queued, not in this pass** (owner: worker surfaces were the previous correction) |

### 1.3 Platform administration (`/dashboard/admin/*`, superadmin only)

| Route | Job | Current pattern | Violation | Target | Class |
|---|---|---|---|---|---|
| `/dashboard/admin` | Operate the platform: queues needing an operator decision, sources, moderation, users, areas | title → prose → 6 KPI cards → prose → stacked panels → prose → area cards | **generic SaaS admin template**; engineering prose in persistent UI ("Skaičiai be nuorodos yra tik stebėsenai…", "Pirmenybė nustatoma deterministiškai…") | ATTENTION-first control field: queues that need a decision (each row is the object, with its count), then platform areas. KPI band removed — a number lives on the object it counts. Engineering guarantees move to `<details>` help. | GREEN |
| `/dashboard/admin/*` chrome | — | legacy wide tab row (Kalendorius · Žinutės · Žemėlapis · Ryšiai · Administravimas) + role switcher + bottom nav | product tabs inside platform administration mix the two contexts | Admin routes use the same ONE TOP BAR as every product route; the console navigates through its own areas. See §4 nav classification. | GREEN — **queued** (own slice; §4) |
| other `/dashboard/admin/*` pages | operator tools | mixed | not walked by the owner; classified INTERNAL_ADMIN | out of this pass | queued |

### 1.4 Public / entry — walked earlier (landing freeze, actor front doors); not re-audited here. Any LT copy leak found by the shared detectors (§3.3) applies to them too.

---

## 2. Organization doors (the target navigation for the organization context)

Persistent on every organization route (rendered by `app/[locale]/dashboard/company/layout.tsx`
and on the manager branch of `/dashboard/projects`). Labels are product copy in
the active locale; each door is one existing canonical surface. **No duplicate
routes, no new data model.**

| Door (LT) | Route | What it holds | Shown when |
|---|---|---|---|
| Dabar | `/dashboard/company` | home field · decisions · primary actions · doors | always |
| Žmonės | `/dashboard/company/people` | roster, invitations, recorded work, brigades, import, members, lifecycle | always |
| Darbai | `/dashboard/projects` | projects (map → arena), objects/sites, gallery | always |
| Poreikiai | `/dashboard/company/needs` | intake wizard, readback, claims, public demand, scouting bridge → `/scouting` | always |
| Kalendorius | `/dashboard/company/planning` | workforce in time | always |
| Klientai / Partneriai | `/dashboard/company/partners` | clients + agency bridge (agency); agency connections (client) | agency, or an inbound agency relationship exists |
| Mokymai | `/dashboard/company/education` | learners, programmes, demand for them | `training_provider` capability |
| Istorija | `/dashboard/company/history` | historical import (the one engine), records, corrections; hours-grid format link | always |
| Nustatymai | `/dashboard/company/settings` | identity, verification, capabilities, public profile, help | always |

Design rule: the door strip is text-first with a domain icon, ≤ 9 items,
horizontally scrollable on a phone, `aria-current` on the active door. It is
navigation, not a card grid. The Dabar screen never repeats a door's content.

---

## 3. Systemic patterns and their shared corrections (execute by root cause)

### P0 — dead-end real workflows / unnecessary human prerequisites

| # | Root cause | Correction | Where |
|---|---|---|---|
| P0-1 | Chat `hours-import` intent for an organization pointed at `/dashboard/hours?import=1`, whose gate answers "first create an object" | Organization identity routes to the canonical historical import door (`/dashboard/company/history`); the hours grid stays reachable *from* that door as a format | `conversation-chat.tsx` executor `timesheetImport`; command registry |
| P0-2 | The evidence import stops at `person_not_on_roster` and requires a separate per-person "create roster person" act; unmatched objects are dropped to a label | **Preview plan**: unmatched people and unmatched objects become `will_create` entries in the plan ("Radau 7 objektus. 5 jau yra. 2 naujus paruošiau sukurti."); the explicit COMMIT executes the plan through the EXISTING authorized writes (`createRosterPerson`, `create_work_object_v1` RPC) and then commits the rows. Ambiguous matches still require the human. Nothing is written before commit. | `import-core.ts` (`buildPreview` → `plan`, `commitImport` → `applyPlan`), `evidence-import-section.tsx`, `evidence-import-forms.tsx` |
| P0-3 | Contradictory evidence inside one row (source week vs explicit date) was not detected | Parser recognises a week column, computes the ISO week of the explicit date, records `derived.calendarWeek` with method `iso_week_of_explicit_date` (consistent) or `iso_week_conflicts_with_source_week` (conflict, note carries `source_week=N`); the source cell stays verbatim in `raw`; the preview shows the conflict and the proposed canonical week with its reason. Insufficient evidence → nothing derived. | `parse-tabular.ts`, preview UI |
| P0-4 | `/dashboard/hours` `no-objects` state is a wall | State becomes a door pair: "import from the file (objects are prepared from it)" and "objects register" | `hours/page.tsx` |

### P1 — navigation / giant page / context organization

| # | Root cause | Correction |
|---|---|---|
| P1-1 | One route (`/dashboard/company`) aggregates every organization capability | §2 doors; the hub becomes Dabar; sections move verbatim into their door pages (no component rewrite) |
| P1-2 | In-page anchors (`#company-team`, `#demand-intake`, …) used as the org's "navigation" across the product (home field, agency mode, chat links, decisions strip) | Every anchor link becomes the door route (`/dashboard/company/people#company-team`, `/dashboard/company/needs#demand-intake`) — anchors survive inside their page |
| P1-3 | Admin console carries product tabs | §1.3 |
| P1-4 | Guards pinned the aggregation (40 guard files read the hub) | Guards re-anchored to the door file that now holds the pinned section; the pinned *behaviour* is unchanged |

### P1 — test / internal / unlocalized production leakage

| # | Root cause | Correction |
|---|---|---|
| P1-5 | Production QA rows carry `[QA-SYNTHETIC]` / `QA-SYNTHETIC` in titles and organization names and appear on real users' cross-organization surfaces (public demand, supply discovery, opportunities) | ONE predicate `isSyntheticFixtureLabel()` (`lib/qa/synthetic-fixture.ts`) applied in the shared cross-organization readers; a person's OWN rows are never hidden from them (their data), only other organizations' fixtures are kept out of normal surfaces |
| P1-6 | Legacy English titles ("Hiring workers — demand", "Pilot request — …") on live rows | Already mapped to locale keys by `resolveDemandTitle`; the remaining leak is surfaces that render `title` raw — fixed at the shared readback/list components |
| P1-7 | Engineering prose in normal UI (deterministic prioritization, "no AI", monitoring-only notes) | Moved to `<details>`/help; guard: identified implementation-prose keys may not be rendered as persistent copy |

### P2 — generic SaaS representations / distinctive domain patterns

| # | Root cause | Correction |
|---|---|---|
| P2-1 | Admin home = KPI band | Attention-first queues (object rows with counts) + areas |
| P2-2 | "Ops workspace" counters card (`company-ops-workspace`: pending/accepted/members/review as 4 KPI tiles) | Folded into the People door as the roster's own summary line; counts stay, tiles go |
| P2-3 | Assignment "connections" card (4 generic link tiles) | Replaced by the doors (calendar, map, evidence, planning are doors or live inside Darbai/Istorija) |

---

## 4. Global navigation classification (owner question)

| Item | Class | Where it lives after this pass |
|---|---|---|
| Kalendorius | contextual view (person: own agenda `/dashboard/planning`; organization: `/dashboard/company/planning`) | worker: PAKLAUSK/ŠIANDIEN stations; organization: door |
| Žinutės | cross-cutting tool | notification bell + conversation nav (`/dashboard/communication`) |
| Žemėlapis | contextual discovery view | worker PASAULIS; organization: inside Darbai (project map) and the command search |
| Ryšiai | cross-cutting tool (invitations, relationships) | `/dashboard/network` from People ("pakviesti") and Partners; command search |
| Administravimas | administration | avatar menu (admins only); never a product tab |

Equal-weight feature tabs are therefore not the product's navigation: every
product route already renders the ONE TOP BAR (`DashboardChrome` mode
`panel`), and the organization context now carries its doors. The legacy wide
tab row (Kalendorius · Žinutės · Žemėlapis · Ryšiai · Administravimas) still
renders in ONE place — the admin console's `full` chrome — because retiring it
touches eight guard files that pin that chrome (`dashboard-header-reachability`,
`mobile-tap-targets`, `worker-nav-human-labels`, `product-readiness`, …) and is
a slice of its own. **QUEUED, not done in this pass:** admin routes switch to
the `panel` chrome; `fullHeader`/`fullBottomNav` slots and `DashboardTabs` go
with it. `lib/config/navigation.ts` (the catalogue-derived list the command
search and the worker bar read) is untouched — the Product Gate's
`chat_importance_reduced` rule and the CORE loop stay as declared.

---

## 5. What this pass does NOT do (honest scope)

- No schema, RLS or authority change. Every new write in the importer goes
  through an existing authorized path (`organization_people` insert policy;
  `create_work_object_v1`). If a future source needs a structure with no
  authorized write path, that is a RED packet, not a silent workaround.
- No redesign of the worker surfaces (IA 01), of `/opportunities` or
  `/journal` (queued), of `/company/scouting` or `/company/planning`.
- No HUMAN_UI_PROVEN claim. Every item below the line in §7 is HUMAN_UI_PROOF_ONLY.

---

## 6. Guards added (objective regressions only)

`apps/web/lib/guards/product-ia-anti-slop.test.ts`:

1. organization doors: every door route exists, is classified in the route
   truth map, is declared in the surface registry, and is reachable from the
   `OrganizationDoors` component (no dead door);
2. the company hub may not regrow: the Dabar page imports none of the moved
   sections, and stays under a line budget;
3. `hours-import` for an organization resolves to the history door, never to
   `/dashboard/hours?import=1`;
4. the importer's preview exposes a plan with `willCreatePeople` /
   `willCreateObjects` and `commitImport` applies it (no prerequisite
   regression: a row whose only problem is `person_not_on_roster` is
   committable through the plan);
5. preview-before-commit: the commit form still requires the minted commit
   token; `buildPreview` still returns `persisted: false`;
6. synthetic fixture leakage: the shared cross-organization readers call the
   one predicate; no product-owned message contains `QA-SYNTHETIC`, `E2E`,
   `[EN]` or the banned implementation-prose keys as persistent copy;
7. LT product copy: the org-door namespace and the moved sections' namespaces
   contain no untranslated English literals (tokens outside the allow-list).

The subjective test stays human: `docs/design/final/ANTI-SLOP-REVIEW-CHECKLIST.md`.

---

## 7. Evidence and remaining items (delivery 2026-09-16, branch `feat/cc/product-ia-correction`)

Deterministic evidence, all local, all on the committed diff:

| Check | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `eslint` | 0 errors (43 pre-existing warnings, none in touched files) |
| `next build` | exit 0 — 863 static pages; the six door routes prerender in every active locale |
| `vitest run` (full: guards + unit) | 23,341 passed, 2 skipped, 1 failed — `booking-atomic-double-booking.test.ts`, a pre-existing Windows CRLF `indexOf("
    <div…")` failure unrelated to this diff (see memory "Windows-only guard failures") |
| `product-ia-anti-slop.test.ts` (new) | 73 tests, all passing — doors · hub regrowth · chat→history · plan · preview-before-commit · fixtures · LT copy · ISO-week |
| `node .github/scripts/product-gate.mjs` | the six doors produce A-14 **notices only** (excused by their ruled `distinctSurface` blocks); the 42 errors are the known waiver-scoped findings that resolve only on a PR run (`pr-not-covered`), untouched by this diff |
| Re-anchored guards | 44 guard / unit files repointed from the hub to the door that now holds the pinned behaviour; no pinned behaviour was dropped |

Before / after, deterministic:

| Question | Before (`main` `bfdbdf53`) | After |
|---|---|---|
| Lines in `/dashboard/company/page.tsx` | 1,709 | 329 (budget < 420, guarded) |
| Sections mounted on the hub | ~25 across six domains | header · decisions · home field · 4 primary actions |
| Chat "noriu įkelti istorinius duomenis" (organization) | chip → `/dashboard/hours?import=1` → "Pirmiausia sukurkite bent vieną objektą." | chip → `/dashboard/company/history` (the one import engine) |
| Import row with an unknown person | `person_not_on_roster`, not committable; per-row create form | `readyWithPlan`; plan says "N naujus paruošiau sukurti"; commit creates via `createRosterPerson` then writes |
| Import row with an unknown site | label kept, no object | plan creates it via `create_work_object_v1`, links `work_object_id` |
| Source "week 50" + date 2025-12-15 | no comparison | `derived.calendarWeek = 51`, method `iso_week_conflicts_with_source_week`, note `source_week=50`, raw cell untouched (unit-tested) |
| `[QA-SYNTHETIC]` rows on cross-org readers | rendered | filtered by ONE predicate at the three shared readers |
| Admin home | 6 KPI tiles + 2 monitoring notes + review help prose | attention rows (queue doors with counts) + one summary sentence; help in `<details>` |

No schema, RLS or authority change. No migration. GREEN class.

Remaining — HUMAN_UI_PROOF_ONLY (not claimed): the owner walks Dabar → each
door on a phone and a laptop; uploads the real XLSX and reads the plan; types
"noriu įkelti istorinius duomenis" and lands on Istorija; reads the admin
console. Queued slices: admin chrome → `panel` (§4); `/opportunities` and
`/journal` progressive disclosure (§1.2).
