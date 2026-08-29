# LabourMarket.ai — MOBILE ARCHITECTURE

> **Status:** canonical for the Apps & Integrations train. Recorded 2026-08-29.
> **Read first:** [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (the entry point) and
> [`docs/APP_READINESS_MAP.md`](APP_READINESS_MAP.md) (what a second client
> would have to reimplement — measured from code, not intent).
>
> This file EXTENDS the canonical architecture. It introduces no new product
> concepts, no new permission model and no new backend. It records one new
> **client** and the shape of the seam it consumes.

---

## 1. THE SHAPE

```
WEB (Next.js)   ANDROID / iOS (Expo)   FUTURE: MCP / ChatGPT app
       │                  │                        │
       └──────────────────┴────────────────────────┘
                          │
        @labourmarket/client-core   ← config, session, locale, transport
                          │              contract. No framework, no rules.
                          │
              CANONICAL DOMAIN ACTIONS (apps/web)
       journal → evidence → capability → Living CV → matching
                          │
        SUPABASE: RLS + SECURITY DEFINER functions
              ← the ONE permission model, for every client
```

Two lines carry the whole design:

- **Authority lives in the database.** RLS, `can_view_worker`,
  `manages_organization` and the `SECURITY DEFINER` functions decide what any
  caller may see. No client computes that, ever. A client that filtered results
  itself would be a second permission model that the database never agreed to.
- **Meaning lives in the canonical domain.** A journal entry becoming evidence
  becoming a capability becoming a CV line is derivation the platform owns. A
  device re-deriving it would be the second implementation
  `APP_READINESS_MAP.md` exists to prevent.

---

## 2. THE ARCHITECTURE CHECK, ANSWERED

The five questions the train opened with, answered from the code.

| question | finding |
|---|---|
| **What shared domain/action layer exists?** | A large one, already portable. Of 888 non-test `lib/` modules, 122 import `next/*` and 32 import `react`. `lib/structuring` (54/54), `lib/market`, `lib/billing` (19/19 free of `next`), `lib/cv`, `lib/taxonomy` and the `lib/ai/runtime` decision layer are framework-free. Money and permissions are in the database. Pinned by `lib/guards/app-shared-core.test.ts`. |
| **What auth-core can be reused?** | All of it. The platform issues one end-user credential from one auth server. The web client keeps it in cookies; a phone keeps it in the OS keychain. That is a storage difference, not an identity one. |
| **What API/transport boundary exists?** | Almost none, and this is the blocker. **9** route files under `app/api`, 7 resolving identity from `cookies()`, **zero** reading an `Authorization` header. The other 184 authenticated paths are Next.js server actions — an RPC protocol private to the Next client bundle, which no native client can call at all. |
| **Does a mobile scaffold exist?** | No. Branches named `mobile-*` are all responsive-web work on `apps/web`. `apps/mobile` is new. |
| **Does the monorepo support shared packages?** | Not before this. `pnpm-workspace.yaml` globbed `apps/*` only and `packages/` did not exist. Now `packages/*` is in the workspace. |

**Nothing was invented that already existed.** The one thing genuinely missing
was a client-agnostic transport, and this slice does not build it — see §5.

---

## 3. THE STACK, AND WHY

**React Native 0.86 + Expo SDK 57, TypeScript, expo-router.** One codebase,
Android and iOS.

The decision turns on a single constraint that eliminates the alternatives:

> The domain logic is already written, and it is written in TypeScript.

| option | verdict |
|---|---|
| **React Native + Expo** | The only stack that can consume `lib/structuring`, `lib/market`, `lib/billing` and the AI decision layer **as they are**. Uses the same `@supabase/supabase-js` the web uses, against the same auth server. **Chosen.** |
| Flutter | Would require reimplementing every portable domain in Dart. That is precisely the failure `APP_READINESS_MAP.md` was written to prevent. Rejected. |
| Kotlin Multiplatform | Same reimplementation problem, plus a JetBrains-specific toolchain, plus iOS-side friction. Rejected. |
| Native Android + native iOS | Two codebases, two reimplementations. Rejected. |

### On vendor lock-in

The directive was explicit: do not lock the product to a vendor-specific
architecture. Expo is used as a **tooling layer over bare React Native**, not as
an architecture:

- `expo prebuild` emits standard `android/` and `ios/` Gradle/Xcode projects
  from `app.json`. They are `.gitignore`d because the config is the source of
  truth — the escape hatch stays open and stays exercised.
- **No EAS account, no Expo cloud service, and no Expo API is required to
  build.** The bundles proven below were produced locally and by CI with
  `expo export`, which is Metro plus Hermes — the standard React Native
  toolchain.
- No paid service, no push vendor, no analytics vendor, no downloaded model.

---

## 4. WHAT IS SHARED, AND WHAT IS NOT

### `packages/client-core` — new, and deliberately tiny

Zero runtime dependencies, zero framework imports, no `server-only`. Consumable
by a React Native screen, a Next.js server component and a future MCP server
alike.

| module | what it holds |
|---|---|
| `locales.ts` | The canonical locale vocabulary, mirrored from `apps/web/lib/i18n/config.ts` and **pinned** (see below). |
| `config.ts` | Client configuration, validated. Refuses an RLS-bypassing key, fails closed. |
| `session.ts` | The auth-state machine: four states, including `unavailable` as distinct from `signed_out`. |
| `transport.ts` | The canonical-domain call contract, and the gate that keeps it shut. |
| `actor-context.ts` | One person, many contexts (I-1): the participation-mode vocabulary and the selection rules. |

**What is NOT in it, on purpose:** domain logic and permission rules. Copying
journal derivation or matching in here would create the second implementation
this package exists to avoid. They move once — when the transport opens (§5).

### The mirror, and why it is not a duplicate

`client-core` restates two vocabularies the web app owns: the locale set
(doctrine §2.4) and the live participation modes. There were three options:

1. Mobile imports the Next.js modules across the app boundary. Metro would have
   to resolve into a directory whose neighbours import `server-only` and
   `next/headers`; one careless later edit and the mobile bundle breaks for a
   reason nobody would look for.
2. Web re-exports from the package, making it the single source. **This is the
   right end state** and it is the recorded follow-up — but it makes `apps/web`
   depend on a workspace package, which means `transpilePackages` in
   `next.config.ts` and a lockfile edge into the required merge gate. That does
   not belong in the same slice as a new client.
3. Mirror it and **pin** it.

(3) is what this repository already does when one truth must exist in two
runtimes — `lib/journal/work-time.ts` is a byte-for-byte mirror of a SQL
function held to it by a guard. Here the guard is
`apps/web/lib/guards/client-core-vocabulary-mirror.test.ts`, and it runs inside
the **required** gate. Five negative controls were run against it: dropping a
locale, renaming a participation mode, adding a framework import, adding a
runtime dependency, and opening the transport gate each make it fail.

A mirror without a guard is a duplicate. A mirror with a guard is one
vocabulary that happens to be written down twice.

### One recorded divergence

`apps/mobile` pins `@supabase/supabase-js@^2.112.4`; `apps/web` stays on
`^2.106.0`. Version 2.106 contains a dynamic `import()` with a variable
specifier in its tracing helper, which **Hermes cannot compile** — the Android
bundle fails outright. 2.112 removed it. Bumping the web app's Supabase client
is a change to a dependency of authenticated code and deserves its own slice
with its own verification; it is not a side effect of scaffolding a phone app.
**Follow-up: converge the two once web is re-verified on 2.112.**

---

## 5. THE ONE BLOCKER, AND WHAT THIS SLICE DOES ABOUT IT

Every authenticated path in the product resolves identity from browser cookies.
A phone holds a Supabase JWT. So a native client cannot call a server action,
and cannot usefully call an API route either — the route resolves no user and
RLS correctly returns nothing.

Opening that seam is an **auth-core change: RED, owner-gated**, parked as PR
#1336 until real-token proof is complete. **This slice does not open it, does
not merge it, and does not work around it.**

The obvious workaround was available and was refused: query the database
directly with `supabase-js` from the device. RLS would even permit it. It was
refused because the canonical domain is not the tables — it is the derivation
on top of them, and a device re-deriving that is the second implementation this
architecture exists to prevent.

So `callDomain` returns `transport_unavailable`, and every screen that would
show product data says so in a sentence a person can act on. **No screen renders
an empty list**, because an empty list means "you have nothing recorded" and the
truth is "we could not ask".

**When #1336 merges**, the change here is one constant:
`DOMAIN_TRANSPORT_STATUS` flips to `{ open: true }`. Every enabled-path
behaviour is already implemented and tested by injecting an open status —
headers, the four refusals kept apart, network failure, unreadable answers — so
the flip needs no new code written under pressure. The mirror guard fails until
`APP_READINESS_MAP.md` §6 and this file are updated in the same pull request.

---

## 6. WHAT IS BUILT (PR A) AND WHAT IS NEXT

### Built

| capability | state |
|---|---|
| Registration, sign-in, session persistence, sign-out | **Real.** Supabase Auth, same server as web. Credential in the OS keychain (`expo-secure-store`), never AsyncStorage. |
| Language selection | **Real.** Device language by default; the five active locales offered; AI-seeded ones labelled as previews (§7.4). |
| Context switching | **Shell built, holdings honestly unavailable.** Which contexts a person holds is an RLS read this client cannot make yet. |
| Navigation shell | **Real.** One app, four destinations, with a deep-link auth guard. |
| Environment handling | **Real.** Public values only, validated, RLS-bypassing keys refused. |
| Today / Work journal / Profile | **Honest placeholders.** They state what is not connected and why, and offer the website. |

### Next, in order

1. **PR B — Ramūnas hours quick-entry.** Two dependencies, both pending: the
   §5 transport seam (#1336) AND the canonical operational hours model
   (#1344, `work_hour_allocations`, draft/unapplied). See §7 for the model
   and §7.2 for what PR B may prepare before those clear.
2. **PR C — Work Journal first slice**, with the voice seam left open.
3. Living CV, opportunities, employer need, notifications — each a client of
   the same canonical routes.

Not started, and deliberately: offline sync, push vendors, analytics vendors,
store submission.

---

## 7. THE RAMŪNAS HOURS FLOW — TWO HOURS MODELS, KEPT DISTINCT

> **Corrected 2026-08-29 (owner reconciliation).** An earlier revision of this
> section concluded that "`work_hour_allocations` does not exist" and that the
> brief's schema was therefore wrong. That was a **main-only inspection error**:
> the table is absent from `main` because it is being *introduced* by pending
> **PR #1344** (`20260829140000_work_hour_allocations_v1.sql`, draft,
> owner-gated, UNAPPLIED). Absent from main does not mean rejected
> architecture. The paragraphs below record the actual state.

Three concepts exist and **must never be collapsed into one entity**:

| | concept | where it lives | state |
|---|---|---|---|
| **A** | **Operational allocation** — worker + date + object + hours + `entered_by` | `work_hour_allocations` (PR #1344) | **pending canonical operational model** — draft, migration NOT applied |
| **B** | **Journal metric** — hours/evidence derived from a Work Journal entry | `journal_entry_metrics` → `timesheet_compute_lines_v1` / `lib/journal/work-time.ts` (pinned mirror), per `20260818150000` | **existing, live, preserved** |
| **C** | **Timesheet** — period submission / approval / frozen snapshot | `timesheets` + `timesheet_events` | existing, live |

The A model's own invariants (from #1344, preserved verbatim in intent):
`worker_id` = whose work; `entered_by` = who recorded it — never collapsed;
multiple allocations per worker/day and multiple objects per day are valid, and
no uniqueness constraint may collapse them; correction is non-destructive
(`correction_of` / `superseded_by`); `journal_entry_id` is an **optional**
evidence link — simple attendance allocation is NOT forced through the Work
Journal. Operational direction:

```
WORK HOUR ALLOCATIONS → aggregation → timesheet snapshot / approval → export
WORK HOUR ALLOCATION  → optional journal_entry → Work Journal → evidence
```

The B chain (journal-derived work time) remains exactly as `20260818150000`
established it under an owner ruling, and **must remain valid**. It is not
replaced by A. `journal_entry_work_items` stays deprecated (0 lifetime inserts,
no writer) regardless of which model a client uses.

### 7.1 BOUNDED COMPATIBILITY REQUIREMENT (recorded, not solved here)

Once both A and B are live, the same real work could be recorded through both
paths, and any aggregation that sums them naively **double-counts**. The
concrete seam: today `timesheet_compute_lines_v1` computes timesheet lines
from journal metrics (B) only, while #1344's stated direction has timesheets
aggregating allocation rows (A) — and #1344 deliberately does not touch the
compute function. Both statements are correct today because A is unapplied and
unaggregated; they cannot both stay unqualified once A is applied.

The reconciliation (source-tagging of lines, e.g. explicit allocation vs
journal-derived vs import vs approved-timesheet projection, and a rule for
which wins when both describe the same work) is a **separate bounded slice**
with its own owner review. It is deliberately NOT solved inside mobile PR B,
and no final enum is invented here — `work_hour_allocations.source` is open by
convention, matching `worker_skills.source`.

### 7.2 WHAT THIS MEANS FOR PR B

PR B consumes the pending canonical model; it does not invent one. The
dependency graph is:

```
MOBILE UI
  → shared client transport contract (packages/client-core, gate closed)
  → canonical authenticated API/domain action   ← DEPENDENCY: #1336 seam
  → work_hour_allocations                       ← DEPENDENCY: #1344 applied
  → RLS
  → aggregation → timesheet / export
  (optional, later: allocation → Work Journal linkage)
```

PR B must NOT query operational tables directly from the mobile client merely
because RLS would technically allow it, must not create an hours table, and
must not write to `journal_entry_work_items`. Until both dependencies are
legitimate, PR B work is limited to the interface seam: screen boundaries,
transport interface, request/response types, loading/error/success states, and
tests against an injected transport. No Ramūnas-specific account, company,
rule, or hardcoded object limit appears anywhere.

---

## 8. VERIFICATION — WHAT WAS PROVEN, AND WHAT WAS NOT

Proven on this machine (Windows 11, Node 24, pnpm 10.33.2):

| check | result |
|---|---|
| `packages/client-core` unit tests | **51 passed** — auth states, config refusals, transport contract, locale resolution, context selection |
| Mirror guard negative controls | **5 of 5 fire** |
| `client-core` + `mobile` typecheck | **clean** |
| Android bundle (Metro + Hermes) | **3.2 MB `.hbc`** — the exact artifact an Android release ships |
| iOS **JavaScript** bundle | **2.9 MB `.hbc`** |
| App runs, sign-in screen renders (375×812) | **yes**, in Lithuanian, zero console errors |
| Deep link to `/settings` with no session | **redirects to sign-in** — the guard works |
| Misconfigured build (anon key removed) | **names the missing key, shows no sign-in form** |
| Web quality gate (typecheck / lint / tests / build) | **unchanged and green** |

**NOT proven, and not claimed:**

- **No Android APK or AAB was built.** This machine has Java 8 and no Android
  SDK; the Gradle build needs JDK 17+. The JavaScript half is proven; the
  native half is not.
- **No iOS app was built.** That needs Xcode on macOS. Only the JS bundle is
  proven.
- **Nothing was run on a physical device or emulator.**
- **No signed-in screen was verified in a browser.** Reaching it requires real
  credentials, which were not entered.
- Two peer-dependency warnings (`react-native-worklets`,
  `@react-native/metro-config`) are present in the install. Both bundles
  compile; they are recorded, not waved away.

---

## 9. WHAT MUST STAY TRUE

| # | invariant | held by |
|---|---|---|
| M-1 | No second backend | `apps/mobile` has no server of its own |
| M-2 | No second auth model | one Supabase auth server; storage differs, identity does not |
| M-3 | No second permission model | nothing on the client computes authority; RLS decides |
| M-4 | No duplicated domain logic | `callDomain` is the only data path, and direct table access from the device is refused by design |
| M-5 | No secret in the client bundle | `looksPrivileged` refuses an RLS-bypassing key and fails closed |
| M-6 | No mobile-only privileged endpoint | no endpoint was added at all |
| M-7 | No mobile-only business rule | every rule the client holds is a mirror with a guard |
| M-8 | One person, many contexts | one app, a context switch — never an app per audience |
| M-9 | Nothing invented is shown as data | an unavailable read renders a reason, never an empty list |
