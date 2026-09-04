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
