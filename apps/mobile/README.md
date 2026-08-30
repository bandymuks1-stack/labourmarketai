# LabourMarket.ai — mobile client

Android and iOS, one React Native codebase. **A client of the canonical
LabourMarket.ai domain — not a second product.**

Architecture and the reasoning behind every choice here:
[`docs/MOBILE_ARCHITECTURE.md`](../../docs/MOBILE_ARCHITECTURE.md).
Read it before changing anything in this directory.

---

## The one thing to know first

This app can **sign you in** and it **cannot yet read or write your work**.

That is not an oversight. Every authenticated path in the platform resolves
identity from browser cookies, and a phone holds a token instead
([`docs/APP_READINESS_MAP.md`](../../docs/APP_READINESS_MAP.md) §2). Opening
that seam is an owner-gated auth-core change (PR #1336). Until it merges,
`DOMAIN_TRANSPORT_STATUS` is closed and every screen that would show product
data says so.

**Do not work around it.** Querying Supabase tables directly from the device
would re-derive on a phone the meaning the canonical domain already owns. That
is the failure the architecture exists to prevent.

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
  domain.ts             the ONLY path to product data — currently refuses
  context-provider.tsx  one person, many contexts
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
