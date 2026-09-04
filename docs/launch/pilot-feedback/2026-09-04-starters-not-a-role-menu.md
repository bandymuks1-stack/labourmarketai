# Role-tunnel repair — starters are suggestions, not a role menu (2026-09-04)

> Owner Master Execution Contract 2026-09-04 §5–§6 (`docs/ARCHITECTURE.md`
> §5.5). Real-user evidence stays separate from agent probes: the drift was
> seen by the owner on the real recruiter's workspace; the verification below
> used a bounded synthetic identity, never the real account.

## What the owner saw

"Labour market ai Sp. z o.o" — a staffing agency that ALSO holds the
`employer` and `training_provider` capabilities, 8 open needs, a roster
worker and a project — opened with exactly three agency chips:
Pakviesti klientą · Klientų poreikiai · Pasiūlymų būsena. The company was
visually reduced to one role.

## Root cause

The greeting row was a fixed three-way branch inside the chat component
(education | agency | employer) decided by one server flag; the
not-understood answer was one sentence per role. Being an agency erased the
company's other legitimate capabilities from the opening.

## The fix (#1467, GREEN, prod `a870427a`)

- `lib/conversation/starters.ts` (pure): capability TRACKS the workspace holds
  (employer = every company; agency = staffing-agency type; education =
  `training_provider`; operations) → the NEXT REAL STEP of each track from the
  facts (open needs, projects, roster, client connections, shared requests,
  proposals, learners, programmes) → round-robin across tracks, cap 3 (§D),
  de-duplicated. A degraded read never invents a step.
- `lib/conversation/starter-signals.ts`: the server half over the same
  canonical resolvers + bounded RLS head counts.
- The not-understood answer is COMPOSED from all held capabilities; the
  company opening names the organization and what the product can do for it
  here (CF-4). 7 keys × 11 locales.
- #1466 untouched: same intents, dispatcher, inline forms, telemetry.

## Production verification (E2E agency identity, 390 px, `a870427a`)

| Step | Observed |
|---|---|
| greeting | "Veikiate „E2E Agentūra UAB (testinis subjektas)“ vardu. Čia galiu padėti su klientais ir pasiūlymais jiems, darbuotojų poreikiais, kandidatais, projektais ir komanda." |
| starters | **Klientų poreikiai · Reikia darbuotojų · Pakviesti kandidatą** — one step per track (agency: a pending client invite, no shared need yet; employer: 0 open needs; operations: empty pool). Not three agency chips. |
| "blablabla xyz" | the COMPOSED fallback ("Galiu padėti su klientais ir pasiūlymais jiems, darbuotojų poreikiais, …"), never the old agency-only or worker copy |
| "reikia darbuotojų" in the agency workspace | the ONE demand form opens (`company.create-demand`) — the employer capability is intact inside an agency |
| "noriu pakviesti klientą" | "Gerai. Kokiu el. paštu pakviesti klientą?" + the one-field form (no regression of #1466; stopped before writing) |

Expected for the real account on its next visit (facts read 2026-09-04):
**Pakviesti klientą · Kandidatai · Projektai** (agency first step, the
employer's candidates on 8 open needs, the running project), with the
opening line naming "Labour market ai Sp. z o.o" and listing clients,
needs, candidates, projects and learners. The education track is the fourth
track and falls outside the three-chip cap — it stays reachable by sentence
("pakviesti studentą", "programos") and is named in the opening line.

Recorded, not built: pins ("My Space") and frequency-of-use signals — no pin
persistence exists and funnel events are write-only for the user. The
resolver has the extension point (add a track / a signal).
