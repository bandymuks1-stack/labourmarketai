# G-1 evidence — production SMTP state (owner-verified 2026-09-02, evening)

| Item | State | Source |
|---|---|---|
| Supabase Custom SMTP | ENABLED: smtp.resend.com, port 465, sender noreply@labourmarket.ai, name LabourMarket.ai | owner (Supabase Auth SMTP page) |
| Resend team | bandymuks1 owns the verified domain labourmarket.ai | owner (Resend dashboard) |
| Resend DNS | live: resend._domainkey DKIM; send.labourmarket.ai SPF include:amazonses.com + MX feedback-smtp.eu-west-1.amazonses.com | public DNS via 1.1.1.1 |
| Mailbox DNS (untouched) | root MX mx1/mx2.hostinger.com; root SPF include:_spf.mail.hostinger.com; _dmarc p=none | public DNS |
| Abandoned claim | root TXT resend-domain-verification=25db0ea7… appeared between the two DNS reads of the day; not used by the verified team; optional removal of that one record only | public DNS, two reads |
| Auth sends today | 12 user_confirmation_requested audit events (12:42 → 16:34 UTC); zero mailer / smtp / rate-limit log lines | Supabase logs |
| Resend outcomes | SMTP_ACCEPTED for all; BOUNCED for the e2e-* fake mailboxes; one SUPPRESSED; DELIVERED none yet (no real mailbox addressed) | owner (Resend dashboard) |
| Template | default ConfirmationURL: GET /verify confirms server-side, 303 to /lt/auth/callback?code=…&flow=email_confirm&next=… | A1 proof 13:24 UTC |
| Time expiry | token issued 12:42 UTC, verified ~18:30 UTC with no new mail → 403 otp_expired | this session |
| Replay / garbage / resend rotation / cross-device / next carry / open-redirect / cross-user | proven in A1 and cases 6-7 | a1-email-confirmation-prod-proof, a-identity-cases-6-7 |

Classification: transport EXISTS and is production-correct; application failures NONE; the only unproven
step is delivery to a REAL external inbox, reduced to one owner acceptance test (gate pack).
