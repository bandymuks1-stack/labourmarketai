# Performance Reality Audit v1 — measurements, bottleneck ranking, quick win

**Branch:** `perf/cc/performance-reality-audit-v1` (from verified `main` 4e51d8f5 — PR #785 merged + deployed).
**Type:** Draft PR — NOT merged, NOT deployed without owner review.
**Rule honoured:** nothing below is called an improvement without before/after numbers.

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
  potential further ~100 KB raw off public pages), lazy per-namespace
  loading for admin-only client surfaces, cold-start mitigation.

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
