# Train I1 — production UX walk, worker + company workspaces (2026-09-02)

Bounded walker identity (worker, onboarded; a company profile created through the same RPC the setup form
calls), API login + cookie injection, headless Chromium at **390 px** and **1440 px**, `waitUntil: networkidle`.
Screenshots: `ux-audit/worker-*.png` (26 files). Findings are about the product, not about the identity.

## Route table

| Route | 390 | 1440 | h1 | Note |
|---|---|---|---|---|
| `/dashboard` (person home) | 200, **16.1 s first load** | 200, 6.9 s | Labas, E2E… | chat-first home + right rail map ("Tavo darbas dabar"); first load is a cold-start outlier — see L |
| `/dashboard/journal` | 200 | 200 | Darbo žurnalas | honest empty state, chat CTA + voice; no composer on the page (by design) |
| `/dashboard/profile` | 200 | 200 | Mano profilis | |
| `/dashboard/documents` | 200, 10.2 s | 200 | Mano dokumentai | slow at 390 on first load |
| `/dashboard/planning` | 200 | 200 | Kalendorius | 5 views + 9 type chips; empty-state actions; timesheet section below |
| `/dashboard/market-map` | 200 | 200 | Žemėlapis | |
| `/dashboard/communication` | 200 | 200 | Mano pranešimai | |
| `/dashboard/network` | 200 | 200 | Ryšiai | |
| `/dashboard/account` | 200 | 200 | Nustatymai | Connected apps section live (A2) |
| `/dashboard/services` | 200 | 200 | Paslaugos | reachable directly; empty state + "Pridėti paslaugą" |
| `/dashboard/service-requests` | 200 | 200 | Atrask ir užsisakyk paslaugas | reachable directly |
| `/dashboard/company` | 200 | 200 | Įmonės darbo erdvė | company setup CTA (workspace pill stayed "Asmeninė erdvė": the workspace is the durable pointer, not `active_role`) |
| `/dashboard/company/planning` | 200 | 200, 6.6 s | Darbo jėgos planavimas | "Šiandienos darbo įrašai: Dabar nepavyksta perskaityti" — an honest read failure rendered to a manager with no org context |
| `/dashboard/projects` | 200 | 200 | Projektai ir priskyrimai | "RUOŠIAMA — projektai ir komandos" label above a working form |
| `/dashboard/tasks`, `/inbox`, `/absences`, `/activity` | 200 | 200 | — | consistent |
| `/dashboard/jobs`, `/dashboard/cv`, `/dashboard/advanced`, `/dashboard/company/projects` | 404 | 404 | Puslapis nerastas | not routes (jobs are public `/jobs`; CV lives under profile; advanced retired) |
| `/dashboard/talent` | → `/dashboard` | | | redirect alias |

Horizontal overflow: **none** on any route at 390 px.

## Design-system verdict

- ONE visual generation on every route walked: the same shell (wordmark, workspace pill, finder, locale, bell,
  avatar), the same card, chip and mono-eyebrow vocabulary, the same empty-state pattern. **No 2018-CRM
  table/grid admin pattern was found on the worker or company routes** — the "old SaaS UI" the owner reported
  is not on these 26 screens. Admin routes (`/dashboard/admin/*`) and the public landing were not walked with
  this identity (not an admin); they are the remaining candidates and need the owner's own session or an admin
  test identity.
- Inner pages render under **back-arrow-only chrome** with no persistent primary navigation at 1440 px
  (M11). The finder is the navigation. This is the one pattern most likely to read as "dead-end screens".
- Technical vocabulary exposed to a worker with nothing planned: the calendar's nine type chips
  (REZERVACIJA … ETAPAI) and the timesheet block ("Darbo laiko žiniaraščiai") on a worker who belongs to no
  organisation.
- "RUOŠIAMA" (preparing) label on `/dashboard/projects` above a form that works — stale honesty copy.
- "Sukurta Rexora" footer on every dashboard page.
- Cold first loads of 7–16 s (home, documents) versus 1.3–2.5 s warm — the same cold-start class measured on
  `/api/mcp`; not a design defect but the first thing a new person feels.

## What this closes / opens

- M7 (marketplace loop unreachable): the loop IS reachable — direct routes render, the map bridge links both
  halves, the command finder resolves them, the activity centre lists their signals. Not in the global nav
  **by the compact map-first IA ruling** (`compact-nav-marketplace-ia.test.ts`). Register: CLOSED as a
  decision, not a defect.
- M8 (customer role absent from onboarding): the customer is a company TYPE (`client_customer`) by the
  company-role-simplicity ruling; `ROLE_CARDS = worker | company` is deliberate. Register: CLOSED as a decision.
- I2 decisions still needed (owner-visible, in the register): persistent inner-page navigation vs finder-only;
  role-aware chip vocabulary on the calendar; the "RUOŠIAMA" label; the footer attribution.
