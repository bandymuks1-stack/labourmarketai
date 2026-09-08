# Auth owner-access bootstrap — P0 audit

Date: 2026-06-19 · Branch: `fix/auth-owner-access-bootstrap-p0`.

## 1. Exact login route map
- App host: `https://app.labourmarket.ai` (apex `labourmarket.ai` = public marketing; `app.` = the app — middleware `MARKETING_ORIGIN`/canonical).
- Login page: `app/[locale]/auth/login/page.tsx` → Google OAuth via the shared GoogleButton (PKCE, `redirectTo = /[locale]/auth/callback`).
- Callback: `app/[locale]/auth/callback/route.ts`.
- Logout: `app/[locale]/auth/logout/route.ts`.

## 2. Callback / redirect map
1. Google → `/[locale]/auth/callback?code=…`.
2. `exchangeCodeForSession(code)` (PKCE; has a getSession fallback for the cookie race).
3. `getUser()` → read `profiles.onboarded_at`.
4. If not onboarded → `/[locale]/onboarding` (carrying `next`); else → safe `next` or `/[locale]/dashboard`.
5. Middleware gates `/dashboard` + `/onboarding`: no user → `/auth/login?next=…`; onboarding incomplete → `/onboarding` (loop point).

## 3. Where access currently fails
OAuth + callback work (owner reached `/lt/onboarding`). The failure is at **bootstrap completion**: `complete_onboarding` RPC (migration 0006) does `UPDATE public.profiles SET onboarded_at = …`. It relies on the `handle_new_user` trigger (0001) having created the `profiles` row on signup. If that row is missing (trigger not firing for a Google OAuth user in prod), the UPDATE affects **zero rows**, `onboarded_at` stays null, and middleware loops the user back to `/onboarding` — i.e. they can't enter the app.

## 4. Is the user row / profile / workspace created?
- `auth.users` — created by Supabase on OAuth (automatic).
- `profiles` — SHOULD be created by `handle_new_user` (0001) `on_auth_user_created`. The RPC only UPDATEs it; it never inserts it. This is the gap when the trigger doesn't run.
- `profile_roles` + entity row (`workers`/`companies`/`agencies`) — created idempotently by the RPC. `customer` has no entity row in M1 (by design).

## 5. Does an allowlist exist?
**No.** Middleware, callback and login carry no email allowlist, domain restriction, or team-membership gate. Any successful Google OAuth user is admitted. So `labourmarket.ai@gmail.com` (and any owner/test email) needs no manual allowlisting — nothing to add.

## 6. App domain / callback config
Code-side is correct: app on `app.labourmarket.ai`, callback at `/[locale]/auth/callback`. The Supabase Google provider's authorized redirect URL + Site URL are external config (not in the repo) — NOT changed here. The owner reaching onboarding indicates the callback domain config is functioning.

## 7. Fix implemented (code-only, no DB/RLS/env change)
`completeOnboarding` (`lib/auth/actions.ts`) now ensures the caller's OWN profile shell exists BEFORE the RPC:
`supabase.from("profiles").upsert({ id: user.id, email, locale }, { onConflict: "id", ignoreDuplicates: true })`.
- RLS-valid: `profiles_insert` allows `id = auth.uid()`.
- Idempotent: ON CONFLICT DO NOTHING — never overwrites an existing row.
- No fake data: only the user's own shell, exactly what `handle_new_user` provides.
So onboarding completes (the RPC UPDATE now finds the row → sets `onboarded_at`) whether or not the trigger fired → the user reaches `/dashboard`. Guard: `lib/guards/auth-owner-access-bootstrap.test.ts` (5).

## 8. What still needs owner / Supabase action
- NONE required for this code fix. Optional/recommended (owner/Supabase side, NOT done here):
  - Confirm/repair the `on_auth_user_created` → `handle_new_user` trigger in production (so the profile row is created at signup, not only at onboarding completion). This is a DB/trigger action — a hard-stop class; flagged, not performed.
    - **Verification note (2026-08-31):** CONFIRMED on production via a read-only `pg_trigger` query — the trigger is present and enabled (`tgenabled = 'O'`): `tgname = on_auth_user_created`, firing `handle_new_user`, whose `ON CONFLICT (id) DO NOTHING` guard is present. No repair needed; the §7 code-side shell upsert stays as defense-in-depth. This item is now closed.
  - Confirm the Supabase Google provider's Site URL + redirect URLs include `https://app.labourmarket.ai/<locale>/auth/callback` (external config — not changed here).
- No env/secrets, no Supabase data writes, no migration, no RLS change performed.