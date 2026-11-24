# GOAL 3 — EVALUATE PROJECTS

## 1. Verdict

```text
GOAL_3_PROJECT_EVALUATION_AUTHENTICATED_BROWSER_PROVEN
```

The authenticated browser proves the whole chain: the person opens the proven
market result, clicks a real marker, sees correctly filtered real project rows,
opens one project, is told in plain language why it matched and what data is
missing, and can continue toward matching people — all inside the one AI
Workspace, with one map, one `ResultPanel` and no navigation away.

Baseline: `edcec2fc`. Branch: `feat/cc/goal3-project-evaluation-v1`.

## 2. Changed files

### New

| File | Purpose |
|---|---|
| `apps/web/lib/market-map/geography-selection.ts` | The typed `GeographySelection` contract, its URL serialization, and the rule that a selection may never claim more precision than the data has. Pure — no `server-only`, no supabase, no React. |
| `apps/web/lib/market-map/project-results-model.ts` | The pure shaping half: `groupIntoProjects`, the match-reason codes, the missing-field contract, and `buildPeopleContinuation`. This is where the correctness claim of the feature lives, so a unit test can hold it. |
| `apps/web/lib/market-map/project-results.ts` | `server-only` data access. `loadProjectResults` and `loadProjectEvaluation` — the one canonical project-result loader, reading the same join the market result reads. |
| `apps/web/lib/market-map/project-results-actions.ts` | The two server entrypoints. They re-validate the `?geo=` token on the server side of the boundary. |
| `apps/web/components/app/workspace/market-drilldown.tsx` | The market result at three depths — map → projects → evaluation — inside the existing `ResultPanel`. One `<MarketMap>` mount, at depth 0 only. |
| `apps/web/lib/guards/goal3-project-evaluation.test.ts` | 46 guard tests: serialization, city/country precision, filtering, zero result, error-not-empty, RLS-authorized loader, duplicate-map prevention, URL restoration, no-judgement copy, i18n coverage. |
| `apps/web/tests/e2e/goal3-project-evaluation.spec.ts` | The 8 authenticated browser scenarios, with per-scenario request and console counters. |

### Modified

| File | Change |
|---|---|
| `apps/web/components/app/market-map/market-map.tsx` | Added `onSelectAnchor` so a click yields the ANCHOR, which is the only thing that knows its own precision. Markers became keyboard-reachable and carry `data-anchor-id` / `data-anchor-precision`. `onSelectRegion` is untouched. |
| `apps/web/components/app/workspace/use-result-param.ts` | Carries `geo` and `project` alongside `result`; validates both; pushes when going deeper so Back steps up. **Fixed a real defect** — see §7. |
| `apps/web/components/app/workspace/result-body.tsx` | Takes a `ResultNavigation` object and mounts the drill-down for `market`. The old inline `MarketInline` moved into the drill-down unchanged. |
| `apps/web/components/app/world-state/context-panel.tsx` | Two new pass-through props: `resultNavigation` (opaque to the panel) and `wide`. The panel widens to `lg:w-[30rem] xl:w-[38rem]` for the deeper result rather than opening a second surface. |
| `apps/web/components/app/conversation/chat/conversation-chat.tsx` | Assembles `resultNavigation` from the URL hook and decides `wide`. |
| `apps/web/lib/market-map/market-result.ts` | Added `failed` so a broken read stops rendering as "there is no demand". |
| `apps/web/scripts/dev-acceptance.ts` | Forwards extra args (`-- -p 3400`), so two acceptance sessions do not fight over port 3000. |
| `apps/web/scripts/db-fixtures-local.ts` | Asserts the Goal 3 acceptance CASES individually, not just row totals. |
| `supabase/dev-fixtures.sql` | Two more Rotterdam projects and three more open needs — see §6. |
| `apps/web/messages/{lt,en,ru,nl,de}.json` | 63 keys under `conversation.results`. |

## 3. Canonical data path

```text
click on a MarketMap anchor
  → geographyFromAnchor(anchor)              precision comes FROM the anchor
  → serializeGeography(...)                  ?geo=NL:city:Rotterdam
  → useResultParam / parseGeography           validated, or ignored entirely
  → loadProjectResultsAction(geoToken)        re-validated server-side
  → loadProjectResults({ geography })         @/lib/supabase/server, signed-in user
  → job_demands(status=open) → projects → companies
  → RLS: projects_select (status='live'), job_demands_select (open + public)
  → groupIntoProjects(rows, geography, cityResolves)
  → ResultPanel → MarketDrilldown → project rows
  → loadProjectEvaluationAction(geoToken, projectId)
  → loadProjectEvaluation(...) + skills lookup
  → project evaluation (demand / geography / timing / organization /
                        data quality / explanation)
  → buildPeopleContinuation(...) → the people step's structured context
```

The list and the evaluation use the **same** grouping and the **same** geography
filter, so a project cannot match in one and not the other. `projectMatchesGeography`
mirrors `market-result.ts`'s aggregation exactly, so the number under the marker
and the number in the list agree by construction: Rotterdam's marker reads
`Rotterdam · 19` and the list header reads `Projektų: 3 · atviras poreikis: 19 žm.`

## 4. Browser evidence

Route base `/lt/dashboard?result=market`. Signed-in user `dev.worker@local.test`
(session minted via `scripts/e2e-mint-session.ts`, never typed). Active workspace
`Asmeninė erdvė` (no organization). Panel title `Rinka` throughout — one result,
three depths.

| Scenario | Selected geography | Projects | Opened project | Empty | Error | Fallback | Failed requests | Console errors |
|---|---|---|---|---|---|---|---|---|
| A0 market | — | — | — | 0 | 0 | 0 | 0 | 0 |
| A1 projects | `NL:city:Rotterdam` | **3** (19 people) | — | 0 | 0 | 0 | 0 | 0 |
| A2 evaluation | `NL:city:Rotterdam` | — | `2b000000-…-0001` | 0 | 0 | 0 | 0 | 0 |
| A3 continuation | `NL:city:Rotterdam` | — | same | 0 | 0 | 0 | 0 | 0 |
| B1 Eindhoven | `NL:city:Eindhoven` | **1** (7 people) | — | 0 | 0 | 0 | 0 | 0 |
| B2 Germany | `DE:country` | **1** (6 people) | — | 0 | 0 | 0 | 0 | 0 |
| C empty | `LT:city:Vilnius` | **0** | — | **1** | 0 | 0 | 0 | 0 |
| D1–D5 refresh/back | `NL:city:Rotterdam` | 3 → 3 → 3 | restored | 0 | 0 | 0 | 0 | 0 |
| E1 controlled failure | `NL:city:Rotterdam` | **0** | — | 0 | **1** `project_query_failed` | 0 | 0 | 0 |
| E2 market under failure | — | — | — | 0 | **1** `market-error` | 0 | 0 | 0 |
| E3 recovered | `NL:city:Rotterdam` | **3** | — | 0 | 0 | 0 | 0 | 0 |
| F1 region | `NL:region:Randstad` | **0** | — | 0 | 0 — `unsupported_precision` | 0 | 0 | 0 |
| F2 invented token | `NL:country:Rotterdam` → rejected | — | — | 0 | 0 | 0 | 0 | 0 |
| F3 project with no place | — | — | not opened | 0 | 0 | 0 | 0 | 0 |
| G sticky place | `NL:city:Rotterdam` | — | opened, scrolled | 0 | 0 | 0 | 0 | 0 |
| M mobile 390px | `NL:city:Rotterdam` | 3 | opened | 0 | 0 | 0 | 0 | 0 |

Visible evaluation fields: roles, people needed, open-need count, skills, open
vs filled (stated as not visible), per-need breakdown, country, city, precision,
selected anchor, anchor relation, start, end, missing-timing note, organization,
workspace, visibility note, complete/missing field chips, the deterministic
explanation, the no-judgement note, and the demand source.

**Counters.** `failedRequests` counts HTTP ≥ 400 and non-abort network failures —
**0 in every scenario**. `net::ERR_ABORTED` on server actions and `_rsc` prefetches
is counted separately (0–22 per scenario) and is the browser withdrawing in-flight
work on navigation plus React's dev-only StrictMode double-invoke; nothing failed.
`consoleErrors` is **0 in every scenario**; two messages that reproduce on the
baseline commit are counted separately by name (report-only CSP
`upgrade-insecure-requests`, and a composer `caret-color` hydration mismatch — no
`caret` rule exists in this repo's source).

Screenshots in this directory: `A0-market-1440`, `A1-projects-rotterdam-1440`,
`A2-evaluation-1440`, `A3-people-continuation-1440`, `B1-eindhoven-1440`,
`B2-germany-country-1440`, `C-empty-1440`, `D2-refresh-evaluation-1440`,
`E1-projects-error-1440`, `E2-market-error-1440`, `F1-region-unsupported-1440`,
`G-sticky-place-1440`, `M1-projects-390`, `M2-evaluation-390`.

### How Scenario E's failure was caused

In the LOCAL database only, `revoke select on public.projects from authenticated`,
so the join in the real loader genuinely cannot be read — what a broken grant or
a bad migration would do. No code path is flagged for testing. The grant is
restored in `finally`, followed by `notify pgrst, 'reload schema'`, and the
recovery is asserted. `has_table_privilege('authenticated','public.projects','select')`
= `t` afterwards. The spec refuses to run unless `baseURL` is loopback.

## 5. Engineering checks

| Command | Result |
|---|---|
| `pnpm -C apps/web typecheck` | **clean** |
| `pnpm -C apps/web lint` | **0 errors**, 22 warnings (all pre-existing, none in the new files) |
| `pnpm -C apps/web vitest run lib/guards/goal3-project-evaluation.test.ts` | **46 passed** |
| `pnpm -C apps/web test` (full) | **784 files passed, 6 failed / 12811 tests passed, 7 failed** |
| `pnpm -C apps/web db:fixtures:local` | **applied**, all 12 count assertions hold |
| `playwright test tests/e2e/goal3-project-evaluation.spec.ts` | **8 passed**, five consecutive clean runs |

The 6 failing unit-test files are **pre-existing on the baseline** and untouched
by this work: `landing-freeze`, `global-landing`, `public-market-entry`,
`public-nav-canonical`, `service-offers-baseline`, `form-submit-feedback`. All six
were confirmed failing at `edcec2fc` by stashing this branch's changes and
re-running them. All are landing-page guards left red by the landing rebuild
commits already on this branch.

## 6. Data classification

```text
local deterministic acceptance data in real domain tables;
real authenticated domain query under RLS;
not production data.
```

Acceptance coverage, each asserted individually by `db-fixtures-local.ts` so an
absent CASE fails the command rather than surfacing later as an empty panel:

| Requirement | Where |
|---|---|
| at least two countries | NL, DE, BE, PL |
| at least three cities or anchors | Rotterdam, Eindhoven, Amsterdam, Hamburg, Gdansk + DE/BE approximate aggregates |
| multiple projects in one selected city | **3** in Rotterdam |
| country-level / unresolved geography | Duisburg (DE) and Antwerpen (BE) are not in the canonical city table |
| zero-match selection | any valid place with no project, e.g. `LT:city:Vilnius` |
| project with complete timing | `2b…008` — project start **and** end date |
| project with missing timing | `2b…009` — no project dates, and its need has no start date |
| multiple required skills or roles | `2b…008` — two open needs, different roles, `required_skills` resolved from `skills` by slug |

## 7. Known incompleteness

1. **The people step is not delivered.** `Rasti tinkamus žmones` opens an explicit
   not-yet-delivered state that displays the real structured context it carries
   (project id, roles, skills, geography, headcount, start, end, workspace).
   There is deliberately no people list behind it. This is what the command asked
   for; full people matching is the next goal.
2. **`region` precision is unanswerable.** `projects` has `country` and `city` and
   no subdivision column, so a region selection returns `unsupported_precision`
   and says so. It is in the contract because the command specified it; it is not
   in the data. No anchor on the map can produce one — only a hand-typed URL.
3. **Filled demand is not shown**, because a non-owning reader is not authorized
   to read it. The evaluation states that rather than printing a zero.
4. **A real defect was found in the browser and fixed here**, not in the original
   design: `use-result-param.ts` refreshed its live-location fallback only when
   the `useSearchParams` object changed identity. After a page RELOAD the hook is
   in the empty-params state (the Goal 4 condition), so that fallback decides
   which depth renders — and browser Back fires `popstate` without necessarily
   changing the params object. The URL said "project list" while the panel still
   showed the evaluation, and Back appeared to do nothing. It is intermittent, it
   was invisible to `tsc` and to every unit test, and it took the real browser to
   surface. Fixed by listening to `popstate` and making the live location
   authoritative once mounted; pinned by a guard test.
5. **`conversation.results` exists in 5 of 11 locales** (lt, en, ru, nl, de). That
   is the baseline's state for this namespace, not a regression — the market keys
   shipped the same way. `da`, `et`, `lv`, `no`, `pl`, `sv` have no
   `conversation.results` block at all.
6. **The `RLS` wording was removed from user copy.** `architecture-copy.test.ts`
   correctly bans implementation primitives in user-facing strings. The visibility
   rule is stated in user language ("you see publicly open needs in active
   projects only"); the mechanism is named in code comments and in this document.
7. **Playwright expect timeout is 15 s in this spec** because `next dev` compiles
   a route on first request while eight scenarios share one server. No assertion
   is skipped, nothing is retried, and the suite ran clean five consecutive times.
8. **The whole proof is local.** Production has not been touched in any way.

## 8. Production status

```text
merge performed:              NO
deploy performed:             NO
production writes performed:  NO
migration performed:          NO
```

No migration exists in this change — the feature reads existing tables. The only
database writes are `supabase/dev-fixtures.sql` applied to the LOCAL stack, plus
Scenario E's revoke/grant on the LOCAL stack, restored and verified.
