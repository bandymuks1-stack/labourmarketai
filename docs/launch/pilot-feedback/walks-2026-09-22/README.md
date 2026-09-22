# walks-2026-09-22 — GLOBAL ACCESS production walk (owner directive 2026-09-22 §2)

`walk-global-access-prod.cjs` proves, on the deployed build, that a company, a worker and a
demand draft can carry **any** of the representative countries `LT SE DE IE VN US SA GE PH`
through the shipped UI. MARKET PRIORITY ≠ ACCESS PERMISSION: a market list may order a country
select, it may never shorten it.

Written 2026-09-22 on branch `test/cc/walk-global-access-prod-v1`; **not yet run against
production** (the run needs the build that carries this branch's product fixes — see "What the
walk expects" below).

## Prerequisites
- A checkout with `node_modules` (`@playwright/test` + chromium, `@supabase/supabase-js`).
  `ROOT` is resolved from `__dirname` (four levels up) — never the stale
  `C:/Users/Mano/Documents/labourmarketai` checkout; `WALK_ROOT` overrides it.
- An `apps/web/.env.local` holding `NEXT_PUBLIC_SUPABASE_URL` (host `gorgitwvdzxbnaxhrsrw`),
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — read by NAME, never printed.
  A worktree usually has none (gitignored): point `WALK_ENV_FILE` at the one in a checkout that
  has it instead of copying it.
- `EXPECT_BUILD=<7+ hex of the deployed SHA>`; the walk **refuses to run** (exit 1, before any
  browser opens) when `https://labourmarket.ai/api/health` `.build` does not start with it.
- The two EXISTING E2E identities from the 09-05 walks — **no auth user is ever created**:
  - manager `e2e-walker-202609021438@labourmarket.ai` (owner of "E2E Walker UAB";
    `walk-stripe-live-prod.cjs` / `walk-billing-safety-prod.cjs`),
  - worker `e2e-worker2-202609021527@labourmarket.ai` (`walk-invitation-prod.cjs`,
    `walk-confirm-work-prod.cjs`, …).
  If one does not exist the walk stops with `NEEDS_IDENTITY` (`WALK_MANAGER_EMAIL` /
  `WALK_WORKER_EMAIL` may name another existing `e2e-*@labourmarket.ai` identity).

## Command (PowerShell, from anywhere)
```
$env:EXPECT_BUILD="<sha7>"
$env:WALK_ENV_FILE="C:\Users\Mano\Documents\labourmarketai-wt\<checkout-with-env>\apps\web\.env.local"
node "C:\Users\Mano\Documents\labourmarketai-wt\<worktree>\docs\launch\pilot-feedback\walks-2026-09-22\walk-global-access-prod.cjs" | Tee-Object walk-global-access-<sha7>.log
```
Optional: `WALK_COUNTRIES="LT,VN"` narrows the list; `WALK_RESTORE=0` leaves the last country
in place (default: the baselines are restored through the same UI at the end).
Screenshots: `walks-2026-09-22/walk-global-access/<CODE>-1-company-*.png`,
`<CODE>-2-workcard-*.png`, `<CODE>-3-draft-*.png`, `<CODE>-4-onboarding-*.png` (only when the
wizard is reachable), `<CODE>-99-failed-<leg>.png` on a failed leg. Runtime ≈ 6–10 min for all
nine codes.

## What the walk does per country code (one JSON line per step)
`health` → `L0_identities` → `L0_baseline` (the rows as found — copy into the residue register)
→ `L0_countries_table` (which of the nine codes the `countries` table holds) → per code:

1. `<CODE>_company` — `/lt/dashboard/start/company`, `[company-setup-country]`
   `selectOption(code)` → `[company-setup-save-draft]` → the `[company-setup-result]` banner is
   NOT `statusInvalidCountry` → service-role read-back `companies.country = code` AND
   `organizations.country = code` (values only for the E2E org). A VERIFIED company has a
   locked country and reports `country_locked_verified`.
2. `<CODE>_workCard` — `/lt/dashboard?result=player-card` (fallback `/lt/dashboard/profile`),
   `[work-card-editor-toggle]` → `name=location_country` gets the country NAME in `lt`
   (`Vietnamas`, `Airija`, `Saudo Arabija`, …), `name=preferred_countries` the nine names →
   save → `workers.current_location_country = code`, `workers.preferred_countries` = the nine
   codes.
3. `<CODE>_draft` — `/lt/dashboard/company/needs`, `[demand-role]` + `[demand-description]` →
   `[demand-next]` → `[demand-country-select]` (DarkListbox; the option is picked by its `lt`
   label) → `[demand-save-draft]` **only** (never `[demand-create]`) → `[demand-draft-saved]` →
   `customer_requests` (status `draft`, kind `company_request`) `.country = code` and
   `payload.country = code`; the walk also counts `submitted` rows with its title (must be 0).
4. `<CODE>_onboarding` — observation: `/lt/onboarding` with each identity. Both are onboarded
   and are forwarded away (`unreachable_onboarded`, `ok: null`) — the walk creates no user to
   reach the wizard. The local spec below covers the select with a throwaway local identity.

`country_end` per code → `RESTORE_*` legs → `residue` → `summary`
`{ countriesPassed, countriesFailed[{code, legs}], evidence }` → `done`.

## What the walk expects (and what it measures when it is not there)
- `countries` seeded with every ISO code (migration `20260922120000_countries_all_iso_v1`,
  owner-gated apply). Unapplied: leg 1 fails for IE VN US SA PH with the honest
  invalid-country banner; `L0_countries_table.missing` names them.
- The draft country stamp (this branch: `lib/demand/demand-drafts.ts` writes
  `customer_requests.country`; `demand-request-button.tsx` forwards the picked code). On a build
  without it, leg 3 fails with `readback.customerRequestsCountry=false` for every code — that is
  exactly the gap the branch closes, measured.
- The onboarding select over every ISO country (this branch: `onboarding-wizard.tsx` uses
  `countryOptionsForLocale`). Not exercised by the walk (see 4); covered locally.

## Residue register (the `residue` line)
```
{ "step":"residue",
  "runWindow": { startedAt, finishedAt, build, stamp },
  "identities": { manager:{email, profile_id}, worker:{email, profile_id}, keep:true, note:"auth.users/profiles KEPT" },
  "excludeFromPilotMetrics": { profile_ids:[…2], organization_ids:[…], company_ids:[…], worker_ids:[…], window:[startedAt, finishedAt] },
  "touched": { companies:[{id, column:"country", baseline}], organizations:[…mirror], workers:[{id, columns, baseline}],
               customer_requests:[{id, kind, title, status, baselineDraft}], pilot_events:"exclude by profile_id + window, never delete" },
  "restore": { company, workCard, draft }        // what the walk itself restored through the UI / closed
  "restoreStatements": [ "update companies set country = … where id = …", "update workers set … where id = …",
                         "update customer_requests set status = 'closed' where id = … and status = 'draft'" ],
  "deleteOrder": "nothing to DELETE — one draft row (CLOSED), the rest are UPDATEs of existing rows; KEEP auth.users + profiles + pilot_events",
  "inspect": [ 5 SQL statements keyed on the two profile ids / the walk's draft title ] }
```
Rows this walk writes: the E2E company's `country` (+ the `organizations` mirror), the E2E
worker's card columns, ONE `customer_requests` draft (one draft per profile+kind — every
country iteration upserts the same row; a pre-existing draft of the manager is overwritten and
its baseline payload is logged in `L0_baseline`). QA rows are excludable from pilot metrics by
the two `profile_ids` + the `organization_ids` + the run window.

## Local counterpart — RUN, 29/29 green (2026-09-22)
`apps/web/tests/e2e/global-access-countries.spec.ts` exercises the same three surfaces per
code (plus the onboarding select with a throwaway LOCAL identity) against the local Supabase
stack: `pnpm -C apps/web e2e:local tests/e2e/global-access-countries.spec.ts`. It never targets
the cloud (loopback-guarded DB helper) and needs `20260922120000` applied locally.

Measured: countries table 9/9 · company setup 9/9 (`companies.country` + the `organizations`
mirror) · work card 9/9 (`Vietnamas`/`Airija`/`Saudo Arabija` → `VN`/`IE`/`SA`, preferred list →
the nine codes) · demand DRAFT 9/9 (`customer_requests.country` = code, `payload.country` =
code, 0 submitted) · onboarding select 249 options including all nine, LT before VN. Fixture
rows restored afterwards (companies `NL`, worker columns `null`, no leftover draft).

### Four dev-server behaviours these runs measured — the walk carries the same guards
1. **A client form submitted before hydration does nothing useful.** The login form answered
   `POST 200` with the same page; `company-setup-save-draft` posted the bare form to
   `/lt/dashboard` and no banner rendered. Load to `networkidle` and retry the click.
2. **An uncontrolled select's pick is reverted by hydration.** Picked `SA`, the select read
   `US`, the banner still said "saved" — and the row kept the PREVIOUS country. Re-pick until
   `inputValue()` holds, and let the ROW decide when the save is done.
3. **A controlled field ignores a re-fill of the SAME text.** React's value tracker sees no
   change, so no `onChange` fires and `demand-next` stays disabled forever (30 re-fills over
   120 s). Clear the field before every retry.
4. **At phone width the context panel is folded.** `player-card-work-editor` resolves but stays
   hidden, and `revalidatePath` re-folds it after each save — so the success line is in the DOM
   while hidden (`innerText()` of a hidden node is empty; read `textContent`). Open it through
   `context-panel-toggle`, and assert the status is ATTACHED, not visible.
