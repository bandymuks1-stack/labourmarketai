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

## Proof the agent runs once the owner confirms (bounded, no real person)

- Sign up `e2e-confirm-delivery-<ts>@<an address the owner controls>`; the owner confirms receipt
  (one screenshot or a "received" reply). That single receipt closes G-1.
- Everything else in the chain is already proven with bounded identities and needs no re-run.

## Residue to clean (gate G-9)

`e2e-confirm-202609021242`, `e2e-confirm-verifyredir-202609021324`, `e2e-confirm-crossdevice-202609021324`
(all `@labourmarket.ai`, TEST identities, never metrics).
