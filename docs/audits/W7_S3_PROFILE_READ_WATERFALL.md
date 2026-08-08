# W7-S3 — `/dashboard/profile` READ WATERFALL

A performance / read-graph slice. **No product behaviour, visible semantics,
authorization, workspace context or business logic changed.** No migration.

## 1. Starting state

| | |
|---|---|
| Starting `origin/main` | `07dbd458ac8093695141581085f1b2f3e6563568` (fetched and verified) |
| Worktree | `C:/Users/Mano/Documents/lm-w7-s3` — new, isolated, own `node_modules`, own dev server `:3470`, own `.env.local` → local stack `127.0.0.1:54321` |
| Branch | `perf/cc/w7-s3-profile-read-waterfall-v1` |
| Local DB | 190/190 migrations, dev fixtures. **No migration required or included.** |
| Evidence | `docs/audits/evidence/w7-s3/` — 12 screenshots + 6 fingerprint JSONs |
| Tools | `scripts/w7-s3-read-graph.mjs` (structural), `scripts/w7-s3-regression.mjs` (DOM fingerprint + timing), `scripts/w7-s3-db-calls.mjs` (`pg_stat_statements`), `scripts/w7-s3-interaction-proof.mjs` |

The prior inventory's "≈15 serial await stages" was **not** trusted. Re-measured
on this commit: the true figure is **43 serial stages**, because the earlier
count excluded the 24 translation awaits and the two awaits inside the JSX.

## 2. BEFORE dependency graph

Every `await` is a stage; a `Promise.all` is one stage regardless of width.

```
 1  await params                                        framework
 2‥17  await getTranslations × 15 + …                   TRANSLATION-ONLY, serial
18  await createClient()                                AUTH GATE (required order)
19  await auth.getUser()  → redirect if absent          AUTH GATE (required order)
20  await Promise.all[ profiles · claims · profile_roles · workers · professions ]
21  await getOwnAvatar()                                needs only `user`
22  await getOwnedOrganizations()                       needs only `user`
    ── if (workerId) ─────────────────────────────────────────────────────
23  await Promise.all[ prefs · languages · external · education · achievements ]
24  await journal_entries (project-linked count)        needs only workerId
25  await worker_documents (certificate count)          needs only workerId
26  await worker_professions                            needs only workerId
27  await getEmployerOwnerProfileId()                   needs only `user`
28  await profession_skills (is_core)                   DEPENDS on 26
29  await worker_skills                                 needs only workerId
30  await journal_entry_skills                          needs only workerId
31  await engagement_contexts                           needs only user.id
32  await profession_skills (allowed catalogue)         DEPENDS on 26
33  await profession_templates (icon)                   DEPENDS on 26
    ── JSX ───────────────────────────────────────────────────────────────
34  await getTranslations("featureNotes")               INSIDE the returned tree
35  await getOwnTrustSignals(workerId)                  INSIDE the returned tree
    ── ProfileHubOverview ────────────────────────────────────────────────
36‥43  await getTranslations × 7 + getLocale            TRANSLATION-ONLY, serial
44  await Promise.all[ playerCard · opportunitySignal · todayCount ]
```

Classification of the 43:

| class | count |
|---|---|
| required before the authorization decision | **2** (`createClient`, `auth.getUser`) |
| translation-only | **24** |
| independent, parallelizable | **12** |
| genuinely dependent on prior data | **3** (stages 28, 32, 33 — all need `worker_professions`) |
| awaited inside the returned JSX | **2** |
| duplicate read | **1** (`getOwnAvatar` re-reads the `profiles` row — see §7) |

**Only 3 of 43 stages were real dependencies.** The waterfall was accidental.

## 3. AFTER dependency graph

```
 1  await params                                        framework
 2  await Promise.all[ 16 namespaces ]                  ONE stage
 3  await createClient()                                AUTH GATE — unchanged
 4  await auth.getUser()  → redirect if absent          AUTH GATE — unchanged
 5  await Promise.all[ profiles · claims · profile_roles · workers · professions
                     · getOwnAvatar · getOwnedOrganizations ]        7 reads
    ── if (workerId) ─────────────────────────────────────────────────────
 6  await Promise.all[ prefs · languages · external · education · achievements
                     · journal_entries · worker_documents · worker_professions
                     · employerOwner · worker_skills · journal_entry_skills
                     · engagement_contexts · trustSignals ]          13 reads
 7  await Promise.all[ profession_skills(is_core) · profession_skills(allowed)
                     · profession_templates ]                         3 reads
                                        ↑ the ONLY genuine dependency, on 6
    ── JSX: no awaits ────────────────────────────────────────────────────
    ── ProfileHubOverview ────────────────────────────────────────────────
 8  await Promise.all[ 7 namespaces + getLocale ]       ONE stage
 9  await Promise.all[ playerCard · opportunitySignal · todayCount ]
```

## 4. Stages and calls, before → after

| metric | BEFORE | AFTER |
|---|---|---|
| **serial await stages (whole render path)** | **43** | **9** |
| — profile page | 34 | 7 |
| — profile hub | 9 | 2 |
| serial translation awaits | 24 | **0** |
| awaits inside the returned JSX | 2 | **0** |
| `Promise.all` batches | 3 | 6 |
| reads inside batches | 16 | 56 |
| **sequential DB/network round-trip stages** | **17** | **5** |
| canonical readers called more than once | 0 | 0 |
| DB calls per render (`pg_stat_statements`, median of 3) | 208 total / 100 selects | 216 total / 107 selects — **unchanged within noise** (per-phase spread 205–214 and 213–224) |

The DB call total is *supposed* to be unchanged: this slice reorders reads, it
does not add or remove them. That it stayed flat is an invariant check, not a
win.

## 5. Timing — measured, and honestly inconclusive

12 runs per cell at 1440, 6 at 375; `p25/median/p75` in ms. `server` is
Navigation Timing's `responseStart − requestStart` — the server's own think
time, free of harness overhead.

| scenario | TTFB BEFORE | TTFB AFTER | Δ median | server BEFORE | server AFTER | Δ median |
|---|---|---|---|---|---|---|
| worker partial @1440 | 2922/**3564**/3788 | 2571/**2907**/3755 | **−657** | 1351/**1518**/1651 | 1716/**1915**/1962 | +397 |
| worker partial @375 | 2345/**2919**/3146 | 2908/**3126**/3215 | +207 | 1200/**1338**/1660 | 1506/**2007**/2278 | +669 |
| worker complete @1440 | 3809/**3883**/4073 | 2808/**2808**/3083 | **−1075** | 1819/**1904**/1954 | 1523/**1551**/1694 | −353 |
| worker complete @375 | 3551/**3775**/3825 | 3571/**3832**/4459 | +57 | 1760/**1792**/1925 | 2254/**2331**/2748 | +539 |
| company @1440 | 3275/**3706**/3780 | 2872/**3110**/3338 | **−596** | 1515/**1640**/1817 | 2036/**2245**/2471 | +605 |
| company @375 | 2760/**3022**/3167 | 3327/**4233**/4295 | +1211 | 1250/**1559**/1632 | 2605/**2653**/2830 | +1094 |

**No timing claim is made in either direction.** The sign flips between
breakpoints (−1075 ms to +1211 ms), TTFB and server-think disagree on four of
six cells, and the p25→p75 band *within a single phase* is 200–1200 ms.

### Why local timing cannot show this slice's win — quantified

The saving is 12 fewer **sequential** round trips. Measured on this stack, one
PostgREST round trip costs **9 ms** (p25/median/p75 = 9/9/40 over 30 samples).

```
expected local saving  ≈ 12 × 9 ms  ≈ 108 ms
dev-server noise band  ≈ 200–1200 ms
```

The effect is roughly an order of magnitude smaller than the instrument's
noise. That is not a reason to doubt the change — it is a reason to measure it
structurally, which §4 does. On production, where the database is across a
network rather than a loopback container, the same 12 stages are worth
**≈240–720 ms at a 20–60 ms RTT** — and that is where this slice pays.

## 6. Code changes

| file | change |
|---|---|
| `app/[locale]/dashboard/profile/page.tsx` | 16 namespaces → one batch; `getOwnAvatar` + `getOwnedOrganizations` folded into the stage-4 batch; 13 worker reads collapsed from 8 stages into one; the 3 profession-dependent reads batched into one; both JSX awaits hoisted |
| `components/app/profile-hub-overview.tsx` | 7 namespaces + `getLocale` → one batch |
| `lib/guards/w7-s3-profile-read-waterfall.test.ts` | **new** — 12 assertions, a ratchet |
| `scripts/w7-s3-{read-graph,regression,db-calls,interaction-proof}.mjs` | **new** — measurement tooling, all loopback-only |

**Zero import lines changed in either component**, both remain server
components, and no `<Suspense>` was introduced (§7). Diff: 278 insertions,
155 deletions across the two product files.

## 7. Invariants

| invariant | how it is held |
|---|---|
| same sections, same hub, same readiness, same values, same availability, same skills/evidence, same empty states, same actions and deep links | **DOM fingerprint diff, §8** |
| authorization ordering | `createClient` → `auth.getUser` → `redirect(!user)` → first read. Untouched, and pinned by the guard |
| fail-closed check | still `if (!user) redirect(...)`, before every read |
| no cross-tenant widening | every read keeps its original filter — `.eq("id", user.id)`, `.eq("worker_id", workerId)`, `.eq("profile_id", user.id)`. Batching changes when a query runs, never what it selects |
| workspace context | not read by this page; unchanged |
| no client-side data movement | zero import changes, no `"use client"`, guard-pinned |
| **#1011 Suspense class** | **no `<Suspense>` added.** This slice only removes serialisation; the visible surface never becomes dependent on a late frame. Guard-pinned |
| no migration | none added; schema untouched |

### One duplicate read left in place, on purpose

`getOwnAvatar()` reads the `profiles` row a second time for `avatar_url`.
Folding that column into the stage-4 `.single()` would remove it — but that
`.single()` is the row the whole page depends on, and the avatar reader carries
its own `try/catch` precisely because `avatar_url` may not be provisioned.
Trading a **concurrent** read for a fail-closed risk on the page's critical row
is the wrong direction for a behaviour-identical slice. It costs no stage. It
is recorded as debt in §11 rather than quietly removed.

## 8. Browser evidence

Local Chromium, this worktree's own server on `:3470`, `caret: "initial"`.

**DOM fingerprint** — every `data-testid` with its text, every heading, every
`href`, every input, every `id`, plus geometry, captured BEFORE and AFTER for
three identities × two breakpoints:

| scenario | result |
|---|---|
| worker partial @1440 / @375 | **IDENTICAL** (docH 5273 / 7486, 19 headings, 166 testids, 34 hrefs, 18 ids) |
| worker complete @1440 | identical except three Next.js internal server-action inputs (`$ACTION_3` → `$ACTION_6`) — build-generated reference ids, not product state |
| worker complete @375 | **IDENTICAL** (docH 7316) |
| company @1440 / @375 | **IDENTICAL** (docH 5460 / 7673, 36 hrefs) |

**Total product-visible differences across all six fingerprints: 0.**

Every capture: `horizontalOverflow: false`, `skeletonMounted: false`,
**0 console errors, 0 hydration warnings**.

**Interaction proof** — the W7-S1 suite re-run unchanged against the flattened
code: **21/21 checks pass at 1440 AND 375** (one overview, correct reading
order, disclosure reveals the absorbed content, all six editor anchors present,
a real navigation to `/dashboard/opportunities`, keyboard operation, no layout
jump).

## 9. Tests and gates

- `pnpm typecheck` — clean
- `pnpm test` — **857 files / 13933 tests**; 1 failure, `Test timed out in
  5000ms` in `conversation-source-relation.test.ts`, which **passes in
  isolation**. This is the known tree-scan flake
  (`labourmarketai-vitest-tree-scan-guard-flake`): the failing subset differs
  every run (18 files → 5 → 1) and every one passes alone. Not caused by this
  slice; recorded as pre-existing repo debt.
- `pnpm lint` — clean on both changed files
- Product Gate (`product-gate.test.ts`) — pass
- `check:constitution` — pass · `check:worker-plain-language` — pass
- new `w7-s3-profile-read-waterfall.test.ts` — 12/12

### What the new guard pins

A **ratchet**: the page may render in at most 7 serial stages, the hub in at
most 2, the path in at most 9. Plus: no namespace awaited on its own line; no
await after `return (`; `createClient → getUser → redirect → first read`
ordering; the fail-closed redirect; every canonical reader called exactly once;
no table queried twice (except `profession_skills`, which answers two different
questions); both files stay server components; no `<Suspense>`.

## 10. Bundle

**Unchanged by construction.** The diff contains no `+import` or `-import` line
in either file, neither file is or became a client component, and no client
component was added or removed. Nothing this slice touched can reach the client
bundle.

## 11. Remaining performance debt

| id | debt |
|---|---|
| P-1 | `getOwnAvatar()` re-reads the `profiles` row (§7). Removing it safely needs the avatar path to become a nullable column on the critical select with its own guard — a small slice of its own |
| P-2 | Stage 6 exists only because `worker_professions` arrives in stage 5. Moving that one read into stage 4 (it needs only `workerId`, which stage 4 produces) would need `workerId` before stage 4 — i.e. splitting the `workers` read out. Not obviously worth one more round trip |
| P-3 | The three `Promise.all` batches fan out 7 / 13 / 3 concurrent PostgREST requests. Fine locally; if production connection limits ever bite, the 13-wide batch is the one to split |
| P-4 | `pg_stat_statements` shows ~208 statements per render, far more than the ~20 the page issues — the remainder is auth, RLS and PostgREST internals. Worth a look in a dedicated slice; out of scope here |
| P-5 | Repo-wide: vitest has no `testTimeout`, so tree-scanning guards flake at the 5 s default under load. Not a profile issue; it makes every full-suite run ambiguous |

## 12. Verdict

**`W7_S3_PROFILE_READ_WATERFALL_FLATTENED_43_TO_9_BEHAVIOUR_IDENTICAL`**

43 → 9 serial stages; 17 → 5 sequential DB round-trip stages; 24 → 0 serial
translation awaits; 2 → 0 awaits inside the JSX; DB call volume unchanged;
client bundle unchanged; six DOM fingerprints with zero product-visible
differences; 21/21 interaction checks; zero console errors and zero hydration
warnings. Timing is reported as inconclusive with the reason quantified.
