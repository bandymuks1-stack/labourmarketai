# HUMAN GATE — worker registration friction removal + verified-email boundary v1

Migration: `supabase/migrations/20261003151000_email_verified_boundary_v1.sql` (RED: SECURITY DEFINER, GRANT, ALTER POLICY, in-place function patches)
Rollback:  `supabase/rollbacks/20261003151000_email_verified_boundary_v1.down.sql`
Proof:     `scripts/db-proof/email-verified-boundary-v1.sh` (throwaway local PostgreSQL 16, no Docker, no Supabase)
Guard:     `apps/web/lib/guards/email-verified-boundary.test.ts`, `apps/web/lib/auth/email-verification.test.ts`
E2E:       `apps/web/tests/e2e/worker-registration-friction.spec.ts` (NOT RUN — needs a stack with Confirm email OFF)
State:     `AWAITING_OWNER_APPLY` — nothing here has been applied, deployed or flipped.

## OWNER REQUIREMENT

For the launch stage a worker registers with the minimum (email + password) and
immediately has a usable session and onboarding, **without opening an email**.
Nothing — first login, profile, CV/profile enrichment, Work Journal, marketplace
participation, job/work interest, onboarding — may sit behind an email-confirmation
screen. Email verification stays available, is stored SEPARATELY, and is requested
progressively only for trust/security-sensitive actions. An unverified email is never
shown or treated as verified.

## WHY "Confirm email OFF" ALONE IS NOT SAFE

With `mailer_autoconfirm` GoTrue stamps `auth.users.email_confirmed_at` **at signup**
and issues a JWT whose `email` claim is whatever the registrant typed. Before this
migration the database treated that email as proof of mailbox ownership
(approved invariant #1338: identity authority must come from a verified session).
Flipping the setting alone would let anyone register with a victim's address and
claim the victim's pending invitations / memberships.

## THE DESIGN

Three states, never conflated: **registered** (session, address merely typed),
**verified** (a real proof of mailbox control exists FOR THAT ADDRESS), **token-proved**
(one action authorised by possession of a mailed one-time secret — no verification
state implied). Room for later trust levels: `email_verifications_v1.method` is a
closed set (`legacy_confirmed`, `legacy_autoconfirmed`, `social_provider`,
`mailbox_proof`) and the table is append-only evidence.

* `email_verifications_v1` — evidence, bound to the ADDRESS (a verified user who changes
  email is unverified for the new one). RLS on, every client privilege revoked.
* `email_verification_requests_v1` — one pending proof per profile.
* `email_verification_policy_v1` — the CUTOVER instant (set when the migration runs).
* Proof = `request_email_verification_v1()` (records the LIVE address) -> GoTrue mails a
  one-time link (`signInWithOtp`, `shouldCreateUser:false`, existing custom SMTP) ->
  the auth callback (`flow=verify_email`) calls `confirm_my_email_v1()`, which accepts
  only a session whose signed `amr` claim shows an `otp`/`magiclink` entry **newer than
  the request**, for an address that is still the live one. Password, autoconfirmed and
  social sessions fail by construction; "prove address A, then switch the account to
  victim V" is proven to fail.
* Cutover rule: confirmed accounts (`email_confirmed_at <= cutover`) and social identities
  existing at the cutover are backfilled verified; everything later is unverified until
  proved. After the cutover only `google` / `linkedin_oidc` with an explicit
  `email_verified=true` count, and only as the user's FIRST identity (a social identity
  *linked onto* an existing password identity proves nothing). Facebook asserts no
  verified flag of its own: never provider-verified after the cutover.

### Every email-trusting path found (live definitions pulled 2026-10-04) and how it is gated

| Path | Kind | Gate |
|---|---|---|
| `accept_invitation_by_id_v1`, `accept_invitation_by_id_v2` | email-asserted claim | `email_unverified` before any lookup |
| `accept_company_worker_invitation`, `accept_agency_worker_invitation` | email-asserted claim | `email_unverified` before any lookup |
| `accept_agency_client_connection_v1` | email-asserted claim | `email_unverified` (ownership check still first) |
| `decline_agency_client_connection_v1` | email-asserted state change | `email_unverified` |
| `list_invitations_for_me_v1` | email-asserted ENUMERATION (org, inviter, message) | `items: []` + `email_unverified: true` |
| RLS select: `company_worker_invitations`, `agency_worker_invitations`, `agency_client_connections` | email-asserted read | email branch `AND session_email_verified_v1()`; owner/admin branches untouched |
| `membership_invite_v1` | inviter resolves "the person behind this email" via `profiles.email` | resolver `profile_id_by_verified_email_v1` (null for unknown, unverified, AMBIGUOUS) |
| `assign_training_v1`, `create_performance_review_v1` (x2), `delegate_workflow_step_v1`, `create_management_decision_v1`, `update_management_decision_v1` | same resolver pattern | same resolver (in-place patch, fails closed on any shape drift) |
| `lmc_admin_grant_v1`, `lmc_grant_promotional_v1` | money-adjacent, keyed on `auth.users.email_confirmed_at` | `email_is_verified_v1(u.id, u.email)` (also stops signup-bonus farming with throwaway addresses) |
| `enforce_profile_email_binding` | binds `profiles.email` to the JWT email | UNCHANGED and now harmless: `profiles.email` is no longer authority anywhere; proven an unverified user cannot rebind to another address and a duplicate profile email cannot hijack resolution |
| `accept_invitation_v1/v2`, `accept_invitation_apply_v2`, `get_invitation_preview_v1/v2` | **token-proved** (sha256 token custody) | untouched; proven: valid token ALLOWED for an unverified user, expired/used/invalid DENIED |
| login, recovery, onboarding, profile, CV, journal | do not consult email | untouched; guard asserts the sign-in/up/reset forms never call the verification RPCs |

## REQUIRED ORDER

1. **Apply the migration** (owner channel, RED: Supabase MCP `apply_migration`, never `db push`).
   The backfill runs inside it and sets the cutover. Existing verified users lose nothing.
2. **Verify production reads** (queries A below). Nothing user-visible changed yet; "Confirm email" is still ON.
3. **Deploy app code** (fail-closed compatible: it treats a missing RPC as unverified / `needs-migration`,
   and works identically with Confirm email ON or OFF).
4. **Flip the Auth setting** (below). Do this **promptly after step 1** — a legitimate email
   confirmation between steps 1 and 4 is not backfilled (that person simply proves their address
   on first use of a gated action).
5. **Post-flip verification** (queries B below) and the two browser journeys
   (`worker-registration-friction.spec.ts`) against the flipped environment.

If step 1 is skipped or reordered, do **not** flip.

## THE EXACT PRODUCTION AUTH CHANGE (owner only; nothing here was done)

Project `gorgitwvdzxbnaxhrsrw` — Dashboard **Authentication → Sign In / Providers → Email**:

| Setting | Required value | Note |
|---|---|---|
| Enable Email provider | ON (unchanged) | |
| **Confirm email** (`mailer_autoconfirm`) | **OFF** | THE flip. Equivalent API: `PATCH /v1/projects/{ref}/config/auth` `{"mailer_autoconfirm": true}`. |
| Secure email change | leave ON | With autoconfirm an email change takes effect without confirming the new address; safe here **because verification is bound to the address** (proven). |
| Minimum password length / requirements | keep >= 8 | The app also enforces upper/number/special client-side. |

Also review (no change required for this slice, but each interacts with instant sessions):

* **Authentication → Rate Limits**: sign-ups / sign-ins per IP per hour and "emails sent per hour". Instant sessions
  remove the mail speed-bump, so bot signup volume is now bounded only by these. Mail is now used for recovery and
  the proof link only. Keep the per-address 60 s limit the UI mirrors (`RESEND_COOLDOWN_SECONDS`).
* **Attack Protection (CAPTCHA)**: recommended to enable (Turnstile/hCaptcha) given instant sessions. Requires a
  frontend integration that does not exist yet — **owner decision, out of this slice**.
* **URL Configuration**: the proof mail returns to `https://<site>/<locale>/auth/callback?flow=verify_email&next=...`
  — the existing redirect allow-list must match that URL **with a query string** (wildcard on the callback path).
* **Email templates → Magic Link**: the proof mail uses this template (`signInWithOtp`). Make its wording honest for
  both uses ("confirm this email address" / one-time link) — currently generic. Confirm-signup template stays for rollback.
* **Social providers** (Google, LinkedIn OIDC, Facebook: unchanged). Production identities today: google 19 (all
  `email_verified=true`), linkedin_oidc 2 (true), facebook 1 (true). Keep "manual linking" as is.
* **Password reset**: unchanged and works (`recovery` flow). A recovery link does NOT count as the verification proof
  (the person may press "Verify" afterwards).

## RESIDUAL RISKS (honest, owner awareness)

1. **Address squatting**: with autoconfirm a stranger can register `someone@x` before that person; the real person then
   gets "already registered" and must use password recovery. The squatter can never claim anything addressed to that
   mailbox (verified boundary), but the account name is taken. Mitigation: captcha / rate limits; recovery flow.
2. **Pre-hijack via social linking**: GoTrue may auto-link a later Google sign-in onto an existing password account of the
   same address. The attacker's password then still works on the victim's account. This migration prevents the *claim* of
   addressed resources through a linked identity (it is not the user's first identity, so it does not count as verified),
   but the account-takeover-by-linking shape itself is a Supabase Auth behaviour that this slice cannot change.
3. **Autoconfirm-era legacy accounts counted verified by the owner's cutover rule**: of the 72 users, 24 were created before
   2026-09-02 with `email_confirmed_at` within 10 s of creation and 18 of those have no social identity — they were
   autoconfirmed, not mailbox-proven. They are backfilled as `legacy_autoconfirmed` (verified, to keep access, per the
   approved rule) and are labelled so the owner can later demote them. Read-only count, 2026-10-04.
4. **6 existing accounts with `email_confirmed_at` NULL (0 signed in)**: GoTrue still refuses their password sign-in
   (`email_not_confirmed`) after the flip. They can use password recovery. No data touched here.
5. The dashboard roster card (`listMyPendingWorkerInvitations`) reads under the new RLS and therefore shows nothing to an
   unverified person; the **network page** shows the verification prompt. Chat / brief / today treat an unverified read as the
   honest "could not read", never "no invitations".

## VERIFICATION QUERIES (all read-only SELECT)

A. After the migration, BEFORE the flip:

```sql
-- every confirmed account is backfilled (expect 0)
select count(*) from auth.users u
 where u.email_confirmed_at is not null and u.email is not null
   and not exists (select 1 from public.email_verifications_v1 v
                    where v.profile_id = u.id and v.email = lower(trim(u.email)));
select method, count(*) from public.email_verifications_v1 group by 1 order by 1;
select cutover_at from public.email_verification_policy_v1;
-- the surface exists with the right ACLs
select p.proname, p.prosecdef,
       has_function_privilege('anon', p.oid, 'execute') anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') auth_exec
  from pg_proc p where p.pronamespace = 'public'::regnamespace
   and p.proname in ('email_is_verified_v1','session_email_verified_v1','profile_id_by_verified_email_v1',
                     'my_email_verification_v1','request_email_verification_v1','confirm_my_email_v1',
                     'backfill_verified_emails_v1');
-- expect: anon_exec false everywhere; auth_exec true ONLY for session_/my_/request_/confirm_
select policyname, qual from pg_policies
 where policyname in ('company_worker_invitations_select','agency_worker_invitations_select','agency_client_connections_select');
-- expect each qual to contain session_email_verified_v1
```

B. After the flip (`<flip_ts>` = the moment the setting was changed):

```sql
-- new autoconfirmed signups are NOT verified (expect gotrue_confirmed = true, verified_row = false)
select u.id, u.created_at, (u.email_confirmed_at is not null) gotrue_confirmed,
       exists (select 1 from public.email_verifications_v1 v where v.profile_id = u.id) verified_row
  from auth.users u where u.created_at > '<flip_ts>' order by u.created_at;
-- no legacy-labelled verification after the cutover (expect 0)
select count(*) from public.email_verifications_v1 v
 where v.method like 'legacy%' and v.verified_at > (select cutover_at from public.email_verification_policy_v1);
-- no invitation accepted since the flip by an account without a verification for that address (expect 0 rows)
select i.id from public.company_worker_invitations i
  join auth.users u on lower(u.email) = lower(i.invited_email)
 where i.status = 'accepted' and i.accepted_at > '<flip_ts>'
   and not exists (select 1 from public.email_verifications_v1 v where v.profile_id = u.id and v.email = lower(u.email))
   and not exists (select 1 from auth.identities s where s.user_id = u.id and s.provider in ('google','linkedin_oidc'));
-- proofs recorded (audit carries the method only, never the address)
select count(*) from public.audit_logs where action = 'email_verified' and created_at > '<flip_ts>';
```

## ROLLBACK OF THE CONFIG FLIP

1. Dashboard -> **Confirm email ON** again (`mailer_autoconfirm: false`). Accounts created while it was OFF keep working
   (GoTrue already stamped them confirmed) and stay UNVERIFIED in `email_verifications_v1`; nothing is lost.
2. The signup form's defensive `check_email` branch resumes automatically (it is the same code path).
3. Only if the database objects must go too: apply the rollback file. **Order matters — flip the setting back FIRST;
   rolling the migration back while autoconfirm is still ON re-opens the invitation-takeover.** The rollback keeps
   `mailbox_proof` evidence (it cannot be recomputed) and drops everything else.

## PROOF STATUS (honest)

| Item | Status |
|---|---|
| Real PostgreSQL proof (BEFORE defect reproduced -> AFTER fail-closed -> idempotent re-apply -> rollback -> re-apply) | see PR body for the run |
| Static guard + pure helper tests | see PR body |
| Positive + negative Playwright journeys | **NOT RUN / BLOCKED_PRODUCTION_APPLY** (need Confirm email OFF + migration; local stack qualifies) |
| Production migration apply | **BLOCKED_PRODUCTION_APPLY** (RED, owner channel) |
| Production Auth flip | **PRODUCTION_CONFIG_CHANGE_REQUIRED** (owner only) |
