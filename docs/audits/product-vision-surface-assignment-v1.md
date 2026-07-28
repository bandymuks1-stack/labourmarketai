# Product Vision — surface assignment & consolidation plan v1

| Field | Value |
|---|---|
| Date | 2026-07-28 |
| Authority | `docs/product/PRODUCT_VISION_LOCK_V1.md` (owner text, 2026-07-28) |
| Scope | **Assignment only.** Nothing fixed, moved, merged, renamed or deleted |
| Method | All 118 routes; each user-visible screen assigned to exactly ONE of the twelve world elements |
| Verdicts | `KEEP` · `CONSOLIDATE` (belongs to an element, but duplicates another surface of it) · `REMOVE` (belongs to no element, or is a "not a product" surface by the owner's own words) |

## Result in one line

**48 dashboard + 39 public = 87 user-visible surfaces.**
**KEEP 61 · CONSOLIDATE 19 · REMOVE 7.**

The owner's text decides most of it directly: *"Inbox nėra produktas. Bookings
nėra produktas. Requests nėra produktas. Candidates nėra produktas."* — that
sentence alone accounts for 6 of the surfaces below.

---

## 1. Dashboard surfaces (48)

### Element 1 — AI Conversation

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard` | **KEEP** | This IS the element |
| `/dashboard/assist` | **REMOVE** | *"Negali būti antro AI"* — a second AI surface |
| `/dashboard/advanced` | **CONSOLIDATE** | *"Negali būti lygiaverčio valdymo būdo"* — a second, equally-ranked way to operate the product (917 lines). **Decision zero** |

### Element 2 — User Avatar

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/profile` | **KEEP** | The avatar's own surface |
| `/dashboard/account` | **KEEP** | Settings on the avatar |
| `/dashboard/privacy` | **CONSOLIDATE** → `account` | Settings-shaped; one avatar, one settings home |
| `/dashboard/people/[workerId]` | **KEEP** | Another avatar, viewed |
| `/dashboard/buyer` | **CONSOLIDATE** | A role view of the avatar, not its own element |

### Element 3 — Market World Map

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/market-map` | **KEEP** | This IS the element — *"Map tampa pagrindiniu pasaulio atvaizdavimu"* |
| `/dashboard/opportunities` | **CONSOLIDATE** → map layer | Demand signals are a **layer**, not a screen |
| `/dashboard/listings` | **CONSOLIDATE** → map layer | Same layer, second surface |
| `/dashboard/intelligence` | **CONSOLIDATE** → map layer | Market signals are a layer |
| `/dashboard/market/recognize` | **REMOVE** | 25-line entry point; a chat intent |

### Element 4 — Objects

| Route | Verdict | Reason |
|---|---|---|
| — | **GAP** | **No surface implements Objects as the owner defines them** (a place of activity with its own history). Today objects exist only as project/demand attributes. See §4 |

### Element 5 — Organizations

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/company` | **KEEP** | The organization workspace |
| `/dashboard/company/scouting` | **CONSOLIDATE** | Finding people = a map/communication act, not a separate org surface |
| `/dashboard/commercial` | **KEEP** | Organization's commercial records (44 lines) |
| `/dashboard/services` | **CONSOLIDATE** → organization offerings | An org attribute, not an element |
| `/dashboard/finance` | **KEEP** | Organization's money records |

### Element 6 — Projects

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/projects` | **KEEP** | Project list |
| `/dashboard/projects/[id]` | **KEEP** | One project |
| `/dashboard/projects/[id]/operations` | **KEEP** | Project execution |
| `/dashboard/company/projects/new` | **REMOVE** | 42 lines; *"Negalima kurti naujų wizard"* — a chat intent |
| `/dashboard/tasks` | **KEEP** | Work inside projects |
| `/dashboard/planning` | **KEEP** | THE calendar across projects |
| `/dashboard/company/planning` | **CONSOLIDATE** → `planning` | Two calendars for one element |
| `/dashboard/instructions` | **KEEP** | Work instructions on projects |
| `/dashboard/assets` | **KEEP** | Assets used by projects |
| `/dashboard/absences` | **KEEP** | Availability against projects |

### Element 7 — Teams

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/network` | **KEEP** | The avatar's teams/network |

### Element 8 — Work Journal

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/journal` | **KEEP** | This IS the element — but *"nėra atskiras produktas"*, so it must read as part of the conversation and the avatar |
| `/dashboard/journal/voice` | **CONSOLIDATE** → `journal` | An input mode, not a surface |
| `/dashboard/reports` | **KEEP** | Journal-derived output |
| `/dashboard/reports/evidence` | **KEEP** | Journal-derived proof |
| `/dashboard/activity` | **CONSOLIDATE** | Activity is the journal + conversation, not a third place |

### Element 9 — Skills

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/learning` | **KEEP** | Skill development |
| *(skills surfaces live inside profile/journal today)* | — | Consistent with *"pagrindinis šaltinis yra darbo žurnalas"* |

### Element 10 — Reputation

| Route | Verdict | Reason |
|---|---|---|
| — | **GAP (user-facing)** | Leagues exist only as an admin surface today (`/dashboard/admin/league`). See §4 |

### Element 11 — Documents

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/documents` | **KEEP** | This IS the element |
| `/dashboard/gallery` | **CONSOLIDATE** → `documents` | Photo evidence is a document type |

### Element 12 — Communication

The owner's sentence decides this block outright.

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/communication` | **KEEP** | Threads with real counterparties |
| `/dashboard/communication/[id]` | **KEEP** | One thread |
| `/dashboard/inbox` | **REMOVE** | *"Inbox nėra produktas"* |
| `/dashboard/inbox/quick` | **REMOVE** | Same |
| `/dashboard/inbox/report` | **CONSOLIDATE** → `reports` | A report, not an inbox |
| `/dashboard/bookings` | **REMOVE** | *"Bookings nėra produktas"* |
| `/dashboard/service-requests` | **REMOVE** | *"Requests nėra produktas"* |
| `/dashboard/candidates` | **REMOVE** | *"Candidates nėra produktas"* |

### Belongs to no element — setup

| Route | Verdict | Reason |
|---|---|---|
| `/dashboard/start` | **CONSOLIDATE** → conversation | Setup is a dialogue |
| `/dashboard/start/buyer` | **CONSOLIDATE** → conversation | Same |
| `/dashboard/start/company` | **CONSOLIDATE** → conversation | Same |

---

## 2. Public surfaces (39)

Acquisition, legal and auth are **outside the world-element model** — they exist
before the user has an avatar. Verdict for all: **KEEP**, with two notes.

| Group | Routes | Verdict |
|---|---|---|
| Marketing | `/`, `/about`, `/vision`, `/pricing`, `/for-workers`, `/for-companies`, `/for-agencies`, `/professions`, `/skills`, `/questions*` (3), `/labour-market*` (2), `/work-abroad`, `/work-opportunities`, `/business/[slug]`, `/calculators/project-cost`, `/match-preview` | KEEP |
| Intake | `/worker-intake`, `/company-need` | KEEP — **must hand off to the conversation once signed in** |
| Identity | `/cv` | KEEP — the avatar's public face |
| Legal | 7 × `/legal/*` | KEEP |
| Auth | 4 × `/auth/*`, `/onboarding` | KEEP, except **`/onboarding` → CONSOLIDATE into the conversation** |
| Catch-all | `/[...rest]` | KEEP |
| Dev previews | `/design`, `/design/text-first`, `/design/conversation` | **INTERNAL ONLY** |

---

## 3. Summary

| Verdict | Count | Weight |
|---|---|---|
| **KEEP** | 61 | The canonical world |
| **CONSOLIDATE** | 19 | Belong to an element, but are a second surface of it |
| **REMOVE** | 7 | Belong to no element, or the owner's text says they are not products |

**REMOVE list (7):** `assist` · `market/recognize` · `company/projects/new` ·
`inbox` · `inbox/quick` · `bookings` · `service-requests` · `candidates`
*(8 routes; `inbox/report` is a CONSOLIDATE, not a REMOVE)*.

If executed: **87 → ~61 user-visible surfaces (−30 %)**, and every remaining
surface is provably an extension of one of the twelve elements.

---

## 4. Two gaps the vision names but the product does not have

Recorded because a gap is as important as a duplicate — and neither is fixed here.

| Element | State today | Consequence |
|---|---|---|
| **Objects** | No surface. Objects exist only as attributes of projects/demands — no place-of-activity entity, no object history | *"Objektai turi savo istoriją"* is not implemented. This is the largest structural gap between the locked vision and the product |
| **Reputation / Leagues** | Admin-only (`/dashboard/admin/league`); no user-facing reputation | *"Lygos … remiasi tik realia veikla"* — the data source (journal) exists, the surface does not |

Both are **new build**, not consolidation, and both must go through the same
eleven-answer declaration.

---

## 5. Execution order (unchanged from the consolidation map, now element-driven)

| Wave | Content | Element |
|---|---|---|
| **0** | Owner decides `/dashboard/advanced` (keep / fold / demote) | AI Conversation |
| **1** | Setup → conversation (`onboarding`, `start*`) | AI Conversation |
| **2** | Remove the four "not a product" surfaces (inbox, bookings, requests, candidates) — the AI opens context instead | Communication |
| **3** | `assist` → the conversation | AI Conversation |
| **4** | Map layers: `opportunities`, `listings`, `intelligence` become layers | Market World Map |
| **5** | Small merges: `journal/voice`, `gallery`, `privacy`, `company/planning`, `activity`, `inbox/report` | various |
| **6** | Remove the two thin routes (`market/recognize`, `company/projects/new`) | Map / Projects |
| **7** | Mark internal surfaces | — |
| **8** | *(new build, separate)* Objects + Reputation | Objects, Reputation |

---

*Assignment only. Nothing was changed. Execution begins only after explicit
owner approval of §3 and §5.*
