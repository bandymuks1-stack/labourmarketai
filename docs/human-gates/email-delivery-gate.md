# Gate G-1 — production transactional e-mail delivery (EXTERNAL_GATE: one real-inbox test)

**Opened:** 2026-09-02 (FINAL COMPLETION, Train A slice 1).
**Corrected:** 2026-09-02, evening — owner-verified production evidence replaced the earlier inference.
**Register row:** [`docs/launch/FINAL_COMPLETION_REGISTER.md`](../launch/FINAL_COMPLETION_REGISTER.md) §3 G-1.

## Actual state (owner-verified 2026-09-02) — SMTP transport EXISTS, keep it

| Fact | Evidence |
|---|---|
| Supabase Custom SMTP is **enabled**: host `smtp.resend.com`, port `465`, sender `noreply@labourmarket.ai`, name `LabourMarket.ai` | owner read the Supabase Auth SMTP page |
| The Resend team **`bandymuks1`** owns the verified domain `labourmarket.ai` | owner regained access to the team; the dashboard lists the domain as verified |
| Resend DNS is live and must stay: `resend._domainkey` DKIM TXT, `send.labourmarket.ai` SPF `include:amazonses.com` + MX `feedback-smtp.eu-west-1.amazonses.com` | public DNS (Cloudflare NS), read 2026-09-02 |
| Mailbox mail is separate and untouched: root MX `mx1/mx2.hostinger.com`, root SPF `include:_spf.mail.hostinger.com`, `_dmarc` `p=none` | public DNS |
| Production Auth mail flows through it TODAY: the Resend dashboard shows the confirmation mails ("Patvirtinkite registraciją / Confirm …") for the bounded `e2e-*` identities created by this window's proofs | owner observation |
| Their status is **BOUNCED** (and one **SUPPRESSED**) because `e2e-*@labourmarket.ai` are not mailboxes — an expected recipient-side outcome, **not** an SMTP or application failure | owner observation + the identities' nature |
| Server side agrees: 12 `user_confirmation_requested` audit events today, **zero** mailer / SMTP / rate-limit errors in the auth logs | Supabase logs, read 2026-09-02 |

Evidence classes, for the record: SMTP_ACCEPTED = every Auth send today (Resend received them); DELIVERED =
none yet, because no real mailbox has been addressed; BOUNCED = the fake `e2e-*` recipients; SUPPRESSED = one
`e2e-*` recipient Resend stopped retrying; application/auth failures = **none**.

**Owner decision (binding):** keep team `bandymuks1`. Do NOT transfer the domain to the newly created team, do
not delete the domain, do not rotate the working SMTP credentials, do not touch the Hostinger MX or the Resend
DKIM/SPF/MX records.

### Bounded DNS cleanup (the abandoned claim)

During the investigation a root TXT record `resend-domain-verification=25db0ea7…` appeared on `labourmarket.ai`
(absent in the first DNS read of the day, present in the second). That record is the **new** team's
ownership-claim token: the original team was verified before it existed and stays verified through DKIM/SPF/MX,
which never use it. Safe removal, when the owner wants it: Cloudflare → DNS → records → delete **only** the TXT
at name `labourmarket.ai` whose content starts with `resend-domain-verification=`. Leave every other TXT (the
`v=spf1 … hostinger` root record, `_dmarc`, `resend._domainkey`, `send`) untouched. Reversible (re-add the
value). Not part of the canonical mail configuration; optional.

## What Train A already proved on production (do not repeat)

| Fact | Evidence |
|---|---|
| Confirm e-mail is ON (`mailer_autoconfirm=false`); signup returns NO session; login before confirmation is refused (`email_not_confirmed`) | A1 proof, 12:42 UTC |
| The confirmation URL is the default `{{ .ConfirmationURL }}`: `GET /verify` confirms server-side and 303s to OUR callback with `?code=…&flow=email_confirm&next=…` | A1 proof, 13:24 UTC — the template is production-correct |
| Same-device open: `?code=` exchanged → session, `next` restored (safe-return-path sanitised; no open redirect) | A1 + callback tests |
| Other device / browser (no PKCE verifier): the callback shows "your address is confirmed — sign in here" and the password login works | A1 crossdevice identity |
| `token_hash` links verify on any device; **replay** → `otp_expired`; **garbage** → `otp_expired`; `access_denied+otp_expired` classified as *link expired*, not *cancelled* | A1, `email-confirm.ts` + tests |
| **Time expiry**: a real unconfirmed token issued 12:42 UTC, verified again at ~18:30 UTC (5 h 44 min later, no new mail) → rejected as expired (see the run recorded in the register change log) | this correction, zero new sends |
| **Resend** rotates the token (old hash dead, new one live); server cooldown 60 s; both forms offer it | A1 |
| Pending OAuth authorization (`next=/oauth/consent?authorization_id=…`) survives the round trip; expired authorizations refused after 10 min; consent Deny returns `access_denied` | A cases 6/7 |
| No cross-user resume: `next` is a path only; the session is the confirming user's | callback tests |

Everything above ran against the bounded identities; **no further `e2e-*` mail is to be generated** for SMTP
proof — each send only adds a meaningless bounce.

### Suppression check (before the real test)

Resend's suppression list holds addresses that hard-bounced or complained. The bounced `e2e-*` recipients live
there; a real address is affected only if it bounced or complained before. Owner: in Resend → Suppressions,
confirm the entries are `e2e-*@labourmarket.ai` only and use an address that has never been registered.

## The one real-inbox test (the only remaining proof)

1. On a **phone**, open a **private / incognito** browser (no existing labourmarket.ai session).
2. Go to `https://labourmarket.ai/lt/signup`.
3. Register with **e-mail + password** (not Google), using ONE real external address that has never been
   registered on labourmarket.ai and is not on the Resend suppression list. Any name.
4. Expected screen: "check your e-mail" state with the **resend** control (no dashboard yet).
5. Open the inbox on the same phone; the mail is from `LabourMarket.ai <noreply@labourmarket.ai>`, subject
   "Patvirtinkite registraciją / Confirm …". Tap the link.
6. Expected result: you land signed in on onboarding / the dashboard (same device = `?code=` path). If you open
   it on a different device instead, the expected result is "address confirmed — sign in here", then login works.
7. Do NOT: paste the link anywhere, forward the mail, use an address that was ever registered, register with
   Google, or repeat the signup with the same address (a second attempt hits the 60 s resend cooldown and
   rotates the token).
8. Report back: (a) that the mail arrived and roughly how long it took, (b) which screen you landed on after the
   link — two phone screenshots are enough. Never send the link, the token, or the password.

**After the report:** the agent reads the Resend event (delivered / opened) and the auth audit events
(`user_confirmation_requested` → `user_signedup` → `login`) for that identity, closes G-1, and marks Train A
complete. The account can stay (it is a real person's) or be deleted on request.

## Residue to clean (gate G-9)

The bounded `e2e-*@labourmarket.ai` identities (15 rows today), their bounced Resend events and suppression
entries — hygiene only.
