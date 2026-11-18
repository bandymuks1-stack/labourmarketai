# Frictionless addressed-invite cutover v1

Owner decision 2026-10-06. **Status: PREPARED, NOT EXECUTED.** Nothing here is approved to run: every step needs the owner-gated production execution approval (per-migration approval for the three RED migrations, then the deploy, then the Auth change).

## Target
invite click -> minimal signup (password only) -> immediately signed in on the profile step; the invitation is accepted by the canonical path; no mailbox round-trip, no OTP, no second LabourMarket e-mail, no role picker for a worker-implying invitation, no second accept tap.

## Security invariant (unchanged, canonical mechanism = `20261003151100`)
The invitation's `invited_email` must equal the session's e-mail before it can be accepted (`email_mismatch` otherwise). Removing e-mail confirmation is only safe once this binding is live - hence the order below.

## Sequence (do not reorder; steps 1-3 are DB-only and individually transactional)
| # | Step | Why here | Check before moving on |
|---|---|---|---|
| P0 | Read-only preflight: ledger `max(version)=20261003144407`; the eight `151000` patch preconditions; the six `151100` bodies; `get_invitation_signup_context_v1` absent; PITR window confirmed; snapshot of Auth settings (`GET /auth/v1/settings`: `mailer_autoconfirm=false`) | no surprises | all as expected |
| 1 | `20261003151000_email_verified_boundary_v1` | verified-e-mail boundary + backfill; **starts the R-1 window** (`cutover_at` = transaction start: accounts confirming mail after this and before step 5 are not backfilled and meet `email_unverified` on by-id accept / list / agency claims / LMC grants until they run the proof flow) | per-step post-check in `docs/human-gates/worker-registration-friction-gate.md` |
| 2 | `20261003151100_staff_invitation_email_binding_v1` | **the email binding** | six bodies `already_gated=true`; helpers not executable by anon/authenticated |
| 3 | `20261006100500_invitation_signup_context_v1` | service-only read of the invited address for the signup page | `has_function_privilege('anon'|'authenticated', ..., 'execute')` false, `service_role` true |
| 4 | Deploy the application (integration tip + this PR) | `email_mismatch` UI, signup prefill + auto-accept, onboarding role skip | smoke: invite landing 200; signup with `?next=` of a real addressed link shows the locked address; a mismatching session sees the masked hint |
| 5 | **Supabase Auth: Confirm email OFF** (owner act) + the settings in `docs/human-gates/worker-registration-friction-gate.md` ("THE EXACT PRODUCTION AUTH CHANGE": redirect allow-list for `/auth/callback?flow=verify_email`, Magic Link template wording, rate limits / CAPTCHA decision) | only now, with the binding live and the app deployed | `GET /auth/v1/settings` -> `mailer_autoconfirm: true` |
| 6 | Production read-back with the real invitee (or an owner-controlled addressed invite): password only -> profile step; invitation `accepted`, `use_count=1`; consent rows 0; not visible to an employer until the person grants `profile_discoverability` | proof | `FRICTIONLESS_INVITE_REGISTRATION_PROVEN` only after this |

Keep steps 1 -> 5 inside one maintenance sitting (target < 30 min) to keep the R-1 window short. Steps 4 and 5 are not atomic with the DB steps; the order is the safety, not a transaction.

## Compatibility (why the order tolerates a pause between any two steps)
- **New app + old DB:** signup finds no `get_invitation_signup_context_v1` -> no prefill (the old form); with Confirm ON the "check your email" branch is unchanged; `email_mismatch` simply never occurs.
- **Old app + new DB (after 1-3):** security is correct; the old app has no UI for `email_mismatch` / `email_unverified` (generic failure). Hence the deploy (4) before the flip (5).
- **Never flip (5) before (2):** with Confirm OFF and no binding, anyone with a forwarded link could register any address and accept.

## Rollback (reverse order; each step independent)
1. **Confirm email back ON** (instant; stops new unverified accounts). Accounts created while OFF stay valid; they carry no mailbox proof.
2. **Redeploy the previous application** (the new signup code also works with Confirm ON: it falls back to "check your email").
3. `20261006100500` down (drops the read; the form then shows no prefill).
4. `20261003151100` down (restores the 2026-10-04 bodies; run **after** `151500`'s rollback if that was applied).
5. `20261003151000` down - **only after Confirm email is ON again**; refuses while any `mailbox_proof` rows exist; overwrites later hot-fixes with its 2026-10-04 snapshots.
Data recovery: no data is destroyed by 1-3; the backfill rows in `email_verifications_v1` are append-only evidence (dropped by the down only when no mailbox proof exists).

## Residual risk accepted by the design (R-2)
After the flip a holder of a forwarded link can register the invitee's address (unverified) and pass the e-mail match. The prefilled address is shown to whoever holds a usable addressed link (they already hold the capability the invitee was sent); a mismatching session still sees only a masked hint. Social sign-in (Google/Facebook/LinkedIn) is also bound by the same server-side check but has one extra accept tap, because the OAuth return goes through the invitation landing page.
