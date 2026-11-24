# Company as Sports Team — model v1

Translation of the owner's "labour market like sports teams" intuition into product language. This is a **vocabulary doc** — it doesn't change schema or UI by itself. It standardises the words we use so future tabs / labels / docs all reach for the same metaphor.

## Why this metaphor

Construction crews, agency rosters, and pilot project teams all behave like sports teams much more than they behave like job boards:

- A team holds **players** (workers).
- Players have **roles** they play (carpenter, plasterer, foreman — analogous to forward, defender, keeper).
- Players have **form** (current state — well-rested, injured, on the bench, in training).
- Teams field a **lineup** for each **match** (a project / job / event).
- Outside the team, there are **scouts** (agencies) who help find players and **transfers** (placements between teams).
- The team has a **club** (the company itself, with its history, identity, badge).
- The customer / buyer is a **fixture organiser** — they need an event done.

The current product already implicitly uses some of these concepts (engagement_contexts, profession, worker_skills) but the vocabulary doesn't match the metaphor — workers see "Engagement" + "Profession" + "Skill" labels that read like an HR system.

## Vocabulary map

| Sports concept | Product concept | DB / code anchor |
|---|---|---|
| Team / club | Company (`organizations` row, `organization_type='company'`) | `engagement_contexts.organization_id` |
| Player / member | Worker | `workers`, `profiles` |
| Player's position | Profession | `professions`, `worker_professions` |
| Player's traits | Skills | `worker_skills`, `profile_skill_claims` |
| Player's form | Readiness / availability | NOT yet modeled — proposed `worker_availability` (future migration) |
| Lineup | Active assignments per project | `engagement_contexts` filtered by relationship_slug + `status='active'` |
| Bench | Engagements with `status='inactive'` or `status='preparing'` | `engagement_contexts.status` |
| Match / event / fixture | Project | `projects` (table exists) |
| Match performance | Journal entries during that project | `journal_entries.engagement_context_id` |
| Scout | Agency | `organizations.organization_type='agency'` |
| Transfer | Move between engagement_contexts | Not modeled as a first-class event yet |
| Coach / manager | Company / agency representative with confirmation rights | `journal_entry_confirmations.confirmer_id` (per PR #18, draft) |
| Trust / reputation | Confirmed skills + journal evidence aggregate | `worker_skills.confidence_bin` + future `platform_skill_aggregates` |
| Trophy / proof | Confirmed journal entries with external attestation | PR #18 backbone |

## What this changes in v1

**Doc-only.** No schema rename, no UI relabel, no migration. The vocabulary lands in:

1. This doc — referenced by future PRs that touch team-related surfaces.
2. The "team / roster / lineup" copy on company / agency dashboards — small additive copy, planned in the team-management audit (`docs/audit/team-management-gap-audit-v1.md`).
3. Future labels in the role switcher tooltip + onboarding role-picker subcopy.

## What this does NOT mean

- We are NOT building a sports app, a fantasy-football UI, or any kind of gamification with badges/points.
- We are NOT adopting the metaphor in legal / financial / privacy docs — those stay precise ("worker", "company", "agency", "client").
- We are NOT renaming `workers` to `players` in the database. Code stays workers/professions/engagements.

The metaphor is a **mental model** for designers, copywriters, and the product team. It surfaces as plain-language copy where it helps a worker / company understand the relationship; otherwise it stays behind the scenes.

## Where the metaphor extends beyond v1

The natural next moves (NOT in this sprint):

- **Worker form / availability calendar** — "available next week", "on-leave Sept 12–18", "currently on project X" — a real readiness signal employers want.
- **Lineup view** for a company workspace — "your active workers + this week's assignments".
- **Bench list** — workers who are part of the team but not currently assigned.
- **Transfer flow** — an agency proposes moving a worker from one company engagement to another, with the worker's consent.
- **Match recap** — a project's journal entries collapsed into a project-level "what got built" summary.

Each of these is a separate doc + audit + small implementation slice. None of them are in this sprint.

## See also

- `docs/audit/team-management-gap-audit-v1.md` — what already exists in code that supports this model, and what's missing.
- `docs/policies/account-and-role-model-v1.md` — the underlying account / role layering.
- PR #18 (draft) — manager confirmation backbone, which lights up the "trophy / proof" layer.
