# W7-S4 — PROFILE INFORMATION ARCHITECTURE

Removes domain-misplaced content from `/dashboard/profile` without losing
capability and without creating a route. Two blocks move to the surface that
already owned their subject matter, and the page's last two unnamed perceivable
inputs are given accessible names.

## 1. Starting state

| | |
|---|---|
| Starting `origin/main` | `7e13886f826b77e71b96764014f8feb9a5c362f7` (verified with `git fetch`, not assumed) |
| Worktree | `C:/Users/Mano/Documents/claud darbai/labourmarketai-wt/w7-s4` — new, isolated, own `node_modules`, own dev server `:3470`, own `.env.local` → local stack `127.0.0.1:54321` |
| Branch | `feat/cc/w7-s4-profile-ia-cleanup` |
| Local DB | the shared local stack (`project_id=labourmarketai`). **No migration is required or included by this slice.** |
| Evidence | `docs/audits/evidence/w7-s4/` — 16 screenshots + 4 measurement JSONs |
| Capture tool | `apps/web/scripts/w7-s4-capture.mjs` (refuses any non-loopback base URL) |

Sources read and re-verified against current code before implementing:
`W7_PROFILE_FULL_INVENTORY.md`, `W7_S1_PROFILE_HUB_OVERVIEW.md`,
`W7_S2_PROFILE_ACCESSIBILITY.md`, `W7_S3_PROFILE_READ_WATERFALL.md`,
`FULL_PRODUCT_SURFACE_INVENTORY.md`, `PRODUCT_SIMPLICITY_SCORECARD.md`,
`docs/product/CHAT_FIRST_DASHBOARD_V1.md`,
`docs/architecture/MULTI_ORGANIZATION_RELATIONSHIP_DOCTRINE.md`,
`docs/program/W1_W22_CURRENT_STATE_MATRIX.md`.

## 2. The canonical destination proposal was wrong, and why

`W7_S1_PROFILE_HUB_OVERVIEW.md` §11 recorded the S4 targets as
`#managed-companies → /dashboard/company` and
`MessageButton → /dashboard/communication`. **Neither destination survives
contact with the code.** Both were re-derived rather than followed.

### `/dashboard/company` cannot host the organizations block

- It is role-gated: `requireRoleOrRedirect(locale, "company")` redirects any
  profile that does not hold the `company` role to `/dashboard?notice=…`.
- It renders **one** company — the active workspace's, via
  `resolveEmployerCompanyContext()` — not the set the person owns.

The block's most important reader is a person with **zero** companies, who is
exactly the person that route redirects away. Moving it there would have
deleted the capability, not rehoused it.

### `/dashboard/communication` cannot host the message button

`lib/guards/message-counterpart-restricted.test.ts` — the counterpart-trust P0
guard, written after an owner production correction — asserts on **both**
thread surfaces:

```
// No stranger-contact CTA wired into the thread surfaces.
expect(src).not.toMatch(/MessageButton|RequestCommunicationButton/);
```

The rule exists because counterpart identity in those pages is
permission-restricted: a contact control beside a counterparty whose identity
is deliberately withheld is a route to a stranger. The button was placed on
`/dashboard/communication` first, the guard failed, **and the guard was kept**.
The destination changed instead. This slice does not relax it, and
`w7-s4-profile-information-architecture.test.ts` now pins that both thread
surfaces stay free of `MessageButton`, so the next slice cannot quietly undo
the decision.

### The destination both blocks actually belong to

`/dashboard/network` — "Mano tinklas", whose own header comment already reads
*"my organizations, my active relationships"*. It was **already calling
`getOwnedOrganizations()` and already rendering a `network-organizations`
section against the same `/dashboard/company` destination**, and it already
contacts people through this exact `MessageButton` component
(`labelKey="messageWorker"`, on the search rows).

`#managed-companies` was therefore not misplaced content needing a new home. It
was a **duplicate** of a section that already existed, on a page that is not
about organizations.

## 3. OLD → NEW capability map

Nothing may silently disappear. Every row is asserted by
`lib/guards/w7-s4-profile-information-architecture.test.ts` and confirmed in
the browser by the `moved` flags in `evidence/w7-s4/*.json`.

### `#managed-companies` (profile) → `network-organizations` (network)

| information / action | new location | preserved | source |
|---|---|---|---|
| owned-organization list, by real name | `network-organizations` list | already rendered there | `getOwnedOrganizations()` — same reader |
| row → company workspace | same `Link` to `/dashboard/company` | destination unchanged | — |
| **"+ Pridėti įmonę" action** | `network-add-company` | **newly added there** | `/dashboard/start/company` |
| **zero-company explanation** | `marketplaceHub.company.noCompanyDesc` | **newly added there** | — |
| **individual-activity note** | `marketplaceHub.individual.desc` | **newly added there** | — |
| `#managed-companies` quick-nav chip | removed | — | see §5 |

The three bold rows are the reason this is a move and not a deletion. The
destination section previously rendered **only** when
`organizations.length > 0`, so at zero companies it rendered nothing at all —
proven by `evidence/w7-s4/before.json`, where the worker scenario shows
`organizationsSection: false` on `/dashboard/network`. Deleting the profile
block without porting them would have left a person with no company **no route
anywhere in the product** to create one: the header `RoleSwitcher` offers its
"add Įmonė" path only to a profile that holds no company identity at all
(`missingIdentities`), so a one-company owner had no second-company action
either.

**Copy is the same keys, not a retranslation.** The block kept the exact
`marketplaceHub.company.*` / `marketplaceHub.individual.desc` keys it rendered
on the profile, so no key was added, renamed or re-translated and no locale was
left behind. `check:i18n-debt` confirms the baseline is unchanged
(`da=1301, de=0, nl=0, ru=0`).

### `MessageButton` (profile) → `network-relationships` (network)

| information / action | new location | preserved | source |
|---|---|---|---|
| "Rašyti įmonei" → open/reuse employer thread | `network-message-employer` | same component, same server action | `getEmployerOwnerProfileId()` — same reader |
| no dead button when no employer resolves | `employerOwnerProfileId && …` | unchanged | — |
| failure state | `/dashboard/communication?notice=cannot_open` | untouched | — |

## 4. Stated behaviour deltas

Three, none of them incidental. Each is a decision, recorded so it is not
mistaken for drift.

1. **The `workerId` gate on the message button is gone.** The profile rendered
   it as `workerId && employerOwnerProfileId`. That gate described where the
   button *sat* on a worker-only stretch of that page, not who may use it — the
   right to message is settled entirely by the caller's own accepted
   `company_worker_invitations` row, which is what the resolver reads under
   RLS. Re-adding it on `/dashboard/network` would have cost a `workers` query
   solely to deny a genuinely invited person their employer thread.

2. **Agencies are no longer filtered out of the list.** The profile block
   filtered `organizationType !== "agency"`; the canonical network section
   never did, and it is not being given the filter. Hiding an agency the person
   really owns from a list titled "Mano įmonės" is the less honest of the two
   behaviours.

3. **The organizations section now always renders on `/dashboard/network`**,
   including at zero organizations. That is the ported empty state, and it is
   the point of the move.

## 5. The removed anchor

`#managed-companies` is gone from the page-local quick nav. `PageQuickNav` is
in-page anchors only (`<a href="#id">`), so a chip pointing at a section that
has left the page is a dead control — it silently does nothing when tapped.
Pinned by the guard, and by `deadAnchors: 0` in every capture.

Discoverability is handed off by **one link in the existing header action row**
(`profile-network-link`), not a replacement card. `/dashboard/network` is
already a primary nav tab (`feature-availability.ts`,
`safeToShowInPrimaryNav: true`), so the pointer is a courtesy for the habit the
move breaks, not the only way back.

Three historical capture scripts asserted `editors.length === 6` including
`#managed-companies`. They now assert 5. Leaving them would have left a proof
harness that fails on a fact this slice deliberately made true.

## 6. Accessibility — the last two unnamed perceivable inputs

W7-S2 closed its own component but left debt item **A-1**: two inputs with a
visible label and no programmatic one, page-wide.

| input | why it was unnamed | fix |
|---|---|---|
| external-profile URL (`external-profiles-section.tsx`) | `components/ui/Label` renders a **`<span>`**, not `<label htmlFor>`, so the visible text named nothing | `aria-labelledby` → the visible `Label` |
| image-OCR seam file input (`cv-input-panel.tsx`) | its label was a plain sibling `<span>`; a screen reader announced a disabled file control with no purpose | `aria-labelledby` → the visible span |

Both follow the W7-S2 precedent of pointing at the **visible** label rather than
repeating the string in an `aria-label`, so the visible and programmatic names
cannot drift apart. The OCR seam stays exactly as disabled and as honest —
naming a control must never make an unavailable one look available (pinned).

**Unlabelled perceivable inputs on `/dashboard/profile`: 2 → 0**, at both
widths, in both scenarios.

## 7. Measurements

Measured on this worktree, this machine, this stack, this dev server. BEFORE is
the pre-slice code restored via `git stash` and served by the same running
server against the same DB state, so the comparison is like-for-like. The
BEFORE figures reproduce W7-S2's page-wide numbers exactly (2 unlabelled
perceivable; 35–36 / 34–35 sub-44), which is the check that the harness agrees
with the previous slice's.

Both routes are measured. Reporting only the page that shrank would be the
dishonest half of a move.

### Scenario A — worker, 0 companies, employer resolves

| route @ vp | height | Δ | folds | cards | `<section>` | `<h2>` | unlabelled | sub-44 |
|---|---|---|---|---|---|---|---|---|
| profile @1440 | 5406 → **5160** | **−246** | 6.01 → 5.73 | 16 → **15** | 14 → **13** | 12 → **11** | 2 → **0** | 36 → **29** |
| profile @375 | 7679 → **7423** | **−256** | 9.46 → 9.14 | 16 → **15** | 14 → **13** | 12 → **11** | 2 → **0** | 35 → **28** |
| network @1440 | 1063 → 1247 | +184 | 1.18 → 1.39 | 1 → 1 | 4 → 5 | 4 → 5 | 0 → 0 | 19 → 20 |
| network @375 | 1248 → 1472 | +224 | 1.54 → 1.81 | 1 → 1 | 4 → 5 | 4 → 5 | 0 → 0 | 12 → 13 |

### Scenario B — company owner, 1 company

| route @ vp | height | Δ | folds | cards | `<section>` | `<h2>` | unlabelled | sub-44 |
|---|---|---|---|---|---|---|---|---|
| profile @1440 | 5542 → **5345** | **−197** | 6.16 → 5.94 | 17 → **16** | 14 → **13** | 12 → **11** | 2 → **0** | 36 → **29** |
| profile @375 | 7815 → **7628** | **−187** | 9.62 → 9.39 | 17 → **16** | 14 → **13** | 12 → **11** | 2 → **0** | 35 → **28** |
| network @1440 | 1205 → 1290 | +85 | 1.34 → 1.43 | 1 → 1 | 5 → 5 | 5 → 5 | 0 → 0 | 18 → **17** |
| network @375 | 1382 → 1487 | +105 | 1.70 → 1.83 | 1 → 1 | 5 → 5 | 5 → 5 | 0 → 0 | 13 → **12** |

### Reading these numbers honestly

- **The profile's −197 to −256 px is modest**, and smaller than S1's −831 to
  −1674. It should be: S1 removed 1350 px of *duplicated summary*; S4 removes
  one small section from a page that is still 9.1 mobile folds. The IA win here
  is that a person-identity page stopped answering an organization question,
  not that it got dramatically shorter.
- **`/dashboard/network` grew, and that growth is the capability.** +184/+224 px
  in scenario A is almost entirely the zero-company state and the add action
  that did not exist there before. Net across both pages the product is roughly
  flat in pixels and strictly ahead in capability.
- **sub-44 on the profile fell 36 → 29 (−7)**, further than the block removal
  alone accounts for. Every link in the header action row was raised to
  `min-h-11`; they were 26 px, the largest single cluster of W7-S2's A-2 debt.
  The row had to be consistent to accept the network handoff link without one
  odd-sized chip, so raising it was the cheaper correct option, not scope creep
  for its own sake.
- **One metric got worse: network sub-44 19 → 20 in scenario A.** That is the
  `MessageButton` itself, which is ~26 px in its shared component styling. It is
  reported rather than hidden. Raising it would improve every one of its call
  sites (network people rows, `company-workers-section`), which is precisely why
  it is not done in an IA slice — it is recorded as debt in §10.

### Not measured, and stated as such

**TTFB is not claimed in either direction.** W7-S1 established that dev-server
medians on this page vary more between repeated runs of *identical* code than
any difference this slice could produce. The slice does remove two reads from
the profile's render path (`getOwnedOrganizations`, `getEmployerOwnerProfileId`,
guard-pinned at zero calls), and `getEmployerOwnerProfileId` joins an existing
`Promise.all` on the network page rather than adding a serial stage — both
structural facts, neither a timing claim.

## 8. Browser evidence

Local Chromium, this worktree's own dev server on `:3470`, `caret: "initial"`,
`/lt/` locale, at **1440 and 375**, across **two identity scenarios**:

- **zero console errors, zero hydration warnings, zero horizontal overflow, zero
  dead anchors** — every route, every viewport, every scenario, before and after;
- `managedCompaniesSection` / `profileAddCompanyCta`: `true → false` on the
  profile; `organizationsSection` / `networkAddCompanyCta`: `false → true` on
  network (scenario A) — the move proven on both ends, not asserted;
- `messageCompanyButton`: `true` on the profile before, `true` on **network**
  after, `false` on the profile after — proven with a real resolvable employer.

**How the employer case was proven, and its limit.** No fixture user had an
accepted `company_worker_invitations` row, so `getEmployerOwnerProfileId()`
returned null and the button correctly did not render for anyone — the
no-dead-button contract working, but no proof the move landed. One accepted
invitation (`dev.company@local.test` → `dev.worker@local.test`) was inserted on
the **local disposable stack**, the capture re-run, and the row **deleted
afterwards**; the shared stack is back to 0 invitations. Screenshots:
`{before,after}-{profile,network}-{1440,375}.png` plus the `after-employer` and
`{before,after}-company` sets.

## 9. Verification

| check | result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **859 files / 13974 tests pass** |
| `eslint` (changed files) | clean |
| `check:constitution` | 5 probes pass |
| `check:i18n-debt` | within baseline, unchanged |
| `check:worker-plain-language` | PASS (en, lt) |
| `check:pilot-honesty-copy` / `check:fit-signal-copy` | clean |
| counterpart-trust P0 guard | passes **unmodified** |
| migration | **none in this slice** |

**One honest note on the suite.** The default run showed 6 failures, all
`Test timed out in 5000ms` on whole-tree-scanning guards, and the failing *set
differed between runs* — the known flake from having no `testTimeout`
configured. Re-run with `--testTimeout=30000`, **all 859 files pass**. The
number reported above is the raised-timeout run, and the flake is called out
rather than presented as a clean default pass.

## 10. Remaining W7 debt after this slice

| id | debt | note |
|---|---|---|
| W7-S5 | worker-preference copy: v1 first person ("Galiu…") vs v2 third person ("Gali…"); a pure company/agency identity silently loses 12 of 21 sections with no copy acknowledging it | next slice |
| W7 P1-3 | conversation memory — SQL still in `docs/proposals/`, never a migration | reality-audit first |
| W7 P2-1 | open-ended bookings skip the overlap guard | — |
| a11y A-2 | **28–29 sub-44 targets remain** on the profile (was 34–36). Largest remaining clusters: `worker-availability-prefs-form` licence checkboxes, experience date inputs, locale/notification buttons | measured |
| a11y | `MessageButton` is ~26 px at every call site | one shared component; improves 3 surfaces at once |
| copy | the `marketplaceHub` namespace no longer has a marketplace caller — only `company.*` / `individual.desc` are used, from `/dashboard/network`. The name is now a misnomer | rename is copy debt, not an IA move |
| perf | `getOwnAvatar()` still reads the `profiles` row a second time | inherited from S3, unchanged |

## 11. Verdict

**`W7_S4_PROFILE_INFORMATION_ARCHITECTURE_CLEANED`**

Two misplaced blocks moved to the one surface that already owned their subject
matter — one of which turned out to be a straight duplicate — with a
row-by-row old→new map, a 30-assertion guard, and browser proof at both ends of
each move across two identity scenarios and two viewports. Three capabilities
the destination lacked were ported with it, and the destination is now strictly
more capable than before: a person with zero companies could previously reach
"create a company" only from their profile, and now reaches it from the
organizations surface. The profile's last two unnamed perceivable inputs are
named (2 → 0) and its sub-44 targets fell 36 → 29.

**Two canonical destinations named in `W7_S1` §11 were rejected on evidence** —
one because a role gate excludes the block's most important reader, one because
a counterpart-trust P0 guard forbids contact buttons on thread surfaces. The
guard was kept and the destination changed.

**W7 is NOT done.** Six items remain in §10.
