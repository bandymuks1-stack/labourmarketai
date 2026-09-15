# LabourMarket.ai — mobile client

Android and iOS, one React Native codebase. **A client of the canonical
LabourMarket.ai domain — not a second product.**

Architecture and the reasoning behind every choice here:
[`docs/MOBILE_ARCHITECTURE.md`](../../docs/MOBILE_ARCHITECTURE.md).
Read it before changing anything in this directory.

---

## The one thing to know first

This app reads product data through **one door**: the canonical capability
boundary at **`/api/mcp`** (JSON-RPC 2.0 `tools/call`, bearer-authenticated by
the auth-core seam merged 2026-08-29 as #1331). `DOMAIN_TRANSPORT_STATUS` is
**open**, and the Today / Work journal / Profile tabs perform real reads —
`profile.get`, `journal.list`, `living_cv.skills.get`,
`journal.work_intelligence.get` (today / 7-day hours and entries, the
dominant skill, and hours · share · entries per skill — the SAME figures the
web shows, ordered the same way) — as the signed-in
person, under their own RLS.

**Writing is wired too.** `/(shell)/log-work` hosts `JournalComposer`, which
calls `journal.create_draft` and then `journal.confirm` through the same door —
the confirm runs `createJournalEntryCore`, the one canonical write. This
paragraph used to list the journal write among the things not yet wired, and
it stayed that way after #1648 shipped the composer. It was found on
2026-09-13 only because a reviewer read the code instead of this file, by which
time the false claim had been copied into a new release document and into a
plan to "build" the write path that already exists. **A README that says a
capability is missing is how the same thing gets built twice** — pinned now by
`apps/web/lib/guards/mobile-release-config.test.ts`.

What is genuinely NOT wired: **context holdings** (`context-provider.tsx` does
not perform the holdings read, so holdings are `unknown` and the UI says it
cannot list contexts yet — never an invented single context).

What is NOT PROVEN, which is a different thing from not built: **on-device
runtime** of any of it against production. `ios.yml` proves the auth-failure
journey on a CI simulator; no read and no write has been walked on a real
device. A failed read renders as the failure it is (`CapabilityGate`), never as
an empty list.

**Do not work around the door.** Querying Supabase tables directly from the
device would re-derive on a phone the meaning the canonical domain already
owns. That is the failure the architecture exists to prevent.

---

## Running it

```bash
cp apps/mobile/.env.example apps/mobile/.env.local   # then fill in the anon key
pnpm install
pnpm -F mobile start
```

`EXPO_PUBLIC_*` values are **inlined into the shipped bundle**. Public values
only — never a service-role key, a Stripe secret, an AI provider key or a
database password. The config validator refuses an RLS-bypassing key at
startup, but the only real protection is not putting one in the file.

| command | what it does |
|---|---|
| `pnpm -F mobile start` | Metro; press `a` for Android, `i` for iOS, `w` for web |
| `pnpm -F mobile typecheck` | `tsc --noEmit` |
| `pnpm -F mobile bundle:android` | Metro + Hermes — the artifact a release ships |
| `pnpm -F @labourmarket/client-core test` | where the rules are actually proven |

Web is a **development preview only**. `expo-secure-store` has no web
implementation and there is no honest browser equivalent of a hardware
keychain, so the session store refuses there rather than downgrading to
`localStorage`. The production web client is the Next.js app.

---

## Where things live

```
app/                    expo-router routes — the shell only, no logic
  _layout.tsx           providers; a misconfigured build stops here
  index.tsx             the entry gate: four auth states, four destinations
  sign-in.tsx           }  one form, two modes
  register.tsx          }
  (shell)/              the signed-in tabs, with a deep-link auth guard
src/
  auth-context.tsx      React wiring around the shared state machine
  supabase.ts           authenticates, and does nothing else
  secure-session-store.ts   the OS keychain
  domain.ts             the ONLY path to product data — capability() → /api/mcp
  use-capability.ts     one capability read as React state (loading/loaded/failed)
  capability-shapes.ts  presentation mirrors of the read capabilities' payloads
  context-provider.tsx  one person, many contexts (holdings read not wired yet)
  i18n/                 five active locales; parity enforced by the compiler
  ui/                   primitives, not product surfaces
  screens/
```

Rules worth testing live in
[`packages/client-core`](../../packages/client-core), as pure TypeScript, so a
phone is not needed to prove them.

---

## Three things this app must never do

1. **Show an empty list when it could not ask.** An empty list means "you have
   nothing recorded". Use `NotAvailable` and say what happened.
2. **Report a failed read as a fact about the person.** "We could not check" is
   not "you are signed out" and is not "you do not have permission". The
   `AuthState` and `DomainFailure` unions keep these apart; keep them apart.
3. **Decide what anyone may see or do.** That is RLS and the `SECURITY
   DEFINER` functions, for every client identically.
