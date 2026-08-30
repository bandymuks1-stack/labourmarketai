# LabourMarket.ai — APP READINESS MAP

> **Status:** canonical, measured 2026-08-28 from code at `d1146616`.
> Entry point: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md).
> **Purpose:** answer one question — *what would a second client (Android, an
> MCP/ChatGPT app, a future iOS app) have to REIMPLEMENT?* — from the code,
> not from intent.

---

## 1. THE HEADLINE, AND IT IS BETTER NEWS THAN EXPECTED

The canonical logic is **already** in portable places. The domain engines are
pure TypeScript with no framework imports, and the rules that must never be
re-implemented client-side (money, permissions, relationships) are `SECURITY
DEFINER` functions and RLS policies **inside the database**, where every client
reaches them identically.

What is missing is not shared logic. It is a **client-agnostic transport**.

| measure | count |
|---|---|
| non-test modules under `lib/` | 888 |
| that are Next.js server actions (`"use server"`) | **184** |
| that are `server-only` (importable only by the server) | 356 |
| that import `next/*` at all | **122** |
| that import `react` | 32 |

So ~86% of `lib/` has no React dependency, and only ~14% touches Next.js.

---

## 2. THE ONE BLOCKER

**Every authenticated path in the product — all 184 server actions AND all
existing API routes — resolves identity from browser cookies.**

`lib/supabase/server.ts`:

```ts
export const createClient = cache(async () => {
  const cookieStore = await cookies();          // next/headers
  return createServerClient<Database>(url, anonKey, { cookies: { … } });
});
```

Every `app/api/**/route.ts` that authenticates does so through that same
`createClient()` → `getUser()`. There is no `Authorization: Bearer` path
anywhere.

A native mobile client or an MCP server holds a **Supabase JWT**, not a browser
cookie jar. So today:

- it cannot call a server action (they are an RPC protocol private to the
  Next.js client bundle), **and**
- it cannot call an API route either, because the route will resolve *no user*
  and RLS will correctly return nothing.

That was the whole gap. It is one seam, not a rewrite.

### UPDATE 2026-08-28 — the API half of the seam is built

The owner approved the auth-core API boundary, and it exists:
`lib/api/api-identity.ts`, one resolver, used by `app/api/**` only. Server
actions are untouched and stay a browser transport by design.

What is now true, and what is still not:

| | before | now |
|---|---|---|
| `app/api` routes reading `Authorization` | 0 of 9 | 4 of 9, through ONE resolver |
| a phone can reach a canonical READ | no | yes (`GET /api/workers/:id/skills`) |
| a phone can reach a canonical WRITE | no | yes (`POST /api/workers/:id/skills`) |
| a phone can import a CV | no | yes (`POST /api/cv/extract`) |
| a phone can call a server action | no | **still no, and deliberately** |
| the 184 server actions | cookie-bound | cookie-bound, unchanged |

The remaining coupling is NOT at the route layer. It is that **257 of 892
`lib/` modules call `createClient()` themselves** rather than accepting the
caller's client, so a route whose domain helpers do that cannot honestly be
made bearer-capable by adding a header — the search would run as the cookie
session while the route reported the bearer caller. `/api/dashboard-search` is
classified `shared-blocked` for exactly this reason, in the guard, with the
measurement attached. That is the shared-core refactor, and it is now the next
piece of work rather than the gate.

---

## 3. WHAT A SECOND CLIENT WOULD *NOT* HAVE TO REIMPLEMENT

The acceptance question was explicit. Answering it item by item, with where the
logic actually lives:

| must not be reimplemented | where it lives | portable? |
|---|---|---|
| Journal evidence derivation | `lib/structuring/` — **54 of 54 modules pure**, no `next`, no `react`, no `server-only`; plus `create_journal_entry_full` and the `journal_entry_*` tables | **YES** |
| Matching | `lib/market/` (18 of 24 pure, incl. `match-v1`), `lib/structuring/concept-resolution/` | **YES** |
| LMC accounting | **entirely in the database** — `lmc_spend_v1`, `lmc_record_purchase_v1`, `lmc_reverse_v1`, `lmc_ensure_account_v1`, all `SECURITY DEFINER`, `service_role`-only | **YES** (DB-side) |
| Permissions | RLS + `can_view_worker` + `relationship_types.grants_worker_visibility` — data, in the database | **YES** (DB-side) |
| Entitlements | `lib/billing/entitlements.ts`, `entitlements-v1.ts`, `effective-entitlements.ts`, `plans.ts` — pure, **zero** `next` imports across all 19 billing modules | **YES** |
| AI privacy / routing | `lib/ai/runtime/` — 43 of 49 modules pure (task policy, sensitivity, egress gate, provider chain, pricing). The 5 `server-only` ones are the env boundary, which is correct | **YES** |

**None of the six needs re-implementation.** They need to be *reachable*.

---

## 4. PER-DOMAIN CLASSIFICATION

Measured per directory: `actions` = `"use server"`, `serverOnly` =
`"server-only"`, `nextBound` = imports `next/*`.

| domain | modules | actions | server-only | next-bound | class |
|---|---|---|---|---|---|
| `structuring` | 54 | 0 | 0 | 0 | **SHARED DOMAIN READY** |
| `ai` | 49 | 1 | 5 | 0 | **SHARED DOMAIN READY** (server boundary correct) |
| `market` | 24 | 1 | 5 | 1 | **SHARED DOMAIN READY** |
| `billing` | 19 | 0 | 9 | 0 | **SHARED DOMAIN READY** |
| `cv` | 7 | 0 | 2 | 0 | **SHARED DOMAIN READY** |
| `taxonomy` | 4 | 1 | 1 | 0 | **SHARED DOMAIN READY** |
| `player-card` | 11 | 1 | 6 | 0 | SHARED, reads server-bound |
| `opportunities` | 22 | 4 | 9 | 2 | SHARED, writes web-bound |
| `staffing` | 15 | 3 | 4 | 1 | SHARED, writes web-bound |
| `notifications` | 8 | 1 | 6 | 0 | SHARED, writes web-bound |
| `usage` | 1 | 0 | 1 | 0 | SHARED, server-bound by design |
| `journal` | 43 | 8 | 21 | 7 | **EXTRACTION REQUIRED** (writes) |
| `projects` | 29 | 7 | 19 | 6 | **EXTRACTION REQUIRED** |
| `demand` | 14 | 4 | 8 | 4 | **EXTRACTION REQUIRED** |
| `profile` | 14 | 5 | 6 | 3 | **EXTRACTION REQUIRED** |
| `auth` | 11 | 2 | 6 | 5 | **SECURITY-SENSITIVE** — see §2/§5 |
| `documents` | 10 | 4 | 6 | 4 | **EXTRACTION REQUIRED** (+ storage) |
| `invitations` | 5 | 2 | 1 | 2 | EXTRACTION REQUIRED |
| `organizations` | 4 | 2 | 1 | 1 | EXTRACTION REQUIRED |
| `skills` | 4 | 2 | 2 | 1 | EXTRACTION REQUIRED |
| `services` | 2 | 2 | 1 | 1 | EXTRACTION REQUIRED |
| `evidence` | 1 | 0 | 0 | 0 | SHARED DOMAIN READY |

**Read the "EXTRACTION REQUIRED" rows correctly.** In almost every case the
*computation* is already pure and the *write* is wrapped in a server action
whose only Next.js dependencies are `cookies()` and `revalidatePath()`. The
extraction is mechanical — lift the body into a service function that takes an
authenticated client, leave the action as a three-line wrapper — **and it is
not worth doing until §2 is decided**, because without a transport there is
nothing for the extracted function to serve.

### 4.1 Two measured exceptions inside the portable domains

The guard found them; they are recorded rather than waved through:

| module | import | verdict |
|---|---|---|
| `lib/billing/billing-subject.ts` | `cache` from `react` | request-scoped memoisation |
| `lib/market/live-market-landing.ts` | `unstable_cache` from `next/cache` | route-cache tagging |

Both couple to the framework for **caching only**. Neither carries a domain
rule, so a second client bringing its own caching loses nothing and
reimplements nothing. They are allow-listed **by name** in
`lib/guards/app-shared-core.test.ts`, so a third one cannot appear quietly —
adding a framework import to a portable domain has to be an explicit, reviewed
edit to that list.

**WEB-ONLY BY DESIGN** (correctly so, no extraction wanted): `lib/navigation`,
`lib/i18n` routing, `lib/seo`, `lib/hooks`, `lib/product-gate`,
`lib/visual`/`lib/browser`.

---

## 5. THE ORDER OF WORK, AND THE GATE

1. ~~**OWNER GATE — bearer auth on the API boundary.**~~ **DONE** (2026-08-28,
   owner-approved). One resolver, `app/api/**` only, never server actions.
   Ten negative controls against the real stack, listed in
   `tests/e2e/auth-core-bearer.spec.ts`.

   One control from the original sketch was deliberately NOT built: *"a token
   whose `sub` is not a profile"*. Rejecting that at the transport would make
   BEARER STRICTER THAN COOKIE — the cookie path has never required a profile
   row, and a just-registered user legitimately has none. The rule the boundary
   must hold is parity, and an extra check is as much a violation of it as a
   missing one. Every other control is built and observed failing.
2. Expose the already-pure reads first — Living CV / player card, opportunities,
   market facts. No extraction needed; they only need a route.
3. Extract journal + demand WRITES into service functions behind those routes.
   Mechanical, once (1) exists.
4. MCP/ChatGPT app: the same routes, no second implementation.

**Do not** build an Android client before (1). It would either reimplement
authentication or scrape the web client, and both are the failure this document
exists to prevent.

---

## 6. HONEST STATUS

*Updated 2026-08-29 by the mobile foundation slice — see
[`docs/MOBILE_ARCHITECTURE.md`](MOBILE_ARCHITECTURE.md).*

| | |
|---|---|
| `AUTH_CORE_API_READY` | **YES** — implemented, 10 negative controls, cookie path regression-proven |
| `APP_SHARED_CORE_READY` | **PARTIAL** — `packages/client-core` exists (config, session, locale, transport contract, actor context; zero dependencies, zero framework imports) and the transport exists; but 257 of 892 `lib/` modules still resolve their own cookie client, so only 4 of 9 routes can honestly use it |
| `ANDROID_CLIENT_SCAFFOLD` | **BUILT** — `apps/mobile`, Expo SDK 57. Registration, sign-in, session, sign-out, language and the navigation shell are real. A Hermes bundle compiles for both platforms |
| `ANDROID_IMPLEMENTATION_READY` | **NO** — no longer blocked on the seam (§5.1 opened with auth-core). Product data waits on the shared-core refactor coverage above; the scaffold ships every blocked surface as an honest refusal, never an empty screen |
| `ANDROID_NATIVE_BUILD_PROVEN` | **YES (build level, 2026-08-30)** — `gradlew assembleDebug` BUILD SUCCESSFUL, `app-debug.apk` produced (`ai.labourmarket.app` v0.1.0); hoisted linker + Expo SDK 57 bundled pins, see `docs/mobile/NATIVE_READINESS_2026-08-29.md`. Runtime install+launch still unproven: no emulator/device on the build machine |
| `IOS_BUILD_PROVEN` | **YES (simulator, 2026-08-30)** — `ios.yml` on GitHub `macos-26` runners: prebuild → pod install → xcodebuild (scheme `LabourMarketai`, Xcode 26.6, unsigned) → BUILD SUCCEEDED → simulator install+launch, process alive 15s ("IOS_SIM_LAUNCH_PROVEN"). Toolchain floor: Xcode 26.4+/Swift 6.3 (expo/expo#46242). NOT claimed: device builds, signing, store readiness, real-backend auth/deep-link E2E |
| `CHATGPT_APP_BACKEND_READY` | **PARTIAL** — the transport is there and three canonical capabilities are reachable over it; the rest wait on the same shared-core refactor |

The gate is closed. What remains is not a decision — it is the mechanical work
of letting domain helpers accept the caller's client instead of fetching their
own.

### 6.1 WHY A CLIENT WAS SCAFFOLDED BEFORE THE GATE OPENED

§5 says *do not build an Android client before (1)*, because it would either
reimplement authentication or scrape the web client. The scaffold does neither,
and the reason is a distinction §5 did not draw:

**Authentication is not behind the blocked seam.** Supabase Auth accepts a
token directly and has never needed a cookie, so registration, sign-in, refresh
and sign-out work today against the platform's own auth server — no second
identity system, no reimplementation, nothing scraped.

Everything the seam DOES block — journal, hours, Living CV, opportunities — is
built as a refusal that names its cause, and `DOMAIN_TRANSPORT_STATUS` in
`packages/client-core/src/transport.ts` ships closed. A guard in the required
merge gate fails if it is opened without updating this document.
