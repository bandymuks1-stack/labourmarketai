# Gate G-1 — production transactional e-mail delivery (EXTERNAL_GATE)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train A slice 1).
**Register row:** [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3 G-1.
**Class:** EXTERNAL_GATE — Supabase dashboard credentials/config; no code can close it.

## What is already true (verified live, do not repeat)

| Fact | Evidence |
|---|---|
| "Confirm email" is ON in production | `/auth/v1/settings` → `mailer_autoconfirm=false` (2026-09-02 12:41 UTC) |
| Signup returns no session; login is refused until confirmed | bounded identity 12:42 UTC: signup 200 no session, `confirmation_sent_at` set, password login `400 email_not_confirmed` |
| GoTrue accepts the mail for sending | auth log `user_confirmation_requested`, no mailer error in the window |
| The default e-mail link confirms the address server-side and returns to OUR callback with `next` intact | bounded PKCE identity 13:24 UTC: `GET /verify` → `303 https://labourmarket.ai/lt/auth/callback?code=…&flow=email_confirm&next=%2Flt%2Foauth%2Fconsent%3F…`; `email_confirmed_at` set although the code was never exchanged |
| A token hash verifies on a device with NO PKCE verifier; replay and garbage fail | `POST /verify {type:signup, token_hash}` → 200 + session; second call → `403 otp_expired`; garbage → `403 otp_expired` |

Code side (Train A slice 1): the callback verifies `token_hash` links itself, classifies GoTrue's
`access_denied + otp_expired` as a dead link (not a cancel), turns a cross-device PKCE failure on the
e-mail flow into "your address is confirmed — sign in here", and both forms offer a server-throttled
resend. The pending destination (`next`, e.g. an assistant's `/oauth/consent?authorization_id=…`)
rides inside `emailRedirectTo` and is sanitised on return by `getSafeReturnPath`.

## What is NOT proven, and why it needs the owner

Whether the confirmation mail **reaches a real inbox**. Supabase's built-in mailer is meant for
development: it is rate-limited (a handful of messages per hour) and sends only to addresses
belonging to members of the Supabase organisation. Neither the repo nor the agent can read the
project's SMTP configuration. Until a real, unfamiliar address receives the mail, **no unfamiliar
person can complete registration**, so registration cannot be LAUNCH_READY.

## Owner action (exact)

1. Supabase dashboard → project `labourmarket.ai` (`gorgitwvdzxbnaxhrsrw`) → **Authentication → Emails → SMTP Settings** → *Enable Custom SMTP*.
   Use a transactional provider (e.g. Resend, Postmark, SES, Brevo). Sender: a verified `@labourmarket.ai`
   address (SPF/DKIM/DMARC on the domain — the provider's dashboard shows the DNS records).
   Costs money only above the provider's free tier; reversible (toggle off).
2. Same section → **Email Templates → Confirm signup**. Recommended body link (works on any device;
   the callback verifies the token itself):

   ```html
   <a href="{{ .SiteURL }}/lt/auth/callback?token_hash={{ .TokenHash }}&type=signup&rt={{ .RedirectTo }}">Confirm your email</a>
   ```

   `rt` carries the signup's own return target (locale + `next`); the callback lifts both from it
   only when it is a same-origin URL. Leaving the default `{{ .ConfirmationURL }}` also works —
   the link then goes through GoTrue and returns with a PKCE code; a person who opens it on
   another device sees "confirmed, sign in here" rather than a failure.
   Apply the same shape to **Magic Link** / **Reset password** (`type=magiclink` / `type=recovery`)
   if those templates are edited; the callback's allowlist covers them.
3. Authentication → **URL Configuration**: Site URL `https://labourmarket.ai`; redirect allow-list
   must keep `https://labourmarket.ai/**` (a callback WITH a query string was accepted on 2026-09-02, so this is already the case).
4. Optional but recommended: Authentication → Rate Limits → raise "emails per hour" above the
   built-in default once custom SMTP is on.

## Smallest owner procedure (2026-09-02 consolidation — decisions already made from evidence)

**Architecture (decided):** two senders, one domain. (1) Supabase Auth mail (confirmation, magic link,
password reset) goes through **custom SMTP** on the Supabase project. (2) Product mail (invitations,
notifications) goes through the app's own transactional adapter `lib/email/transactional.ts`, which already
supports **Resend or Postmark** via three Vercel env vars. Use the SAME provider and the SAME verified
domain for both, so one DNS setup covers everything.

**Provider (recommended): Resend** — EU data region available, DKIM/SPF via three DNS records, SMTP relay
included, free tier well above launch volume, API key doubles as the SMTP password. Postmark is the
equal-quality alternative if the owner already has an account; nothing else changes.

### Step 1 — domain + DNS (provider dashboard → Domains → add `labourmarket.ai`, region EU)
Add the records the provider shows (typical set):

| Type | Host | Purpose |
|---|---|---|
| TXT | `resend._domainkey` (or provider-named) | DKIM signing |
| TXT/MX | `send` (return-path subdomain) | SPF for the bounce address |
| TXT | `_dmarc` → `v=DMARC1; p=none; rua=mailto:postmaster@labourmarket.ai` | DMARC (start with `p=none`, move to `quarantine` after a clean week) |

Wait for the provider to show **Verified** (minutes to an hour). Sender address: `noreply@labourmarket.ai`
(auth) and `invites@labourmarket.ai` (product). No mailbox is needed for either.

### Step 2 — Supabase Auth SMTP (exact fields)
Dashboard → project `gorgitwvdzxbnaxhrsrw` → **Authentication → Emails → SMTP Settings → Enable Custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `noreply@labourmarket.ai` |
| Sender name | `LabourMarket.ai` |
| Host | `smtp.resend.com` (Postmark: `smtp.postmarkapp.com`) |
| Port | `465` (Resend, implicit TLS) — `587` also works |
| Username | `resend` (Postmark: the Server API token) |
| Password | the provider API key (Postmark: the same Server API token) |
| Minimum interval between emails | keep the default |

Then **Authentication → Rate Limits → Emails per hour**: raise from the built-in default (2–4) to at least
`100`. **Authentication → Email → OTP expiry**: `86400` (24 h) so a confirmation opened the next morning still
works (default 3600 s).

### Step 3 — templates (Authentication → Emails → Templates)
*Confirm signup* body link (recommended; the callback verifies the token on any device):

```html
<a href="{{ .SiteURL }}/lt/auth/callback?token_hash={{ .TokenHash }}&type=signup&rt={{ .RedirectTo }}">Patvirtinti el. paštą / Confirm your email</a>
```

*Magic Link*: same shape with `type=magiclink`; *Reset password*: `type=recovery`. Leaving the defaults also
works (the callback handles the PKCE `?code=` path and tells a cross-device user "confirmed — sign in here").

### Step 4 — product mail (Vercel → Project → Settings → Environment Variables, Production)
`INVITE_EMAIL_PROVIDER=resend` · `INVITE_EMAIL_API_KEY=<the same API key>` ·
`INVITE_EMAIL_FROM=LabourMarket.ai <invites@labourmarket.ai>` → redeploy. Until these exist the invitation
UI honestly shows "El. laiškų siuntimas dar neaktyvuotas" with a copyable link (proven 2026-09-02).

### Step 5 — proof (the owner does 1 minute; the agent does the rest)
1. **Real inbox:** the owner registers `<any real address the owner controls>` at `https://labourmarket.ai/lt/signup`,
   opens the mail on a **phone** (a different device than the signup), taps the link → lands signed in on
   the dashboard. One screenshot of the inbox + one of the dashboard = G-1 closed.
2. **Expiry:** agent sets OTP expiry to `60` s (owner grants a 5-minute window or does it), signs up a bounded
   `e2e-*@labourmarket.ai` identity, waits 90 s, opens the link → the login page shows the *link expired*
   state with the resend control; restores `86400`.
3. **Resend:** on that same page, resend → the OLD link now answers `otp_expired` (token rotated, proven
   2026-09-02) and the NEW link confirms. Cooldown 60 s is enforced server-side.
4. **Failure:** with SMTP credentials wrong, GoTrue logs `mailer error` and the signup still returns 200
   without a session (the app never claims delivery) — agent verifies once by reading auth logs.

Cost: €0 at launch volume (Resend free tier 3,000/month; Postmark 100/month free then ~€13). Reversible:
disable custom SMTP → built-in mailer again; DNS records are harmless if left.

## Proof the agent runs once the owner confirms (bounded, no real person)

- Sign up `e2e-confirm-delivery-<ts>@<an address the owner controls>`; the owner confirms receipt
  (one screenshot or a "received" reply). That single receipt closes G-1.
- Everything else in the chain is already proven with bounded identities and needs no re-run.

## Residue to clean (gate G-9)

`e2e-confirm-202609021242`, `e2e-confirm-verifyredir-202609021324`, `e2e-confirm-crossdevice-202609021324`
(all `@labourmarket.ai`, TEST identities, never metrics).
