# OWNER EXECUTION COMMAND — COMPLETE GOAL 3 IN THE AUTHENTICATED AI WORKSPACE

## GOAL

Deliver and prove:

> **GOAL 3 — EVALUATE PROJECTS**

The user must be able to start from the already proven market-demand result, select a real region or city, receive matching projects in the same canonical `ResultPanel`, open one project, understand why it matches, and continue toward people without leaving the single AI Workspace.

This is an execution task. Do not return another audit, readiness report, architecture proposal, or documentation-only result.

---

## REPOSITORY AND SAFETY

Repository:

```text
C:\Users\Mano\Documents\labourmarketai
```

Project:

```text
labourmarket.ai
```

Current verified baseline commit:

```text
edcec2fc
```

Mandatory rules:

- Do not touch or reference the abandoned old project.
- Do not create another repository.
- Do not create a parallel dashboard.
- Do not create a second project-result architecture.
- Do not duplicate `MarketMap`.
- Do not use fake UI data.
- Do not write production data.
- Do not merge or deploy without explicit owner authorization.
- Do not initiate purchases, billing changes, subscriptions, credits, or paid services.
- Preserve the chat-first, single-workspace, single-`ResultPanel` architecture.

---

## PROVEN BASELINE — DO NOT REBUILD

`GOAL 4 — UNDERSTAND WHERE DEMAND EXISTS` is already proven in an authenticated browser.

Verified route:

```text
/lt/dashboard?result=market
```

Verified signed-in acceptance user:

```text
dev.worker@local.test
```

Verified behavior:

- active context `Asmeninė erdvė`;
- `ResultPanel` title `Rinka`;
- `loadMarketResult()` executes;
- data comes from `job_demands(status=open) JOIN projects`;
- reads are authorized through RLS;
- canonical `MarketMap` renders inside the result panel;
- `data-map-origin="live"`;
- no empty fallback;
- no silent demo fallback;
- no failed requests;
- solid markers represent city-level precision;
- dashed markers represent unresolved geography;
- the background workspace map is hidden when the market result owns geography.

Do not spend this session re-auditing or rebuilding Goal 4.

---

## REQUIRED DELIVERY

Implement the authenticated continuation:

```text
MarketMap region/city
→ selected geography context
→ matching projects
→ project evaluation
→ continue to matching people
```

The completed scope of this command is:

```text
MarketMap → Projects ResultPanel → Project Detail/Evaluation
```

The people step needs a real continuation entry point with correct structured context. Full people matching is the next goal.

---

# W4.1 — REGION OR CITY SELECTION

Make real market anchors interactive.

Required behavior:

1. The user clicks a city, country, region, or demand cluster.
2. The selected geography becomes explicit structured context.
3. The context contains only supported precision fields.
4. The selection is visible to the user.
5. Back navigation restores the market result and its selection state.
6. The state survives refresh through a stable URL or equivalent canonical restorable state.
7. No second map appears.

Use a typed geography contract equivalent to:

```ts
type GeographySelection = {
  countryCode: string
  city?: string
  region?: string
  precision: "city" | "region" | "country"
}
```

Do not infer a city when the underlying data only supports a country.

---

# W4.2 — CANONICAL PROJECT QUERY

Create or reuse one canonical project-result loader.

Preferred contract:

```ts
loadProjectResults({
  workspaceId,
  geography,
  demandId,
  status: "open",
})
```

The loader must:

- read real domain tables;
- run as the authenticated acceptance user;
- remain protected by RLS;
- return only projects matching the selected geography and open demand;
- return explicit empty and error states;
- never replace a failed query with fixture data;
- keep deterministic acceptance rows separate from production classification;
- avoid embedding domain SQL directly inside presentation components.

Use existing domain structures wherever possible. Do not create duplicate project tables or a second project model.

---

# W4.3 — PROJECTS RESULT IN THE SAME RESULTPANEL

After geography selection, advance the existing result inside the same canonical `ResultPanel`.

Required project-row information:

- project name;
- organization;
- country;
- city or supported geographic precision;
- required role or skill;
- open headcount;
- project status;
- start date or time window when available;
- demand source;
- reason the project matches the selected geography;
- data completeness or missing-field indication.

The result must answer:

```text
Which projects create this demand?
Why are they relevant to the selected place?
How much demand does each project represent?
What important information is still missing?
```

Do not show decorative project cards without traceable data.

---

# W4.4 — PROJECT EVALUATION

Selecting a project must open a real evaluation view in the same AI Workspace.

The project evaluation must show:

## Demand

- required roles;
- required skills;
- requested headcount;
- open versus filled demand where available.

## Geography

- project country;
- city or region;
- precision level;
- relationship to the selected market anchor.

## Timing

- proposed start;
- duration or stages when available;
- missing timing information when unavailable.

## Organization

- owning organization;
- workspace relationship;
- visibility allowed by RLS.

## Data quality

- complete fields;
- missing fields;
- unresolved geography;
- stale or uncertain values when detectable.

## Explanation

Provide a deterministic, evidence-based explanation of why the project appeared.

Do not call deterministic rules “AI semantic matching” or “AI prediction”.

A correct explanation may say:

```text
This project appears because it has open demand in Rotterdam and matches the selected city-level market anchor.
```

It must not invent commercial attractiveness, success probability, worker suitability, or project quality.

---

# W4.5 — CONTINUATION TO PEOPLE

Add one real continuation control from the selected project:

```text
Rasti tinkamus žmones
```

or the correct localized equivalent.

It must pass structured project context forward, including at minimum:

- `projectId`;
- required skills or roles;
- geography;
- requested headcount;
- time window when available;
- active workspace.

Do not implement a fake people list merely to make the control appear functional.

The control must either:

1. open the real next result if the existing people query is ready; or
2. enter an honest not-yet-delivered state carrying the correct structured context.

It must not silently do nothing.

---

# ACCEPTANCE DATA

Use deterministic local acceptance rows in real domain tables.

Minimum acceptance coverage:

- at least two countries;
- at least three cities or geographic anchors;
- multiple projects in one selected city;
- one country-level or unresolved-geography case;
- one zero-match selection;
- one project with complete timing;
- one project with missing timing;
- one project with multiple required skills or roles.

Acceptance data must be:

- clearly classified as local acceptance data;
- queried through the real domain code path;
- read under RLS;
- never described as production data.

---

# AUTHENTICATED BROWSER PROOF

Tests alone are insufficient.

Use the authenticated browser session and prove the complete goal.

## Scenario A — Rotterdam

1. Open:

```text
/lt/dashboard?result=market
```

2. Confirm the signed-in user and active workspace.
3. Click Rotterdam.
4. Confirm matching projects appear.
5. Confirm only Rotterdam-supported projects are shown.
6. Open one project.
7. Confirm the project evaluation fields and explanation.
8. Confirm the continuation control to people contains the selected project context.

## Scenario B — Another geography

1. Return to market.
2. Select Eindhoven, Amsterdam, Germany, Belgium, or another deterministic acceptance anchor.
3. Confirm the result changes.
4. Confirm Rotterdam-only projects are absent where they should be absent.

## Scenario C — Empty result

1. Select or deep-link a valid geography with no matching project.
2. Confirm an honest empty state.
3. Confirm no fallback or fake project appears.

## Scenario D — Refresh and back navigation

1. Open a selected geography result.
2. Refresh.
3. Confirm the same project result is restored.
4. Open a project.
5. Go back.
6. Confirm the project list or market state is restored correctly.

## Scenario E — Error behavior

Cause a controlled acceptance query failure without modifying production.

Confirm:

- explicit error UI;
- no silent fallback;
- no stale project list presented as current;
- no uncaught application error in the browser console.

---

# VISUAL REQUIREMENTS

The project result must be commercially usable, not merely technically present.

Required:

- no two maps stacked;
- no cramped duplicate side panels;
- project-result hierarchy is immediately understandable;
- selected geography remains visible;
- project rows are readable at desktop width;
- mobile layout does not overflow horizontally;
- empty and error states have deliberate layouts;
- expanded or wider workspace mode is used when the current `22rem` panel is insufficient.

If expanded or fullscreen `MarketMap` or ResultPanel modes already exist, wire the canonical implementation instead of building another one.

---

# REQUIRED AUTOMATED CHECKS

Add focused guard tests for:

- geography-selection serialization;
- city precision;
- country precision;
- project filtering;
- zero-result handling;
- explicit error handling;
- URL or state restoration;
- duplicate-map prevention;
- RLS-authorized loader behavior where test infrastructure supports it;
- no fallback replacement after a live-query failure.

Run at minimum:

```text
targeted tests
typecheck
eslint
relevant existing guard suite
```

Do not claim the goal is complete if the authenticated browser scenarios were not executed.

---

# EVIDENCE PACKAGE

At completion, provide one evidence-based report containing:

## 1. Verdict

Use exactly one of:

```text
GOAL_3_PROJECT_EVALUATION_AUTHENTICATED_BROWSER_PROVEN
```

or:

```text
GOAL_3_NOT_PROVEN
```

Do not use `COMPLETE`, `DONE`, `SHIPPED`, `E2E_COMPLETE`, or `PRODUCTION_VERIFIED` unless the evidence literally supports it.

## 2. Changed files

List every changed file and its purpose.

## 3. Canonical data path

State the exact chain:

```text
UI selection
→ structured geography
→ loader
→ tables/views
→ RLS
→ ResultPanel
→ project evaluation
```

## 4. Browser evidence

For each scenario provide:

- route;
- signed-in user;
- active workspace;
- selected geography;
- number of returned projects;
- opened project;
- visible evaluation fields;
- empty, error, and fallback counters;
- failed request count;
- console error count;
- screenshots.

## 5. Engineering checks

Report exact commands and exact results.

## 6. Data classification

State exactly:

```text
local deterministic acceptance data in real domain tables;
real authenticated domain query under RLS;
not production data.
```

## 7. Known incompleteness

List every remaining defect honestly.

## 8. Production status

State explicitly:

- merge performed or not;
- deploy performed or not;
- production writes performed or not;
- migration performed or not.

---

# STOP CONDITIONS

Stop and report `GOAL_3_NOT_PROVEN` when any of these is true:

- the project list is static or mocked in the component;
- region selection does not alter the real query;
- RLS is bypassed for browser proof;
- project evaluation invents unsupported information;
- failed queries silently display fallback rows;
- browser state cannot be restored;
- two maps remain visible;
- authenticated browser verification was not completed;
- production was modified without explicit owner authorization.

---

# DEFINITION OF DONE

This command is delivered only when the authenticated browser proves:

```text
The user opens the proven market result,
selects a real geography,
sees correctly filtered real project rows,
opens one project,
understands why it matches and what data supports it,
and can continue toward matching people
inside the same canonical AI Workspace.
```

Anything less is not Goal 3 completion.
