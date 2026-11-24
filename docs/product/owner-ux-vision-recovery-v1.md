# Owner UX / Product Vision Recovery Sprint v1 — audit & implementation map

Date: 2026-07-14 · Branch: `feat/cc/owner-ux-vision-recovery-v1` (from `main` @ f22dd782, PR #750 latency work intact)

Owner verdict driving this sprint: *"Too much technical noise, too many explanations,
too much empty space and too many long lists. The system shows data instead of
helping people act."*

## 1. Owner issue → implemented solution

| # | Owner issue | Status | What shipped |
|---|---|---|---|
| 1 | Dashboard shows pages, not actions | ✅ | The module grid is now the **configurable card workspace** ("Veiksmai"): the state-driven top slot, status strip and readiness block stay above it; the "Kas ką gerina" explainer block was removed from the home. |
| 2 | Cards are static — must be owner-configurable | ✅ | "Tvarkyti korteles": reorder (up/down), hide, restore — per device (localStorage, ids only). The registry stays the single truth for routes/labels/badges; hiding a card never removes a capability. |
| 3 | Remove "What can you do now" implementation | ✅ | The heading "Ką galite padaryti dabar" became "Veiksmai" and the section IS the card workspace — no separate explainer list. |
| 4 | Too much helper text / explanations | ✅ | Removed from the home: `MyZoneImproves` ("Kas ką gerina") explainer; the current-space card shrank from a 3-line card to a one-line chip (purpose text moved to a tooltip). Kept: the guard-required static-stepper honesty note (one 11px line). |
| 5 | Header wastes space, poor layout | ✅ (partial) | Universal search button added; main shell padding reduced (`py-10 → py-6`, mobile `px-6 → px-4`). Company name already truncates; identity switching stays in the role switcher. **Multi-company support is a data-model change — see Remaining.** |
| 6 | Quick search below expectations → universal OS search | ✅ | New header search button on **every** dashboard page opens the ONE CommandFinder (registry + own-objects search) in an overlay; Ctrl/⌘K opens it wherever no inline finder exists. No second search implementation. |
| 7 | Calendar/Planning naming inconsistency | ✅ | One name everywhere the user reads: **Kalendorius / Calendar** (nav tab, page title, eyebrow, module card, booking cross-links) in lt/en/ru/nl/de. URL stays `/dashboard/planning` (see Remaining). |
| 8 | Journal "6 of 6" doesn't fit | ✅ (partial) | The player-card readiness ring no longer leads the journal — the identity card collapsed into a one-tap "Kortelė" disclosure; work records lead the page. The ring itself (honest met/total gauge) is guard-pinned product doctrine — replacing the numeric form is an owner decision (see Remaining). |
| 9 | Journal date list duplicates calendar logic | ✅ | Calendar-driven day navigation: day chips (`?date=YYYY-MM-DD`) filter the diary to one day; a selected day links to the SAME day on the canonical calendar (`/dashboard/planning?view=day&date=…`) where work, bookings, projects and tasks appear together. |
| 10 | Journal entries must show who submitted | ✅ | Every entry row now carries "Pateikė: <name>" (the signed-in worker — this surface is the worker's own diary; manager surfaces already name authors). |
| 11 | Journal multiple input modes | ✅ (already existed) | The composer already offers Greitas įrašas / Struktūruota ataskaita / Foto ataskaita + voice, all feeding `journal_entries`. No change needed; noted for the owner. |
| 12 | Calendar must be the real planning center | ✅ (already existed) | `/dashboard/planning` already renders bookings, project date bands, task deadlines AND journal entries in 5 views with source links. This sprint fixed its naming so people can find it. |
| 13 | Messages waste space; separate unread/important | ✅ | Thread list now renders **labelled sections** — "Neperskaitytos (n)" then "Ankstesnės"; cards compacted (padding down, timestamp folded into the meta row). "Needs reply" as a distinct flag needs a data-model addition (see Remaining). |
| 14 | Network wording + unexplained people | ✅ | LT renamed "Mano tinklas/Tinklas" → **"Ryšiai"** everywhere (one concept, one name). "Be organizacijos" → "Asmeninis ryšys — nesusietas su įmone". Added visible reasons: search results state the fail-closed visibility rule; the relationships list states that only active work relationships appear and each row names the relationship. |
| 15 | Admin data-oriented → decision-oriented | ✅ (partial) | The admin landing keeps KPIs + action queues but embedded lists now **preview top 5** with a "Rodyti visus (n)" disclosure (request-review queue, recent people). Deeper module-by-module admin IA is follow-up scope. |
| 16 | Market map heavy | ✅ (partial) | Recognizer entry card compacted from a 3-line card to one row (map is the dominant surface); duplicated connections intro line removed; strip padding reduced. Layer legend position is guard-pinned (visual-first doctrine) and kept. |
| 17 | All users on the map; 3 spatial concepts | ⚠ architecture note | The signal model already distinguishes `person_location`, `company_location`, `project_location` (+ `company_need_location`) — the three concepts the owner requires are separate in data. Showing OTHER users' markers is a consent + volume feature (needs discoverability consent enforcement on map display) — not shipped, see Remaining. |
| 18 | Company vs personal profile duplication | ⚠ not in this PR | Both pages are ~1k-line monoliths with parallel readiness/gallery/next-action sections. Needs its own slice (shared section shell). See Remaining. |
| 19 | Salary intelligence — prepare, don't build | ✅ (doc) | Architecture note below (§5). No code, no provider assumptions hardcoded. |
| 20 | No performance regression | ✅ | No data-path changes: `cache()` memoization, `Promise.all` batches, skeletons and `force-dynamic` untouched. The module grid became a client component but receives the same server-fetched view model (no new requests). Full build + 9425 tests green. |

## 2. Terminology changes (lt / en / ru / nl / de)

| Key(s) | Before (LT) | After (LT) |
|---|---|---|
| `planning.title`, `planning.eyebrow`, `myZone.actions.planning.title` | Planavimas | **Kalendorius** |
| `bookings.actions.planning` | Peržiūrėti planavime | Peržiūrėti kalendoriuje |
| `bookings.connections.title` / `.planning` | Planavimas susijęs su / Planavimo dienotvarkė | Kalendorius susijęs su / Kalendoriaus dienotvarkė |
| `tabs.network`, `network.title`, `network.module.label`, `features.network.label` | Tinklas / Mano tinklas (mixed) | **Ryšiai** (one name) |
| `network.relationships.noOrg` | Be organizacijos | Asmeninis ryšys — nesusietas su įmone |
| `myZone.actionsHeading` | Ką galite padaryti dabar | **Veiksmai** |

New keys (all 5 active locales): `auth.dashboard.moduleGrid.*` (manage/done/moveUp/moveDown/hide/hiddenTitle), `commandFinder.closeLabel`, `communication.sections.{unread,earlier}`, `network.search.visibilityReason`, `network.relationships.why`, `journal.entry.submittedBy`, `journal.dayNav.*`, `admin.requestReview.showAll`.

## 3. Removed visual noise

- Dashboard: "Kas ką gerina" explainer block (4-bullet what-improves-what); current-space explainer card → one-line chip; org-branch helper text kept only where guard-required.
- Journal: full player card + readiness panel no longer always-expanded above the diary (one-tap disclosure).
- Messages: separate timestamp row folded into the meta row; card padding reduced.
- Market map: 3-line recognizer card → 1 row; duplicated "connections" intro sentence removed.
- Shell: `main` vertical padding −40%, mobile horizontal padding −33%.
- Admin landing: 100+-row embedded lists → top-5 previews + disclosure.

## 4. Guard updates (deliberate hierarchy changes, not weakening)

- `dashboard-hierarchy.test.ts` — re-pins the NEW owner-approved order (no `MyZoneImproves`, finder + space chip close both branches).
- All other guards pass unmodified (587 files / 9425 tests green), including the market-map visual-first, player-card honesty, communication clarity and i18n parity suites.

## 5. Salary intelligence — architecture preparation (no implementation)

- Keep salary expectations as **structured worker-side data** (already in work-card values) and demand-side pay ranges as structured fields — never free text.
- Benchmarks arrive later as a separate read-model: `salary_benchmarks(profession_slug, region, period, source, p25/p50/p75)` fed by pluggable providers (LT market stats first, later LabourMarket.ai's own accumulated demand/booking data). No provider names or API shapes should be hardcoded in product code — provider is an ingestion concern behind one interface.
- Comparison surfaces (worker: "your expectation vs market"; company: "your offer vs market") read only from that table, so the UI never depends on where numbers came from.

## 6. Remaining owner-review items (honest list)

1. **Multi-company header switching** — `getOwnCompany()` is singular; supporting several organizations per account is a data-model + role-switcher slice.
2. **URL `/dashboard/planning` → `/dashboard/calendar`** — needs a redirect plan (deep links from bookings/journal/registry); naming is now consistent everywhere visible, so this is cosmetic-technical.
3. **Readiness ring numeric "6/6" form** — guard-pinned honest gauge; replacing with a qualitative status needs an owner decision to change the pinned doctrine.
4. **"Needs reply" flag in Messages** — requires a derived last-message-direction flag in the inbox preview model (small follow-up slice); unread/earlier sections shipped now.
5. **All registered users on the map** — consent-gated marker layers (person/company/project) exist in the signal model; rendering OTHER users needs the discoverability-consent read path + clustering. Contact stays only through matching/search (already enforced — no raw contact channels exist).
6. **Company vs personal profile deduplication** — dedicated slice (shared profile-shell component).
7. **Admin deep modules** (matching, market, pipeline pages) — decision-first redesign per page.
8. **Server-side card-preference persistence** — current prefs are per-device (localStorage); a `user_ui_prefs` table would sync across devices but is an owner-gated migration.

## 7. Production readiness assessment

- `pnpm typecheck` ✅ · `pnpm test` ✅ 587/587 files, 9425 tests · `pnpm build` ✅ · `check:i18n-debt` ✅ within baseline (de/nl/ru = 0) · `placeholders:check` ✅.
- After-screenshots (desktop + mobile, real owner session on local dev): `runtime/ux-recovery-proof/*.png` (gitignored proof pack). Production surfaces at f22dd782 serve as the "before".
- No migrations, no RLS changes, no new data paths, no external calls. Safe to merge and deploy on green checks.
