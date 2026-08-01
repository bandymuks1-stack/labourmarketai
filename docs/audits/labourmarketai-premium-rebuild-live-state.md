# LABOURMARKET.AI — PREMIUM REBUILD LIVE STATE

> Canonical continuation file. A new session reads this FIRST, verifies git and
> production state independently, then resumes from **NEXT EXACT ACTION**.
> Never restart the audit from zero.

---

## W3 — COMPLETE AND FROZEN (2026-08-01)

**Verdict: `W3_CHAT_FIRST_WORKSPACE_CONSOLIDATION_COMPLETE`.**

| | |
|---|---|
| `main` HEAD | **`7a4babba`** — PR **#961** squash-merged (Package 4: `/dashboard/advanced` DELETED) |
| Production deployment | **`5703264161`** — Production, **success**, sha `7a4babba` |
| Production smoke (anonymous) | landing 200; `/lt/dashboard/advanced` → 307 `/lt/auth/login?next=…` with ZERO advanced markup leaked; `/lt/dashboard` → login redirect. The authenticated 404 proof ran on the local guarded stack (middleware answers anon before routing — a login 200 is not a route render) |
| §13 criteria | ALL met — route deleted; 28/28 rows dispositioned; row 24 formally → W6; 0 advanced runtime refs (ratchet at ZERO); one Chat / one Context Panel / one result surface / one MarketMap engine; full W3 tests pass (789 files / 12,560 unit; e2e record in the completion report); deploy + public smoke clean; gaps honestly recorded |
| Standing gap | authenticated PRODUCTION proof still blocked by absent `PROD_QA_*` secrets (unchanged since Package 1; not looped on) |
| Full record | `docs/audits/evidence/premium-rebuild/w3-final-completion-report.md` + the matrix's "Package 4 — EXECUTED" section |
| Sibling fix landed mid-closure | PR #959 — the mobile sheet's links navigate again (a CSS-hidden AnchoredOverlay owned outside-close); the calendar 375px spec may now restore its true click-through leg (small follow-up, not W3-blocking) |

**W3 is FROZEN except for regressions. W4 starts from
`docs/audits/evidence/premium-rebuild/w4-baseline.md`.**

## CURRENT STATE — 2026-08-01 (calendar: rows 11/12 + the calendar result)

| | |
|---|---|
| `main` HEAD | **`788f17e0`** — PR **#945** squash-merged (base was `b05658bd`) |
| Production deployment | **`5698508378`** — Production, **success**, sha `788f17e0` |
| Production URL | `https://labourmarket.ai` (apex) |
| Slice | W3 rows 11/12 verification + the calendar `ResultBody` slice |

### Public production proof at `788f17e0` (anonymous — the only kind available)

`/lt/dashboard?result=calendar` → redirects to
`/lt/auth/login?result=calendar&next=%2Flt%2Fdashboard`; **zero
`calendar-result*` markup leaked** (0 matching DOM nodes), no context panel,
0 console errors, every request 200. The authenticated render is proven
against the LOCAL guarded acceptance stack (11/11 e2e, two consecutive clean
runs) — the distinction is deliberate; the QA-secret gate below is unchanged.

### Rows 11/12 — CONFIRMED `ALREADY` (browser proof, seeded real bookings)

`tests/e2e/w3-calendar-rows-11-12.spec.ts`: zero state renders nothing
(count-gated); a seeded `proposed` booking lights the worker badge with the
database count and the `/dashboard/bookings` href; the company responses badge
follows the seen-model (`seen_at` yesterday + real `accepted` transition);
Back/Forward/reload hold; keyboard + accessible name pass; 375px passes; the
BELL (layout-mounted — survives the route deletion) carries both signals; a
fresh authenticated outsider reads ZERO `booking_requests` rows (RLS negative
proof). **No port, no new renderer, no new code owed for these rows.** Matrix
updated: 10 ABSORB rows remain.

### The calendar result — shipped as its OWN slice (not under rows 11/12)

- `lib/planning/calendar-result.ts` — server re-shaping of the SAME
  `getPlanning` → `buildAgenda` projection (guard-pinned: no supabase, no
  table, no RPC, no fetch).
- `components/app/workspace/calendar-result.tsx` — panel presentation with
  loading / error+retry / blocked / empty / partial (degraded sources NAMED) /
  ready + real conflict marks; no Link, no router.
- `ResultBody` gains `case "calendar"`; `startAgenda` explains AND opens the
  result (`openResultRef.current("calendar")`).
- i18n: 10 keys × 5 active locales; parity-guard clean.
- Guards: `lib/guards/w3-calendar-result.test.ts` (5 tests).
- e2e: `tests/e2e/w3-calendar-result.spec.ts` — real seeded line, reload +
  Back/Forward via `?result=`, full-screen door, honest empty (fixture absence
  lifted and restored), 375px no-overflow.

### Dev servers (this session)

```text
port 3000  another session's dev server in lm-unified-wt — NOT touched.
port 3100  e2e:local rig, started and stopped per run by the harness.
```

### Employee beta production gate — UNCHANGED

`EMPLOYEE_BETA_PRODUCTION_GATE = BLOCKED_BY_OWNER_SECRET_SETUP`
(`PROD_QA_*` secrets still absent). Authenticated proof is against the LOCAL
guarded acceptance stack; the distinction is deliberate and stated.

### SESSION CLOSE — 2026-08-01 (~01:40 Europe/Vilnius)

| | |
|---|---|
| `main` HEAD | **`792e1837`** (#949) ← `9a7c34a8` (#948) ← `1e00fb44` (#947) ← `47d2041f` (#946) ← `788f17e0` (#945) |
| Production deployment | **`5699066896`** — success, sha `792e1837`; anonymous smoke clean (landing renders, 0 console errors) |
| Rows settled TODAY | 11/12, 16, 19, 14 — all CONFIRMED `ALREADY` by browser proof; calendar result SHIPPED |
| Matrix | 9 ALREADY · 11 ABSORB · 3 CHAT · 4 OBSOLETE · 2 DETAIL — **8 ABSORB rows remain** |
| Ratchet | `w3-return-to-workspace.test.ts` — 3 allowlisted advanced hrefs remain, the countdown for the deletion |
| Known defect (P3, tracked) | `/dashboard/journal` dev-only React missing-key warning (`JournalEntryRow` children) — pre-existing, named in the spec allowance |

### CONTINUATION — 2026-08-01 (~02:20 Europe/Vilnius)

| | |
|---|---|
| `main` | `b5985cba` (#952 row 21) ← `127c4d0d` (#951 journal key fix, separate session) ← `792e1837` |
| Rows settled | 11/12, 16, 19, 14, **21** — all by proof; row 24 BLOCKED with the missing data source NAMED (no subjective-feedback table exists; W6 creates it; acceptance condition in the matrix) |
| Journal warning | **FIXED** (#951 — key the RSC-passed editSlot at creation); the stale spec allowance removed in this branch |
| Matrix | 10 ALREADY · 10 ABSORB · 3 CHAT · 4 OBSOLETE · 2 DETAIL — **7 ABSORB rows remain** (row 24 BLOCKED among them) |

### CONTINUATION — 2026-08-01 (employer package: rows 7/8/25 CONSOLIDATED)

| | |
|---|---|
| `main` HEAD | **`447c1f45`** — PR **#954** squash-merged (base `b1ad0263`) |
| Production deployment | **`5699957946`** — Production, **success**, sha `447c1f45` |
| Production smoke (anonymous) | landing renders, 0 console errors; `/lt/dashboard/company` → `/lt/auth/login?next=%2Flt%2Fdashboard%2Fcompany`, **zero demand markup leaked**, 0 console errors |
| Slice | **W3 rows 7/8/25** — one canonical demand flow, per the owner's Package 1 |
| What shipped | FULL wizard moved to `/dashboard/company#demand-intake` (+ save-draft leg absorbing `DemandDraftForm`'s company mount); ONE owner readback on the company page, employer-kind-scoped; advanced page carries ZERO demand surfaces; 5 stale `/dashboard#demand-intake` doors repaired (they dead-ended on the chat since the root went chat-first) |
| Proof | `w3-demand-consolidation.spec.ts` 9/9 × 2 consecutive runs (company + worker-only sessions, DB-row assertions, RLS negative); legacy demand/estimate specs retargeted and green; 795 files / 12 851 unit tests; typecheck clean; lint 0 errors |
| Matrix | rows 7/8/25 done → **4 ABSORB rows remain: 2, 3, 9, 10** (+ row 24 BLOCKED → transferred to W6 by owner ruling; does not block W3 closure) |
| Owner ruling (2026-08-01) | W3 is a **closing sprint** in 4 packages: 1 employer (7/8/25 — THIS) · 2 company (2/3/9/10) · 3 admin+map+cleanup (22/23, 20/27/28, second MarketMap, last advanced hrefs) · 4 delete `/dashboard/advanced`. Then immediately W4. |
| Honest gaps | chat inline intake not re-browser-proven (unchanged code, unit-covered); buyer page not browser-proven (no customer fixture); scouting empty-state CTA repaired+guard-pinned, not browser-clicked (would require fabricating an empty stack) |

### CONTINUATION — 2026-08-01 (company package: rows 2/3/9/10 CONFIRMED)

| | |
|---|---|
| Slice | **W3 rows 2/3/9/10** — the owner's Package 2, verification not port |
| Rows 9/10 | **ALREADY** — the spine (layout-mounted bell) carries `incoming-service-requests` + `service-request-responses`; browser-proven with REAL seeded requests + the seen-model; canonical surface `/dashboard/service-requests` |
| Rows 2/3 | **VERIFIED door-panels** — no write/editor/own read (guard-pinned); destinations proven canonical in the browser; the "new `organization` result kind" target CHALLENGED and DROPPED; they die with the route |
| Proof | `w3-company-rows-2-3-9-10.spec.ts` 8/8 × 2 consecutive runs + 6 source guards; net production LOC **0** |
| Matrix | **ZERO ABSORB rows remain** (row 24 → W6 by owner ruling). Left before deletion: Package 3 (rows 22/23 DETAIL repoints; 20/27/28 OBSOLETE decisions; collapse the second MarketMap chain; the 3 allowlisted advanced hrefs) → Package 4 (delete `/dashboard/advanced`) |

### CONTINUATION — 2026-08-01 (Package 4: /dashboard/advanced DELETED — W3 closure)

| | |
|---|---|
| Slice | **W3 Package 4** — the final deletion, one guarded atomic commit on `feat/cc/w3-package4-delete-advanced` |
| Deleted | the 802-line route; 11 advanced-exclusive components (16 files incl. the premium-hub tree ×6); dead loaders `control-room-view-model`, `top-slot`(+test), `preferences` + `preferences-actions` + `dashboard-preferences-shared`(+test), `premium-hub-data` ×2; the dead `NextAction` role resolvers (profile half of `next-action.ts` survives — live consumer `/dashboard/profile`); 11 dead i18n namespaces ×5 locales; the account-menu escape hatch; the surface-registry primary-surface entry; the route-truth-map pin |
| Ratchet | `w3-return-to-workspace` advanced-href allowlist **3 → 0** — the guard now bans any live `"/dashboard/advanced"` href repo-wide, forever |
| Kept-by-proof | `dashboard-module-registry` (activity page + command-registry consumers) — its `myZone.actions.*` label keys retained (6 live, 3 unreferenced pruned); `next-action.ts` profile half; `market-map-base` |
| Stale doors repaired | `/dashboard#work-card` (profile-hub availability pillar + setup-journey location step) → `/dashboard?result=player-card` — the anchor only ever existed on the deleted page |
| Guards | ~67 guard files repaired by absence-rewrite/retarget (dispositions in the PR); e2e: `w3-second-dashboard.spec.ts` is now the DELETION PROOF (route 404s, no advanced markup leaks), calendar rows 11/12 + company rows retargeted to the bell, ux-2-0 + conversation retargeted to surviving full-chrome routes |
| Matrix | ALL 28 rows terminally dispositioned — see "Package 4 — EXECUTED" in the matrix; row 24 formally TRANSFERRED TO W6 (no subjective store, no fabricated replacement) |

### CONTINUATION — 2026-08-01 (Package 3: rows 20/22/23/27 confirmed, row 28 COLLAPSED)

| | |
|---|---|
| Slice | **W3 Package 3** — PR #957: ONE Leaflet engine (`market-map/leaflet-engine.ts`), three presentations; `market-map-live.tsx` → `market-map/location-map.tsx` (rename, identical picker capability) |
| Rows | 20 ALREADY (layout-mounted CommandFinder) · 22 DETAIL door · 23 generic · 27 OBSOLETE (dies with grid) · 28 COLLAPSED |
| Proof | `w3-row28-map-collapse.spec.ts` 3/3 ×2; capture write proven once through the collapsed chain; 798 files / 12 864 unit tests; guard `w3-row28-one-leaflet-engine` pins the single tile source repo-wide |
| Honest debt | capture/readiness authenticated specs were RED ON MAIN (7/7 baseline at `37ce8245`; #921 fold + fixture drift); fold navigation repaired (3 recovered); deterministic-state repair filed as its own task |

### NEXT EXACT ACTION — Package 4: DELETE /dashboard/advanced (one guarded commit)

The deletion inventory, verified 2026-08-01 (0 other consumers unless noted):

- **Route**: `app/[locale]/dashboard/advanced/page.tsx` (916 lines).
- **Advanced-exclusive components to delete** (consumer-counted): `MyZone`
  (+`MyZoneImproves`), `PrivacyStatusCard`, `DashboardStatusStrip`,
  `DashboardChainActions`, `DashboardModuleGrid`, `DashboardMoreSection`,
  `DashboardNextAction`, `CurrentSpaceHeader`, `IdentityActions`,
  `OpportunityDirectionsCard`, `PremiumHubScreen` (+the three PremiumHub
  cards whose only other consumer IS the screen). `CommandFinder` SURVIVES
  (header-search).
- **Dead loaders/models to check-and-delete with it**: `premium-hub-data`,
  `buildControlRoomViewModel` (matrix row 26 said "keep-reusable" — DELETE
  if zero consumers post-route; it is not a kill switch),
  `getDashboardCardPreferences` + prefs plumbing (row 27), `next-action`
  lib, `decideTopSlot` — each needs a consumer count before deletion.
- **Same-commit updates**: `surface-registry.ts` entry,
  `route-truth-map.test.ts` pin, account-menu admin escape hatch,
  `w3-return-to-workspace.test.ts` ratchet → the allowlist drops to ZERO
  (then the guard flips to "no live advanced href anywhere").
- **Guard rewrites** (every guard that `read()`s the advanced page file will
  crash on the missing file — rewrite to assert ABSENCE):
  `dashboard-active-role-overview`, `dashboard-hierarchy`,
  `wagon3-nav-simplification`, `demand-readback` (the advanced negative),
  `company-demand-first-action` (same), `click-target-repair`,
  `role-value-to-action` (verify), plus any `grep -rl "dashboard/advanced"
  lib/guards` hit at execution time.
- **e2e rewrites**: `w3-second-dashboard.spec.ts` (targets the route —
  becomes the DELETION proof: route 404s, capabilities live on their
  canonical homes), `w3-row16-identity-actions.spec.ts`,
  `w3-rows19-14-return.spec.ts`, `w3-calendar-rows-11-12.spec.ts`
  (advanced-page badge scenarios — assert canonical surfaces instead).
- **Final proof**: repo-wide search zero `/dashboard/advanced` refs outside
  historical docs; full W3 browser pass (desktop+375px: chat, panel, player
  card, calendar, demand, company, market, maps, Back/Forward/reload/deep
  links); merge; deploy; production smoke (route redirects/404s for anon,
  no leak); W3_FINAL_COMPLETION_REPORT; mark W3 COMPLETE; enter W4 baseline.

### SUPERSEDED — Package 3: admin/detail + cleanup (rows 22/23, 20/27/28, MarketMap)

Rows 22 (`PrivacyStatusCard` → `/dashboard/privacy` repoint) and 23
(`TelemetryView` → admin surface repoint) are DETAIL; rows 20/27/28 are the
OBSOLETE decisions (incl. `market-map-base` → `market-map-live` collapse into
the canonical MarketMap). Then Package 4: delete `/dashboard/advanced` + its
components/guards/nav refs in one guarded commit (surface-registry +
route-truth-map in the SAME commit), full desktop+mobile proof, merge,
deploy, production-prove, mark W3 COMPLETE — then enter W4 immediately.

### SUPERSEDED — Package 2: COMPANY rows 2/3/9/10

Row 2 (`PremiumHubCompanyCard` → `organization` result kind?) and row 3
(`PremiumHubProjectCard` → existing `project` result) + rows 9/10 (service /
outgoing request next-actions → work context panel). Audit first (the row-1
lesson: count the renderers), then one coherent slice. After that Package 3,
then the route deletion (Package 4), full proof, merge, deploy,
production-prove, mark W3 COMPLETE — and enter W4 in the same session if
context remains.

### SUPERSEDED — P1 employer rows 7/8/25 (IMPLEMENTATION, not verification)

The audit is DONE and in the matrix: THREE demand forms
(`DemandRequestButton` 888-line full form, advanced-only · chat inline form ·
company `DemandDraftForm`) and THREE readbacks (advanced · buyer · scouting).
The slice: ONE full form on `/dashboard/company` (the action's own
advancedRoute) absorbing the draft continuation; chat stays the light intake;
ONE owner readback (scouting is the strongest candidate); row 25 resolves with
row 7. No new route, no duplicated estimate builder. Start from the matrix's
"P1 EMPLOYER" section. Then P2 company rows 2/3/9/10, admin 22/23, rows
20/27/28, THEN delete `/dashboard/advanced` + the 3 allowlisted hrefs + guards
in one commit, full proof, merge, deploy, production-prove.

---

## TIMESTAMP

| | |
|---|---|
| Europe/Vilnius | 2026-07-31 23:30 |
| UTC | 2026-07-31 20:30 |
| Production code SHA | `4689f475` (PR #942 merged, Vercel Production Ready) |

## REPOSITORY

| | |
|---|---|
| Repo | `bandymuks1-stack/labourmarketai` |
| Canonical path | `C:\Users\Mano\Documents\labourmarketai` |
| Working worktree | `C:\Users\Mano\Documents\lm-unified-wt` (isolated per CLAUDE.md §4) |
| Production | `https://labourmarket.ai` — the APEX is canonical; `app.labourmarket.ai` is a legacy host that 301s here. Vercel deploys on `main`. |

## BRANCH / COMMIT GRAPH (verified 2026-07-31)

```text
752f8b19  main  ==  origin/main            ← what production runs
   │
   │ 16 commits — unified premium product + landing rebuild
   ▼
edcec2fc  (was the head of PR #925)
   │
   ▼
f3e16015  Goal 3 — market → projects → project evaluation
   │
   ▼
9c7da373  W1 — three dead CTAs + guards that follow the composition
          ==  feat/cc/premium-unified-product-v1  (PR #925 head, pushed)
          ==  feat/cc/goal3-project-evaluation-v1 (pushed, same commit)
```

`main` is **0 ahead / 18 behind**. Strict linear chain, no divergence, no
possible merge conflict. Verified: `git merge-base --is-ancestor edcec2fc
9c7da373` → true.

### Why ONE PR and not the two the master command anticipated

The command permits "a safer equivalent if the actual graph proves it". It does:
the required `quality` check passes **only at the tip**. Merging `edcec2fc`
first would have put a tree with 7 known-failing landing guards onto `main`, and
branch protection requires `quality`. Cherry-picking the fixes backwards onto
the earlier commit would have duplicated commits on two branches. So
`feat/cc/premium-unified-product-v1` was **fast-forwarded** (not force-pushed,
not rebased) to the tip and PR #925 now covers the whole chain.

`feat/cc/goal3-project-evaluation-v1` was pushed unchanged as a second ref to
the same commit, so the Goal 3 lineage is preserved and recoverable. **No third
implementation branch was created.**

## PR / CI / MERGE STATUS

| | |
|---|---|
| PR | **#925** — `feat(product): unified premium workspace — chat-first result surface, Goal 3 market depth, landing repair` |
| State | **MERGED** 2026-07-31 into `main` |
| Head at merge | `9628308b` |
| Base | `main` |
| Mergeable | MERGEABLE |
| Required checks | `quality`, `migration-safety` (branch protection on `main`) |
| Previous CI | `quality` **FAILURE** at `edcec2fc` — 6 files / 7 tests, ALL landing guards. Confirmed against run `30609842472`; identical to the set fixed by `9c7da373`. |
| Final CI | `quality` **SUCCESS**, `migration-safety` **SUCCESS**, mergeState `CLEAN` at `9628308b` |
| Merge method used | **merge commit** — history preserved, all 20 commits intact. Merge SHA `a5b991f4`. |

## PRODUCTION

| | |
|---|---|
| Production SHA | **`3e31a70e`** (was `752f8b19` → `a5b991f4` → `3e31a70e`) |
| Deployment ID | **`5691288750`** — Production, state **success** (prior: `5690792306`) |
| Target | `https://app.labourmarket.ai` |
| Public landing proof | **4/4 PASSED IN PRODUCTION on both deploys** — `premium-rebuild/production-smoke.md` |
| Authenticated proof | **NOT PROVEN in production** — blocked on a synthetic production account |

## DEV SERVER OWNERSHIP (master command §4)

| Port | PID | PPID | Started | Checkout | Owner | Decision |
|---:|---:|---:|---|---|---|---|
| 3000 | 1856 | 9736 | 09:24:13 | `lm-unified-wt` | **another active session** (harness warned) | **LEFT RUNNING.** Not mine; §4.6 forbids killing an unknown process for its port. |
| 3400 | 18508 | 24972 | 13:53:14 | `lm-unified-wt` | **this session** | Kept — it is the base URL for local browser proof. Stop before handoff if idle. |

**Recorded hazard:** both servers run against the SAME checkout and therefore
share `.next`. That is the "stale server masks fresh code" case §4 names. The
landing proof was re-run against a **freshly restarted** 3400 after the earlier
instance was killed, so its evidence is against the verified code. Do not start
a third instance on this checkout.

Base URL used for local proof: `http://127.0.0.1:3400`.

## WHAT IS COMPLETE

| Item | State | Proof |
|---|---|---|
| Goal 3 — project evaluation | authenticated-browser proven, LOCAL | `docs/audits/evidence/goal3-project-evaluation/` — 8 scenarios, 5 clean runs, 14 screenshots |
| W1 — audit + landing repair | **PRODUCTION PROVEN** | `premium-rebuild/production-smoke.md` — 4/4 against app.labourmarket.ai |
| Branch integration | **MERGED + DEPLOYED** | PR #925 → `a5b991f4`, deployment `5690792306` |
| Ponytail Improved decision | `ADAPT_RULES_ONLY` — **not installed** | `premium-rebuild-w1/README.md` §2 |

### Checks at `9c7da373` (local)

```text
pnpm -F web test        790 files passed / 0 failed   (was 783 / 6 failed)
pnpm -F web typecheck   clean
pnpm -F web lint        0 errors, 22 warnings (baseline parity)
playwright goal3        8 passed, 5 consecutive clean runs
playwright landing      4 passed
```

## MIGRATIONS / DATA WRITES

- **No migration** in this chain. The features read existing tables.
- Only local writes: `supabase/dev-fixtures.sql` applied to the LOCAL stack, and
  Scenario E's `revoke`/`grant` on the LOCAL database (restored + verified).
- **Zero production writes.**

## KNOWN REMAINING FAILURES

None in the test suite at `9c7da373`.

## OPEN ARCHITECTURAL DEBT (drives W3+)

1. `/dashboard/advanced` — **916-line second dashboard** (Premium Hub). The
   single largest violation still open. W3 matrix: 28 capabilities,
   **1 MIGRATED** (row 4 — the fake market-map SVG is gone).
2. **71** authenticated `/dashboard` routes (107 pages total).
3. **Three** navigation systems: `bottom-nav` (5 items), `dashboard-chrome`
   module bar, account menu.
4. `audience-value-sections.tsx` — dead, **not deleted**: no successor, so
   deleting it destroys content. Owner/product decision required.
5. W2, W4–W11 not started.
6. The AUTHENTICATED product is not production-proven (public landing is).

## BLOCKERS

**ONE, and it is a genuine credential blocker — not a permission request.**

Authenticated production proof of Goal 3 needs a synthetic PRODUCTION worker
account. `scripts/e2e-mint-session.ts` refuses non-local targets by design, and
this agent may not create accounts or handle credentials. Unblock by either
creating `qa.worker+goal3@…` in production and supplying credentials through the
approved secret path, or authorizing a scoped session-mint for that one
synthetic account.

Everything else proceeds: merge and deploy were authorized by master command §3
and are DONE.

## COMPLIANCE

```text
billing / purchases / subscriptions:   NONE
destructive production operations:     NONE
migrations applied:                    NONE
force-push:                            NONE  (the branch move was a fast-forward)
global tool installation:              NONE  (Ponytail = ADAPT_RULES_ONLY)
secrets printed:                       NONE
old LABMA project touched:             NO
```

## ROLLBACK

- Pre-merge `main` = `752f8b19`. Revert target if the merge causes production
  regression: `git revert -m 1 <merge-sha>` on `main`, or redeploy the Vercel
  deployment built from `752f8b19`.
- No migration was applied, so **no database rollback is needed**.

---

## CURRENT STATE — 2026-07-31 18:55 Europe/Vilnius

| | |
|---|---|
| `main` HEAD | `6e5ef02a` (== `origin/main`) |
| Production deployment | `5695221417` — Production, **success**, sha `6e5ef02a` |
| Production URL | `https://labourmarket.ai` (apex, verified live — not the 301 host) |
| PRs merged this session | **#931**, **#932**, **#933**, **#934** (`6e5ef02a`) |
| Open PRs | **#935** — W3 matrix + journey mapping + row 6 audit (docs only, checks pending) |
| Unit/guard suite | 791 files / 12833 tests PASS |
| W3 e2e | `w3-second-dashboard.spec.ts` — **12/12 PASS** (rows 4 + 5, incl. consolidation) |
| Typecheck / lint | clean |

### Employee beta production gate

`EMPLOYEE_BETA_PRODUCTION_GATE = BLOCKED_BY_OWNER_SECRET_SETUP` — re-probed
2026-07-31 18:00: `PROD_QA_SUPABASE_URL`, `PROD_QA_ANON_KEY`,
`PROD_QA_SERVICE_ROLE_KEY` are all absent from the environment. The harness is
complete and one command away (`pnpm -C apps/web prod-qa:gate`). Reported once;
NOT re-probed on a loop, per CLAUDE.md §2.

**Consequence for W3 production proof, stated rather than papered over:** the
`opportunities` result is authenticated-only, so it cannot be browser-proven in
PRODUCTION until that gate opens. Using a real person's account instead is
forbidden. What IS proven in production for `7debb071`: the apex serves the
deploy, `/lt/dashboard?result=opportunities` correctly redirects an anonymous
visitor to `/lt/auth/login?next=/lt/dashboard` with no result markup leaking,
0 console errors, 0 failed requests. The authenticated render is proven against
the LOCAL acceptance stack (9/9 e2e), and that distinction is deliberate.

### W3 progress

Superseded by the verified table further down ("W3 — WHERE IT ACTUALLY
STANDS"), which is the canonical one. Summary: rows 4, 5 and 6 MIGRATED; rows
13/15 VERIFIED; **13 ABSORB rows remain** and `/dashboard/advanced` still
stands.

### CodeQL

24 open alerts, all raised 2026-07-27, none from any W3 or gate branch. Alert
**#9** (`oauth-trace.ts:66`) is READ and answered with a code-path proof — a
zero-argument CSPRNG trace id, flagged by a name heuristic ("auth" inside
"Oauth"), never an auth factor. Documented in `security-scan-triage.md`, and
deliberately **NOT dismissed** in GitHub. 23 remain queued; no P0/P1 found, so
W3 is not blocked.

---

## DEV SERVERS

```text
port 3000  PID 1856   ANOTHER session's dev:acceptance in lm-unified-wt.
                      NOT touched. Its .next cache is corrupted (a missing
                      marketing chunk, plus a module this session briefly
                      deleted and restored). Do NOT use it as proof.
port 3400  STOPPED    this session's own dev:acceptance, in the throwaway
                      worktree C:\Users\Mano\Documents\lm-w3proof (detached,
                      real pnpm install, its own .next). It produced the clean
                      12/12 browser proof and was then stopped. The worktree is
                      LEFT IN PLACE deliberately: removing it risks the known
                      node_modules hazard, and it is a ready clean rig — just
                      restart with `pnpm dev:acceptance -- -p 3400`.
```

## NEXT EXACT ACTION — W3 rows 11 / 12, the CALENDAR

The owner ruled 2026-07-31: **W3 finishes completely before the Capability
Platform starts.** No interleaving of one W3 row with one Capability slice. The
platform is designed and PARKED in
`docs/architecture/CAPABILITY_PLATFORM_v1.md`; `capability_registry`,
`capability_executions` and `CapabilityDescriptor` may NOT be added yet.

```text
P0 EMPLOYEE JOURNEY — remaining
  rows 11 / 12   Calendar          ← NEXT
  row  16        Profile / identity actions
  rows 19 / 14   return to chat (status strip, chain actions)
  row  21        MyZone — likely OBSOLETE, must be PROVEN not assumed
  row  24        Trust insight — BLOCKED on real reputation rows

THEN  P1 employer 7 / 8 / 25 · P2 company 2 / 9 / 10 · P3 admin 22 / 23
THEN  row 28 — collapse the second MarketMap chain
THEN  delete /dashboard/advanced + its components, mounts, guards, nav refs
THEN  full desktop + mobile proof, merge, deploy, production-prove
ONLY THEN  the Capability Platform (slice S1)
```

**Audit rows 11/12 before writing code.** That order has now paid twice: the
row 6 audit found the write path was already single, and the row 1 audit —
performed at implementation time — found a renderer the earlier pass had
missed. For the calendar the first questions are: does `calendar` already have
a `ResultBody` case (it does not — only `opportunities`, `market` and
`player-card` do), is its `dataReadiness` `real`, and does the booking
capability already have a canonical home in `/dashboard/planning`?

## W3 — WHERE IT ACTUALLY STANDS (verified 2026-07-31 23:2x)

| Row | Capability | State |
|---|---|---|
| 1 | Premium Hub person card → Player Card | **ABSORBED** — #942, deployed `4689f475` |
| 4 | Premium Hub market map | **MIGRATED** — #927, deployed `3e31a70e` |
| 5 | Job recommendations | **ABSORBED + CONSOLIDATED** — #932/#934, deployed `6e5ef02a` |
| 6 | Worker invitations | **ABSORBED** — #937, deployed `23ab316d` |
| 13, 15 | Next action, space header | **VERIFIED** — no independent drop; they die with the route |
| 21 | MyZone | likely OBSOLETE — not proven, deliberately not bundled into row 1 |
| 24 | Trust insight | **BLOCKED** — `reputation` is `dataReadiness: "unverified"` |
| 28 | Second Leaflet chain | tracked, TODO |
| — | remaining | **12 ABSORB rows**; `/dashboard/advanced` still stands |

### Row 1 — what shipped, and what the audit had missed

The Player Card is the `player-card` RESULT in the Context Panel. The kind, its
registry entry and its `dataReadiness: "real"` **all already existed** — so the
row added no result kind, no registry entry, no route and no data chain.

**The audit had missed a renderer.** `conversation-chat.tsx` embedded the
CANONICAL card in the chat THREAD. A thread copy is frozen at the moment it was
pushed, so asking twice left two versions of the same person on screen, each
claiming to be current — the same defect row 5 removed from job matches, one
surface later. Renderers **3 → 1**.

**The editor was the hard acceptance condition and it survived.** The hub's
person block carried `workEditor` — the only availability/location/pay editor
in the product. It moved into the result, derived from the same reads, `null`
for any identity without a worker row, with the real authorization still
server-side in the save RPCs. Proven by asserting the **`workers` DATABASE
ROW** changes, not a re-rendered select.

Deleted: `premium-hub-person-card.tsx` (205 lines), `PersonVM`, `loadPerson`
and this module's reads of the player card / avatar / worker core row, the
`workEditor` prop threaded through `PremiumHubScreen`, the page's own work-card
derivation, and the thread embed.

Net: renderers 3 → **1** · person mounts 2 → **0** · data flows 1 · components
+1/−1 · routes / result kinds / registry entries **+0** · duplicate CTA **0** ·
duplicate profile editor **0** · production LOC **+408/−455, net −47**
(code-only net −103). **Negative on architecture AND on lines.**

**Honest gaps recorded**: the non-worker path is not browser-proven (every
local fixture identity has a `workers` row, and inventing a half-onboarded
account to make a screenshot is the fabricated state this platform bans —
pinned in code at both ends instead). And `WorkerPlayerCard` holds its own
deep-links; the panel's source still holds no link and no router, but result
bodies otherwise use `onOpenFull`, so the exception is stated rather than
normalised.

### Row 6 — what shipped

`WorkerInvitations` is the Context Panel's work context. Not a result kind, not
a route. Card deleted, mounts 2 → 0, the `invitation` top-slot rung removed
(with no renderer it would have resolved to an empty slot). Two browser-forced
decisions: attention before geography on the phone sheet, and the work context
now degrades without dropping the invitation. Gaps: `no-worker` and
`needs-migration` are not browser-proven; covered by the unit guard.

## VALIDATION AT `4689f475`

```text
792 files / 12844 tests green
typecheck clean · lint clean
w3-second-dashboard e2e  27/27   (8 new row-1 scenarios)
w3-context-panel     e2e   3/3
CI on main: quality PASS · migration-safety PASS · CodeQL PASS
Vercel Production 4689f475 — Ready
```

Public production proof (anonymous, the only kind available):
`/lt/dashboard?result=player-card` → redirects to
`/lt/auth/login?next=/lt/dashboard`, **no player-card markup leaked**, 0
console errors.

### Employee beta production gate — UNCHANGED

`EMPLOYEE_BETA_PRODUCTION_GATE = BLOCKED_BY_OWNER_SECRET_SETUP`.
`PROD_QA_SUPABASE_URL`, `PROD_QA_ANON_KEY`, `PROD_QA_SERVICE_ROLE_KEY` are
still absent. Reported once, not re-probed on a loop (CLAUDE.md §2). Every
authenticated claim above is proven against the LOCAL guarded acceptance stack,
and that distinction is deliberate.

## CANONICAL NAMING RULE (owner, 2026-07-31)

| Domain | Word |
|---|---|
| worker occupational, user-facing | **Skill**, Skills, Skill Store, Skill Library |
| AI / system behaviour, implementation | **Capability** — `CapabilityRegistry`, `CapabilityDescriptor`, `CapabilityExecution`, `CapabilityManifest`, `CapabilityProvider`, `CapabilityResult` |

`Skill` is a node in the canonical chain — Worker → Work Journal → Evidence →
Confirmation → **Skill** → Reputation → Matching. **A second meaning of "Skill"
may never enter the codebase.** The programme is the **Capability Platform**.

## DEV SERVERS

```text
port 3000  ANOTHER session's dev:acceptance in lm-unified-wt. NOT touched.
port 3100  this session's e2e:local rig (scripts/e2e-local.ts), started and
           stopped per run, on its OWN port so a dev server possibly pointed
           at cloud is never reused as a test target.
port 3400  lm-w3proof, stopped, left in place (removing the worktree risks the
           known node_modules hazard).
```

## MERGED THIS SESSION

| PR | What | Merge SHA |
|---|---|---|
| #937 | W3 row 6 — invitations become the panel's work context | `23ab316d` |
| #938 | live-state after row 6 | `677086f0` |
| #939 | Capability Platform — Phase 9 audit | `cdf8a786` |
| #940 | Capability Platform — naming rule + parked behind W3 | `c8a1e1d4` |
| #941 | the Player Card audit | `a9c06c6f` |
| #942 | **W3 row 1 — the player card becomes a result** | `4689f475` |
