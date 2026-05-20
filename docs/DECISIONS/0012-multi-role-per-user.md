# ADR 0012 — Multi-role per user

**Status:** Accepted · **Milestone:** M1 (schema 0003) · **Vision:** PROJECT_VISION.md §7

## Context
Real people hold several work identities simultaneously: a worker also
orders services as a `customer`; a `company_manager` is also a `customer`
at home; an `agency` operator may need a `worker` profile for their own
side projects. The M0 schema's single `profiles.role` check forced an
artificial choice that would block adoption — especially for the
`customer` role, which is the most common "second role" people will add.

## Decision
- `profiles.role` is removed and replaced by `profiles.active_role` —
  which workspace the user is currently looking at.
- `profile_roles` is a many-to-many catalogue of every role the user
  holds, with a per-role `role_data jsonb` blob for onboarding answers
  (worker profession, company industry, agency regions, customer city …).
- The five values are `worker | company | agency | customer | admin`.
- The existing RLS helpers (`profile_role()`, `is_employer()`,
  `is_admin()`) keep gating on `profiles.active_role`, so adding a role
  does **not** grant table access until the user actually switches into
  it — standard RBAC semantics, minimal RLS rewrite.

## Consequences
- Multi-role UX (`RoleSwitcher`, "Add role" flow) becomes possible.
- A switch is a single `profiles.active_role` update; the page reloads
  into the new workspace.
- The `customer` role joins the enum (ADR 0007) without breaking earlier
  RLS policies.
- Cross-role notifications can render a "Switch to {role} to view" CTA
  that calls the same switch action.
