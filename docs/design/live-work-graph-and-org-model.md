# Live Work Graph levels, and the Company / Team visual model

> Status: 2026-10-02. Companion to `docs/DESIGN_SYSTEM.md`. TARGET vs STATUS are kept
> separate (canonical architecture rule). Nothing here invents a backend capability.

## Visual language, not one component

A graph is used **only where relationships are the question**. Other questions get other forms:

| Question | Form | Where it lives |
|---|---|---|
| How does what I do become what I can do next? (relationships) | graph | `WorkLifecycleGraph` (L1), `WorkContextMap` (L2) |
| When / what is planned? (time) | calendar / rhythm | `/dashboard/planning` `WorkWeek`, `WorkDay` (KEEP) |
| How far has this record got? (standing) | **evidence chain** | `EvidenceChain` (one grammar, everywhere) |
| What did I do, over time? (history) | timeline + work bars | `LivingCvStory`, `work-history-timeline` |
| Who is this, anywhere? (identity) | persistent person | `PersonPortrait` + `PersonIdentityCard` |
| Who is on what? (responsibility) | team/project structure | `PersonIdentityCard` rows grouped by project (see below) |

## Levels

| Level | Audience | Source of truth | Status |
|---|---|---|---|
| **L1 — Explanation** | public visitor | i18n copy, labelled example persona | WORKING, deployed (`/for-workers`, `/for-companies`, `/` two-sides) |
| **L2 — Context** | authenticated professional | the ONE `WorkerPlayerCard` via pure `buildWorkContext(card)` | BUILT + fixture-proven; mounted in the profile hub; AUTHENTICATED_PROOF_BLOCKED for production |
| **L3 — Operations** | company / manager | see below | TARGET + data-gap list; not built |

**No duplicated truth.** L2 computes no fact: counts and `unavailable` markers are the card's own
(`unavailable` ⇒ node `unknown`, never zero). A node is `done` (data), `absent` (empty source) or
`unknown` (unreadable). Every node opens the surface that owns its fact.

## Level 3 — the company map (target architecture)

```
COMPANY → PROJECTS → TEAMS → PROFESSIONALS → WORK → EVIDENCE → PROGRESS → ATTENTION
```

It must stay an *alternate understanding / navigation layer*, not the whole UI, and clicking a node must
open real context (professional → `/dashboard/people/[workerId]`; project → `/dashboard/projects/[id]`;
evidence → the Work Journal day; team → `/dashboard/company/people`; need → `/dashboard/company/needs`).

### What already answers the manager's questions (KEEP)

| Question | Existing source |
|---|---|
| Who is here | `LinkedCompanyWorker` + `OrganizationRosterSection` (`PersonIdentityCard`, `team-member`) |
| Doing what / which project | `LinkedCompanyWorker.currentProjects` (titles), `HomeProjectRow.peopleNames` |
| Where | `ManagedProject.city/country`, `LinkedCompanyWorker.locationCountry` |
| Available | `CapacityChatResult` (free / committed / unavailable + `commitmentsKnown` / `absencesKnown`), `TeamDetails.availabilityStatus` |
| Needs attention | `OpeningBrief`, `RiskSignal`, decision-entry strip, `FieldSlot` states |
| Awaiting confirmation | `countReviewablePendingEntries`, `ConfirmPulse`, `OfferDecisionButtons` |
| Completed | project `status`, done `StageStatus`, `getProjectsProgress` |

### Honest DATA GAPS (these block an L3 map; none may be faked)

1. **No person × project × today matrix.** There is no shift / attendance source: `OrganizationToday.roster`
   is a count and says it never claims "who is working".
2. `currentProjects` is title-only (no id, role, dates) — a node cannot link to its project yet.
3. `project_worker_assignments` has no planned start/end — "next" for a person is not derivable.
4. Team/brigade members are not linked to projects or capacity; team availability is self-declared (`team_details`).
5. No org-level aggregate of "completed today".
6. Planning items carry a counterpart *name string* only — no person/team id — so a calendar item cannot
   open its person yet.

Each gap is a backend/data decision (some RED: schema). They are listed so the L3 build starts from fact.

### Interim visual proposal (no new data needed)

`PersonIdentityCard` (compact) rows **grouped by project** using `currentProjects` + `ProjectAssignment`,
each row carrying the `EvidenceChain`-grammar state for *pending reviews* and the capacity state. This answers
WHO / WHAT / WHICH PROJECT / AVAILABLE / ATTENTION from today's data and is the right stepping stone to L3.

## Calendar verdict (source audit, no authenticated screenshots)

KEEP. `WorkWeek` already shows the week's rhythm, work blocks with organization · project · place, the
confirmation mark, plan bands with explicit conflict flags, and links through to journal/source.

Findings to act on (small, not a rebuild):
- A block whose confirmation could not be read (`confirmed === null`) renders like "not confirmed" — UNKNOWN ≠ ZERO.
- Items have no person/team id and no availability field; "shift → person/team/project" needs the data gap above.
- Conflicts are surfaced but offer no next action (the override/decision loop is `J-TIME-FREEDOM`, BROKEN in product-truth).

## Shared pieces added in this program

`PersonPortrait` (one 4:5 portrait) · `EvidenceChain` (+ `deriveEvidenceChain`) · `WorkContextMap`
(+ `buildWorkContext`) · `LivingCvStory` · truthful fixture states (`SampleCardState`).
