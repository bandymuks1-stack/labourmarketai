# UX/UI unification status — one list for the whole product

Owner P0 decision 2026-11-12: LabourMarket.ai may not launch as a set of
mutually inconsistent designs. Lane A owns the one design system; every lane
fixes its own screens with the shared components. This file is the ONE
discrepancy list and rollout plan. It is a status document: update it in the
same PR that changes a screen's state.

**Method and limits.** The table was built on 2026-11-12 from a CODE inventory
of branch `feat/cc/nav-v2` (which shell a screen renders in, which
`components/ui/*` it imports, raw `<button>/<input>/<select>` counts, which
token classes it uses). It is not a visual review of each screen, and it says
nothing about whether a first-time visitor understands a screen: that needs
people. "Unified" below means "built on the shared shell, components and
tokens", not "approved by the owner".

## The standard (existing, extended — not a new system)

- Tokens: `apps/web/tokens/*` via `tailwind-preset.ts` and `app/globals.css`
  (dark and light channel sets). Guards: `design-tokens.test.ts`,
  `design-token-classes.test.ts`. No raw hex or inline colour was found on any
  screen in the table.
- Rules: root `DESIGN.md` (theme, colour, typography, components, layout,
  depth, responsive).
- Shared primitives: `apps/web/components/ui/` — Button, Card, Input, Label,
  Select, DarkListbox, OptionCards, Badge, InlineConfirm, MobileSheet,
  anchored-overlay, ResultShell, Placeholder, ThemeToggle, lm-logo,
  premium-action-card.
- Navigation (PR #3266): `components/navigation/card-rail.tsx` (the one rail
  and card), `goal-navigator.tsx`, `nav-card-icon.tsx`; lists in
  `lib/navigation/`. Signed-in homes and pins build on these (PR #3270).
- Shells: public = `components/layouts/site-nav.tsx` + `site-footer.tsx`;
  signed-in = `app/[locale]/dashboard/layout.tsx` + `dashboard-chrome.tsx`;
  auth and onboarding = logo + language switcher only.

Known inconsistencies in the standard itself:

1. Two class families name the same colours: `ink-*` / `text-text-*` (main,
   636 files) and `bg-surface-*` / `border-border-*` (legacy aliases, about 95
   files). They render identically; new code uses the main family.
2. `rounded-md` (1962 uses) and `rounded-control` (67 uses) are the same 14px.
3. The older `AreaSwitcher` carousel (`components/app/area-switcher.tsx`) is
   still used on the signed-in homes; the navigation standard is `CardRail`.
   One of the two must go when #3270 lands.
4. Four screens render forms from raw controls without any shared primitive
   (see table).

## Discrepancy list

State: **unified** = shared shell + shared primitives + main tokens ·
**mixed** = shared shell and tokens, but hand-built controls or both token
families · **aligned, old controls** = same tokens, shared Button and spacing, but
fields not yet on the shared form primitives · **old** = not on the shared
shell or system. Priority 1 is first. Rows for Lane G (workers and CV) and
Lane H (teams, companies, projects) are taken from those lanes' own audits in
the launch register (2026-11-12), not from a Lane A review of the screens.

| P | Screen | Route | Role | State today | What is wrong | Owner lane | Fix PR |
|---|---|---|---|---|---|---|---|
| 0 | Landing first screen | `/` | visitor | unified in #3266; old on production | Production still shows the previous hero and two navigation rows until #3266 merges. Sections below the first screen are untouched and long. | A | #3266; below-the-fold cut: not started |
| 0 | Header, mobile menu | all public pages | visitor | unified in #3266 | — | A | #3266 |
| 1 | Sign in, sign up, forgot / reset password | `/auth/*` | visitor | aligned, old controls | Same colour tokens, shared Button, 44px fields; all four forms share ONE guarded field class (`components/app/auth-field-class.ts`). Not on `ui/Field` / `ui/Input`: fields differ from `ui/Input` in padding and background shade, labels are plain text, and an error is one message under the form, not bound to its field. Header: the auth pages use their own minimal shell (logo + language), not the public header — by design, but there is no link back to the goals. Moving them onto `ui/Field` is deferred until after launch (coordinator agreed 2026-11-12): about twenty guards read these files and sign-in cannot be run end to end where Lane A works. "Aligned" here is from the code (tokens, Button, spacing classes); the screens were not compared by eye against V2. | A | deferred to after launch |
| 1 | Onboarding | `/onboarding` | new user | mixed | Shared Button and DarkListbox; five raw inputs and five raw buttons. Own minimal shell. | A | not started |
| 1 | Profile: experience, skills, work card, documents | `/dashboard/profile` | worker | mixed → unified per form | The experience form, manual skill field, work card editor and document form move to shared Input, Select, Label and Button in Lane G's PRs. Still old: the profile page shell, the document file slot, candidate drafts. Experience has add and remove but no edit; a document cannot be deleted by the worker (needs a RED change, not started). | G | #3278, #3281, #3283 (drafts) |
| 1 | Living CV | `/cv` | worker | old shell | Renders with no shell at all (root layout only): no navigation, no way back except the browser. Tokens are the main family. View, browser-print export and import work; the standard CV printed a language as its code (fixed in #3280). | G | #3280 (draft); shell: not started |
| 2 | Job board | `/jobs` | visitor, worker | mixed | Shared Button; raw search input and select; both token families; **page copy is hard-coded per locale in the file (24 maps)**, not in the message catalogs. Edits fall under an owner waiver that lists PR numbers. | A (waiver needed) | blocked: owner waiver |
| 2 | Job advert | `/jobs/[id]` | visitor, worker | mixed | Shared Button and tokens; copy hard-coded per locale in the file (35 maps). Same waiver. | A (waiver needed) | blocked: owner waiver |
| 2 | Opportunities | `/dashboard/opportunities` | worker | unified | — | A2 | — |
| 3 | Describe a need | `/company-need` | employer | mixed | The form imports no shared primitive: 17 raw inputs and selects with hand-written classes; both token families. | A | not started |
| 3 | Candidates | `/dashboard/candidates` | employer | mixed | No shared primitive; 7 raw inputs, 2 raw buttons. | C | not started |
| 3 | Worker search (employer), shortlist, offers | `/dashboard/candidates` and the found-worker page | employer | mixed | Search with three filters, shortlist and offers work. Shortlist toggles and offer buttons are hand-built (they wait for the shared `ToggleChip`, now in #3273). The found-worker page said "nothing offered / no recorded work" about a record it had not read (fixed in #3274) and is not linked from the search results. | G | #3274, #3276 (drafts); buttons: next |
| 3 | Invitations list (worker) | signed-in home / profile | worker | mixed | Accept only; decline needs a new database function (RED, not started). | G | not started |
| 3 | Company needs | `/dashboard/company/needs` | employer | unified | Minor: both token families. | C | — |
| 4 | Signed-in home (worker) | `/dashboard` | worker | mixed | Uses `AreaSwitcher`, not the navigation rail; no pins yet. | A2 | #3270 |
| 4 | Company home | `/dashboard/company` | employer | mixed | Same: `AreaSwitcher`; pins pending. | A2 | #3270 |
| 4 | People | `/dashboard/company/people` | employer | mixed | Shared Button; 8 raw inputs, 4 raw buttons. | C | not started |
| 4 | Teams: panel, create, invite, assign to a project | `/dashboard` team panel, `/dashboard/projects/[id]` | worker, company, agency | mixed → unified in #3279 | Team panel, team assign form and the project's team block move to shared Button, Select, Input, Label, Badge in #3279. Invite picks only from people already linked (no search). The company sees the owner's teams, not all of the company's. | H | #3275, #3279 (drafts) |
| 4 | Project page: people and teams on it | `/dashboard/projects/[id]` | company, agency | mixed | Names the teams on the project from #3275. No role on a project, no project-manager view, no indication of which company a person or team belongs to (each needs a schema or access change: RED, not started). | H | #3275 (draft) |
| 4 | Project assignment manager, operations board, team details, team offer forms | signed-in workspace | company, agency | mixed | Hand-built controls; the operations board is three actions from home. | H | next, not started |
| 4 | Structure view (company → teams → people; project → teams → people) | — | company, agency | absent | No screen shows the structure. The shared component now exists (`ui/StructureTree`, `ui/GroupedList` in #3273); no screen uses it yet, and team lead / roles inside a team do not exist in the data. | H (component: A) | component in #3273; screen: not started |
| 4 | Review queue, journal entry from a project | signed-in workspace | company, worker | mixed | Works (production walks). The review queue has no project filter; with two or more projects the worker's journal button does not pre-select the project. | H | not started |
| 4 | Account | `/dashboard/account` | all | unified | — | — | — |
| 5 | Services | `/dashboard/services` | provider | mixed | No shared primitive; 6 raw inputs, 4 raw buttons. | C | not started |
| 5 | Service requests | `/dashboard/service-requests` | provider, buyer | mixed | 9 raw buttons, 7 raw inputs. | C | not started |
| 5 | Listings | `/dashboard/listings` | all | mixed | No shared primitive; 18 raw inputs, 8 raw buttons. | C | not started |
| 5 | Proposals and contracts | `/dashboard/commercial` | company | mixed | Heaviest hand-built screen: 47 raw inputs, 10 raw buttons. | C | not started |
| 5 | Network | `/dashboard/network` | all | mixed | Shared primitives in three sections; about 24 raw controls elsewhere. | C | not started |
| 5 | Public business profile | `/business/[slug]` | visitor | old shell | No shell: no header, no footer, no navigation. | C | not started |
| 6 | Conversations, thread | `/dashboard/communication` | all | unified | A few raw controls in the composer. | B | — |
| 6 | Inbox, notifications | `/dashboard/inbox`, header panel | all | mixed | Inbox: 9 raw inputs. Panel uses shared overlays. | B | not started |
| 6 | Assistant entry | header, menu | visitor | partial | A link to the conversation home. The always-visible input (desktop header, phone bottom bar) is not built. | A | not started |
| 7 | Audience pages, pricing, about, create CV | `/for-*`, `/pricing`, `/about`, `/create-cv` | visitor | unified | `/about` uses both token families. Not restyled to the V2 look. | A | not started |

## Rollout order

1. Public first-visitor unit — #3266 (ready; waits for the owner's visual
   approval and merge).
2. Sign in / sign up / onboarding / profile completion.
3. Job search and adverts (needs the owner waiver for `/jobs`).
4. Need posting and worker search.
5. Workspaces — #3270, then the remaining workspace screens.
6. Services, orders, partners.
7. Messaging and assistant.
8. The rest.

## What will honestly not be unified by 2026-11-15 unless work starts now

Every row marked "not started" or "blocked". They work today on the shared
shell (except `/cv` and `/business/[slug]`, which have no shell) and the
shared colour tokens; what they lack is the shared form and button
primitives and the V2 look. They are to be reported as **old design,
working**, not as unified.

## Acceptance (owner criteria) — status

| Criterion | Status |
|---|---|
| First screen understood in 3 seconds; 40 first-time people | **Not tested. Needs people. No automated result may stand in for it.** |
| P0 functions within 2 navigation actions | Counted by Playwright for the public goals in #3266. Signed-in start screens: not measured. |
| One navigation, no duplicated menus | Public: done in #3266. Signed-in vs public parity: pending #3270. |
| 320 / 375 / 390 / 768 / 1440, no overflow or clipped actions | #3266 measured 320–1440 for the header and 360 / 375 / 768 / 1440 for the navigator. 390 not run. Other screens: not measured. |
| Lighthouse accessibility and SEO ≥ 95; LCP, INP, CLS | Not run by Lane A. Lane F's check. |
| Light and dark | #3266 captured both. Other screens: not checked. |
| No dead buttons or fake functions | Guarded for the navigation lists. Other screens: not audited here. |
