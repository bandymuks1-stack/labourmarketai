# LabourMarket.ai — Authentication & MFA v1 (benefit-based model)

> Draft for owner review — 2026-07-06. Source-grounded @ 7dcef6d.

## 1. Authentication today (verified)

| Method | Code path | Notes |
|---|---|---|
| Email + password | `components/app/login-form.tsx` → `signInWithPassword` | Magic link was removed in the M1 auth refactor (comment pinned in the form) |
| Google OAuth | `components/app/google-button.tsx` → `signInWithOAuth` (PKCE) | callback at `auth/callback`; branding runbook exists (`GOOGLE_OAUTH_BRANDING_RUNBOOK.md`) |
| Recovery | `forgot-password` → `resetPasswordForEmail` → `reset-password` | email-based reset |
| Sessions | `@supabase/ssr` middleware, HTTP-only cookies | logout route invalidates (guard-pinned) |
| Role/workspace switching | header `RoleSwitcher`; `active_role` on profile; gates re-check per request | switching is a scope change, never a new login |

**MFA today: not offered.** No `auth.mfa.*` calls exist in the codebase.
Supabase supports TOTP MFA natively (enroll / challenge / verify + AAL
session levels), so the platform can offer it without new infrastructure.

## 2. The benefit-based MFA model (owner principle)

Security is presented as something the user GAINS, never something done to
them. Approved framing per surface:

| Surface | Say | Never say |
|---|---|---|
| Settings entry | "Papildoma paskyros apsauga" — protect your profile, work history, documents and messages with a second check only you can pass | "MFA is required" |
| Enrollment intro | "Your work journal is your CV evidence. A 30-second setup keeps it yours even if your password leaks." | "You must enable this to continue" |
| Post-enroll | "Your account now has two locks. You can turn this off any time in settings." | anything implying it cannot be undone |
| Company owner nudge | "Company actions (inviting workers, reviewing entries) affect other people — a second check protects them too." | "Blocked until you enable MFA" |
| Recovery context | "With a second factor, resetting a lost password is safer — an attacker with only your email can't take over." | punishment framing |

Vocabulary rules (guard-worthy once UI ships): benefit verbs (protect,
keep, recover, trust); no "required", "mandatory", "blocked", "you must",
no lock-out threats. Enrollment stays optional and reversible in v1;
any future role-based strengthening (e.g. for admins) is an owner
decision presented as protecting the people their actions affect.

## 3. Implementation PR sequence (proposal — no code in this PR)

1. **Account security page** (`/dashboard/account` section): shows sign-in
   method, last password change (if available), the MFA offer card with
   benefit copy (lt/en/ru), honest "coming later" for device list.
2. **MFA enrollment** — Supabase TOTP enroll + QR + verify; recovery-code
   download; unenroll path. Copy per §2.
3. **MFA challenge** — AAL2 step on sign-in for enrolled users only;
   graceful fallback copy ("use your saved recovery code").
4. **Session/device visibility** — list active sessions, "end this
   session" per row (benefit: "see where you're signed in").
5. **Security events** — password changed / MFA enrolled / new sign-in
   surface, once the notification spine exists (audit §17.4).

Each step is its own PR with guards (copy-vocabulary guard included) and
lt/en/ru parity. None of it starts before owner approves the copy model
in §2.

## 4. Honest limits

- MFA reduces account-takeover risk; it does not protect against a
  compromised device or a malicious insider, and copy must not claim so.
- Offering MFA does not shift the platform's own responsibilities (see
  `security-model-v1.md` §4) — this sentence is the anti-liability-theater
  rule and should survive into any marketing copy review.
