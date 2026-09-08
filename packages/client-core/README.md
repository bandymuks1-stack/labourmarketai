# @labourmarket/client-core

What every LabourMarket.ai client shares. Zero runtime dependencies, zero
framework imports, no `server-only` — so a React Native screen, a Next.js
server component and a future MCP server can all import it, and none of them
needs the others.

Context: [`docs/MOBILE_ARCHITECTURE.md`](../../docs/MOBILE_ARCHITECTURE.md) and
[`docs/APP_READINESS_MAP.md`](../../docs/APP_READINESS_MAP.md).

```bash
pnpm -F @labourmarket/client-core test
pnpm -F @labourmarket/client-core typecheck
```

## What is here

| module | what it decides |
|---|---|
| `locales.ts` | Which languages exist, which may be offered, which must be labelled as unreviewed. Mirrored from `apps/web/lib/i18n/config.ts`. |
| `config.ts` | Whether a build's public configuration is usable. Refuses an RLS-bypassing key; fails closed on anything unreadable. |
| `session.ts` | The auth-state machine. Four states, because "we could not check" is not "signed out". |
| `transport.ts` | How a non-cookie client reaches the canonical domain — and the gate that currently keeps it shut. |
| `actor-context.ts` | One person, many contexts: the participation-mode vocabulary and the rules for choosing between them. |

## What is deliberately NOT here

- **Domain logic.** Journal evidence derivation, matching, entitlements and AI
  routing already live in framework-free modules under `apps/web/lib`. Copying
  any of it here would create the second implementation this package exists to
  avoid. It moves once, when the canonical transport opens.
- **Permission rules.** RLS and `SECURITY DEFINER` functions in the database
  decide those, for every client identically. Nothing here computes authority.
- **Secrets**, of any kind.

## The two properties that must survive every change

**1. It stays importable everywhere.** One `next/headers`, one `react`, one
`react-native` import and the package quietly stops being shareable. No
platform globals either — `localStorage` does not exist on a phone and
`document` does not exist in a server component, which is why storage arrives
as an injected `SessionStore`.

**2. It never collapses "we could not tell" into a finding.** `AuthState` keeps
`unavailable` apart from `signed_out`; `DomainFailure` keeps `unreachable`
apart from `refused`; `ContextHoldings` keeps `unavailable` apart from an empty
list. This is the #1314 defect class — a failed read reported as a fact about
the user — and these unions are what stop it recurring on a phone.

Both are enforced by
`apps/web/lib/guards/client-core-vocabulary-mirror.test.ts`, which runs inside
the required merge gate.
