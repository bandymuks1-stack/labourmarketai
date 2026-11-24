# User flows

Concrete paths the first users take. All routes are under `/{locale}/…` (lt/en/ru).

## Person (Asmuo)
1. Land on public `/lt` → "Sign in" → `/lt/auth/login` (or signup).
2. Onboarding presents the **person** identity first (not a "worker silo").
3. `/lt/dashboard` → personal space. Actions: fill profile, find work, readiness/documents.
4. `/lt/dashboard/profile` → CV text + skills + work journal in one passport.
5. `/lt/dashboard/journal` → write a work entry → **Save runs skill recognition**
   and links the skills you already declared (evidence support, not verification).
6. `/lt/dashboard/opportunities` → see matching work (visibility policy applies).
7. Switch to **Įmonė** space only if the person also represents a company.

## Company (Įmonė)
1. Sign in → switch to / create the **company** identity.
2. `/lt/dashboard/company` → raise a need (describe → criteria → review → submit).
3. `/lt/company-need` (public-facing intake) for the structured demand.
4. `/lt/dashboard/projects` → projects as real work objects: location signal + team + chat.
5. `/lt/dashboard/communication` → talk to people about a project / need.

## Actions, not identities
The role switcher shows **Asmens erdvė / Įmonės erdvė** only. Buying, selling,
hiring, renting, agency activity are **actions** inside those identities — never
separate top-level roles.

## What needs a human today (no automation yet)
- First-user approval (owner-review), document verification, any "verified" status,
  and all payments. See [known-limits.md](./known-limits.md).
