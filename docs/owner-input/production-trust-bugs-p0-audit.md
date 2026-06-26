# Production trust bugs — P0 audit

**Branch:** `fix/production-trust-bugs-p0`
**Scope:** 5 production-visible trust issues reported by the owner. UI / copy / i18n / skill-extraction only. **No DB / schema / migration / RLS / Supabase / env / auth-core change.** One focused PR, opened as **draft**, held for owner — not merged, not deployed.

Status legend: **GREEN** = fixed + guarded + verified · **YELLOW** = partially addressed / safe subset shipped, remainder documented · **RED** = not safe to fix in this slice (needs deeper work / owner decision).

---

## Issue A — Raw i18n keys visible (`journal.cvBridge`, `journal.cvBridgeLink`) — **GREEN**

**Symptom:** the literal keys `journal.cvBridge` / `journal.cvBridgeLink` rendered in the UI instead of translated text.

**Root cause:** the `journal` namespace is loaded from `messages/{locale}/journal.json` and **fully overrides** (object spread, not deep-merge) the `journal` block of the base `messages/{locale}.json` — see `lib/i18n/request.ts`. The two `cvBridge*` strings existed only in the base file, so once the namespace override was active they resolved to nothing and next-intl printed the raw key.

**Fix:** backfilled the real `cvBridge` + `cvBridgeLink` values (copied from each locale's existing base translation) into all 11 `messages/{locale}/journal.json` namespace files. Byte-preserving, CRLF-safe injection — no mass reformat.

**Guard:** `lib/guards/journal-namespace-cvbridge.test.ts` — asserts every locale's `journal.json` carries non-empty `cvBridge`/`cvBridgeLink` that are not the literal key.

**Files:** `messages/{en,lt,ru,da,de,et,lv,nl,no,pl,sv}/journal.json`.

---

## Issue B — Skill-extraction false positives (web/website design → construction) — **GREEN**

**Symptom:** "Dirbau su svetainės dizainu 9 h" (worked on website design) wrongly surfaced a construction-adjacent skill (interior design). LT `svetainė` is ambiguous — it means both "website" and "living room".

**Root cause:** `lib/profile/skill-claim-extractor.ts` had an ambiguity block that, on seeing `svetain` + `dizain`, surfaced **both** the website reading **and** the interior/living-room reading.

**Fix:** the compound "svetainės dizainas" defaults to the single honest website/IT-design suggestion. The interior reading is now surfaced **only** by its own explicit needles (`interjer` / `kambar` / `patalp` / `interior`). Plain website-design text never yields an unrelated construction/interior skill. Genuine recognition (real interior text, driving, IT, sales, construction, etc.) is preserved.

**Guard:** `lib/guards/skill-design-not-construction.test.ts` — the three owner test phrases produce no construction/interior label and still suggest "Interneto svetainės dizainas"; explicit interior text still recognises "Interjero dizainas"; driving still recognises "Vairavimas".

**Files:** `lib/profile/skill-claim-extractor.ts`.

---

## Issue C — "Termometras" wording wrong — **GREEN**

**Symptom:** user-facing copy called the readiness/market readout a "thermometer" (`Termometras` / `Thermometer` / `Термометр`), which misreads as a temperature/health gauge rather than a market/visibility signal.

**Fix:** reworded the visible strings to the honest **market signal** framing:
- LT `Termometras` → **Rinkos signalas** (market) / readout strings to "rinkos signalas".
- EN `Thermometer` → **Market signal**.
- RU `Термометр` → **Рыночный сигнал**.

7 strings reworded per locale (`playerCard.thermoLabel`, `admin.market.averages.help/empty`, `admin.market.pulse.thermoTitle/thermoEmpty`, `admin.league.subtitle/methodNote`). The `data-testid="player-card-thermometer"` and code identifiers are **unchanged** (rename would be a needless churn / test break). The doctrine quote in `docs/PLATFORM_DOCTRINE.md` is explanatory prose, not UI copy, and is intentionally left untouched (and `fit-not-rating.test.ts`, which asserts that quote, still passes).

**Guard:** `lib/guards/market-signal-not-thermometer.test.ts` — scans every en/lt/ru message file (base + namespaces) and fails on any `termometr|thermomet|термометр`.

**Files:** `messages/{en,lt,ru}.json`.

---

## Issue D — Admin / active-context clarity — **GREEN**

**Symptom:** when an operator was inside the admin subtree, it was not visibly clear they were in an elevated mode, and there was no obvious way back to their own space.

**Fix:** an `AdminContextBanner` server component renders at the top of every `/[locale]/dashboard/admin/*` page (mounted once in `app/[locale]/dashboard/admin/layout.tsx`). It shows a clear "Admin mode — you are managing the platform" label and a one-click "← Back to my space" link to `/dashboard`. It **removes no admin access** — it only labels the active mode and offers an honest exit. The existing entry affordances (header admin badge in `role-switcher.tsx`, admin tab in `dashboard-tabs.tsx`) are unchanged. The fail-closed `requireSuperadmin` gate in the layout is untouched.

**i18n:** new `admin.mode.active` / `admin.mode.exit` keys in all 11 locales (en/lt/ru translated; da/de/others `[EN]` until human translation, baseline bumped 783 → 785 per doctrine §2.4).

**Files:** `components/app/admin-context-banner.tsx` (new), `app/[locale]/dashboard/admin/layout.tsx`, `messages/{all}.json`.

**Testid:** `admin-context-banner`, `admin-context-exit`.

---

## Issue E — Navigation / transition feels slow or unclear — **YELLOW**

**Audit of existing states (GREEN already):** active state is correct on both navs — `aria-current="page"` is set, and the active item is visually distinct (`bg-ink-700 text-text-primary` on desktop tabs, `text-brand-orange` on the mobile bottom nav). No change needed there; over-editing correct styling risks regression.

**Gap (now fixed):** there was no *pending* feedback during a route transition, so a tap could "feel like nothing happened" on a slow navigation. Added a `NavLinkPending` indicator (a small spinner) rendered inside each nav `<Link>` via Next's official `useLinkStatus()` hook — it appears **only while that link's navigation is actually in flight**, so the feedback is honest (never shown for an instant/cached transition). Added `data-testid`s to the nav links (`dashboard-tab-${id}`, `bottom-nav-${id}`) for testability.

**Why YELLOW not GREEN:** deeper perceived-speed work (route-level skeletons / Suspense boundaries / prefetch tuning per route) is a larger change with real regression surface and is **out of scope** for a P0 trust slice — documented here as a follow-up rather than attempted blind. The honest pending affordance + verified-correct active state is the safe subset shipped.

**Files:** `components/app/nav-link-pending.tsx` (new), `components/app/dashboard-tabs.tsx`, `components/app/bottom-nav.tsx`.

**Testid:** `nav-link-pending`, `dashboard-tab-${id}`, `bottom-nav-${id}`.

---

## Risky-path scan

No change touches: DB / schema / migrations / RLS / Supabase / env / DNS / billing / payment / auth-core. No fake skills, fake admin state, fake loading state, or fake data introduced — the pending spinner is bound to real navigation state, the admin banner reflects the real admin subtree, and skill suggestions are narrowed (fewer false claims), not fabricated. No external company/platform names in branch, PR, files, or copy. PR #504 untouched.

## Verification

`pnpm -F web typecheck` · `lint` · `build` · full `vitest` · route smoke · risky-path scan — see final report. PR opened as **draft**, held for owner; **not merged, not deployed.**
