# Auth Setup (Slice 6)

Manual founder steps to bring the magic-link auth flow online in
Supabase Cloud. Run these in order after slice 6 lands.

## 1. Apply migration `0003_multi_role.sql`

In the Supabase Dashboard → SQL Editor, paste the contents of
`supabase/migrations/0003_multi_role.sql` and run. It is idempotent —
safe to re-apply. After it succeeds:

- `profiles.role` is gone, replaced by `profiles.active_role`.
- `profile_roles` table exists with RLS enabled.
- `profile_role()`, `is_admin()`, `is_employer()` helpers now read
  `profiles.active_role` (existing RLS policies on workers/companies/
  etc. keep working unchanged).
- `handle_new_user()` trigger creates both `profiles` and the matching
  `profile_roles` row when a new auth user signs up.

Regenerate types:

```bash
pnpm db:types
```

## 2. Configure Site URL and Redirect URLs

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `https://labourmarketai.vercel.app`
  (eventually `https://labourmarket.ai`)
- **Additional Redirect URLs:** add each line
  - `https://labourmarketai.vercel.app/lt/auth/callback`
  - `https://labourmarketai.vercel.app/en/auth/callback`
  - `http://localhost:3000/lt/auth/callback` (for dev)
  - `http://localhost:3000/en/auth/callback`

Without these, Supabase will reject the magic link's `redirectTo`.

## 3. Configure the Magic-Link email template

Supabase Dashboard → Authentication → Email Templates → **Magic Link**.

The platform sends visitors a single sign-in link; the templates below
match the LT/EN strings the app uses. Pick the language you'll use as
the default; Supabase only supports one template per project. For now
default to **LT** (with EN copy in parentheses) — switch when you have
real users requesting EN.

### Subject (LT)

```
Jūsų prisijungimo nuoroda — LabourMarket.ai
```

### Subject (EN)

```
Your login link — LabourMarket.ai
```

### Body (HTML)

```html
<h2>Sveiki,</h2>
<p>Paspauskite mygtuką žemiau, kad prisijungtumėte prie LabourMarket.ai.</p>
<p>
  <a
    href="{{ .ConfirmationURL }}"
    style="display:inline-block;padding:12px 24px;background:#3E8BFF;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600;"
    >Prisijungti / Sign in</a
  >
</p>
<p style="color:#5C6480;font-size:12px;">
  Jeigu nuoroda neveikia, nukopijuokite ir įklijuokite naršyklėje:<br />
  {{ .ConfirmationURL }}
</p>
<hr style="border:none;border-top:1px solid #252A3D;margin:24px 0;" />
<p style="color:#5C6480;font-size:12px;">
  Šis laiškas siųstas iš LabourMarket.ai. Jei jo neprašėte — galite jį
  saugiai ignoruoti.
</p>
```

## 4. First admin user

After your own signup completes, promote yourself:

```bash
pnpm admin:promote your.email@example.com
```

This flips `profiles.active_role` to `admin`. (You can also add the
`admin` row to `profile_roles` manually via SQL Editor if you want it
catalogued — M4 will do this through the UI.)

## 5. Smoke test

1. `/lt/auth/signup` → pick **Worker** → enter email → submit.
2. Open your inbox, click the magic link.
3. You should land on `/lt/auth/callback` → `/lt/onboarding`.
4. Fill the onboarding form → continue.
5. Dashboard should render with **Worker** active.
6. Open the **Role** dropdown top-right → add **Customer** → dashboard
   re-renders with a Customer Overview.
7. Sign out from the **My account** tab → return to `/lt`.
