# Premium Hub screen — data bindings

Route: **`/[locale]/dashboard`** (canonical dashboard). Updated by dashboard
consolidation v1: the premium hub is now the LEAD visual of `/dashboard`
(embedded, via `<PremiumHubScreen … embedded />`); the former separate
`/dashboard/hub` route was **removed**. See `dashboard-consolidation-v1.md`.
Status: **real-data-backed**, `REAL_LAUNCH_SURFACE`. No concept fixtures remain
(enforced by `lib/guards/hub-real-data-only.test.ts`, which now checks
`/dashboard/page.tsx`); the fixture module was deleted.

The screen renders from one RLS-scoped read model,
`apps/web/components/app/premium-hub/premium-hub-data.ts`
(`getPremiumHubViewModel()`), fetched server-side in `dashboard/page.tsx`. Every value is
the caller's own data (or a real `0`) via existing helpers — no service-role, no
new tables, **no migration**, no external/paid map provider. Each block reports
`status: "ready" | "empty" | "unavailable"`. The header badge says **"Gyvi
duomenys"** when every block is `ready`, otherwise **"Gyvi duomenys · kai kurie
blokai dar neužpildyti"** — it never claims live over a fabricated value.

## Real sources wired (per block)

| Block | Real source(s) | Notes |
|---|---|---|
| **Asmens kortelė** | `getWorkerPlayerCard()` (skillsDeclared, journalSupportedSkills, evidenceEntries, professionSlug) · `getOwnAvatar()` · `getOwnAvailability()` (availability state) · `profiles` (full_name, active_role, country) | Skills shown as real **counts** + a transparent **profile-completeness ratio** (met/total of real fields). There is **no 0–100 skill level** in the data model, so none is invented. Avatar via `AvatarDisplay` (real photo or initials monogram). |
| **Įmonės kortelė** | `getOwnCompany()` (company-setup) · `listActiveCompanyWorkers()` (team) · `getCompanyProjectContext()` (projects) · `listCompanyWorkerInvitations()` (pending invites) | Stats are real RLS-scoped counts: Komanda / Projektai / Kvietimai. Verification badge intentionally not shown (avoids any trust-claim wording). |
| **Rinkos žemėlapis** | `listOwnPreferredLocations()` · `listOwnDemandLocations()` · `getOwnLoginConsent()` | Real counts: preferred locations, needs, consented login signal. The panel stays **CSS/SVG, provider-free**; the number of points reflects the real signal total, positions are decorative (no coordinates, no geocoding). |
| **Projekto / darbo paso kortelė** | `listManagedProjects()` (most recent) · `getProjectOperations()` (assigned + ready → readiness ratio) · `getProjectGallery()` (photo count) · `getHandoverPassport()` (declared handover stage) | Real: project name/location, handover **stage** (an enum, not a percent), team-readiness ratio (ready/assigned), assigned + photo counts. |

## Intentionally left as empty / not shown (no real source → never invented)

- **Handover percentage** — the model stores a declaration **stage**
  (`preparation | in_progress | handover_declared | closed`), not a percent, so a
  stage chip is shown, never a fabricated `72%`.
- **Defect count** — no defect model exists anywhere in `lib`, so the project
  card shows **no** defect stat (never an invented count).
- **Company "active" stat** — replaced by pending **invitations** (a real count);
  there is no generic "active" figure to show truthfully.
- **Verification badge** — `verificationStatus` is available but not surfaced
  (kept out to avoid any public trust-claim wording).

## Empty / unavailable states (honest, with a next action)

- **empty** → the block shows a marked empty state + one direct CTA to the
  existing surface that fills it: person → `/dashboard/profile`, company →
  `/dashboard/company`, market → `/dashboard/market-map`, project →
  `/dashboard/projects`.
- **unavailable** → a neutral "Duomenys šiuo metu neprieinami" note (e.g. company
  read returns `needs-migration`/`error`). Never a fake number, never an error
  dump.

## Route classification & nav

Kept `GATED_PREVIEW` and still listed in `preview-surfaces-unlinked.test.ts`
`PREVIEW_ROUTES` (zero inbound links enforced). It is no longer in that guard's
"preview-marker" check because it is real-data-backed, not a preview. **No nav
entry is added** — per the goal, the owner validates the authenticated real-data
render in production first, then a conservative single nav entry (e.g. "Centras")
can be added, at which point the route graduates to `REAL_LAUNCH_SURFACE`.

## Still not wired (future, out of scope here)

- A dedicated CV / work-history summary tile (no ready-made summary helper).
- Conversations / next-action panel (cross-cutting; separate surface).
- Defect tracking (no model yet).
- Worker (non-manager) project view when the user only has assignments, not
  managed projects — currently shows the honest project empty state for them.
