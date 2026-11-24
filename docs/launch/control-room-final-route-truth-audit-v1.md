# Control Room — Final Route-Truth & Dedup Audit (v1, programme close-out)

Companion to `docs/launch/control-room-capability-gap-map-v1.md` (audit truth @ `7f863f9`)
and `docs/launch/control-room-capability-execution-report-v1.md`. Written with PR K
(universal search + reports hub), the FINAL slice of the control-room capability
programme (PRs A–K). Every claim below is repo-verifiable; where a claim is enforced by
a guard, the guard file is named.

Status legend: `REGISTERED` = present in the named registry · `EXCLUDED_BY_DESIGN` =
deliberately not in that registry, with the reason · `—` = not applicable.

## 1. Route / module inventory — everything PRs B–K added, and where it is registered

Registries checked (the four places a module surface must exist):

- **Module registry** — `apps/web/lib/dashboard/dashboard-module-registry.ts`
  (`DASHBOARD_MODULES`; guard `dashboard-module-registry.test.ts`).
- **Command registry** — `apps/web/lib/navigation/command-registry.ts`
  (`COMMAND_REGISTRY`; guard `command-finder.test.ts`).
- **Smoke inventory** — `apps/web/lib/guards/primary-route-smoke.ts` (`PRIMARY_ROUTES`).
- **Route truth map** — `apps/web/lib/guards/route-truth-map.test.ts` (`CLASSIFICATION`;
  the suite FAILS on any unclassified dashboard route, so this list cannot drift).

| PR | Surface / route | Module registry | Command registry | Smoke inventory | Route truth map |
|---|---|---|---|---|---|
| B | `/dashboard` role-aware control room (module grid + status strip) | REGISTERED (registry itself + `overview` nav module) | REGISTERED (existing entries re-routed through `getModuleRoute`) | REGISTERED (`dashboard-hub` id) | `REAL_LAUNCH_SURFACE` |
| B | Ctrl/Cmd+K on the CommandFinder | — | — (component behaviour) | — | — |
| C | `/dashboard/activity` (unified activity centre) | REGISTERED (`activity`) | REGISTERED (`activity`) | REGISTERED (`activity`) | `REAL_LAUNCH_SURFACE` |
| D | `/dashboard/tasks` (work tasks; degrades until D2) | REGISTERED (`tasks`) | REGISTERED (`tasks`) | REGISTERED (`tasks`) | `REAL_LAUNCH_SURFACE` |
| E | `/dashboard/planning` (unified agenda) | REGISTERED (`planning`) | REGISTERED (`planning`) | REGISTERED (`planning`) | `REAL_LAUNCH_SURFACE` |
| F | `/dashboard/admin/pipeline` (operator demand queue) | EXCLUDED_BY_DESIGN (admin tooling is not a role-grid module) | REGISTERED (`admin_pipeline`, audience `admin` only) | EXCLUDED_BY_DESIGN (admin routes are outside the primary-flow smoke, per the inventory's own exclusion note) | `INTERNAL_ADMIN` |
| G | `/dashboard/projects` as a grid module + `/dashboard/projects/[id]/operations` upgrade | REGISTERED (`projects`, org roles) | REGISTERED (`objects_projects`, `work_gallery`, `follow_up` resolve via `getModuleRoute("projects")`) | REGISTERED (`projects`; id-param routes excluded by the inventory's documented rule) | `REAL_LAUNCH_SURFACE` (all three project routes) |
| H | `/dashboard/documents` consolidation (document & work-proof centre) | REGISTERED (`documents`, since B; page consolidated in H) | REGISTERED (`documents`) | REGISTERED (`documents`) | `REAL_LAUNCH_SURFACE` |
| I | `/dashboard/finance` (+ `/dashboard/finance/export` CSV route handler) | REGISTERED (`finance`) | REGISTERED (`finance`) | REGISTERED (`finance`; the CSV handler is a download, not a page — same rule as the journal export) | `REAL_LAUNCH_SURFACE` |
| J | `/dashboard/assist` (assistance centre, deterministic + honest provider state) | REGISTERED (`assist`) | REGISTERED (`assist`) | REGISTERED (`assist`) | `REAL_LAUNCH_SURFACE` |
| K | `/dashboard/reports` (role-specific reports hub) | REGISTERED (`reports`) | REGISTERED (`reports`) | REGISTERED (`reports`) | `REAL_LAUNCH_SURFACE` |
| K | `/api/dashboard-search` (authenticated object search) | — (API route, not a navigable surface) | — (its results render INSIDE the CommandFinder) | — (route handler, not a page) | — (only `[locale]` pages are classified) |
| K | `/dashboard/search` upgraded to embed the one CommandFinder | EXCLUDED_BY_DESIGN (wrapper page, not a module) | EXCLUDED_BY_DESIGN (the finder must not link to itself; mirror list in `command-finder.test.ts` keeps it out) | EXCLUDED_BY_DESIGN (unlinked wrapper; covered by the repo-wide dead-link/copy scans) | `DUPLICATE_DRIFT` (kept; see §2) |

Cross-checks enforced by guards on every run: every module route resolves to a real
`page.tsx` (`dashboard-module-registry.test.ts`), every command route resolves to a real
page and non-admin entries never target gated/drift/stub surfaces
(`command-finder.test.ts`), every classified route exists on disk and every on-disk
dashboard route is classified (`route-truth-map.test.ts`), every smoke route file exists
(`primary-route-smoke.test.ts` / `check:primary-route-smoke`). PR K adds
`universal-search-reports.test.ts` pinning the search/report layer specifically.

## 2. Dedup verification — one canonical subsystem each

| Canonical subsystem | Verdict | Evidence |
|---|---|---|
| ONE dashboard | ✅ no duplicate | `/dashboard` is the only control room. The former `GATED_PREVIEW` `/dashboard/hub` route REMAINS DELETED (`app/[locale]/dashboard/hub` does not exist; the premium hub is the canonical `/dashboard` lead surface). Buyer rooms (`dashboard/buyer`, `dashboard/start/buyer`) remain known `DUPLICATE_DRIFT`, ratchet-capped and shrink-only — inherited from before the programme, not created by it. |
| ONE profile | ✅ no duplicate | `/dashboard/profile` is canonical; `/dashboard/player-card` is a `REDIRECT_STUB`; the command registry's `player_card`/`skills` entries link the profile directly. `WorkCard` (the old standalone card component) REMAINS REMOVED — `components/app/work-card.tsx` does not exist; only the folded `WorkCardEditor`/`work-card-state` engine lives inside the hub person card (per `dashboard-consolidation-v1.md`). `EmployerPreview` REMAINS REMOVED — `components/app/employer-preview.tsx` does not exist (per `employer-preview-cleanup-v1.md`); repo grep finds both names only in docs/audit text. |
| ONE demand funnel | ✅ no duplicate | Demand intake stays the `/dashboard` demand section + the public intake; PR F's `/dashboard/admin/pipeline` is READ consolidation over the existing sources (leads, waitlist, customer_requests, public intakes) — no second funnel, no new write path (guard `crm-pipeline` / PR F notes). The reports hub (PR K) COUNTS the caller's own `customer_requests` via the existing `listOwnCustomerRequests` read — no new demand surface. |
| ONE notification truth | ✅ no duplicate | `SPINE_SIGNALS` is the single attention catalogue; module badges may reference ONLY spine ids (`moduleAttentionSignalsAreValid`, guard-pinned); the activity centre and assist centre aggregate the same spine and deliberately declare NO `attentionSignalIds` (double-count ban, guard-pinned). The reports hub also declares none — it reports, it does not notify. |
| ONE document discovery | ✅ no duplicate | `/dashboard/documents` is the single centre (PR H composition over existing axes; no second store, no new table). PR K's reports hub links the SAME existing exports (evidence report, CV, journal CSV, finance CSV) and its document figures come from the same PR H reads (`getWorkerDocumentCentre` / `getOrgDocumentCentre`) — no parallel exports hub, no second aggregate. |
| NO parallel project subsystem | ✅ no duplicate | `/dashboard/projects` (+ `[id]`, `[id]/operations`) is the only project world; the module, the command entries and the planning/assist/reports reads all resolve through it. PR K's project search results link `/dashboard/projects/{id}` — the existing pages. |
| ONE search truth | ✅ no duplicate created | The CommandFinder is the ONE finder: registry commands first, then the caller's own objects from the single `/api/dashboard-search` route (PR K). `/dashboard/search` now EMBEDS that same component (no second search implementation, no parallel results source). The page keeps its `DUPLICATE_DRIFT` classification because it remains an unlinked wrapper — reclassification/linking is an owner decision, and the drift ratchet (≤4, shrink-only) still holds. People search deliberately does NOT exist — the deterministic scouting flow is untouched (guard-pinned: no profiles/workers read, no scouting import in the search layer). |
| ONE navigation/copy truth | ✅ no duplicate | The reports module reuses `reports.title`/`reports.intro` for card + page (no parallel copy source); its route resolves ONLY through `getModuleRoute("reports")` in the command registry (route-drift killer, same as every module since PR B). |

`DUPLICATE_DRIFT` count after PR K: **4** (`dashboard/buyer`, `dashboard/start/buyer`,
`dashboard/search`, `dashboard/market/recognize`) — unchanged, at the ratchet cap,
all inherited from the pre-programme audit; the programme created zero new drift.

## 3. Orphan check

- No route added by PRs B–K is unreachable: every module surface is a grid card and/or
  command entry; `/dashboard/admin/pipeline` is linked from the admin hub + sales panel +
  intake queue (PR F); `/dashboard/reports` is a grid card + command entry (PR K);
  the evidence report stays linked from documents, profile, assist and now the hub.
- `/dashboard/search` remains the one deliberate unlinked wrapper (classified, see §2).
- No dead code introduced: the finder's object search is used by both mounts
  (`/dashboard` and `/dashboard/search`); `lib/search/*` has exactly two consumers
  (API route + finder); `lib/reports/reports-hub.ts` has one (the hub page).

## 4. Still-gated items (owner/provider actions — nothing here blocks anything else)

| Gate | Type | What it unlocks | Where it is visible |
|---|---|---|---|
| `work_tasks` migration (D2, PR **#708**, needs-human-gate) | RED migration, owner applies via MCP + ledger | Task persistence (the `/dashboard/tasks` UI + spine signal already degrade honestly) | Draft PR #708 |
| `finance_records` migration (I2, PR **#714**, needs-human-gate) | RED migration, owner applies via MCP + ledger | Finance record persistence (the `/dashboard/finance` UI + CSV export already degrade honestly) | Draft PR #714 |
| Worker-documents storage bucket | Storage migration, owner decision | Real file upload in the document centre (today: metadata only, stated on-page) | Gap map gate register |
| AI provider key + live mode (`AI_*` env) **and** `ai_runs`/`ai_suggestions` audit-store migration | Provider/owner action + RED migration | Live generation on the assist centre (today: honest disabled-provider card; `runAiAgent` deliberately unwired) | `/dashboard/assist` provider card + gap map §10 |
| Activity events table | RED migration | Persistent activity feed + demand signals (today: spine-based centre) | Gap map gate register |
| Contacts / stage-ledger tables | RED migration | CRM persistence (today: read-consolidated pipeline, statuses verbatim) | Gap map gate register |
| Unapplied committed drafts (follow-ups, handover, availability prefs, team spine, transport/tools) | Owner apply decision | Those features' persistence; their UIs already degrade | Gap map gate register |

## 5. PR K self-registration proof (this slice follows its own rules)

- Module registry: `reports` module — grid+command, ALL roles, `chart` icon, no
  attention ids, route `/dashboard/reports` (guard §5 of
  `universal-search-reports.test.ts`).
- Command registry: `reports` entry resolves via `getModuleRoute("reports")`, 5-locale
  labels + synonyms.
- Smoke inventory: `reports` row added; `check:primary-route-smoke` green.
- Route truth map: `dashboard/reports` classified `REAL_LAUNCH_SURFACE`.
- i18n: full `commandFinder.*` additions + `reports.*` catalogue in every ACTIVE locale
  (lt, en, ru, nl, de) — guard §6.
- Search layer: authenticated, bounded, RLS-helpers-only, no admin client, no people
  source — guard §§1–2.
- Reports layer: basis labels pinned, no hardcoded metric numbers, existing exports
  only, explicit degradation states — guard §4.

**Programme verdict:** PRs A–K delivered every planned surface with zero new duplicate
subsystems; the remaining work is exactly the owner-gated list in §4.
