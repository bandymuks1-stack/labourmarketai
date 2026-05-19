# Authentication structure

This foundation prepares authentication; it does not perform it. State is
reported honestly to the user in the UI and here.

## Provider states

| Provider | State | Meaning |
| --- | --- | --- |
| Google | `prepared` | UI + config structure exist. Credentials are **not** connected, so it does not sign anyone in. |
| Facebook | `coming-soon` | Disabled placeholder. |
| Instagram | `coming-soon` | Disabled placeholder. |

Source of truth: `src/lib/auth-providers.ts`. The `ProviderButtons` component
renders the state directly — buttons are disabled and labelled with their
real status. No provider claims to work before it is wired.

## Wiring Google later (structure only)

`auth-providers.ts` declares the environment keys Google will read:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```

No values are stored in the repository. Connecting a real provider is a
contained change: supply credentials via environment, flip the gate in
`isProviderInteractive`, and attach the chosen auth library — without changing
routes, the profile model, or the player-card system.

## Flow

`/register` → `/role` ("Who are you?": Worker / Company / Recruiter) → `/app`.
Role selection only establishes identity; it never asks "what are you looking
for". Onboarding is automated and self-serve — there is no gatekeeping step.
