# Role-aware navigation contract v1

Every route must resolve to the RIGHT view for the CALLER'S role, or to an
honest no-access state — never to a dead explanation aimed at a different
role. Born from production finding F11: a validly assigned worker opening
a project got "Ši lenta skirta įmonės ar agentūros vadovui" — a dead end
on a project they were literally assigned to.

## Project route resolver

`/dashboard/projects/*` branches on the caller's real relationship to the
project (resolver: `apps/web/lib/projects/worker-project-access.ts`):

| Caller | View |
|---|---|
| Manager (company/agency, `MANAGER_ROLES`) | stadium / operations view (unchanged) |
| Assigned worker | worker project view (`components/app/worker-project-panel.tsx`): own assignment, own-photos gallery, project facts |
| No relationship | honest no-access state — one line, no role lecture |

Access is RLS-scoped, not UI-guessed: workers read their own assignments
via the `pwa_select` policy (`owns_worker`); live projects are readable by
any authenticated user. The operations page redirects assigned workers to
their view instead of showing manager chrome. Workers get a "Mano
projektai" list on `/dashboard/projects`.

Rule: the SAME URL may render different views per role, but it must never
render another role's dead end to a valid member.

## Person pages

`/dashboard/people/[workerId]` (new in this branch, F2) is fail-closed on
the `can_view_worker` RLS function (migration `20260711130000`):

- if `can_view_worker` denies → not-found-shaped response, no existence
  leak;
- the page selects NO contact fields — visibility of a person is not
  visibility of their contacts;
- entry points: company-workers-section rows, stadium player cards.

## Primary navigation — the six-item contract

Primary nav (bottom-nav on mobile + dashboard-tabs) is exactly these
items, defined in `apps/web/lib/config/navigation.ts` and sourced from the
feature catalogue `lib/config/feature-availability.ts`:

1. `overview`
2. `market_map`
3. `journal_text_first`
4. `communication`
5. `planning` (Kalendorius — the ONE canonical calendar,
   `/dashboard/planning`)
6. `network`

Plus `admin` — visible ONLY to admins. The guard
`apps/web/lib/guards/compact-nav-marketplace-ia.test.ts` pins this
six-item contract; adding a seventh tab requires changing the guard
deliberately, with justification.

## What does NOT go in the top bar

- **Galleries** live inside their workspace context: personal gallery
  under the profile/journal context (`/dashboard/gallery` reached from the
  profile entry point), project galleries inside the project view, company
  gallery inside the company workspace. A gallery is a view OF something,
  not a destination of its own.
- **Locations / geography** live in the company workspace section
  (`components/app/company-locations-section.tsx`) and on the map layer —
  not as a nav tab.
- **No second dashboard, no second calendar.** `planning` is the single
  calendar; any surface that needs dates links to it. A feature that wants
  its own calendar embeds or links the canonical one.

## Honest no-access, defined

A no-access state is one short line stating the user cannot view this
object, with at most one CTA that the user can actually perform. It never:

- explains which OTHER role the surface is "for" (F11's anti-pattern),
- exposes whether the object exists when RLS says not-found,
- shows manager controls in a disabled state to non-managers.

## Review checklist for new routes

1. Which roles can reach this URL, and what does each one see?
2. Is access decided by RLS/server, with UI branching only on the
   server-resolved relationship?
3. Does the no-relationship case render the honest no-access state?
4. Does the route belong in primary nav (almost never) or inside an
   existing workspace context (almost always)?
