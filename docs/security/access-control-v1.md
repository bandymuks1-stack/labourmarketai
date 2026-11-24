# LabourMarket.ai — Access control v1

> Draft for owner review — 2026-07-06. Source-grounded @ 7dcef6d.

## 1. Identity → roles → workspaces

- One account (`profiles`) can hold several roles (`profile_roles`);
  `profiles.active_role` names the CURRENT workspace (worker / company /
  agency / customer). Switching workspaces changes what you see and can do —
  it is a scope change, not a privilege escalation (benefit: one login,
  clearly separated worlds).
- Role gates run server-side per request (`lib/auth/require-role.ts`).
  Since audit PR4, a cross-role link lands on the dashboard with an honest
  `?notice=needs_<role>_role` banner instead of a silent bounce.

## 2. Enforcement points (verified)

| Layer | Mechanism | Pinned by |
|---|---|---|
| Database | RLS on every user table; `auth.uid()` scoping; text+CHECK statuses | migration tests in `lib/guards/*-migration*.test.ts` |
| RPCs | SECURITY DEFINER functions with explicit `search_path`, `revoke all from public`, `grant execute to authenticated` | `pin-function-search-path` migration + per-RPC guards |
| Server actions | identity re-derived per call (`getOwnCompany()`, journal profile-keying) | `workspace-scope-isolation.test.ts` |
| Admin | dual-signal `is_admin()`; admin UI gated + no admin tab in bottom nav | `admin-grant-guard-migration`, `no-duplicate-top-level-entries` guards |
| Superadmin | separate `superadmin.ts` gate for preview chrome (visual-os) | `superadmin.test.ts`, `preview-surfaces-unlinked` |

## 3. Known model tension (owner decision §17.7, unresolved)

Gates check role POSSESSION while the header shows the ACTIVE workspace —
a user holding a company role can act as the company while the header says
"Personal space" (audit §9 #9). Options: make active workspace the gate
(switch prompt on entry) or keep held-role access with a corrected label.
Until decided, no copy should promise "you are acting as X" harder than the
code enforces it.

## 4. Visibility controls

8-level worker profile visibility is stored AND really enforced for
scouting/conversations (`lib/visibility/worker-profile-visibility.ts`), but
no surface explains "who can see me" yet (audit §4 #14). The map renders
only the user's own localStorage pin — there is no cross-user map read;
copy must keep saying so until one ships.

## 5. Per-role responsibility (benefit framing)

- **Worker**: your journal and profile stay yours; visibility levels decide
  who finds you — protecting your reach AND your privacy.
- **Company/agency owner**: team invitations and review rights affect other
  people's records; keeping membership current protects your workers' trust
  in confirmations.
- **Admin**: admin reads are for operations, never routine content reading
  (risk policy: journal content read only on report/incident).
