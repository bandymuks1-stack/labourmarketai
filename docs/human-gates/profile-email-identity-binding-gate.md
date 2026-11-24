# HUMAN GATE — profile email identity binding v1

Migration: `supabase/migrations/20260829120000_profile_email_identity_binding_v1.sql`
Rollback:  `supabase/rollbacks/20260829120000_profile_email_identity_binding_v1.down.sql`
Proof:     `scripts/db-proof/profile-email-identity-binding.sh` (local stack, rolled back)
Guard:     `apps/web/lib/guards/profile-email-identity-binding.test.ts`
PR:        #1338

## OWNER DECISION — GIVEN 2026-08-29

> "#1338 — APPROVED.
>
> Approved security invariant: A user-editable profile attribute must never
> be authoritative identity for organization membership or another
> actor-sensitive authorization decision. Identity authority must come from a
> verified session/credential/authentication authority.
>
> Preserve: invitations to already registered users; invitations to
> not-yet-registered users; eventual claim by the authenticated owner of the
> invited email; pending/unclaimed identity compatibility; future human and
> AI actor architecture. Do not turn `profiles.email` into a new independent
> identity system.
>
> APPROVAL DOES NOT AUTHORIZE CAPABILITY REDUCTION. … UNDERSTAND → PROTECT →
> EXTEND → INTEGRATE → VERIFY. NEVER IMPROVE BY SHRINKING THE PRODUCT."

State: `APPROVED_APPLY_GRANTED`

## How the migration satisfies each condition

| Owner condition | Where it holds |
|---|---|
| Identity authority = verified session | Layer 1: the BEFORE trigger admits a `profiles.email` write by a JWT-bearing non-admin only when it equals `auth.jwt() ->> 'email'`. Layer 2: both legacy accept RPCs and both invitee-side SELECT policies read `auth.jwt() ->> 'email'`, the model the canonical `invitations` family already uses. |
| Invitations to registered users | `membership_invite_v1` unchanged (resolves a registered profile by email — now trustworthy because layer 1 holds). Proven: owner invites victim → `invited`, bound to VICTIM. |
| Invitations to not-yet-registered users | `company_worker_invitations` / `agency_worker_invitations` keep storing `invited_email` with no profile binding at invite time. Proven: the future user registers later → `linked`. |
| Eventual claim by the authenticated owner | Acceptance binds by the accepting session's verified email. Proven: victim `linked`; attacker `no_invitation`, 0 rows visible. |
| Pending/unclaimed identity compatibility | No new identity table, no UNIQUE on `profiles.email`, no binding created before acceptance; `invited_email` remains a plain address that a future pending-actor model can point at. |
| Future human and AI actor architecture | The trigger keys on the session's claim, not on a table; an AI actor with its own credential would carry its own claim. Nothing in the change assumes `auth.users` is the only principal. |
| `profiles.email` not a new identity system | The column becomes a mirror the user cannot rebind; nothing new reads it as authority — the two accept paths stop reading it at all. |
| No capability reduction | Own-address writes still allowed (proven, case-only change + locale); every outcome code of the accept RPCs preserved; no UI, grant on a table, or policy arm other than the invitee arm changed. |

## The defect (production, 2026-08-29)

`profiles.email` was UPDATE-able by its owner through PostgREST (0004 table-level
grant, own-row policy, 0 unique, 0 triggers). `membership_invite_v1` resolved the
invitee by `profiles.email … limit 1`; `accept_company_worker_invitation` /
`accept_agency_worker_invitation` (0036) read the CALLER's identity from
`profiles.email`; `company_worker_invitations_select` /
`agency_worker_invitations_select` keyed on it. Reproduced on the local stack:
attacker rewrites their email → accepts the victim's invitation (`linked`) → the
victim gets `no_invitation`. Production at approval time: 36 profiles, 36
distinct emails, 0 rows diverging from `auth.users.email`, 1 pending company
invitation, 0 pending agency invitations, 0 invited memberships.

## What the marker covers, and nothing else

`migration-safety.mjs` findings on this file: `create-trigger`,
`security-definer-function`, `grant-or-revoke`, `alter-drop-policy`,
`data-dml` (the UPDATE inside the accept bodies, unchanged from 0036). No drop,
no grant on any table, no auth-schema object.

## Apply procedure

Supabase MCP `apply_migration` only, executable SQL transmitted without the
comment header (the marker is read from the repo file by CI, never from the
database), after the PR is merged with `quality` + `migration-safety` green.
Pre-apply: the migration's own integrity assertion refuses if any
`profiles.email` diverges from `auth.users.email`.

## Post-apply verification (required by the owner)

Inside ONE transaction that is ROLLED BACK, using a real non-admin profile:

1. trigger `trg_profiles_email_binding` exists on `public.profiles`;
2. attacker-style mismatched own-email UPDATE as that profile → `42501`;
3. the same profile writing its own authenticated address → allowed;
4. a synthetic pending invitation addressed to that profile's email, accepted
   through `accept_company_worker_invitation` → `linked` (rolled back);
5. grants read back by `has_function_privilege` (anon false, authenticated
   true, definer true) and the two policies' predicates no longer mention
   `profiles`.

Results are recorded in `docs/APPLIED_LEDGER.md` next to the apply row.

## Rollback readiness

`supabase/rollbacks/20260829120000_profile_email_identity_binding_v1.down.sql`
drops the trigger + function and restores the 0036 accept bodies and the
0027/0025 policies verbatim. It REOPENS the defect and says so in its header;
run it only to restore the exact pre-migration state, then re-apply.
