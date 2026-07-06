# LabourMarket.ai — MFA Enrollment Readiness Pack v1

> Draft for owner review — 2026-07-06. Source-grounded @ c04d349.
>
> **Status: MFA enrollment is NOT live and NOT claimed to be live.** This
> pack prepares everything the enrollment PR needs so that, once the owner
> flips the one Supabase dashboard toggle (§2), the implementation PR is a
> mechanical, low-risk slice. Nothing in this document enables anything.

This is step 2 of the sequence in `authentication-and-mfa-v1.md` §3
(step 1 — the Account "Security & access" section — shipped in PR #651:
`app/[locale]/dashboard/account/page.tsx` + the benefit-copy guard
`lib/guards/account-security-benefit.test.ts`).

---

## 1. Verified current state (what exists today)

| Piece | Where | Status |
|---|---|---|
| Security & access section | `apps/web/app/[locale]/dashboard/account/page.tsx` (`data-testid="account-security"`) | live |
| Live protection status | `supabase.auth.mfa.listFactors()` server-side; `null` on error → no claim rendered | live |
| Benefit copy (lt/en/ru) | `messages/{lt,en,ru}.json` → `auth.dashboard.account.security.mfa.*` | live |
| No-coercion guard | `lib/guards/account-security-benefit.test.ts` (coercive-vocabulary regexes per locale; asserts no enrollment button exists yet) | live |
| Enrollment flow | — | **does not exist; deliberately** |
| Supabase TOTP factor | Supabase dashboard | **not enabled — owner action, §2** |

SDK versions in the worktree: `@supabase/supabase-js` 2.106.0,
`@supabase/ssr` 0.10.3 — both fully support the `auth.mfa.*` API and
AAL levels; no dependency change is needed for the enrollment PR.

Client setup the enrollment PR will use:

- Browser client: `apps/web/lib/supabase/client.ts` (`createBrowserClient`,
  memoized). **All `mfa.enroll/challenge/verify/unenroll` calls happen here**
  — enrollment is inherently interactive (QR + user-typed code), so it lives
  in a client component, RLS-scoped by the user's session cookies.
- Server client: `apps/web/lib/supabase/server.ts` (per-request). Used only
  for `listFactors()` reads (already done) and, later, for
  `getAuthenticatorAssuranceLevel()` checks in the challenge PR (step 3 —
  **not** this pack, **not** the enrollment PR).

## 2. Owner action required (the one real blocker)

MFA enrollment cannot work — and must not be pretended to work — until the
owner enables the TOTP factor in the Supabase dashboard:

1. Supabase dashboard → project → **Authentication → Multi-Factor
   Authentication** (under Auth settings; in newer dashboards the section is
   "Multi-Factor Authentication" on the Auth → Providers/Settings page).
2. Enable **TOTP (App Authenticator)**. TOTP is available on the free plan;
   do NOT enable Phone/SMS MFA (paid, out of scope, and no phone-number
   collection exists in the product).
3. Leave "maximum enrolled factors" at the default (10) — the UI will only
   ever surface one TOTP factor per account in v1.
4. No API keys, no secrets, no env vars change. The toggle is the entire
   owner action.

If the project ever runs the local Supabase stack, the equivalent config is
`[auth.mfa.totp] enroll_enabled = true / verify_enabled = true` in
`supabase/config.toml` — currently not present in this repo and not needed
for the hosted project.

**Verification after the toggle** (owner or agent, read-only): call
`supabase.auth.mfa.enroll({ factorType: "totp" })` as a signed-in test user
— success (a factor id + QR payload) proves the toggle; an error of the
"MFA is not enabled" shape proves it is still off. Unenroll the test factor
immediately afterwards.

## 3. Expected SDK flow (what the enrollment PR will call)

All calls via the browser client from §1; supabase-js v2 API:

```ts
// 1. ENROLL — creates an UNVERIFIED factor and returns the QR payload.
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: "totp",
  friendlyName: "authenticator", // single stable name in v1
});
// data.id                → factorId (keep in component state only)
// data.totp.qr_code      → SVG data URI — render as <img src=…>
// data.totp.secret       → manual-entry secret (show behind a "can't scan?" toggle)
// data.totp.uri          → otpauth:// URI (do not log, do not persist)

// 2. CHALLENGE + 3. VERIFY — one call in v2 does both:
const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
  factorId,
  code, // 6-digit user input
});
// On success the factor flips to status "verified" and the session is
// upgraded to AAL2. On wrong code: show a retry message, keep the QR.

// UNENROLL (the "turn it off anytime" promise — must ship in the SAME PR):
const { error } = await supabase.auth.mfa.unenroll({ factorId });

// Cleanup rule: if the user abandons enrollment (navigates away / cancels)
// the PR SHOULD unenroll the unverified factor it created, and the
// "not enrolled" derivation MUST count only status === "verified" factors
// (the account page already does exactly this), so stray unverified
// factors can never show as protection.
```

The separate `mfa.challenge()` + `mfa.verify()` pair is only needed for the
sign-in AAL2 step (docs §3 step 3, its own future PR) — the enrollment PR
does not touch the login flow, `middleware.ts`, or
`getAuthenticatorAssuranceLevel()`.

## 4. Readiness gating — how the UI stays honest before the toggle

There is no client-side API that reports whether the dashboard TOTP toggle
is on. The honest pattern (mirroring the repo's owner-editable readiness
convention, `lib/billing/readiness.ts` → `PRICING_READINESS_STATE`):

```ts
// lib/auth/mfa-readiness.ts (enrollment PR)
export type MfaReadinessState =
  | "awaiting_supabase_config" // default TODAY — owner has not flipped §2
  | "owner_confirmed";         // owner flipped the toggle AND verified per §2

export const MFA_ENROLLMENT_READINESS: MfaReadinessState =
  "awaiting_supabase_config";
```

Rules:

- While `awaiting_supabase_config`, the account page keeps exactly today's
  copy (`mfa.setupComing`) — **no enroll button renders at all**. The
  enrollment component/route is unreachable, not merely disabled.
- The owner flips the constant to `"owner_confirmed"` in the same commit
  that follows their dashboard action — the git history then records who
  turned it on and when.
- Defense in depth: even at `owner_confirmed`, an `enroll()` error of the
  "not enabled" shape must degrade to the `setupComing` line (never a dead
  button, never a fake QR).

## 5. UI states (enrollment PR)

| State | Trigger | Surface |
|---|---|---|
| `disabled-by-config` | `MFA_ENROLLMENT_READINESS === "awaiting_supabase_config"` OR `enroll()` returns "not enabled" | Today's section unchanged: benefit line + `setupComing`. No button. |
| `not-enrolled` | readiness `owner_confirmed` AND `listFactors()` has 0 verified TOTP factors | Benefit line + "Įjungti apsaugą / Turn on protection / Включить защиту" button (opens enrollment, does not navigate away from account) |
| `enrolling` | `enroll()` succeeded | QR code + manual secret fallback + code input + cancel (cancel unenrolls the unverified factor) |
| `verify` | user typed a code, `challengeAndVerify` in flight | disabled input + progress; wrong code → inline retry copy, QR stays |
| `enrolled` | ≥1 verified TOTP factor (live `listFactors()` read — already how the status chip works) | "Aktyvuota" chip (exists) + "Išjungti / Turn off / Отключить" control with a plain confirm step (`unenroll`) |

Errors in any state degrade to a short honest line ("nepavyko — bandyk dar
kartą" family) — no invented status, matching the page's existing
"honest degradation" comment (null status → no claim).

## 6. LT / EN / RU copy drafts (benefit-based, non-coercive)

Proposed keys under `auth.dashboard.account.security.mfa.enroll.*` — all
three catalogs land in the enrollment PR together (repo i18n-parity rule;
no hardcoded strings in components):

| Key | LT | EN | RU |
|---|---|---|---|
| `start` | Įjungti papildomą apsaugą | Turn on extra protection | Включить дополнительную защиту |
| `startHint` | Užtruks apie 30 sekundžių. Reikės autentifikavimo programėlės telefone (pvz., Google Authenticator). | Takes about 30 seconds. You'll need an authenticator app on your phone (e.g. Google Authenticator). | Займёт около 30 секунд. Понадобится приложение-аутентификатор на телефоне (например, Google Authenticator). |
| `scanTitle` | Nuskenuok šį kodą | Scan this code | Отсканируйте этот код |
| `scanHint` | Atidaryk autentifikavimo programėlę ir nuskenuok QR kodą. | Open your authenticator app and scan the QR code. | Откройте приложение-аутентификатор и отсканируйте QR-код. |
| `manualToggle` | Negali nuskenuoti? Įvesk kodą ranka | Can't scan? Enter the code manually | Не получается отсканировать? Введите код вручную |
| `codeLabel` | 6 skaitmenų kodas iš programėlės | 6-digit code from the app | 6-значный код из приложения |
| `confirm` | Patvirtinti | Confirm | Подтвердить |
| `cancel` | Atšaukti | Cancel | Отменить |
| `wrongCode` | Kodas netiko — pažiūrėk naujausią kodą programėlėje ir bandyk dar kartą. | That code didn't match — check the newest code in your app and try again. | Код не подошёл — посмотрите новый код в приложении и попробуйте ещё раз. |
| `success` | Paskyra dabar turi du užraktus. Šią apsaugą bet kada gali išjungti čia. | Your account now has two locks. You can turn this off here anytime. | Теперь у вашего аккаунта два замка. Вы можете отключить эту защиту здесь в любой момент. |
| `turnOff` | Išjungti papildomą apsaugą | Turn off extra protection | Отключить дополнительную защиту |
| `turnOffConfirm` | Paskyra liks apsaugota slaptažodžiu. Apsaugą galėsi vėl įjungti bet kada. | Your account stays protected by your password. You can turn this back on anytime. | Аккаунт останется защищён паролем. Вы сможете снова включить защиту в любой момент. |
| `genericError` | Nepavyko — bandyk dar kartą po akimirkos. | That didn't work — try again in a moment. | Не получилось — попробуйте ещё раз через минуту. |

Framing rules honoured (docs §2): protection is offered and reversible;
benefit verbs only; the off-switch is presented as calmly as the on-switch;
no fear copy, no countdowns, no "your account is at risk" pressure.

## 7. No-coercion wording guard list

These phrases must NOT appear anywhere under
`auth.dashboard.account.security.**` (including the new `mfa.enroll.*`
namespace). The existing guard `lib/guards/account-security-benefit.test.ts`
already enforces the first block per locale; the enrollment PR extends the
same regexes with the second block:

Already guarded (keep):

- LT: `privalai`, `privaloma`, `privalote`, `užblokuot…`, `būtina įjungti`
- EN: `required`, `mandatory`, `blocked`, `you must`, `forced`
- RU: `обязательн…`, `заблокирован…`, `вы должны`

Add in the enrollment PR (fear/pressure/irreversibility family):

- LT: `paskyra pavojuje`, `prarasi prieigą`, `negalėsi prisijungti`,
  `paskutinis įspėjimas`, `nedelsiant`
- EN: `at risk`, `you will lose access`, `last warning`, `act now`,
  `immediately or`, `cannot be undone`, `don't lose`
- RU: `под угрозой`, `потеряете доступ`, `последнее предупреждение`,
  `немедленно`, `нельзя отменить`

Also guarded structurally (not vocabulary): no enroll control may render
while readiness is `awaiting_supabase_config` (§4), and "active" status may
only derive from `status === "verified"` factors (already asserted).

## 8. Tests needed (enrollment PR checklist)

Extend `lib/guards/account-security-benefit.test.ts` (or a sibling
`mfa-enrollment-honesty.test.ts`):

1. **Readiness gate**: the enrollment component/button renders only behind
   `MFA_ENROLLMENT_READINESS === "owner_confirmed"`; source-level assert
   that the gate constant is imported and checked before any
   `mfa.enroll(` call site.
2. **No-coercion vocabulary** for the new `mfa.enroll.*` keys in lt/en/ru,
   with the §7 extended regexes.
3. **i18n parity**: every `mfa.enroll.*` key exists in all three catalogs
   (structure-parity loop like the existing guard's key loop).
4. **Verified-only truth**: "enrolled" state derives from
   `status === "verified"` (keep the existing assertion; extend to the new
   component).
5. **Reversibility shipped together**: `unenroll(` call site exists in the
   same component that enrolls (the "turn it off anytime" copy must be
   true on day one).
6. **Secret hygiene**: no `console.log` of `totp.secret`, `totp.uri`,
   `qr_code`, or the typed code anywhere in the component (regex guard).
7. **Component test** (vitest): wrong-code path shows `wrongCode` copy and
   keeps the QR; cancel path calls `unenroll` with the created factorId
   (supabase client mocked — no live project in CI).
8. Existing suites stay green: `pnpm typecheck`, `pnpm lint`,
   `pnpm check:primary-route-smoke`, `pnpm check:i18n-debt`,
   `pnpm -C apps/web test`.

## 9. Rollback / disable plan

Three independent layers, any one of which is sufficient:

1. **Product level (instant, no deploy)**: owner turns the TOTP factor OFF
   in the Supabase dashboard. New enrollments fail → the UI's
   defense-in-depth path (§4) degrades to the honest `setupComing` line.
   Already-enrolled users: Supabase stops issuing AAL2 challenges for
   disabled factor types; since v1 never gates anything on AAL2 (the
   challenge step is a separate future PR), **no user can be locked out by
   this rollback**.
2. **Code level (one-line revert)**: flip
   `MFA_ENROLLMENT_READINESS` back to `"awaiting_supabase_config"` — the
   enroll surface disappears entirely; the status chip (live
   `listFactors()` read) keeps telling the truth for anyone already
   enrolled.
3. **Full revert**: the enrollment PR is a single squash commit touching
   only the account-security component(s), `lib/auth/mfa-readiness.ts`,
   three message catalogs and guards — `git revert <sha>` is clean. No
   DB migrations, no schema, no RLS changes are part of enrollment
   (factors live in Supabase's managed `auth.mfa_factors`), so there is
   nothing to roll back in the database.

Per-user rollback is the product feature itself: `unenroll` in the UI
(§5 `enrolled` state). Support-side removal for a locked-out user (lost
phone, no recovery code) is a Supabase dashboard/admin operation —
owner-only, documented here so it is never improvised: Authentication →
Users → user → remove MFA factor.

## 10. Honest limits (carried over, still binding)

- Nothing in this pack, and nothing in the enrollment PR, may say MFA "is
  live", "is enabled", or "protects your account today" until §2 is done
  AND a real enrollment has been verified end-to-end.
- MFA reduces account-takeover risk; it does not protect a compromised
  device and copy must not claim so (`authentication-and-mfa-v1.md` §4).
- Recovery codes are NOT part of the v1 enrollment slice (Supabase TOTP
  does not auto-issue them; a recovery story = its own reviewed design).
  Until then the honest mitigation is: password reset flow remains
  available (AAL2 is not enforced at sign-in in v1), so a lost
  authenticator does not lock anyone out. The sign-in challenge PR
  (step 3) MUST NOT ship before a recovery path exists.
