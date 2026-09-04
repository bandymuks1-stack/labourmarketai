# 2026-09-04 — a project by sentence (F2: the site as a project object)

**Actor:** employer / agency (E2E company identity `E2E Agentūra UAB (testinis subjektas)`,
profile `2c74c70d…`, company `0a26c7bf…`) — engineering evidence, never the real user.

## What was broken

The conversation could LIST projects ("mano projektai") and OPEN one, but could not
START one: the only entry was the company page's form. So the employer chain
need → project → assignment never closed inside the chat; the owner's queue named
it as the F2 remainder ("the site as a project object").

## What shipped (#1483, prod `f307e574`)

- intent `create-project` — "sukurk projektą Roterdame", "naujas objektas Vilniuje",
  "create a new project in Rotterdam", "neues Projekt / Baustelle anlegen",
  "nieuw project aanmaken", "создай проект". Company identity only.
- `company.create-project` over the canonical `createProjectAction` (the SAME
  `insertProjectForCompany` core the company page uses; RLS `projects_insert`).
- the city the sentence named pre-fills the form (visible, editable, confirmed);
  My Space counts the sentence for `f:company.create-project`.

## Prod walk (`walk-create-project-prod.cjs`, 17.8 s, build `f307e574`)

| Step | Result |
|---|---|
| "sukurk projektą Roterdame" | the ONE inline form `company.create-project` opened; intro line shown |
| pre-fill | `city = "Rotterdam"` from the sentence (title empty, as it must be — nothing invented) |
| title typed, continue, review, save | `inline-action-done` reached in 13.3 s |
| DB readback (MCP SQL) | `projects` row `d84e593e…`, title as typed, city `Rotterdam`, `company_id 0a26c7bf…`, `organization_id 5e40a05a…`, `created_at 19:30:03 UTC` |
| residue | row deleted afterwards (E2E evidence only) |

Note: the service-role client is denied on `projects` (`permission denied for table
projects`) — readback via Supabase MCP `execute_sql`, same as `customer_requests`.

## Follow-on (branch `feat/cc/project-after-create`)

After creation the new project opens in the panel (the same opener the "projects"
chip uses: real, empty roster + assignment controls) with one line: "Projektas
sukurtas. Čia pat priskirkite žmones…". No second view, no menu.

## People on the project (prod `f49cc972`) — and the readback defect it found

`walk-project-assign-prod.cjs`, E2E Walker UAB (desktop viewport), 38.0 s:
"sukurk projektą Vilniuje" → form pre-filled `city = Vilnius` → "E2E Vilniaus objektas
(testinis)" saved → "mano projektai" → the ONE project opens as the detail panel
("JUODRAŠTIS · E2E WALKER UAB · Vilnius · Priskirta 0 · Priskirti darbuotoją") →
"Priskirti darbuotoją" → "Kas turėtų jame dirbti?" with the chip **E2E Worker Two** (the
worker whose engagement the agency placement created minutes earlier) → chip →
**"Priskirta projektui."** DB: `project_worker_assignments` row `80883119…` active at
20:50:26 UTC (project `3b9c55d3…`, worker `0dbd5eda…`).

**Defect:** the panel re-opened right after the success line still read "Priskirta 0"
— the chat re-addressed the SAME project, the address did not change, and the detail
did not re-read. Fixed on `fix/cc/project-panel-refetch-after-assign`: the opener stamps
a fresh `pr` token, the detail re-reads when it changes.

Also noted: on the phone viewport the worker chip sits in the thread UNDER the open
panel, so it could not be tapped (the walk had to use a desktop viewport) — a real
ordinary-human friction on mobile after an in-panel action offers chips in the thread;
recorded, not fixed tonight.

E2E residue: project `3b9c55d3` (draft) with one assignment — kept (the worker's
work-log against it is the next proof).

## Work → evidence on the chat-created project (prod `461326d2`)

`walk-worklog-project-prod.cjs`, E2E Worker Two, 30.6 s: "Užpildyk darbo žurnalą" → the
work-log form (date · place "Vilnius" · "Klojau pamatus Vilniaus objekte. E2E-WL-…") →
two-step save. DB: `journal_entries` row `01d4a36d…` at 20:58:52 UTC with
**`project_id 3b9c55d3…`** (the project created by sentence 14 minutes earlier) and
`engagement_context_id 90da8c16…` — the chat attached the work to the assignment
without asking, because the worker has exactly one active context.

So PROJECT create → people → work → evidence is proven on production by sentence and
chips; the evidence sits on the worker's identity (journal → verified CV sheet) and on
the project. Not seen: the employer's greeting did not carry a "… laukia peržiūros"
line 14 s later (the review queue keys on the confirmation model; the brief showed the
institution line only) — recorded for the next observation, not chased tonight.
