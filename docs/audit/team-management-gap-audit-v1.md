# Team management — gap audit v1

Reading the current code against the sports-team vocabulary in
`docs/vision/company-as-sports-team-model-v1.md`. Identifies what already
works, what's missing, and what the smallest safe next implementation
slice would be.

## What exists today

### Schema layer

| Sports concept | Code support | State |
|---|---|---|
| Team / club | `organizations` table (`organization_type='company'`) + `engagement_contexts.organization_id` | **present** |
| Player | `workers` table, `engagement_contexts.profile_id` | **present** |
| Player's position | `professions` table + `worker_professions` m:n | **present** |
| Player's traits | `worker_skills` + `profile_skill_claims` (per PR #45) | **present (skill state is binned: red / green / yellow)** |
| Lineup (active assignments) | `engagement_contexts` filtered by relationship_slug + status | **present (schema), partial (UI)** |
| Bench | `engagement_contexts.status in ('inactive','preparing')` | **present (schema), no UI surface** |
| Match / event | `projects` table | **present (schema), no project-detail UI** |
| Match performance | `journal_entries.engagement_context_id` | **present** |
| Scout | `organizations.organization_type='agency'` + `agency_workers` | **present** |
| Transfer | not modeled as a first-class event | **missing** |
| Coach / manager | (per PR #18 draft) `journal_entry_confirmations.confirmer_id` | **draft (PR #18)** |
| Trophy / proof | aggregated confirmed entries | **missing UI; backbone in PR #18** |

### UI layer

| Surface | What it shows | Sports-team interpretation |
|---|---|---|
| `/lt/dashboard` (worker) | Worker's profile + skills + journal pointer | Player's "my card" |
| `/lt/dashboard/profile` | Profile text → skill suggestions → confirmed claims | Player traits + how they're built |
| `/lt/dashboard/journal` | Worker's journal entries + composer | Match performance log |
| `/lt/dashboard/company` (per PR #54) | Company workspace + draft form | Club admin view (very early) |
| `/lt/dashboard/agency` | Agency workspace + draft form | Scout's roster intent |
| `/lt/dashboard/buyer` | Buyer workspace + draft form | Fixture organiser's request |
| `/lt/dashboard/admin` | Admin metrics + hub links | League office |

What's clearly **missing** from a team-management perspective:

1. **No "roster" or "lineup" UI on company workspace.** The company workspace today is just the draft form — there's no list of the company's currently-engaged workers, no "who's on the bench", no "who's assigned to what project".
2. **No "team page" on a worker's profile.** A worker doesn't see "you're currently a player on Team X, Team Y" in any list format.
3. **No availability / form signal.** Workers can't say "I'm available next week" or "I'm out Sept 12–18". Companies/agencies can't see who's available.
4. **No transfer flow.** Moving a worker between engagements requires hand-editing `engagement_contexts` rows; no first-class "agency proposes a placement / worker accepts" event.
5. **No project-detail page.** `projects` rows exist but no `/projects/[id]` route surfaces a project's lineup, schedule, journal recap.
6. **No "trophy / proof" public-or-semi-public view.** Confirmed journal entries (when PR #18 lights up confirmations) aren't yet surfaced anywhere except inside the worker's private journal list.

## Smallest safe next implementation slice

If the next sprint adds one team-management slice, the cheapest high-impact pick is:

### A. "Team / roster" compact card on company / agency dashboard

A read-only card titled **Komanda** (Team) on the company workspace and **Roster** (Sąrašas) on the agency workspace. Lists the workers currently engaged with this org (`engagement_contexts` filtered by `organization_id` + `status='active'` + worker-relationships).

Each row: worker name, relationship_slug ("employee" / "freelancer" / "consultant" / etc.), and a small "Į dienoraštį →" link to the worker's profile (gated by RLS — only renders the link if the company admin has read access to that worker).

No mutations. No availability calendar yet. No invite flow.

**Why this first:** it surfaces the sports-team vocabulary AND gives company / agency testers something visible to react to. The schema already exists; the UI is one server-component card + one tiny copy block.

### B. (next, not in this sprint) Bench section + draft-to-roster connection

A second card showing engagements with `status='preparing'` ("recruits / negotiations"). Connects naturally to the existing pilot_drafts data (a saved `company_request` draft = a position the company is recruiting for).

### C. (later) Worker-side "My teams" card

A worker sees a "Mano komandos" card on their dashboard listing the orgs they're engaged with + their role per team.

## What we deliberately DON'T do

- **Don't rename `workers` table to `players` etc.** The vocabulary is UI-level.
- **Don't add gamification (points, badges, leaderboards).** Doctrine forbids fake achievement claims.
- **Don't build a calendar in v1.** Availability calendar is a real product slice with its own audit; not a sprint-friendly add-on.
- **Don't expose roster lists publicly.** RLS gates everything; the company admin's view is admin-only via `engagement_contexts.organization_id` + `manages_organization`.

## See also

- `docs/vision/company-as-sports-team-model-v1.md` — vocabulary.
- `apps/web/components/app/pilot-draft-form.tsx` — closest existing UI to a team-management surface.
- `supabase/migrations/0013_work_journal_m1.sql` — `engagement_contexts` + `projects` schema.
