# W12 — Calendar, time & conflicts: current truth

**Date:** 2026-08-07 · **Base:** `main` at `162cacb3`
**Scope:** source inventory + architecture truth. No migration, no code change.

---

## 1. The correction this audit makes

The matrix carries W12's gap as:

> **9 calendar sources with NO model** (availability, shifts, vacation, sick,
> meetings, holidays, service-order TEXT dates, instruction due dates, travel)

**Two of those nine now have real models and are already in the projection.**
Vacation and sick leave are both `worker_absences`
(`20260718150000_leave_absence`, **APPLIED**, ledger row 859), read by
`getMyAbsences` and joined to the agenda as the `absence` source — approved
absences even participate in conflict detection.

The honest count is **seven** unmodelled sources, not nine.

---

## 2. The architecture is stronger than "sources are missing" suggests

W12 already has the property that matters most and is hardest to retrofit:
**one calculation, every presentation.**

`getPlanning` → `buildAgenda` is the single canonical projection. It is read by:

- the planning page (`/dashboard/planning`),
- the chat sentence (`loadContextBrief`),
- the `?result=calendar` panel (`lib/planning/calendar-result.ts`).

That module states the rule explicitly — it *"builds NO view of its own, reads NO
table of its own, and adds NO second truth store"*. So the anti-second-calendar
rule holds **by construction**, not by discipline. Any new source joins once and
appears in all three surfaces.

### 2.1 Sources WITH a model, in the projection today

| Source | Model | Notes |
|---|---|---|
| `booking` | `booking_requests` | the atomic double-booking guard's subject |
| `project` | `projects` | dated project bands |
| `stage` | `project_stages` | dated stages of visible projects |
| `task` | `work_tasks` | due dates (migration **APPLIED** 2026-07-11) |
| `absence` | `worker_absences` | **vacation + sick leave** — both matrix "gaps" |
| `journal` | `journal_entries` | FACT joining the plan at its recorded day |
| `finance` | `finance_records` | dated financial obligations |
| `invitation` | invitations (both directions) | deduped into single items |

**Eight real sources**, each with its own `PlanningSourceState`. A source that
cannot be read is **named** in `degraded`, so a partial answer can never present
itself as complete — the same honesty contract the notification spine follows.

### 2.2 Sources still without a model

availability · shifts · meetings · public holidays · service-order **text** dates ·
instruction due dates · travel time.

Each is an additive schema + UI, therefore **owner-gated**. The matrix's named
next step — *"source #7: real date columns on `customer_requests` (the only
source with an existing model)"* — remains the correct first one, because it is
the only one whose host table already exists.

---

## 3. What is proven, and what is not

| Claim | State |
|---|---|
| Atomic double-booking guard (row lock + advisory lock + `EXCLUDE gist`) | **APPLIED** `20260802150000`; 21/21 concurrency proof local |
| Cross-company conflict detection | **PROVEN LIVE** in the §5 journey |
| Open-ended booking semantics | `coalesce(expected_end_date, start_date)` collapses an end-less booking to its START DAY, so protection is absent from day two. The **honesty half shipped** (the form says an empty end books one day, `aria-describedby`); the capability half is **OWNER-GATED** and needs 5 product definitions |
| Production race | **UNEXERCISED** — 0 bookings in prod |
| Booking → engagement multi-company resolution | Draft **#1047**, owner-gated, UNAPPLIED |

---

## 3.5 Time presentation — the canonical model, determined from code (2026-08-07)

**Status: `W12_TIMEZONE_MODEL_DETERMINED_UTC__PRESENTATION_INCONSISTENCY_FOUND`**

The train asked whether the canonical model is *UTC storage → user-local
display*, or something else actually supported by the code. It is neither of the
two obvious answers:

> **The canonical model is UTC storage → *UTC* display.** Not user-local.

Every server-side formatter pins it explicitly — `lib/planning/calendar-result.ts`,
`lib/conversation/agenda-summary.ts`, `lib/player-card/labels.ts`,
`lib/opportunities/structured-public.ts`, `lib/ai-workspace/workflows.ts` all pass
`timeZone: "UTC"` — and every calendar-day computation in
`lib/planning/planning-model.ts` is UTC string math (`getUTCHours`,
`setUTCDate`, `toISOString().slice(0,10)`), with the doc comments saying so.

**That is a defensible choice, not an accident.** A labour-market "work day" is a
business date, not an instant; pinning UTC keeps a booking on the same calendar
day for everyone who reads it. **No organisation timezone exists in the schema,
and none is invented here.**

### 3.5.1 ⚠️ The inconsistency: 15 surfaces render in BROWSER-LOCAL time

The canonical projection is UTC, but every date rendered directly by a client
component uses `toLocaleDateString(locale)` with **no `timeZone`**, so it formats
in the *viewer's* timezone:

`capability-profile-section` · `cv-engagement-cards` · `handover-passport-panel` ·
`invitation-list` · `journal-inbox-entry` · `manager-evidence-card` ·
`profile-hub-overview` · `quick-confirm-batch` · `quick-confirm-card` ·
`worker-readiness-summary` · `cv/page` · `admin/pilots/[id]/page` ·
`inbox/report/page` · `journal/page` · `invite/[token]/page`

**The consequence is concrete.** For a viewer at UTC+3, a journal entry recorded
at 23:30 UTC on the 7th shows as **the 7th** in the planning agenda and **the
8th** in the journal inbox. Same row, same person, two calendar days — and
nothing on screen explains the difference.

This is exactly the "duplicate time truth" the train's §5 asks about. Earlier
this was reported as *"nothing to eliminate — there is no second calendar
store"*. That remains true of **storage**; this is a second time truth in
**presentation**, which the storage-level check could not see.

### 3.5.2 One strictly-worse instance

`components/app/handover-passport-panel.tsx:154` calls
`new Date(e.createdAt).toLocaleDateString()` with **no locale argument at all** —
the only such call in the codebase. It therefore ignores the user's chosen app
locale as well as UTC, rendering in the browser's locale (an LT user can see
US month-day order). The component has no `locale` in scope, so the fix is a
small thread-through, not a one-character change.

### 3.5.3 The prepared slice (zero migration, NOT implemented)

1. one shared client formatter that pins `timeZone: "UTC"` and takes the app
   locale, mirroring what the five server formatters already do;
2. the 15 call sites routed through it;
3. `handover-passport-panel` additionally given its locale;
4. a guard: no `toLocaleDateString` / `toLocaleTimeString` outside that helper —
   the same ratchet shape the repo already uses elsewhere;
5. browser proof at 1440 + 375 with the browser timezone forced to a non-UTC
   zone, which is the only way this class of bug is visible at all.

**Not done in this train** — it touches 15 surfaces and needs the forced-timezone
browser proof to be worth anything. Recorded here with the exact file list so the
next session starts from evidence rather than from a grep.

**No owner decision is required for the fix**, because it makes the client agree
with the canonical projection that already exists. An owner decision *would* be
required only to change the model itself (UTC → viewer-local everywhere), which
this audit does not propose.

---

## 4. Safe work available (none blocked on the owner)

| Item | Why it is safe |
|---|---|
| **A — source inventory** | done, this document |
| **B — timezone clarity** | **DONE as an audit (§3.5)**: the canonical model is UTC storage → **UTC** display, pinned in all five server formatters. But 15 client surfaces render in BROWSER-LOCAL time, so the same row can show two different calendar days. Prepared slice in §3.5.3, zero migration, not implemented |
| **C — UI explanation of conflicts** | conflicts are already marked and counted on the item; explaining *why* two items conflict is presentation only |
| **D — projection consistency** | already guaranteed by §2's single-calculation rule; a guard pinning that no second reader appears would make it enforced rather than conventional |
| **E — date-format consistency** | one formatter is already used server-side for the panel; verify the planning page and chat sentence share it |
| **F — duplicate time truth elimination** | **REOPENED (§3.5.1).** True of STORAGE — there is no second calendar store. NOT true of PRESENTATION: the UTC projection and 15 browser-local client renderers are a second time truth, which the storage-level check could not see |
| **G — travel-time seam** | interface-only, no paid provider. Genuinely safe, but it is the seam for a source with no model, so it is scaffolding for owner-gated work |
| **H — browser/mobile proof** | safe |

**None of A–H was implemented in this train.** They are recorded as available,
not done — the train's implementation effort went to W11 F7, W8 candidates and
the W10 matching-truth fix.

---

## 5. Resulting state

`W12_SAFE_TECHNICAL_WORK_AVAILABLE_NOT_STARTED`
· `W12_TIMEZONE_MODEL_DETERMINED_UTC__PRESENTATION_INCONSISTENCY_FOUND` (§3.5, 2026-08-07)

W12's blockers are **not** architectural. The projection is single-source, the
guard is applied and proven, and the honesty contract holds. What remains is
seven owner-gated data models plus a set of presentation improvements that no
owner input blocks.

**Correction to carry forward:** stop describing W12 as "9 sources with no
model". It is **seven**, and the two that moved (vacation, sick) moved because
`worker_absences` shipped and was applied.
