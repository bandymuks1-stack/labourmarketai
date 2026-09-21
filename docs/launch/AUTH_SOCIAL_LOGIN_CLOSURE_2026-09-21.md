# Auth / social login closure — owner-away execution receipt (2026-09-21)

Continues `LAUNCH_COMPLETION_2026-09-20_CHECKPOINT.md` (nothing there is superseded).
Owner-confirmed state at the start of this window: new Meta app "LabourMarket.ai"
(App ID 1088055617411429), Business Verification VERIFIED for UAB NONSTOP GROUP,
`email` + `public_profile` submitted, App Review IN PROGRESS, app UNPUBLISHED until
approval; Facebook production OAuth PASS for an app-role account; LinkedIn OIDC
production PASS. No Meta / Supabase provider configuration was touched in this window.

## DONE

| # | item | evidence |
|---|---|---|
| 1 | Provider discovery is fail-closed and the UI renders only what GoTrue reports | `lib/auth/enabled-providers-core.ts` (FAIL_CLOSED = Google only; a flag counts only on literal `true`); production login/signup render Google + LinkedIn + Facebook → the auth server reports all three enabled |
| 2 | Callback error / cancel / recovery paths on production (`206de469`, re-checked on `f90f31cc`) | `error=access_denied` → `/lt/auth/login?error=cancelled` (+ `next` kept); `access_denied`+`otp_expired` → `error=link_expired`; no code → `error=missing_code` (locale `ru` kept); bogus code → `error=exchange_failed`; foreign `next` (`https://evil.example/x`) is carried only as a login-page param and never followed (`getSafeReturnPath`) |
| 3 | PR #1820 OAuth display-name repair — CI failure diagnosed and fixed | root cause: `user.user_metadata` dereferenced without `?? {}` → every success path threw → `error=callback` (9 tests) + the `locale-preference` source pin on the exact `select("onboarded_at, locale")`. Decision extracted to `lib/auth/oauth-display-name.ts` (pure; 11 tests); route tests exercise repair / human-name no-op / no-metadata no-op / write-failure-proceeds |
| 4 | Repair contract confirmed | repair ONLY when `profiles.full_name` equals the e-mail local part (the onboarding `emailLocal` default a person accepted); never a human-entered name; never an empty one; compare-and-set on the exact stored value; `workers.display_name` aligned under the same guard; own-row RLS, no migration |
| 5 | Provider-neutral auth copy | `auth.login.errors.missing_code`, `auth.login.subcopy`, `auth.signup.subcopy`, `auth.login.google_hint` no longer name Google alone (6 translated catalogs + 5 `[EN]` fallbacks) |
| 6 | Legal pages | `/en/legal/privacy`, `/en/legal/terms`, `/en/legal/data-deletion` (+ `/lt`, `/ru`) are 200 without a session; controller/operator = UAB "Nonstop Group", code 302676973, Mūšos g. 2C, Pasvalio r.; IP licensor Labour Market AI Sp. z o.o. named consistently on all three; data-deletion = person-reviewed e-mail request, explicitly "no instant deletion button", retention exceptions stated — matches the real process |
| 7 | Public-surface sweep on production | `/lt` `/en` `/ru` `/pl`, login/signup/forgot-password, `/lt/jobs`, `/lt/questions`, `/lt/about`, `/en/vision`, legal ×3, `manifest.webmanifest`, `robots.txt`, `sitemap.xml`, `llms.txt`, `/api/health` all 200; unknown route → localized 404 with a home link; `/lt/dashboard` unauthenticated → login with `next` |
| 8 | Mobile 375 px login | no horizontal scroll; all buttons/inputs ≥ 44 px (only inline text links are smaller) |

## DEPLOYED

- PR [#1820](https://github.com/bandymuks1-stack/labourmarketai/pull/1820) — squash `f90f31cc02e27a8be3670befd5e5a21d6b7406b9`, merged 2026-09-21 14:18 UTC (auto-merge after `quality`, `migration-safety`, `e2e-smoke`, `mobile`, CodeQL all green).
- Vercel production deployment `labourmarketai-tw6ekpvm2` — Ready; `/api/health` → `build: f90f31cc`, region dub1, auth + db ok.

## PRODUCTION VERIFIED (on `f90f31cc`)

- Real pass through the deployed callback route: QA identity `qa.worker+goal3@labourmarket.ai`,
  single-use magic link (`token_hash` + `type=magiclink`) → `verifyOtp` → profile read → display-name
  decision (no provider metadata → no repair) → `/lt/dashboard`, locale kept, `h1` = the stored
  human name. Read-back: `profiles.updated_at` / `workers.updated_at` unchanged (2026-08-09), only
  `auth.users.last_sign_in_at` = 14:25:39 UTC. Runtime log: one `info` line, 307, no error/warn.
- Logout (`/lt/auth/logout`, `scope: local`, 303) → `/lt/auth/login`; session cookie gone;
  `/lt/dashboard` bounces to login with `next`.
- Deployed copy: LT subtitle "Prisijunk su socialine paskyra arba el. paštu ir slaptažodžiu."
- Blast radius of the repair (read-only count): 59 profiles, 18 carry the local-part name, **3** have
  a social identity with a provider name → those 3 are repaired on their next social sign-in;
  nothing was written ahead of time.

## FAILED

- None in scope. Local full `vitest run` showed 4 timeouts under load (`lib/cv/extract` DOCX etc.)
  that pass in isolation — the known local flake class; CI green.

## EXTERNAL BLOCKERS

- **Facebook for public (non-role) users — EXTERNAL_BLOCKED_BY_META_REVIEW.** Status recorded as
  `TECHNICALLY_PROVEN / PUBLIC_EXTERNAL_GATE_PENDING`. Until Meta approves and the owner publishes
  the app, a non-role person pressing "Continue with Facebook" reaches Meta's "app not available"
  page and is not bounced back to `/auth/login` (Meta never redirects). Not a product-code defect.
- Unchanged from the 2026-09-20 checkpoint §5: `INVITE_EMAIL_*` (e-mail channel), Apple / Google
  Play / EAS accounts, store listings, social profile URLs, a real ka/uk participant, PL consent text.

## OWNER ACTIONS REQUIRED

1. Meta: when App Review approves, switch the app to Live (no repo change).
2. Decide for the review window only: leave the Facebook button visible (dead end for non-role
   users, reviewers can test) **or** toggle Facebook OFF in the Supabase dashboard until approval
   (reversible; the button disappears within the 300 s settings cache; no deploy). Not done by the
   agent — the instruction was not to change provider configuration.
3. The RED packet of the 2026-09-20 checkpoint §4 (W-1, R-B #1813, ARCH-4 v2 #1815, COMM-1 #1816,
   CAL-7) — one sentence each; nothing applied.
4. The 12-step human acceptance walk (2026-09-20 checkpoint §6) with real accounts.

## REMAINING LAUNCH BLOCKERS (exact)

- None that code can close without an owner decision. Everything above is either LIVE + verified,
  an external gate (Meta review, e-mail provider, store accounts), or a RED owner-sentence item.
