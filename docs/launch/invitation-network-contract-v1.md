# Invitation & network contract v1 (core-network area B)

## Product principle

"Pakviesti" is ONE canonical action. Pressing "Siųsti kvietimą" either
really sends an email (provider-acknowledged) or hands the inviter a
secure shareable link — never a fake "Išsiųsta".

## Canonical model

`public.invitations` (migration `20260712200000_canonical_invitations_v1`,
DRAFT / needs-human-gate — **NOT applied**; rollback paired):

- 7 types: `join_platform`, `join_organization`, `join_team`,
  `join_as_employee`, `collaborate_partner`, `join_project`,
  `invite_company`. Org types require `organization_id`; `join_project`
  requires `project_id` (CHECK-enforced).
- Lifecycle `status`: pending → accepted | declined | expired | revoked.
  Delivery is SEPARATE truth: `delivery_status` not_sent | sent |
  delivery_failed — `sent` is written only after a real provider 2xx.
- Acceptance creates the CANONICAL relationship, never a legacy link:
  - join_organization / join_team / join_as_employee → active `employee`
    engagement in `engagement_contexts` (same insert shape + hash as
    `add_org_member`);
  - collaborate_partner → active `collaboration` engagement;
  - join_project → `project_worker_assignments` row (reactivates an ended
    one instead of duplicating; `no_worker_profile` returned WITHOUT
    consuming the token when the caller has no worker profile);
  - join_platform / invite_company → the account itself is the outcome.
- Legacy `company_workers` / `agency_workers` invitation flows remain
  untouched (their UI copy was de-jargonised in area E); they are now the
  LEGACY path and the canonical model is the product flow.

## Token security

- Raw token: 32 random bytes, base64url, minted per address in the server
  action; exists only in the email/link and (once) in the inviter's UI.
- DB stores ONLY `sha256(token)` (64-hex, unique, CHECK-enforced).
- Single-use accept under `FOR UPDATE`; expiry (default 14 days) enforced
  server-side and lazily stamped; revoked/declined/expired tokens are dead.
- Resend ROTATES the token — the old link stops working; ≤10 resends.
- Caps: ≤100 open invitations per inviter; ≤30 created per 24 h; one live
  invitation per (inviter, email, type, context).
- No email enumeration: nothing reveals whether an address has an account;
  the in-app accept path (`accept_invitation_by_id_v1`) matches ONLY the
  caller's own JWT email and answers `not_found` otherwise;
  `list_invitations_for_me_v1` lists only the caller's own-email pending
  invitations.
- RLS: SELECT inviter-or-admin; NO insert/update/delete policies — all
  writes through SECURITY DEFINER RPCs (pinned `search_path`,
  authenticated-only grants, `audit_logs` row per state change).

## Email delivery (owner gate — NOT activated)

`apps/web/lib/email/transactional.ts`: provider-neutral (resend/postmark
over plain HTTPS, no SDK), 10 s timeout, `sent` only on 2xx, provider
names never in the UI. Activation requires the owner to: pick the
provider, create the API key, verify the sending domain (SPF + DKIM), set
`INVITE_EMAIL_PROVIDER` / `INVITE_EMAIL_API_KEY` / `INVITE_EMAIL_FROM`
(server env only), and approve one reviewed test send. Until then the UI
runs in link mode and says so.

## Surfaces

- `/dashboard/network` — "Mano tinklas" sub-surface (module registry grid
  card + command finder + smoke inventory; never a second dashboard):
  incoming invitations (accept in-app), people & company search, the
  canonical InvitePanel, sent-invitation lifecycle (resend / revoke /
  copy new link / native share), my organizations, my relationships.
- `/[locale]/invite/[token]` — landing page; unauthenticated → login with
  `?next` back to itself; acceptance lands in the exact context
  (project page / dashboard); failures land back with honest `?notice=`.
- Entry points: company workspace and project operations link the ONE
  invite surface with type/org/project preselected; people & company
  search and MyZone reach it via the network module.
- Deep-link continuity: `completeOnboarding` now honours a safe `?next`,
  so an invited NEW user returns to the invitation after registration.

## Privacy in search

Workers read runs under the fail-closed `can_view_worker` RLS (consented
discoverability or a real work relationship). The search layer selects no
email, phone, or location coordinates (guard-pinned); person contact goes
through the existing permission-gated message flow.

## Test/guard coverage

`apps/web/lib/guards/invitations-network.test.ts` (34 pins): migration
shape + token custody + canonical acceptance + caps + enumeration + RLS +
adapter truthfulness + registry/search privacy + deep-link continuity +
env gate. Unit coverage for multi-email parsing (valid/invalid/overflow,
one bad address never cancels the batch) and destinations.

## Owner gates outstanding

1. Apply `20260712200000_canonical_invitations_v1` via Supabase MCP
   (`apply_migration`) after reviewing this contract + the migration.
2. Configure the email provider env (above) and approve one test send.
Until both: invitations UI shows the honest not-enabled state; nothing
pretends to work.
