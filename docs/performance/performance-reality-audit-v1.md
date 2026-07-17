# Performance Reality Audit v1 — measurements, bottleneck ranking, quick win

**Branch:** `perf/cc/performance-reality-audit-v1` (from verified `main` 4e51d8f5 — PR #785 merged + deployed).
**Type:** Draft PR — NOT merged, NOT deployed without owner review.
**Rule honoured:** nothing below is called an improvement without before/after numbers.
**v2 shipped on the same branch:** route-group provider subsetting — see §7.

---

## 1. Measurements (production, app.labourmarket.ai, 2026-07-17)

### TTFB / document size (curl ×3, warm after first hit)

| Route | TTFB (warm) | Document raw | Document wire (gzip) |
|---|---|---|---|
| `/lt` (landing) | ~0.20–0.24 s | **715 KB** | **180 KB** |
| `/en` | ~0.19–0.21 s | 697 KB | ~175 KB |
| `/lt/auth/login` | ~0.21–0.55 s | **480 KB** | **151 KB** |
| `/lt/dashboard` | ~0.20 s (307 auth gate) | 15 B | — |
| `/lt/dashboard/planning` | ~0.18–0.29 s (307) | 15 B | — |

Cold-start first hits: 0.9–1.1 s TTFB (Vercel lambda warmup) — expected serverless behaviour, not a code defect.

### Client JS (route-level, `next build`)

| Route | Route JS | First Load JS |
|---|---|---|
| `/[locale]` (landing) | 16.9 KB | 212 KB |
| `/[locale]/dashboard` | 19.6 KB | 181 KB |
| `/[locale]/dashboard/planning` | 2.07 KB | 120 KB |
| `/[locale]/auth/login` | 1.93 KB | 210 KB |
| shared by all | — | 103 KB |

JS budgets are healthy — **JS is not the lag source**.

### HTML composition (the real finding)

`/lt` production document: 57 inline scripts totalling **558 KB**, of which ONE
RSC flight chunk is **461 KB** — the FULL i18n runtime message tree
(`messages/lt.json` 393 KB + six split taxonomy files ≈ 47 KB) serialized into
the payload of **every page**, because the root `NextIntlClientProvider`
inherited the complete tree. The same 461 KB chunk sits inside the 480 KB
login document. Server-only namespaces (`legal`, `projectOps`, `scouting`,
`privacyConsent`, …) were shipped to every visitor on every route.

## 2. Bottleneck ranking (evidence-based)

| # | Bottleneck | Evidence | Status |
|---|---|---|---|
| 1 | **Full i18n tree in every RSC payload** (~461 KB raw / dominant share of wire weight on public + auth pages) | composition analysis above | **FIXED in this PR** (quick win below) |
| 2 | Serverless cold-start TTFB (0.9–1.1 s first hit) | curl ×3 series | documented; platform-level (warming/ISR) — no code change in this PR |
| 3 | Dashboard server render: already ONE parallel batch (PR #750 P0 audit); request-cached session/spine; hub promise shared; Wave-2 planning reads parallel (`Promise.all` of 6 sources) | code audit of `dashboard/page.tsx` 134–210, `lib/planning/planning.ts` | no sequential-await defects found — no change |
| 4 | Sequential dependent reads inside adapters (journal: workers→entries; projects: orgs→projects) | code audit | dependent by data (id needed for filter) — cannot parallelize safely; documented |
| 5 | Landing media/animation weight (marketing components) | 212 KB First Load, 25 inline SVGs | acceptable; out of scope (no redesign wave) |

## 3. Quick win shipped (with numbers)

**Client message allowlist** — `lib/i18n/client-messages.ts` +
`pickClientMessages()` in the root layout. Client components can only reach
allowlisted roots (union of every literal `useTranslations("…")` root in
"use client" files + dynamic-key roots: module registry, tabs, skill groups,
draft forms). Server components keep the full tree via `getTranslations`
(unchanged behaviour).

### Before / after (deterministic: identical gzip -6 over captured documents; before = production capture ≡ local baseline build, after = local build of this branch)

| Page | Raw | Gzip (wire) |
|---|---|---|
| `/lt` landing | 719 KB → **547 KB** (−24 %) | 180 KB → **128 KB** (**−29 %**) |
| `/lt/auth/login` | 490 KB → **315 KB** (−36 %) | 145 KB → **93 KB** (**−36 %**) |
| messages flight chunk | 461 KB → **293 KB** (−36 %) | — |

The saving applies to **every route** (the provider is in the root layout),
including the auth-gated dashboard and planning pages.

### Safety net (how this cannot silently break translations)

`lib/guards/client-messages-allowlist.test.ts` re-derives the reachable set
from source on every CI run: literal roots in "use client" files, registry
label/description roots, skill-group and draft-form roots — any client
namespace missing from the allowlist FAILS CI instead of rendering raw keys.
The guard proved itself during development: it caught `workforcePlanning`
and `activityCentre` (dynamic registry roots my manual sweep missed) before
any measurement was accepted. It also pins that the layout ships the pick
(no silent revert to the full tree), that every allowlisted root exists in
every active locale, and that the pick never rewrites values.

### Verified-honesty note on measurement

The first local before/after attempt showed a null result because the
`next start` responses varied between runs (streamed document variance);
the numbers above come from full captured documents compressed with the
same gzip level — and the production document (715 KB, 461 KB chunk)
matches the local baseline build (713 KB, 461 KB chunk) byte-for-scale,
so the baseline is real.

## 4. What was deliberately NOT done

- No schema change, no caching of private user data (the pick is static
  public copy, identical for every user), no dashboard redesign, no function
  removal, no Mobile-wave mixing.
- Next candidates (future, each needs its own before/after): route-group
  provider subsetting (marketing vs dashboard get different allowlists —
  potential further ~100 KB raw off public pages) — **DONE in v2, §7** (the
  estimate was low: −294 KB raw off the landing document), lazy
  per-namespace loading for admin-only client surfaces (dashboard docs are
  not measurable without credentials — see §7 honesty note), cold-start
  mitigation.

## 5. Validation

| Check | Result |
|---|---|
| `client-messages-allowlist.test.ts` (new, 6 tests) | ✅ |
| typecheck / lint / `check:i18n-debt` / full suite / production build ×2 | see PR description |
| Dashboard + Timeline guards (hierarchy, duplicate-removal, primary-action, role-value, canonical-timeline, source-expansion, planning) | see PR description |
| Route smoke (prod baseline) | ✅ (auth gates intact) |

**Environmental limitation:** authenticated dashboard/planning documents
cannot be measured end-to-end without credentials; the fix provably applies
to them (same root provider), and the guard suite covers their rendering
contracts. Mobile throttling: wire-weight reduction (−52 KB gzip on landing,
−52 KB on login) is the dominant mobile factor; no layout changes shipped.

## 6. Rollback

Single squash revert (layout line + two new files + doc). No data, schema or
service impact.

---

## 7. v2 — Route-group provider subsetting (second measured optimisation)

**What:** v1 still shipped ONE union allowlist (~300 KB serialized) from the
root layout to every route. v2 moves the provider into the route-group
layouts, each with exactly the roots its own client components can reach.
Nested `NextIntlClientProvider` REPLACES `messages` for its subtree (verified
in use-intl context source: `messages === undefined ? prevContext?.messages
: messages`), so:

| Provider | Pick | Serialized (lt) |
|---|---|---|
| root `[locale]` layout | `BASE_CLIENT_MESSAGE_ROOTS` (`errorBoundary` — the root error boundary renders outside every group provider and `useTranslations` throws without context) | **0.1 KB** |
| `(marketing)` layout | 9 roots (`common`, `company`, `draft`, `live`, `map`, `marketPulse`, `playercards`, `shared`, `waitlist`) | **4.1 KB** |
| `auth` + new `onboarding` layout | `auth` | **27.9 KB** |
| `dashboard` + `design` (dev-only gallery) layouts | FULL union pick (they render the dynamic whole-tree `useTranslations()` consumers: bottom nav, module grid, tabs) | 264.2 KB (unchanged vs v1) |
| `cv`, `invite`, `[...rest]` | none beyond BASE (guard-proved: zero client-reachable namespaces) | — |

### Before/after (deterministic: full documents from `next start` of the two
builds on this branch, HEAD 74e34ea0 vs v2, identical byte-for-byte on
refetch, same gzip -6; BEFORE reproduces §3's numbers exactly)

| Route | Raw | Wire (gzip) | Largest inline flight chunk |
|---|---|---|---|
| `/lt` landing | 547.0 → **252.9 KB** (−54 %) | 127.8 → **40.8 KB** (**−68 %**) | 299.3 → 8.2 KB |
| `/lt/auth/login` | 315.9 → **48.9 KB** (−85 %) | 92.9 → **15.2 KB** (**−84 %**) | 299.3 → 32.1 KB |
| `/lt/pricing` | 453.5 → **159.3 KB** (−65 %) | 109.4 → **23.3 KB** (**−79 %**) | 299.3 → 8.2 KB |
| `/lt/about` | 389.4 → **95.4 KB** (−76 %) | 102.8 → **15.7 KB** (**−85 %**) | 299.3 → 8.2 KB |

Cumulative vs the original production baseline (pre-v1): landing wire
180 KB → 40.8 KB (**−77 %**), login 151 KB → 15.2 KB (**−90 %**).

Authenticated dashboard documents still cannot be captured without
credentials; their provider ships the SAME full pick as v1 shipped from the
root — i.e. provably no regression and no change for dashboard payloads
(serialized pick measured identical, 264.2 KB lt).

### Safety net (extended, same guard file)

`client-messages-allowlist.test.ts` now walks the import graph of every
route-group tree (static + dynamic imports, `@/` + relative, unresolvable
local specifiers FAIL) and proves per group:

- `(marketing)` reachable client roots ⊆ `MARKETING_CLIENT_MESSAGE_ROOTS`;
- `auth` and `onboarding` trees ⊆ `AUTH_CLIENT_MESSAGE_ROOTS`;
- provider-less trees (`cv`, `invite`, `[...rest]`, root shell incl.
  `error.tsx`) ⊆ `BASE_CLIENT_MESSAGE_ROOTS`;
- a NON-literal `useTranslations()` consumer (whole-tree/variable namespace)
  reachable from any subset tree FAILS the guard — only full-pick trees
  (dashboard, design) may render those;
- an inventory pin of `app/[locale]` children so a NEW top-level route
  directory fails CI until classified (own provider or provider-less list);
- wiring pins: each layout must ship its exact pick (no silent revert).

16 guard tests. Verified renders: zero `MISSING_MESSAGE` markers in all four
captured documents; real LT copy present (auth form strings, waitlist form);
route smoke — `/lt/dashboard` + `/lt/dashboard/planning` + `/lt/onboarding`
307 to login, unknown path 404 branded.

### v2 measurement honesty

- BEFORE was re-captured from a fresh build of this branch's HEAD (74e34ea0),
  not copied from §3 — it reproduced §3's numbers to the decimal (547.0 /
  315.9 KB), which also validates the capture method.
- Both captures fetched every document twice — byte-identical both times
  (`identicalRefetch: true`), so no streamed-response variance.
- The `/design` gallery (dev-only, `notFound()` in production) keeps the
  full pick via its own layout so the dev gallery still renders; this weight
  never ships in production builds.

### v2 rollback

Revert the v2 commit: root layout line back to `pickClientMessages`, remove
the two new layouts (`onboarding`, `design`), unwrap the three group layouts.
No data, schema or service impact.

## 8. Remaining candidates — measured composition + explicit skip decisions

Post-v2 landing document composition (252.9 KB raw / 40.8 KB wire):
inline scripts (RSC flight of the page itself) 100.7 KB, 25 inline SVGs
64.7 KB, other markup 87.4 KB, inline styles 0 KB.

Skipped, with reasons (owner rule: no unmeasured optimisations):

| Candidate | Why skipped |
|---|---|
| Lazy admin-only namespaces inside the dashboard pick (`admin` 18 KB + `adminPilots` 3.6 KB of the 264 KB pick) | the affected documents are auth-gated — no credentialed end-to-end measurement is possible from this environment; a serialized-pick-only claim would not prove document behaviour. Deterministic follow-up needs owner-provided test credentials. |
| Inline SVG dedup / sprite on landing (64.7 KB raw) | visual surface — forbidden scope this wave (no layout/visual changes); gzip already collapses repeated SVG markup (wire is 40.8 KB total). |
| Hydration profiling | needs browser-level timing; this machine runs 8 concurrent agents — measurements would not be deterministic. Candidate for a quiet-machine session. |
| HTML↔flight duplication (RSC serializes page markup twice) | framework-inherent to Next App Router streaming; no app-level fix that isn't a rearchitecture. |
| Fonts | already `next/font` with locked subsets (latin-ext + cyrillic where needed, TASK 07); nothing measurable to remove without a visual change. |
| Cache headers on documents | pages are auth/locale-dependent; caching private user data is banned for this PR; static marketing pages are already prerendered (SSG). |
