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

That is the whole gap. It is one seam, not a rewrite — and it is **auth-core**,
which this repository classifies RED (`CLAUDE.md` → Merge model). It is
therefore recorded here and **not** implemented autonomously. See §5.

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

1. **OWNER GATE — bearer auth on the API boundary.** One resolver that accepts
   `Authorization: Bearer <supabase jwt>` in addition to cookies, used by
   `app/api/**` only (never by server actions). This is **auth-core → RED**:
   it must be an owner-approved, separately reviewed slice with its own
   negative controls (an expired token, a token for another project, a token
   whose `sub` is not a profile, and the existing cookie path unchanged).
   Nothing downstream is worth building before it, because nothing downstream
   is reachable without it.
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
| `APP_SHARED_CORE_READY` | **YES for the client-agnostic core** — `packages/client-core` exists (config, session, locale, transport contract, actor context), zero dependencies, zero framework imports. The DOMAIN logic is still shared-but-unreachable, per the row below |
| `ANDROID_CLIENT_SCAFFOLD` | **BUILT** — `apps/mobile`, Expo SDK 57. Registration, sign-in, session, sign-out, language and the navigation shell are real. A Hermes bundle compiles for both platforms |
| `ANDROID_IMPLEMENTATION_READY` | **NO** — still blocked on §5.1 for everything that shows product data. The scaffold ships this as an honest refusal, never as an empty screen |
| `ANDROID_NATIVE_BUILD_PROVEN` | **NO** — no APK/AAB has been produced. The build machine has JDK 8 and no Android SDK |
| `IOS_BUILD_PROVEN` | **NO** — the JavaScript bundle compiles; the native app needs Xcode on macOS |
| `CHATGPT_APP_BACKEND_READY` | **NO** — blocked on §5.1, the same seam |

One blocker, one gate, one owner decision. Everything else on the list is
already in the right place.

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
